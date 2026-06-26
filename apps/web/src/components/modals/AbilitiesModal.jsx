/* Bojové rituály 🌀 (active abilities) — leveling + probouzení (awakening).
   Pozdní endgame VERB: každý rituál se LEVELUJE ZLATEM (trvalý gold-sink, level
   přežívá rebirth jako zaklínání) a na prazích levelu se PROBUDÍ do silnější formy
   (à la Naruto — nový název/emoji + násobič efektu + kratší cd). Efekt je čistý
   BURST mimo difficultyScale (jako zuřivost/elixír) → žádný anti-blitz dopad.
   Samotné sesílání v boji řeší AbilityBar; tady jen spravuješ progres.
   Re-render řízený kompaktním podpisem (engine mutuje state na místě). */
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  ABILITIES, ABILITY_KEYS, abilityCost, abilityCooldown, abilityDescText,
  abilityTier, abilityAwakening,
} from '../../game/data/abilities.js';
import { buyBatch } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

/* Hromadný nákup levelů (sdílí globální s.buyAmount se Shopem). */
const BUY_OPTS = [1, 10, 100, 'max'];

const trigger = (s) => [
  Math.floor(s.gold), s.buyAmount, s.abilitiesUnlocked,
  ...ABILITY_KEYS.map((id) => (s.abilities?.levels?.[id] || 0)),
];

export default function AbilitiesModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const s = engine.state;

  return (
    <Modal onClose={onClose} className="abilities-modal">
      <div className="abilities-head">
        <div className="abilities-intro">
          <h2 className="abilities-title">🌀 Bojové rituály</h2>
          <p className="abilities-sub">
            Aktivní schopnosti — leveluj zlatem 💰, probouzej do silnějších forem.
            Burst efekt (jako zuřivost) — <b>mimo obtížnost</b>. Sesílej je na hlavní obrazovce.
          </p>
        </div>
        <div className="buy-amount">
          <span className="buy-amount-label">Kupovat</span>
          {BUY_OPTS.map((amt) => (
            <button
              key={amt}
              className={'buy-opt' + (s.buyAmount === amt ? ' active' : '')}
              onClick={() => engine.setBuyAmount(amt)}
            >
              {amt === 'max' ? 'Max' : amt + '×'}
            </button>
          ))}
        </div>
      </div>
      <div className="abilities-list">
        {ABILITY_KEYS.map((id) => {
          const def = ABILITIES[id];
          const level = s.abilities.levels[id] || 0;
          const tier = abilityTier(id, level);
          const aw = abilityAwakening(id, level);
          const nextAw = def.awakenings[tier + 1];
          const maxed = level >= def.maxLevel;
          const batch = buyBatch((i) => abilityCost(id, level + i), s.gold, s.buyAmount, def.maxLevel - level);
          const can = batch.count > 0 && s.gold >= batch.cost;
          const cdS = Math.round(abilityCooldown(id, level) / 1000);
          return (
            <div className={'ability-card tier-' + tier} key={id}>
              <div className="ab-head">
                <span className="ab-card-ico">{aw.emoji}</span>
                <div className="ab-card-name">
                  <span className="ab-aw-name">{aw.name}</span>
                  <span className="ab-base">{def.name} · úroveň {level}{maxed ? ' (max)' : ''}</span>
                </div>
                <span className="ab-effect">{level >= 1 ? abilityDescText(id, level) : 'nekoupeno'}</span>
              </div>

              <div className="ab-meta">
                <span className="ab-tier-dots">
                  {def.awakenings.map((a, i) => (
                    <span key={a.name} className={'ab-dot' + (i <= tier ? ' on' : '')} title={`${a.name} (úroveň ${a.at})`}>{a.emoji}</span>
                  ))}
                </span>
                <span className="ab-cd-info">⏱ {cdS} s{def.durationMs ? ` · ${Math.round(def.durationMs / 1000)} s` : ''}</span>
              </div>

              {nextAw && (
                <div className="ab-next">↑ Probuzení <b>{nextAw.emoji} {nextAw.name}</b> na úrovni {nextAw.at}</div>
              )}

              <button className="ab-buy" disabled={!can || maxed} onClick={() => engine.levelAbility(id)}>
                {maxed
                  ? 'Maximum'
                  : `${batch.count > 1 ? batch.count + '× ' : '+1 '}úroveň · ${fmt(batch.cost)} 🪙`}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
