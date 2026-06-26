import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useEngine, useEngineSelector, useEngineEvent } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { FEATURE_UNLOCKS } from '../game/data/featureUnlocks.js';
import TopBar from './TopBar.jsx';
import Arena from './arena/Arena.jsx';
import Shop from './shop/Shop.jsx';
import EffectsLayer from './EffectsLayer.jsx';
import ToastHost from './ToastHost.jsx';
import UpdateBanner from './UpdateBanner.jsx';
import AdRail from './SideBanners.jsx';
import ModalFallback from './modals/ModalFallback.jsx';
import { ModalModeContext } from './modals/modalMode.js';

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
const GuildView = lazy(() => import('./guild/GuildView.jsx'));
const FoundGuildModal = lazy(() => import('./modals/FoundGuildModal.jsx'));
const HellevatorModal = lazy(() => import('./hell/HellevatorModal.jsx'));
const UnlockModal = lazy(() => import('./modals/UnlockModal.jsx'));

// Obrazovky, které se otevírají jako vsazená stránka v obsahu (ne overlay).
// Vše ostatní (nastavení, účet, potvrzení, ruleta…) zůstává klasický modal.
const PAGE_IDS = ['daily', 'inventory', 'pets', 'runes', 'mastery', 'album', 'stats'];
// Hlavní záložky (přepínají se přes setView, ne přes page/modal) — sem míří např. CTA uvítacího modalu cechu.
const VIEW_IDS = ['game', 'boss', 'raid', 'guild', 'board'];

export default function Game() {
  const engine = useEngine();
  const account = useAccount();
  const [view, setView] = useState('game'); // 'game' | 'boss' | 'raid' | 'guild' | 'board'
  const [page, setPage] = useState(null); // vsazená utility stránka (PAGE_IDS) | null
  const [modal, setModal] = useState(null); // 'settings' | 'rebirth' | 'join' | 'account' | null
  const [offline, setOffline] = useState(null);
  const [gift, setGift] = useState(null);
  const [unlocks, setUnlocks] = useState([]); // fronta právě odemčených funkcí
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

  // Odemčení pozdní funkce → zařaď do fronty uvítacích modalů (ignoruj duplikáty).
  useEngineEvent(
    useCallback((type, payload) => {
      if (type === 'unlock' && payload?.feature && FEATURE_UNLOCKS[payload.feature]) {
        setUnlocks((q) => (q.includes(payload.feature) ? q : [...q, payload.feature]));
      }
    }, [])
  );

  // Otevři obrazovku podle id — stránku (PAGE_IDS) nebo overlay modal.
  const openScreen = useCallback((id) => {
    if (!id) return;
    if (VIEW_IDS.includes(id)) { setPage(null); setModal(null); setView(id); }
    else if (PAGE_IDS.includes(id)) { setModal(null); setPage(id); }
    else setModal(id);
  }, []);
  const closePage = useCallback(() => setPage(null), []);
  // přepnutí hlavní záložky zavře případnou otevřenou utility stránku
  const goView = useCallback((v) => { setPage(null); setView(v); }, []);

  const dismissUnlock = () => setUnlocks((q) => q.slice(1));
  const openUnlock = () => {
    const open = FEATURE_UNLOCKS[unlocks[0]]?.open;
    dismissUnlock();
    if (open) openScreen(open);
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <TopBar
          view={view}
          page={page}
          onView={goView}
          onOpenSettings={() => openScreen('settings')}
          onOpenJoin={() => openScreen('join')}
          onOpenAccount={() => openScreen('account')}
          onOpenStats={() => openScreen('stats')}
          onOpenDaily={() => openScreen('daily')}
          onOpenInventory={() => openScreen('inventory')}
          onOpenPets={() => openScreen('pets')}
          onOpenRunes={() => openScreen('runes')}
          onOpenMastery={() => openScreen('mastery')}
          onOpenAlbum={() => openScreen('album')}
        />

        <div className={'app-body app-body--' + (page ? 'page' : view)}>
          <main className="app-view">
            {page ? (
              <ModalModeContext.Provider value="page">
                <Suspense fallback={<div className="board-loading">Načítám…</div>}>
                  {page === 'daily' && <DailyQuests onClose={closePage} />}
                  {page === 'inventory' && <InventoryModal onClose={closePage} />}
                  {page === 'pets' && <PetsModal onClose={closePage} />}
                  {page === 'runes' && <RunesModal onClose={closePage} />}
                  {page === 'mastery' && <MasteryModal onClose={closePage} />}
                  {page === 'album' && <AlbumModal onClose={closePage} />}
                  {page === 'stats' && <StatsModal onClose={closePage} />}
                </Suspense>
              </ModalModeContext.Provider>
            ) : view === 'game' ? (
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
            ) : view === 'guild' ? (
              <Suspense fallback={<div className="board-loading">Načítám cech…</div>}>
                <GuildView onJoin={() => setModal('join')} onSelectPlayer={setProfileId} onFound={() => setModal('foundGuild')} onOpenHellevator={() => setModal('hellevator')} />
              </Suspense>
            ) : (
              <Suspense fallback={<div className="board-loading">Načítám žebříček…</div>}>
                <Seasons onJoin={() => setModal('join')} onSelectPlayer={setProfileId} />
              </Suspense>
            )}
          </main>

          <AdRail />
        </div>
      </div>

      {view === 'game' && !page && <EffectsLayer />}
      <ToastHost />
      <UpdateBanner />

      <Suspense fallback={<ModalFallback />}>
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
        {modal === 'rebirth' && <RebirthModal onClose={() => setModal(null)} />}
        {modal === 'join' && <JoinModal onClose={() => setModal(null)} />}
        {modal === 'account' && <AccountModal onClose={() => setModal(null)} />}
        {enchantOn && <EnchantModal />}
        {pendingOpenId && <RouletteModal key={pendingOpenId} />}
        {modal === 'foundGuild' && <FoundGuildModal onClose={() => setModal(null)} />}
        {modal === 'hellevator' && <HellevatorModal onClose={() => setModal(null)} />}
        {pendingEggId && <PetRevealModal key={pendingEggId} />}
        {offline && <OfflineModal offline={offline} onClose={() => setOffline(null)} />}
        {gift && <GiftModal gift={gift} onClose={() => setGift(null)} />}
        {profileId && <PlayerProfile id={profileId} onClose={() => setProfileId(null)} />}
        {account.pendingSeason && <SeasonEndModal />}
        {account.newSeason && <NewSeasonModal />}
        {unlocks.length > 0 && (
          <UnlockModal key={unlocks[0]} feature={unlocks[0]} onClose={dismissUnlock} onOpen={openUnlock} />
        )}
      </Suspense>
    </div>
  );
}
