-- =========================================================================
-- 007_guilds — CECHY: persistentní sociální skupina + sezónně resetované postavení.
--   IDENTITA (přežívá sezónu — neresetuje ji rotate_season):
--     • guilds         — jeden řádek na cech (jméno, [TAG], master, MOTD, soft-delete).
--     • guild_members  — členství 1:1 (unique player_id → jeden cech na hráče), role.
--     • guild_invites  — pozvánky (guild→hráč) i žádosti (hráč→guild), pending stav.
--   POSTAVENÍ (per-sezóna, čerstvé řádky = reset; mirror season_scores):
--     • guild_season         — agregát příspěvku/úrovně/odměny cechu v sezóně.
--     • guild_member_season  — per-člen příspěvek + nárokovatelná odměna (mirror world_boss_contrib).
-- VŠECHNO postavení je SERVEROVÝ AGREGÁT z atestovaných dat členů → žádná nová
-- důvěryhodná plocha (anti-cheat zadarmo, viz lib/guilds.js). Bez cronu.
-- =========================================================================

-- persistentní identita cechu (přežívá sezóny; soft-delete přes disbanded_at)
create table if not exists guilds (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_ci      text not null unique,                  -- lower(name) → case-insensitive unikátnost
  tag          text not null,                          -- 2–4 znaky, zobrazeno jako [TAG]
  tag_ci       text not null unique,                   -- upper(tag) → unikátnost
  master_id    uuid not null references players(id) on delete cascade,  -- aktuální Mistr cechu (přenositelný); smazání jeho účtu cech zruší (jinak by FK blokovala DELETE /api/me)
  motd         text not null default '',               -- asynchronní „chat": zpráva dne (Master/Officer)
  founder_ip   text,                                   -- anti-squatting: per-IP denní strop zakládání
  founded_at   timestamptz not null default now(),
  disbanded_at timestamptz                             -- soft-delete; null = aktivní
);

-- persistentní členství: jeden cech na hráče (unique player_id)
create table if not exists guild_members (
  guild_id   uuid not null references guilds(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade unique, -- jeden cech na hráče
  role       text not null default 'member',           -- 'master' | 'officer' | 'member'
  joined_at  timestamptz not null default now(),
  primary key (guild_id, player_id)
);
create index if not exists guild_members_guild_idx on guild_members (guild_id);

-- pozvánky (guild→hráč) a žádosti (hráč→guild)
create table if not exists guild_invites (
  id          uuid primary key default gen_random_uuid(),
  guild_id    uuid not null references guilds(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  kind        text not null,                            -- 'invite' | 'request'
  created_by  uuid not null references players(id) on delete cascade,  -- pozvatel (invite) nebo sám hráč (request); cascade ať smazání účtu nezablokuje FK
  created_at  timestamptz not null default now(),
  status      text not null default 'pending'          -- 'pending' | 'accepted' | 'declined'
);
-- jen JEDNA otevřená pozvánka/žádost daného druhu na dvojici (guild,hráč)
create unique index if not exists guild_invites_pending_uniq
  on guild_invites (guild_id, player_id, kind) where status = 'pending';
-- rychlé čtení otevřených pozvánek/žádostí pro hráče i pro cech
create index if not exists guild_invites_player_idx on guild_invites (player_id) where status = 'pending';
create index if not exists guild_invites_guild_idx  on guild_invites (guild_id)  where status = 'pending';

-- sezónní postavení cechu (lazily upsertováno; nová sezóna = žádné řádky = čistý start)
create table if not exists guild_season (
  season_id    uuid not null references seasons(id) on delete cascade,
  guild_id     uuid not null references guilds(id) on delete cascade,
  contribution numeric not null default 0,             -- agregát, server-computed (lib/guilds.js)
  level        int     not null default 1,             -- step funkce z contribution (sdílené prahy)
  hell_floors  int     not null default 0,             -- součet hell_best_floor členů (cache; Hellevator)
  boss_damage  numeric not null default 0,             -- součet world-boss damage členů (cache)
  reward_doves int,                                     -- null do uzávěrky sezóny (snapshot dle ranku)
  reward_dust  int,
  finalized_at timestamptz,                             -- kdy byly odměny snapshotnuty
  updated_at   timestamptz not null default now(),
  primary key (season_id, guild_id)
);
create index if not exists guild_season_board_idx on guild_season (season_id, contribution desc);

-- per-člen, per-sezóna příspěvek + nárok na odměnu (mirror world_boss_contrib)
create table if not exists guild_member_season (
  season_id    uuid not null references seasons(id) on delete cascade,
  guild_id     uuid not null references guilds(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  contribution numeric not null default 0,
  reward_doves int,                                     -- snapshot při uzávěrce (dle ranku cechu)
  reward_dust  int,
  claimed_at   timestamptz,                             -- nárokováno přes enter-season (idempotentně)
  primary key (season_id, player_id)
);
create index if not exists guild_member_season_guild_idx on guild_member_season (season_id, guild_id);

-- aktivita cechu (asynchronní „feed" místo realtime chatu): vstupy/odchody/povýšení…
-- actor/target jen referencí na hráče s `on delete set null` → smazání účtu feed nezablokuje
-- (přezdívku doplníme až při čtení; null = „někdo"). Persistentní (přežívá sezónu).
create table if not exists guild_feed (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references guilds(id) on delete cascade,
  kind       text not null,                            -- 'found'|'join'|'leave'|'kick'|'promote'|'demote'|'transfer'
  actor_id   uuid references players(id) on delete set null,
  target_id  uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists guild_feed_idx on guild_feed (guild_id, created_at desc);

-- =========================================================================
-- ROTACE SEZÓNY + FINALIZACE CECHŮ. Rozšiřujeme rotate_season() (definici z 002)
-- o snapshot odměn cechů: po spočítání season_rewards (a PŘED uzávěrkou sezóny)
-- seřadíme aktivní cechy dle guild_season.contribution a každému ČLENOVI cechu
-- zapíšeme placement odměnu do guild_member_season. Žebříček odměn cechů (jediný
-- zdroj pravdy) žije TADY v SQL (zrcadlí shared `guildSeasonReward` jen pro display).
-- Pozn.: guild_season.contribution počítá lib/guilds.js (lazy, server-side agregát
-- atestovaných dat) → finalizace bere poslední napočítaný stav (compute-on-access).
-- =========================================================================
create or replace function rotate_season() returns int as $$
declare
  active_id  uuid;
  active_num int;
begin
  select id, number into active_id, active_num
    from seasons where status = 'active' for update;
  if active_id is null then
    raise exception 'rotate_season: žádná aktivní sezóna';
  end if;

  -- umístění = pozice na výchozím (level) žebříčku, remíza dle dřívějšího dosažení
  insert into season_rewards (season_id, player_id, rank, forgiveness)
  select active_id, player_id, rnk,
         case when rnk = 1  then 100
              when rnk <= 3  then 60
              when rnk <= 10 then 35
              when rnk <= 50 then 20
              else 10 end
  from (
    select player_id,
           row_number() over (order by highest_level desc, created_at asc) as rnk
    from season_scores where season_id = active_id
  ) ranked
  on conflict (season_id, player_id) do nothing;

  -- FINALIZACE CECHŮ: seřaď cechy dle příspěvku, spočítej placement odměnu (bounded
  -- 🕊+💠, žádný dmgPct) a snapshotni ji KAŽDÉMU AKTUÁLNÍMU ČLENOVI cechu.
  with granked as (
    select gs.guild_id,
           row_number() over (order by gs.contribution desc, gs.updated_at asc) as grnk
      from guild_season gs
     where gs.season_id = active_id and gs.contribution > 0
  ),
  grew as (
    select guild_id, grnk,
           case when grnk = 1 then 40 when grnk <= 3 then 24 when grnk <= 10 then 14 when grnk <= 25 then 6 else 0 end as doves,
           case when grnk = 1 then 400 when grnk <= 3 then 250 when grnk <= 10 then 150 when grnk <= 25 then 80 else 0 end as dust
      from granked
  ),
  upd as (
    update guild_season gs
       set reward_doves = grew.doves, reward_dust = grew.dust, finalized_at = now()
      from grew
     where gs.season_id = active_id and gs.guild_id = grew.guild_id
  )
  insert into guild_member_season (season_id, guild_id, player_id, contribution, reward_doves, reward_dust)
  select active_id, gm.guild_id, gm.player_id, coalesce(gms.contribution, 0), grew.doves, grew.dust
    from grew
    join guild_members gm on gm.guild_id = grew.guild_id
    left join guild_member_season gms on gms.season_id = active_id and gms.player_id = gm.player_id
   where grew.doves > 0 or grew.dust > 0
  on conflict (season_id, player_id) do update
    set reward_doves = excluded.reward_doves, reward_dust = excluded.reward_dust, guild_id = excluded.guild_id;

  update seasons set status = 'closed', closed_at = now() where id = active_id;
  insert into seasons (number, status) values (active_num + 1, 'active');
  return active_num + 1;
end;
$$ language plpgsql;
