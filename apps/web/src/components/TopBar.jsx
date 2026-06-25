import { useEngineSelector, shallowEqual } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { fmt } from '../game/format.js';
import { clickDamage } from '../game/formulas.js';
import { claimableCount } from '../game/data/quests.js';
import DpsReadout from './DpsReadout.jsx';

const select = (s) => ({
  gold: Math.floor(s.gold),
  forgiveness: s.prestige.forgiveness,
  dust: Math.floor(s.dust || 0),
  level: s.level,
  click: Math.floor(clickDamage(s)),
  daily: claimableCount(s),
  invUnlocked: s.inventoryUnlocked,
  invCount: s.inventory.length,
});

export default function TopBar({ view, onView, onOpenSettings, onOpenJoin, onOpenAccount, onOpenStats, onOpenDaily, onOpenInventory }) {
  const { gold, forgiveness, dust, level, click, daily, invUnlocked, invCount } = useEngineSelector(select, shallowEqual);
  const account = useAccount();

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
          <button className="topbar-btn badged" onClick={onOpenDaily} title="Denní úkoly" aria-label="Denní úkoly">
            📜{daily > 0 && <span className="topbar-badge">{daily}</span>}
          </button>
          <button className="topbar-btn badged" onClick={onOpenInventory} title="Výbava" aria-label="Výbava">
            🎒{invUnlocked && invCount > 0 && <span className="topbar-badge">{invCount}</span>}
          </button>
          <button className="topbar-btn" onClick={onOpenStats} title="Statistiky" aria-label="Statistiky">📊</button>
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

        <div className="topbar-spacer" />

        <div className="stat"><span className="label">Úroveň</span><span className="value">{level}</span></div>
        <div className="stat"><span className="label">Úder</span><span className="value">{fmt(click)}</span></div>
        <DpsReadout />
      </div>
    </div>
  );
}
