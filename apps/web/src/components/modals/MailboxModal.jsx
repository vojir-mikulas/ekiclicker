/* 📬 Schránka — perzistentní asynchronní zprávy mezi hráči + doručené pozvánky
   do cechu (přijmout/odmítnout). Data tahá MailboxProvider (POST+poll, jako cech).
   Při otevření označí vše přečtené (shodí odznak), ale zvýraznění nepřečtených si
   během prohlížení udrží (ackAll je optimistický bez refetch). */
import { useState, useEffect, useRef } from 'react';
import { MAIL } from '@ekiclicker/shared';
import { useMailbox } from '../../hooks/useMailbox.js';
import Modal from './Modal.jsx';

function ago(at) {
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'teď';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

const SEND_REASON = {
  no_target: 'Hráče s touhle přezdívkou nenašel.',
  self: 'Sám sobě psát nemůžeš. 🙂',
  rate: 'Posíláš moc zpráv — dej tomu chvíli.',
  flood: 'Tenhle hráč má od tebe moc nepřečtených zpráv. Počkej, až je přečte.',
};
const INVITE_REASON = {
  gone: 'Pozvánka už není platná.',
  already_in_guild: 'Už jsi v cechu — nejdřív ho opusť.',
  full: 'Cech je plný.',
};

const NOTIF_SUPPORTED = typeof Notification !== 'undefined';

export default function MailboxModal({ onClose }) {
  const mb = useMailbox();
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [notice, setNotice] = useState('');
  // upozornění prohlížeče: souhlas se musí žádat z PŘÍMÉHO kliknutí (Safari je přísné)
  const [notifPerm, setNotifPerm] = useState(() => (NOTIF_SUPPORTED ? Notification.permission : 'unsupported'));

  const enableNotifs = async () => {
    try { setNotifPerm(await Notification.requestPermission()); } catch { /* ignoruj */ }
  };

  // při otevření: natáhni čerstvá data a označ vše přečtené (odznak zhasne)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => { await mb.refresh(); await mb.ackAll(); })();
  }, [mb]);

  const submit = async (e) => {
    e.preventDefault();
    if (!to.trim() || !body.trim()) return;
    setSendMsg('');
    const res = await mb.send({ nickname: to.trim(), subject: subject.trim() || undefined, body: body.trim() });
    if (res?.ok) {
      setTo(''); setSubject(''); setBody(''); setComposing(false);
      setNotice(`✓ Zpráva odeslána${res.to ? ` hráči ${res.to}` : ''}.`);
    } else {
      setSendMsg(SEND_REASON[res?.reason] || res?.error || 'Zprávu se nepovedlo odeslat.');
    }
  };

  const doRespond = async (id, accept) => {
    setNotice('');
    const res = await mb.respond(id, accept);
    if (accept) {
      if (res?.ok && res.joined) setNotice('🛡️ Vstoupil(a) jsi do cechu!');
      else if (!res?.ok) setNotice(INVITE_REASON[res?.reason] || 'Pozvánku se nepovedlo přijmout.');
    }
  };

  const messages = mb?.messages || [];

  return (
    <Modal onClose={onClose} className="mailbox">
      <h2>📬 Schránka</h2>

      <div className="mail-compose-bar">
        <button className="primary-btn sm" onClick={() => { setComposing((c) => !c); setSendMsg(''); }}>
          {composing ? '✕ Zavřít' : '✉️ Napsat zprávu'}
        </button>
        {notifPerm === 'default' && (
          <button className="ghost-btn sm" onClick={enableNotifs} title="Povolit upozornění prohlížeče na nové zprávy">
            🔔 Upozornění
          </button>
        )}
        {notifPerm === 'granted' && <span className="mail-hint">🔔 Upozornění zapnuta</span>}
        {!composing && notifPerm !== 'default' && <span className="mail-hint">Pošli vzkaz jinému hráči podle přezdívky.</span>}
      </div>

      {composing && (
        <form className="mail-compose" onSubmit={submit}>
          <input className="text-input" value={to} onChange={(e) => { setTo(e.target.value); setSendMsg(''); }}
            placeholder="Přezdívka příjemce…" maxLength={20} />
          <input className="text-input" value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="Předmět (nepovinné)…" maxLength={MAIL.subjectMax} />
          <textarea className="text-input mail-body-input" value={body} maxLength={MAIL.bodyMax} rows={3}
            onChange={(e) => { setBody(e.target.value); setSendMsg(''); }} placeholder="Tvoje zpráva…" />
          <div className="mail-compose-foot">
            <span className="mail-count">{body.length}/{MAIL.bodyMax}</span>
            <button className="primary-btn sm" type="submit" disabled={mb.busy || !to.trim() || !body.trim()}>Odeslat</button>
          </div>
          {sendMsg && <p className="form-error">{sendMsg}</p>}
        </form>
      )}

      {notice && <p className="mail-notice">{notice}</p>}

      <div className="mail-list">
        {!mb.loaded ? (
          <div className="board-loading">Načítám schránku…</div>
        ) : messages.length === 0 ? (
          <div className="board-empty">Schránka je prázdná. 📭</div>
        ) : (
          messages.map((m) => {
            const isInvite = m.kind === 'guild_invite';
            const open = isInvite && m.status === 'open';
            return (
              <div key={m.id} className={'mail-row' + (m.read ? '' : ' unread') + (isInvite ? ' invite' : '')}>
                <div className="mail-row-head">
                  <span className="mail-from">
                    {isInvite ? '🛡️ Pozvánka do cechu' : (m.from ? `✉️ ${m.from}` : '✉️ Systém')}
                  </span>
                  <span className="mail-time">{ago(m.createdAt)}</span>
                </div>

                {isInvite ? (
                  <div className="mail-text">
                    <b>[{m.guild?.tag}] {m.guild?.name}</b> tě zve do cechu{m.from ? ` · od ${m.from}` : ''}.
                  </div>
                ) : (
                  <div className="mail-body">
                    {m.subject && <div className="mail-subject">{m.subject}</div>}
                    <div className="mail-text">{m.body}</div>
                  </div>
                )}

                <div className="mail-actions">
                  {open ? (
                    <>
                      <button className="primary-btn sm" onClick={() => doRespond(m.id, true)} disabled={mb.busy}>Přijmout</button>
                      <button className="ghost-btn sm" onClick={() => doRespond(m.id, false)} disabled={mb.busy}>Odmítnout</button>
                    </>
                  ) : isInvite ? (
                    <span className="mail-status">
                      {m.status === 'accepted' ? '✓ Přijato' : m.status === 'declined' ? '✕ Odmítnuto' : '— Neplatné'}
                    </span>
                  ) : null}
                  <button className="ghost-btn sm mail-del" onClick={() => mb.remove(m.id)} disabled={mb.busy} title="Smazat zprávu" aria-label="Smazat">🗑️</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
