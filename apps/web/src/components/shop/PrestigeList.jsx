import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { PRESTIGE, PRESTIGE_KEYS, CAPSTONES, CAPSTONE_KEYS } from '../../game/data/prestige.js';
import { prestigeCost } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import ShopItem from './ShopItem.jsx';

const trigger = (s) => [
  s.prestige.forgiveness, s.prestige.rebirths,
  ...PRESTIGE_KEYS.map((k) => s.prestige[k]),
  ...CAPSTONE_KEYS.map((k) => s.prestige[k] || 0),
];

export default function PrestigeList() {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const s = engine.state;

  return (
    <div id="prestigePanel">
      <p className="sub">
        Rebirth: {s.prestige.rebirths} × • Odpuštění: {fmt(s.prestige.forgiveness)} 🕊
      </p>
      {PRESTIGE_KEYS.map((key) => {
        const p = PRESTIGE[key];
        const lvl = s.prestige[key];
        const cost = prestigeCost(key, lvl);
        const can = s.prestige.forgiveness >= cost;
        return (
          <ShopItem
            key={key}
            emoji={p.emoji}
            name={p.name}
            lvl={`Lv ${lvl}`}
            lvlColor="#c0a8ff"
            meta={p.desc}
            cost={`${fmt(cost)} 🕊`}
            costClass="dove"
            disabled={!can}
            onClick={() => engine.buyPrestige(key)}
          />
        );
      })}

      <p className="sub capstone-head">⭐ Mistrovství — odemkne se hlubokou investicí</p>
      {CAPSTONE_KEYS.map((key) => {
        const c = CAPSTONES[key];
        const lvl = s.prestige[key] || 0;
        const parentLvl = s.prestige[c.unlock.key] || 0;
        const unlocked = parentLvl >= c.unlock.level;
        const maxed = lvl >= c.max;
        const cost = prestigeCost(key, lvl);
        const can = unlocked && !maxed && s.prestige.forgiveness >= cost;
        const reqName = PRESTIGE[c.unlock.key].name;
        return (
          <ShopItem
            key={key}
            emoji={c.emoji}
            name={c.name}
            lvl={maxed ? 'MAX' : `Lv ${lvl}/${c.max}`}
            lvlColor={unlocked ? '#ffd86b' : '#7a7f95'}
            meta={unlocked ? c.desc : `🔒 Vyžaduje ${reqName} Lv ${c.unlock.level} (máš ${parentLvl})`}
            cost={maxed ? '✓' : unlocked ? `${fmt(cost)} 🕊` : '🔒'}
            costClass="dove"
            locked={!unlocked}
            disabled={!can}
            onClick={() => engine.buyPrestige(key)}
          />
        );
      })}
    </div>
  );
}
