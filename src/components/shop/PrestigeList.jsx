import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { PRESTIGE, PRESTIGE_KEYS } from '../../game/data/prestige.js';
import { prestigeCost } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import ShopItem from './ShopItem.jsx';

const trigger = (s) => [s.prestige.forgiveness, s.prestige.rebirths, ...PRESTIGE_KEYS.map((k) => s.prestige[k])];

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
    </div>
  );
}
