import { lazy, Suspense, useEffect, useState } from 'react';
import { useEngine, useEngineSelector } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import TopBar from './TopBar.jsx';
import Arena from './arena/Arena.jsx';
import Shop from './shop/Shop.jsx';
import EffectsLayer from './EffectsLayer.jsx';
import ToastHost from './ToastHost.jsx';
import SideBanners from './SideBanners.jsx';
import ModalFallback from './modals/ModalFallback.jsx';

const SettingsModal = lazy(() => import('./modals/SettingsModal.jsx'));
const OfflineModal = lazy(() => import('./modals/OfflineModal.jsx'));
const RebirthModal = lazy(() => import('./modals/RebirthModal.jsx'));
const GiftModal = lazy(() => import('./modals/GiftModal.jsx'));
const JoinModal = lazy(() => import('./modals/JoinModal.jsx'));
const AccountModal = lazy(() => import('./modals/AccountModal.jsx'));
const StatsModal = lazy(() => import('./modals/StatsModal.jsx'));
const InventoryModal = lazy(() => import('./modals/InventoryModal.jsx'));
const RouletteModal = lazy(() => import('./modals/RouletteModal.jsx'));
const PetsModal = lazy(() => import('./modals/PetsModal.jsx'));
const RunesModal = lazy(() => import('./modals/RunesModal.jsx'));
const EnchantModal = lazy(() => import('./modals/EnchantModal.jsx'));
const MasteryModal = lazy(() => import('./modals/MasteryModal.jsx'));
const AlbumModal = lazy(() => import('./modals/AlbumModal.jsx'));
const PetRevealModal = lazy(() => import('./modals/PetRevealModal.jsx'));
const DailyQuests = lazy(() => import('./modals/DailyQuests.jsx'));
const Seasons = lazy(() => import('./leaderboard/Seasons.jsx'));
const PlayerProfile = lazy(() => import('./modals/PlayerProfile.jsx'));
const SeasonEndModal = lazy(() => import('./modals/SeasonEndModal.jsx'));
const NewSeasonModal = lazy(() => import('./modals/NewSeasonModal.jsx'));
const WorldBossView = lazy(() => import('./worldboss/WorldBossView.jsx'));
const RaidView = lazy(() => import('./raid/RaidView.jsx'));

export default function Game() {
  const engine = useEngine();
  const account = useAccount();
  const [view, setView] = useState('game'); // 'game' | 'boss' | 'raid' | 'board'
  const [modal, setModal] = useState(null); // 'settings' | 'rebirth' | 'join' | 'account' | null
  const [offline, setOffline] = useState(null);
  const [gift, setGift] = useState(null);
  const [profileId, setProfileId] = useState(null); // otevřený profil hráče
  const pendingOpenId = useEngineSelector((s) => s.pendingOpen?.id || null); // běžící ruleta bedny
  const pendingEggId = useEngineSelector((s) => s.pendingEgg?.id || null); // běžící líhnutí vejce
  const enchantOn = useEngineSelector((s) => !!s.pendingEnchant); // otevřený zaklínací stůl

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
        onOpenStats={() => setModal('stats')}
        onOpenDaily={() => setModal('daily')}
        onOpenInventory={() => setModal('inventory')}
        onOpenPets={() => setModal('pets')}
        onOpenRunes={() => setModal('runes')}
        onOpenMastery={() => setModal('mastery')}
        onOpenAlbum={() => setModal('album')}
      />

      {view === 'game' ? (
        <div className="game">
          <Arena onOpenRebirth={() => setModal('rebirth')} />
          <Shop />
        </div>
      ) : view === 'boss' ? (
        <Suspense fallback={<div className="board-loading">Načítám bosse…</div>}>
          <WorldBossView onJoin={() => setModal('join')} onSelectPlayer={setProfileId} />
        </Suspense>
      ) : view === 'raid' ? (
        <Suspense fallback={<div className="board-loading">Načítám arénu…</div>}>
          <RaidView onJoin={() => setModal('join')} onSelectPlayer={setProfileId} />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="board-loading">Načítám žebříček…</div>}>
          <Seasons onJoin={() => setModal('join')} onSelectPlayer={setProfileId} />
        </Suspense>
      )}

      <SideBanners />
      {view === 'game' && <EffectsLayer />}
      <ToastHost />

      <Suspense fallback={<ModalFallback />}>
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
        {modal === 'rebirth' && <RebirthModal onClose={() => setModal(null)} />}
        {modal === 'join' && <JoinModal onClose={() => setModal(null)} />}
        {modal === 'account' && <AccountModal onClose={() => setModal(null)} />}
        {modal === 'stats' && <StatsModal onClose={() => setModal(null)} />}
        {modal === 'inventory' && <InventoryModal onClose={() => setModal(null)} />}
        {enchantOn && <EnchantModal />}
        {pendingOpenId && <RouletteModal key={pendingOpenId} />}
        {modal === 'pets' && <PetsModal onClose={() => setModal(null)} />}
        {modal === 'runes' && <RunesModal onClose={() => setModal(null)} />}
        {modal === 'mastery' && <MasteryModal onClose={() => setModal(null)} />}
        {modal === 'album' && <AlbumModal onClose={() => setModal(null)} />}
        {pendingEggId && <PetRevealModal key={pendingEggId} />}
        {modal === 'daily' && <DailyQuests onClose={() => setModal(null)} />}
        {offline && <OfflineModal offline={offline} onClose={() => setOffline(null)} />}
        {gift && <GiftModal gift={gift} onClose={() => setGift(null)} />}
        {profileId && <PlayerProfile id={profileId} onClose={() => setProfileId(null)} />}
        {account.pendingSeason && <SeasonEndModal />}
        {account.newSeason && <NewSeasonModal />}
      </Suspense>
    </>
  );
}
