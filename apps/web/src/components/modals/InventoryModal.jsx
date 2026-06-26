/* Inventář + vybavení + KOVÁRNA (pozdní hra). Klik-na-kus → vyskakovací karta:
   - kus v inventáři: Nasadit / Rozložit + kovárna (přeroll, povýšit, zaklít),
   - nasazený kus (paper-doll): Sundat + kovárna.
   Paper-doll (styl Metin2): AURA nahoře, ZBRAŇ vlevo, POSTAVA uprostřed, TALISMAN
   vpravo, RUKAVICE dole. Inventář = kompaktní mřížka ikon (ikona + ilvl v rohu).
   Re-render řízený kompaktním podpisem (engine mutuje pole na místě). */
import { useState } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  SLOTS, SLOT_IDS, SLOT_BY_ID, ITEMS, SETS, RARITIES, CHESTS, CHEST_ORDER, chestCost,
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
function iconNode(item, cls = '') {
  const url = itemImageUrl(item.base);
  if (url) return <img className={`inv-ico-img ${cls}`} src={url} alt="" draggable={false} />;
  return <span className={`inv-ico-emoji ${cls}`}>{itemEmoji(item)}</span>;
}

/* kompaktní podpis stavu inventáře → re-render jen při skutečné změně
   (dust + rarity/afixy v podpisu: kovárna mění kus „na místě" se stejným id) */
const selectSig = (s) => ({
  unlocked: s.inventoryUnlocked,
  ench: s.enchantingUnlocked,
  highest: s.highestLevel,
  level: s.level,
  dust: Math.floor(s.dust || 0),
  chests: CHEST_ORDER.map((t) => s.chests?.[t] || 0).join(','),
  inv: s.inventory.map((i) => i.id + i.rarity + i.affixes.length + (i.enchant?.lvl || 0)).join(','),
  eq: SLOT_IDS.map((id) => { const it = s.equipment[id]; return it ? it.id + it.rarity + (it.enchant?.lvl || 0) : '-'; }).join(','),
});

/* z výběru ({loc,slot|id}) vytáhne aktuální kus ze stavu — vrací null, když kus
   zmizel (nasazen/sundán/rozložen) → vyskakovací karta se sama zavře. */
function resolveSel(sel, s) {
  if (!sel) return null;
  if (sel.loc === 'equip') {
    const item = s.equipment[sel.slot];
    return item ? { loc: 'equip', item } : null;
  }
  const item = s.inventory.find((i) => i.id === sel.id);
  return item ? { loc: 'inv', item } : null;
}

/* jeden slot paper-dollu (nasazený kus / prázdné políčko se symbolem slotu) */
function DollSlot({ slot, item, onClick }) {
  if (!item) {
    return (
      <div className="doll-cell doll-empty" title={slot.name}>
        <div className="doll-tile">
          <span className="doll-slot-emoji">{slot.emoji}</span>
        </div>
        <span className="doll-slot-lbl">{slot.name}</span>
      </div>
    );
  }
  const setId = itemSet(item);
  return (
    <button className="doll-cell doll-slot" style={{ '--rc': rarityColor(item) }} onClick={onClick} title={itemName(item)}>
      <div className="doll-tile filled">
        {iconNode(item, 'doll-ico')}
        {setId && <span className="doll-setbadge" title={`Sada: ${SETS[setId].name}`}>{SETS[setId].emoji}</span>}
      </div>
      <span className="doll-slot-lbl">{slot.name}</span>
    </button>
  );
}

/* Paper-doll vybavení (3×3): AURA / ZBRAŇ–POSTAVA–TALISMAN / RUKAVICE.
   Klik na nasazený kus otevře vyskakovací kartu. Uprostřed úroveň postavy. */
function PaperDoll({ equipment, level, gearMult, onSelect }) {
  const cell = (id) => <DollSlot key={id} slot={SLOT_BY_ID[id]} item={equipment[id]} onClick={() => onSelect({ loc: 'equip', slot: id })} />;
  const blank = (k) => <div key={k} className="doll-cell doll-blank" />;
  return (
    <div className="inv-paperdoll">
      <div className="inv-loadout-head">
        <span className="inv-summary-label">Nasazeno</span>
        <span className="inv-gearpower" title="Násobič poškození z nasazené výbavy (1 + Σ poškození %)">⚔️ ×{gearMult.toFixed(2)}</span>
      </div>
      <div className="doll-grid">
        {blank('t0')}{cell('aura')}{blank('t2')}
        {cell('weapon')}
        <div className="doll-cell doll-center">
          <div className="doll-char">{fmt(level)}</div>
          <span className="doll-slot-lbl">Postava</span>
        </div>
        {cell('charm')}
        {blank('b0')}{cell('gloves')}{blank('b2')}
      </div>
    </div>
  );
}

/* Vyskakovací karta kusu — detail + akce. Sdílená pro inventář i nasazené kusy.
   Kovárna (přeroll/povýšit) drží kartu otevřenou; nasadit/sundat/rozložit/zaklít
   ji zavře (kus se přesune nebo se otevře zaklínací stůl). */
function ItemPopover({ loc, item, dust, engine, onClose }) {
  const slot = SLOT_BY_ID[item.slot];
  const next = nextRarity(item.rarity);
  const rr = rerollCost(item);
  const up = upgradeRarityCost(item);
  const lvl = enchantTotalLvl(item);
  const ench = enchantStats(item);
  const enchUnlocked = engine.state.enchantingUnlocked;
  const equipped = loc === 'inv' ? engine.state.equipment[item.slot] : null;
  const delta = loc === 'inv' ? upgradeDelta(item, equipped) : null;
  const setId = itemSet(item);
  return (
    <>
      <div className="inv-pop-back" onClick={onClose} />
      <div className="inv-pop" style={{ '--rc': rarityColor(item) }} role="dialog">
        <button className="inv-pop-x" onClick={onClose} aria-label="Zavřít">✕</button>

        <div className="inv-pop-slot">
          <span>{slot.emoji}</span><span>{slot.name}</span>
        </div>

        <div className="inv-pop-head">
          <div className="inv-pop-tile">{iconNode(item, 'inv-pop-ico')}</div>
          <div className="inv-pop-meta">
            <span className="inv-pop-name" style={{ color: rarityColor(item) }}>
              {setId && <span className="inv-pop-setbadge" title={`Sada: ${SETS[setId].name}`}>{SETS[setId].emoji} </span>}
              {itemName(item)}
            </span>
            <span className="inv-pop-sub">
              {rarityName(item)} · ilvl {item.ilvl}
              {delta && <b className="inv-pop-up"> ▲ +{Math.round((delta.pct || 0) * 100)} %</b>}
            </span>
          </div>
        </div>

        <div className="inv-pop-stats">
          {item.affixes.map((a, i) => <span key={i} className="inv-pop-chip">{affixLabel(a)}</span>)}
          {ench && Object.entries(ench).map(([stat, value]) => (
            <span key={stat} className="inv-pop-chip ench">✨ {affixLabel({ stat, value })}</span>
          ))}
        </div>

        <div className="inv-pop-btns">
          {loc === 'inv' ? (
            <button className="pop-btn accent" onClick={() => { engine.equipItem(item.id); onClose(); }}>⬆️ Nasadit</button>
          ) : (
            <button className="pop-btn" onClick={() => { engine.unequipSlot(item.slot); onClose(); }}>⬇️ Sundat</button>
          )}
          <button className="pop-btn" disabled={dust < rr} onClick={() => engine.forgeReroll(item.id)} title="Nové afixy (drží vzácnost i ilvl)">🎲 {fmt(rr)} 💠</button>
          <button
            className="pop-btn"
            disabled={!next || dust < up}
            onClick={() => engine.forgeUpgrade(item.id)}
            title={next ? `Povýšit na ${RARITIES[next].name}` : 'Nejvyšší vzácnost'}
            style={next ? { color: RARITIES[next].color } : undefined}
          >{next ? `⬆️ ${fmt(up)} 💠` : '⬆️ MAX'}</button>
          {enchUnlocked && (
            <button
              className="pop-btn ench"
              disabled={!canEnchant(item)}
              onClick={() => { engine.openEnchant(item.id); onClose(); }}
              title={canEnchant(item) ? 'Zaklínací stůl (za zlato 💰)' : 'Kus je plně zaklet'}
            >{lvl > 0 ? `✨ ${lvl}/${ENCHANTS_CFG.maxLevel}` : '✨ Zaklít'}</button>
          )}
          {loc === 'inv' && (
            <button className="pop-btn danger" onClick={() => { engine.discardItem(item.id); onClose(); }} title="Rozložit na úlomky 💠">🗑 Rozložit</button>
          )}
        </div>
      </div>
    </>
  );
}

/* kompaktní dlaždice kusu v inventáři (ikona + ilvl v rohu, ▲ = vylepšení) */
function InvTile({ item, equipped, onClick }) {
  const setId = itemSet(item);
  const up = upgradeDelta(item, equipped);
  return (
    <button className="inv-slot filled" style={{ '--rc': rarityColor(item) }} onClick={onClick} title={itemName(item)}>
      {iconNode(item, 'inv-slot-ico')}
      <span className="inv-slot-ilvl" style={{ color: rarityColor(item) }}>{fmt(item.ilvl)}</span>
      {setId && <span className="inv-slot-set">{SETS[setId].emoji}</span>}
      {up && <span className="inv-slot-up" title="Silnější než nasazený kus">▲</span>}
    </button>
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
  const [sel, setSel] = useState(null); // { loc:'equip', slot } | { loc:'inv', id }
  const [confirmDismantle, setConfirmDismantle] = useState(false);
  const [confirmWorse, setConfirmWorse] = useState(false);

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
  const gearMult = 1 + (agg.dmgPct || 0);

  const selected = resolveSel(sel, s);
  const dismantleValue = engine.dismantleAllValue();
  const worse = engine.dismantleWorseValue();
  // počet dlaždic = kapacita inventáře (vyplní mřížku „sloty" jako v designu)
  const cells = Math.max(ITEMS.invCap, inv.length);

  return (
    <Modal onClose={onClose} className="inventory-modal">
      <h2>🎒 Výbava <span className="inv-dust" title="Úlomky z rozkladu kořisti — kovárna">💠 {fmt(dust)}</span></h2>

      <div className="inv-layout">
        {/* levý sloupec: postava (paper-doll + sady + bonusy) a ekonomika (bedny + směnárna) */}
        <aside className="inv-side">
          <PaperDoll
            equipment={s.equipment}
            level={s.level}
            gearMult={gearMult}
            onSelect={setSel}
          />

          <SetPanel equipment={s.equipment} />

          {summary.length > 0 && (
            <div className="inv-summary">
              <span className="inv-summary-label">Bonusy z výbavy</span>
              <div className="inv-summary-list">{summary.map((t, i) => <span key={i}>{t}</span>)}</div>
            </div>
          )}

          <ChestPanel engine={engine} dust={dust} />
          <DustExchange engine={engine} dust={dust} />
        </aside>

        {/* pravý sloupec: kořist (scrolluje uvnitř) */}
        <section className="inv-main">
          <div className="inv-grid-wrap">
            <div className="inv-grid-head">
              <span>Inventář</span>
              <div className="inv-grid-head-right">
                <span className="inv-count">{inv.length} / {ITEMS.invCap}</span>
                {worse.count > 0 && (
                  <button
                    className="inv-dismantle-worse"
                    onClick={() => setConfirmWorse(true)}
                    title="Rozloží kusy slabší (nebo stejné) než právě nasazené ve stejném slotu. Vylepšení i zakleté/runové kusy zůstanou."
                  >Rozložit horší ({worse.count}) 💠 {fmt(worse.dust)}</button>
                )}
                {inv.length > 0 && (
                  <button
                    className="inv-dismantle-all"
                    onClick={() => setConfirmDismantle(true)}
                    title="Rozloží celý inventář na úlomky (nasazené kusy zůstanou)"
                  >Rozložit vše 💠 {fmt(dismantleValue)}</button>
                )}
              </div>
            </div>

            {inv.length === 0 ? (
              <div className="inv-empty">
                <div className="inv-empty-ico">🎁</div>
                <p>Zatím žádná kořist — poraz nepřátele (hlavně bosse) a kusy začnou padat.</p>
                <p className="inv-empty-sub">Otevři bedny vlevo nebo vykovej kus z úlomků 💠.</p>
              </div>
            ) : (
              <div className="inv-grid">
                {Array.from({ length: cells }, (_, i) => {
                  const item = inv[i];
                  if (!item) return <div key={`e${i}`} className="inv-slot empty" />;
                  return (
                    <InvTile
                      key={item.id}
                      item={item}
                      equipped={s.equipment[item.slot]}
                      onClick={() => setSel({ loc: 'inv', id: item.id })}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {selected && (
        <ItemPopover
          loc={selected.loc}
          item={selected.item}
          dust={dust}
          engine={engine}
          onClose={() => setSel(null)}
        />
      )}

      {confirmWorse && (
        <ConfirmModal
          title="Rozložit slabší kusy?"
          message={`Rozloží ${worse.count} ${worse.count === 1 ? 'kus' : worse.count < 5 ? 'kusy' : 'kusů'}, které jsou slabší (nebo stejně silné) než právě nasazené ve stejném slotu, na 💠 ${fmt(worse.dust)} úlomků. Potenciální vylepšení i zakleté/runové kusy zůstanou. Tohle nelze vrátit.`}
          confirmLabel={`Rozložit (💠 ${fmt(worse.dust)})`}
          danger
          onConfirm={() => engine.dismantleWorse()}
          onClose={() => setConfirmWorse(false)}
        />
      )}
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
    </Modal>
  );
}
