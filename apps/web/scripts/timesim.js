/* =========================================================================
   LOADED-ACCOUNT TIME SIM  —  "how many real days to reach level N?"
   Models a dedicated optimizing player climbing in REAL time:
     - real per-level kill time = HP / effDps  (active clicking + auto DPS)
     - greedy gold spend (real ROI) each level
     - rebirth loop: at the wall → bank 🕊 → buy prestige (mostly rage) → re-climb deeper
     - ascension loop: highest ≥ 10000 → bank ✦ → buy cosmicWrath → re-climb
     - META stack (gear/pets/runes/mastery/enchant/album/guild/hell/season) as a
       bounded dmg×/gold× that RAMPS over days (acquisition); gear slice feeds difficulty
     - play schedule: ACTIVE_H active hours/day; offline gold (12h cap, ×0.5) between
   Reports wall-clock days to hit level milestones + rebirth/ascension counts.

   Curve params via env (same as wallsweep): FLOOR/G0/KNEE/RATIO/HFROM/HRAMP/DEXP.
   Sim params via env: ACTIVE_H, METADMG, METAGOLD, METARAMP, TARGET, GEARSHARE.
   ========================================================================= */
import { CONFIG } from '../src/game/config.js';
import { WEAPONS } from '../src/game/data/weapons.js';
import { UPGRADE_KEYS } from '../src/game/data/upgrades.js';
import { PRESTIGE_KEYS } from '../src/game/data/prestige.js';
import { ASCENSION, ASCENSION_UPGRADES } from '../src/game/data/ascension.js';
import { VARIANTS } from '../src/game/data/variants.js';
import { createState } from '../src/game/initialState.js';
import {
  totalDps, clickDamage, goldMult, enemyMaxHp, enemyReward,
  upgradeCost, weaponCost, prestigeCost, forgivenessGain, difficultyScale,
  stardustGain, ascensionCost,
} from '../src/game/formulas.js';

const CLICK_RATE = 3.5;
const MINKILL = (CONFIG.tickMs / 1000) / CONFIG.maxDefeatsPerTick; // anti-lag floor: min seconds per kill

// ---- knobs ----
const ACTIVE_H   = num('ACTIVE_H', 3.5);   // active play hours / day
const METADMG    = num('METADMG', 4);      // meta dmg× at full acquisition
const METAGOLD   = num('METAGOLD', 4);     // meta gold× at full acquisition
const METARAMP   = num('METARAMP', 6);     // days to reach full meta acquisition
const GEARSHARE  = num('GEARSHARE', 0.35); // fraction of meta dmg that is gear/pet (enters difficulty)
const TARGET     = num('TARGET', 12000);
const WALL_S     = num('WALL_S', 8);       // killS where a level "walls"
const REBIRTH_S  = num('REBIRTH_S', 180);  // killS where the player gives up & rebirths
const DAYS_MAX   = num('DAYS_MAX', 30);

function num(k, d) { return process.env[k] !== undefined ? Number(process.env[k]) : d; }

// meta multipliers as a function of elapsed days (linear ramp to cap)
function metaAt(days) {
  const f = Math.min(1, days / METARAMP);
  return { dmg: 1 + (METADMG - 1) * f, gold: 1 + (METAGOLD - 1) * f };
}

const NORMAL = { id: 'normal', ...VARIANTS.normal };
function variantForLevel(level) {
  if (level % CONFIG.archonBossEvery === 0) return { id: 'archon', ...VARIANTS.archon };
  if (level % CONFIG.ultraBossEvery === 0) return { id: 'titan', ...VARIANTS.titan };
  if (level % CONFIG.megaBossEvery === 0) return { id: 'king', ...VARIANTS.king };
  if (level % CONFIG.bossEvery === 0) return { id: 'gold', ...VARIANTS.gold };
  return NORMAL;
}

function effDpsRaw(s) { return totalDps(s) + CLICK_RATE * clickDamage(s); }

function bestPurchase(s) {
  let best = null;
  const before = effDpsRaw(s);
  const roiOf = (apply, revert, cost) => {
    if (!isFinite(cost) || cost <= 0 || s.gold < cost) return -1;
    apply(); const after = effDpsRaw(s); revert();
    return (after - before) / cost;
  };
  for (const key of UPGRADE_KEYS) {
    const cost = upgradeCost(key, s.upgrades[key]);
    const roi = roiOf(() => s.upgrades[key]++, () => s.upgrades[key]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, kind: 'up', id: key };
  }
  for (const w of WEAPONS) {
    if (s.level < w.unlock) continue;
    const cost = weaponCost(w, s.weapons[w.id] || 0);
    const roi = roiOf(() => s.weapons[w.id]++, () => s.weapons[w.id]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, kind: 'wp', id: w };
  }
  return best;
}
// scan for best ROI, then BATCH-buy it until its marginal cost climbs ~4× (ROI degraded)
// or gold runs low — then re-scan. Batching keeps spend O(rounds), not O(items bought).
function spend(s) {
  for (let round = 0; round < 300; round++) {
    const b = bestPurchase(s);
    if (!b || s.gold < b.cost) break;
    let bought = 0;
    while (bought < 2000) {
      const cost = b.kind === 'up' ? upgradeCost(b.id, s.upgrades[b.id]) : weaponCost(b.id, s.weapons[b.id.id] || 0);
      if (!isFinite(cost) || s.gold < cost) break;
      s.gold -= cost;
      if (b.kind === 'up') s.upgrades[b.id]++; else s.weapons[b.id.id] = (s.weapons[b.id.id] || 0) + 1;
      bought++;
      if (cost > b.cost * 4) break; // marginal cost grew → re-evaluate best
    }
    if (bought === 0) break;
  }
}

// greedy prestige buy with 🕊 (weighted toward rage — the multiplicative engine)
function spendForgiveness(s) {
  const W = { rage: 25, greed: 4, fist: 4, factory: 2, shadow: 2, crit: 1, luck: 1, headstart: 1 };
  for (let i = 0; i < 5000; i++) {
    let best = null;
    for (const key of PRESTIGE_KEYS) {
      const cost = prestigeCost(key, s.prestige[key]);
      if (!isFinite(cost) || s.prestige.forgiveness < cost) continue;
      const score = (W[key] || 1) / cost;
      if (!best || score > best.score) best = { score, cost, key };
    }
    if (!best) break;
    s.prestige.forgiveness -= best.cost;
    s.prestige[best.key]++;
  }
}
// greedy ascension buy with ✦ (weighted toward cosmicWrath — the meta engine)
function spendStardust(s) {
  const W = { cosmicWrath: 30, stardustGreed: 4, doveStorm: 2, eternalHeadstart: 3, dustNova: 1, cosmicLuck: 1 };
  for (let i = 0; i < 3000; i++) {
    let best = null;
    for (const key of Object.keys(ASCENSION_UPGRADES)) {
      const lvl = s.ascension.levels[key] || 0;
      const cost = ascensionCost(key, lvl);
      if (!isFinite(cost) || s.ascension.stardust < cost) continue;
      const score = (W[key] || 1) / cost;
      if (!best || score > best.score) best = { score, cost, key };
    }
    if (!best) break;
    s.ascension.stardust -= best.cost;
    s.ascension.levels[best.key] = (s.ascension.levels[best.key] || 0) + 1;
  }
}

function resetRun(s) {
  s.level = 1; s.highestLevel = Math.max(s.highestLevel, 1); s.gold = 0;
  for (const k of UPGRADE_KEYS) s.upgrades[k] = 0;
  for (const w of WEAPONS) s.weapons[w.id] = 0;
}

function run() {
  const s = createState();
  if (!s.ascension.stardust) s.ascension.stardust = 0;
  if (!s.prestige.forgiveness) s.prestige.forgiveness = 0;

  let wallSec = 0;          // cumulative WALL-CLOCK seconds (incl. offline gaps)
  let activeSecToday = 0;   // active seconds used in the current day
  const activeSecPerDay = ACTIVE_H * 3600;
  let rebirths = 0, ascends = 0;
  let runMaxLevel = 1;      // highest level reached in current run (stall detection)
  let stuckLevels = 0;
  let bestEver = 1, lastImproveDay = 0; // plateau detection (no depth gain for too long → abort)
  const milestones = [500, 1000, 2000, 3000, 5000, 8000, 10000, 12000, 15000];
  let msIdx = 0;
  const hit = {};
  const days = () => wallSec / 86400;

  // effDps is expensive (sums 46 weapons) — recompute only after a spend, then reuse.
  let effRaw = effDpsRaw(s);
  let lastSpendGold = -1;
  const maybeSpend = (force) => {
    // gate on the PRE-spend gold peak (spend drains gold to ~0, so gating on post-spend
    // gold would re-trigger every level). Wait until gold climbs 1.25× past the last peak.
    if (force || lastSpendGold < 0 || s.gold > lastSpendGold * 1.25) {
      const peak = s.gold;
      spend(s);
      effRaw = effDpsRaw(s);
      lastSpendGold = peak;
    }
  };

  let guard = 0;
  while (days() < DAYS_MAX && (hit[TARGET] === undefined)) {
    if (++guard > 2e7) { console.log('guard break'); break; }
    if (rebirths > 4000) { console.log(`REBIRTH CAP: ${rebirths} rebirths, stuck ~L${bestEver}`); break; }
    if (process.env.HB && guard % 200000 === 0) console.error(`hb guard=${guard} L=${s.level} hi=${s.highestLevel} day=${days().toFixed(2)} reb=${rebirths} asc=${ascends} gold=${s.gold.toExponential(1)}`);
    const meta = metaAt(days());
    s.runGearPower = 1 + (meta.dmg - 1) * GEARSHARE; // gear/pet slice → difficulty snapshot

    maybeSpend(false);
    const diff = difficultyScale(s);
    const variant = variantForLevel(s.level);
    const hp = enemyMaxHp(s.level, variant, diff);
    const eff = effRaw * meta.dmg;
    const killS = Math.max(MINKILL, hp / eff);

    // BLITZ FAST-FORWARD: while one-shotting, step levels cheaply (no spend/effDps recompute)
    // until enemies stop being trivially killable. Collapses the post-rebirth re-climb.
    if (killS <= MINKILL * 2 && s.level < TARGET) {
      const gmul = goldMult(s) * meta.gold; // constant during blitz (no spend)
      let g = 0, t = 0;
      while (s.level < TARGET) {
        const v = variantForLevel(s.level);
        const h = enemyMaxHp(s.level, v, diff);
        if (h / eff > MINKILL * 2) break; // blitz over → fall back to slow stepping
        t += MINKILL;
        let r = enemyReward(s.level, v, gmul);
        if (v.boss) r += r * (v.archon ? CONFIG.archonBossLootMult : v.ultra ? CONFIG.ultraBossLootMult : v.mega ? CONFIG.megaBossLootMult : CONFIG.bossLootMult);
        g += r;
        s.level++;
        if (s.level > runMaxLevel) { runMaxLevel = s.level; stuckLevels = 0; }
        if (s.level > s.highestLevel) {
          s.highestLevel = s.level;
          while (msIdx < milestones.length && s.highestLevel >= milestones[msIdx]) { hit[milestones[msIdx]] = (wallSec + t) / 86400; msIdx++; }
        }
      }
      activeSecToday += t; wallSec += t; s.gold += g;
      continue;
    }

    // advance wall-clock; if we exhaust today's active budget, jump to next session (offline gold)
    if (activeSecToday + killS > activeSecPerDay) {
      // finish the day; credit offline gold for the away window (next session), capped 12h
      const offAwayH = 24 - ACTIVE_H;
      const offGold = totalDps(s) * meta.dmg * Math.min(offAwayH, CONFIG.offlineCapH) * 3600 * CONFIG.offlineRate;
      wallSec += (activeSecPerDay - activeSecToday) + offAwayH * 3600; // rest of active + offline gap
      activeSecToday = 0;
      s.gold += offGold;
      continue;
    }
    activeSecToday += killS;
    wallSec += killS;

    // gold reward
    let rew = enemyReward(s.level, variant, goldMult(s)) * meta.gold;
    if (variant.boss) {
      const m = variant.archon ? CONFIG.archonBossLootMult : variant.ultra ? CONFIG.ultraBossLootMult : variant.mega ? CONFIG.megaBossLootMult : CONFIG.bossLootMult;
      rew += rew * m;
    }
    s.gold += rew;

    // progress / stall bookkeeping
    if (killS < REBIRTH_S) {
      s.level++;
      if (s.level > runMaxLevel) { runMaxLevel = s.level; stuckLevels = 0; }
      else stuckLevels++;
      if (s.level > s.highestLevel) {
        s.highestLevel = s.level;
        while (msIdx < milestones.length && s.highestLevel >= milestones[msIdx]) { hit[milestones[msIdx]] = days(); msIdx++; }
      }
    } else {
      stuckLevels += 50; // hard wall: force a rebirth/ascension decision
    }

    // rebirth / ascension decision at the wall
    if (stuckLevels > 40) {
      // plateau: if depth hasn't improved for a long WALL-CLOCK window (meta keeps ramping
      // up to METARAMP days, so give it real time before declaring the curve unreachable)
      if (runMaxLevel > bestEver) { bestEver = runMaxLevel; lastImproveDay = days(); }
      else if (days() - lastImproveDay > Math.max(3, METARAMP * 0.6)) { console.log(`PLATEAU: stuck ~L${bestEver} for ${(days() - lastImproveDay).toFixed(1)}d, aborting`); break; }

      // ascend if eligible — but NOT before reaching the target (a 12k-pusher won't reset
      // all rage at 10k just to lose reach). Disable entirely with NOASC=1.
      if (!process.env.NOASC && s.highestLevel >= ASCENSION.unlockLevel && s.highestLevel >= TARGET) {
        const sd = stardustGain(s.highestLevel);
        if (sd > 0) {
          s.ascension.stardust += sd;
          s.ascension.ascends = (s.ascension.ascends || 0) + 1;
          ascends++;
          spendStardust(s);
          for (const k of PRESTIGE_KEYS) s.prestige[k] = 0; // ascension sweeps prestige tower
          s.prestige.forgiveness = 0;
          resetRun(s); runMaxLevel = 1; stuckLevels = 0; lastSpendGold = -1;
          continue;
        }
      }
      // otherwise rebirth
      s.prestige.forgiveness += forgivenessGain(s.highestLevel);
      rebirths++;
      spendForgiveness(s);
      resetRun(s); runMaxLevel = 1; stuckLevels = 0; lastSpendGold = -1;
    }
  }

  return { hit, rebirths, ascends, finalDays: days(), reached: s.highestLevel };
}

const tag = `FLOOR=${CONFIG.curveFloor} G0=${CONFIG.curveG0} KNEE=${CONFIG.curveKnee} RATIO=${CONFIG.goldRatio} HFROM=${CONFIG.hardenFrom} HRAMP=${CONFIG.hardenRamp} DEXP=${CONFIG.difficultyExp}`;
const sim = `ACTIVE_H=${ACTIVE_H} META=${METADMG}×dmg/${METAGOLD}×gold ramp=${METARAMP}d gearShare=${GEARSHARE}`;
console.log(tag);
console.log(sim);
const r = run();
console.log(`rebirths=${r.rebirths} ascends=${r.ascends} reached=L${r.reached} after ${r.finalDays.toFixed(1)}d`);
console.log('milestone days:');
for (const [lvl, d] of Object.entries(r.hit)) console.log(`  L${String(lvl).padStart(6)} : ${Number(d).toFixed(2)} d  (${(Number(d) * 24).toFixed(1)} h)`);
