-- =========================================================================
-- 008_mailbox — SCHRÁNKA: perzistentní asynchronní zprávy mezi hráči.
--   • text         — volná zpráva hráč→hráč (bounded délka, rate-limited).
--   • guild_invite — zrcadlo řádku guild_invites doručené jako AKČNÍ zpráva
--                    (přijmout/odmítnout deleguje na lib/guilds.respondInvite).
--   • system       — rezervováno pro budoucí servrové oznámení.
-- IDENTITA jako u cechů PŘEŽÍVÁ sezónu (rotate_season se schránky nedotýká).
-- Žádná nová důvěryhodná plocha: text je bounded + rate-limited, akční pozvánky
-- vyřizuje existující atomický vstup do cechu. Bez cronu, bez realtime (POST+poll).
-- =========================================================================

create table if not exists mail (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references players(id) on delete cascade,        -- komu (mazání účtu smaže schránku)
  sender_id     uuid references players(id) on delete set null,                -- od koho; null = systém / smazaný účet
  kind          text not null default 'text',                                  -- 'text' | 'guild_invite' | 'system'
  subject       text not null default '',                                      -- volitelný předmět (bounded)
  body          text not null default '',                                      -- tělo zprávy (bounded; u pozvánky prázdné)
  payload       jsonb not null default '{}',                                   -- u guild_invite: { inviteId, guildId, guildName, guildTag }
  status        text not null default 'open',                                  -- 'open' | 'accepted' | 'declined' | 'gone'
  read_at       timestamptz,                                                   -- null = nepřečteno (řídí odznak)
  created_at    timestamptz not null default now()
);

-- výpis schránky (nejnovější první) + rychlý odznak nepřečtených
create index if not exists mail_recipient_idx on mail (recipient_id, created_at desc);
create index if not exists mail_unread_idx on mail (recipient_id) where read_at is null;
-- reconcile guild_invite zpráv proti živé pozvánce (přijata/odmítnuta jinde)
create index if not exists mail_invite_idx on mail ((payload->>'inviteId')) where kind = 'guild_invite';
