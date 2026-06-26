import { useEngine, useEngineSelector, useEngineFrame, shallowEqual } from '../../hooks/useEngine.js';
import { ABILITY_KEYS, abilityCooldown, abilityAwakening, abilityDescText } from '../../game/data/abilities.js';

/* Lišta bojových rituálů 🌀 — řada tlačítek na hlavní obrazovce (aktivní VERB).
   Castuje jen KOUPENÉ rituály (level ≥ 1); leveling/probouzení je v panelu 🌀.
   Vnější komponenta se překreslí jen při změně vlastněných rituálů (levný podpis);
   živý cooldown odpočet jede v jednotlivých tlačítkách přes useEngineFrame. */
const selectBar = (s) => ({
  unlocked: !!s.abilitiesUnlocked,
  owned: ABILITY_KEYS.filter((id) => (s.abilities?.levels?.[id] || 0) >= 1).join(','),
});

export default function AbilityBar() {
  const { unlocked, owned } = useEngineSelector(selectBar, shallowEqual);
  if (!unlocked || !owned) return null;
  return (
    <div className="ability-bar">
      {owned.split(',').map((id) => <AbilityButton key={id} id={id} />)}
    </div>
  );
}

function AbilityButton({ id }) {
  useEngineFrame(); // odpočet cooldownu běží v čase → aktuální čas v renderu
  const engine = useEngine();
  const s = engine.state;
  const level = s.abilities.levels[id] || 0;
  const aw = abilityAwakening(id, level);
  const now = Date.now();
  const cd = abilityCooldown(id, level);
  const remaining = Math.max(0, (s.abilities.cooldowns[id] || 0) - now);
  const onCd = remaining > 0;
  const isActive = (s.abilities.active[id] || 0) > now;
  const pct = onCd ? Math.min(100, (remaining / cd) * 100) : 0;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={'ability-btn' + (isActive ? ' on' : '') + (onCd ? ' cooling' : '')}
      onClick={() => engine.castAbility(id)}
      disabled={onCd}
      title={`${aw.name} — ${abilityDescText(id, level)}`}
    >
      <span className="ab-cd" style={{ height: pct + '%' }} />
      <span className="ab-emoji">{aw.emoji}</span>
      <span className="ab-lvl">{level}</span>
      {onCd && <span className="ab-timer">{Math.ceil(remaining / 1000)}</span>}
    </button>
  );
}
