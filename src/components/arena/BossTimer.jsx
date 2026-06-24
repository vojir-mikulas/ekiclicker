import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';

// remain se počítá v selektoru → mění se každý snímek → bar plyne.
const select = (s) => {
  const e = s.enemy;
  if (!e || !e.deadline) return null;
  return { remain: Math.max(0, e.deadline - performance.now()), timeLimit: e.timeLimit };
};

export default function BossTimer() {
  const data = useEngineSelector(select, shallowEqual);
  if (!data) return null;
  const { remain, timeLimit } = data;
  const pct = Math.max(0, (remain / timeLimit) * 100);
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
