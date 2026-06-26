/* Fast wall-measurer for difficulty sweeps.
   Reuses formulas/config (curve params are baked into the LUT at load → set via env:
   G0/FLOOR/KNEE/RATIO/HFROM/HRAMP). difficultyExp is set per-call via DEXP env or arg.
   For each prestige loadout prints: wall = first non-boss level where kill > 8 s
   (player has been buying greedily with accumulated gold along the way).
   Much leaner than simulate.js --blitz: one exp, smarter spend, early break. */
import { CONFIG } from '../src/game/config.js';
import { WEAPONS } from '../src/game/data/weapons.js';
import { UPGRADE_KEYS } from '../src/game/data/upgrades.js';
import { VARIANTS } from '../src/game/data/variants.js';
import { createState } from '../src/game/initialState.js';
import {
  totalDps, clickDamage, goldMult, enemyMaxHp, enemyReward,
  upgradeCost, weaponCost, difficultyScale,
} from '../src/game/formulas.js';

const CLICK_RATE = 3.5;
const effDps = (s) => totalDps(s) + CLICK_RATE * clickDamage(s);

function variantForLevel(level) {
  if (level % CONFIG.archonBossEvery === 0) return { id: 'archon', ...VARIANTS.archon };
  if (level % CONFIG.ultraBossEvery === 0) return { id: 'titan', ...VARIANTS.titan };
  if (level % CONFIG.megaBossEvery === 0) return { id: 'king', ...VARIANTS.king };
  if (level % CONFIG.bossEvery === 0) return { id: 'gold', ...VARIANTS.gold };
  return { id: 'normal', ...VARIANTS.normal };
}

function evalBuy(s, apply, revert, cost) {
  if (!isFinite(cost) || cost <= 0) return -1;
  const before = effDps(s);
  apply(); const after = effDps(s); revert();
  return (after - before) / cost;
}

function bestPurchase(s) {
  let best = null;
  const before = effDps(s); // hoisted: constant across candidates
  const roiOf = (apply, revert, cost) => {
    if (!isFinite(cost) || cost <= 0 || s.gold < cost) return -1;
    apply(); const after = effDps(s); revert();
    return (after - before) / cost;
  };
  for (const key of UPGRADE_KEYS) {
    const cost = upgradeCost(key, s.upgrades[key]);
    const roi = roiOf(() => s.upgrades[key]++, () => s.upgrades[key]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, do: () => s.upgrades[key]++ };
  }
  for (const w of WEAPONS) {
    if (s.level < w.unlock) continue;
    const cost = weaponCost(w, s.weapons[w.id] || 0);
    const roi = roiOf(() => s.weapons[w.id]++, () => s.weapons[w.id]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, do: () => s.weapons[w.id]++ };
  }
  return best;
}
function spend(s) {
  for (let i = 0; i < 600; i++) {
    const b = bestPurchase(s);
    if (!b || s.gold < b.cost) break;
    s.gold -= b.cost; b.do();
  }
}

const MAXLVL = process.env.MAXLVL ? Number(process.env.MAXLVL) : 6000;
function measureWall(prestige, exp, maxLevel = MAXLVL) {
  const saved = CONFIG.difficultyExp;
  CONFIG.difficultyExp = exp;
  const s = createState();
  Object.assign(s.prestige, prestige);
  let blitz = 0, blitzOpen = true, wall = null;
  for (s.level = 1; s.level <= maxLevel; s.level++) {
    const variant = variantForLevel(s.level);
    const hp = enemyMaxHp(s.level, variant, difficultyScale(s));
    spend(s);
    const killS = hp / effDps(s);
    if (!variant.boss) {
      if (blitzOpen && killS < 0.3) blitz = s.level;
      else if (killS >= 0.3) blitzOpen = false;
      if (wall == null && killS > 8) wall = s.level;
    }
    const rew = enemyReward(s.level, variant, goldMult(s));
    let gain = rew;
    if (variant.boss) {
      const m = variant.archon ? CONFIG.archonBossLootMult : variant.ultra ? CONFIG.ultraBossLootMult : variant.mega ? CONFIG.megaBossLootMult : CONFIG.bossLootMult;
      gain += Math.ceil(rew * m);
    }
    s.gold += gain;
    if (wall != null && s.level > wall + 5) break;
  }
  CONFIG.difficultyExp = saved;
  return { blitz, wall: wall || maxLevel };
}

const ALL_LOADOUTS = {
  'fresh  (r0)  ': { rage: 0 },
  'modest (r40) ': { rage: 40, fist: 20, factory: 12, crit: 10, greed: 18 },
  'strong (r90) ': { rage: 90, fist: 40, factory: 20, crit: 18, greed: 30, shadow: 12 },
  'deep   (r160)': { rage: 160, fist: 70, factory: 28, crit: 25, greed: 45, shadow: 20 },
  'whale  (r260)': { rage: 260, fist: 110, factory: 32, crit: 30, greed: 60, shadow: 30 },
};
// LOAD env: csv of loadout prefixes to run (e.g. LOAD=fresh,strong). Default all.
const wantKeys = process.env.LOAD ? process.env.LOAD.split(',').map((x) => x.trim()) : null;
const LOADOUTS = wantKeys
  ? Object.fromEntries(Object.entries(ALL_LOADOUTS).filter(([n]) => wantKeys.some((k) => n.startsWith(k))))
  : ALL_LOADOUTS;
const exp = process.env.DEXP ? Number(process.env.DEXP) : CONFIG.difficultyExp;
const tag = `G0=${CONFIG.curveG0} FLOOR=${CONFIG.curveFloor} KNEE=${CONFIG.curveKnee} RATIO=${CONFIG.goldRatio} HFROM=${CONFIG.hardenFrom} HRAMP=${CONFIG.hardenRamp} exp=${exp}`;
console.log(tag);
for (const [name, p] of Object.entries(LOADOUTS)) {
  const { blitz, wall } = measureWall(p, exp);
  console.log(`  ${name}  blitz=${String(blitz).padStart(4)}  wall=${wall}`);
}
