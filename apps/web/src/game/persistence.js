/* Ukládání / načítání + offline výdělek. */
import { CONFIG } from './config.js';
import { createState, createAlbum, createMastery } from './initialState.js';
import { totalDps, goldMult, enemyReward, forgivenessGain } from './formulas.js';
import { gearPower } from './data/items.js';
import { petPower } from './data/pets.js';
import { backfillGear } from './data/album.js';

const SAVE_KEY = 'ekiClickerSaveV3';
/* Staré klíče z předchozích verzí hry. Když je najdeme a nový save chybí,
   hráč musí začít znovu — ale dostane veteránský dárek za starou snahu. */
const LEGACY_KEYS = ['ekiClickerSaveV2', 'ekiClickerSave'];

/* Synchronní kontrolní podpis save (cyrb53). save() běží i v beforeunload,
   kde nejde čekat na async Web Crypto, proto sync hash. Klíč je v balíčku →
   tohle NENÍ kryptografie: cílem je jen znesnadnit ruční úpravu save přes
   DevTools (zvedá laťku, ne zeď). Odhodlaný útočník si podpis přepočítá. */
const SIG_KEY = 'eki-🥊-podpis-v3';
function sign(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = SIG_KEY + str + SIG_KEY;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* Sestaví podepsaný save „blob“ (bez zápisu). Sdílí ho lokální save i
   synchronizace na server (žebříček/obnova účtu) — server ho uschová a při
   obnově ho vrátíme zpět; podpis pak sedí i po opětovném načtení. */
export function buildSnapshot(state) {
  const payload = {
    v: 3,
    gold: state.gold,
    level: state.level,
    highestLevel: state.highestLevel,
    upgrades: state.upgrades,
    weapons: state.weapons,
    prestige: state.prestige,
    achievements: state.achievements,
    album: state.album, // sběratelský deník — Bestiář + Arzenál (přežívá rebirth i obnovu účtu)
    stats: state.stats,
    daily: state.daily, // denní úkoly + streak (přenese se i přes obnovu účtu)
    // pozdní hra: kořist/vybavení (aditivní — starý save bez nich se načte prázdný)
    inventory: state.inventory,
    equipment: state.equipment,
    inventoryUnlocked: state.inventoryUnlocked,
    dust: state.dust,
    chests: state.chests, // neotevřené bedny (pendingOpen se ZÁMĚRNĚ neukládá — viz hydrate)
    // pozdní endgame: mazlíčci (aditivní — starý save bez nich se načte prázdný)
    petsUnlocked: state.petsUnlocked,
    pets: state.pets,
    equippedPet: state.equippedPet,
    eggs: state.eggs, // nevylíhnutá vejce (pendingEgg se ZÁMĚRNĚ neukládá — viz hydrate)
    // runy & sokety: sklad nevsazených run (vsazené runy jedou uvnitř equipment/inventory)
    runesUnlocked: state.runesUnlocked,
    runes: state.runes,
    // zaklínání: jen příznak odemčení (zaklínadla jedou uvnitř equipment/inventory;
    // pendingEnchant se ZÁMĚRNĚ neukládá — viz hydrate)
    enchantingUnlocked: state.enchantingUnlocked,
    // mistrovská mřížka 🔱: nevyutracené body + ranky uzlů (aditivní — starý save = prázdná)
    masteryUnlocked: state.masteryUnlocked,
    mastery: state.mastery,
    runGearPower: state.runGearPower,
    // elixíry: aktivní buff (until = epoch ms) + sklad (aditivní — starý save bez nich = prázdný)
    elixir: state.elixir,
    elixirStock: state.elixirStock,
    elixirsUnlocked: state.elixirsUnlocked,
    buyAmount: state.buyAmount,
    t: Date.now(),
  };
  payload.sig = sign(JSON.stringify(payload)); // podpis se přidá až nakonec
  return payload;
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSnapshot(state)));
  } catch {
    /* náhled / privátní režim — ignoruj */
  }
}

/* Namapuje save blob (z localStorage nebo ze serveru) na čerstvý herní stav.
   Bez ověření podpisu — to dělá load() u localStorage; serveru věříme. */
export function hydrateState(d) {
  const state = createState();
  state.gold = d.gold || 0;
  state.level = d.level || 1;
  state.highestLevel = Math.max(d.highestLevel || 1, state.level);
  Object.assign(state.upgrades, d.upgrades);
  Object.assign(state.weapons, d.weapons);
  Object.assign(state.prestige, d.prestige);
  Object.assign(state.stats, d.stats);
  state.achievements = d.achievements || {};
  state.daily = d.daily || null; // engine.refreshDaily() narolí, když chybí / je z jiného dne
  // pozdní hra: kořist/vybavení (starý save → prázdné, vše null)
  state.inventory = Array.isArray(d.inventory) ? d.inventory : [];
  if (d.equipment) Object.assign(state.equipment, d.equipment);
  // sběratelský deník (starý save → prázdný); objevené záznamy: id -> true
  state.album = createAlbum();
  if (d.album && typeof d.album === 'object') {
    if (d.album.enemies) Object.assign(state.album.enemies, d.album.enemies);
    if (d.album.gear) Object.assign(state.album.gear, d.album.gear);
    state.album.new = d.album.new || 0;
  }
  // doplň objevené ZÁKLADY z aktuální výbavy/inventáře (kusy z doby před deníkem)
  backfillGear(state.album, state.equipment, state.inventory);
  state.inventoryUnlocked = !!d.inventoryUnlocked;
  state.dust = d.dust || 0;
  state.chests = (d.chests && typeof d.chests === 'object') ? d.chests : {};
  // pendingOpen se NEnačítá: výsledek otevření je už zaúčtovaný (kus v inventáři /
  // útěcha v úlomcích) → po reloadu žádná „viselka" rulety = nejde tím nic zcheatovat.
  state.pendingOpen = null;
  // pozdní endgame: mazlíčci (starý save → prázdné)
  state.petsUnlocked = !!d.petsUnlocked;
  state.pets = (d.pets && typeof d.pets === 'object') ? d.pets : {};
  state.equippedPet = d.equippedPet || null;
  state.eggs = d.eggs || 0;
  state.pendingEgg = null; // líhnutí je už zaúčtované (stejně jako pendingOpen) → po reloadu pryč
  // runy & sokety (starý save → prázdné); vsazené runy se načtou uvnitř equipment/inventory
  state.runesUnlocked = !!d.runesUnlocked;
  state.runes = Array.isArray(d.runes) ? d.runes : [];
  // zaklínání (zaklínadla jedou uvnitř equipment/inventory); stůl je přechodný → po reloadu pryč
  state.enchantingUnlocked = !!d.enchantingUnlocked;
  state.pendingEnchant = null;
  // mistrovská mřížka 🔱 (starý save → prázdná); přežívá rebirth, mizí jen s koncem sezóny
  state.masteryUnlocked = !!d.masteryUnlocked;
  state.mastery = (d.mastery && typeof d.mastery === 'object' && d.mastery.nodes)
    ? { points: d.mastery.points || 0, nodes: { ...d.mastery.nodes } }
    : createMastery();
  state.runGearPower = d.runGearPower || gearPower(state.equipment) * petPower(state);
  // elixíry: sklad (aditivní) + běžící buff jen pokud ještě nevypršel (jinak zahodit)
  state.elixirStock = (d.elixirStock && typeof d.elixirStock === 'object') ? d.elixirStock : {};
  state.elixir = (d.elixir && d.elixir.active && Date.now() < d.elixir.until)
    ? { active: d.elixir.active, until: d.elixir.until }
    : { active: null, until: 0 };
  state.elixirsUnlocked = !!d.elixirsUnlocked;
  state.buyAmount = d.buyAmount || 1;
  return state;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignoruj */
  }
}

/* Najde nejlepší starý save (z předchozí verze hry), spočítá veteránský dárek
   a staré klíče smaže — dárek se tak připíše jen jednou. Vrátí
   { forgiveness, oldLevel, rebirths } nebo null, když žádný starý save není. */
function claimLegacyGift() {
  let best = null;
  for (const key of LEGACY_KEYS) {
    let d;
    try {
      d = JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      d = null;
    }
    if (d) {
      const lvl = Math.max(Number(d.highestLevel) || 1, Number(d.level) || 1);
      if (!best || lvl > best.oldLevel) {
        best = {
          oldLevel: lvl,
          rebirths: Number(d.prestige?.rebirths) || 0,
          leftover: Number(d.prestige?.forgiveness) || 0,
        };
      }
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignoruj */
    }
  }
  if (!best) return null;

  // Dárek = nevyužité Odpuštění + přepočtený postup + bonus za rebirthy.
  // Minimum je štědré, ať i začátečník dostane pořádný startovní balík.
  const forgiveness = Math.max(
    20,
    best.leftover + forgivenessGain(best.oldLevel) + best.rebirths * 5
  );
  return { forgiveness, oldLevel: best.oldLevel, rebirths: best.rebirths };
}

/* Vrátí { state, offline, gift } nebo null.
   - Platný nový save → { state, offline }.
   - Chybí nový, ale je tu starý (jiná verze hry) → čerstvý stav + veteránský
     dárek: { state, offline: null, gift }.
   - Úplně nový hráč → null (čerstvá hra bez dárku). */
export function load() {
  let d;
  try {
    d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch {
    return null;
  }
  if (!d) {
    const gift = claimLegacyGift();
    if (!gift) return null;
    const state = createState();
    state.prestige.forgiveness = gift.forgiveness;
    save(state); // zamkni dárek hned (pro případ rychlého reloadu)
    return { state, offline: null, gift };
  }

  // Integrita: podepsaný save musí podpisem sedět. Save BEZ podpisu = starý
  // (z doby před touhle verzí) → propustíme ho (při příštím save() se podepíše).
  // Save s NESEDÍCÍM podpisem = ručně upravený → zahodíme (čerstvá hra).
  // Pozn.: až budou všichni hráči přemigrovaní, dá se tu chybějící podpis začít
  // odmítat (strict mód) — pak je obejití dražší (přepsat podpis z balíčku).
  if (d.sig !== undefined) {
    const { sig, ...rest } = d;
    if (sign(JSON.stringify(rest)) !== sig) return null;
  }

  const state = hydrateState(d);

  // offline výdělek: DPS × čas pryč, zastropováno
  let offline = null;
  if (d.t) {
    const away = Math.max(0, (Date.now() - d.t) / 1000);
    const capped = Math.min(away, CONFIG.offlineCapH * 3600);
    const gold = Math.floor(totalDps(state) * capped * CONFIG.offlineRate);
    if (away >= 60 && gold >= 1) offline = { away, gold };
  }
  return { state, offline };
}

/* Pomocná: hrubý odhad offline výdělku pro UI (nepoužívá se k zápisu). */
export function estimateReward(state) {
  return enemyReward(state.level, { hp: 1, gold: 1 }, goldMult(state));
}
