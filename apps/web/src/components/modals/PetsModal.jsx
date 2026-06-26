/* Mazlíčci (pozdní endgame). Vejce 🥚 se líhnou „casem" (engine.openEgg → pendingEgg
   → PetRevealModal). Jeden nasazený mazlíček přidá bounded-% bonus (jako afix výbavy).
   Duplikáty z vajec povyšují úroveň mazlíčka (síla roste, ale je stropovaná).
   Re-render řízený kompaktním podpisem (engine mutuje state.pets na místě). */
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  PETS_CFG, PET_LIST, PET_LIST_BY_RARITY, PET_COUNT,
  petBonusLabel, petEvoBonusLabel, petEvoCost, petLevelCap,
  allPetsMaxed, allPetsEvolved,
  petRarityName, petRarityColor,
} from '../../game/data/pets.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

/* podpis: vejce + úlomky + vlastnění (id+level+evo) + nasazený + odemčení evoluce
   → re-render jen při změně (úlomky kvůli affordabilitě tlačítka evoluce). */
const selectSig = (s) => ({
  unlocked: s.petsUnlocked,
  evolveUnlocked: s.petEvolveUnlocked,
  highest: s.highestLevel,
  eggs: s.eggs || 0,
  dust: s.dust || 0,
  equipped: s.equippedPet || '-',
  pets: PET_LIST.map((p) => p.id + (s.pets?.[p.id]?.level || 0) + 'e' + (s.pets?.[p.id]?.evo || 0)).join(','),
});

/* Panel vajec: kolik máš nevylíhnutých + vylíhnout (ruleta) / vše naráz.
   `done` = z vajec už nic nezískáš → vejce přestala padat (viz engine.maybeDropEgg):
   před evolucí stačí všichni na max úrovni, po odemčení evoluce až všichni vyevolvovaní.
   `fuel` = evoluce odemčena a ještě není dokončená → vejce slouží i jako její palivo. */
function EggPanel({ engine, eggs, allMaxed, allEvolved, evolveUnlocked }) {
  const done = evolveUnlocked ? allEvolved : allMaxed;
  const fuel = evolveUnlocked && !allEvolved;
  return (
    <div className="pet-eggs">
      <div className="pet-eggs-head">
        <span className="inv-summary-label">Vejce 🥚 — {fuel ? 'líhni / evolvuj' : 'vylíhni mazlíčka'}</span>
        <span className="pet-eggs-count">{eggs}× 🥚</span>
      </div>
      {eggs >= 1 && (
        <div className="chest-btns" style={{ marginTop: 6 }}>
          <button className="chest-btn" onClick={() => engine.openEgg()}>Vylíhnout 🥚</button>
          {eggs > 1 && <button className="chest-btn" onClick={() => engine.openAllEggs()} title="Vylíhnout vše bez animace">Vše ({eggs})</button>}
        </div>
      )}
      {fuel && (
        <p className="pet-foot" style={{ margin: '6px 0 0' }}>⭐ Vejce teď slouží i jako palivo evoluce — můžeš je utratit u vymaxovaného mazlíčka.</p>
      )}
      {eggs < 1 && !done && (
        <p className="chest-empty">Zatím žádná vejce — padají z nepřátel (hlavně z bossů; Eki Archón dává zaručeně).{fuel ? ' Šetři je na ⭐ evoluci.' : ' Mazlíček se vylíhne až z vejce.'}</p>
      )}
      {done && (
        <p className="chest-empty">🏆 {evolveUnlocked ? 'Všichni mazlíčci na MAX i plně vyevolvovaní' : 'Všichni mazlíčci na MAX'} — hotovo, vejce už nepadají{eggs >= 1 ? ' (zbylá dají jen úlomky 💠)' : ''}.</p>
      )}
    </div>
  );
}

/* Barevný štítek vzácnosti (stejné barvy jako u výbavy → konzistentní „jazyk vzácnosti"). */
function RarityBadge({ id }) {
  return (
    <span className="pet-rarity" style={{ color: petRarityColor(id) }}>{petRarityName(id)}</span>
  );
}

/* Řádek ⭐ evoluce: rozsvícené = dosažené stupně, zhasnuté = zbývající (do evoMaxTier). */
function StarRow({ evo, max }) {
  return (
    <div className="pet-stars" title={`Evoluce ${evo}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={'pet-star' + (i < evo ? ' on' : '')}>⭐</span>
      ))}
    </div>
  );
}

/* Karta jednoho mazlíčka — vlastněný: úroveň + bonus + nasadit; neobjevený: silueta.
   Vzácnost se ukazuje vždy: barví rámeček (--pet-rarity) i štítek → vzácnější mazlíček
   je hned vidět (a neobjevený teasuje, jak vzácný úlovek tě čeká).
   Evoluce (po odemčení): ⭐ stupně NAD max úrovní — posílí primár + odemkne druhý stat,
   palivo = vejce 🥚 + úlomky 💠. */
function PetCard({ def, owned, equipped, evolveUnlocked, eggs, dust, onEquip, onUnequip, onEvolve }) {
  const cap = petLevelCap(def.id);
  const rarityStyle = { '--pet-rarity': petRarityColor(def.id) };
  if (!owned) {
    return (
      <div className="pet-card locked" style={rarityStyle}>
        <RarityBadge id={def.id} />
        <div className="pet-emoji">❔</div>
        <div className="pet-name">Neobjevený</div>
        <div className="pet-sub">Vylíhni z vejce 🥚</div>
      </div>
    );
  }
  const maxed = owned.level >= cap;
  const evo = owned.evo || 0;
  const maxEvo = PETS_CFG.evoMaxTier;
  const cost = petEvoCost(evo); // null = už na max evoluci
  const canAfford = cost && eggs >= cost.eggs && dust >= cost.dust;
  return (
    <div className={'pet-card' + (equipped ? ' equipped' : '') + (evo >= maxEvo ? ' evolved' : '')} style={rarityStyle}>
      <RarityBadge id={def.id} />
      <div className="pet-emoji">{def.emoji}</div>
      <div className="pet-name">{def.name}</div>
      {(evolveUnlocked || evo > 0) && <StarRow evo={evo} max={maxEvo} />}
      <div className="pet-level">
        Úroveň <b>{owned.level}</b>/{cap}{maxed && <span className="pet-max"> MAX</span>}
      </div>
      <div className="pet-bonus">{petBonusLabel(def.id, owned.level, evo)}</div>
      {evo > 0 && <div className="pet-bonus evo">{petEvoBonusLabel(def.id, evo)}</div>}
      <div className="pet-desc">{def.desc}</div>
      {evolveUnlocked && maxed && (cost ? (
        <button
          className="pet-btn evolve"
          disabled={!canAfford}
          onClick={onEvolve}
          title={`Evoluce na ⭐${evo + 1}: ${cost.eggs}× 🥚 + ${fmt(cost.dust)} 💠`}
        >
          Evolvovat ⭐ · {cost.eggs}🥚 {fmt(cost.dust)}💠
        </button>
      ) : (
        <div className="pet-evo-max">⭐ Evoluce na maximu</div>
      ))}
      {evolveUnlocked && !maxed && (
        <div className="pet-evo-hint">Evoluce ⭐ až na MAX úrovni</div>
      )}
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
          {PET_LIST_BY_RARITY.map((def) => (
            <div key={def.id} className="pet-card locked" style={{ '--pet-rarity': petRarityColor(def.id) }}>
              <RarityBadge id={def.id} />
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
          <EggPanel
            engine={engine}
            eggs={s.eggs || 0}
            allMaxed={allPetsMaxed(s.pets)}
            allEvolved={allPetsEvolved(s.pets)}
            evolveUnlocked={s.petEvolveUnlocked}
          />

          {equippedDef ? (
            <div className="pet-equipped">
              <span className="inv-summary-label">Nasazený mazlíček</span>
              <div className="pet-equipped-row">
                <span className="pet-equipped-emoji">{equippedDef.emoji}</span>
                <span className="pet-equipped-name">
                  {equippedDef.name} <b>L{s.pets[equippedDef.id].level}</b>
                  {(s.pets[equippedDef.id].evo || 0) > 0 && <span className="pet-equipped-stars"> {'⭐'.repeat(s.pets[equippedDef.id].evo)}</span>}
                </span>
                <span className="pet-equipped-bonus">{petBonusLabel(equippedDef.id, s.pets[equippedDef.id].level, s.pets[equippedDef.id].evo || 0)}</span>
              </div>
              {(s.pets[equippedDef.id].evo || 0) > 0 && (
                <div className="pet-equipped-row" style={{ marginTop: 2 }}>
                  <span className="pet-equipped-bonus" style={{ marginLeft: 'auto' }}>{petEvoBonusLabel(equippedDef.id, s.pets[equippedDef.id].evo)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="chest-empty">Žádný mazlíček nasazený — nasaď si jednoho vpravo pro jeho bonus.</p>
          )}
        </aside>

        <section className="pets-main">
          <div className="pet-grid">
            {PET_LIST_BY_RARITY.map((def) => (
              <PetCard
                key={def.id}
                def={def}
                owned={s.pets?.[def.id]}
                equipped={s.equippedPet === def.id}
                evolveUnlocked={s.petEvolveUnlocked}
                eggs={s.eggs || 0}
                dust={s.dust || 0}
                onEquip={() => engine.equipPet(def.id)}
                onUnequip={() => engine.unequipPet()}
                onEvolve={() => engine.evolvePet(def.id)}
              />
            ))}
          </div>
          <p className="pet-foot">{fmt(s.eggs || 0)}× vejce · mazlíčci přežívají rebirth, mizí jen s koncem sezóny.</p>
        </section>
      </div>
    </Modal>
  );
}
