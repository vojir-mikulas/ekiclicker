# Plan: Guilds (Cechy)

Status: **proposed** · Last updated: 2026-06-26

The social layer that ties the existing competitive systems together. Sibling of
this plan: [`hellevator.md`](hellevator.md) — Guilds is the *container*, Hellevator
is the first **guild activity** (a guild floor-ladder). Builds directly on the
patterns in [`seasons.md`](seasons.md) (season-scoped standings + `enter-season`
gate), [`leaderboards.md`](leaderboards.md) (token identity, sync layer), and the
server-authoritative shared-activity model already shipped for the **world boss**
and **raids** (`lib/worldboss.js`, `lib/raids.js`).

## 1. Goal

Let players form **guilds** ("cechy") — a persistent social group with a name, a
short `[TAG]`, a roster, and bounded shared perks.

1. Any player with `highestLevel >= 1000` can **found** a guild and becomes its
   **Mistr cechu** (Guild Master). 1000 mirrors the first "endgame" gate
   (inventory unlock) — founding is an endgame act; *joining* is open early.
2. The Master (and promoted **Důstojníci** / Officers) **invite** other players;
   players can also **request** to join. One player ↔ one guild.
3. Guild **identity persists across seasons** (the social graph is the point), but
   every **competitive standing** (guild contribution, guild level, ladder rank)
   is **season-scoped and resets** — exactly the `players` vs `season_scores`
   split that already exists.
4. Being in an active guild grants **bounded passive perks** (gold find / dust
   find / luck — **never `dmgPct`**), scaling with guild level → zero anti-blitz
   impact, like album/mastery/runes.
5. Guilds compete on a **guild leaderboard** (aggregate of members' *already-
   attested* stats), and through **guild activities** (Hellevator floor-ladder
   first; world-boss contribution second). Top guilds earn placement rewards for
   their members at season close.

…without breaking the local-first contract. The server stays the **authority for
guild membership, roster, and standings**; the local save stays authoritative for
gameplay. **No realtime** — the game is POST+poll (`leaderboard-architecture`), so
"guild chat" is an async **MOTD + activity feed**, not live chat.

**Anti-cheat keystone:** guild standings are **never** a new number a client
asserts. They are *aggregated server-side from data the server already trusts* —
per-member `season_scores` (peakDps, highestLevel), world-boss `damage`, and
Hellevator `hell_best_floor` (itself attested in `hellevator.md` §9). Founding a
guild and inviting members opens **no new trust surface**.

## 2. Decisions (DECIDED ✅ / OPEN ❓)

| Question | Decision |
|---|---|
| Who can found? | ✅ `highestLevel >= 1000`. Costs a one-time fee (proposal: doves or dust — a sink, not gold which inflates). Founder = Master. |
| Who can join? | ✅ Open from **level 100** (aligns with Hellevator unlock; gives newbies a reason + perk onboarding). Invite **or** request flow. |
| One guild per player | ✅ Enforced by a `unique(player_id)` on the membership table. |
| Persist vs reset | ✅ **Identity persists** across seasons (`guilds`, `guild_members`). **Standings reset** (`guild_season`, lazily created per season). Mirrors `players` vs `season_scores`. |
| Roles | ✅ `master` (1) · `officer` (invite/kick/approve) · `member`. Master can promote/demote/transfer/disband. |
| Member cap | ✅ Bounded (proposal: 20, raised by guild level to ~30). Bounded like every raids/world-boss cap. |
| Perks | ✅ Tiered **bounded %**, **no `dmgPct`** (gold/dust/luck), scaling with guild level. Off the difficulty snapshot entirely. |
| Contribution metric | ✅ Derived from **already-attested** member data (no new claims) — see §5. |
| Realtime / chat | ✅ **None.** Async MOTD (Master-set) + a recent-activity feed (joins, level-ups, boss hits). No websockets. |
| Guild leaderboard | ✅ New `GET /api/guilds?board=` ranking active guilds by season contribution. Top guilds → member rewards at season close. |
| Hellevator tie-in | ✅ Guild floor-ladder = sum of members' `hell_best_floor`; weekly "cechovní sjezd". Detail in `hellevator.md` §11. |
| Disband / leave | ✅ Master disband (with confirm); members leave freely; Master must transfer before leaving. |
| Name / tag | ✅ Unique name (`name_ci`, validated like nickname) + `[TAG]` 2–4 chars, shown as a prefix on boards/profiles. |

## 3. Data model

New migration `apps/server/migrations/00X_guilds.sql` (next free number after the
current `006_raids_deposit.sql`). Same conventions as `002_seasons.sql` /
`005_raids.sql`: `gen_random_uuid()` PKs, `on delete cascade` to `players`/
`seasons`, partial unique indexes for invariants, transaction-wrapped by the
migrate-on-boot runner (`src/migrate.js`).

```sql
-- persistent guild identity (survives seasons; one row per guild)
create table if not exists guilds (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_ci     text not null unique,                 -- lower(name), case-insensitive uniqueness
  tag         text not null,                        -- 2–4 chars, shown as [TAG]
  tag_ci      text not null unique,
  master_id   uuid not null references players(id), -- current Master (transferable)
  motd        text not null default '',             -- async "chat": Master-set message of the day
  founded_at  timestamptz not null default now(),
  disbanded_at timestamptz                          -- soft-delete; null = active
);

-- persistent membership (one guild per player)
create table if not exists guild_members (
  guild_id   uuid not null references guilds(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade unique, -- one guild per player
  role       text not null default 'member',        -- 'master' | 'officer' | 'member'
  joined_at  timestamptz not null default now(),
  primary key (guild_id, player_id)
);
create index guild_members_guild_idx on guild_members (guild_id);

-- pending invites (guild→player) and requests (player→guild)
create table if not exists guild_invites (
  id          uuid primary key default gen_random_uuid(),
  guild_id    uuid not null references guilds(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  kind        text not null,                         -- 'invite' | 'request'
  created_by  uuid not null references players(id),  -- inviter (invite) or self (request)
  created_at  timestamptz not null default now(),
  status      text not null default 'pending',       -- 'pending' | 'accepted' | 'declined'
  unique (guild_id, player_id, kind) where status = 'pending'
);
create index guild_invites_player_idx on guild_invites (player_id) where status = 'pending';

-- season-scoped guild standing (lazily upserted; resets each season via fresh rows)
create table if not exists guild_season (
  season_id     uuid not null references seasons(id) on delete cascade,
  guild_id      uuid not null references guilds(id) on delete cascade,
  contribution  numeric not null default 0,          -- aggregate, server-computed (§5)
  level         int     not null default 1,          -- derived from contribution thresholds
  hell_floors   int     not null default 0,          -- sum of members' hell_best_floor (cache)
  boss_damage   numeric not null default 0,          -- sum of members' world-boss damage (cache)
  reward_doves  int,                                  -- null until season-close finalization
  reward_dust   int,
  claimed_at    timestamptz,                          -- per-member claim handled via guild_member_season
  updated_at    timestamptz not null default now(),
  primary key (season_id, guild_id)
);
create index guild_season_board_idx on guild_season (season_id, contribution desc);

-- per-member, per-season contribution + reward claim (mirror world_boss_contrib)
create table if not exists guild_member_season (
  season_id    uuid not null references seasons(id) on delete cascade,
  guild_id     uuid not null references guilds(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  contribution numeric not null default 0,
  reward_doves int,                                   -- snapshot at season close (by guild rank)
  reward_dust  int,
  claimed_at   timestamptz,
  primary key (season_id, player_id)
);
```

**Why identity-vs-standing split** (same reasoning as `season_scores`): the social
graph must survive a season wipe (you don't re-invite 20 people every season), but
the competitive standing must drop to zero. One row can't be both → `guilds`/
`guild_members` persist, `guild_season`/`guild_member_season` reset.

`lib/guilds.js` gets the helpers (mirrors `lib/raids.js` / `lib/worldboss.js`):
`createGuild`, `getGuildView`, `invite`, `respondInvite`, `request`, `respondRequest`,
`kick`, `leave`, `setRole`, `transferMaster`, `disband`, `setMotd`,
`recomputeGuildSeason` (aggregation), `guildLeaderboard`, `finalizeGuildSeason`.

## 4. Roster lifecycle & invariants

Load-bearing rules, all enforced server-side with `SELECT … FOR UPDATE` on the
relevant rows (the raids resolution pattern — lock by `id` ASC to avoid deadlock):

- **Found:** `requirePlayer` + `highestLevel >= 1000` + fee debited + name/tag
  validated & unique → insert `guilds`, insert `guild_members(role='master')`.
  Reject if player already in a guild.
- **Invite:** Master/Officer only → insert `guild_invites(kind='invite')`. Invitee
  sees it in `GET /api/me/guild`’s `invites[]`. Accept → atomically check member
  cap + still-not-in-a-guild, insert `guild_members(role='member')`, mark invite
  `accepted`, void other pending invites/requests for that player.
- **Request:** any player ≥100 → insert `guild_invites(kind='request')`; Officer
  approves → same atomic join. Decline → mark `declined`.
- **Kick:** Officer can kick `member`; only Master can kick an Officer. Removes
  `guild_members` row. (Season contribution already counted stays in `guild_season`
  cache; recomputed on next aggregation pass.)
- **Leave:** any member; **Master must `transferMaster` first** (or disband).
- **Promote/demote:** Master only; exactly one `master`.
- **Transfer master:** Master → another member becomes `master`, old → `officer`.
- **Disband:** Master only, with confirm → set `guilds.disbanded_at`, cascade
  members. Soft-delete keeps history/foreign keys intact.
- **Caps:** member cap (20, +level), and an **anti-abuse founding cap** reusing the
  per-IP idea (`LIMITS.perIpDailyAccountCap` is the precedent) — at most a few new
  guilds per IP/day to stop tag-squatting.

## 5. Contribution & guild level (server-computed, zero trust surface)

`recomputeGuildSeason(seasonId, guildId)` aggregates **only attested data** the
server already holds — never a client-asserted "guild score":

```
contribution(season, guild) =
    Σ_members  W_level(season_scores.highest_level)      -- progression presence
  + Σ_members  W_dps(season_scores.peak_dps)             -- log-bounded, like worldBossWeight
  + Σ_members  guild member-season activity (boss hits, hell floors)
```

- All weights are **log-bounded / clamped** (reuse the `worldBossWeight`
  `0.5–3×` log shape so one whale can't dwarf a whole active guild).
- `guild_season.level` is a step function of `contribution` (thresholds in
  `packages/shared`, like reward tiers) → unlocks perk tiers + member-cap bumps.
- Recompute is **cheap and lazy**: run it (a) when a member joins/leaves, (b)
  piggybacked on the member's `POST /api/scores` (the same throttled 10s sync that
  already updates `season_scores`), and (c) on guild-view fetch if stale. No cron
  needed — same "compute on access" model as `ensureActiveWorldBoss`.

Because every input is already attested/bounded, the **guild leaderboard inherits
the existing anti-cheat for free**. A faked local save still can't push more than
plausibility allows into `season_scores`, so it can't inflate a guild either.

## 6. Perks (the carrot — bounded, no `dmgPct`)

Members of an active guild get tiered passive bonuses by `guild_season.level`,
defined in `packages/shared` and applied **client-side** the same way album/mastery
bonuses already fold in — **deliberately without `dmgPct`** so they never enter the
difficulty snapshot (`difficultyScale`) and never touch the blitz/ladder economy:

| Guild level | Perk (bounded, illustrative) |
|---|---|
| 1 | +3% gold find |
| 3 | +3% gold, +3% dust find |
| 5 | +5% gold, +3% dust, +2% luck |
| 8 | +6% gold, +5% dust, +3% luck, +1 member slot |
| 10 (cap) | +8% gold, +6% dust, +4% luck, capstone cosmetic (guild banner) |

The client fetches its current perk tier from `GET /api/me/guild` and folds the
stat block into the existing `combatStats`-adjacent aggregation. Since these keys
are gold/dust/luck (already plausibility-bounded outputs) and carry **no `dmgPct`**,
client-side application is consistent with how album/runes/mastery already work —
no server enforcement of the perk math needed.

## 7. API surface

Conventions follow `routes/raids.js` (`requirePlayer` for writes, `optionalPlayer`
for public reads, `{ ok, ... }` / `{ error, code }`, `generalLimiter` already on
`/api`). New `routes/guilds.js` mounted in `index.js`.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/guilds` | required | Found a guild `{ name, tag }`. Gate: level ≥ 1000, fee, uniqueness. → `{ ok, guild }`. |
| `GET /api/guilds/:id` | optional | Public guild profile: name/tag, roster (nicknames+roles), level, season rank, perks, MOTD, recent feed. |
| `GET /api/guilds?board=&limit=&season=` | optional | Guild leaderboard for a season (default active), `board` = contribution \| hell \| boss. |
| `GET /api/me/guild` | required | My guild state: membership, role, roster, my perks, pending `invites[]`, pending `requests[]` (if officer). |
| `POST /api/guilds/:id/invite` | required | Master/Officer → `{ playerId }`. |
| `POST /api/guilds/invites/:inviteId/accept` \| `/decline` | required | Invitee responds. |
| `POST /api/guilds/:id/request` | required | Player ≥100 requests to join. |
| `POST /api/guilds/requests/:inviteId/approve` \| `/decline` | required | Officer responds. |
| `POST /api/guilds/:id/kick` | required | `{ playerId }`, role-gated. |
| `POST /api/guilds/:id/leave` | required | Leave (Master must transfer first). |
| `POST /api/guilds/:id/role` | required | Master sets `{ playerId, role }` (promote/demote). |
| `POST /api/guilds/:id/transfer` | required | Master → `{ playerId }` new Master. |
| `POST /api/guilds/:id/motd` | required | Master/Officer set MOTD. |
| `DELETE /api/guilds/:id` | required | Master disband. |

`net/api.js` gains the matching thin wrappers. Guild **rewards at season close**
are claimed through the existing `enter-season` flow (see §8), not a separate
endpoint.

## 8. Season interaction

Reuse the `seasons.md` machinery exactly:

- **Identity** (`guilds`, `guild_members`) is untouched by `rotate_season()` — your
  guild and roster carry into the new season.
- **Standings** (`guild_season`, `guild_member_season`) are **per-season rows**;
  the new season simply has none yet → fresh start, no wipe logic needed.
- **Finalization:** extend the season-close path (the `rotate_season()` migration,
  or a finalize step alongside it) to compute guild ranks from `guild_season`
  and snapshot `reward_doves`/`reward_dust` into `guild_member_season` by guild
  placement — the same shape as `season_rewards` and `world_boss_contrib` rewards.
- **Claim:** `POST /api/me/enter-season` already claims pending season rewards on
  reset; extend it to also grant any unclaimed `guild_member_season` reward and set
  `claimed_at` (idempotent, like `season_rewards.claimed_at`).

No new "enter guild season" gate is needed — guild standing is derived from
`season_scores`, which is *already* gated by `current_season_id`.

## 9. Frontend

A new **🛡️ Cech** view (tab alongside Leaderboard/Arena, the World-Boss-view
pattern) — or a modal if we want it lighter to start:

- **No guild:** browse/search guilds, a guild leaderboard, a **Founder** CTA
  (disabled with tooltip until level 1000), and an **invites inbox**.
- **In a guild:** header (`[TAG] Name`, level, season rank, Master crown), **roster**
  (roles, per-member contribution + nickname → opens `PlayerProfile`), **perks**
  panel (current tier + next-tier preview), **MOTD** (editable by officers),
  **activity feed**, and **guild activities** (Hellevator floor-ladder card →
  `hellevator.md`; world-boss aggregate).
- **Officer tools:** pending requests, invite-by-nickname, kick/promote/transfer.
- **`[TAG]` prefix** rendered next to nicknames on the main leaderboard and in
  profiles (cheap join on `guild_members` → `guilds`).

Files: `components/guild/GuildView.jsx`, `GuildRoster.jsx`, `GuildPerks.jsx`,
`GuildLeaderboard.jsx`, `GuildInvites.jsx`, `FoundGuildModal.jsx`;
`AccountContext.jsx` (or a new `GuildContext`) polls `GET /api/me/guild` alongside
the existing sync; `Leaderboard.jsx` + `PlayerProfile.jsx` render the `[TAG]`.

## 10. Shared contract (`packages/shared`)

- **Guild constants live in one place:** member cap + per-level bumps, contribution
  weight functions (reuse the `worldBossWeight` log-bounded shape), level
  thresholds, perk tiers, founding fee, anti-abuse founding cap. Importable by
  client (display/predict) and server (authority).
- **Reward tiers** for guild placement are authoritative **server-side** (in the
  finalize step / SQL), like `rotate_season()` — the client only *displays* the
  granted amount, no JS↔SQL drift.
- `validateGuildName` / `validateGuildTag` mirror `validateNickname` (length,
  charset, reserved words, case-insensitive uniqueness handled by the DB index).

## 11. Anti-cheat / integrity notes

- **No new asserted number.** Guild contribution is a pure server-side aggregate of
  `season_scores` + world-boss `damage` + Hellevator `hell_best_floor`, each already
  plausibility-checked. There is nothing for a client to lie about.
- **Perks carry no `dmgPct`** → out of `difficultyScale`; they cannot blitz the wall
  or contaminate the ladder. Same guarantee as album/mastery/runes.
- **Atomicity:** all roster mutations lock the relevant rows (`FOR UPDATE`, ordered)
  so concurrent invite/accept/kick can't double-join or exceed the member cap — the
  raids resolution pattern.
- **Anti-abuse:** per-IP founding cap (precedent: `perIpDailyAccountCap`), unique
  name/tag indexes, role gates on every mutation, soft-delete on disband.
- **Privacy:** guild profile exposes nicknames + roles + season contribution only —
  never tokens or save blobs (same as `/api/players/:id`).

## 12. Phased roadmap

1. **Schema + lib core** (`00X_guilds.sql`, `lib/guilds.js`): tables, found/invite/
   request/join/leave/kick/role/transfer/disband with locking + caps. No standings yet.
2. **Server API** (`routes/guilds.js`, mount in `index.js`, `net/api.js` wrappers):
   the §7 endpoints + `GET /api/me/guild`.
3. **Client core** (`GuildView`, roster, invites inbox, found-guild flow, `[TAG]`
   on the leaderboard). Guilds exist and are usable.
4. **Standings + perks** (`guild_season`, `recomputeGuildSeason` on score-sync,
   guild leaderboard, bounded perks folded client-side, level thresholds).
5. **Season finalize + rewards** (extend close path + `enter-season` claim).
6. **Activities** (Hellevator floor-ladder per `hellevator.md` §11; world-boss
   aggregate; MOTD + activity feed).

Each phase is shippable: after (1)–(3) guilds are a working social layer with
identity, roster, and a tag; (4)+ add competition; (6) adds the shared goals.

## 13. Risks / open questions

- **Why join a guild?** Perks must feel worth it without being mandatory (no
  `dmgPct`, so they're convenience, not power). Tune perk %s and lean on social
  identity + activity rewards as the real pull.
- **Founding fee currency:** doves vs dust — doves are scarcer (better gate), dust
  is a more natural sink. Decide once the economies settle (open, like the seasons
  reward-balance question).
- **Inactive/abandoned guilds:** a Master who quits leaves a dead guild. Mitigation:
  auto-transfer Master to the highest-contribution Officer/member after N days of
  Master inactivity (cheap, compute-on-access). Defer to a later phase.
- **Member cap vs fairness:** larger guilds aggregate more contribution. The
  log-bounded weights soften it, but consider a **per-capita** board variant so
  small active guilds can compete with big passive ones.
- **Realtime expectations:** players may expect live chat. MOTD + feed is the
  honest fit for a POST+poll backend; set expectations in the UI copy.
</content>
