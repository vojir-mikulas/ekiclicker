/* Ukládání / načítání + offline výdělek. */
import { CONFIG } from './config.js';
import { createState } from './initialState.js';
import { totalDps, goldMult, enemyReward } from './formulas.js';

const SAVE_KEY = 'ekiClickerSaveV2';

export function save(state) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        v: 2,
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

/* Vrátí { state, offline } nebo null. Nový/chybějící save → null (čerstvá hra). */
export function load() {
  let d;
  try {
    d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch {
    return null;
  }
  if (!d) return null;

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
