import { useEngine, useEngineFrame } from '../hooks/useEngine.js';
import { fmt } from '../game/format.js';

/* Tři DPS hodnoty: Auto (pasivní) / Úder (manuál) / Skutečné (reálná průchodnost).
   Měřené hodnoty se mění každý snímek → vlastní mini-komponenta přes
   useEngineFrame (překreslí se každý snímek, ale je drobná). */
export default function DpsReadout() {
  const engine = useEngine();
  useEngineFrame(); // re-render každý snímek
  const { auto, punch, real } = engine.meteredDps();
  return (
    <div className="dps-readout" title="Auto = pasivní DPS · Úder = z klikání · Skutečné = reálná průchodnost (bez overkillu)">
      <div className="stat dps"><span className="label">Auto</span><span className="value">{fmt(auto)}</span></div>
      <div className="stat dps"><span className="label">Úder</span><span className="value">{fmt(punch)}</span></div>
      <div className="stat dps real"><span className="label">Skutečné</span><span className="value">{fmt(real)}</span></div>
    </div>
  );
}
