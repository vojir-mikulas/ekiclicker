-- =========================================================================
-- 002_seasons — sezóny (časově ohraničené žebříčky).
--   • seasons         — jedna aktivní sezóna v čase (číslováno 1,2,3…).
--   • season_scores   — sezónní standing (zdroj žebříčku), resetuje se každou sezónou.
--   • season_rewards  — odměna za umístění při uzávěrce, claimuje ji klient po resetu.
--   • players.current_season_id — do které sezóny hráč aktivně soutěží (gate).
--   • rotate_season() — uzávěrka + otevření další (voláno z migrace na release).
-- =========================================================================

-- jedna sezóna na řádek; právě jedna aktivní. Jen čísla — žádné jméno.
create table if not exists seasons (
  id          uuid primary key default gen_random_uuid(),
  number      int  not null unique,                 -- 1, 2, 3 …
  status      text not null default 'active',       -- 'active' | 'closed'
  started_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create unique index if not exists seasons_one_active on seasons (status) where status = 'active';

-- per-(season,player) standing — ZDROJ žebříčku.
-- Monotonní V RÁMCI sezóny; čerstvá sezóna = čerstvé řádky.
create table if not exists season_scores (
  season_id      uuid not null references seasons(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  highest_level  int     not null default 1,
  total_gold     numeric not null default 0,
  kills          bigint  not null default 0,
  boss_kills     bigint  not null default 0,
  rebirths       int     not null default 0,
  max_combo      int     not null default 0,
  play_time_ms   bigint  not null default 0,
  achievements   int     not null default 0,         -- počet (rychlý žebříček)
  achievement_ids jsonb  not null default '[]',       -- které úspěchy (per-season profil)
  peak_dps       numeric not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_submit_at timestamptz,                        -- sezónní anti-cheat kotva
  primary key (season_id, player_id)
);
create index if not exists season_scores_board_idx on season_scores (season_id, highest_level desc);

-- odměna za umístění spočtená při uzávěrce; claimne ji klient při resetu.
create table if not exists season_rewards (
  season_id   uuid not null references seasons(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  rank        int  not null,
  forgiveness int  not null,
  claimed_at  timestamptz,
  primary key (season_id, player_id)
);

-- do které sezóny hráč aktivně soutěží (gate proti zaplevelení čerstvého žebříčku)
alter table players add column if not exists current_season_id uuid references seasons(id);

-- seed Sezóny 1 a zařazení všech stávajících hráčů
insert into seasons (number, status) values (1, 'active')
  on conflict (number) do nothing;
update players set current_season_id = (select id from seasons where number = 1)
  where current_season_id is null;
-- backfill: stávající staty hráčů se stávají jejich standingem v Sezóně 1
-- (achievement_ids vytáhneme z klíčů save_blob->'achievements')
insert into season_scores (season_id, player_id, highest_level, total_gold, kills,
       boss_kills, rebirths, max_combo, play_time_ms, achievements, achievement_ids, peak_dps,
       created_at, last_submit_at)
select (select id from seasons where number = 1), id, highest_level, total_gold, kills,
       boss_kills, rebirths, max_combo, play_time_ms, achievements,
       coalesce((select jsonb_agg(key)
                   from jsonb_object_keys(coalesce(save_blob->'achievements', '{}'::jsonb)) as key),
                '[]'::jsonb),
       peak_dps, created_at, last_submit_at
from players
on conflict (season_id, player_id) do nothing;

-- rotace: spočti odměny za umístění, uzavři aktivní sezónu, otevři další.
-- Voláno z jednořádkové migrace na každý release. Žebříčky odměn (jediný zdroj
-- pravdy) žijí tady; chceš-li je změnit, uprav funkci pozdější migrací.
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

  update seasons set status = 'closed', closed_at = now() where id = active_id;
  insert into seasons (number, status) values (active_num + 1, 'active');
  return active_num + 1;
end;
$$ language plpgsql;
