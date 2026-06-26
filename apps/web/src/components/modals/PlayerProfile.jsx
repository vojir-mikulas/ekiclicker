/* Veřejný profil hráče — postup a úspěchy PO SEZÓNÁCH (+ celkový souhrn).
   Data z GET /api/players/:id; názvy úspěchů mapujeme přes lokální ACHIEVEMENTS. */
import { useState, useEffect, useMemo } from 'react';
import { SCORE_FIELDS, SCORE_LABELS, MAIL } from '@ekiclicker/shared';
import Modal from './Modal.jsx';
import { api } from '../../net/api.js';
import { accountErrorMessage } from '../../net/errors.js';
import { useAccount } from '../../hooks/useAccount.js';
import { useGuild } from '../../hooks/useGuild.js';
import { useMailbox } from '../../hooks/useMailbox.js';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from '../../game/data/achievements.js';
import { fmt, fmtDuration } from '../../game/format.js';

const MAIL_REASON = {
  no_target: 'Hráče nenašel.',
  self: 'Sám sobě psát nemůžeš. 🙂',
  rate: 'Posíláš moc zpráv — dej tomu chvíli.',
  flood: 'Tenhle hráč má od tebe moc nepřečtených zpráv.',
};
const INVITE_REASON = {
  no_target: 'Hráče nenašel.',
  target_in_guild: 'Hráč už je v cechu.',
  already_invited: 'Už jsi ho pozval(a).',
  forbidden: 'Na pozvání nemáš právo.',
  not_member: 'Nejsi v cechu.',
};

/* Akce nad cizím profilem: napsat zprávu (schránka) + (pro důstojníka) pozvat do cechu. */
function ProfileActions({ id, nickname }) {
  const account = useAccount();
  const guild = useGuild();
  const mailbox = useMailbox();
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');

  // jen u CIZÍCH profilů a jen když jsem připojen k žebříčku (schránka/cech je serverová věc)
  if (!account?.player || account.player.id === id) return null;

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setMsg('');
    const res = await mailbox.send({ recipientId: id, body: body.trim() });
    if (res?.ok) { setBody(''); setComposing(false); setMsg('✓ Zpráva odeslána.'); }
    else setMsg(MAIL_REASON[res?.reason] || res?.error || 'Zprávu se nepovedlo odeslat.');
  };

  const invite = async () => {
    setInviteMsg('');
    const res = await guild.invite({ playerId: id });
    setInviteMsg(res?.ok ? '✓ Pozvánka do cechu odeslána.' : (INVITE_REASON[res?.reason] || 'Pozvánku se nepovedlo odeslat.'));
  };

  return (
    <div className="profile-actions">
      <div className="profile-action-row">
        <button className="ghost-btn sm" onClick={() => { setComposing((c) => !c); setMsg(''); }}>
          {composing ? '✕ Zavřít' : '✉️ Napsat zprávu'}
        </button>
        {guild?.isOfficer && (
          <button className="ghost-btn sm" onClick={invite} disabled={guild.busy}>🛡️ Pozvat do cechu</button>
        )}
      </div>
      {inviteMsg && <p className="profile-action-msg">{inviteMsg}</p>}
      {composing && (
        <form className="mail-compose" onSubmit={sendMessage}>
          <textarea className="text-input mail-body-input" value={body} maxLength={MAIL.bodyMax} rows={3}
            onChange={(e) => { setBody(e.target.value); setMsg(''); }} placeholder={`Zpráva pro ${nickname}…`} />
          <div className="mail-compose-foot">
            <span className="mail-count">{body.length}/{MAIL.bodyMax}</span>
            <button className="primary-btn sm" type="submit" disabled={mailbox.busy || !body.trim()}>Odeslat</button>
          </div>
        </form>
      )}
      {msg && <p className="profile-action-msg">{msg}</p>}
    </div>
  );
}

function formatValue(field, value) {
  if (field === 'playTimeMs') return fmtDuration((value || 0) / 1000);
  return fmt(value || 0);
}

const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅');
const PLACE = { 1: 'Šampion', 2: '2. místo', 3: '3. místo' };

function StatGrid({ score }) {
  return (
    <div className="profile-statcol">
      {SCORE_FIELDS.map((f) => (
        <div key={f} className="ps-row">
          <span>{SCORE_LABELS[f]}</span>
          <b>{formatValue(f, score[f])}</b>
        </div>
      ))}
    </div>
  );
}

function AchGrid({ earned }) {
  const set = useMemo(() => new Set(earned), [earned]);
  return (
    <>
      <div className="ach-head">
        <p className="sub">Úspěchy</p>
        <span className="ach-progress">{set.size} / {ACHIEVEMENT_COUNT}</span>
      </div>
      <div className="ach-grid profile-ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const done = set.has(a.id);
          return (
            <div key={a.id} className={'ach ' + (done ? 'unlocked' : 'locked')}>
              <div className="ico">{done ? a.emoji : '🔒'}</div>
              <div className="body">
                <div className="name">{a.name}</div>
                <div className="desc">{a.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function PlayerProfile({ id, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(null); // číslo sezóny | 'all'

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(''); setTab(null);
    api.player(id)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // výchozí záložka: aktivní sezóna, jinak nejnovější, jinak souhrn
        const def = d.seasons.find((s) => s.number === d.activeSeason)
          || d.seasons[0];
        setTab(def ? def.number : 'all');
      })
      .catch((e) => { if (!cancelled) setError(accountErrorMessage(e)); });
    return () => { cancelled = true; };
  }, [id]);

  const isChampion = data?.trophies?.some((t) => t.rank === 1);
  // medaile = umístění do 3. místa (síň slávy); nižší umístění zůstávají drobné účastnické odznaky
  const medals = (data?.trophies || []).filter((t) => t.rank <= 3);
  const otherTrophies = (data?.trophies || []).filter((t) => t.rank > 3);
  const selected = data && tab !== 'all' ? data.seasons.find((s) => s.number === tab) : null;
  // souhrn úspěchů přes všechny sezóny (co kdy hráč získal)
  const allAch = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.seasons.flatMap((s) => s.achievements))];
  }, [data]);

  return (
    <Modal onClose={onClose} className="profile">
      {!data && !error && <div className="board-loading">Načítám profil…</div>}
      {error && <div className="board-empty">{error}</div>}

      {data && (
        <>
          <div className="profile-head">
            <h2 className="profile-name">{isChampion ? '👑 ' : ''}{data.nickname}</h2>
            <span className="profile-sub">
              Hráč od {new Date(data.createdAt).toLocaleDateString('cs')} · {data.rebirths} rebirthů
            </span>
          </div>

          <ProfileActions id={id} nickname={data.nickname} />

          {medals.length > 0 && (
            <div className="profile-medals">
              {medals.map((t) => (
                <div key={t.season} className={'medal rank-' + t.rank}>
                  <span className="m-emoji">{medal(t.rank)}</span>
                  <span className="m-place">{PLACE[t.rank]}</span>
                  <span className="m-season">Sezóna {t.season}</span>
                </div>
              ))}
            </div>
          )}

          {otherTrophies.length > 0 && (
            <div className="profile-trophies">
              {otherTrophies.map((t) => (
                <span key={t.season} className="trophy">
                  Sezóna {t.season} · #{t.rank}
                </span>
              ))}
            </div>
          )}

          <div className="segmented profile-tabs" role="tablist">
            {data.seasons.map((s) => (
              <button
                key={s.number}
                role="tab"
                aria-selected={tab === s.number}
                className={'seg' + (tab === s.number ? ' active' : '')}
                onClick={() => setTab(s.number)}
              >
                Sezóna {s.number}{s.number === data.activeSeason ? ' 🟢' : ''}
              </button>
            ))}
            <button
              role="tab"
              aria-selected={tab === 'all'}
              className={'seg' + (tab === 'all' ? ' active' : '')}
              onClick={() => setTab('all')}
            >Celkově</button>
          </div>

          {selected ? (
            <>
              <div className="profile-section-head">
                <h3>Sezóna {selected.number}</h3>
                {selected.rank != null && <span className="profile-rank">#{selected.rank}</span>}
                {selected.status === 'closed' && <span className="profile-tag">uzavřená</span>}
              </div>
              <StatGrid score={selected.score} />
              <AchGrid earned={selected.achievements} />
            </>
          ) : (
            <>
              <div className="profile-section-head">
                <h3>Celkový rekord</h3>
              </div>
              <StatGrid score={data.lifetime.score} />
              <AchGrid earned={allAch} />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
