# Plan: Monorepo + Express backend + Leaderboards

Status: **proposed** · Last updated: 2026-06-25

## 1. Goal

Add an Express backend that:

1. Statically serves the existing game.
2. Stores a per-player **nickname** + game **stats**.
3. Exposes a **leaderboard**.
4. Ships with **Docker Compose** and runs **DB migrations on deploy**.

…**without touching the game's offline-first, high-performance core**. The backend
is a thin *sync + identity* layer; the local `localStorage` save stays
authoritative for gameplay, so the game keeps working even if the server is down.

**Local-first, leaderboard opt-in.** Playing locally (no account) is the default
and always available. Joining the leaderboard is an explicit action that
**resets all progress to a fresh start** (with a clear warning first) — so the
leaderboard starts everyone clean and a pre-grinded local save can't be imported.

## 2. Identity model (DECIDED ✅)

`"one account per IP"` conflicts with `"user changes IP going home from work"`,
and with the likely reality that **players are coworkers behind one office NAT**
(shared public IP). Strict 1-per-IP would lock out everyone but the first
registrant. Resolution:

| Concern | Mechanism |
|---|---|
| Who am I? | A secret `playerToken` (random UUID) created on registration, stored in `localStorage`, sent as `Authorization: Bearer <token>`. **Survives IP changes** because it travels with the browser, not the network. |
| "Save user's IP" | Record `created_ip` + rolling `ip_history` on the account — for audit/moderation, **not** as the key. |
| "One account per IP" (anti-abuse intent) | Relaxed to a **per-IP daily creation cap of 5/day** + rate limiting. Stops account spam while a shared office NAT can host the whole team. |
| Recovery / multi-device | **Recovery code** (DECIDED ✅) — the player token, shown formatted in Settings. Entering it on a new device / after clearing data re-links the account. |

## 3. Other decisions (DECIDED ✅)

- **Datastore: external Postgres**, connected via `DATABASE_URL` connection string
  (managed/external — **not** run by our compose in prod).
- **Migrations run on deploy** — automatically, idempotent, tracked in a
  migrations table. Run via the container entrypoint *before* the app starts.
- **Per-IP account creation cap: 5/day.**
- **Recovery code: yes.**
- **Local mode is the default; joining the leaderboard resets progress** (DECIDED ✅) —
  the join action shows a warning, and on confirm performs a `hardReset()` so the
  player starts the leaderboard from scratch.
- **Server stores the latest full save blob** (DECIDED ✅, my call — flag if you
  disagree) — so that *recovery* (new device / cleared browser without using the
  in-app delete) actually restores your **playable** progress, not just your name
  on the board. The derived stat columns are still stored separately for ranking +
  plausibility checks. (In-app "delete progress" wipes the account, so there's
  nothing to recover after a deliberate delete — see §7.)

### Still open (non-blocking, default chosen)

- **Leaderboard boards** — default: multiple tabs (level / gold / rebirths / kills,
  + optional **peak true DPS** from §11). Can trim to a single `highestLevel` board
  if preferred.

## 4. Target structure (npm workspaces — no extra tooling)

```
ekiclicker/
  package.json              # root: workspaces + orchestration scripts (concurrently)
  docker-compose.yml        # app service (prod: external DATABASE_URL)
  docker-compose.local.yml  # optional: local Postgres for dev (compose profile)
  Dockerfile                # multi-stage: build web -> bundle into server image
  apps/
    web/                    # <- current app moved here (src/, index.html, vite.config.js)
    server/                 # NEW Express backend
      src/
        index.js            # bootstrap: run migrations, static serving + SPA fallback
        db.js               # pg Pool + query helpers
        migrate.js          # migration runner (or node-pg-migrate config)
        routes/{auth,leaderboard,scores}.js
        middleware/{rateLimit,auth,plausibility}.js
      migrations/           # *.sql (or node-pg-migrate js) — applied on deploy
  packages/
    shared/                 # tiny: score payload shape + validation/plausibility bounds
```

- `packages/shared` keeps the score schema and plausibility limits in **one place**
  imported by both client and server.
- No DB volume needed (Postgres is external).

## 5. Backend design

### Datastore: Postgres via `pg`

- `pg` (node-postgres) connection pool, `DATABASE_URL` env.
- `db.js` exposes a small `query()`/`tx()` helper. No ORM (keep it simple).

### Migrations (run on deploy)

- Plain SQL files in `apps/server/migrations/` + a tracking table
  (`schema_migrations`), applied in order. (Alternatively `node-pg-migrate`.)
- **Entrypoint runs `npm run migrate` then starts the server** — so every deploy
  applies pending migrations before serving traffic. Idempotent: already-applied
  migrations are skipped.

### `players` table (one row per player, stats inline — simplest)

```
players(
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null,            -- sha256(token); raw token never stored
  recovery_hash   text not null,            -- sha256(recovery code) (= token, formatted)
  nickname        text unique not null,
  nickname_ci     text unique not null,     -- lower(nickname) for case-insensitive uniqueness
  created_ip      text, last_ip text, ip_history jsonb default '[]',
  highest_level   int default 1,
  total_gold      numeric default 0,
  kills           bigint default 0,
  boss_kills      bigint default 0,
  rebirths        int default 0,
  max_combo       int default 0,
  play_time_ms    bigint default 0,
  achievements    int default 0,
  save_blob       jsonb,                    -- latest synced full save (for recovery / cross-device restore)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  renamed_at      timestamptz,
  last_submit_at  timestamptz
)
-- index for per-IP daily creation cap:
index on players (created_ip, created_at)
```

### API (token in `Authorization: Bearer <token>`)

| Method | Route | Purpose | Guards |
|---|---|---|---|
| POST | `/api/register` | `{nickname}` -> create player, return `{id, token, recoveryCode}` (caller resets local progress first) | nickname valid+free; per-IP cap 5/day; rate limit |
| POST | `/api/recover` | `{code}` -> validate recovery code, return profile + `save_blob` (client keeps code as token, loads save) | rate limit |
| GET  | `/api/me` | profile + current rank (+ `save_blob` on demand) | token |
| PATCH| `/api/me` | rename | token; uniqueness; rename throttle (1x / N h) |
| DELETE | `/api/me` | wipe account (used by Settings "delete progress") | token |
| POST | `/api/scores` | push current stats + `save_blob` | token; monotonic + plausibility; submit throttle |
| GET  | `/api/leaderboard?board=level` | top-N for a metric | rate limit; short cache |
| `*`  | (non-`/api`) | serve `apps/web/dist` + SPA fallback | — |

## 6. Anti-spam / anti-cheat layers

Honest framing: the game is fully client-side, so a determined cheater *can*
forge a score. For an office leaderboard the goal is "stop casual tampering &
spam cheaply," not perfect integrity.

1. **Transport:** `helmet`, JSON body-size limit, same-origin CORS,
   `express-rate-limit` per IP.
2. **Account creation:** per-IP cap **5/day** + nickname rules (length, charset,
   reserved/blocklist, trim, case-insensitive uniqueness).
3. **Score submission:**
   - **Throttle:** accept ~1 update / 10–15 s per player (game already autosaves
     every 10 s — natural hook).
   - **Monotonic:** reject stats that *decrease* (level/gold/kills only go up).
   - **Plausibility:** ceilings derived from game balance (e.g. `highest_level`
     can't exceed what's reachable in `play_time_ms`; `kills >~ level`;
     gold-vs-level sanity). Reject + **log** outliers (no silent capping).
   - **Light HMAC signature** of the payload with a shared secret — raises the
     bar vs. casual devtools tampering; documented as best-effort, not security.
4. **Rename throttle** to prevent impersonation/churn.

## 7. Frontend changes (minimal, matches Czech UI)

- **Two account states**, tracked client-side:
  - **Local** (default, no token): plays exactly as today. No forced onboarding —
    the game just starts.
  - **Joined** (token in `localStorage`): nickname known, stats sync.
- **Header segmented control** in `TopBar`: `Hra | Žebříček` — drives a top-level
  view switch in `Game.jsx`. Always available, even in Local mode.
- **DPS readout in `TopBar`** (auto / punch / true) — see §11. Replaces/augments the
  current single "DPS (auto)" stat. Backend-independent; works in Local mode too.
- **Header identity area**:
  - Local -> shows e.g. "Hraješ lokálně" + a **"Připojit se k žebříčku"** (join) button.
  - Joined -> shows nickname + edit affordance -> rename modal (`PATCH /api/me`).
- **Join flow** (the reset-on-join requirement): join button -> **warning modal**
  ("Připojením k žebříčku se tvůj postup vynuluje a začneš od začátku.") -> on
  confirm: ask nickname -> `POST /api/register` -> on success **`engine.hardReset()`**
  + store token -> show **recovery code** once with a "ulož si tohle" prompt.
  Handles "taken" / "IP cap" errors before resetting (reset only after a
  successful register).
- **Leaderboard view**: viewable by **anyone** (read-only ranked table; nickname +
  chosen stats; tabs per board). In Local mode it shows a "join to compete" CTA;
  in Joined mode the current player's row is highlighted. Lazy-loaded like other panels.
- **Sync layer** (`apps/web/src/net/sync.js`): only active when Joined. Best-effort
  `POST /api/scores` (stats + save blob) piggybacking on existing
  autosave/visibility-hidden hooks; never blocks gameplay; silent-fails offline.
- **Settings**:
  - **Delete progress** (`reset`): in Joined mode also `DELETE /api/me` + clears
    local token (back to Local mode); in Local mode behaves as today. Warning copy
    updated to say the leaderboard account is removed too.
  - **Recovery**: shows the recovery code (Joined) + a "recover account" entry
    field (`POST /api/recover`) that re-links and **loads the returned save blob**
    into the engine — bringing back playable progress on a new device / after a
    cleared browser.
- **Vite**: add `server.proxy` `/api -> :3000` for dev.

## 8. Docker

- **Multi-stage `Dockerfile`:** build stage (`node:20`, installs workspaces,
  `vite build`) -> runtime stage (`node:20-slim`, copies server + built
  `web/dist` + prod deps). Entrypoint: `npm run migrate && node apps/server/src/index.js`.
- **`docker-compose.yml` (prod):** single `app` service, port `3000`, env
  (`DATABASE_URL`, `HMAC_SECRET`, caps), `restart: unless-stopped`. No DB service
  (Postgres external).
- **`docker-compose.local.yml` (dev, optional):** adds a local `postgres` service
  + volume so the stack runs end-to-end on a laptop without an external DB.

## 9. Dev workflow

- Root `npm run dev` -> `concurrently`: Vite (`:5173`) + server (`:3000`), Vite
  proxies `/api`.
- Root `npm run build` -> builds web; server serves `apps/web/dist`.
- `npm run migrate` available locally against `DATABASE_URL`.

## 10. Phased, shippable roadmap

| Phase | Deliverable | Shippable on its own? |
|---|---|---|
| **1** | Monorepo restructure: app -> `apps/web`, npm workspaces, game still runs | ✅ game unchanged |
| **2** | Express skeleton + static serving + Dockerfile + compose -> game served from Node | ✅ playable from backend |
| **3** | Postgres + migrations-on-deploy wiring (schema_migrations + players) | ✅ DB ready |
| **4** | Identity: register/recover/me/rename/delete, token+recovery code, IP recording, per-IP cap + rate limit | ✅ accounts work |
| **5** | Score sync + leaderboard API + plausibility/monotonic checks | ✅ leaderboard data flows |
| **6** | Frontend: segmented header, local/joined states, **join-with-reset warning flow**, rename + recovery UI, leaderboard view, settings wipe wiring | ✅ full feature visible |
| **7** | Hardening: HMAC, throttles, blocklist, docs | ✅ polish |

Each phase keeps the game fully working; the backend is purely additive.

**Backend-independent workstream — DPS readout (§11):** engine metered DPS +
`TopBar` auto/punch/true display + `stats.peakDps`. Can land any time (even before
Phase 1); `peakDps` only becomes a leaderboard field once Phase 5 sync exists.

## 11. DPS readout: auto / punch / true

Show three distinct damage-per-second numbers in `TopBar` (today there's only the
single `totalDps` "DPS (auto)"):

| Metric | Definition | Source |
|---|---|---|
| **Auto DPS** | Passive damage/sec from weapons + shadow fist (steady, theoretical). | `totalDps(state)` — already exists; what TopBar shows now. |
| **Punch DPS** | Effective damage/sec contributed by *manual clicking*, measured over a short rolling window — includes combo, crit and frenzy *as actually rolled*. Decays to 0 when idle. | new metered value (measured). |
| **True DPS** | Actual total damage/sec being dealt right now ≈ auto + punch, measured over the same window. Reflects real throughput, including overkill waste. | new metered value (measured). |

### Engine support (small, isolated)

- `applyDamage()` is the single funnel for all damage; `punch()` and `tick()` are
  the two callers. Tag each call with a source (`'punch'` vs `'auto'`).
- Maintain a short **sliding-window accumulator** (e.g. last ~1.5 s) of damage per
  source; recompute each frame (cheap). Expose `meteredDps()` → `{ auto, punch, true }`.
- Define **Auto DPS** as the theoretical `totalDps(state)` (steady, no jitter) and
  **Punch/True** as measured. Subtlety to surface in code comments: measured True
  can sit *below* auto+punch because overkill/boss-escape damage is discarded in
  `applyDamage` — that's intended and informative.
- Add `stats.peakDps` (monotonic max of measured True DPS) — feeds an optional
  leaderboard board (§3) and is naturally plausibility-checkable.

### UI

- Compact grouping in `TopBar` (e.g. `Auto / Úder / Skutečné`), reusing existing
  `.stat` styling. Punch/True update smoothly via the metered window.

Backend-independent: this can land at any time (even before the monorepo move),
and `peakDps` only becomes a leaderboard field once Phase 5 sync exists.

## 12. Risks / notes

- **Client-side score forgeability** — mitigated, not eliminated (see §6). Acceptable
  for an office leaderboard; documented.
- **Recovery code = the secret** — losing it on a cleared browser with no copy means
  account loss. UI must nudge the user to save it.
- **Multiple app instances + migrations-on-start** — fine for single-instance office
  deploy; if scaled out, run migrations as a one-shot pre-deploy step instead.
- **Case-insensitive nickname uniqueness** enforced via `nickname_ci` column.
- **Reset-on-join is destructive** — must be gated behind an explicit warning modal,
  and the `hardReset()` must run only *after* a successful `POST /api/register`
  (never reset then fail to register).
- **Save-blob storage** doesn't materially weaken anti-cheat (the client is already
  trusted for stats per §6), and the queryable stat columns are still validated
  independently. It does mean a recovered account restores whatever was last synced.
