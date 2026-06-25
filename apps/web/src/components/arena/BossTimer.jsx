import { useEngine, useEngineFrame } from '../../hooks/useEngine.js';

export default function BossTimer() {
  useEngineFrame(); // překresli každý snímek → bar plyne
  const engine = useEngine();
  const e = engine.state.enemy;
  if (!e || !e.deadline) return null;

  const remain = Math.max(0, e.deadline - performance.now());
  const pct = Math.max(0, (remain / e.timeLimit) * 100);
  const danger = remain < 5000;
  return (
    <div className="boss-timer">
      <div
        className="boss-timer-fill"
        style={{
          width: pct + '%',
          background: danger
            ? 'linear-gradient(90deg,#ff3b47,#c81f2b)'
            : 'linear-gradient(90deg,#ffd23f,#ff8a2b)',
        }}
      />
      <div className="boss-timer-text">⏱ {(remain / 1000).toFixed(1)} s</div>
    </div>
  );
}
