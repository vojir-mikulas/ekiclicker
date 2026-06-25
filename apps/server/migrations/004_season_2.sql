-- =========================================================================
-- 004_season_2 — otevření Sezóny 2.
--   Jednořádková release migrace: uzavře aktivní Sezónu 1, spočítá odměny za
--   umístění (season_rewards) a otevře Sezónu 2. Žebříčky odměn i celá logika
--   žijí v rotate_season() (002_seasons.sql). Hráči při dalším syncu projdou
--   gate → klient spustí reset (server-wide rebirth) a claimne odměnu.
-- =========================================================================
select rotate_season();
