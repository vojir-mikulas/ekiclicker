import { useEffect } from 'react';
import { useEngine } from '../hooks/useEngine.js';
import { FxManager } from '../effects/FxManager.js';
import { attachSound } from '../effects/sound.js';

/* Vrstva vizuálních efektů — žije mimo React (přidává prvky do document.body). */
export default function EffectsLayer() {
  const engine = useEngine();
  useEffect(() => {
    const fx = new FxManager(engine);
    const offSound = attachSound(engine);
    return () => {
      fx.destroy();
      offSound();
    };
  }, [engine]);
  return null;
}
