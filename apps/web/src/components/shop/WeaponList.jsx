import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { WEAPONS } from '../../game/data/weapons.js';
import { weaponCostAt, buyBatch, weaponDps, weaponShotDamage } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import ShopItem from './ShopItem.jsx';

const trigger = (s) => [
  s.gold, s.buyAmount, s.level, s.upgrades.power, s.prestige.rage, s.frenzy.active,
  ...WEAPONS.map((w) => s.weapons[w.id]),
];

export default function WeaponList() {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const s = engine.state;

  return (
    <div className="shop-scroll">
      {WEAPONS.map((w) => {
        const count = s.weapons[w.id] || 0;
        const owned = count > 0;
        const locked = s.level < w.unlock;
        const batch = buyBatch(weaponCostAt(s, w), s.gold, s.buyAmount);
        const can = !locked && batch.count > 0 && s.gold >= batch.cost;
        const amt = batch.count > 1 ? `${batch.count}× ` : '';
        const dps = owned ? weaponDps(s, w) : 0;
        const meta = locked
          ? `🔒 Odemkne se na úrovni ${w.unlock}`
          : owned
            ? `zásah ${fmt(weaponShotDamage(s, w))} • ~${fmt(dps)} DPS • ${count}×`
            : 'automatická zbraň';
        return (
          <ShopItem
            key={w.id}
            emoji={w.emoji}
            name={w.name}
            lvl={owned ? `×${count}` : null}
            meta={meta}
            cost={locked ? `Lv ${w.unlock}` : `${owned ? '' : 'Koupit '}${amt}${fmt(batch.cost)} 🪙`}
            costClass={can ? '' : 'locked'}
            disabled={!can}
            equipped={owned}
            locked={locked}
            onClick={() => engine.buyWeapon(w.id)}
          />
        );
      })}
    </div>
  );
}
