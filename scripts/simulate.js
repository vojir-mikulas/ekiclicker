/* =========================================================================
   BALANCE SIMULÁTOR  —  `npm run balance`
   Hraje hru "rozumně chamtivě" (kupuje nejlepší DPS/zlato) a vypisuje,
   jak rychle hráč postupuje. Slouží k ověření, že:
     - nejde za 10 minut vletět na úroveň 30000 (žádný runaway),
     - každý nákup má smysl a postup je plynulý,
     - rebirth/prestige loop funguje.
   Není to dokonalý hráč, ale spolehlivě odhalí hrubou nevyváženost.
   ========================================================================= */
import { CONFIG } from '../src/game/config.js';
import { WEAPONS } from '../src/game/data/weapons.js';
import { UPGRADE_KEYS } from '../src/game/data/upgrades.js';
import { PRESTIGE_KEYS } from '../src/game/data/prestige.js';
import { VARIANTS } from '../src/game/data/variants.js';
import { createState, resetRun } from '../src/game/initialState.js';
import {
  totalDps, clickDamage, goldMult, enemyMaxHp, enemyReward,
  upgradeCost, weaponCost, prestigeCost, forgivenessGain,
} from '../src/game/formulas.js';

const CLICK_RATE = 3.5; // průměrné kliky/s aktivního hráče
const SPEND_EVERY = 0.5; // jak často přehodnotí nákupy (s)

function variantForLevel(level) {
  if (level % CONFIG.megaBossEvery === 0) return { id: 'king', ...VARIANTS.king };
  if (level % CONFIG.bossEvery === 0) return { id: 'gold', ...VARIANTS.gold };
  return { id: 'normal', ...VARIANTS.normal };
}

function effDps(s) {
  return totalDps(s) + CLICK_RATE * clickDamage(s);
}

// marginální efektivita koupě: ΔeffDPS / cena (sim "co kdyby")
function evalBuy(s, apply, revert, cost) {
  if (!isFinite(cost) || cost <= 0) return -1;
  const before = effDps(s);
  apply();
  const after = effDps(s);
  revert();
  return (after - before) / cost;
}

function bestPurchase(s) {
  let best = null;
  // upgrady
  for (const key of UPGRADE_KEYS) {
    const lvl = s.upgrades[key];
    const cost = upgradeCost(key, lvl);
    if (!isFinite(cost) || s.gold < cost) continue;
    const roi = evalBuy(s, () => s.upgrades[key]++, () => s.upgrades[key]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, do: () => s.upgrades[key]++, label: key };
  }
  // zbraně
  for (const w of WEAPONS) {
    if (s.level < w.unlock) continue;
    const count = s.weapons[w.id] || 0;
    const cost = weaponCost(w, count);
    if (s.gold < cost) continue;
    const roi = evalBuy(s, () => s.weapons[w.id]++, () => s.weapons[w.id]--, cost);
    if (roi > 0 && (!best || roi > best.roi)) best = { roi, cost, do: () => s.weapons[w.id]++, label: w.id };
  }
  return best;
}

function spend(s) {
  // kupuj nejlepší ROI, dokud něco rozumného zbývá (strop kroků = ochrana)
  for (let i = 0; i < 400; i++) {
    const b = bestPurchase(s);
    if (!b || s.gold < b.cost) break;
    s.gold -= b.cost;
    b.do();
  }
}

function spendForgiveness(s) {
  // greedy prestige: kupuj nejlevnější smysluplné, dokud máš 🕊
  for (let i = 0; i < 200; i++) {
    let best = null;
    for (const key of PRESTIGE_KEYS) {
      const cost = prestigeCost(key, s.prestige[key]);
      if (s.prestige.forgiveness < cost) continue;
      // jednoduché váhy: damage/gold motory první
      const weight = { rage: 5, greed: 3, fist: 2, factory: 2, shadow: 2, crit: 1, luck: 1, headstart: 1 }[key] || 1;
      const score = weight / cost;
      if (!best || score > best.score) best = { score, cost, key };
    }
    if (!best) break;
    s.prestige.forgiveness -= best.cost;
    s.prestige[best.key]++;
  }
}

function run(minutes) {
  const s = createState();
  s.enemy = newEnemy(s);
  let t = 0;
  const dt = 0.1;
  let sinceSpend = 0;
  let stuck = 0;
  let rebirths = 0;
  const checkpoints = arguments[1] || [1, 5, 10, 20, 30, 45, 60, 90, 120, 180, 240];
  const log = {};
  let maxLevelPerSec = 0;
  let levelAtLastSec = 1;
  let secAcc = 0;

  while (t < minutes * 60) {
    // damage tick
    const dps = totalDps(s);
    const clickDmg = clickDamage(s) * CLICK_RATE * dt;
    let dmg = dps * dt + clickDmg;
    let defeats = 0;
    while (dmg > 0 && defeats < CONFIG.maxDefeatsPerTick) {
      if (dmg >= s.enemy.hp) {
        dmg -= s.enemy.hp;
        s.gold += enemyReward(s.level, s.enemy.variant, goldMult(s));
        s.stats.totalGold += 1;
        s.level++;
        if (s.level > s.highestLevel) s.highestLevel = s.level;
        s.enemy = newEnemy(s);
        defeats++;
      } else {
        s.enemy.hp -= dmg;
        dmg = 0;
      }
    }

    // boss timer: pokud DPS nestačí zabít bosse do limitu → utíká (stuck signál)
    if (s.enemy.variant.boss) {
      s.enemy.timer -= dt;
      if (s.enemy.timer <= 0) {
        s.level++; // uteče, jdeme dál bez odměny
        s.enemy = newEnemy(s);
        stuck++;
      }
    }

    sinceSpend += dt;
    if (sinceSpend >= SPEND_EVERY) { spend(s); sinceSpend = 0; }

    // rebirth, když se to zaseklo (boss utekl víckrát) a vyplatí se
    if (!process.argv.includes('--norebirth') && stuck >= 4 && forgivenessGain(s.level) >= 3) {
      s.prestige.forgiveness += forgivenessGain(s.level);
      s.prestige.rebirths++;
      rebirths++;
      spendForgiveness(s);
      resetRun(s, 1 + s.prestige.headstart * 3);
      s.enemy = newEnemy(s);
      stuck = 0;
    }

    t += dt;
    secAcc += dt;
    if (secAcc >= 1) {
      const lps = s.level - levelAtLastSec;
      if (lps > maxLevelPerSec) maxLevelPerSec = lps;
      levelAtLastSec = s.level;
      secAcc = 0;
    }
    const mins = t / 60;
    for (const cp of checkpoints) {
      if (!log[cp] && mins >= cp) {
        const wc = {};
        for (const w of WEAPONS) if (s.weapons[w.id]) wc[w.id] = s.weapons[w.id];
        log[cp] = {
          level: s.level, highest: s.highestLevel, gold: s.gold, rebirths, dps: totalDps(s),
          power: s.upgrades.power, speed: s.upgrades.speed, click: s.upgrades.click, punch: s.upgrades.punch,
          weapons: wc,
        };
      }
    }
  }
  return { log, maxLevelPerSec, final: s };
}

function newEnemy(s) {
  const variant = variantForLevel(s.level);
  const hp = enemyMaxHp(s.level, variant);
  const e = { variant, hp, maxHp: hp };
  if (variant.boss) e.timer = (variant.mega ? CONFIG.megaBossTime : CONFIG.bossTime) / 1000;
  return e;
}

function fmtN(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return Math.floor(n).toString();
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  let i = -1; let x = n;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return x.toFixed(1) + u[i];
}

const FINE = process.argv.includes('--fine');
const cps = FINE
  ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 45, 60]
  : [1, 5, 10, 20, 30, 45, 60, 90, 120, 180, 240];
const { log, maxLevelPerSec, final } = run(FINE ? 60 : 240, cps);
console.log('=== EKI CLICKER — balance sim (greedy hráč) ===\n');
console.log('čas     | úroveň  | max lvl | rb | zlato     | DPS        | pwr/spd/clk/pnch | zbraně');
console.log('--------|---------|---------|----|-----------|------------|------------------|-------');
for (const cp of cps) {
  const e = log[cp];
  if (!e) continue;
  const ups = `${e.power}/${e.speed}/${e.click}/${e.punch}`;
  const wp = Object.entries(e.weapons).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(
    `${String(cp).padStart(4)} min| ${String(e.level).padStart(7)} | ${String(e.highest).padStart(7)} | ${String(e.rebirths).padStart(2)} | ${fmtN(e.gold).padStart(9)} | ${fmtN(e.dps).padStart(10)} | ${ups.padStart(16)} | ${wp}`
  );
}
console.log('\nMax úrovní/s kdykoli během hry:', maxLevelPerSec, maxLevelPerSec > 30 ? '⚠️  RUNAWAY!' : '✅ ok');
console.log('Finální rebirth:', final.prestige.rebirths, '| odpuštění:', final.prestige.forgiveness);
