import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { UPGRADES, UPGRADE_KEYS } from '../../game/data/upgrades.js';
import { upgradeCostAt, buyBatch } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import ShopItem from './ShopItem.jsx';

const trigger = (s) => [s.gold, s.buyAmount, ...UPGRADE_KEYS.map((k) => s.upgrades[k])];

export default function UpgradeList() {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const s = engine.state;

  return (
    <div className="shop-scroll">
      {UPGRADE_KEYS.map((key) => {
        const u = UPGRADES[key];
        const lvl = s.upgrades[key];
        const maxed = u.max != null && lvl >= u.max;
        const cap = u.max != null ? u.max - lvl : Infinity;
        const batch = buyBatch(upgradeCostAt(s, key), s.gold, s.buyAmount, cap);
        const can = batch.count > 0 && s.gold >= batch.cost;
        const amt = batch.count > 1 ? `${batch.count}× ` : '';
        return (
          <ShopItem
            key={key}
            emoji={u.emoji}
            name={u.name}
            lvl={`Lv ${lvl}${u.max != null ? '/' + u.max : ''}`}
            meta={u.desc}
            cost={maxed ? 'MAX' : `${amt}${fmt(batch.cost)} 🪙`}
            costClass={can ? '' : 'locked'}
            disabled={!can}
            onClick={() => engine.buyUpgrade(key)}
          />
        );
      })}
    </div>
  );
}
