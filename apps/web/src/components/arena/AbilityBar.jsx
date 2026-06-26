import { useEngine, useEngineSelector, useEngineFrame, shallowEqual } from '../../hooks/useEngine.js';
import { ABILITIES, ABILITY_KEYS, abilityCooldown, abilityAwakening, abilityDescText } from '../../game/data/abilities.js';

/* Lišta bojových rituálů 🌀 — řada tlačítek na hlavní obrazovce (aktivní VERB).
   Castuje jen KOUPENÉ rituály (level ≥ 1); leveling/probouzení je v panelu 🌀.
   Vnější komponenta se překreslí jen při změně vlastněných rituálů (levný podpis);
   živý cooldown odpočet jede v jednotlivých tlačítkách přes useEngineFrame.
   Tatáž lišta se používá i v Pekelném výtahu (sdílený cooldown, viz castAbility). */
const selectBar = (s) => ({
  unlocked: !!s.abilitiesUnlocked,
  owned: ABILITY_KEYS.filter((id) => (s.abilities?.levels?.[id] || 0) >= 1).join(','),
});

export default function AbilityBar() {
  const { unlocked, owned } = useEngineSelector(selectBar, shallowEqual);
  if (!unlocked || !owned) return null;
  return (
    <div className="ability-bar">
      {owned.split(',').map((id) => <AbilitySlot key={id} id={id} />)}
    </div>
  );
}

/* Slot = obal (overflow:visible), aby se bublina tooltipu nezařízla o tlačítko,
   které má overflow:hidden kvůli cooldown výplni. Tooltip je sourozenec tlačítka. */
function AbilitySlot({ id }) {
  useEngineFrame(); // odpočet cooldownu běží v čase → aktuální čas v renderu
  const engine = useEngine();
  const s = engine.state;
  const def = ABILITIES[id];
  const level = s.abilities.levels[id] || 0;
  const aw = abilityAwakening(id, level);
  const now = Date.now();
  const cd = abilityCooldown(id, level);
  const remaining = Math.max(0, (s.abilities.cooldowns[id] || 0) - now);
  const onCd = remaining > 0;
  const isActive = (s.abilities.active[id] || 0) > now;
  const pct = onCd ? Math.min(100, (remaining / cd) * 100) : 0;
  const cdS = Math.round(cd / 1000);
  const durS = def.durationMs ? Math.round(def.durationMs / 1000) : 0;

  return (
    <span className="ability-slot">
      <button
        type="button"
        tabIndex={-1}
        className={'ability-btn' + (isActive ? ' on' : '') + (onCd ? ' cooling' : '')}
        onClick={() => engine.castAbility(id)}
        disabled={onCd}
        aria-label={`${aw.name} — ${abilityDescText(id, level)}`}
      >
        <span className="ab-cd" style={{ height: pct + '%' }} />
        <span className="ab-emoji">{aw.emoji}</span>
        <span className="ab-lvl">{level}</span>
        {onCd && <span className="ab-timer">{Math.ceil(remaining / 1000)}</span>}
      </button>

      <span className="ability-tip" role="tooltip">
        <span className="tip-name">{aw.emoji} {aw.name}</span>
        <span className="tip-desc">{abilityDescText(id, level)}</span>
        <span className="tip-meta">
          ⏱ {cdS} s{durS ? ` · trvá ${durS} s` : ''} · úroveň {level}
        </span>
        <span className="tip-status">
          {isActive ? '✨ Právě aktivní'
            : onCd ? `⏳ Nabíjí se… ${Math.ceil(remaining / 1000)} s`
            : '✅ Připraveno'}
        </span>
      </span>
    </span>
  );
}
