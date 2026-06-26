import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { VARIANTS, variantNameColors } from '../../game/data/variants.js';
import { fmt } from '../../game/format.js';

const select = (s) => {
  const v = s.enemy ? VARIANTS[s.enemy.variantId] : null;
  return {
    hp: s.enemy ? Math.max(0, s.enemy.hp) : 0,
    maxHp: s.enemy ? s.enemy.maxHp : 1,
    name: v ? v.name : '',
    tier: v ? v.tier : '',
    glow: v ? v.glow : '#9fd4f5',
  };
};

export default function HpBar() {
  const { hp, maxHp, name, tier, glow } = useEngineSelector(select, shallowEqual);
  const pct = Math.max(0, (hp / maxHp) * 100);
  // Nadpis i podtitul nesou barvu varianty (s ukotveným jasem → čitelnost).
  const c = variantNameColors(glow);
  return (
    <>
      <div className="enemy-name" style={{ '--ev': c.color, '--ev-lt': c.light }}>{name}</div>
      <div className="enemy-tier" style={{ color: c.color }}>{tier}</div>
      <div className="hpbar">
        <div className="hpfill" style={{ width: pct + '%' }} />
        <div className="hptext">{fmt(hp)} / {fmt(maxHp)}</div>
      </div>
    </>
  );
}
