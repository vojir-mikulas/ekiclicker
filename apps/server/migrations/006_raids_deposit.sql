-- =========================================================================
-- 006_raids_deposit — „daň do trezoru" + cooldown výběru.
--   • deposit_at  — kdy se naposled strhla daň (server-gated cadence, anti-spam).
--   • withdraw_at — kdy hráč naposled vybral trezor (výběr jen 1× za pár hodin).
-- Vault sloupce (vault_gold/doves/dust) už existují z 005_raids.
-- =========================================================================
alter table raid_state add column if not exists deposit_at  timestamptz;
alter table raid_state add column if not exists withdraw_at timestamptz;
