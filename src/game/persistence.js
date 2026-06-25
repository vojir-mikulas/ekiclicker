/* Ukládání / načítání + offline výdělek. */
import { CONFIG } from './config.js';
import { createState } from './initialState.js';
import { totalDps, goldMult, enemyReward, forgivenessGain } from './formulas.js';

const SAVE_KEY = 'ekiClickerSaveV3';
/* Staré klíče z předchozích verzí hry. Když je najdeme a nový save chybí,
   hráč musí začít znovu — ale dostane veteránský dárek za starou snahu. */
const LEGACY_KEYS = ['ekiClickerSaveV2', 'ekiClickerSave'];

export function save(state) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        v: 3,
        gold: state.gold,
        level: state.level,
        highestLevel: state.highestLevel,
        upgrades: state.upgrades,
        weapons: state.weapons,
        prestige: state.prestige,
        achievements: state.achievements,
        stats: state.stats,
        buyAmount: state.buyAmount,
        t: Date.now(),
      })
    );
  } catch {
    /* náhled / privátní režim — ignoruj */
  }
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

  const state = createState();
  state.gold = d.gold || 0;
  state.level = d.level || 1;
  state.highestLevel = Math.max(d.highestLevel || 1, state.level);
  Object.assign(state.upgrades, d.upgrades);
  Object.assign(state.weapons, d.weapons);
  Object.assign(state.prestige, d.prestige);
  Object.assign(state.stats, d.stats);
  state.achievements = d.achievements || {};
  state.buyAmount = d.buyAmount || 1;

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
