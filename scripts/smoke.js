/* Rychlý headless smoke test herního enginu (bez DOM/Reactu). */
import { Engine } from '../src/game/engine.js';
import { totalDps } from '../src/game/formulas.js';

let fail = 0;
const assert = (cond, msg) => { if (!cond) { console.error('❌', msg); fail++; } else { console.log('✅', msg); } };

const e = new Engine();
assert(e.state.enemy != null, 'po startu existuje nepřítel');
assert(e.state.level === 1, 'začíná na úrovni 1');

// 200 kliků
const goldStart = e.state.gold;
for (let i = 0; i < 200; i++) e.punch();
assert(e.state.stats.totalClicks === 200, 'počítá kliky');
assert(e.state.gold >= goldStart, 'klikání nezáporné zlato');

// 3 minuty simulace s občasnými nákupy
for (let t = 0; t < 1800; t++) {
  e.tick(0.1);
  if (t % 4 === 0) { e.punch(); }
  if (t % 10 === 0) {
    e.buyWeapon('glove'); e.buyWeapon('bat'); e.buyWeapon('baseball');
    e.buyUpgrade('punch'); e.buyUpgrade('power'); e.buyUpgrade('speed');
  }
}
assert(e.state.level > 1, `postoupil na úroveň ${e.state.level}`);
assert(e.state.gold >= 0, 'zlato nikdy nezáporné');
assert(Number.isFinite(totalDps(e.state)), 'DPS je konečné číslo');
assert(totalDps(e.state) > 0, `má auto DPS (${Math.round(totalDps(e.state))})`);
assert(e.state.stats.kills > 0, `zabil ${e.state.stats.kills} nepřátel`);
assert(Object.keys(e.state.achievements).length > 0, `odemkl ${Object.keys(e.state.achievements).length} úspěchů`);
assert(e.state.weapons.glove > 0, 'vlastní zbraň glove');

// nelze koupit, na co nemáš
const before = { gold: e.state.gold, lvl: e.state.upgrades.power };
e.state.gold = 0;
e.buyUpgrade('power');
assert(e.state.upgrades.power === before.lvl, 'bez zlata nekoupí');
e.state.gold = before.gold;

// rebirth (vynutíme dostatečnou úroveň)
e.state.highestLevel = 80;
const gain = e.forgivenessGain();
const forgivenessBefore = e.state.prestige.forgiveness; // může být >0 z boss lootu (🕊)
assert(gain > 0, `rebirth dá ${gain} 🕊`);
const ok = e.rebirth();
assert(ok, 'rebirth proběhl');
assert(e.state.level === 1, 'po rebirthu zpět na úroveň 1');
assert(e.state.prestige.forgiveness === forgivenessBefore + gain, 'připsalo odpuštění');
assert(e.state.weapons.glove === 0, 'po rebirthu vynulované zbraně');
assert(e.state.prestige.rebirths === 1, 'počítá rebirthy');

// lucky eki
e.state.lucky = { id: 1, until: performance.now() + 9000, x: 50, y: 30 };
const g2 = e.state.gold;
e.catchLucky();
assert(e.state.gold > g2, 'lucky eki dal zlato');
assert(e.state.lucky === null, 'lucky eki po chycení zmizel');

// hard reset
e.hardReset();
assert(e.state.level === 1 && e.state.prestige.rebirths === 0, 'hard reset vynuloval vše');

console.log(fail === 0 ? '\n🎉 VŠE OK' : `\n💥 ${fail} CHYB`);
process.exit(fail === 0 ? 0 : 1);
