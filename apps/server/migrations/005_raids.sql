-- =========================================================================
-- 005_raids — ARÉNA / PŘEPADY: asynchronní PvP nájezdy na DUCHY offline hráčů.
--   • raid_state — per-(sezóna,hráč): TREZOR (server-authoritative lup, který lze
--                  ukrást), Elo rating, série, štít, cooldowny, obranná taktika.
--                  Trezor je WITHDRAW-ONLY — plní ho server (skim zlata z atest.
--                  postupu + uloupený lup), klient ho jen vybírá do bezpečí.
--                  Vázáno na sezónu → full-reset sezóny = čistý trezor i rating.
--   • raids      — log přepadů (i pro upozornění „byl jsi vyloupen" + pomstu).
-- Veškerou logiku (matchmaking, resolve, skim) řeší server (lib/raids.js) — bez cronu.
-- =========================================================================

-- per-(sezóna,hráč) stav arény. Trezor (vault_*) je JEDINÁ ukraditelná věc;
-- lokální save zůstává nedotčený (proto krádež „drží" i u offline oběti).
create table if not exists raid_state (
  season_id      uuid not null references seasons(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  rating         int     not null default 1000,        -- Elo žebříček arény (sezónní)
  wins           int     not null default 0,            -- vyhrané přepady (jako útočník)
  losses         int     not null default 0,            -- prohrané přepady (jako útočník)
  raided_count   int     not null default 0,            -- kolikrát mě někdo vyloupil
  streak         int     not null default 0,            -- aktuální série výher útočníka
  best_streak    int     not null default 0,
  vault_gold     numeric not null default 0,            -- ukraditelné zlato (skim + lup)
  vault_doves    int     not null default 0,            -- ukraditelná 🕊 (jen z lupu/bonusů)
  vault_dust     int     not null default 0,            -- ukraditelné 💠
  defense_tactic text    not null default 'obrana',     -- taktika mého ducha při obraně
  shield_until   timestamptz,                            -- po vyloupení: imunita do tohoto času
  last_raid_at   timestamptz,                            -- kotva cooldownu mých přepadů
  daily_count    int     not null default 0,            -- přepadů v aktuálním dni
  daily_reset_at timestamptz,                            -- kdy se daily_count vynuluje
  skim_at        timestamptz,                            -- poslední doplnění trezoru (skim)
  updated_at     timestamptz not null default now(),
  primary key (season_id, player_id)
);
-- matchmaking páruje dle peakDps (join na season_scores); rating je žebříček arény
create index if not exists raid_state_rank_idx on raid_state (season_id, rating desc);

-- log přepadů: zdroj historie, upozornění „byl jsi vyloupen" a pomsty.
create table if not exists raids (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references seasons(id) on delete cascade,
  attacker_id     uuid not null references players(id) on delete cascade,
  defender_id     uuid not null references players(id) on delete cascade,
  attacker_tactic text    not null,
  defender_tactic text    not null,
  attacker_won    boolean not null,
  loot_gold       numeric not null default 0,
  loot_doves      int     not null default 0,
  loot_dust       int     not null default 0,
  rating_delta    int     not null default 0,           -- změna ratingu útočníka
  created_at      timestamptz not null default now(),
  seen_at         timestamptz                            -- kdy obránce viděl upozornění
);
-- příchozí přepady na mě (upozornění + pomsta), nejnovější první
create index if not exists raids_defender_idx on raids (defender_id, created_at desc);
-- moje přepady (historie útoků) + lookup target-cooldownu (stejnou oběť ne hned zas)
create index if not exists raids_attacker_idx on raids (attacker_id, created_at desc);
