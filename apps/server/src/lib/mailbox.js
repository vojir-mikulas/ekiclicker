/* =========================================================================
   Datová vrstva SCHRÁNKY — perzistentní asynchronní zprávy mezi hráči
   (text) + doručení cechovních pozvánek jako AKČNÍ zprávy (guild_invite).

   Klíčové vlastnosti (load-bearing):
     • IDENTITA jako u cechů PŘEŽÍVÁ sezónu — schránka se sezónou neresetuje.
     • Žádná nová důvěryhodná plocha: text je BOUNDED (validateMailBody) +
       RATE-LIMITED (per-odesílatel okno) + ANTI-FLOOD (strop nepřečtených od
       jednoho odesílatele). Pozvánky NEDRŽÍ vlastní logiku vstupu — delegují
       na guilds.respondInvite() (tentýž atomický join jako záložka cechu).
     • guild_invite zprávy se při čtení RECONCILUJÍ proti živému guild_invites
       (přijetí/odmítnutí jinde — třeba v záložce cechu — se promítne sem).
   ========================================================================= */
import { MAIL, validateMailBody, validateMailSubject } from '@ekiclicker/shared';
import { query } from '../db.js';
import { findPlayerByNickname, respondInvite } from './guilds.js';

/* Řádek mail → veřejný tvar (camelCase, bez interních sloupců). */
function shapeRow(r) {
  const isInvite = r.kind === 'guild_invite';
  const payload = r.payload || {};
  return {
    id: r.id,
    kind: r.kind,
    fromId: r.sender_id || null,
    from: r.from_nick || null,          // null = systém / smazaný účet
    subject: r.subject || '',
    body: r.body || '',
    status: r.status,                   // 'open' | 'accepted' | 'declined' | 'gone'
    read: !!r.read_at,
    createdAt: r.created_at,
    guild: isInvite
      ? { id: payload.guildId || null, name: r.guild_name || payload.guildName || '', tag: r.guild_tag || payload.guildTag || '' }
      : null,
  };
}

/* Promítni do schránky výsledek pozvánky vyřízené JINDE (záložka cechu, disband…):
   guild_invite zprávy se statusem 'open', jejichž živá pozvánka už není pending. */
async function reconcileInvites(playerId) {
  try {
    await query(
      `update mail m
          set status = case gi.status when 'accepted' then 'accepted' else 'declined' end
         from guild_invites gi
        where m.recipient_id = $1 and m.kind = 'guild_invite' and m.status = 'open'
          and gi.id = (m.payload->>'inviteId')::uuid and gi.status <> 'pending'`,
      [playerId],
    );
  } catch { /* best-effort — reconcile nikdy neblokuje čtení schránky */ }
}

/* Prořež schránku příjemce na MAIL.inboxCap — maže jen PŘEČTENÉ řádky za stropem
   (nepřečtené ani čekající pozvánky nikdy nemizí). Best-effort. */
async function pruneInbox(recipientId) {
  try {
    await query(
      `delete from mail
        where recipient_id = $1 and read_at is not null
          and id in (
            select id from mail where recipient_id = $1
             order by created_at desc offset $2
          )`,
      [recipientId, MAIL.inboxCap],
    );
  } catch { /* best-effort */ }
}

/* Schránka hráče: zprávy (nejnovější první) + počet nepřečtených AKČNÍCH. */
export async function getInbox(playerId) {
  await reconcileInvites(playerId);
  const { rows } = await query(
    `select m.*, ps.nickname as from_nick, g.name as guild_name, g.tag as guild_tag
       from mail m
       left join players ps on ps.id = m.sender_id
       left join guilds  g  on m.kind = 'guild_invite' and g.id = (m.payload->>'guildId')::uuid
      where m.recipient_id = $1
      order by m.created_at desc
      limit $2`,
    [playerId, MAIL.inboxCap],
  );
  const messages = rows.map(shapeRow);
  // odznak: nepřečtené, které ještě čekají na pozornost (vyřízené pozvánky se nepočítají)
  const unread = messages.filter((m) => !m.read && m.status === 'open').length;
  return { ok: true, messages, unread };
}

/* Pošli textovou zprávu. Příjemce podle id nebo přezdívky; bounded + rate-limited.
   Vrací { ok } | { ok:false, reason, error? }. */
export async function send(sender, opts = {}, nowMs = Date.now()) {
  const vb = validateMailBody(opts.body);
  if (!vb.ok) return { ok: false, reason: 'body', error: vb.error };
  const vs = validateMailSubject(opts.subject);
  if (!vs.ok) return { ok: false, reason: 'subject', error: vs.error };

  // vyřeš příjemce
  let recipient = null;
  if (opts.recipientId) {
    const { rows } = await query('select id, nickname from players where id = $1', [String(opts.recipientId)]);
    recipient = rows[0] || null;
  } else if (opts.nickname) {
    recipient = await findPlayerByNickname(opts.nickname);
  }
  if (!recipient) return { ok: false, reason: 'no_target' };
  if (recipient.id === sender.id) return { ok: false, reason: 'self' };

  // rate-limit odesílatele (rolling okno) — proti spamu
  const since = new Date(nowMs - MAIL.sendWindowMs);
  const sent = await query(
    `select count(*)::int as c from mail where sender_id = $1 and kind = 'text' and created_at > $2`,
    [sender.id, since],
  );
  if ((sent.rows[0]?.c ?? 0) >= MAIL.sendPerWindow) return { ok: false, reason: 'rate' };

  // anti-flood: kolik NEPŘEČTENÝCH textovek už u příjemce leží od TOHOTO odesílatele
  const flood = await query(
    `select count(*)::int as c from mail
      where recipient_id = $1 and sender_id = $2 and kind = 'text' and read_at is null`,
    [recipient.id, sender.id],
  );
  if ((flood.rows[0]?.c ?? 0) >= MAIL.maxUnreadFromSender) return { ok: false, reason: 'flood' };

  await query(
    `insert into mail (recipient_id, sender_id, kind, subject, body) values ($1, $2, 'text', $3, $4)`,
    [recipient.id, sender.id, vs.value, vb.value],
  );
  await pruneInbox(recipient.id);
  return { ok: true, to: recipient.nickname };
}

/* Označ jednu zprávu přečtenou (jen vlastní). */
export async function markRead(playerId, mailId) {
  await query('update mail set read_at = now() where id = $1 and recipient_id = $2 and read_at is null', [mailId, playerId]);
  return { ok: true };
}

/* Označ vše přečtené (shodí odznak — zrcadlí raidAck). */
export async function ackAll(playerId) {
  await query('update mail set read_at = now() where recipient_id = $1 and read_at is null', [playerId]);
  return { ok: true };
}

/* Odpověz na cechovní pozvánku ve schránce — deleguje na guilds.respondInvite
   (tentýž atomický vstup). Po vyřízení promítne status do zprávy. */
export async function respond(playerId, mailId, accept) {
  const { rows } = await query(
    `select * from mail where id = $1 and recipient_id = $2 and kind = 'guild_invite'`,
    [mailId, playerId],
  );
  const m = rows[0];
  if (!m) return { ok: false, reason: 'gone' };
  const inviteId = m.payload?.inviteId;
  if (!inviteId) return { ok: false, reason: 'gone' };

  const res = await respondInvite(inviteId, playerId, accept);
  // status zprávy: přijato/odmítnuto pevně; při 'gone' (pozvánka zmizela) označ vyřízené.
  // ostatní neúspěch (full/already) NECHÁ 'open' → hráč může reagovat jinak.
  let newStatus = null;
  if (!accept) newStatus = 'declined';
  else if (res.ok) newStatus = 'accepted';
  else if (res.reason === 'gone') newStatus = 'gone';
  if (newStatus) {
    await query('update mail set status = $2, read_at = coalesce(read_at, now()) where id = $1', [mailId, newStatus]);
  }
  return res;
}

/* Smaž zprávu ze schránky (jen vlastní). */
export async function remove(playerId, mailId) {
  await query('delete from mail where id = $1 and recipient_id = $2', [mailId, playerId]);
  return { ok: true };
}
