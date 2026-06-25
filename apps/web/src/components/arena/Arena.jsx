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
  // Dvě obrany proti autoklikerům, obě na vstupu (engine zůstává čistý kvůli
  // simulátoru/testům, které volají punch() ve smyčce):
  //  1) isTrusted === false → umělý klik (el.click() / dispatchEvent) → ignoruj.
  //  2) strop tempa (~22/s) → klik rychlejší než lidská ruka (i HW autokliker,
  //     který posílá pravé „trusted" kliky) → ignoruj. Dropnutý klik tím pádem
  //     nenabíjí ani combo, ani nálož zuřivosti → autoklikání nic nepřináší.
  const punch = useCallback((e) => {
    if (!e?.nativeEvent?.isTrusted) return;
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

      <div className="photo-wrap" ref={(el) => (fxRefs.photoWrap = el)} onClick={punch}>
        <EnemyView />
      </div>

      <LuckyEki />

      <button className="punch-btn" ref={(el) => (fxRefs.button = el)} onClick={punch}>
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
