/* =========================================================================
   RUNES — runy & sokety („Pivní tácky", pozdní endgame, odemyká se na
   RUNES_CFG.unlockLevel). ČISTÁ data + losování (žádný stav, žádné DOM) →
   sdílí engine i simulátor.

   Návrhový princip (drží stejnou anti-runaway filozofii jako items.js/pets.js):
   - Runa přidá JEN bounded-% bonus (sdílí klíče afixů s výbavou → combatStats).
     ZÁMĚRNĚ žádný dmgPct → ŽÁDNÝ vliv na obtížnost/blitz (jako deník/album).
   - Sokety jsou na NASAZENÉ výbavě; jejich počet plyne z vzácnosti kusu
     (RARITIES[...].sockets, viz items.js → socketCount). Runa se vsadí do
     soketu, hodnota škáluje jen s TIEREM (kvalita) → stropované, ne runaway.
   - „Barevná sada": dost run STEJNÉ barvy v soketech přidá malý bonus barvy.
   - Runy PŘEŽÍVAJÍ rebirth (jako výbava/úlomky). Hluboký sink pro 💠 úlomky:
     vykování náhodné runy + slévání (fuse) tří stejných na vyšší tier.
   ========================================================================= */
import { AFFIXES, affixLabel, RARITIES, SLOT_IDS } from './items.js';

export const RUNES_CFG = {
  unlockLevel: 2500,    // nejvyšší dosažená úroveň, od které se runy odemknou (sniž pro testy)
  stashCap: 80,         // strop skladu run — při zaplnění padne místo runy útěcha v úlomcích
  fullDust: 60,         // útěcha v 💠, když runa padne do plného skladu
  // drop: runesUnlocked je TRVALÝ příznak → každý rebirth běh přehrává pásmo 1→zeď a
  // cestou potká ~5 archónů + stovku mega/ultra. Při starých sazbách (archón zaručeně)
  // to dělalo ~29 run za běh → sklad přetékal. Sazby jsou níž + platí TVRDÝ STROP run
  // za běh (maxRunesPerRun) → ~1–2 runy/běh. Archón zůstává hlavní (nejvyšší) zdroj,
  // ale už NE zaručeně (jinak by sám naplnil strop). Volume kryje kovárna run (💠 sink).
  archonDropChance: 0.25,  // Archón (po 500 — hlavní, nejvyšší šance)
  megaDropChance: 0.004,   // mega/ultra boss (po 25/100 — malá šance)
  maxRunesPerRun: 2,       // strop run za jeden běh → ~1–2 runy/běh
  // kovárna run (💠 sink)
  craftCost: 420,       // vykování JEDNÉ náhodné runy
  fuseCount: 3,         // kolik stejných run (kind+tier) se slije na +1 tier
  fuseCost: 160,        // 💠 navíc za slití
  // barevná sada
  setThreshold: 3,      // kolik run stejné barvy v soketech → bonus barvy
  setMult: 2.5,         // bonus barvy = base statu × tohle (bounded malý zisk)
  tierLiftPer: 2500,    // s úrovní se váhy dropu posouvají k vyšším tierům
};

/* ----------------------------- runy (typy) -----------------------------
   color = klíč „barvy" pro barevnou sadu (3+ stejné barvy v soketech → bonus).
   stat = klíč afixu (sdílí s výbavou → affixLabel umí formátovat). base =
   hodnota bonusu na tieru 1; škáluje RUNE_TIERS[].mult. ZÁMĚRNĚ bez dmgPct. */
export const RUNES = {
  zlatak:  { id: 'zlatak',  emoji: '🟡', name: 'Zlatý tácek',    color: 'amber', colorName: 'Zlatá',  hex: '#ffd23f', stat: 'goldPct',   base: 0.05 },
  modrak:  { id: 'modrak',  emoji: '🔵', name: 'Chmelový tácek', color: 'blue',  colorName: 'Modrá',  hex: '#46a0ff', stat: 'weaponPct', base: 0.04 },
  rudak:   { id: 'rudak',   emoji: '🔴', name: 'Řízný tácek',    color: 'red',   colorName: 'Rudá',   hex: '#ff4d6d', stat: 'critMult',  base: 0.12 },
  zelenak: { id: 'zelenak', emoji: '🟢', name: 'Šťastný tácek',  color: 'green', colorName: 'Zelená', hex: '#46d6a0', stat: 'luck',      base: 0.05 },
};
export const RUNE_IDS = Object.keys(RUNES);
export const RUNE_LIST = RUNE_IDS.map((id) => RUNES[id]);
export const RUNE_BY_COLOR = Object.fromEntries(RUNE_LIST.map((r) => [r.color, r]));

/* Tiery (kvalita). mult škáluje hodnotu, weight řídí drop (vyšší = vzácnější). */
export const RUNE_TIERS = [
  { tier: 1, name: 'Otlučený', mult: 1,   weight: 100, color: '#9aa3b8' },
  { tier: 2, name: 'Obyčejný', mult: 1.7, weight: 38,  color: '#46a0ff' },
  { tier: 3, name: 'Leštěný',  mult: 2.8, weight: 11,  color: '#c06bff' },
  { tier: 4, name: 'Zlatý',    mult: 4.2, weight: 2.4, color: '#ff9d2b' },
];
export const MAX_TIER = RUNE_TIERS.length;
export const tierDef = (tier) => RUNE_TIERS[Math.max(1, Math.min(tier || 1, MAX_TIER)) - 1];

/* ----------------------------- generace ----------------------------- */
const rnd = () => Math.random();
let _seq = 0;
function makeRuneId() {
  _seq = (_seq + 1) % 1e6;
  return 'r' + Date.now().toString(36) + _seq.toString(36) + Math.floor(rnd() * 1296).toString(36);
}

function roundRune(stat, value) {
  // krit násobič je 'flat' (2 desetinná), zbytek pct (3 desetinná) — jako afixy výbavy
  return AFFIXES[stat]?.kind === 'flat' ? Math.round(value * 100) / 100 : Math.round(value * 1000) / 1000;
}

/* Hodnota bonusu runy = base statu × tier mult (škáluje JEN s tierem → bounded). */
export function runeValue(kind, tier) {
  const def = RUNES[kind];
  if (!def) return 0;
  return roundRune(def.stat, def.base * tierDef(tier).mult);
}

/* Tier: s úrovní se váhy vyšších tierů zvedají (lift^index), jako rollRarity. */
export function rollTier(level) {
  const lift = 1 + Math.max(0, level) / RUNES_CFG.tierLiftPer;
  let total = 0;
  const acc = RUNE_TIERS.map((t, i) => {
    total += t.weight * Math.pow(lift, i);
    return { tier: t.tier, upto: total };
  });
  const r = rnd() * total;
  for (const x of acc) if (r <= x.upto) return x.tier;
  return 1;
}

/* Jedna runa pro daný level (kind uniformně, tier vážený levelem). */
export function rollRune(level) {
  const kind = RUNE_IDS[Math.floor(rnd() * RUNE_IDS.length)];
  return { id: makeRuneId(), kind, tier: rollTier(level) };
}

/* Vyrob runu s konkrétním kind/tier (výsledek slévání). Čistá fce s novým id. */
export function mintRune(kind, tier) {
  return { id: makeRuneId(), kind, tier: Math.max(1, Math.min(tier || 1, MAX_TIER)) };
}

/* ----------------------------- sokety / síla ----------------------------- */
const STAT_KEYS = Object.keys(AFFIXES);
const zeroStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

/* Bonus jedné barevné sady (počet stejné barvy ≥ setThreshold) = base × setMult. */
function colorSetBonus(color) {
  const def = RUNE_BY_COLOR[color];
  return def ? roundRune(def.stat, def.base * RUNES_CFG.setMult) : 0;
}

/* Součet bounded-% bonusů ze VŠECH run v soketech nasazené výbavy + barevné sady.
   Vrací plnou ZERO mapu (klíče afixů) → čistě se sčítá s equipStats/petStats/album
   ve formulas.combatStats. ZÁMĚRNĚ neobsahuje dmgPct → žádný vliv na obtížnost. */
export function socketStats(equipment) {
  const out = zeroStats();
  if (!equipment) return out;
  const colorCounts = {};
  for (const slot of SLOT_IDS) {
    const it = equipment[slot];
    const runes = it && it.runes;
    if (!runes) continue;
    const cap = socketCount(it);
    for (let i = 0; i < cap; i++) {
      const r = runes[i];
      const def = r && RUNES[r.kind];
      if (!def) continue;
      if (out[def.stat] != null) out[def.stat] += runeValue(r.kind, r.tier);
      colorCounts[def.color] = (colorCounts[def.color] || 0) + 1;
    }
  }
  for (const color in colorCounts) {
    if (colorCounts[color] < RUNES_CFG.setThreshold) continue;
    const def = RUNE_BY_COLOR[color];
    if (def && out[def.stat] != null) out[def.stat] += colorSetBonus(color);
  }
  return out;
}

/* Počet soketů kusu (plyne z jeho vzácnosti, viz RARITIES[...].sockets). */
export function socketCount(item) {
  return (item && RARITIES[item.rarity]?.sockets) || 0;
}

/* Stav barevných sad pro UI: [{ color, colorName, hex, count, threshold, active, bonusLabel }]. */
export function activeRuneSets(equipment) {
  const counts = {};
  if (equipment) for (const slot of SLOT_IDS) {
    const it = equipment[slot];
    const runes = it && it.runes;
    if (!runes) continue;
    const cap = socketCount(it);
    for (let i = 0; i < cap; i++) {
      const r = runes[i];
      const def = r && RUNES[r.kind];
      if (def) counts[def.color] = (counts[def.color] || 0) + 1;
    }
  }
  return RUNE_LIST.map((def) => {
    const count = counts[def.color] || 0;
    return {
      color: def.color, colorName: def.colorName, hex: def.hex, emoji: def.emoji,
      count, threshold: RUNES_CFG.setThreshold, active: count >= RUNES_CFG.setThreshold,
      bonusLabel: affixLabel({ stat: def.stat, value: colorSetBonus(def.color) }),
    };
  }).filter((s) => s.count > 0);
}

/* ----------------------------- kovárna run (slévání) ----------------------------- */
/* Seskup sklad run podle kind+tier → [{ key, kind, tier, count, ids }] (pro fuse v UI). */
export function groupRunes(stash) {
  const map = new Map();
  for (const r of stash || []) {
    const key = r.kind + ':' + r.tier;
    if (!map.has(key)) map.set(key, { key, kind: r.kind, tier: r.tier, count: 0, ids: [] });
    const g = map.get(key);
    g.count++;
    g.ids.push(r.id);
  }
  return [...map.values()];
}

/* Lze slít? (dost stejných run a tier není na maximu). */
export function canFuse(stash, kind, tier) {
  if (tier >= MAX_TIER) return false;
  const g = groupRunes(stash).find((x) => x.kind === kind && x.tier === tier);
  return !!g && g.count >= RUNES_CFG.fuseCount;
}

/* ----------------------------- prezentace ----------------------------- */
export const runeDef = (r) => (r && RUNES[r.kind]) || null;
export const runeEmoji = (r) => runeDef(r)?.emoji || '⬜';
export const runeName = (r) => runeDef(r)?.name || '???';
export const runeColor = (r) => runeDef(r)?.hex || '#9aa3b8';
export const runeTierName = (r) => tierDef(r?.tier).name;
export const runeTierColor = (r) => tierDef(r?.tier).color;

/* Štítek bonusu runy (přes affixLabel — sdílí formát s výbavou). */
export function runeStatLabel(r) {
  const def = runeDef(r);
  if (!def) return '';
  return affixLabel({ stat: def.stat, value: runeValue(r.kind, r.tier) });
}
