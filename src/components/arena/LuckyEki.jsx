import { useEngineSelector, useEngine, shallowEqual } from '../../hooks/useEngine.js';
import { LUCKY } from '../../game/data/variants.js';

const select = (s) => (s.lucky ? { id: s.lucky.id, x: s.lucky.x, y: s.lucky.y } : null);

export default function LuckyEki() {
  const engine = useEngine();
  const lucky = useEngineSelector(select, shallowEqual);
  if (!lucky) return null;
  return (
    <button
      key={lucky.id}
      className="lucky-eki"
      style={{ left: lucky.x + '%', top: lucky.y + '%' }}
      title="Lucky Eki — klikni rychle!"
      onClick={(e) => {
        e.stopPropagation();
        engine.catchLucky();
      }}
    >
      {LUCKY.emoji}
    </button>
  );
}
