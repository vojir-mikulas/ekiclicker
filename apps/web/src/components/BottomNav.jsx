/* Mobilní spodní navigace (RPG design): 5 hlavních záložek jako fixní lišta dole.
   Zrcadlí .segmented z topbaru (stejné view/onView + odznaky boss/aréna/cech).
   Viditelná jen na úzkých displejích (CSS .bottom-nav); na desktopu zůstává
   segment v topbaru. */
import { useWorldBoss } from '../hooks/useWorldBoss.js';
import { useRaid } from '../hooks/useRaid.js';
import { useGuild } from '../hooks/useGuild.js';

export default function BottomNav({ view, onView }) {
  const wb = useWorldBoss();
  const rd = useRaid();
  const gd = useGuild();

  const tabs = [
    { id: 'game', icon: '👊', label: 'Hra' },
    { id: 'boss', icon: '🐲', label: 'Boss', live: wb.live, dot: wb.claimable || wb.live, alert: wb.claimable },
    { id: 'raid', icon: '⚔️', label: 'Aréna', dot: rd?.badge, alert: rd?.unseen > 0 },
    { id: 'guild', icon: '🛡️', label: 'Cech', count: gd?.badge > 0 ? gd.badge : 0 },
    { id: 'board', icon: '🏆', label: 'Žebříček' },
  ];

  return (
    <nav className="bottom-nav" role="tablist" aria-label="Hlavní navigace">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={view === t.id}
          className={'bn-item' + (view === t.id ? ' active' : '') + (t.live ? ' live' : '')}
          onClick={() => onView(t.id)}
        >
          <span className="bn-ico">
            {t.icon}
            {t.count > 0 && <span className="bn-badge alert">{t.count > 9 ? '!' : t.count}</span>}
            {!t.count && t.dot && <span className={'bn-dot' + (t.alert ? ' alert' : '')}>{t.alert ? '!' : ''}</span>}
          </span>
          <span className="bn-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
