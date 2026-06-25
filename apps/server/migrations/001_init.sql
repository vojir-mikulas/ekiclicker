-- =========================================================================
-- 001_init — pgcrypto (gen_random_uuid) + tabulka hráčů.
-- =========================================================================
create extension if not exists pgcrypto;

create table if not exists players (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,        -- sha256(token); raw token NEUKLÁDÁME
  nickname        text not null,
  nickname_ci     text not null unique,        -- lower(nickname) pro case-insensitive unikátnost
  created_ip      text,
  last_ip         text,
  ip_history      jsonb not null default '[]',
  highest_level   int not null default 1,
  total_gold      numeric not null default 0,
  kills           bigint not null default 0,
  boss_kills      bigint not null default 0,
  rebirths        int not null default 0,
  max_combo       int not null default 0,
  play_time_ms    bigint not null default 0,
  achievements    int not null default 0,
  peak_dps        numeric not null default 0,
  save_blob       jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  renamed_at      timestamptz,
  last_submit_at  timestamptz
);

-- index pro per-IP denní strop nových účtů
create index if not exists players_created_ip_created_at_idx on players (created_ip, created_at);
