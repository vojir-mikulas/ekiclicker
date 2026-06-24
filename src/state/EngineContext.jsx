import { useState, useEffect } from 'react';
import { Engine } from '../game/engine.js';
import { load, save } from '../game/persistence.js';
import { EngineContext } from './engineContext.js';

export function EngineProvider({ children }) {
  const [engine] = useState(() => {
    const loaded = load();
    const e = new Engine(loaded?.state);
    e.pendingOffline = loaded?.offline || null;
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
    return () => {
      engine.stop();
      save(engine.state);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}
