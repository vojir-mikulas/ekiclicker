import { useCallback } from 'react';
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
  const punch = useCallback(() => engine.punch(), [engine]);

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
