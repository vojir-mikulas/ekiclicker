/* Runy & sokety („Pivní tácky", pozdní endgame). Runy padají z Archónů / mega
   bossů a kují se z úlomků 💠. Vsadí se do soketů nasazené výbavy (počet dle
   vzácnosti kusu) → bounded-% bonus (sdílí klíče afixů s výbavou, ZÁMĚRNĚ bez
   poškození → žádný vliv na obtížnost). 3+ run STEJNÉ barvy = malý bonus barvy.
   Socketování je tap-to-socket: klepni runu ve skladu, pak klepni prázdný soket.
   Re-render řízený kompaktním podpisem (engine mutuje state na místě). */
import { useState } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { SLOTS, SLOT_IDS, itemEmoji, itemName, rarityColor, rarityName } from '../../game/data/items.js';
import {
  RUNES_CFG, RUNE_LIST, socketCount, activeRuneSets, groupRunes, canFuse,
  runeEmoji, runeName, runeColor, runeTierName, runeTierColor, runeStatLabel,
} from '../../game/data/runes.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

/* podpis: odemčení + úlomky + sklad (id+kind+tier) + sokety nasazených kusů */
const selectSig = (s) => ({
  unlocked: s.runesUnlocked,
  highest: s.highestLevel,
  dust: Math.floor(s.dust || 0),
  count: (s.runes || []).length,
  stash: (s.runes || []).map((r) => r.id + r.kind + r.tier).join(','),
  eq: SLOT_IDS.map((id) => {
    const it = s.equipment[id];
    if (!it) return '-';
    return it.id + it.rarity + '[' + (it.runes || []).map((r) => (r ? r.kind + r.tier : '0')).join('.') + ']';
  }).join(','),
});

/* malý žeton runy (emoji + barevný okraj) — sdílí ho soket i karta skladu */
function RuneChip({ rune, size = 'md' }) {
  return (
    <span
      className={'rune-chip ' + size}
      style={{ '--rune': runeColor(rune), '--tier': runeTierColor(rune) }}
      title={`${runeName(rune)} · ${runeTierName(rune)} · ${runeStatLabel(rune)}`}
    >
      {runeEmoji(rune)}
    </span>
  );
}

/* jeden soket kusu — vsazená runa (klik = vyndat) nebo prázdný (klik = vsadit vybranou) */
function Socket({ rune, armed, onClick }) {
  return (
    <button
      type="button"
      className={'rune-socket' + (rune ? ' filled' : '') + (!rune && armed ? ' armed' : '')}
      onClick={onClick}
      style={rune ? { '--rune': runeColor(rune), '--tier': runeTierColor(rune) } : undefined}
      title={rune ? `${runeName(rune)} (${runeTierName(rune)}) — klepni pro vyndání` : armed ? 'Klepni pro vsazení vybrané runy' : 'Prázdný soket'}
    >
      {rune ? runeEmoji(rune) : '＋'}
    </button>
  );
}

/* nasazený kus + jeho sokety (kus se mění ve Výbavě 🎒; tady jen socketuješ) */
function EquipRow({ slot, item, armed, onSocketClick }) {
  if (!item) {
    return (
      <div className="rune-equip empty">
        <span className="rune-equip-slot">{slot.emoji} {slot.name}</span>
        <span className="rune-equip-hint">nasaď kus ve Výbavě 🎒</span>
      </div>
    );
  }
  const cap = socketCount(item);
  const runes = item.runes || [];
  return (
    <div className="rune-equip" style={{ '--rc': rarityColor(item) }}>
      <span className="rune-equip-ico">{itemEmoji(item)}</span>
      <span className="rune-equip-info">
        <span className="rune-equip-name">{itemName(item)}</span>
        <span className="rune-equip-rar" style={{ color: rarityColor(item) }}>{rarityName(item)} · {cap}× soket</span>
      </span>
      <span className="rune-sockets">
        {Array.from({ length: cap }, (_, i) => (
          <Socket key={i} rune={runes[i] || null} armed={armed} onClick={() => onSocketClick(item, i)} />
        ))}
      </span>
    </div>
  );
}

export default function RunesModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(selectSig, shallowEqual); // trigger re-renderu
  const s = engine.state;
  const dust = Math.floor(s.dust || 0);
  const [sel, setSel] = useState(null); // id vybrané runy ze skladu

  if (!s.runesUnlocked) {
    return (
      <Modal onClose={onClose} className="runes-modal">
        <h2>🔣 Runy & sokety</h2>
        <p className="inv-locked-text">
          Runy — <b>„Pivní tácky"</b> — se odemknou, jakmile dosáhneš <b>úrovně {RUNES_CFG.unlockLevel}</b>.
          Padají z <b>Eki Archónů</b> (a mega bossů) nebo si je vykuješ z <b>úlomků 💠</b>. Vsadíš je do
          <b> soketů</b> nasazené výbavy (počet soketů dle vzácnosti kusu) a přidají bounded bonus.
          <b> Tři tácky stejné barvy</b> v soketech dají navíc barevný bonus. Runy přežívají rebirth!
        </p>
        <div className="rune-legend locked-preview">
          {RUNE_LIST.map((def) => (
            <div key={def.id} className="rune-legend-item" style={{ '--rune': def.hex }}>
              <span className="rune-chip md" style={{ '--rune': def.hex, '--tier': def.hex }}>{def.emoji}</span>
              <span className="rune-legend-name">{def.name}</span>
              <span className="rune-legend-stat">{def.colorName}</span>
            </div>
          ))}
        </div>
        <p className="sub" style={{ textAlign: 'center' }}>Nejvyšší úroveň: {s.highestLevel} / {RUNES_CFG.unlockLevel}</p>
      </Modal>
    );
  }

  const selRune = sel ? s.runes.find((r) => r.id === sel) : null;
  const sets = activeRuneSets(s.equipment);
  const groups = groupRunes(s.runes).sort((a, b) => (b.tier - a.tier) || a.kind.localeCompare(b.kind));
  const fusable = groups.filter((g) => canFuse(s.runes, g.kind, g.tier));
  const stash = [...s.runes].sort((a, b) => (b.tier - a.tier) || a.kind.localeCompare(b.kind));
  const cap = RUNES_CFG.stashCap;
  const craftCost = RUNES_CFG.craftCost;

  function onSocketClick(item, idx) {
    const occupied = item.runes && item.runes[idx];
    if (selRune) {
      engine.socketRune(item.id, idx, selRune.id);
      setSel(null);
    } else if (occupied) {
      engine.unsocketRune(item.id, idx);
    }
  }

  return (
    <Modal onClose={onClose} className="runes-modal">
      <h2>🔣 Runy <span className="inv-dust" title="Úlomky — kovárna run">💠 {fmt(dust)}</span></h2>

      <div className="rune-loadout">
        <span className="inv-summary-label">
          Sokety nasazené výbavy{selRune && <em className="rune-armed-hint"> — klepni soket pro vsazení {runeName(selRune)}</em>}
        </span>
        <div className="rune-equip-list">
          {SLOTS.map((slot) => (
            <EquipRow key={slot.id} slot={slot} item={s.equipment[slot.id]} armed={!!selRune} onSocketClick={onSocketClick} />
          ))}
        </div>
      </div>

      {sets.length > 0 && (
        <div className="rune-sets">
          <span className="inv-summary-label">Barevné sady</span>
          <div className="rune-sets-list">
            {sets.map((set) => (
              <span key={set.color} className={'rune-set' + (set.active ? ' on' : '')} style={{ '--rune': set.hex }}>
                {set.emoji} {set.colorName} <b>{set.count}/{set.threshold}</b>
                {set.active && <span className="rune-set-bonus"> {set.bonusLabel}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rune-forge">
        <span className="inv-summary-label">Kovárna run</span>
        <div className="rune-forge-row">
          <button
            className="chest-btn buy"
            disabled={dust < craftCost || stash.length >= cap}
            onClick={() => engine.craftRune()}
            title={stash.length >= cap ? 'Sklad run je plný' : 'Vykuj náhodný tácek za úlomky'}
          >Vykovat tácek 💠 {fmt(craftCost)}</button>
          {fusable.length === 0 ? (
            <span className="rune-forge-hint">Slévání: měj {RUNES_CFG.fuseCount}× stejný tácek (kind+tier) → vyšší tier.</span>
          ) : (
            <div className="rune-fuse-list">
              {fusable.map((g) => (
                <button
                  key={g.key}
                  className="rune-fuse-btn"
                  disabled={dust < RUNES_CFG.fuseCost}
                  onClick={() => engine.fuseRunes(g.kind, g.tier)}
                  style={{ '--rune': runeColor({ kind: g.kind }) }}
                  title={`Slij ${RUNES_CFG.fuseCount}× ${runeName({ kind: g.kind })} (${runeTierName({ tier: g.tier })}) na vyšší tier`}
                >
                  {runeEmoji({ kind: g.kind })} Slij {RUNES_CFG.fuseCount}× T{g.tier}→T{g.tier + 1} · 💠{fmt(RUNES_CFG.fuseCost)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rune-stash">
        <div className="rune-stash-head">
          <span className="inv-summary-label">Sklad tácků</span>
          <span className="inv-count">{stash.length} / {cap}</span>
        </div>
        {stash.length === 0 ? (
          <p className="inv-empty">Zatím žádné runy — padají z Archónů a mega bossů, nebo je vykuj z úlomků 💠.</p>
        ) : (
          <div className="rune-grid">
            {stash.map((rune) => (
              <button
                key={rune.id}
                type="button"
                className={'rune-card' + (sel === rune.id ? ' selected' : '')}
                style={{ '--rune': runeColor(rune), '--tier': runeTierColor(rune) }}
                onClick={() => setSel(sel === rune.id ? null : rune.id)}
                title="Klepni pro výběr, pak klepni soket nahoře"
              >
                <RuneChip rune={rune} size="lg" />
                <span className="rune-card-name">{runeName(rune)}</span>
                <span className="rune-card-tier" style={{ color: runeTierColor(rune) }}>{runeTierName(rune)}</span>
                <span className="rune-card-stat">{runeStatLabel(rune)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="pet-foot">Tap-to-socket: vyber tácek ve skladu, pak klepni prázdný soket. Klepnutí na vsazený tácek ho vrátí do skladu. Runy přežívají rebirth, mizí jen s koncem sezóny.</p>
    </Modal>
  );
}
