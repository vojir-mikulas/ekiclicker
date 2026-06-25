import { useState, useEffect } from 'react';
import { Engine } from '../game/engine.js';
import { load, save } from '../game/persistence.js';
import { EngineContext } from './engineContext.js';

export function EngineProvider({ children }) {
  const [engine] = useState(() => {
    const loaded = load();
    const e = new Engine(loaded?.state);
    e.pendingOffline = loaded?.offline || null;
    e.pendingGift = loaded?.gift || null;
    return e;
  });

  useEffect(() => {
    engine.start();
    const onHide = () => save(engine.state);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save(engine.state);
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);

    // Ladicí pomocník JEN v devu (import.meta.env.DEV) — do produkčního buildu
    // se nedostane, takže to není cheat vektor na žebříček. Mění ŽIVÝ stav
    // enginu (ne localStorage), pak notify() překreslí UI a save() to uloží —
    // takže to přežije i reload (beforeunload jinak edit v localStorage přepíše).
    // Použití v konzoli:  __eki.giveGold()   nebo  __eki.setLevel(500)
    if (import.meta.env.DEV) {
      window.__eki = {
        engine,
        giveGold(n = 1e30) { engine.state.gold = n; engine.notify(); save(engine.state); return n; },
        setLevel(n = 500) {
          engine.state.level = n;
          engine.state.highestLevel = Math.max(engine.state.highestLevel, n);
          engine.spawnEnemy();
          engine.notify();
          save(engine.state);
          return n;
        },
      };
    }

    return () => {
      engine.stop();
      save(engine.state);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      if (import.meta.env.DEV) delete window.__eki;
    };
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}
