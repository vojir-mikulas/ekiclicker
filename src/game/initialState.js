import { WEAPONS } from './data/weapons.js';
import { UPGRADE_KEYS } from './data/upgrades.js';
import { PRESTIGE_KEYS } from './data/prestige.js';

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
  return p;
}

export function createStats() {
  return {
    totalClicks: 0,
    totalGold: 0,
    kills: 0,
    bossKills: 0,
    maxCombo: 0,
    frenzies: 0,
    luckyClicks: 0,
    playTimeMs: 0,
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
    stats: createStats(),
    enemy: null,
    combo: { count: 0, lastClickAt: 0 },
    frenzy: { active: false, until: 0, charge: 0 },
    lucky: null,
    buyAmount: 1,
  };
}

/* Reset jen "běhu" (po rebirthu) — prestige, achievementy a staty zůstávají. */
export function resetRun(state, startLevel) {
  state.gold = 0;
  state.level = startLevel;
  state.upgrades = createUpgrades();
  state.weapons = createWeapons();
  state.combo = { count: 0, lastClickAt: 0 };
  state.frenzy = { active: false, until: 0, charge: 0 };
  state.lucky = null;
  state.enemy = null;
}
