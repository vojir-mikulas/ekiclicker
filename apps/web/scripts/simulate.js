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
  upgradeCost, weaponCost, prestigeCost, forgivenessGain, difficultyScale,
} from '../src/game/formulas.js';

const CLICK_RATE = 3.5; // průměrné kliky/s aktivního hráče
const SPEND_EVERY = 0.5; // jak často přehodnotí nákupy (s)

function variantForLevel(level) {
  if (level % CONFIG.archonBossEvery === 0) return { id: 'archon', ...VARIANTS.archon };
  if (level % CONFIG.ultraBossEvery === 0) return { id: 'titan', ...VARIANTS.titan };
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
      // Rage (×1,16 NÁSOBNĚ) je dominantní motor — rozumný hráč do něj sype nejvíc,
      // jinak prestige síla nenaroste a zeď se neposune (důležité od anti-blitz fixu).
      const weight = { rage: 20, greed: 4, fist: 3, factory: 2, shadow: 2, crit: 1, luck: 1, headstart: 1 }[key] || 1;
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
  let runStartLevel = 1; // úroveň, na které začal aktuální běh (kvůli rozumnému rebirthu)
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
        const rew = enemyReward(s.level, s.enemy.variant, goldMult(s));
        s.gold += rew;
        if (s.enemy.variant.boss) {
          const v = s.enemy.variant;
          const m = v.archon ? CONFIG.archonBossLootMult
            : v.ultra ? CONFIG.ultraBossLootMult
            : v.mega ? CONFIG.megaBossLootMult : CONFIG.bossLootMult;
          s.gold += Math.ceil(rew * m); // boss loot (zlato) — ať sim sedí s hrou
          // boss loot 🕊 — stejně jako engine.rollBossLoot; bez tohohle sim podhodnotí
          // dove příjem (mega/ultra/archon po cestě) → vypadá to, že prestige roste pomaleji než ve hře.
          if (v.archon) s.prestige.forgiveness += CONFIG.archonBossDoves;
          else if (v.ultra) s.prestige.forgiveness += CONFIG.ultraBossDoves;
          else if (v.mega && Math.random() < CONFIG.megaBossDoveChance) s.prestige.forgiveness += 1;
        }
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

    // Rebirth jen když se VYPLATÍ. Pozn.: od zavedení obtížnosti škálované prestige
    // je čerstvý běh tvrdší → rebirth „hned jak boss uteče" je past (zacyklíš se na
    // stejné úrovni). Rozumný hráč rebirthne, až udělá reálný postup; když je
    // beznadějně zaseklý a nikam to nevede, rebirthne i tak (jiná investice 🕊).
    // Push deeper: čerstvý běh teď stojí víc, takže se vyplatí jet dlouho a nabrat
    // velkou dávku 🕊 najednou (ne se cyklit na nízké úrovni). ~zdvojnásob start.
    const progressed = s.highestLevel >= Math.max(runStartLevel + 70, runStartLevel * 2);
    const wantRebirth = (stuck >= 4 && progressed) || stuck >= 20;
    if (!process.argv.includes('--norebirth') && wantRebirth && forgivenessGain(s.highestLevel) >= 3) {
      s.prestige.forgiveness += forgivenessGain(s.highestLevel);
      s.prestige.rebirths++;
      rebirths++;
      spendForgiveness(s);
      runStartLevel = 1 + s.prestige.headstart * 3;
      resetRun(s, runStartLevel);
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
  const hp = enemyMaxHp(s.level, variant, difficultyScale(s));
  const e = { variant, hp, maxHp: hp };
  if (variant.boss) e.timer = (variant.archon ? CONFIG.archonBossTime : variant.ultra ? CONFIG.ultraBossTime : variant.mega ? CONFIG.megaBossTime : CONFIG.bossTime) / 1000;
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

/* ---------------------------------------------------------------------------
   BLITZ MÓD  —  `npm run balance --blitz`
   Měří „post-rebirth blitz": jak dlouhý souvislý úsek úrovní hráč instakilluje
   na ČERSTVÉM běhu (level 1) s danou prestige silou. Bez anti-blitz škálování je
   tenhle úsek klidně 150+ levelů „o ničem". Sweepuje CONFIG.difficultyExp, takže
   slouží přímo k ladění toho čísla (kompromis: kratší blitz vs. menší přínos
   prestige). „zeď" = první level, kde kill > 8 s (běh se reálně zpomalí). */
function measureBlitz(prestige, exp) {
  const saved = CONFIG.difficultyExp;
  CONFIG.difficultyExp = exp;
  const s = createState();
  Object.assign(s.prestige, prestige);
  let blitz = 0;
  let blitzOpen = true;
  let wall = null;
  for (s.level = 1; s.level <= 6000; s.level++) {
    const variant = variantForLevel(s.level);
    const hp = enemyMaxHp(s.level, variant, difficultyScale(s));
    spend(s); // koupí, co si může dovolit, než zaútočí
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
    if (wall != null && s.level > wall + 30) break;
  }
  CONFIG.difficultyExp = saved;
  return { blitz, wall: wall || '∞' };
}

if (process.argv.includes('--blitz')) {
  const LOADOUTS = {
    'fresh   (rage0)  ': { rage: 0 },
    'modest  (rage40) ': { rage: 40, fist: 20, factory: 12, crit: 10, greed: 18 },
    'strong  (rage90) ': { rage: 90, fist: 40, factory: 20, crit: 18, greed: 30, shadow: 12 },
    'deep    (rage160)': { rage: 160, fist: 70, factory: 28, crit: 25, greed: 45, shadow: 20 },
    'whale   (rage260)': { rage: 260, fist: 110, factory: 32, crit: 30, greed: 60, shadow: 30 },
  };
  const EXPS = process.env.EXPS ? process.env.EXPS.split(',').map(Number) : [0, 0.5, 0.65, 0.78, 0.9, 1.0];
  console.log('=== EKI CLICKER — blitz sim (délka post-rebirth instakill úseku) ===\n');
  console.log('Aktuální CONFIG.difficultyExp =', CONFIG.difficultyExp, '\n');
  console.log('prestige loadout  |', EXPS.map((e) => `exp${e}`.padStart(8)).join(' '));
  console.log('------------------|' + '-'.repeat(EXPS.length * 9));
  for (const [name, p] of Object.entries(LOADOUTS)) {
    const cells = EXPS.map((e) => {
      const { blitz, wall } = measureBlitz(p, e);
      return `${blitz}/${wall}`.padStart(8);
    });
    console.log(`${name} |`, cells.join(' '));
  }
  console.log('\nbuňka = blitz / zeď   (blitz = poslední instakill level od startu, zeď = kde kill>8 s)');
  console.log('exp0 = vypnuto (původní chování). Rozdíl zdí mezi loadouty = kolik reach navíc prestige koupí.');
  console.log('Cíl: blitz „dost na pocit síly, ne 150 o ničem" + prestige pořád posouvá zeď dál.');
  process.exit(0);
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
