import { lazy, Suspense, useEffect, useState } from 'react';
import { useEngine } from '../hooks/useEngine.js';
import TopBar from './TopBar.jsx';
import Arena from './arena/Arena.jsx';
import Shop from './shop/Shop.jsx';
import EffectsLayer from './EffectsLayer.jsx';
import ToastHost from './ToastHost.jsx';

const SettingsModal = lazy(() => import('./modals/SettingsModal.jsx'));
const OfflineModal = lazy(() => import('./modals/OfflineModal.jsx'));
const RebirthModal = lazy(() => import('./modals/RebirthModal.jsx'));
const GiftModal = lazy(() => import('./modals/GiftModal.jsx'));

export default function Game() {
  const engine = useEngine();
  const [modal, setModal] = useState(null); // 'settings' | 'rebirth' | null
  const [offline, setOffline] = useState(null);
  const [gift, setGift] = useState(null);

  // jednorázové připsání offline výdělku po načtení
  useEffect(() => {
    if (engine.pendingOffline) {
      const o = engine.pendingOffline;
      engine.pendingOffline = null;
      engine.creditOffline(o);
      setOffline(o);
    }
    // veteránský dárek (Odpuštění už je ve stavu z load()) — jen ukázat
    if (engine.pendingGift) {
      setGift(engine.pendingGift);
      engine.pendingGift = null;
    }
  }, [engine]);

  return (
    <>
      <TopBar onOpenSettings={() => setModal('settings')} />
      <div className="game">
        <Arena onOpenRebirth={() => setModal('rebirth')} />
        <Shop />
      </div>

      <EffectsLayer />
      <ToastHost />

      <Suspense fallback={null}>
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
        {modal === 'rebirth' && <RebirthModal onClose={() => setModal(null)} />}
        {offline && <OfflineModal offline={offline} onClose={() => setOffline(null)} />}
        {gift && <GiftModal gift={gift} onClose={() => setGift(null)} />}
      </Suspense>
    </>
  );
}
