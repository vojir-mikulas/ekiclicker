/* Weapon diagnostics — walks a "reasonable greedy" player and reports, per sampled level:
     hp        = enemyMaxHp (normal variant, with difficultyScale snapshot)
     wDPS      = totalWeaponDps
     punchDPS  = CLICK_RATE × basePunch  (the "fist")
     zeta      = wDPS / punchDPS         (target band 0.25..0.33)
     killS     = hp / effDps
     top       = weapon with most DPS (id ×count)  + how many distinct weapons owned
   Usage: node scripts/zeta.js [LOAD=fresh|modest|strong|deep|whale] [MAXLVL=3000]
   (curve params read from env like wallsweep: G0/FLOOR/KNEE/RATIO/HFROM/HRAMP/DEXP) */
import { CONFIG } from '../src/game/config.js';
import { WEAPONS } from '../src/game/data/weapons.js';
import { UPGRADE_KEYS } from '../src/game/data/upgrades.js';
import { VARIANTS } from '../src/game/data/variants.js';
import { createState } from '../src/game/initialState.js';
import {
  totalDps, totalWeaponDps, basePunch, weaponDps, clickDamage,
  goldMult, enemyMaxHp, enemyReward, upgradeCost, weaponCost, difficultyScale,
  arsenalSynergyMult,
} from '../src/game/formulas.js';

const CLICK_RATE = 3.5;
const effDps = (s) => totalDps(s) + CLICK_RATE * clickDamage(s);

function bestPurchase(s) {
  let best = null;
  const before = effDps(s);
  const roiOf = (apply, revert, cost) => {
    if (!isFinite(cost) || cost <= 0 || s.gold < cost) return -1;
    apply(); const after = effDps(s); revert();
    return (after - before) / cost;
  };
  for (const key of UPGRADE_KEYS) {
    const cost = upgradeCost(key, s.upgrades[key]);
    const roi = roiOf(() => s.upgrades[key]++, () => s.upgrades[key]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, do: () => s.upgrades[key]++, label: key };
  }
  for (const w of WEAPONS) {
    if (s.level < w.unlock) continue;
    const cost = weaponCost(w, s.weapons[w.id] || 0);
    const roi = roiOf(() => s.weapons[w.id]++, () => s.weapons[w.id]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, do: () => s.weapons[w.id]++, label: w.id };
  }
  return best;
}
function spend(s) {
  for (let i = 0; i < 2000; i++) {
    const b = bestPurchase(s);
    if (!b || s.gold < b.cost) break;
    s.gold -= b.cost; b.do();
  }
}

function topWeapon(s) {
  let best = null;
  let owned = 0;
  for (const w of WEAPONS) {
    const c = s.weapons[w.id] || 0;
    if (c > 0) owned++;
    const d = weaponDps(s, w);
    if (d > 0 && (!best || d > best.d)) best = { id: w.id, c, d };
  }
  return { best, owned };
}

const LOADS = {
  fresh:  { rage: 0 },
  modest: { rage: 40, fist: 20, factory: 12, crit: 10, greed: 18 },
  strong: { rage: 90, fist: 40, factory: 20, crit: 18, greed: 30, shadow: 12 },
  deep:   { rage: 160, fist: 70, factory: 28, crit: 25, greed: 45, shadow: 20 },
  whale:  { rage: 260, fist: 110, factory: 32, crit: 30, greed: 60, shadow: 30 },
};
const loadName = process.env.LOAD || 'modest';
const MAXLVL = process.env.MAXLVL ? Number(process.env.MAXLVL) : 3000;
const samples = new Set([1, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3000]);

const s = createState();
Object.assign(s.prestige, LOADS[loadName] || LOADS.modest);
console.log(`LOAD=${loadName}  FLOOR=${CONFIG.curveFloor} G0=${CONFIG.curveG0} KNEE=${CONFIG.curveKnee} RATIO=${CONFIG.goldRatio} DEXP=${CONFIG.difficultyExp} HFROM=${CONFIG.hardenFrom} HRAMP=${CONFIG.hardenRamp}`);
console.log('  lvl |        hp |      wDPS |  punchDPS |  zeta |  killS | synergy | top weapon (×n) | owned');
let wall = null;
for (s.level = 1; s.level <= MAXLVL; s.level++) {
  const variant = { id: 'normal', ...VARIANTS.normal };
  const hp = enemyMaxHp(s.level, variant, difficultyScale(s));
  spend(s);
  const wd = totalWeaponDps(s);
  const pd = CLICK_RATE * basePunch(s);
  const killS = hp / effDps(s);
  if (wall == null && killS > 8 && !variant.boss) wall = s.level;
  if (samples.has(s.level)) {
    const { best, owned } = topWeapon(s);
    const z = pd > 0 ? wd / pd : 0;
    const syn = ((arsenalSynergyMult(s) - 1) * 100).toFixed(0);
    console.log(
      `${String(s.level).padStart(5)} | ${hp.toExponential(2).padStart(9)} | ${wd.toExponential(2).padStart(9)} | ${pd.toExponential(2).padStart(9)} | ${z.toFixed(3).padStart(5)} | ${killS.toExponential(1).padStart(6)} | ${(syn + '%').padStart(6)} | ${(best ? best.id + ' ×' + best.c : '—').padEnd(15)} | ${owned}`
    );
  }
  // gold gain
  const rew = enemyReward(s.level, variant, goldMult(s));
  s.gold += rew;
}
console.log(`wall (killS>8) ≈ ${wall || '>' + MAXLVL}`);
