-- =========================================================================
-- 003_world_boss — sezónní kooperativní „Světový boss".
--   • world_bosses       — jeden sdílený boss v čase na sezónu (číslováno 1,2,3…).
--                          HP je jeden pool, který komunita společně ubíjí.
--   • world_boss_contrib — per-(boss,hráč) příspěvek + spočtená odměna (claim po konci).
-- Boss je VÁZANÝ NA SEZÓNU (full-reset sezóny = čerstvý boss). Životní cyklus:
-- active → (HP=0) defeated | (deadline) expired. Po respawn pauze naskočí další.
-- Spawn i finalizace odměn řeší server (lib/worldboss.js) — žádný cron.
-- =========================================================================

create table if not exists world_bosses (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  number      int  not null,                       -- pořadí bosse V RÁMCI sezóny (1,2,3…)
  name        text not null,
  emoji       text not null,
  status      text not null default 'active',      -- 'active' | 'defeated' | 'expired'
  max_hp      numeric not null,
  hp          numeric not null,                     -- zbývající HP (sdílený pool)
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null,                 -- deadline; po něm 'expired', když hp>0
  ended_at    timestamptz,                          -- kdy padl / vypršel
  unique (season_id, number)
);
-- právě jeden AKTIVNÍ boss na sezónu (pojistka proti souběžnému spawnu)
create unique index if not exists world_bosses_one_active
  on world_bosses (season_id) where status = 'active';

-- per-(boss,hráč) příspěvek. damage = nasčítané „body" úderů. Odměna se spočítá
-- při uzávěrce bosse (finalize) a hráč si ji claimne (claimed_at).
create table if not exists world_boss_contrib (
  boss_id      uuid not null references world_bosses(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  damage       numeric not null default 0,
  hits         int     not null default 0,
  last_hit_at  timestamptz not null default now(),  -- kotva cooldownu úderů
  reward_doves int,                                  -- spočteno při finalizaci (null = ještě neuzavřeno)
  reward_dust  int,
  claimed_at   timestamptz,                          -- kdy hráč odměnu vyzvedl
  primary key (boss_id, player_id)
);
create index if not exists world_boss_contrib_board_idx
  on world_boss_contrib (boss_id, damage desc);
-- rychlé dohledání nevyzvednutých odměn hráče (napříč bossy sezóny)
create index if not exists world_boss_contrib_unclaimed_idx
  on world_boss_contrib (player_id) where reward_doves is not null and claimed_at is null;
