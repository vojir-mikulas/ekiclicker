/* Achievementy s odměnami.
   Každý má `check(ctx)` (vrací true při splnění) a `reward`:
     - dmg:  trvalý násobič poškození (1.03 = +3 %), kompounduje se přes všechny
     - gold: trvalý násobič zlata
     - forgiveness: jednorázové Odpuštění 🕊
   ctx = { level, highestLevel, stats, weapons, prestige }
   Odměny jsou malé jednotlivě, ale "každý kousek se počítá" a motivují prozkoumat hru. */

const tier = (idBase, name, emoji, descFn, valueFn, thresholds, rewardFn) =>
  thresholds.map((t, i) => ({
    id: `${idBase}_${i}`,
    name: `${name} ${i + 1}`,
    emoji,
    desc: descFn(t),
    check: (ctx) => valueFn(ctx) >= t,
    reward: rewardFn(i, t),
  }));

export const ACHIEVEMENTS = [
  // --- dosažená úroveň ---
  ...tier('level', 'Stoupání', '🪜',
    (t) => `Dosáhni úrovně ${t}`,
    (c) => c.highestLevel,
    [10, 25, 50, 100, 200, 350, 600, 1000, 2000, 5000],
    (i) => ({ dmg: 1.03 + i * 0.01, forgiveness: i >= 4 ? i : 0 })),

  // --- poražení nepřátelé ---
  ...tier('kills', 'Mlátička', '👊',
    (t) => `Zmlať ${t.toLocaleString('cs')} Ekiů`,
    (c) => c.stats.kills,
    [50, 250, 1000, 5000, 25000, 100000],
    (i) => ({ gold: 1.03 + i * 0.01 })),

  // --- bossové ---
  ...tier('boss', 'Lovec bossů', '🥇',
    (t) => `Sejmi ${t} bossů (Golden/King)`,
    (c) => c.stats.bossKills,
    [5, 25, 100, 500, 2000],
    (i) => ({ dmg: 1.04 + i * 0.015, gold: 1.02 })),

  // --- kliky ---
  ...tier('clicks', 'Klikač', '🖱️',
    (t) => `Klikni ${t.toLocaleString('cs')}×`,
    (c) => c.stats.totalClicks,
    [100, 1000, 10000, 100000, 1000000],
    (i) => ({ dmg: 1.03 + i * 0.01 })),

  // --- nasbírané zlato (za celý život) ---
  ...tier('gold', 'Boháč', '💰',
    (t) => `Vydělej celkem ${fmtBig(t)} 🪙`,
    (c) => c.stats.totalGold,
    [1e4, 1e7, 1e10, 1e14, 1e18, 1e24],
    (i) => ({ gold: 1.05 + i * 0.02 })),

  // --- combo ---
  ...tier('combo', 'Kombinátor', '🔗',
    (t) => `Drž combo ×${t}`,
    (c) => c.stats.maxCombo,
    [25, 50, 100],
    (i) => ({ dmg: 1.04 + i * 0.02 })),

  // --- rebirthy ---
  ...tier('rebirth', 'Odpouštěč', '🕊',
    (t) => `Odpusť Tomášovi ${t}×`,
    (c) => c.prestige.rebirths,
    [1, 5, 15, 50],
    (i) => ({ dmg: 1.05 + i * 0.03, gold: 1.05 + i * 0.03 })),

  // --- frenzy ---
  ...tier('frenzy', 'Zuřivec', '😡',
    (t) => `Spusť zuřivost ${t}×`,
    (c) => c.stats.frenzies,
    [1, 25, 200],
    (i) => ({ dmg: 1.05 + i * 0.03 })),

  // --- Lucky Eki ---
  ...tier('lucky', 'Šťastlivec', '🍀',
    (t) => `Chyť ${t} Lucky Eki`,
    (c) => c.stats.luckyClicks,
    [1, 10, 50, 200],
    (i) => ({ gold: 1.06 + i * 0.02 })),

  // --- poklad z bossů (🕊 z mega/ultra) ---
  ...tier('loot', 'Hledač pokladů', '💰',
    (t) => `Vylootuj ${t}× 🕊 z bossů`,
    (c) => c.stats.lootDoves,
    [1, 10, 50, 200],
    (i) => ({ dmg: 1.04 + i * 0.02, gold: 1.04 + i * 0.02 })),

  // --- speciální jednorázové ---
  {
    id: 'titan_slayer',
    name: 'Zabiják Titánů',
    emoji: '🌟',
    desc: 'Sejmi Eki Titána (ultra boss, každá 100. úroveň)',
    check: (c) => c.stats.ultraKills >= 1,
    reward: { dmg: 1.25, gold: 1.25 },
  },
  {
    id: 'archon_slayer',
    name: 'Zabiják Archónů',
    emoji: '👁️',
    desc: 'Sejmi Eki Archóna (každá 500. úroveň) — zdroj sady Věčný',
    check: (c) => (c.stats.archonKills || 0) >= 1,
    reward: { dmg: 1.4, gold: 1.4 },
  },
  {
    id: 'arsenal_full',
    name: 'Plný arzenál',
    emoji: '⚔️',
    desc: 'Vlastni alespoň 1 kus od každé zbraně',
    check: (c) => Object.keys(c.weaponDefs).every((id) => (c.weapons[id] || 0) > 0),
    reward: { dmg: 1.2, gold: 1.2 },
  },
  {
    id: 'hoarder',
    name: 'Hromaditel',
    emoji: '🏭',
    desc: 'Měj 100 kusů jedné zbraně',
    check: (c) => Object.values(c.weapons).some((n) => n >= 100),
    reward: { dmg: 1.15 },
  },
  {
    id: 'maxspeed',
    name: 'Na doraz',
    emoji: '🏎️',
    desc: 'Vymaxuj Zrychlení zbraní (endgame strop)',
    check: (c) => (c.upgrades.speed || 0) >= 80,
    reward: { dmg: 1.1 },
  },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

function fmtBig(n) {
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + u[i];
}
