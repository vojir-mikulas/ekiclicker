-- =========================================================================
-- 008_leaderboards — ARÉNA + PEKELNÝ VÝTAH žebříčky (rozšíření žebříčkové sekce).
--   • ARÉNA: hráčský Elo žebříček ze server-autoritativního raid_state.rating.
--            Data i index (raid_state_rank_idx na (season_id, rating desc)) UŽ
--            existují z 005_raids → tady není co přidat, jen je čteme.
--   • VÝTAH: KOLEKTIVNÍ cechový žebříček = součet hell_best_floor členů. Sloupec
--            guild_season.hell_floors UŽ existuje (007_guilds) jako cache; tato
--            migrace dodává per-hráče zdroj (hell_best_floor) + index pro řazení.
-- Filosofie beze změny: hell_best_floor je NEKLESAJÍCÍ v rámci sezóny (jako
-- ostatní SCORE_FIELDS) → teče stejnou monotonní/plausibility cestou; cechový
-- agregát je SERVEROVÝ součet atestovaných dat členů (žádná nová důvěryhodná plocha).
-- =========================================================================

-- lifetime rekord hloubky výtahu (players = celoživotní, GREATEST — nikdy neblokuje)
alter table players       add column if not exists hell_best_floor int not null default 0;
-- sezónní rekord hloubky (season_scores = sezónně-relativní, zdroj cechového součtu)
alter table season_scores add column if not exists hell_best_floor int not null default 0;

-- žebříček kolektivního postupu cechů ve výtahu (řazení dle součtu pater)
create index if not exists guild_season_hell_idx on guild_season (season_id, hell_floors desc);
