# Plan: Seasons + Player Profiles

Status: **proposed** · Last updated: 2026-06-25

## 1. Goal

Turn the single all-time leaderboard into **time-boxed seasons**:

1. The board is always tied to the **active season** (currently "Season 1").
2. An admin can **close** a season; doing so opens the next one and **wipes
   everyone back to a fresh start** (server-wide rebirth) — a real fresh race.
3. Closing grants each competitor a **permanent reward** scaled by their final
   placement, so the reset is a prize, not a loss.
4. Past seasons are archived and shown in a **season showcase** (podiums,
   champions, history).
5. Clicking a player in the leaderboard opens a **profile** with their stats,
   achievements, and season trophies.

…without breaking the local-first contract. The local `localStorage` save stays
authoritative for gameplay; the server stays a thin *sync + identity* layer. The
season reset is **cooperative** — the server signals "a new season started", the
client runs the reset and claims the reward. See `leaderboards.md` for the base
architecture this builds on.

## 2. Decisions (DECIDED ✅)

| Question | Decision |
|---|---|
| What resets on a new season? | **Full fresh-race (Option B).** Everyone restarts from scratch; gameplay wipes via `engine.hardReset()`. |
| Loss vs reward | A **permanent forgiveness (🕊) reward + a season trophy badge**, scaled by final rank. The fresh run starts with that forgiveness banked. |
| How is the reset enforced? | **Cooperatively + server-gated.** The server won't rank a player into the new season until they've "entered" it (which forces the client reset). A stale client that keeps submitting big numbers cannot pollute the fresh board. |
| Lifetime stats | Kept on `players` (monotonic, for recovery + all-time records + anti-cheat). The **competitive standing moves to a per-season table** that resets each season. |
| History | Closed-season standings are retained forever (queryable by season). Champions/podiums shown in a showcase. |
| Profiles | Public, read-only. Derived from `season_scores` + `players` + achievement ids in `save_blob`. **Never** exposes the token or the raw save. |
| Who closes a season? | Manual **admin endpoint** guarded by `ADMIN_TOKEN`. Optional auto-close when `ends_at` passes (phase 2). |

## 3. Data model

New migration `apps/server/migrations/002_seasons.sql`.

```sql
-- one row per season; exactly one active at a time
create table seasons (
  id          uuid primary key default gen_random_uuid(),
  number      int  not null unique,                 -- 1, 2, 3 …
  name        text,                                 -- optional label ("Léto 2026")
  status      text not null default 'active',       -- 'active' | 'closed'
  started_at  timestamptz not null default now(),
  ends_at     timestamptz,                          -- optional scheduled end
  closed_at   timestamptz
);
create unique index seasons_one_active on seasons (status) where status = 'active';

-- per-(season,player) competitive standing — THE leaderboard source.
-- Monotonic WITHIN a season; a fresh season = fresh rows.
create table season_scores (
  season_id     uuid not null references seasons(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  highest_level int     not null default 1,
  total_gold    numeric not null default 0,
  kills         bigint  not null default 0,
  boss_kills    bigint  not null default 0,
  rebirths      int     not null default 0,
  max_combo     int     not null default 0,
  play_time_ms  bigint  not null default 0,
  achievements  int     not null default 0,
  peak_dps      numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_submit_at timestamptz,                        -- season-local anti-cheat anchor
  primary key (season_id, player_id)
);
create index season_scores_board_idx on season_scores (season_id, highest_level desc);

-- placement reward earned when a season closed; claimed by the client on reset.
create table season_rewards (
  season_id   uuid not null references seasons(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  rank        int  not null,
  forgiveness int  not null,
  claimed_at  timestamptz,
  primary key (season_id, player_id)
);

-- which season each player is actively competing in (the "entered" gate)
alter table players add column current_season_id uuid references seasons(id);

-- seed Season 1 and enroll every existing player into it
insert into seasons (number, status) values (1, 'active');
update players set current_season_id = (select id from seasons where number = 1);
-- backfill: existing players' current stats become their Season 1 standing
insert into season_scores (season_id, player_id, highest_level, total_gold, kills,
       boss_kills, rebirths, max_combo, play_time_ms, achievements, peak_dps, last_submit_at)
select (select id from seasons where number = 1), id, highest_level, total_gold, kills,
       boss_kills, rebirths, max_combo, play_time_ms, achievements, peak_dps, last_submit_at
from players;
```

**Why a separate `season_scores` table** instead of reusing the `players`
columns: the standing must *drop to zero* each season, but `players` stays
monotonic for recovery + anti-cheat. Mixing the two on one row is impossible
(can't be both monotonic forever and reset). lib/players.js gets a parallel set
of helpers for `season_scores`.

## 4. Season lifecycle & the transition protocol

This is the load-bearing part — it keeps the fresh board honest and keeps
anti-cheat working after a reset.

### Submit path (rewrite of `POST /api/scores`)

1. `sanitizeScore` (unchanged).
2. Throttle via `players.last_submit_at` (unchanged).
3. Resolve the **active** season.
4. **Gate:** if `player.current_season_id !== active.id`, the player hasn't
   entered the new season yet. → Update **lifetime** `players` columns (GREATEST,
   never blocks) + `save_blob`, but **do not** touch `season_scores`. Respond
   `{ ok: true, seasonChanged: true }` so the client kicks off the reset flow.
5. Otherwise (entered the active season): run `checkPlausibility` against the
   player's **`season_scores` row** (its `last_submit_at` is the time anchor),
   not the lifetime row. A fresh season row → "first submit" branch → small
   values pass cleanly. Then upsert `season_scores` (GREATEST per column) **and**
   update lifetime `players` (GREATEST) + `save_blob`.
6. Return rank within the active season.

> **Anti-cheat fix:** monotonic "nothing decreases" now means *within the
> season*. Today it compares to lifetime columns — after a reset the client
> legitimately sends smaller numbers, which the current code would reject as
> `decrease:*`. Moving the check to the season row fixes this; lifetime stays
> GREATEST and simply never blocks.

### Closing a season (`POST /api/admin/seasons/close`, admin-guarded)

In one transaction:

1. Compute final ranks from `season_scores` for the active season.
2. Insert `season_rewards(season_id, player_id, rank, forgiveness)` for every
   competitor (forgiveness from `seasonReward(rank)` — see §7).
3. `update seasons set status='closed', closed_at=now() where id = active`.
4. `insert into seasons (number, status) values (active.number + 1, 'active')`.

Players are **not** force-mutated. Their `current_season_id` still points at the
now-closed season → the gate in the submit path trips on their next sync.

### Client transition flow (Option B reset)

`GET /api/me` returns `season: { active, mine, pendingReward? }` where
`pendingReward` is the unclaimed `season_rewards` row for the season the player
last competed in. On the client:

1. If `active.number > mine.number` (a season ended while away/playing):
   - Show an **end-of-season modal**: "Season {mine} skončila — umístil ses
     #{rank}! Začíná Season {active}. Tvůj postup se resetuje, dostáváš
     {forgiveness} 🕊 a trofej." (reuse `Modal`, styled like `RebirthModal`).
   - `engine.hardReset()`, then bank the reward into the fresh state
     (`state.prestige.forgiveness += reward.forgiveness`) and `save()`.
   - `POST /api/me/enter-season` → server sets `current_season_id = active.id`,
     marks the reward `claimed_at`, creates the fresh `season_scores` row.
   - Persist `active.number` to `localStorage.ekiSeenSeason`.
2. Subsequent 20s syncs submit the (now tiny) fresh stats normally.

New players who register mid-Season-2 start with `current_season_id = active`
and `ekiSeenSeason = active.number` → no transition modal, no spurious reset.

## 5. API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/leaderboard?board=&limit=&season=` | optional | Standings for a season (default = active). `season` = number; closed seasons queryable for the showcase. |
| `GET /api/seasons` | none | List seasons: `{ number, name, status, startedAt, closedAt, endsAt, champion? }` for the showcase. |
| `GET /api/seasons/:number` | optional | One season's meta + podium (top 3). |
| `GET /api/players/:id` | optional | **Public profile** (see §6). |
| `GET /api/me` | required | Adds `season: { active, mine, pendingReward? }` to the existing payload. |
| `POST /api/me/enter-season` | required | Acknowledge reset → set `current_season_id`, claim reward, create fresh season row. Returns the claimed reward. |
| `POST /api/admin/seasons/close` | `ADMIN_TOKEN` | Close active, open next, compute rewards. |
| `POST /api/scores` | required | Reworked per §4. |

`net/api.js` gains: `seasons()`, `season(n)`, `player(id)`, `enterSeason()`, and
`leaderboard(board, limit, season)`.

## 6. Player profile

`GET /api/players/:id` → public, read-only:

```jsonc
{
  "id": "…", "nickname": "…", "createdAt": "…",
  "rebirths": 12,
  "season": { "number": 2, "rank": 4, "score": { …SCORE_FIELDS… } },
  "lifetime": { "score": { …SCORE_FIELDS… } },          // all-time bests
  "achievements": ["level_3", "kills_2", "titan_slayer"], // ids from save_blob
  "trophies": [ { "season": 1, "rank": 1 } ]              // from season_rewards
}
```

- Achievement **ids** come from `Object.keys(save_blob.achievements)`; the client
  maps them to name/emoji/desc via the existing `ACHIEVEMENTS` data
  (`apps/web/src/game/data/achievements.js`) — no need to duplicate defs
  server-side. We expose only the id list, never the raw `save_blob`.
- **Client:** clicking a leaderboard row (or a showcase podium entry) opens a
  `PlayerProfile` modal: header (nickname + champion crown if any trophy rank 1),
  season vs lifetime stat blocks (reuse `fmt`/`fmtDuration`), an achievements
  grid (earned highlighted, locked dimmed — reuse `Achievements.jsx` rendering),
  and a trophy shelf. Leaderboard rows become buttons carrying `row.id`.

## 7. Shared contract (`packages/shared`)

- `SEASON_REWARD` tiers + `seasonReward(rank)`:
  `1 → 100🕊`, `2–3 → 60`, `4–10 → 35`, `11–50 → 20`, else `10` (participation).
  Tunable; lives here so client preview and server award agree.
- `ACTIVE_SEASON` is **not** hardcoded — always read from the server. The "Season
  1" label is purely server data.
- Keep `SCORE_FIELDS` as the single source for both lifetime and season columns.

## 8. Frontend — season showcase

A new **Seasons** view (tab alongside the leaderboard, or a header above it):

- **Current season banner:** "Season N", optional countdown to `ends_at`, and a
  **podium** (🥇🥈🥉 top 3 with nicknames + headline stat). Clicking a name → profile.
- **Past seasons list:** each closed season as a card showing its champion (crown
  + nickname) and dates; expanding/clicking loads that season's full board via
  `?season=N` (the existing `Leaderboard` table, parameterized by season).
- Champion crown (👑) shown next to rank-1 holders in leaderboard rows too.

Files: `components/leaderboard/Seasons.jsx` (showcase), `SeasonBanner.jsx`,
`components/modals/PlayerProfile.jsx`, `components/modals/SeasonEndModal.jsx`;
`Leaderboard.jsx` gets a `season` prop + clickable rows; `AccountContext.jsx`
grows the transition flow + `enterSeason`.

## 9. Closing mechanism

- **Phase 1 (manual):** `POST /api/admin/seasons/close` with `x-admin-token`.
  Document a one-liner `curl` in the README. `ADMIN_TOKEN` added to `.env.example`.
- **Phase 2 (optional auto-close):** on boot and on a light interval, if
  `active.ends_at < now()` → run the same close transaction. Single-instance
  only (matches the existing migrate-on-boot assumption in `leaderboard-architecture`).

## 10. Anti-cheat / integrity notes

- Monotonic check moves to the **season row** (per §4) — the only correctness-
  critical change. Lifetime columns stay GREATEST and never reject.
- The **entered-season gate** is what keeps a fresh board fresh: stale big
  submits update only lifetime, never the new season standing.
- `season_rewards.claimed_at` makes reward claiming idempotent (no double-grant
  on a reload mid-transition).
- Plausibility constants (`PLAUSIBILITY`) unchanged; they now bound *intra-season*
  growth, which is stricter and more correct than bounding lifetime growth.

## 11. Phased roadmap

1. **Schema + backfill** (`002_seasons.sql`) — Season 1 seeded, existing players enrolled.
2. **Server core** — season helpers in lib/players.js, reworked `/api/scores`,
   `/api/leaderboard?season`, `/api/me` season block, `enter-season`.
3. **Admin close** — `/api/admin/seasons/close` + `ADMIN_TOKEN`.
4. **Client transition** — `SeasonEndModal`, reset+claim flow in `AccountContext`.
5. **Profiles** — `/api/players/:id` + `PlayerProfile` modal + clickable rows.
6. **Showcase** — `/api/seasons`, `Seasons.jsx` banner/podium/history.
7. **(Optional)** auto-close on `ends_at`.

Each phase is shippable: after (1)–(2) the game behaves exactly as today (one
active season); seasons only become visible once (3)+ land.

## 12. Risks / open questions

- **Reward balance:** 100🕊 for a champion is a guess — tune `seasonReward` once
  we see real forgiveness economy numbers.
- **Mid-session close:** a player actively online when the season closes sees the
  end modal on their next `/api/me` poll (≤20s) or next reload, not instantly.
  Acceptable; could push via the score-submit `seasonChanged` flag too.
- **Profile privacy:** confirm we're comfortable exposing per-player stat +
  achievement lists publicly (they're already implicitly on the board).
- **Open:** should `ends_at` be set at season creation (fixed-length seasons) or
  left null until an admin schedules an end? Default: null (admin closes manually).
- **Open:** do we want a cosmetic name per season ("Léto 2026") or just numbers?
```