import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { VARIANTS } from '../../game/data/variants.js';
import { fmt } from '../../game/format.js';

const select = (s) => ({
  hp: s.enemy ? Math.max(0, s.enemy.hp) : 0,
  maxHp: s.enemy ? s.enemy.maxHp : 1,
  name: s.enemy ? VARIANTS[s.enemy.variantId].name : '',
  tier: s.enemy ? VARIANTS[s.enemy.variantId].tier : '',
});

export default function HpBar() {
  const { hp, maxHp, name, tier } = useEngineSelector(select, shallowEqual);
  const pct = Math.max(0, (hp / maxHp) * 100);
  return (
    <>
      <div className="enemy-name">{name}</div>
      <div className="enemy-tier">{tier}</div>
      <div className="hpbar">
        <div className="hpfill" style={{ width: pct + '%' }} />
        <div className="hptext">{fmt(hp)} / {fmt(maxHp)}</div>
      </div>
    </>
  );
}
