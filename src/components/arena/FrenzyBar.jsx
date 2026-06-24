import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { CONFIG } from '../../game/config.js';

const select = (s) => ({
  active: s.frenzy.active,
  pct: s.frenzy.active ? 100 : Math.min(100, (s.frenzy.charge / CONFIG.frenzyClicksToFill) * 100),
});

export default function FrenzyBar() {
  const { active, pct } = useEngineSelector(select, shallowEqual);
  if (!active && pct <= 0) return null;
  return (
    <div className={'frenzy-bar' + (active ? ' active' : '')}>
      <span className="lbl">{active ? '😡 Zuřivost!' : 'Zuřivost'}</span>
      <div className="fill" style={{ width: pct + '%' }} />
    </div>
  );
}
