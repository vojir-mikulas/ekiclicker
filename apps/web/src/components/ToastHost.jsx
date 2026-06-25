import { useState, useCallback, useRef } from 'react';
import { useEngineEvent } from '../hooks/useEngine.js';
import { fmt } from '../game/format.js';
import { CHESTS, RARITIES } from '../game/data/items.js';

function rewardText(r) {
  const parts = [];
  if (r.dmg) parts.push(`+${Math.round((r.dmg - 1) * 100)}% poškození`);
  if (r.gold) parts.push(`+${Math.round((r.gold - 1) * 100)}% zlata`);
  if (r.forgiveness) parts.push(`+${r.forgiveness} 🕊`);
  return parts.join(' • ');
}

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((toast) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  useEngineEvent(
    useCallback(
      (type, payload) => {
        if (type === 'achievement') {
          push({
            ico: payload.emoji,
            title: `Úspěch: ${payload.name}`,
            sub: rewardText(payload.reward),
          });
        } else if (type === 'defeat' && payload.loot?.forgiveness) {
          push({
            ico: payload.archon ? '👁️' : payload.ultra ? '🌟' : '👑',
            title: payload.archon ? 'Poklad Eki Archóna!' : payload.ultra ? 'Poklad Eki Titána!' : 'Poklad Eki Krále!',
            sub: `+${payload.loot.forgiveness} 🕊 Odpuštění`,
          });
        } else if (type === 'chest' && payload.tier === 'archon') {
          push({
            ico: '👁️',
            title: 'Archónská truhla!',
            sub: 'Otevři ji ve Výbavě 🎒 — uvnitř je sada Věčný',
          });
        } else if (type === 'openAll') {
          const parts = Object.entries(payload.rarities).map(([r, n]) => `${n}× ${RARITIES[r]?.name || r}`);
          if (payload.misses) parts.push(`${payload.misses}× prázdná`);
          push({
            ico: CHESTS[payload.tier]?.emoji || '📦',
            title: `Otevřeno ${payload.count}× ${CHESTS[payload.tier]?.name || 'bedna'}`,
            sub: parts.join(' • ') || '—',
          });
        } else if (type === 'unlock' && payload.feature === 'pets') {
          push({
            ico: '🐾',
            title: 'Odemčeni mazlíčci!',
            sub: 'Z nepřátel teď padají vejce 🥚 — vylíhni si parťáka',
          });
        } else if (type === 'egg') {
          push({ ico: '🥚', title: 'Vejce!', sub: 'Vylíhni ho u Mazlíčků 🐾' });
        } else if (type === 'hatchAll') {
          const parts = [];
          if (payload.news.length) parts.push(`${payload.news.length}× nový`);
          const ups = Object.values(payload.levels).reduce((a, b) => a + b, 0);
          if (ups) parts.push(`${ups}× úroveň`);
          if (payload.dust) parts.push(`+${fmt(payload.dust)} 💠`);
          push({
            ico: '🥚',
            title: `Vylíhnuto ${payload.count}× vejce`,
            sub: parts.join(' • ') || '—',
          });
        } else if (type === 'questClaim') {
          push({
            ico: payload.emoji,
            title: 'Denní úkol splněn!',
            sub: `+${fmt(payload.gold)} 🪙 • +${payload.doves} 🕊`,
          });
        } else if (type === 'questAllDone') {
          push({
            ico: '🔥',
            title: `Všechny denní úkoly! Série ${payload.streak}`,
            sub: `Bonus +${payload.bonus} 🕊`,
          });
        }
      },
      [push]
    )
  );

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="ico">{t.ico}</span>
          <span className="txt">
            <span className="t-title">{t.title}</span>
            {t.sub && <span className="t-sub">{t.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
