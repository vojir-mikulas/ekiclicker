-- =========================================================================
-- 009_guild_treasury — CECHOVNÍ POKLADNICE: členové „přilévají" do společné kasy,
--   Mistr za ni kupuje bounded vylepšení (gold/dust/luck/sloty — žádný dmgPct).
--   Vše SEZÓNNĚ resetované (žije na guild_season jako zbytek postavení) → nová
--   sezóna = čistá kasa, jako celý full-reset model sezón.
--
-- Anti-cheat: členský PŘÍSPĚVEK do kasy je serverem CAPNUTÝ denním stropem dle
--   ATESTOVANÉ úrovně (donationDailyCap) — klient utratí zlato lokálně (jako
--   zakládací poplatek), ale server připíše jen `min(žádané, zbytek denního stropu)`.
--   Cheater s editovaným zlatem tak nepřekročí strop legitimního hráče své úrovně;
--   navíc vylepšení nesou jen bounded perky mimo difficultyScale → nulový dopad na
--   obtížnost i žebříček (ten řadí dál podle atestovaného `contribution`).
-- =========================================================================

-- kasa + zakoupené úrovně vylepšení (jsonb {goldFind,dustFind,luck,slots}) na cech/sezónu
alter table guild_season add column if not exists treasury numeric not null default 0;
alter table guild_season add column if not exists upgrades jsonb   not null default '{}'::jsonb;

-- per-člen, per-sezóna: kolik už přispěl celkem (display/feed) + denní strop (rolling dle data)
alter table guild_member_season add column if not exists donated_total numeric not null default 0;
alter table guild_member_season add column if not exists donated_today int     not null default 0;
alter table guild_member_season add column if not exists donate_day    date;
