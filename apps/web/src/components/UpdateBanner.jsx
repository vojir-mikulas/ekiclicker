import { useState } from 'react';
import { useVersionCheck } from '../hooks/useVersionCheck.js';

/* Plovoucí banner: když na serveru běží novější verze hry, vyzve hráče k načtení.
   Tematicky laděné do piva („čerstvá várka") — sedí k Eki Clickeru.
   Dá se odbýt; když ale dorazí ještě novější várka, banner se vrátí. */
export default function UpdateBanner() {
  const { updateAvailable, latest } = useVersionCheck();
  const [dismissed, setDismissed] = useState(null); // verze, kterou hráč odbyl

  if (!updateAvailable || dismissed === latest) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="ub-ico" aria-hidden="true">🍺</span>
      <div className="ub-txt">
        <span className="ub-title">Čerstvá várka je na čepu!</span>
        <span className="ub-sub">Hraješ na staré verzi. Načti hru a naval si nejnovější Eki Clicker.</span>
      </div>
      <div className="ub-actions">
        <button className="ub-cta" onClick={() => window.location.reload()}>
          Načíst novou verzi 🔄
        </button>
        <button
          className="ub-dismiss"
          onClick={() => setDismissed(latest)}
          aria-label="Teď ne, zavřít"
          title="Teď ne"
        >
          ×
        </button>
      </div>
    </div>
  );
}
