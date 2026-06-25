import { lazy, Suspense, useEffect, useState } from 'react';
import { useEngine } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import TopBar from './TopBar.jsx';
import Arena from './arena/Arena.jsx';
import Shop from './shop/Shop.jsx';
import EffectsLayer from './EffectsLayer.jsx';
import ToastHost from './ToastHost.jsx';
import SideBanners from './SideBanners.jsx';

const SettingsModal = lazy(() => import('./modals/SettingsModal.jsx'));
const OfflineModal = lazy(() => import('./modals/OfflineModal.jsx'));
const RebirthModal = lazy(() => import('./modals/RebirthModal.jsx'));
const GiftModal = lazy(() => import('./modals/GiftModal.jsx'));
const JoinModal = lazy(() => import('./modals/JoinModal.jsx'));
const AccountModal = lazy(() => import('./modals/AccountModal.jsx'));
const Seasons = lazy(() => import('./leaderboard/Seasons.jsx'));
const PlayerProfile = lazy(() => import('./modals/PlayerProfile.jsx'));
const SeasonEndModal = lazy(() => import('./modals/SeasonEndModal.jsx'));

export default function Game() {
  const engine = useEngine();
  const account = useAccount();
  const [view, setView] = useState('game'); // 'game' | 'board'
  const [modal, setModal] = useState(null); // 'settings' | 'rebirth' | 'join' | 'account' | null
  const [offline, setOffline] = useState(null);
  const [gift, setGift] = useState(null);
  const [profileId, setProfileId] = useState(null); // otevřený profil hráče

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
      <TopBar
        view={view}
        onView={setView}
        onOpenSettings={() => setModal('settings')}
        onOpenJoin={() => setModal('join')}
        onOpenAccount={() => setModal('account')}
      />

      {view === 'game' ? (
        <div className="game">
          <Arena onOpenRebirth={() => setModal('rebirth')} />
          <Shop />
        </div>
      ) : (
        <Suspense fallback={<div className="board-loading">Načítám žebříček…</div>}>
          <Seasons onJoin={() => setModal('join')} onSelectPlayer={setProfileId} />
        </Suspense>
      )}

      <SideBanners />
      {view === 'game' && <EffectsLayer />}
      <ToastHost />

      <Suspense fallback={null}>
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
        {modal === 'rebirth' && <RebirthModal onClose={() => setModal(null)} />}
        {modal === 'join' && <JoinModal onClose={() => setModal(null)} />}
        {modal === 'account' && <AccountModal onClose={() => setModal(null)} />}
        {offline && <OfflineModal offline={offline} onClose={() => setOffline(null)} />}
        {gift && <GiftModal gift={gift} onClose={() => setGift(null)} />}
        {profileId && <PlayerProfile id={profileId} onClose={() => setProfileId(null)} />}
        {account.pendingSeason && <SeasonEndModal />}
      </Suspense>
    </>
  );
}
