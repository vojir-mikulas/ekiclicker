/* Mazlíčci (pozdní endgame). Vejce 🥚 se líhnou „casem" (engine.openEgg → pendingEgg
   → PetRevealModal). Jeden nasazený mazlíček přidá bounded-% bonus (jako afix výbavy).
   Duplikáty z vajec povyšují úroveň mazlíčka (síla roste, ale je stropovaná).
   Re-render řízený kompaktním podpisem (engine mutuje state.pets na místě). */
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  PETS_CFG, PET_LIST, PET_COUNT,
  petBonusLabel, petLevelCap, allPetsMaxed,
} from '../../game/data/pets.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

/* podpis: vejce + vlastnění (id+level) + nasazený → re-render jen při změně */
const selectSig = (s) => ({
  unlocked: s.petsUnlocked,
  highest: s.highestLevel,
  eggs: s.eggs || 0,
  equipped: s.equippedPet || '-',
  pets: PET_LIST.map((p) => p.id + (s.pets?.[p.id]?.level || 0)).join(','),
});

/* Panel vajec: kolik máš nevylíhnutých + vylíhnout (ruleta) / vše naráz.
   allMaxed = sběr kompletní → vejce už nepadají (viz engine.maybeDropEgg), proto
   místo „padají z nepřátel" ukážeme, že je hotovo. */
function EggPanel({ engine, eggs, allMaxed }) {
  return (
    <div className="pet-eggs">
      <div className="pet-eggs-head">
        <span className="inv-summary-label">Vejce 🥚 — vylíhni mazlíčka</span>
        <span className="pet-eggs-count">{eggs}× 🥚</span>
      </div>
      {eggs >= 1 && (
        <div className="chest-btns" style={{ marginTop: 6 }}>
          <button className="chest-btn" onClick={() => engine.openEgg()}>Vylíhnout 🥚</button>
          {eggs > 1 && <button className="chest-btn" onClick={() => engine.openAllEggs()} title="Vylíhnout vše bez animace">Vše ({eggs})</button>}
        </div>
      )}
      {eggs < 1 && !allMaxed && (
        <p className="chest-empty">Zatím žádná vejce — padají z nepřátel (hlavně z bossů; Eki Archón dává zaručeně). Mazlíček se vylíhne až z vejce.</p>
      )}
      {allMaxed && (
        <p className="chest-empty">🏆 Všichni mazlíčci na MAX — sběr kompletní, vejce už nepadají{eggs >= 1 ? ' (zbylá dají jen úlomky 💠)' : ''}.</p>
      )}
    </div>
  );
}

/* Karta jednoho mazlíčka — vlastněný: úroveň + bonus + nasadit; neobjevený: silueta. */
function PetCard({ def, owned, equipped, onEquip, onUnequip }) {
  const cap = petLevelCap(def.id);
  if (!owned) {
    return (
      <div className="pet-card locked">
        <div className="pet-emoji">❔</div>
        <div className="pet-name">Neobjevený</div>
        <div className="pet-sub">Vylíhni z vejce 🥚</div>
      </div>
    );
  }
  const maxed = owned.level >= cap;
  return (
    <div className={'pet-card' + (equipped ? ' equipped' : '')}>
      <div className="pet-emoji">{def.emoji}</div>
      <div className="pet-name">{def.name}</div>
      <div className="pet-level">
        Úroveň <b>{owned.level}</b>/{cap}{maxed && <span className="pet-max"> MAX</span>}
      </div>
      <div className="pet-bonus">{petBonusLabel(def.id, owned.level)}</div>
      <div className="pet-desc">{def.desc}</div>
      {equipped ? (
        <button className="pet-btn unequip" onClick={onUnequip}>Sundat</button>
      ) : (
        <button className="pet-btn equip" onClick={onEquip}>Nasadit</button>
      )}
    </div>
  );
}

export default function PetsModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(selectSig, shallowEqual); // trigger re-renderu
  const s = engine.state;

  if (!s.petsUnlocked) {
    return (
      <Modal onClose={onClose} className="pets-modal">
        <h2>🐾 Mazlíčci</h2>
        <p className="inv-locked-text">
          Mazlíčci se odemknou, jakmile dosáhneš <b>úrovně {PETS_CFG.unlockLevel}</b> — pozdní
          endgame. Pak z nepřátel začnou padat <b>vejce 🥚</b> (hlavně z bossů; Eki Archón dává
          zaručeně). Z vejce se vylíhne jeden z <b>{PET_COUNT} mazlíčků</b> — každý dává jiný bonus.
          Můžeš mít <b>jednoho nasazeného</b>. Duplikáty z vajec mu zvyšují úroveň (a sílu).
          Mazlíčci přežívají rebirth!
        </p>
        <div className="pet-grid locked-preview">
          {PET_LIST.map((def) => (
            <div key={def.id} className="pet-card locked">
              <div className="pet-emoji">{def.emoji}</div>
              <div className="pet-name">???</div>
              <div className="pet-sub">{def.desc}</div>
            </div>
          ))}
        </div>
        <p className="sub" style={{ textAlign: 'center' }}>Nejvyšší úroveň: {s.highestLevel} / {PETS_CFG.unlockLevel}</p>
      </Modal>
    );
  }

  const equippedDef = s.equippedPet ? PET_LIST.find((p) => p.id === s.equippedPet) : null;
  const ownedCount = PET_LIST.filter((p) => s.pets?.[p.id]).length;

  return (
    <Modal onClose={onClose} className="pets-modal">
      <h2>🐾 Mazlíčci <span className="pet-collected">{ownedCount}/{PET_COUNT}</span></h2>

      <div className="pets-layout">
        <aside className="pets-side">
          <EggPanel engine={engine} eggs={s.eggs || 0} allMaxed={allPetsMaxed(s.pets)} />

          {equippedDef ? (
            <div className="pet-equipped">
              <span className="inv-summary-label">Nasazený mazlíček</span>
              <div className="pet-equipped-row">
                <span className="pet-equipped-emoji">{equippedDef.emoji}</span>
                <span className="pet-equipped-name">{equippedDef.name} <b>L{s.pets[equippedDef.id].level}</b></span>
                <span className="pet-equipped-bonus">{petBonusLabel(equippedDef.id, s.pets[equippedDef.id].level)}</span>
              </div>
            </div>
          ) : (
            <p className="chest-empty">Žádný mazlíček nasazený — nasaď si jednoho vpravo pro jeho bonus.</p>
          )}
        </aside>

        <section className="pets-main">
          <div className="pet-grid">
            {PET_LIST.map((def) => (
              <PetCard
                key={def.id}
                def={def}
                owned={s.pets?.[def.id]}
                equipped={s.equippedPet === def.id}
                onEquip={() => engine.equipPet(def.id)}
                onUnequip={() => engine.unequipPet()}
              />
            ))}
          </div>
          <p className="pet-foot">{fmt(s.eggs || 0)}× vejce · mazlíčci přežívají rebirth, mizí jen s koncem sezóny.</p>
        </section>
      </div>
    </Modal>
  );
}
