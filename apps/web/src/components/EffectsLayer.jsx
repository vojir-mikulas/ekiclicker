import { useEffect } from 'react';
import { useEngine } from '../hooks/useEngine.js';
import { FxManager } from '../effects/FxManager.js';

/* Vrstva vizuálních efektů — žije mimo React (přidává prvky do document.body). */
export default function EffectsLayer() {
  const engine = useEngine();
  useEffect(() => {
    const fx = new FxManager(engine);
    return () => fx.destroy();
  }, [engine]);
  return null;
}
