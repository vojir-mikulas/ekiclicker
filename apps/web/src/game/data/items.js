/* =========================================================================
   ITEMS — kořist, vybavení a afixy (pozdní hra, odemyká se na ITEMS.unlockLevel).
   ČISTÁ data + generace (žádný stav, žádné DOM) → sdílí engine i simulátor.

   Návrhový princip (drží anti-runaway / anti-blitz filozofii hry):
   - Vybavení přidává jen SOUČET procent (1 + Σ), NIKDY další exponenciální motor.
     Jediné exponenciály zůstávají power/rage (viz formulas.globalMult).
   - Síla je v procentech → škáluje sama s úrovní (×2 je ×2 kdekoli, žádná
     potřeba honit čísla jen kvůli relevanci).
   - Vyšší ilvl/vzácnost = větší a víc afixů → lov o lepší kusy, pořád v mezích.
   - Vybavení PŘEŽÍVÁ rebirth. Jeho síla se SNAPSHOTuje do obtížnosti při startu
     běhu (gearPower → difficultyScale, stejně jako prestige) → posouvá zeď dál,
     ale blitz zůstává OMEZENÝ. Kusy nalezené v běhu jsou čistý zisk (zaúčtují se
     až do příštího běhu).
   ========================================================================= */

export const ITEMS = {
  unlockLevel: 1000, // od této NEJVYŠŠÍ dosažené úrovně se výbava odemkne (sniž pro testy)
  invCap: 60,        // strop inventáře — při zaplnění padne nejslabší kus
  ilvlScale: 1500,   // velikost afixu roste o +100 % za každých tolik úrovní ilvl
  rarityLiftPer: 1200, // s ilvl se váhy posouvají k vyšším vzácnostem (čím nižší, tím rychleji)

  // šance na drop podle typu nepřítele
  dropChance: 0.012,
  bossDropChance: 0.5,
  megaDropChance: 1,
  ultraDropChance: 1,
};

/* ----------------------------- kovárna (úlomky 💠) -----------------------------
   Pozdní smyčka kolem vybavení: každý zahozený kus se ROZLOŽÍ na úlomky (nic se
   neztratí — ani přetečení plného inventáře). Úlomky se sypou zpět do kusů:
   - PŘEROLOVÁNÍ: nové afixy (staty i hodnoty), drží slot/base/vzácnost/ilvl → lov
     na správnou kombinaci statů a vysoký roll.
   - POVÝŠENÍ VZÁCNOSTI: o tier výš (common→…→mythic) → přeškáluje afixy a přidá
     další slot. Velký sink → cíl: udělat z dobrého base mýtický kus.
   Pořád jen BOUNDED % (žádný nový exponenciál) — drží anti-runaway filozofii. */
export const FORGE = {
  dustBase: 5,         // úlomky za běžný (common) kus ilvl 0
  dustIlvlScale: 1500, // +100 % hodnoty/ceny za tolik ilvl (stejná škála jako afixy)
  rerollBase: 24,      // základ ceny přerolování (× rarity mult × ilvl)
  upgradeBase: 60,     // základ ceny povýšení vzácnosti
  upgradeGrowth: 2.4,  // cena povýšení × growth^cílový_tier (mythic je drahý)
};

/* ----------------------------- sady (set bonusy) -----------------------------
   Sada = několik konkrétních základů (po jednom na slot) označených stejným `set`
   v BASES. Nasazení 2/4 kusů přidá bounded-% bonus (počítá se přes aggregateEquip
   jako afixy → promítne se i do snapshotu obtížnosti, stejně jako ostatní vybavení).
   `brawler` = čtyři ilvl-0 základy (snadný, slabší). `eternal` = top-tier (padá
   hlavně z Eki Archóna → propojení s novým bossem). */
export const SETS = {
  brawler: {
    name: 'Pouliční rváč', emoji: '🥊',
    desc: 'Boxer + základní výbava — slabší, ale jde zkompletovat brzy.',
    bonuses: [
      { pieces: 2, stats: { punchPct: 0.12 } },
      { pieces: 4, stats: { punchPct: 0.30, critChance: 0.04 } },
    ],
  },
  eternal: {
    name: 'Věčný', emoji: '♾️',
    desc: 'Endgame sada — kompletní kusy padají hlavně z Eki Archóna.',
    bonuses: [
      { pieces: 2, stats: { dmgPct: 0.12 } },
      { pieces: 4, stats: { dmgPct: 0.30, goldPct: 0.20 } },
    ],
  },
};

/* ----------------------------- sloty ----------------------------- */
export const SLOTS = [
  { id: 'weapon', name: 'Zbraň',    emoji: '⚔️', hint: 'mění emoji úderu' },
  { id: 'gloves', name: 'Rukavice', emoji: '🧤', hint: '' },
  { id: 'charm',  name: 'Talisman', emoji: '💍', hint: '' },
  { id: 'aura',   name: 'Aura',     emoji: '🛡️', hint: '' },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

/* ----------------------------- afixy ----------------------------- */
/* base = hodnota afixu při ilvl 0 / common / jitter 1.
   kind řídí formátování i smysl: pct = násobné %, pp = procentní body (krit šance),
   flat = přičtení k násobiči, ms = milisekundy. */
export const AFFIXES = {
  dmgPct:     { name: 'poškození',        base: 0.04, kind: 'pct' },
  punchPct:   { name: 'síla úderu',       base: 0.08, kind: 'pct' },
  weaponPct:  { name: 'poškození zbraní', base: 0.05, kind: 'pct' },
  critChance: { name: 'šance na krit',    base: 0.01, kind: 'pp'  },
  critMult:   { name: 'krit násobič',     base: 0.15, kind: 'flat' },
  goldPct:    { name: 'zlato',            base: 0.06, kind: 'pct' },
  luck:       { name: 'štěstí',           base: 0.05, kind: 'pct' },
  frenzyDur:  { name: 'trvání zuřivosti', base: 350,  kind: 'ms'  },
};

/* Pool afixů na slot. `primary` se nasadí vždy jako první (charakter slotu);
   zbytek se losuje z `pool`. */
const SLOT_POOLS = {
  weapon: { primary: 'punchPct',  pool: ['dmgPct', 'critChance', 'critMult', 'weaponPct'] },
  gloves: { primary: 'weaponPct', pool: ['dmgPct', 'critChance', 'frenzyDur'] },
  charm:  { primary: 'goldPct',   pool: ['critChance', 'critMult', 'luck', 'dmgPct'] },
  aura:   { primary: 'dmgPct',    pool: ['weaponPct', 'frenzyDur', 'goldPct', 'critChance'] },
};

/* ----------------------------- vzácnosti ----------------------------- */
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const RARITIES = {
  common:    { name: 'Běžný',      mult: 1,   affixes: 1, weight: 100, color: '#9aa3b8' },
  rare:      { name: 'Vzácný',     mult: 1.6, affixes: 2, weight: 42,  color: '#46a0ff' },
  epic:      { name: 'Epický',     mult: 2.5, affixes: 3, weight: 14,  color: '#c06bff' },
  legendary: { name: 'Legendární', mult: 4,   affixes: 4, weight: 3.4, color: '#ff9d2b' },
  mythic:    { name: 'Mýtický',    mult: 6,   affixes: 5, weight: 0.6, color: '#ff4d6d' },
};

/* ----------------------------- základy (emoji + tier) -----------------------------
   Pro slot 'weapon' určuje base EMOJI ÚDERU hráče (👊 → 🥊 → ⚔️ …) — to je ta
   "meč místo holé pěsti" mechanika. U ostatních slotů je base čistě kosmetika.
   Vyšší tier = vyšší minIlvl → hezčí kusy padají hlouběji ve hře. */
const BASES = {
  weapon: [
    { id: 'fist',     emoji: '👊', name: 'Holé pazoury',     minIlvl: 0 },
    { id: 'knuckles', emoji: '🥊', name: 'Mosazný argument',         minIlvl: 0,    set: 'brawler' },
    { id: 'chair',    emoji: '🪑', name: 'Hospodská židle', minIlvl: 200 },
    { id: 'dagger',   emoji: '🔪', name: 'Vystřelovací kudla',         minIlvl: 300 },
    { id: 'sword',    emoji: '⚔️', name: 'Řízný meč',           minIlvl: 800 },
    { id: 'trident',  emoji: '🔱', name: 'Neptunovo párátko',     minIlvl: 1600, set: 'eternal' },
    { id: 'bolt',     emoji: '⚡', name: 'Boží trest',  minIlvl: 3200 },
    { id: 'star',     emoji: '🌟', name: 'Vesmírná pecka',  minIlvl: 6000 },
  ],
  gloves: [
    { id: 'mitt',  emoji: '🧤', name: 'Rukavice na špínu',  minIlvl: 0,    set: 'brawler' },
    { id: 'belt',  emoji: '🥋', name: 'Skoro černý pásek',  minIlvl: 1200 },
    { id: 'wing',  emoji: '🪽', name: 'Andělská křídla',    minIlvl: 4000, set: 'eternal' },
  ],
  charm: [
    { id: 'ring',   emoji: '💍', name: 'Prsten z automatu',  minIlvl: 0,    set: 'brawler' },
    { id: 'beads',  emoji: '📿', name: 'Babiččiny korále',  minIlvl: 1200 },
    { id: 'orb',    emoji: '🔮', name: 'Věštecká koule',   minIlvl: 4000, set: 'eternal' },
  ],
  aura: [
    { id: 'shield', emoji: '🛡️', name: 'Pokličkový štít',    minIlvl: 0,    set: 'brawler' },
    { id: 'spark',  emoji: '✨', name: 'Bojové třpytky',  minIlvl: 1200 },
    { id: 'swirl',  emoji: '🌀', name: 'Vír zkázy',     minIlvl: 4000, set: 'eternal' },
  ],
};
/* slot -> id -> base (rychlé dohledání pro emoji/název) */
export const BASE_BY = Object.fromEntries(
  Object.entries(BASES).map(([slot, list]) => [slot, Object.fromEntries(list.map((b) => [b.id, b]))])
);

/* setId -> { slot: baseId } — odvozeno z `set` tagů v BASES (pro počítání sad
   a pro cílený drop kusů sady z Archóna). */
export const SET_PIECES = {};
for (const [slot, list] of Object.entries(BASES)) {
  for (const b of list) if (b.set) (SET_PIECES[b.set] ||= {})[slot] = b.id;
}

/* ----------------------------- generace ----------------------------- */
const rnd = () => Math.random();
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let _seq = 0;
function makeId() {
  _seq = (_seq + 1) % 1e6;
  return 'i' + Date.now().toString(36) + _seq.toString(36) + Math.floor(rnd() * 1296).toString(36);
}

/* Vzácnost: s ilvl se váhy vyšších tierů zvedají (lift^tierIndex). */
export function rollRarity(level) {
  const lift = 1 + Math.max(0, level) / ITEMS.rarityLiftPer;
  let total = 0;
  const acc = RARITY_ORDER.map((id, i) => {
    total += RARITIES[id].weight * Math.pow(lift, i);
    return { id, upto: total };
  });
  const r = rnd() * total;
  for (const x of acc) if (r <= x.upto) return x.id;
  return 'common';
}

/* Base: z dostupných (minIlvl ≤ ilvl) váž k vyšším tierům (index+1). */
export function rollBase(slot, level) {
  const list = BASES[slot];
  const eligible = list.filter((b) => b.minIlvl <= level);
  const pool = eligible.length ? eligible : [list[0]];
  let total = 0;
  const acc = pool.map((b, i) => {
    total += i + 1;
    return { b, upto: total };
  });
  const r = rnd() * total;
  for (const x of acc) if (r <= x.upto) return x.b;
  return pool[pool.length - 1];
}

function roundAffix(stat, value) {
  switch (AFFIXES[stat].kind) {
    case 'ms': return Math.round(value / 10) * 10;
    case 'flat': return Math.round(value * 100) / 100;
    default: return Math.round(value * 1000) / 1000; // pct / pp
  }
}

export function affixValue(stat, level, rarity) {
  const def = AFFIXES[stat];
  const ilvlMult = 1 + Math.max(0, level) / ITEMS.ilvlScale;
  const jitter = 0.85 + rnd() * 0.3;
  return roundAffix(stat, def.base * RARITIES[rarity].mult * ilvlMult * jitter);
}

/* Vyber a naroluj afixy pro slot/ilvl/vzácnost (sdílí drop, reroll i drop sady). */
function rollAffixesFor(slot, level, rarity) {
  const n = RARITIES[rarity].affixes;
  const { primary, pool } = SLOT_POOLS[slot];
  const stats = [primary];
  const extra = shuffle(pool.filter((x) => x !== primary));
  for (let i = 0; stats.length < n && i < extra.length; i++) stats.push(extra[i]);
  while (stats.length < n) stats.push(primary); // víc afixů než statů → duplikát (sečte se)
  return stats.map((stat) => ({ stat, value: affixValue(stat, level, rarity) }));
}

/* Vygeneruj jeden kus pro daný ilvl (= úroveň nepřítele, který ho upustil). */
export function rollItem(level) {
  const slot = SLOT_IDS[Math.floor(rnd() * SLOT_IDS.length)];
  const rarity = rollRarity(level);
  const base = rollBase(slot, level);
  return { id: makeId(), slot, base: base.id, rarity, ilvl: level, affixes: rollAffixesFor(slot, level, rarity) };
}

/* Cílený drop kusu sady (Eki Archón). Slot náhodně z kusů sady; vzácnost aspoň
   `rarityFloor`, ale může padnout i vyšší. */
export function rollSetItem(level, setId, rarityFloor = 'legendary') {
  const pieces = SET_PIECES[setId];
  if (!pieces) return rollItem(level);
  const slots = Object.keys(pieces);
  const slot = slots[Math.floor(rnd() * slots.length)];
  let rarity = rollRarity(level);
  if (RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(rarityFloor)) rarity = rarityFloor;
  return { id: makeId(), slot, base: pieces[slot], rarity, ilvl: level, affixes: rollAffixesFor(slot, level, rarity) };
}

/* ----------------------------- kovárna: úlomky / reroll / povýšení ----------------------------- */
export const nextRarity = (rarity) => {
  const i = RARITY_ORDER.indexOf(rarity);
  return i >= 0 && i < RARITY_ORDER.length - 1 ? RARITY_ORDER[i + 1] : null;
};

/* Úlomky za rozložení kusu (čím vzácnější a vyšší ilvl, tím víc). */
export function salvageValue(item) {
  if (!item) return 0;
  const ilvlMult = 1 + Math.max(0, item.ilvl || 0) / FORGE.dustIlvlScale;
  return Math.max(1, Math.round(FORGE.dustBase * (RARITIES[item.rarity]?.mult || 1) * ilvlMult));
}

export function rerollCost(item) {
  const ilvlMult = 1 + Math.max(0, item.ilvl || 0) / FORGE.dustIlvlScale;
  return Math.ceil(FORGE.rerollBase * (RARITIES[item.rarity]?.mult || 1) * ilvlMult);
}

/* Přerolování: nové afixy, drží slot/base/vzácnost/ilvl. Vrací NOVÝ kus (čistá fce). */
export function rerollItem(item) {
  return { ...item, affixes: rollAffixesFor(item.slot, item.ilvl, item.rarity) };
}

export function upgradeRarityCost(item) {
  const next = nextRarity(item.rarity);
  if (!next) return Infinity;
  const ti = RARITY_ORDER.indexOf(next); // 1..4
  const ilvlMult = 1 + Math.max(0, item.ilvl || 0) / FORGE.dustIlvlScale;
  return Math.ceil(FORGE.upgradeBase * Math.pow(FORGE.upgradeGrowth, ti) * ilvlMult);
}

/* Povýšení vzácnosti o tier: přeškáluje stávající afixy poměrem mult a přidá
   nový afixový slot. Vrací NOVÝ kus (čistá fce). */
export function upgradeRarity(item) {
  const next = nextRarity(item.rarity);
  if (!next) return item;
  const ratio = RARITIES[next].mult / RARITIES[item.rarity].mult;
  const affixes = item.affixes.map((a) => ({ stat: a.stat, value: roundAffix(a.stat, a.value * ratio) }));
  const targetN = RARITIES[next].affixes;
  const { primary, pool } = SLOT_POOLS[item.slot];
  while (affixes.length < targetN) {
    const used = new Set(affixes.map((a) => a.stat));
    const fresh = [primary, ...pool].filter((x) => !used.has(x));
    const stat = fresh.length ? fresh[Math.floor(rnd() * fresh.length)] : primary;
    affixes.push({ stat, value: affixValue(stat, item.ilvl, next) });
  }
  return { ...item, rarity: next, affixes };
}

/* ----------------------------- bedny / rulety (CS:GO styl) -----------------------------
   Kořist nepadá jako kus rovnou — padají BEDNY (counts ve state.chests). Otevření
   spustí ruletu (vizuál), ale VÝSLEDEK SE ZAÚČTUJE HNED při otevření (engine) → zavření
   ani reload nic nezmění (anti-exploit). Tady jsou jen ČISTÁ data + losování.
   `rarityFloor` = podlaha vzácnosti, `setBias` = losuje kus sady „Věčný",
   `missChance` = šance na prázdnou (malá útěcha v úlomcích `missDust`),
   `cost` = cena v úlomcích (jen u kupované „vykované" bedny). */
export const CHESTS = {
  wooden: { id: 'wooden', name: 'Bedna',           emoji: '📦', glow: '#9aa3b8', rarityFloor: null,        setBias: false, missChance: 0.10, missDust: 6 },
  golden: { id: 'golden', name: 'Zlatá bedna',      emoji: '🟨', glow: '#ffd23f', rarityFloor: 'rare',      setBias: false, missChance: 0.05, missDust: 20 },
  archon: { id: 'archon', name: 'Archónská truhla', emoji: '👁️', glow: '#b97aff', rarityFloor: 'legendary', setBias: true,  missChance: 0,    missDust: 0 },
  dust:   { id: 'dust',   name: 'Vykovaná bedna',   emoji: '💠', glow: '#46d6e0', rarityFloor: 'epic',      setBias: false, missChance: 0.15, missDust: 120, cost: 600 },
};
export const CHEST_ORDER = ['wooden', 'golden', 'archon', 'dust'];
export const chestMissDust = (tier) => CHESTS[tier]?.missDust || 0;
export const chestCost = (tier) => CHESTS[tier]?.cost || 0;

function rollRarityFloor(level, floor) {
  const r = rollRarity(level);
  return floor && RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(floor) ? floor : r;
}

/* Jeden kus s podlahou vzácnosti (pro bedny). */
export function rollItemFloor(level, floor) {
  const slot = SLOT_IDS[Math.floor(rnd() * SLOT_IDS.length)];
  const rarity = rollRarityFloor(level, floor);
  const base = rollBase(slot, level);
  return { id: makeId(), slot, base: base.id, rarity, ilvl: level, affixes: rollAffixesFor(slot, level, rarity) };
}

/* Výsledek otevření bedny: { miss, item }. Volá engine PŘI otevření (zaúčtuje hned). */
export function rollChestResult(tier, level) {
  const def = CHESTS[tier];
  if (!def) return { miss: false, item: rollItem(level) };
  if (def.missChance && rnd() < def.missChance) return { miss: true, item: null };
  const item = def.setBias
    ? rollSetItem(level, 'eternal', def.rarityFloor || 'legendary')
    : rollItemFloor(level, def.rarityFloor);
  return { miss: false, item };
}

/* Pásek pro ruletu (jen VIZUÁL). Výhra je na pevném `landingIndex`; okolo decoye,
   v sousedních buňkách občas „skoro" vysoká vzácnost (near-miss napětí). */
export function buildRouletteStrip(tier, level, result, landingIndex, length) {
  const def = CHESTS[tier] || {};
  const decoy = (nearMiss) => {
    const slot = SLOT_IDS[Math.floor(rnd() * SLOT_IDS.length)];
    let rarity = rollRarityFloor(level, def.rarityFloor);
    if (nearMiss && rnd() < 0.6) rarity = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, RARITY_ORDER.indexOf(rarity) + 2)];
    const base = rollBase(slot, level);
    return { rarity, base: base.id, emoji: BASE_BY[slot][base.id].emoji, color: RARITIES[rarity].color };
  };
  const cells = [];
  for (let i = 0; i < length; i++) {
    if (i === landingIndex) {
      cells.push(result.miss
        ? { miss: true, emoji: '💨', color: '#6a7185' }
        : { rarity: result.item.rarity, base: result.item.base, emoji: itemEmoji(result.item), color: rarityColor(result.item), win: true });
    } else {
      cells.push(decoy(Math.abs(i - landingIndex) === 1));
    }
  }
  return cells;
}

/* ----------------------------- agregace / síla ----------------------------- */
const ZERO = () => ({
  dmgPct: 0, punchPct: 0, weaponPct: 0, critChance: 0, critMult: 0, goldPct: 0, luck: 0, frenzyDur: 0,
});

/* Stav sad podle nasazených kusů → pro UI i pro bonusy.
   Vrací [{ id, name, emoji, pieces, total, tiers:[{pieces,stats,active}] }]. */
export function activeSets(equipment) {
  const counts = {};
  if (equipment) for (const slot of SLOT_IDS) {
    const it = equipment[slot];
    const setId = it && BASE_BY[slot]?.[it.base]?.set;
    if (setId) counts[setId] = (counts[setId] || 0) + 1;
  }
  const out = [];
  for (const id in counts) {
    const def = SETS[id];
    if (!def) continue;
    out.push({
      id, name: def.name, emoji: def.emoji, pieces: counts[id],
      total: Object.keys(SET_PIECES[id] || {}).length,
      tiers: def.bonuses.map((b) => ({ ...b, active: counts[id] >= b.pieces })),
    });
  }
  return out;
}

/* Součet bounded-% bonusů z aktivních sad (sčítá se k afixům ve aggregateEquip). */
export function setBonusSum(equipment) {
  const sum = ZERO();
  for (const set of activeSets(equipment)) {
    for (const t of set.tiers) {
      if (!t.active) continue;
      for (const stat in t.stats) if (sum[stat] != null) sum[stat] += t.stats[stat];
    }
  }
  return sum;
}

/* setId kusu (pro odznak sady v UI). */
export const itemSet = (item) => baseDef(item)?.set || null;

/* Součet všech afixů z NASAZENÝCH kusů + bonusů z dokončených sad
   (čistá funkce nad equipment objektem). */
export function aggregateEquip(equipment) {
  const sum = ZERO();
  if (!equipment) return sum;
  for (const slot of SLOT_IDS) {
    const it = equipment[slot];
    if (!it || !it.affixes) continue;
    for (const a of it.affixes) {
      if (sum[a.stat] != null) sum[a.stat] += a.value;
    }
  }
  const setSum = setBonusSum(equipment);
  for (const k in sum) sum[k] += setSum[k];
  return sum;
}

/* Globální násobič poškození z vybavení (1 + Σ dmgPct) — TOHLE se snapshotuje
   do obtížnosti při startu běhu (viz formulas.difficultyScale). */
export function gearPower(equipment) {
  return 1 + aggregateEquip(equipment).dmgPct;
}

/* Hrubá síla kusu pro řazení v UI a auto-rozklad nejslabšího při plném inventáři. */
export function itemScore(item) {
  if (!item || !item.affixes) return 0;
  let s = 0;
  for (const a of item.affixes) s += a.value / (AFFIXES[a.stat]?.base || 1);
  return s * (1 + (item.ilvl || 0) / 5000);
}

/* ----------------------------- prezentace ----------------------------- */
export function baseDef(item) {
  return BASE_BY[item.slot]?.[item.base];
}
export function itemEmoji(item) {
  return baseDef(item)?.emoji || SLOT_BY_ID[item.slot]?.emoji || '❔';
}
/* Jen název základu (vtipný) — vzácnost se ukazuje zvlášť jako barevný štítek
   (vyhne se to nesedící české koncovce typu „Mýtický Hospodská židle"). */
export function itemName(item) {
  return baseDef(item)?.name || SLOT_BY_ID[item.slot]?.name || '???';
}
export function rarityName(item) {
  return RARITIES[item?.rarity]?.name || '';
}
export function rarityColor(item) {
  return RARITIES[item?.rarity]?.color || '#9aa3b8';
}

/* Emoji úderu hráče = nasazená zbraň (jinak holá pěst). Používá FxManager. */
export function equippedWeaponEmoji(s) {
  const w = s.equipment?.weapon;
  return w ? itemEmoji(w) : '👊';
}

export function affixLabel(a) {
  const def = AFFIXES[a.stat];
  if (!def) return '';
  switch (def.kind) {
    case 'pct': return `+${(a.value * 100).toFixed(a.value * 100 < 10 ? 1 : 0)} % ${def.name}`;
    case 'pp':  return `+${(a.value * 100).toFixed(1)} % ${def.name}`;
    case 'flat': return `+${a.value.toFixed(2)} ${def.name}`;
    case 'ms':  return `+${(a.value / 1000).toFixed(1)} s ${def.name}`;
    default: return `+${a.value} ${def.name}`;
  }
}
