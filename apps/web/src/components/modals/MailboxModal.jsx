/* 📬 Schránka — perzistentní zprávy mezi hráči + doručené pozvánky do cechu,
   jako PLNÁ STRÁNKA s e-mailovým rozložením (seznam vlevo | čtení vpravo).
   Data tahá MailboxProvider (SSE push + poll). Otevření zprávy ji označí přečtenou
   (per-zpráva, jako e-mail). Na úzkém displeji se panely přepínají (← Zpět). */
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

const preview = (s) => String(s || '').replace(/\s+/g, ' ').trim();

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

/* ---------- pravý panel: čtení zprávy ---------- */
function ReadView({ m, busy, onBack, onRespond, onReply, onDelete, notice }) {
  const isInvite = m.kind === 'guild_invite';
  const open = isInvite && m.status === 'open';
  return (
    <div className="mail-read">
      <button className="ghost-btn sm mail-back" onClick={onBack}>← Zpět na seznam</button>
      <div className="mail-read-head">
        <h3 className="mail-read-subject">
          {isInvite ? `🛡️ Pozvánka do cechu${m.guild?.tag ? ` [${m.guild.tag}]` : ''}` : (m.subject || '(bez předmětu)')}
        </h3>
        <div className="mail-read-meta">
          <span className="mail-read-from">{m.from ? `Od ${m.from}` : 'Systém'}</span>
          <span className="mail-read-time">{new Date(m.createdAt).toLocaleString('cs')}</span>
        </div>
      </div>

      <div className="mail-read-body">
        {isInvite ? (
          <p><b>[{m.guild?.tag}] {m.guild?.name}</b> tě zve do cechu. Přijetím vstoupíš do tohoto cechu (jeden cech na hráče).</p>
        ) : (
          <p className="mail-read-text">{m.body}</p>
        )}
      </div>

      {notice && <p className="mail-notice">{notice}</p>}

      <div className="mail-read-actions">
        {open && (
          <>
            <button className="primary-btn sm" onClick={() => onRespond(m.id, true)} disabled={busy}>Přijmout</button>
            <button className="ghost-btn sm" onClick={() => onRespond(m.id, false)} disabled={busy}>Odmítnout</button>
          </>
        )}
        {isInvite && !open && (
          <span className="mail-status">{m.status === 'accepted' ? '✓ Přijato' : m.status === 'declined' ? '✕ Odmítnuto' : '— Neplatné'}</span>
        )}
        {!isInvite && m.from && (
          <button className="ghost-btn sm" onClick={() => onReply(m)} disabled={busy}>↩️ Odpovědět</button>
        )}
        <button className="ghost-btn sm danger mail-del" onClick={() => onDelete(m.id)} disabled={busy}>🗑️ Smazat</button>
      </div>
    </div>
  );
}

/* ---------- pravý panel: nová zpráva ---------- */
function ComposeView({ to, setTo, subject, setSubject, body, setBody, sendMsg, setSendMsg, busy, onSubmit, onBack }) {
  return (
    <form className="mail-compose" onSubmit={onSubmit}>
      <button type="button" className="ghost-btn sm mail-back" onClick={onBack}>← Zpět na seznam</button>
      <h3 className="mail-read-subject">✉️ Nová zpráva</h3>
      <input className="text-input" value={to} onChange={(e) => { setTo(e.target.value); setSendMsg(''); }}
        placeholder="Přezdívka příjemce…" maxLength={20} />
      <input className="text-input" value={subject} onChange={(e) => setSubject(e.target.value)}
        placeholder="Předmět (nepovinné)…" maxLength={MAIL.subjectMax} />
      <textarea className="text-input mail-body-input" value={body} maxLength={MAIL.bodyMax} rows={8}
        onChange={(e) => { setBody(e.target.value); setSendMsg(''); }} placeholder="Tvoje zpráva…" />
      <div className="mail-compose-foot">
        <span className="mail-count">{body.length}/{MAIL.bodyMax}</span>
        <button className="primary-btn sm" type="submit" disabled={busy || !to.trim() || !body.trim()}>Odeslat</button>
      </div>
      {sendMsg && <p className="form-error">{sendMsg}</p>}
    </form>
  );
}

export default function MailboxModal({ onClose }) {
  const mb = useMailbox();
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [notifPerm, setNotifPerm] = useState(() => (NOTIF_SUPPORTED ? Notification.permission : 'unsupported'));

  // při otevření jen natáhni čerstvá data (NEoznačujeme vše přečtené — to dělá až
  // otevření konkrétní zprávy, jako e-mail)
  const didInit = useRef(false);
  useEffect(() => { if (didInit.current) return; didInit.current = true; void mb.refresh(); }, [mb]);

  const enableNotifs = async () => {
    try { setNotifPerm(await Notification.requestPermission()); } catch { /* ignoruj */ }
  };

  const messages = mb?.messages || [];
  const selected = messages.find((m) => m.id === selectedId) || null;
  const detail = composing || !!selected; // úzký displej: který panel ukázat

  const openMessage = (m) => {
    setComposing(false);
    setNotice('');
    setSelectedId(m.id);
    if (!m.read) mb.markRead(m.id);
  };

  const startCompose = (prefillTo = '', prefillSubject = '') => {
    setSelectedId(null);
    setNotice('');
    setSendMsg('');
    setTo(prefillTo);
    setSubject(prefillSubject);
    setBody('');
    setComposing(true);
  };

  const backToList = () => { setComposing(false); setSelectedId(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!to.trim() || !body.trim()) return;
    setSendMsg('');
    const res = await mb.send({ nickname: to.trim(), subject: subject.trim() || undefined, body: body.trim() });
    if (res?.ok) {
      setComposing(false);
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

  const doDelete = async (id) => {
    await mb.remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const reply = (m) => startCompose(m.from || '', m.subject ? (m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`) : '');

  return (
    <Modal onClose={onClose} className="mailbox-modal">
      <div className="mail-app">
        <header className="mail-app-head">
          <h2>📬 Schránka{mb.unread > 0 && <span className="mail-unread-pill">{mb.unread}</span>}</h2>
          <div className="mail-head-actions">
            {notifPerm === 'default' && (
              <button className="ghost-btn sm" onClick={enableNotifs} title="Povolit upozornění prohlížeče na nové zprávy">🔔 Upozornění</button>
            )}
            {notifPerm === 'granted' && <span className="mail-hint">🔔 zapnuta</span>}
            {mb.unread > 0 && <button className="ghost-btn sm" onClick={() => mb.ackAll()}>Označit vše přečtené</button>}
            <button className="primary-btn sm" onClick={() => startCompose()}>✉️ Napsat</button>
          </div>
        </header>

        <div className={'mail-shell' + (detail ? ' detail' : '')}>
          <aside className="mail-list-pane">
            {!mb.loaded ? (
              <div className="board-loading">Načítám schránku…</div>
            ) : messages.length === 0 ? (
              <div className="board-empty">Schránka je prázdná. 📭</div>
            ) : (
              messages.map((m) => {
                const isInvite = m.kind === 'guild_invite';
                const sub = isInvite
                  ? `${m.guild?.name || 'Cech'} tě zve do cechu`
                  : (preview(m.subject) || preview(m.body) || '(prázdná zpráva)');
                return (
                  <button key={m.id}
                    className={'mail-item' + (m.id === selectedId ? ' active' : '') + (m.read ? '' : ' unread') + (isInvite ? ' invite' : '')}
                    onClick={() => openMessage(m)}>
                    <span className="mail-item-ico">{isInvite ? '🛡️' : '✉️'}</span>
                    <span className="mail-item-main">
                      <span className="mail-item-top">
                        <span className="mail-item-from">
                          {isInvite ? `Pozvánka${m.guild?.tag ? ` [${m.guild.tag}]` : ''}` : (m.from || 'Systém')}
                        </span>
                        <span className="mail-item-time">{ago(m.createdAt)}</span>
                      </span>
                      <span className="mail-item-sub">{sub}</span>
                    </span>
                    {!m.read && <span className="mail-item-dot" aria-label="nepřečteno" />}
                  </button>
                );
              })
            )}
          </aside>

          <section className="mail-read-pane">
            {composing ? (
              <ComposeView
                to={to} setTo={setTo} subject={subject} setSubject={setSubject}
                body={body} setBody={setBody} sendMsg={sendMsg} setSendMsg={setSendMsg}
                busy={mb.busy} onSubmit={submit} onBack={backToList}
              />
            ) : selected ? (
              <ReadView m={selected} busy={mb.busy} notice={notice}
                onBack={backToList} onRespond={doRespond} onReply={reply} onDelete={doDelete} />
            ) : (
              <div className="mail-empty-read">
                <div className="mail-empty-ico">📬</div>
                <p>{notice || 'Vyber zprávu ze seznamu, nebo napiš novou.'}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
