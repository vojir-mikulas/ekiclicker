/* Banner sezóny — velký „SEZÓNA N" nadpis nad žebříčkem + pódium (top 3).
   U uzavřené sezóny je pódium síň vítězů (medaile zůstávají na profilu hráče),
   u aktivní ukazuje živé pořadí. Podium data: api.season(n) → { podium }.
   Meta (status/data) chodí propem z už načteného seznamu v Seasons.jsx —
   žádný duplicitní fetch seznamu. */
import { useState, useEffect } from 'react';
import { api } from '../../net/api.js';
import { fmt } from '../../game/format.js';
import { themeForSeason } from '../../game/data/seasonThemes.js';
import { PodiumSkeleton } from './Skeletons.jsx';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PLACE = { 1: 'Šampion', 2: '2. místo', 3: '3. místo' };

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('cs') : '';
}

export default function SeasonBanner({ season, onSelectPlayer }) {
  const number = season?.number;
  const isActive = season?.status === 'active';
  const [podium, setPodium] = useState(null);

  useEffect(() => {
    if (number == null) return undefined;
    let cancelled = false;
    setPodium(null);
    api.season(number)
      .then((res) => { if (!cancelled) setPodium(res.podium || []); })
      .catch(() => { if (!cancelled) setPodium([]); });
    return () => { cancelled = true; };
  }, [number]);

  if (number == null) return null;

  const theme = themeForSeason(number); // deterministická rotace podle čísla sezóny
  const byRank = (r) => (podium || []).find((p) => p.rank === r);
  const select = (id) => { if (id && onSelectPlayer) onSelectPlayer(id); };

  return (
    <div className={'season-banner' + (isActive ? ' live' : ' closed')}>
      <div className="sb-head">
        <span className="sb-kicker">{isActive ? '🟢 Probíhá' : '🏁 Uzavřená'}</span>
        <h1 className="sb-title">SEZÓNA {number}</h1>
        <span className="sb-sub">
          {isActive
            ? `Začala ${formatDate(season.startedAt)}`
            : `Uzavřená ${formatDate(season.closedAt)}`}
        </span>
      </div>

      {theme && (
        <div className="sb-theme" title={theme.blurb}>
          <span className="sb-theme-name">{theme.emoji} {theme.label}</span>
          <span className="sb-theme-perks">
            {theme.perks.map((p) => <span key={p} className="sb-perk">{p}</span>)}
          </span>
        </div>
      )}

      {podium == null && (
        <>
          <div className="sb-podium-label">{isActive ? 'Aktuální TOP 3' : 'Síň vítězů'}</div>
          <PodiumSkeleton />
        </>
      )}

      {podium && podium.length > 0 && (
        <>
          <div className="sb-podium-label">{isActive ? 'Aktuální TOP 3' : 'Síň vítězů'}</div>
          {/* zobrazovací pořadí 2–1–3: šampion uprostřed a výš */}
          <div className="podium">
            {[2, 1, 3].map((r) => {
              const e = byRank(r);
              if (!e) return null;
              return (
                <button
                  key={r}
                  className={'podium-spot rank-' + r + (e.id ? ' clickable' : '')}
                  onClick={() => select(e.id)}
                >
                  <span className="podium-medal">{MEDAL[r]}</span>
                  <span className="podium-nick">{e.nickname}</span>
                  <span className="podium-place">{PLACE[r]}</span>
                  <span className="podium-val">Lvl {fmt(e.value || 0)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
