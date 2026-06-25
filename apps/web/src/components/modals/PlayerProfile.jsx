/* Veřejný profil hráče — postup a úspěchy PO SEZÓNÁCH (+ celkový souhrn).
   Data z GET /api/players/:id; názvy úspěchů mapujeme přes lokální ACHIEVEMENTS. */
import { useState, useEffect, useMemo } from 'react';
import { SCORE_FIELDS, SCORE_LABELS } from '@ekiclicker/shared';
import Modal from './Modal.jsx';
import { api } from '../../net/api.js';
import { accountErrorMessage } from '../../net/errors.js';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from '../../game/data/achievements.js';
import { fmt, fmtDuration } from '../../game/format.js';

function formatValue(field, value) {
  if (field === 'playTimeMs') return fmtDuration((value || 0) / 1000);
  return fmt(value || 0);
}

const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅');

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

          {data.trophies?.length > 0 && (
            <div className="profile-trophies">
              {data.trophies.map((t) => (
                <span key={t.season} className={'trophy' + (t.rank <= 3 ? ' top' : '')}>
                  {medal(t.rank)} Sezóna {t.season} · #{t.rank}
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
