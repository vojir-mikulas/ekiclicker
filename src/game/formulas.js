/* =========================================================================
   FORMULAS — čistá matematika hry (žádný stav, žádné DOM).
   Vše odvozené z herního stavu. Testovatelné, sdílené simulátorem i enginem.
   ========================================================================= */
import { CONFIG, MULT, hardenScale } from './config.js';
import { WEAPONS } from './data/weapons.js';
import { UPGRADES } from './data/upgrades.js';
import { PRESTIGE } from './data/prestige.js';
import { ACHIEVEMENTS } from './data/achievements.js';

const WEAPON_COST_GROWTH = 1.15;
const REWARD_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a.reward]));

/* Součin bonusů z odemčených achievementů. */
export function achievementMult(achievements) {
  let dmg = 1;
  let gold = 1;
  for (const id in achievements) {
    if (!achievements[id]) continue;
    const r = REWARD_BY_ID[id];
    if (!r) continue;
    if (r.dmg) dmg *= r.dmg;
    if (r.gold) gold *= r.gold;
  }
  return { dmg, gold };
}

/* Globální násobič poškození — JEDINÝ exponenciální "motor" růstu.
   (Žádné automatické škálování s úrovní jako dřív → konec runaway.) */
export function globalMult(s) {
  const ach = achievementMult(s.achievements).dmg;
  const frenzy = s.frenzy.active ? CONFIG.frenzyMult : 1;
  return (
    Math.pow(MULT.power, s.upgrades.power) *
    Math.pow(MULT.rage, s.prestige.rage) *
    ach *
    frenzy
  );
}

export function goldMult(s) {
  const ach = achievementMult(s.achievements).gold;
  return (1 + s.prestige.greed * MULT.greedPerLevel) * ach;
}

export function critChance(s) {
  return Math.min(0.9, CONFIG.critChance + s.prestige.crit * MULT.critPerLevel);
}
export function critFactor(s) {
  return 1 + critChance(s) * (CONFIG.critMult - 1);
}

export function speedMult(s) {
  const raw =
    Math.pow(MULT.speed, Math.min(s.upgrades.speed, CONFIG.maxSpeedLevel)) *
    Math.pow(MULT.factory, s.prestige.factory);
  return Math.max(CONFIG.speedFloor, raw);
}

export function weaponInterval(s, w) {
  return Math.max(CONFIG.minWeaponInterval, w.interval * speedMult(s));
}

export const milestoneMult = (count) =>
  Math.pow(2, Math.floor(count / MULT.weaponMilestone));

export function weaponShotDamage(s, w) {
  const count = s.weapons[w.id] || 0;
  if (count <= 0) return 0;
  return w.baseDmg * count * milestoneMult(count) * globalMult(s);
}

export function weaponDps(s, w) {
  const shot = weaponShotDamage(s, w);
  if (shot <= 0) return 0;
  return shot / (weaponInterval(s, w) / 1000);
}

export function totalWeaponDps(s) {
  let d = 0;
  for (const w of WEAPONS) d += weaponDps(s, w);
  return d;
}

/* Základní úder (bez bonusu z DPS) — používá ho i Stín pěsti. */
export function basePunch(s) {
  const base = 1 + s.upgrades.punch * MULT.punchStep;
  const fist = 1 + s.prestige.fist * MULT.fistPerLevel;
  return Math.max(1, base * globalMult(s) * fist);
}

/* Plný úder hráče = základ + % z DPS (upgrade Údernost). Bez kritu/comba. */
export function clickDamage(s) {
  const fromDps = totalWeaponDps(s) * (s.upgrades.click * MULT.clickFromDpsPerLevel);
  return basePunch(s) + fromDps;
}

/* DPS Stínu pěsti (auto-údery z prestige), s očekávaným kritem. */
export function shadowDps(s) {
  if (s.prestige.shadow <= 0) return 0;
  return s.prestige.shadow * basePunch(s) * critFactor(s);
}

/* Celkové automatické DPS — tohle se aplikuje jako damage × Δt (anti-lag). */
export function totalDps(s) {
  return totalWeaponDps(s) + shadowDps(s);
}

/* ----------------------------- ceny ----------------------------- */
export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  if (u.max != null && level >= u.max) return Infinity;
  return Math.ceil(u.baseCost * Math.pow(u.growth, level));
}
export const upgradeCostAt = (s, key) => (i) => upgradeCost(key, s.upgrades[key] + i);

export function weaponCost(w, count) {
  return Math.ceil(w.baseCost * Math.pow(WEAPON_COST_GROWTH, count));
}
export const weaponCostAt = (s, w) => (i) => weaponCost(w, (s.weapons[w.id] || 0) + i);

export function prestigeCost(key, level) {
  const p = PRESTIGE[key];
  return Math.ceil(p.baseCost * Math.pow(p.growth, level));
}

export const forgivenessGain = (level) =>
  Math.max(0, Math.floor(Math.pow(level, 1.3) / 14));

/* Hromadný nákup: kolik levelů a za kolik podle násobiče (1/10/100/'max'). */
export function buyBatch(costAt, gold, buyAmount, cap = Infinity) {
  if (buyAmount === 'max') {
    let n = 0;
    let total = 0;
    let money = gold;
    while (n < cap && n < 100000) {
      const c = costAt(n);
      if (!isFinite(c) || money < c) break;
      money -= c;
      total += c;
      n++;
    }
    return { count: n, cost: total };
  }
  const want = Math.min(buyAmount, cap);
  let total = 0;
  for (let i = 0; i < want; i++) {
    const c = costAt(i);
    if (!isFinite(c)) return { count: i, cost: total };
    total += c;
  }
  return { count: want, cost: total };
}

/* ----------------------------- nepřítel ----------------------------- */
export function enemyMaxHp(level, variant) {
  return Math.ceil(
    CONFIG.baseHp *
      Math.pow(CONFIG.hpGrowth, level - 1) *
      variant.hp *
      hardenScale(level)
  );
}
export function enemyReward(level, variant, goldMultVal) {
  return Math.ceil(
    CONFIG.baseGold *
      Math.pow(CONFIG.goldGrowth, level - 1) *
      variant.gold *
      goldMultVal
  );
}
