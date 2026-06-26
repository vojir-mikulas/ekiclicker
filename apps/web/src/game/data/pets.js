/* =========================================================================
   PETS — mazlíčci (pozdní endgame, odemyká se na PETS.unlockLevel).
   ČISTÁ data + losování (žádný stav, žádné DOM) → sdílí engine i simulátor.

   Návrhový princip (drží stejnou anti-runaway filozofii jako items.js):
   - Jeden NASAZENÝ mazlíček přidá JEDEN bounded-% bonus (sdílí klíče afixů s
     výbavou → promítne se do existujících formulek, NIKDY nový exponenciál).
   - Mazlíček PŘEŽÍVÁ rebirth (jako výbava). Jeho dmg% se SNAPSHOTuje do
     obtížnosti při startu běhu (petPower → difficultyScale) → posouvá zeď dál,
     ale blitz zůstává OMEZENÝ (stejný mechanismus jako gearPower).
   - Vejce 🥚 padají z nepřátel (od unlockLevel). Líhnou se „casem" (commit-at-open
     jako bedny): buď NOVÝ mazlíček, nebo +1 ÚROVEŇ u už vlastněného (duplikát →
     síla). Síla roste s úrovní, ale je STROPOVANÁ (max) → bounded, ne runaway.
   ========================================================================= */

import { AFFIXES, affixLabel, RARITIES, RARITY_ORDER } from './items.js';

export const PETS_CFG = {
  unlockLevel: 2000,   // nejvyšší dosažená úroveň, od které se mazlíčci odemknou
  // Šance na drop vejce podle typu nepřítele. ZÁMĚRNĚ NÍZKO + TVRDÝ STROP za běh:
  // petsUnlocked je TRVALÝ příznak → každý rebirth běh přehrává celé pásmo 1→zeď a
  // cestou potká stovky bossů. Při starých sazbách (+ zaručené archón vejce) to dělalo
  // ~19 vajec za běh → mazlíčci vymaxováni za pár běhů a „líhnutí" ztratilo náboj.
  // Sazby jsou ~8× níž a navíc platí maxEggsPerRun → ~1–2 vejce za běh = vzácný
  // endgame lov. Vyšší boss-tier = vyšší šance (zrcadlí items.js); Archón už NEDÁVÁ
  // vejce zaručeně (jinak by sám naplnil strop) — jen nejvyšší šanci.
  eggDropChance: 0.00009,    // běžný nepřítel (objemový zdroj — drž nízko)
  eggBossDropChance: 0.0015,  // boss (Golden Eki, po 5)
  eggMegaDropChance: 0.009,  // mega boss (Eki Král, po 25)
  eggUltraDropChance: 0.038, // ultra boss (Eki Titán, po 100)
  eggArchonDropChance: 0.075, // Archón (po 500 — nejvzácnější, nejvyšší šance)
  maxEggsPerRun: 2,    // strop vajec za jeden běh → ~1–2 mazlíčci/běh
  maxDupeDust: 250,    // útěcha v úlomcích 💠, když padne duplikát už vymaxovaného mazlíčka

  /* --- Evoluce mazlíčků (pozdní endgame NAD samotnými mazlíčky; sub-feature pets) ---
     Odemyká se na evolveUnlockLevel (vlastní TRVALÝ příznak petEvolveUnlocked — highestLevel
     se rebirthem resetuje, proto na ni nelze gateovat). Jen mazlíček na MAX ÚROVNI jde
     „evolvovat" přes ⭐ stupně. Každý stupeň: (1) posune PRIMÁRNÍ bonus o bounded krok NAD
     strop úrovně (evo * base * evoPrimaryFrac) a (2) přidá DRUHÝ bounded stat (def.evoStat) →
     další hloubka, ale pořád BOUNDED (žádný nový exponenciál; jediný dmgPct ze snapshotu
     zůstává primár Ohniváka — promítne se do petPower jako dřív). Palivo = VEJCE 🥚 (+ úlomky
     💠) → vejce mají smysl i po dosbírání kolekce: drop-gate se posune z „všichni na max
     úrovni" (allPetsMaxed) na „všichni vyevolvovaní" (allPetsEvolved). */
  evolveUnlockLevel: 2222, // nejvyšší úroveň, od které jde evolvovat
  evoMaxTier: 5,           // počet ⭐ stupňů evoluce
  evoPrimaryFrac: 0.25,    // přírůstek primáru za stupeň = evo * base * frac (bounded)
};

/* Cena postupu na další ⭐ (index = AKTUÁLNÍ stupeň evoluce 0..evoMaxTier-1). Roste s
   tierem; vejce jsou hlavní (vzácné) palivo, úlomky 💠 jsou vedlejší sink. Celkem za plnou
   evoluci jednoho mazlíčka = 20 vajec + 23 000 💠 → dlouhý ocas pro dosbíranou kolekci. */
const EVO_EGG_COST = [2, 3, 4, 5, 6];
const EVO_DUST_COST = [1500, 2500, 4000, 6000, 9000];

/* ----------------------------- vzácnost mazlíčků -----------------------------
   Vzácnost řídí ŠANCI NA DROP z vejce (vzácnější = nižší váha) a barvu/štítek v UI.
   Názvy + barvy SDÍLÍME s výbavou (items.RARITIES) → hráč už ty barvy zná z inventáře,
   takže legendární mazlíček vypadá „legendárně" stejně jako legendární kus. Váhy jsou
   ale PET-specifické (6 entit, jiné ladění než kořist): spektrum je záměrně mírnější,
   ať i nejvzácnější dračí mazlíček zůstane reálně ulovitelný (vejce padají vzácně). */
export const PET_RARITY_WEIGHT = {
  common: 100, rare: 55, epic: 28, legendary: 12, mythic: 5,
};

/* ----------------------------- mazlíčci -----------------------------
   stat = klíč afixu (sdílí s výbavou → affixLabel umí formátovat i bonus).
   base = hodnota bonusu na úrovni 1; per = přírůstek za každou další úroveň;
   max  = strop úrovně (duplikáty nad ním → útěcha v úlomcích);
   rarity = tier vzácnosti → odvozuje váhu dropu (PET_RARITY_WEIGHT) i barvu v UI
   (vzácnější = méně častý). dmgPct/univerzální Ohnivák je nejvyšší tier = nejvzácnější. */
export const PETS = {
  ohnivak: {
    id: 'ohnivak', emoji: '🐉', name: 'Ohnivák',
    stat: 'dmgPct', base: 0.10, per: 0.04, max: 20, rarity: 'legendary',
    evoStat: 'critChance', evoPer: 0.004, // evoluce: žhavé krity
    desc: 'Dýchá oheň na všechno poškození. Nejvzácnější a univerzální.',
  },
  orel: {
    id: 'orel', emoji: '🦅', name: 'Orel Bombarďák',
    stat: 'weaponPct', base: 0.12, per: 0.05, max: 20, rarity: 'epic',
    evoStat: 'frenzyDur', evoPer: 120, // evoluce: kobercové nálety prodlouží zuřivost
    desc: 'Shazuje shora — posílí poškození zbraní (auto-DPS).',
  },
  rostak: {
    id: 'rostak', emoji: '🐕', name: 'Rošťák',
    stat: 'critChance', base: 0.03, per: 0.012, max: 20, rarity: 'rare',
    evoStat: 'critMult', evoPer: 0.04, // evoluce: kousne tvrději (krit násobič)
    desc: 'Kouše do slabin. Pořádně zvedne šanci na krit.',
  },
  kocour: {
    id: 'kocour', emoji: '🐈‍⬛', name: 'Kocour Rváč',
    stat: 'punchPct', base: 0.12, per: 0.05, max: 20, rarity: 'rare',
    evoStat: 'critChance', evoPer: 0.004, // evoluce: rváčské drápy → víc kritů
    desc: 'Pouliční drsňák — posílí každý tvůj úder.',
  },
  myval: {
    id: 'myval', emoji: '🦝', name: 'Mýval Lupič',
    stat: 'goldPct', base: 0.12, per: 0.05, max: 20, rarity: 'common',
    evoStat: 'luck', evoPer: 0.02, // evoluce: čmuchá i po štěstí
    desc: 'Šmejdí v popelnicích a nosí ti drobné navíc.',
  },
  sova: {
    id: 'sova', emoji: '🦉', name: 'Sova Věštkyně',
    stat: 'luck', base: 0.10, per: 0.04, max: 20, rarity: 'common',
    evoStat: 'goldPct', evoPer: 0.02, // evoluce: věští i výhodné kšefty (zlato)
    desc: 'Vidí budoucnost — častěji ti přivolá Lucky Eki.',
  },
};

export const PET_IDS = Object.keys(PETS);
export const PET_LIST = PET_IDS.map((id) => PETS[id]);
export const PET_COUNT = PET_IDS.length;

/* ----------------------------- síla / agregace ----------------------------- */
const STAT_KEYS = Object.keys(AFFIXES);
const zeroStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

export const petLevelCap = (id) => PETS[id]?.max || 1;

/* true, když hráč VLASTNÍ všechny mazlíčky a každý je na stropu úrovně → sběr je
   kompletní. Pak vejce přestanou padat (viz engine.maybeDropEgg) — žádné další
   vejce, jen útěchové úlomky, by stejně nic nepřinesla, tak je radši nedáváme. */
export function allPetsMaxed(pets) {
  if (!pets) return false;
  for (const id of PET_IDS) {
    const owned = pets[id];
    if (!owned || (owned.level || 0) < petLevelCap(id)) return false;
  }
  return true;
}

/* true, když VŠICHNI mazlíčci jsou na max úrovni I na max evoluci → z vajec už nic
   nezískáš (ani level, ani ⭐), tak po odemčení evoluce přestanou padat (maybeDropEgg). */
export function allPetsEvolved(pets) {
  if (!pets) return false;
  for (const id of PET_IDS) {
    const owned = pets[id];
    if (!owned) return false;
    if ((owned.level || 0) < petLevelCap(id)) return false;
    if ((owned.evo || 0) < PETS_CFG.evoMaxTier) return false;
  }
  return true;
}

/* Hodnota bonusu mazlíčka na dané úrovni (stropovaná na max). */
export function petBonus(def, level) {
  if (!def) return 0;
  const L = Math.max(1, Math.min(level || 1, def.max));
  return def.base + (L - 1) * def.per;
}

/* --- evoluce: bonusy + cena ---
   Přírůstek PRIMÁRNÍHO statu z evoluce (bounded, NAD strop úrovně). */
export function evoPrimaryBonus(def, evo) {
  if (!def || !evo) return 0;
  return evo * def.base * PETS_CFG.evoPrimaryFrac;
}

/* Hodnota DRUHÉHO (evolučního) statu na daném stupni (0 bez evoluce / bez evoStat). */
export function evoSecondaryBonus(def, evo) {
  if (!def || !evo || !def.evoStat) return 0;
  return evo * def.evoPer;
}

/* Cena postupu z aktuálního stupně `evo` na další ⭐ (null = už na max evoluci). */
export function petEvoCost(evo) {
  const i = evo || 0;
  if (i >= PETS_CFG.evoMaxTier) return null;
  return { eggs: EVO_EGG_COST[i], dust: EVO_DUST_COST[i] };
}

/* Bonus NASAZENÉHO mazlíčka jako mapa statů (sčítá se k afixům výbavy ve formulkách).
   Vrací vždy plnou ZERO mapu (se statem doplněným) → čisté sčítání s equipStats.
   Evoluce: primár roste o evoPrimaryBonus, a přibyde druhý stat (def.evoStat). */
export function equippedPetStats(s) {
  const out = zeroStats();
  const id = s && s.equippedPet;
  if (!id) return out;
  const owned = s.pets && s.pets[id];
  const def = PETS[id];
  if (!owned || !def) return out;
  const evo = owned.evo || 0;
  out[def.stat] = petBonus(def, owned.level) + evoPrimaryBonus(def, evo);
  if (def.evoStat) out[def.evoStat] = (out[def.evoStat] || 0) + evoSecondaryBonus(def, evo);
  return out;
}

/* Násobič poškození z mazlíčka (1 + dmg%) — SNAPSHOTuje se do obtížnosti při
   startu běhu (vedle gearPower), stejně jako vybavení → anti-blitz zůstává v mezích. */
export function petPower(s) {
  return 1 + equippedPetStats(s).dmgPct;
}

/* Váha dropu mazlíčka = váha jeho tieru vzácnosti (vzácnější tier → nižší váha). */
export const petDropWeight = (id) => PET_RARITY_WEIGHT[PETS[id]?.rarity] || 0;

/* ----------------------------- losování ----------------------------- */
/* Z vejce vypadne mazlíček vážený podle vzácnosti (vzácní jsou méně pravděpodobní). */
export function rollPetId() {
  let total = 0;
  for (const id of PET_IDS) total += petDropWeight(id);
  let r = Math.random() * total;
  for (const id of PET_IDS) {
    r -= petDropWeight(id);
    if (r <= 0) return id;
  }
  return PET_IDS[0];
}

/* ----------------------------- prezentace ----------------------------- */
export const petName = (id) => PETS[id]?.name || '???';
export const petEmoji = (id) => PETS[id]?.emoji || '🐾';
export const petDesc = (id) => PETS[id]?.desc || '';

/* Vzácnost mazlíčka + její štítek/barva (sdílí s výbavou přes items.RARITIES). */
export const petRarity = (id) => PETS[id]?.rarity || 'common';
export const petRarityName = (id) => RARITIES[petRarity(id)]?.name || '';
export const petRarityColor = (id) => RARITIES[petRarity(id)]?.color || '#9aa3b8';

/* Pořadí vzácnosti (vyšší = vzácnější) → pro řazení mřížky. */
export const petRarityRank = (id) => RARITY_ORDER.indexOf(petRarity(id));

/* PET_LIST seřazený od NEJVZÁCNĚJŠÍHO po běžné (stabilní tiebreaker = původní pořadí)
   → mřížka v UI ukáže prestižní úlovky nahoře. Explicitní řazení, ať nezávisí na
   pořadí klíčů v PETS. */
export const PET_LIST_BY_RARITY = PET_LIST
  .map((def, i) => ({ def, i }))
  .sort((a, b) => petRarityRank(b.def.id) - petRarityRank(a.def.id) || a.i - b.i)
  .map((x) => x.def);

/* Štítek PRIMÁRNÍHO bonusu mazlíčka (přes affixLabel — sdílí formát s výbavou).
   `evo` je volitelný → s evolucí ukáže navýšenou hodnotu (zpětně kompatibilní, default 0). */
export function petBonusLabel(id, level, evo = 0) {
  const def = PETS[id];
  if (!def) return '';
  return affixLabel({ stat: def.stat, value: petBonus(def, level) + evoPrimaryBonus(def, evo) });
}

/* Štítek DRUHÉHO (evolučního) bonusu na daném stupni (přes affixLabel). '' bez evoluce. */
export function petEvoBonusLabel(id, evo) {
  const def = PETS[id];
  if (!def || !def.evoStat || !evo) return '';
  return affixLabel({ stat: def.evoStat, value: evoSecondaryBonus(def, evo) });
}
