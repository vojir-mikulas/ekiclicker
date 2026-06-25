import { useEngine, useEngineFrame } from '../../hooks/useEngine.js';
import { CONFIG } from '../../game/config.js';

export default function ComboMeter() {
  useEngineFrame(); // combo okno vyprší v čase → potřebujeme aktuální čas v renderu
  const engine = useEngine();
  const { count, lastClickAt } = engine.state.combo;
  const active = count > 1 && performance.now() - lastClickAt < CONFIG.comboWindow;
  return <div className={'combo' + (active ? ' on' : '')}>x{count} combo</div>;
}
