import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { WEAPONS } from '../../game/data/weapons.js';
import { MULT } from '../../game/config.js';
import { weaponCostAt, buyBatch, weaponDps, weaponShotDamage, arsenalSynergyMult, arsenalSynergyTiers } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import ShopItem from './ShopItem.jsx';

const trigger = (s) => [
  s.gold, s.buyAmount, s.level, s.upgrades.power, s.prestige.rage, s.frenzy.active,
  ...WEAPONS.map((w) => s.weapons[w.id]),
];

const MS = MULT.weaponMilestone;

export default function WeaponList() {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const s = engine.state;
  const synergyPct = Math.round((arsenalSynergyMult(s) - 1) * 100);
  const tiers = arsenalSynergyTiers(s);

  return (
    <div className="shop-scroll">
      <div className="synergy-banner">
        🔗 Arzenálová synergie <b>+{synergyPct} %</b> ke všem zbraním
        <span className="synergy-hint">
          {' '}— každých {MS} kusů jakékoliv zbraně dá +{Math.round(MULT.arsenalSynergyPerTier * 100)} % (do {MULT.arsenalSynergyTierCap}× na zbraň){tiers ? ` • ${tiers}× milník` : ''}
        </span>
      </div>
      {WEAPONS.map((w) => {
        const count = s.weapons[w.id] || 0;
        const owned = count > 0;
        const locked = s.level < w.unlock;
        const batch = buyBatch(weaponCostAt(s, w), s.gold, s.buyAmount);
        const can = !locked && batch.count > 0 && s.gold >= batch.cost;
        const amt = batch.count > 1 ? `${batch.count}× ` : '';
        const dps = owned ? weaponDps(s, w) : 0;
        // kolik kusů do dalšího milníku (×2 poškození + tier synergie, dokud pod stropem)
        const toMilestone = MS - (count % MS);
        const synergyOpen = Math.floor(count / MS) < MULT.arsenalSynergyTierCap;
        const meta = locked
          ? `🔒 Odemkne se na úrovni ${w.unlock}`
          : owned
            ? `zásah ${fmt(weaponShotDamage(s, w))} • ~${fmt(dps)} DPS • ${count}× • ${synergyOpen ? '🔗 ' : ''}milník za ${toMilestone}`
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
