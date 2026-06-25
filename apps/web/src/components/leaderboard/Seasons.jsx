/* Showcase sezón — pruh sezón (aktuální + minulé se šampiony) nad žebříčkem.
   Výběr sezóny přepíná, kterou sezónu Leaderboard zobrazuje. */
import { useState, useEffect } from 'react';
import { api } from '../../net/api.js';
import Leaderboard from './Leaderboard.jsx';

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('cs') : '';
}

export default function Seasons({ onJoin, onSelectPlayer }) {
  const [seasons, setSeasons] = useState(null);
  const [selected, setSelected] = useState(null); // číslo zvolené sezóny
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.seasons()
      .then((res) => {
        if (cancelled) return;
        const list = res.seasons || [];
        setSeasons(list);
        const active = list.find((s) => s.status === 'active');
        setSelected(active ? active.number : (list[0]?.number ?? null));
      })
      .catch(() => { if (!cancelled) setError('Sezóny se nepodařilo načíst.'); });
    return () => { cancelled = true; };
  }, []);

  const activeNumber = seasons?.find((s) => s.status === 'active')?.number ?? null;

  return (
    <div className="seasons">
      {seasons && seasons.length > 1 && (
        <div className="season-strip">
          {seasons.map((s) => (
            <button
              key={s.number}
              className={
                'season-chip' +
                (s.number === selected ? ' active' : '') +
                (s.status === 'active' ? ' live' : '')
              }
              onClick={() => setSelected(s.number)}
            >
              <span className="sc-name">Sezóna {s.number}</span>
              <span className="sc-meta">
                {s.status === 'active'
                  ? '🟢 Probíhá'
                  : s.champion
                    ? `👑 ${s.champion.nickname}`
                    : `Uzavřená ${formatDate(s.closedAt)}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="board-empty">{error}</div>}

      {selected != null && (
        <Leaderboard
          season={selected}
          active={activeNumber}
          onJoin={onJoin}
          onSelectPlayer={onSelectPlayer}
        />
      )}
    </div>
  );
}
