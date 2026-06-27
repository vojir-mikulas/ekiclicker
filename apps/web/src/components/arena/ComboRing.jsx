import { useEngineSelector, useEngine, shallowEqual } from '../../hooks/useEngine.js';

// Boxovací kruh ⭕ — prázdný prsten; cvaknutí spustí knockout (dočasný krit buff).
// Mirror LuckyEki: čteme jen lehký výřez stavu a renderujeme jen když prsten visí.
const select = (s) =>
  s.comboRing ? { id: s.comboRing.id, x: s.comboRing.x, y: s.comboRing.y, side: s.comboRing.side } : null;

export default function ComboRing() {
  const engine = useEngine();
  const ring = useEngineSelector(select, shallowEqual);
  if (!ring) return null;
  return (
    <button
      key={ring.id}
      className={'combo-ring combo-ring--' + (ring.side || 'right')}
      style={{ left: ring.x + '%', top: ring.y + '%' }}
      title="Boxovací kruh — cvakni rychle a naval mu! 🥊"
      tabIndex={-1}
      onPointerDown={(e) => {
        if (e.button != null && e.button !== 0) return; // jen primární tlačítko
        if (!e.nativeEvent?.isTrusted) return; // jen skutečný vstup, ne klávesnice/skript
        e.stopPropagation();
        engine.catchComboRing();
      }}
    />
  );
}
