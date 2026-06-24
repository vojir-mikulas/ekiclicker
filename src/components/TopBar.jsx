import { useEngineSelector, shallowEqual } from '../hooks/useEngine.js';
import { fmt } from '../game/format.js';
import { clickDamage, totalDps } from '../game/formulas.js';

const select = (s) => ({
  gold: Math.floor(s.gold),
  forgiveness: s.prestige.forgiveness,
  level: s.level,
  click: Math.floor(clickDamage(s)),
  dps: Math.floor(totalDps(s)),
});

export default function TopBar({ onOpenSettings }) {
  const { gold, forgiveness, level, click, dps } = useEngineSelector(select, shallowEqual);
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="currency gold">
          <span className="icon">🪙</span>
          <span className="txt">
            <span className="label">Peníze</span>
            <span className="value">{fmt(gold)}</span>
          </span>
        </div>
        <div className="currency dove">
          <span className="icon">🕊</span>
          <span className="txt">
            <span className="label">Odpuštění</span>
            <span className="value">{fmt(forgiveness)}</span>
          </span>
        </div>

        <div className="topbar-spacer" />

        <div className="stat"><span className="label">Úroveň</span><span className="value">{level}</span></div>
        <div className="stat"><span className="label">Úder</span><span className="value">{fmt(click)}</span></div>
        <div className="stat dps"><span className="label">DPS (auto)</span><span className="value">{fmt(dps)}</span></div>
        <button className="topbar-btn" onClick={onOpenSettings} title="Nastavení" aria-label="Nastavení">⚙️</button>
      </div>
    </div>
  );
}
