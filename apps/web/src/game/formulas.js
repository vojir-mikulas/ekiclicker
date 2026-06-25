/* =========================================================================
   FORMULAS — čistá matematika hry (žádný stav, žádné DOM).
   Vše odvozené z herního stavu. Testovatelné, sdílené simulátorem i enginem.
   ========================================================================= */
import { CONFIG, MULT, CAPS, hardenScale } from './config.js';
import { WEAPONS } from './data/weapons.js';
import { UPGRADES } from './data/upgrades.js';
import { PRESTIGE_ALL } from './data/prestige.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { aggregateEquip } from './data/items.js';
import { equippedPetStats } from './data/pets.js';
import { albumStats } from './data/album.js';
import { elixirMods } from './data/elixirs.js';

/* Součet afixů z nasazeného vybavení — sdílí ho všechny bojové formulky.
   Čistá funkce nad stavem; vybavení přidává jen BOUNDED % (žádný nový exponenciál). */
export function equipStats(s) {
  return aggregateEquip(s.equipment);
}

/* Bojové bonusy = afixy výbavy + bonus nasazeného mazlíčka + milníky deníku
   (vše BOUNDED %, sdílí klíče statů). Tohle čtou bojové formulky místo holého
   equipStats — mazlíček i deník se tak promítnou všude, kde výbava, BEZ nového
   exponenciálu. (Deník ZÁMĚRNĚ nemá dmgPct → žádný vliv na obtížnost/blitz.) */
export function combatStats(s) {
  const gear = equipStats(s);
  const pet = equippedPetStats(s);
  const album = albumStats(s);
  const out = {};
  for (const k in gear) out[k] = gear[k] + (pet[k] || 0) + (album[k] || 0);
  return out;
}

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
  const gear = 1 + combatStats(s).dmgPct; // vybavení + mazlíček: bounded % (NE nový exponenciál)
  return (
    Math.pow(MULT.power, s.upgrades.power) *
    Math.pow(MULT.rage, s.prestige.rage) *
    ach *
    frenzy *
    gear *
    elixirMods(s).dmg // 🍸 elixír (burst, NEvstupuje do obtížnosti — jako frenzy)
  );
}

export function goldMult(s) {
  const ach = achievementMult(s.achievements).gold;
  const fortune = 1 + (s.upgrades.fortune || 0) * MULT.fortuneGoldPerLevel;
  const gear = 1 + combatStats(s).goldPct;
  return (1 + s.prestige.greed * MULT.greedPerLevel) * fortune * ach * gear * elixirMods(s).gold; // 🍺 elixír
}

export function critChance(s) {
  return Math.min(0.9, CONFIG.critChance + s.prestige.crit * MULT.critPerLevel + combatStats(s).critChance + elixirMods(s).critChance); // 🐂 elixír
}
/* Krit násobič — základ z CONFIG + gold upgrade "Tvrdý dopad" + vybavení. */
export function critMult(s) {
  return CONFIG.critMult + (s.upgrades.critdmg || 0) * MULT.critDmgPerLevel + combatStats(s).critMult;
}
export function critFactor(s) {
  return 1 + critChance(s) * (critMult(s) - 1);
}

/* Trvání zuřivosti — základ + gold upgrade "Zuřivá nálož" + vybavení. */
export function frenzyDuration(s) {
  return CONFIG.frenzyDurationMs + (s.upgrades.wrath || 0) * MULT.wrathDurMs + combatStats(s).frenzyDur;
}

/* Násobič šance na Lucky Eki — prestige "Štěstí" + vybavení (afix luck). */
export function luckSpawnMult(s) {
  return (1 + s.prestige.luck * MULT.luckPerLevel) * (1 + combatStats(s).luck);
}

/* Combo bonus za jeden zásah — základ + gold upgrade "Rytmus". */
export function comboPerHit(s) {
  return CONFIG.comboPerHit + (s.upgrades.rhythm || 0) * MULT.rhythmPerLevel;
}

/* ----------------------------- tier-2 prestige (capstones) -----------------------------
   Vše BOUNDED/aditivní — žádný nový exponenciál (ten zůstává jen power/rage). */
const capLevel = (s, key) => (s.prestige && s.prestige[key]) || 0;

/* 🕯️ Věčné odpuštění — násobič 🕊 z rebirthu. */
export const forgivenessMult = (s) => 1 + capLevel(s, 'eternalForgiveness') * CAPS.forgivenessPerLevel;
/* 🔗 Mistr comba — strop comba (základ + capstone). */
export const comboCap = (s) => CONFIG.comboMax + capLevel(s, 'comboMaster') * CAPS.comboCapPerLevel;
/* 🏹 Lovec bossů — víc času na bosse a víc jejich zlata. */
export const bossTimeMult = (s) => 1 + capLevel(s, 'bossHunter') * CAPS.bossTimePerLevel;
export const bossGoldMult = (s) => 1 + capLevel(s, 'bossHunter') * CAPS.bossGoldPerLevel;
/* ⚒️ Klenotník — víc úlomků a vyšší šance na drop. */
export const dustMult = (s) => 1 + capLevel(s, 'jeweler') * CAPS.dustPerLevel;
export const dropChanceBonus = (s) => capLevel(s, 'jeweler') * CAPS.dropChancePerLevel;

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
  return w.baseDmg * count * milestoneMult(count) * globalMult(s) * (1 + combatStats(s).weaponPct) * elixirMods(s).weapon; // 🧃 elixír (jen auto-zbraně)
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

/* Základní úder (bez bonusu z DPS) — používá ho i Stín pěsti.
   Afix punchPct (hlavně ze slotu Zbraň) zvýhodňuje právě úder → "meč > pěst". */
export function basePunch(s) {
  const base = 1 + s.upgrades.punch * MULT.punchStep;
  const fist = 1 + s.prestige.fist * MULT.fistPerLevel;
  const weapon = 1 + combatStats(s).punchPct;
  return Math.max(1, base * globalMult(s) * fist * weapon);
}

/* Plný úder hráče = základ + % z DPS (upgrade Údernost). Bez kritu/comba. */
export function clickDamage(s) {
  const fromDps = totalWeaponDps(s) * (s.upgrades.click * MULT.clickFromDpsPerLevel);
  return (basePunch(s) + fromDps) * elixirMods(s).click; // 🐂 elixír (jen manuální úder, NE stín pěsti)
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
  const p = PRESTIGE_ALL[key];
  if (!p) return Infinity;
  if (p.max != null && level >= p.max) return Infinity; // capstone vymaxovaný
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

/* ----------------------------- obtížnost ----------------------------- */
/* Trvalá prestige síla, kterou si hráč nese do ČERSTVÉHO běhu (kept přes rebirth).
   Hlavní motor blitzu: Věčný hněv (×1,16/level NÁSOBNĚ) + Trénovaná pěst.
   Záměrně NEzahrnuje achievementy/greed (mění se během běhu → byla by zpětná vazba). */
export function prestigePower(s) {
  return Math.pow(MULT.rage, s.prestige.rage) * (1 + s.prestige.fist * MULT.fistPerLevel);
}
/* Násobič HP nepřátel — drží obtížnost úměrnou tvé prestige síle (anti-blitz).
   V rámci jednoho běhu konstantní. Vedle prestige přimíchá i SNAPSHOT síly
   vybavení ze startu běhu (runGearPower) — vybavení přežívá rebirth, takže
   posouvá zeď dál, ale blitz zůstává omezený (kusy nalezené v běhu jsou čistý
   zisk a do obtížnosti se promítnou až příští běh). */
export function difficultyScale(s) {
  if (!CONFIG.difficultyExp) return 1;
  return Math.pow(prestigePower(s) * (s.runGearPower || 1), CONFIG.difficultyExp);
}

/* ----------------------------- nepřítel ----------------------------- */
export function enemyMaxHp(level, variant, diff = 1) {
  return Math.ceil(
    CONFIG.baseHp *
      Math.pow(CONFIG.hpGrowth, level - 1) *
      variant.hp *
      hardenScale(level) *
      diff
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
