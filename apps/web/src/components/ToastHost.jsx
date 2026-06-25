import { useState, useCallback, useRef } from 'react';
import { useEngineEvent } from '../hooks/useEngine.js';
import { fmt } from '../game/format.js';
import { CHESTS, RARITIES, affixLabel } from '../game/data/items.js';
import { albumBonusText } from '../game/data/album.js';
import { runeName, runeTierName } from '../game/data/runes.js';
import { ENCHANTS } from '../game/data/enchants.js';

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
        } else if (type === 'unlock' && payload.feature === 'inventory') {
          push({
            ico: '🎒',
            title: 'Odemčena výbava!',
            sub: 'Z nepřátel teď padají bedny s kořistí 💠 — vystroj se ve Výbavě',
          });
        } else if (type === 'unlock' && payload.feature === 'elixirs') {
          push({
            ico: '🧪',
            title: 'Odemčeny elixíry!',
            sub: 'V Obchodě je nová záložka 🧪 — kup a vypij dočasné buffy',
          });
        } else if (type === 'unlock' && payload.feature === 'pets') {
          push({
            ico: '🐾',
            title: 'Odemčeni mazlíčci!',
            sub: 'Z nepřátel teď padají vejce 🥚 — vylíhni si parťáka',
          });
        } else if (type === 'unlock' && payload.feature === 'runes') {
          push({
            ico: '🔣',
            title: 'Odemčeny runy & sokety!',
            sub: 'Z Archónů padají „Pivní tácky" — vsaď je do výbavy v 🔣 Runách',
          });
        } else if (type === 'rune' && !payload.crafted) {
          push({
            ico: '🔣',
            title: payload.full ? 'Sklad run je plný!' : 'Tácek!',
            sub: payload.full
              ? `Runa se rozpustila na +${fmt(payload.dust)} 💠 — uvolni místo v 🔣 Runách`
              : `${runeName(payload)} (${runeTierName(payload)}) — vsaď ho v 🔣 Runách`,
          });
        } else if (type === 'unlock' && payload.feature === 'enchanting') {
          push({
            ico: '✨',
            title: 'Odemčen zaklínací stůl!',
            sub: 'Ve Výbavě 🎒 zaklej kusy za zlato 💰 — tajemné runy, ještě lepší staty',
          });
        } else if (type === 'unlock' && payload.feature === 'mastery') {
          push({
            ico: '🔱',
            title: 'Odemčena Mistrovská mřížka!',
            sub: 'Úrovně nad 4000 sypou Mistrovské body 🔱 — investuj je do stromu',
          });
        } else if (type === 'enchant') {
          push({
            ico: ENCHANTS[payload.ench]?.emoji || '✨',
            title: `Zakleto: ${ENCHANTS[payload.ench]?.name || 'runa'}!`,
            sub: affixLabel({ stat: payload.stat, value: payload.value }) + (payload.maxed ? ' · kus je plně zaklet' : ''),
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
        } else if (type === 'albumMilestone') {
          push({
            ico: payload.emoji,
            title: `Deník: ${payload.name} — milník!`,
            sub: albumBonusText(payload.stats),
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
        } else if (type === 'worldBossReward') {
          const parts = [];
          if (payload.doves) parts.push(`+${payload.doves} 🕊`);
          if (payload.dust) parts.push(`+${fmt(payload.dust)} 💠`);
          if (payload.chests) parts.push(`+${payload.chests}× 🐉 Dračí truhla`);
          push({
            ico: '🐲',
            title: 'Odměna za světového bosse!',
            sub: parts.join(' • ') || '—',
          });
        } else if (type === 'raidLoot') {
          const parts = [];
          if (payload.gold) parts.push(`+${fmt(payload.gold)} 💰`);
          if (payload.doves) parts.push(`+${payload.doves} 🕊`);
          if (payload.dust) parts.push(`+${fmt(payload.dust)} 💠`);
          push({
            ico: '🏦',
            title: 'Lup z trezoru je v bezpečí!',
            sub: parts.join(' • ') || '—',
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
