/* Denní úkoly — splň pro Odpuštění 🕊 + balík zlata. Drž streak (všechny úkoly
   dne) pro rostoucí bonus. Postup se počítá živě z dnešního přírůstku statistik. */
import { useEngine, useEngineSelector } from '../../hooks/useEngine.js';
import { fmt } from '../../game/format.js';
import {
  questDef, questProgress, questDone, questGoldReward, streakBonusDoves,
} from '../../game/data/quests.js';
import Modal from './Modal.jsx';

/* Řetězec, který se mění při každé změně postupu/claimu → vynutí re-render. */
const progressSig = (s) =>
  s.daily
    ? `${s.daily.day}#${s.daily.streak}#` +
      s.daily.quests.map((q) => `${questProgress(s, q)}:${q.claimed ? 1 : 0}`).join('|')
    : '';

export default function DailyQuests({ onClose }) {
  const engine = useEngine();
  useEngineSelector(progressSig); // re-render při postupu / vyzvednutí
  const s = engine.state;
  const daily = s.daily;
  if (!daily) return null;

  const allDone = daily.quests.every((q) => q.claimed);
  const goldReward = questGoldReward(s);

  return (
    <Modal onClose={onClose} className="daily-modal">
      <h2>📜 Denní úkoly</h2>
      <div className="daily-streak">
        <span className="ico">🔥</span>
        <span>
          Série: <b>{daily.streak} {daily.streak === 1 ? 'den' : daily.streak < 5 ? 'dny' : 'dní'}</b>
          {' · '}za splnění všech dnes: <b>+{streakBonusDoves(daily.streak + (allDone ? 0 : 1))} 🕊</b>
        </span>
      </div>

      <div className="daily-list">
        {daily.quests.map((q) => {
          const def = questDef(q.id);
          if (!def) return null;
          const prog = Math.min(questProgress(s, q), q.target);
          const done = questDone(s, q);
          const pct = Math.round((prog / q.target) * 100);
          return (
            <div key={q.id} className={'dq' + (q.claimed ? ' claimed' : done ? ' done' : '')}>
              <div className="ico">{q.claimed ? '✅' : def.emoji}</div>
              <div className="body">
                <div className="name">{def.label(q.target)}</div>
                <div className="dq-bar"><div className="dq-fill" style={{ width: `${pct}%` }} /></div>
                <div className="dq-prog">{fmt(prog)} / {fmt(q.target)}</div>
              </div>
              <div className="dq-side">
                <div className="rew">+{fmt(goldReward)} 🪙<br />+{def.doves} 🕊</div>
                {q.claimed ? (
                  <span className="dq-tag">Hotovo</span>
                ) : (
                  <button className="dq-claim" disabled={!done} onClick={() => engine.claimQuest(q.id)}>
                    {done ? 'Vyzvednout' : `${pct} %`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <p className="daily-foot">🎉 Hotovo! Zítra na tebe čekají nové úkoly — vrať se a drž sérii.</p>
      )}
    </Modal>
  );
}
