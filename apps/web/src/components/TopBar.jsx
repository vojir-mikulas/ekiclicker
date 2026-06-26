import { useEngineSelector, shallowEqual } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { useWorldBoss } from '../hooks/useWorldBoss.js';
import { useRaid } from '../hooks/useRaid.js';
import { useGuild } from '../hooks/useGuild.js';
import { useMailbox } from '../hooks/useMailbox.js';
import { fmt } from '../game/format.js';
import { clickDamage } from '../game/formulas.js';
import { claimableCount } from '../game/data/quests.js';
import DpsReadout from './DpsReadout.jsx';
import ActiveElixir from './ActiveElixir.jsx';
import { petEmoji, petName, petBonusLabel } from '../game/data/pets.js';

const select = (s) => ({
  gold: Math.floor(s.gold),
  forgiveness: s.prestige.forgiveness,
  dust: Math.floor(s.dust || 0),
  level: s.level,
  click: Math.floor(clickDamage(s)),
  daily: claimableCount(s),
  invUnlocked: s.inventoryUnlocked,
  chestCount: s.chests ? Object.values(s.chests).reduce((a, b) => a + b, 0) : 0,
  petsUnlocked: s.petsUnlocked,
  eggCount: s.eggs || 0,
  equippedPet: s.equippedPet || null,
  petLevel: (s.equippedPet && s.pets?.[s.equippedPet]?.level) || 0,
  petEvo: (s.equippedPet && s.pets?.[s.equippedPet]?.evo) || 0,
  runesUnlocked: s.runesUnlocked,
  runeCount: (s.runes || []).length,
  abilitiesUnlocked: s.abilitiesUnlocked,
  masteryUnlocked: s.masteryUnlocked,
  masteryPoints: s.mastery?.points || 0,
  albumNew: s.album?.new || 0,
});

export default function TopBar({ view, page, onView, onOpenSettings, onOpenJoin, onOpenAccount, onOpenStats, onOpenDaily, onOpenInventory, onOpenPets, onOpenRunes, onOpenAbilities, onOpenMastery, onOpenAlbum, onOpenMailbox }) {
  const { gold, forgiveness, dust, level, click, daily, invUnlocked, chestCount, petsUnlocked, eggCount, equippedPet, petLevel, petEvo, runesUnlocked, runeCount, abilitiesUnlocked, masteryUnlocked, masteryPoints, albumNew } = useEngineSelector(select, shallowEqual);
  const account = useAccount();
  const wb = useWorldBoss();
  const rd = useRaid();
  const gd = useGuild();
  const mb = useMailbox();

  return (
    <div className="topbar">
      <div className="topbar-nav">
        <div className="segmented" role="tablist" aria-label="Sekce">
          <button
            role="tab"
            aria-selected={view === 'game'}
            className={'seg' + (view === 'game' ? ' active' : '')}
            onClick={() => onView('game')}
          >👊 Hra</button>
          <button
            role="tab"
            aria-selected={view === 'boss'}
            className={'seg wb-seg' + (view === 'boss' ? ' active' : '') + (wb.live ? ' wb-live' : '')}
            onClick={() => onView('boss')}
          >🐲 Boss{(wb.claimable || wb.live) && (
            <span className={'seg-dot' + (wb.claimable ? ' alert' : '')}>{wb.claimable ? '!' : '•'}</span>
          )}</button>
          <button
            role="tab"
            aria-selected={view === 'raid'}
            className={'seg raid-seg' + (view === 'raid' ? ' active' : '')}
            onClick={() => onView('raid')}
          >⚔️ Aréna{rd?.badge && (
            <span className={'seg-dot' + (rd.unseen > 0 ? ' alert' : '')}>{rd.unseen > 0 ? '!' : '•'}</span>
          )}</button>
          <button
            role="tab"
            aria-selected={view === 'guild'}
            className={'seg guild-seg' + (view === 'guild' ? ' active' : '')}
            onClick={() => onView('guild')}
          >🛡️ Cech{gd?.badge > 0 && (
            <span className="seg-dot alert">{gd.badge > 9 ? '!' : gd.badge}</span>
          )}</button>
          <button
            role="tab"
            aria-selected={view === 'board'}
            className={'seg' + (view === 'board' ? ' active' : '')}
            onClick={() => onView('board')}
          >🏆 Žebříček</button>
        </div>

        <div className="topbar-nav-right">
          {account.status === 'joined' ? (
            <button className="identity" onClick={onOpenAccount} title="Účet / přejmenování">
              <span className="who">{account.offline ? '📴' : '🏷'}</span>
              <span className="nick">{account.player?.nickname || 'Hráč'}</span>
            </button>
          ) : account.status === 'local' ? (
            <button className="identity join" onClick={onOpenJoin} title="Připojit se k žebříčku">
              ➕ Připojit se k žebříčku
            </button>
          ) : (
            <span className="identity loading">…</span>
          )}
          <button className={'topbar-btn badged' + (page === 'daily' ? ' active' : '')} onClick={onOpenDaily} title="Denní úkoly" aria-label="Denní úkoly">
            📜{daily > 0 && <span className="topbar-badge">{daily}</span>}
          </button>
          <button className={'topbar-btn badged' + (page === 'inventory' ? ' active' : '')} onClick={onOpenInventory} title="Výbava / bedny" aria-label="Výbava">
            🎒{invUnlocked && chestCount > 0 && <span className="topbar-badge">{chestCount}</span>}
          </button>
          {petsUnlocked && (
            <button
              className={'topbar-btn badged' + (page === 'pets' ? ' active' : '')}
              onClick={onOpenPets}
              title={equippedPet ? `${petName(equippedPet)}${petEvo > 0 ? ' ' + '⭐'.repeat(petEvo) : ''} — ${petBonusLabel(equippedPet, petLevel, petEvo)}` : 'Mazlíčci / vejce'}
              aria-label="Mazlíčci"
            >
              {equippedPet ? petEmoji(equippedPet) : '🐾'}{eggCount > 0 && <span className="topbar-badge">{eggCount}</span>}
            </button>
          )}
          {runesUnlocked && (
            <button className={'topbar-btn badged' + (page === 'runes' ? ' active' : '')} onClick={onOpenRunes} title="Runy & sokety" aria-label="Runy">
              🔣{runeCount > 0 && <span className="topbar-badge">{runeCount}</span>}
            </button>
          )}
          {abilitiesUnlocked && (
            <button className={'topbar-btn' + (page === 'abilities' ? ' active' : '')} onClick={onOpenAbilities} title="Bojové rituály" aria-label="Bojové rituály">
              🌀
            </button>
          )}
          {masteryUnlocked && (
            <button className={'topbar-btn badged' + (page === 'mastery' ? ' active' : '')} onClick={onOpenMastery} title="Mistrovská mřížka" aria-label="Mistrovská mřížka">
              🔱{masteryPoints >= 1 && <span className="topbar-badge">{masteryPoints > 99 ? '99+' : Math.floor(masteryPoints)}</span>}
            </button>
          )}
          <button className={'topbar-btn badged' + (page === 'album' ? ' active' : '')} onClick={onOpenAlbum} title="Sběratelský deník" aria-label="Sběratelský deník">
            📖{albumNew > 0 && <span className="topbar-badge">{albumNew}</span>}
          </button>
          {account.status === 'joined' && (
            <button className={'topbar-btn badged' + (page === 'mailbox' ? ' active' : '')} onClick={onOpenMailbox} title="Schránka" aria-label="Schránka">
              📬{mb?.badge > 0 && <span className="topbar-badge alert">{mb.badge > 9 ? '9+' : mb.badge}</span>}
            </button>
          )}
          <button className={'topbar-btn' + (page === 'stats' ? ' active' : '')} onClick={onOpenStats} title="Statistiky" aria-label="Statistiky">📊</button>
          <button className="topbar-btn" onClick={onOpenSettings} title="Nastavení" aria-label="Nastavení">⚙️</button>
        </div>
      </div>

      <div className="topbar-inner">
        <div className="currency gold">
          <span className="icon">🪙</span>
          <span className="txt">
            <span className="label">Peníze</span>
            <span className="value">{fmt(gold)}</span>
          </span>
        </div>
        <div className="currency dove">
          <span className="icon">🕊</span>
          <span className="txt">
            <span className="label">Odpuštění</span>
            <span className="value">{fmt(forgiveness)}</span>
          </span>
        </div>
        {invUnlocked && (
          <div className="currency dust" title="Úlomky z rozkladu kořisti — kovárna výbavy">
            <span className="icon">💠</span>
            <span className="txt">
              <span className="label">Úlomky</span>
              <span className="value">{fmt(dust)}</span>
            </span>
          </div>
        )}
        {masteryUnlocked && (
          <button className="currency mastery" onClick={onOpenMastery} title="Mistrovské body — utrať je v Mistrovské mřížce 🔱">
            <span className="icon">🔱</span>
            <span className="txt">
              <span className="label">Mistrovství</span>
              <span className="value">{fmt(masteryPoints)}</span>
            </span>
          </button>
        )}

        <ActiveElixir />

        {petsUnlocked && equippedPet && (
          <button
            className="pet-active"
            onClick={onOpenPets}
            title={`Nasazený mazlíček: ${petName(equippedPet)} — klikni pro správu`}
          >
            <span className="pet-active-ico">{petEmoji(equippedPet)}</span>
            <span className="pet-active-txt">
              <span className="pet-active-name">{petName(equippedPet)}{petEvo > 0 && <span className="pet-active-stars"> {'⭐'.repeat(petEvo)}</span>}</span>
              <span className="pet-active-bonus">{petBonusLabel(equippedPet, petLevel, petEvo)}</span>
            </span>
          </button>
        )}

        <div className="topbar-spacer" />

        <div className="stat"><span className="label">Úroveň</span><span className="value">{level}</span></div>
        <div className="stat"><span className="label">Úder</span><span className="value">{fmt(click)}</span></div>
        <DpsReadout />
      </div>
    </div>
  );
}
