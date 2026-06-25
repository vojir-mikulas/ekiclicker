-- =========================================================================
-- 005_world_boss_chests — odměna ze Světového bosse teď zahrnuje i „Dračí truhly".
--   • reward_chests — počet exkluzivních beden (sada Drakobijec) spočtený při
--     finalizaci bosse, vedle reward_doves / reward_dust. NULL dokud se boss
--     neuzavře (stejně jako doves/dust); staré uzavřené řádky → coalesce na 0.
-- Aditivní, idempotentní (add column if not exists) — bezpečné při bootu.
-- =========================================================================

alter table world_boss_contrib add column if not exists reward_chests int;
