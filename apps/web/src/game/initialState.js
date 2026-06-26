import { WEAPONS } from './data/weapons.js';
import { UPGRADE_KEYS } from './data/upgrades.js';
import { PRESTIGE_KEYS, CAPSTONE_KEYS } from './data/prestige.js';
import { SLOT_IDS, gearPower } from './data/items.js';
import { petPower } from './data/pets.js';

export function createWeapons() {
  const w = {};
  for (const def of WEAPONS) w[def.id] = 0;
  return w;
}

export function createUpgrades() {
  const u = {};
  for (const k of UPGRADE_KEYS) u[k] = 0;
  return u;
}

export function createPrestige() {
  const p = { forgiveness: 0, rebirths: 0 };
  for (const k of PRESTIGE_KEYS) p[k] = 0;
  for (const k of CAPSTONE_KEYS) p[k] = 0; // tier-2 capstones (stejný objekt)
  return p;
}

/* Prázdné sloty vybavení (slot -> nasazený kus nebo null). */
export function createEquipment() {
  const e = {};
  for (const id of SLOT_IDS) e[id] = null;
  return e;
}

/* Prázdný sběratelský deník (Bestiář + Arzenál). Objevené záznamy: id -> true.
   `new` = počet objevů, které hráč ještě neviděl (odznak v topbaru). */
export function createAlbum() {
  return { enemies: {}, gear: {}, new: 0 };
}

/* Prázdná mistrovská mřížka (paragon strom). `points` = nevyutracené 🔱,
   `nodes` = id uzlu -> rank. Přežívá rebirth (jako prestige), mizí jen s koncem sezóny. */
export function createMastery() {
  return { points: 0, nodes: {} };
}

export function createStats() {
  return {
    totalClicks: 0,
    totalGold: 0,
    kills: 0,
    bossKills: 0,
    ultraKills: 0,
    archonKills: 0,
    lootDoves: 0,
    maxCombo: 0,
    frenzies: 0,
    luckyClicks: 0,
    playTimeMs: 0,
    peakDps: 0,
    itemsFound: 0,
    chestsFound: 0,
    eggsFound: 0,
    runesFound: 0,
    raidWins: 0,    // vyhrané přepady v aréně (pro úspěchy/statistiky; sezónně jako zbytek statů)
    raidPlunder: 0, // celkem nakradeno zlata z přepadů (do trezoru)
  };
}

/* Čerstvý herní stav (nový hráč). */
export function createState() {
  return {
    gold: 0,
    level: 1,
    highestLevel: 1,
    upgrades: createUpgrades(),
    weapons: createWeapons(),
    prestige: createPrestige(),
    achievements: {}, // id -> true
    album: createAlbum(), // sběratelský deník — Bestiář + Arzenál (přežívá rebirth)
    stats: createStats(),
    enemy: null,
    combo: { count: 0, lastClickAt: 0 },
    frenzy: { active: false, until: 0, charge: 0 },
    // elixíry: jeden aktivní buff naráz (until = Date.now epoch ms → přežije reload se zbytkem)
    // + sklad koupených (přežívá rebirth jako bedny/vejce). Odemčou se na úrovni 1500.
    elixir: { active: null, until: 0 },
    elixirStock: {}, // id -> počet koupených
    elixirsUnlocked: false, // odemkne se na ELIXIRS_CFG.unlockLevel = 1500 (přežívá rebirth)
    lucky: null,
    daily: null, // denní úkoly — narolují se při startu/změně dne (engine.refreshDaily)
    // --- pozdní hra: kořist / vybavení (odemyká se na ITEMS.unlockLevel) ---
    inventory: [],               // nenasazené kusy
    equipment: createEquipment(), // slot -> nasazený kus | null (přežívá rebirth)
    inventoryUnlocked: false,     // jednou true → zůstává (přežívá rebirth)
    dust: 0,                      // úlomky 💠 z rozkladu kořisti (kovárna; přežívá rebirth)
    chests: {},                   // tier -> počet neotevřených beden (přežívá rebirth)
    itemsThisRun: 0,              // počet náhodných beden, co padly v TOMTO běhu (strop ITEMS.maxChestsPerRun; reset rebirth)
    pendingOpen: null,            // PŘECHODNÝ vizuál rulety (neukládá se; výsledek je už zaúčtovaný)
    runGearPower: 1,              // snapshot síly vybavení + mazlíčka na startu běhu → obtížnost
    // --- pozdní endgame: mazlíčci (odemyká se na PETS_CFG.unlockLevel = 2000) ---
    petsUnlocked: false,          // jednou true → zůstává (přežívá rebirth)
    pets: {},                     // petId -> { level } — vlastnění mazlíčci (přežívá rebirth)
    equippedPet: null,            // petId nasazeného mazlíčka | null (jeden naráz; přežívá rebirth)
    eggs: 0,                      // nevylíhnutá vejce 🥚 (přežívá rebirth)
    eggsThisRun: 0,               // počet vajec, co padla v TOMTO běhu (strop PETS_CFG.maxEggsPerRun; reset rebirth)
    pendingEgg: null,             // PŘECHODNÝ vizuál líhnutí (neukládá se; výsledek je už zaúčtovaný)
    // --- pozdní endgame: runy & sokety (odemyká se na RUNES_CFG.unlockLevel = 2500) ---
    runesUnlocked: false,         // jednou true → zůstává (přežívá rebirth)
    runes: [],                    // sklad nevsazených run („Pivní tácky"; přežívá rebirth)
    runesThisRun: 0,              // počet run, co padly v TOMTO běhu (strop RUNES_CFG.maxRunesPerRun; reset rebirth)
    // --- pozdní endgame: zaklínání (odemyká se na ENCHANTS_CFG.unlockLevel = 3000) ---
    enchantingUnlocked: false,    // jednou true → zůstává (přežívá rebirth)
    pendingEnchant: null,         // PŘECHODNÝ vizuál zaklínacího stolu (neukládá se; zaklití je už v kusu)
    // --- pozdní endgame: mistrovská mřížka 🔱 (odemyká se na MASTERY.unlockLevel = 4000) ---
    masteryUnlocked: false,       // jednou true → zůstává (přežívá rebirth)
    mastery: createMastery(),     // { points, nodes } — paragon strom (přežívá rebirth; resetRun ho nechá být)
    // --- časový režim: Pekelný výtah 🛗 (odemyká se na HELLEVATOR.unlockLevel = 100) ---
    hellevatorUnlocked: false,    // jednou true → zůstává (přežívá rebirth)
    hell: { bestFloor: 0, passes: 0, passAt: 0, freeDay: '', lastRunDay: '' }, // rekord + žetony + denní 🔥 bonus (přežívá rebirth, mře sezónou)
    sira: 0,                      // 🔥 Síra — měna z výtahu (přežívá rebirth, mře sezónou)
    hellShop: {},                 // koupené bounded perky (id -> tier; přežívá rebirth)
    hellExch: { day: '', dust: 0 }, // denní strop směny 🔥→💠
    hellRun: null,                // PŘECHODNÝ stav běhu (neukládá se — jako pendingOpen)
    // --- téma sezóny (server-derived z čísla sezóny; NEUKLÁDÁ se do save ani skóre) ---
    seasonTheme: null,            // { id, mods } aktivní sezóny | null — bounded buff bez dmgPct (viz data/seasonThemes.js)
    buyAmount: 1,
  };
}

/* Reset jen "běhu" (po rebirthu) — prestige, achievementy, staty a VYBAVENÍ
   zůstávají. Síla vybavení se zaúčtuje do obtížnosti tohoto běhu (snapshot). */
export function resetRun(state, startLevel) {
  state.gold = 0;
  state.level = startLevel;
  state.highestLevel = startLevel;
  state.upgrades = createUpgrades();
  state.weapons = createWeapons();
  state.combo = { count: 0, lastClickAt: 0 };
  state.frenzy = { active: false, until: 0, charge: 0 };
  state.elixir = { active: null, until: 0 }; // běžící buff rebirth nepřežije (sklad ano)
  state.lucky = null;
  state.enemy = null;
  state.pendingOpen = null; // přechodná ruleta — rebirth ji nenese
  state.pendingEgg = null;  // přechodné líhnutí — rebirth ho nenese
  state.pendingEnchant = null; // přechodný zaklínací stůl — rebirth ho nenese
  state.itemsThisRun = 0;   // strop náhodných beden je per-běh → na začátku běhu vynuluj
  state.eggsThisRun = 0;    // strop vajec je per-běh → na začátku běhu vynuluj
  state.runesThisRun = 0;   // strop run je per-běh → na začátku běhu vynuluj
  state.hellRun = null;     // přechodný běh výtahu — rebirth ho nenese (hell/sira/hellShop ANO)
  // vybavení/inventář/bedny/úlomky/MAZLÍČCI se NEresetují (jako prestige) → snapshot síly
  // do obtížnosti (vybavení + nasazený mazlíček, viz formulas.difficultyScale)
  state.runGearPower = gearPower(state.equipment) * petPower(state);
}
