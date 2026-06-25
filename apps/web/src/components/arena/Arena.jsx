import { useCallback, useRef } from 'react';
import { CONFIG } from '../../game/config.js';
import { useEngine, useEngineSelector } from '../../hooks/useEngine.js';
import { fxRefs } from '../../effects/fxRefs.js';
import { fmt } from '../../game/format.js';
import { forgivenessGain } from '../../game/formulas.js';
import EnemyView from './EnemyView.jsx';
import HpBar from './HpBar.jsx';
import BossTimer from './BossTimer.jsx';
import ComboMeter from './ComboMeter.jsx';
import FrenzyBar from './FrenzyBar.jsx';
import LuckyEki from './LuckyEki.jsx';

const selectGain = (s) => forgivenessGain(s.highestLevel);

export default function Arena({ onOpenRebirth }) {
  const engine = useEngine();
  const gain = useEngineSelector(selectGain);
  const lastPunchAt = useRef(0);
  // Tři obrany proti podvádění, všechny na vstupu (engine zůstává čistý kvůli
  // simulátoru/testům, které volají punch() ve smyčce):
  //  1) Jen pointer (myš/dotyk/pero), ne klávesnice → handler visí na
  //     onPointerDown, ne onClick. Tím padá trik „zaměř tlačítko a drž Enter":
  //     Enter na tlačítku posílá pravý „trusted" klik (isTrusted by ho nechytil)
  //     a držením se opakuje, ale pointerdown z klávesnice nikdy nepřijde.
  //  2) isTrusted === false → umělý vstup (dispatchEvent) → ignoruj.
  //  3) strop tempa (~22/s) → vstup rychlejší než lidská ruka (i HW autokliker)
  //     → ignoruj. Dropnutý úder nenabíjí ani combo, ani nálož zuřivosti.
  const punch = useCallback((e) => {
    if (e.button != null && e.button !== 0) return; // jen primární tlačítko
    if (!e.nativeEvent?.isTrusted) return;
    const now = performance.now();
    if (now - lastPunchAt.current < CONFIG.minClickMs) return;
    lastPunchAt.current = now;
    engine.punch();
  }, [engine]);

  return (
    <div className="arena" ref={(el) => (fxRefs.arena = el)}>
      <ComboMeter />
      <FrenzyBar />
      <HpBar />
      <BossTimer />

      <div className="photo-wrap" ref={(el) => (fxRefs.photoWrap = el)} onPointerDown={punch}>
        <EnemyView />
      </div>

      <LuckyEki />

      <button
        className="punch-btn"
        ref={(el) => (fxRefs.button = el)}
        tabIndex={-1}
        onPointerDown={punch}
      >
        DEJ MU!
      </button>


      {gain >= 1 && (
        <button className="forgive-btn" onClick={onOpenRebirth}>
          🕊 Odpustit Tomášovi → +{fmt(gain)} 🕊
        </button>
      )}
    </div>
  );
}
