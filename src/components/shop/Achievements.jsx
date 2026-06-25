import { useEngine, useEngineSelector } from '../../hooks/useEngine.js';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from '../../game/data/achievements.js';

const countUnlocked = (s) => Object.keys(s.achievements).length;

function rewardText(r) {
  const parts = [];
  if (r.dmg) parts.push(`+${Math.round((r.dmg - 1) * 100)}% 💥`);
  if (r.gold) parts.push(`+${Math.round((r.gold - 1) * 100)}% 🪙`);
  if (r.forgiveness) parts.push(`+${r.forgiveness} 🕊`);
  return parts.join(' ');
}

export default function Achievements() {
  const engine = useEngine();
  const unlocked = useEngineSelector(countUnlocked);
  const ach = engine.state.achievements;

  return (
    <div>
      <div className="ach-head">
        <p className="sub">Splněním získáš trvalé bonusy.</p>
        <span className="ach-progress">{unlocked} / {ACHIEVEMENT_COUNT}</span>
      </div>
      <div className="ach-grid shop-scroll">
        {ACHIEVEMENTS.map((a) => {
          const done = !!ach[a.id];
          return (
            <div key={a.id} className={'ach ' + (done ? 'unlocked' : 'locked')}>
              <div className="ico">{done ? a.emoji : '🔒'}</div>
              <div className="body">
                <div className="name">{a.name}</div>
                <div className="desc">{a.desc}</div>
              </div>
              <div className="rew">{rewardText(a.reward)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
