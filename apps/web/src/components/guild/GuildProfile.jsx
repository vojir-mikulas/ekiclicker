/* Detail cizího cechu (klik na cech v prohlížeči): hlavička, MOTD, bonusy a roster
   s vyznačeným Mistrem (👑). Tlačítko „Požádat o vstup“ vede přes useGuild().request.
   Data tahá veřejný GET /api/guilds/:id (roster + master + perky, bez tokenů). */
import { useState, useEffect } from 'react';
import { GUILDS } from '@ekiclicker/shared';
import { useGuild } from '../../hooks/useGuild.js';
import { useAccount } from '../../hooks/useAccount.js';
import { useEngineSelector } from '../../hooks/useEngine.js';
import { fmt } from '../../game/format.js';
import { api } from '../../net/api.js';
import Modal from '../modals/Modal.jsx';

const selectLevel = (s) => s.highestLevel || 1;
const pct = (x) => `${Math.round((x || 0) * 100)} %`;
const roleBadge = (role) => (role === 'master' ? '👑 Mistr' : role === 'officer' ? '🎖️ Důstojník' : 'Člen');

export default function GuildProfile({ id, onClose, onSelectPlayer, requested = false, onRequest }) {
  const guild = useGuild();
  const account = useAccount();
  const myLevel = useEngineSelector(selectLevel);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null); setError('');
    api.guild(id)
      .then((res) => {
        if (!alive) return;
        if (res?.ok) setData(res.guild);
        else setError('Cech už neexistuje.');
      })
      .catch(() => { if (alive) setError('Cech se nepodařilo načíst.'); });
    return () => { alive = false; };
  }, [id]);

  const myId = account.player?.id;
  const myGuildId = guild.guild?.id || null;
  const isMember = !!data && myGuildId === data.id;
  const inOtherGuild = !!myGuildId && !isMember;
  const canJoin = myLevel >= GUILDS.joinLevel;
  const perks = data?.perks || { goldFind: 0, dustFind: 0, luck: 0, memberSlots: 0 };

  return (
    <Modal onClose={onClose} className="guild-profile">
      {!data && !error && <div className="board-loading">Načítám cech…</div>}
      {error && <div className="board-empty">{error}</div>}

      {data && (
        <>
          <div className="guild-header">
            <div className="guild-id">
              <span className="guild-tag big">[{data.tag}]</span>
              <span className="guild-name">{data.name}</span>
            </div>
            <div className="guild-header-meta">
              <span className="guild-pill">⭐ Úroveň {data.level || 1}</span>
              {data.rank && <span className="guild-pill">🏆 #{data.rank}</span>}
              <span className="guild-pill">👥 {data.memberCount}/{data.memberCap}</span>
            </div>
          </div>

          {data.motd && (
            <div className="guild-motd">
              <div className="guild-section-head">📣 Zpráva dne</div>
              <p className="guild-motd-text">{data.motd}</p>
            </div>
          )}

          <div className="guild-perks">
            <div className="guild-section-head">🎁 Bonusy cechu</div>
            <ul className="guild-perk-list">
              <li><span>🪙 Zlato</span><b>+{pct(perks.goldFind)}</b></li>
              <li><span>💠 Úlomky</span><b>+{pct(perks.dustFind)}</b></li>
              <li><span>🍀 Štěstí</span><b>+{pct(perks.luck)}</b></li>
            </ul>
          </div>

          <div className="guild-roster">
            <div className="guild-section-head">👥 Členové ({data.memberCount}/{data.memberCap})</div>
            {(data.roster || []).map((m) => (
              <div key={m.playerId} className={'guild-member' + (m.playerId === myId ? ' me' : '')}>
                <button className="guild-member-name" onClick={() => onSelectPlayer && onSelectPlayer(m.playerId)}>
                  {m.role === 'master' && <span className="crown">👑</span>}
                  {m.nickname}{m.playerId === myId && <span className="dim"> (ty)</span>}
                </button>
                <span className="guild-member-role">{roleBadge(m.role)}</span>
              </div>
            ))}
          </div>

          <div className="guild-profile-foot">
            {isMember ? (
              <p className="guild-foot">Tohle je tvůj cech. 🛡️</p>
            ) : inOtherGuild ? (
              <p className="guild-foot">Už jsi v jiném cechu — nejdřív ho opusť, pak můžeš požádat jinam.</p>
            ) : requested ? (
              <span className="guild-requested">✓ Žádost odeslána</span>
            ) : (
              <>
                <button className="primary-btn" onClick={() => onRequest && onRequest()}
                  disabled={!canJoin || guild.busy}
                  title={canJoin ? 'Požádat o vstup' : `Vstup od úrovně ${fmt(GUILDS.joinLevel)}`}>
                  Požádat o vstup
                </button>
                {!canJoin && <p className="guild-foot">Vstoupit do cechu můžeš od úrovně <b>{fmt(GUILDS.joinLevel)}</b> (teď {fmt(myLevel)}).</p>}
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
