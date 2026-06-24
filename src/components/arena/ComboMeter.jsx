import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { CONFIG } from '../../game/config.js';

const select = (s) => {
  const active = s.combo.count > 1 && performance.now() - s.combo.lastClickAt < CONFIG.comboWindow;
  return { count: s.combo.count, active };
};

export default function ComboMeter() {
  const { count, active } = useEngineSelector(select, shallowEqual);
  return (
    <div className={'combo' + (active ? ' on' : '')}>
      x{count} combo
    </div>
  );
}
