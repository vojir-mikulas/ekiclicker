/* Inventář + vybavení + KOVÁRNA (pozdní hra). Drag&drop přes @dnd-kit:
   - táhni kus z inventáře na slot → nasadí se (předchozí se vrátí),
   - táhni nasazený kus do inventáře → sundá se,
   - TAP funguje jako záloha (mobil): klepnutí na kus = nasadit, na slot = sundat.
   Kovárna (úlomky 💠): každý kus jde přerolovat (nové afixy) nebo povýšit vzácnost.
   Re-render řízený kompaktním podpisem (engine mutuje pole na místě). */
import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  SLOTS, SLOT_IDS, ITEMS, SETS, RARITIES, CHESTS, CHEST_ORDER, chestCost,
  aggregateEquip, activeSets,
  itemEmoji, itemName, rarityName, rarityColor, affixLabel, itemScore, itemSet,
  upgradeDelta, rerollCost, upgradeRarityCost, nextRarity,
} from '../../game/data/items.js';
import {
  ENCHANTS_CFG, canEnchant, enchantTotalLvl, enchantStats,
} from '../../game/data/enchants.js';
import { itemImageUrl } from '../../game/data/itemImages.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';
import ConfirmModal from './ConfirmModal.jsx';

/* ikona kusu = nahraný obrázek (src/assets/items/<base>.png), jinak emoji */
function ItemIcon({ item }) {
  const url = itemImageUrl(item.base);
  if (url) return <img className="inv-img" src={url} alt="" draggable={false} />;
  return <div className="inv-emoji">{itemEmoji(item)}</div>;
}

/* kompaktní podpis stavu inventáře → re-render jen při skutečné změně
   (dust + rarity/afixy v podpisu: kovárna mění kus „na místě" se stejným id) */
const selectSig = (s) => ({
  unlocked: s.inventoryUnlocked,
  ench: s.enchantingUnlocked,
  highest: s.highestLevel,
  dust: Math.floor(s.dust || 0),
  chests: CHEST_ORDER.map((t) => s.chests?.[t] || 0).join(','),
  inv: s.inventory.map((i) => i.id + i.rarity + i.affixes.length + (i.enchant?.lvl || 0)).join(','),
  eq: SLOT_IDS.map((id) => { const it = s.equipment[id]; return it ? it.id + it.rarity + (it.enchant?.lvl || 0) : '-'; }).join(','),
});

function Affixes({ item }) {
  return (
    <ul className="inv-affixes">
      {item.affixes.map((a, i) => <li key={i}>{affixLabel(a)}</li>)}
    </ul>
  );
}

/* Bonusy ze zaklínadel (zlatý sink) — vizuálně odlišené ✨ od rolovaných afixů. */
function EnchantLines({ item }) {
  const stats = enchantStats(item);
  if (!stats) return null;
  return (
    <ul className="inv-enchants" title="Zaklínadla (zaklínací stůl)">
      {Object.entries(stats).map(([stat, value]) => (
        <li key={stat}>✨ {affixLabel({ stat, value })}</li>
      ))}
    </ul>
  );
}

/* štítek vzácnosti + ilvl (vzácnost zvlášť kvůli českým koncovkám) */
function RarityLine({ item }) {
  return (
    <div className="inv-ilvl"><b style={{ color: rarityColor(item) }}>{rarityName(item)}</b> · ilvl {item.ilvl}</div>
  );
}

/* zelený odznak „lepší než nasazený kus" — jen na kusech, které jsou silnější
   (itemScore) než to, co je teď ve stejném slotu. Prázdný slot = rovnou vylepšení. */
function UpgradeBadge({ item, equipped }) {
  const d = upgradeDelta(item, equipped);
  if (!d) return null;
  return (
    <span
      className="inv-upgrade"
      title={equipped ? 'Silnější než nasazený kus' : 'Prázdný slot — rovnou vylepšení'}
    >
      {d.pct != null ? `▲ +${Math.round(d.pct * 100)} %` : '▲ vylepšení'}
    </span>
  );
}

/* odznak sady na kusu (pokud do nějaké patří) */
function SetBadge({ item }) {
  const setId = itemSet(item);
  if (!setId) return null;
  return <span className="inv-setbadge" title={`Sada: ${SETS[setId].name}`}>{SETS[setId].emoji}</span>;
}

/* Lišta kovárny pod kusem: přerolovat afixy / povýšit vzácnost (úlomky) + zaklít
   (zlatý sink, odemyká se na 3000). */
function ForgeBar({ item, dust, onReroll, onUpgrade, enchantUnlocked, onEnchant }) {
  const rr = rerollCost(item);
  const next = nextRarity(item.rarity);
  const up = upgradeRarityCost(item);
  const lvl = enchantTotalLvl(item);
  const stop = (e) => e.stopPropagation();
  return (
    <div className="inv-forge" onPointerDown={stop} onClick={stop}>
      <button
        className="forge-btn reroll"
        disabled={dust < rr}
        onClick={(e) => { stop(e); onReroll(); }}
        title="Nové afixy (drží vzácnost i ilvl)"
      >🎲 {fmt(rr)} 💠</button>
      <button
        className="forge-btn upgrade"
        disabled={!next || dust < up}
        onClick={(e) => { stop(e); onUpgrade(); }}
        title={next ? `Povýšit na ${RARITIES[next].name}` : 'Nejvyšší vzácnost'}
        style={next ? { color: RARITIES[next].color } : undefined}
      >{next ? `⬆️ ${fmt(up)} 💠` : '⬆️ MAX'}</button>
      {enchantUnlocked && (
        <button
          className="forge-btn enchant"
          disabled={!canEnchant(item)}
          onClick={(e) => { stop(e); onEnchant(); }}
          title={canEnchant(item) ? 'Zaklínací stůl (za zlato 💰)' : 'Kus je plně zaklet'}
        >{lvl > 0 ? `✨ ${lvl}/${ENCHANTS_CFG.maxLevel}` : '✨ Zaklít'}</button>
      )}
    </div>
  );
}

/* kus v inventáři — draggable + tap na nasazení, ✕ na rozložení, kovárna dole */
function InvCard({ item, equipped, dust, onEquip, onDiscard, onReroll, onUpgrade, enchantUnlocked, onEnchant }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id, data: { type: 'inv', item },
  });
  return (
    <div
      ref={setNodeRef}
      className={'inv-card' + (isDragging ? ' dragging' : '')}
      style={{ '--rc': rarityColor(item) }}
    >
      <button
        className="inv-discard"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDiscard(); }}
        title="Rozložit na úlomky 💠"
        aria-label="Rozložit na úlomky"
      >×</button>
      <div
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        className="inv-card-grab"
        onClick={onEquip}
        onKeyDown={(e) => { if (e.key === 'Enter') onEquip(); }}
        title="Klepni / přetáhni pro nasazení"
      >
        <SetBadge item={item} />
        <ItemIcon item={item} />
        <div className="inv-name">{itemName(item)}</div>
        <RarityLine item={item} />
        <UpgradeBadge item={item} equipped={equipped} />
        <Affixes item={item} />
        <EnchantLines item={item} />
      </div>
      <ForgeBar item={item} dust={dust} onReroll={onReroll} onUpgrade={onUpgrade} enchantUnlocked={enchantUnlocked} onEnchant={onEnchant} />
    </div>
  );
}

/* slot vybavení — droppable; nasazený kus je sám draggable (sundání) + kovárna */
function EquipSlot({ slot, item, dust, onUnequip, onReroll, onUpgrade, enchantUnlocked, onEnchant }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'slot-' + slot.id, data: { slot: slot.id } });
  const drag = useDraggable({ id: 'eq-' + slot.id, data: { type: 'equip', slot: slot.id }, disabled: !item });
  return (
    <div
      ref={setNodeRef}
      className={'equip-slot' + (isOver ? ' over' : '') + (item ? ' filled' : '')}
      style={item ? { '--rc': rarityColor(item) } : undefined}
    >
      <div className="equip-slot-head">{slot.emoji} {slot.name}</div>
      {item ? (
        <>
          <div
            ref={drag.setNodeRef}
            {...drag.listeners}
            {...drag.attributes}
            role="button"
            tabIndex={0}
            className={'equip-item' + (drag.isDragging ? ' dragging' : '')}
            onClick={onUnequip}
            onKeyDown={(e) => { if (e.key === 'Enter') onUnequip(); }}
            title="Klepni / přetáhni do inventáře pro sundání"
          >
            <SetBadge item={item} />
            <ItemIcon item={item} />
            <div className="inv-name">{itemName(item)}</div>
            <RarityLine item={item} />
            <Affixes item={item} />
            <EnchantLines item={item} />
          </div>
          <ForgeBar item={item} dust={dust} onReroll={onReroll} onUpgrade={onUpgrade} enchantUnlocked={enchantUnlocked} onEnchant={onEnchant} />
        </>
      ) : (
        <div className="equip-empty">prázdné</div>
      )}
    </div>
  );
}

/* Panel beden: co máš neotevřeného + gamble „vykovaná bedna" za úlomky.
   Otevření spustí ruletu (engine.openChest → pendingOpen → RouletteModal). */
function ChestPanel({ engine, dust }) {
  const s = engine.state;
  const owned = CHEST_ORDER.filter((t) => t !== 'dust' && (s.chests?.[t] || 0) > 0);
  const dustCost = chestCost('dust');
  const dustDef = CHESTS.dust;
  return (
    <div className="inv-chests">
      <span className="inv-summary-label">Bedny — otevři a roztoč ruletu</span>
      {owned.length === 0 && (
        <p className="chest-empty">Zatím žádné bedny — padají z nepřátel (hlavně z bossů). Kus se vyloupne až otevřením.</p>
      )}
      {owned.map((t) => {
        const def = CHESTS[t];
        const n = s.chests[t];
        const floor = def.rarityFloor ? `min. ${RARITIES[def.rarityFloor].name}` : 'náhodná kořist';
        return (
          <div key={t} className="chest-row">
            <span className="chest-ico" style={{ color: def.glow }}>{def.emoji}</span>
            <div className="chest-info">
              <div className="chest-name" style={{ color: def.glow }}>{def.name} ×{n}</div>
              <div className="chest-sub">{floor}{def.setBias ? ` • sada ${SETS[def.setBias]?.name || ''}` : ''}{def.missChance ? ` • ${Math.round(def.missChance * 100)} % prázdná` : ''}</div>
            </div>
            <div className="chest-btns">
              <button className="chest-btn" onClick={() => engine.openChest(t)}>Otevřít 🎲</button>
              {n > 1 && <button className="chest-btn" onClick={() => engine.openAll(t)} title="Otevřít vše bez rulety">Vše ({n})</button>}
            </div>
          </div>
        );
      })}
      <div className="chest-row">
        <span className="chest-ico" style={{ color: dustDef.glow }}>{dustDef.emoji}</span>
        <div className="chest-info">
          <div className="chest-name" style={{ color: dustDef.glow }}>{dustDef.name}</div>
          <div className="chest-sub">Vsaď úlomky na náhodný kus (min. {RARITIES[dustDef.rarityFloor].name}) • {Math.round(dustDef.missChance * 100)} % prázdná</div>
        </div>
        <div className="chest-btns">
          <button className="chest-btn buy" disabled={dust < dustCost} onClick={() => engine.buyDustChest()}>Vykovat 💠{fmt(dustCost)}</button>
        </div>
      </div>
    </div>
  );
}

/* Směnárna: přebytečné úlomky 💠 → 🕊 odpuštění (prestige). Kurz roste s úrovní,
   takže je to odvod přebytku, ne hlavní zdroj 🕊 (rebirth dává řádově víc). */
function DustExchange({ engine, dust }) {
  const cost = engine.doveExchangeCost();
  const max = Math.floor(dust / cost);
  return (
    <div className="inv-exchange">
      <div className="exch-head">
        <span className="inv-summary-label">Směnárna úlomků</span>
        <span className="exch-rate">{fmt(cost)} 💠 = 1 🕊</span>
      </div>
      <div className="exch-row">
        <span className="exch-desc">Přebytečné úlomky na <b>🕊 odpuštění</b> (prestige). Skvělé na zbylou hromadu.</span>
        <div className="exch-btns">
          <button className="exch-btn" disabled={max < 1} onClick={() => engine.exchangeDust(1)}>+1 🕊</button>
          <button
            className="exch-btn buy"
            disabled={max < 1}
            onClick={() => engine.exchangeDust('max')}
            title={max > 0 ? `Směnit vše: ${fmt(max)} 🕊 za ${fmt(max * cost)} 💠` : 'Málo úlomků'}
          >Vše ({fmt(max)} 🕊)</button>
        </div>
      </div>
    </div>
  );
}

/* Přehled sad: kolik kusů nasazeno a které stupně bonusu jsou aktivní. */
function SetPanel({ equipment }) {
  const sets = activeSets(equipment).filter((s) => s.pieces >= 2 || s.tiers.some((t) => t.active));
  if (sets.length === 0) return null;
  return (
    <div className="inv-sets">
      <span className="inv-summary-label">Sady</span>
      {sets.map((set) => (
        <div key={set.id} className="set-row">
          <span className="set-name">{set.emoji} {set.name} <b>{set.pieces}/{set.total}</b></span>
          <span className="set-tiers">
            {set.tiers.map((t, i) => (
              <span key={i} className={'set-tier' + (t.active ? ' on' : '')}>
                ({t.pieces}) {Object.entries(t.stats).map(([stat, value]) => affixLabel({ stat, value })).join(', ')}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function InventoryModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(selectSig, shallowEqual); // trigger re-renderu
  const s = engine.state;
  const dust = Math.floor(s.dust || 0);
  const [dragItem, setDragItem] = useState(null);

  // distance constraint → krátké klepnutí projde jako klik (tap-to-equip na mobilu)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (!s.inventoryUnlocked) {
    return (
      <Modal onClose={onClose} className="inventory-modal">
        <h2>🎒 Výbava</h2>
        <p className="inv-locked-text">
          Kořist a vybavení se odemknou, jakmile dosáhneš <b>úrovně {ITEMS.unlockLevel}</b> — pozdní
          hra. Nepřátelé pak začnou upouštět zbraně, rukavice, talismany a aury, které posílí
          tvé poškození. Zahozené kusy se rozloží na <b>úlomky 💠</b> a v kovárně z nich vykouzlíš
          lepší výbavu. Vybavení i úlomky přežívají rebirth!
        </p>
        <p className="sub" style={{ textAlign: 'center' }}>Nejvyšší úroveň: {s.highestLevel} / {ITEMS.unlockLevel}</p>
      </Modal>
    );
  }

  const inv = [...s.inventory].sort((a, b) => itemScore(b) - itemScore(a));
  const agg = aggregateEquip(s.equipment);
  const summary = Object.entries(agg).filter(([, v]) => v > 0).map(([stat, value]) => affixLabel({ stat, value }));

  function onDragEnd({ active, over }) {
    setDragItem(null);
    if (!over) return;
    const a = active.data.current;
    const overId = over.id;
    if (typeof overId === 'string' && overId.startsWith('slot-')) {
      const slot = overId.slice(5);
      if (a?.type === 'inv' && a.item.slot === slot) engine.equipItem(a.item.id);
    } else if (overId === 'inv-zone' && a?.type === 'equip') {
      engine.unequipSlot(a.slot);
    }
  }

  return (
    <Modal onClose={onClose} className="inventory-modal">
      <h2>🎒 Výbava <span className="inv-dust" title="Úlomky z rozkladu kořisti — kovárna">💠 {fmt(dust)}</span></h2>

      <ChestPanel engine={engine} dust={dust} />

      <DustExchange engine={engine} dust={dust} />

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragItem(active.data.current?.item || s.equipment[active.data.current?.slot] || null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragItem(null)}
      >
        <div className="inv-loadout">
          <div className="inv-loadout-head">
            <span className="inv-summary-label">Nasazeno</span>
            <span className="inv-gearpower" title="Násobič poškození z nasazené výbavy (1 + Σ poškození %)">⚔️ ×{(1 + (agg.dmgPct || 0)).toFixed(2)}</span>
          </div>
          <div className="equip-slots">
          {SLOTS.map((slot) => (
            <EquipSlot
              key={slot.id}
              slot={slot}
              item={s.equipment[slot.id]}
              dust={dust}
              onUnequip={() => engine.unequipSlot(slot.id)}
              onReroll={() => engine.forgeReroll(s.equipment[slot.id]?.id)}
              onUpgrade={() => engine.forgeUpgrade(s.equipment[slot.id]?.id)}
              enchantUnlocked={s.enchantingUnlocked}
              onEnchant={() => engine.openEnchant(s.equipment[slot.id]?.id)}
            />
          ))}
          </div>
        </div>

        <SetPanel equipment={s.equipment} />

        {summary.length > 0 && (
          <div className="inv-summary">
            <span className="inv-summary-label">Bonusy z výbavy</span>
            <div className="inv-summary-list">{summary.map((t, i) => <span key={i}>{t}</span>)}</div>
          </div>
        )}

        <InventoryGrid inv={inv} dust={dust} engine={engine} />

        <DragOverlay>
          {dragItem ? (
            <div className="inv-card drag-ghost" style={{ '--rc': rarityColor(dragItem) }}>
              <ItemIcon item={dragItem} />
              <div className="inv-name">{itemName(dragItem)}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Modal>
  );
}

/* mřížka inventáře = drop zóna pro sundání (přetažení nasazeného kusu sem) */
function InventoryGrid({ inv, dust, engine }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'inv-zone' });
  const [confirmDismantle, setConfirmDismantle] = useState(false);
  const dismantleValue = engine.dismantleAllValue();
  return (
    <div ref={setNodeRef} className={'inv-grid-wrap' + (isOver ? ' over' : '')}>
      <div className="inv-grid-head">
        <span>Inventář</span>
        <div className="inv-grid-head-right">
          <span className="inv-count">{inv.length} / {ITEMS.invCap}</span>
          {inv.length > 0 && (
            <button
              className="inv-dismantle-all"
              onClick={() => setConfirmDismantle(true)}
              title="Rozloží celý inventář na úlomky (nasazené kusy zůstanou)"
            >Rozložit vše 💠 {fmt(dismantleValue)}</button>
          )}
        </div>
      </div>
      {confirmDismantle && (
        <ConfirmModal
          title="Rozložit celý inventář?"
          message={`Rozloží všech ${inv.length} kusů v inventáři na 💠 ${fmt(dismantleValue)} úlomků. Nasazené kusy zůstanou. Tohle nelze vrátit.`}
          confirmLabel={`Rozložit (💠 ${fmt(dismantleValue)})`}
          danger
          onConfirm={() => engine.dismantleAll()}
          onClose={() => setConfirmDismantle(false)}
        />
      )}
      {inv.length === 0 ? (
        <p className="inv-empty">Zatím žádná kořist — poraz nepřátele (hlavně bosse) a kusy začnou padat.</p>
      ) : (
        <div className="inv-grid">
          {inv.map((item) => (
            <InvCard
              key={item.id}
              item={item}
              equipped={engine.state.equipment[item.slot]}
              dust={dust}
              onEquip={() => engine.equipItem(item.id)}
              onDiscard={() => engine.discardItem(item.id)}
              onReroll={() => engine.forgeReroll(item.id)}
              onUpgrade={() => engine.forgeUpgrade(item.id)}
              enchantUnlocked={engine.state.enchantingUnlocked}
              onEnchant={() => engine.openEnchant(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
