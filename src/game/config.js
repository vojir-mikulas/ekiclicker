/* =========================================================================
   CONFIG — všechna čísla pro ladění hry na jednom místě.
   Vyvážení je ověřené simulátorem: `npm run balance`.

   Klíčová změna oproti původní hře:
   - Poškození UŽ NESKÁLUJE samo s úrovní (žádný `levelScale`). Dřív platilo
     "zabij rychle → leveluj rychle → poškození samo roste → zabíjej ještě
     rychleji", což hráče vystřelilo na úroveň 30000 za pár minut. Teď veškerý
     růst síly pochází z NÁKUPŮ — každé vylepšení se počítá.
   - Rychlost zbraní má strop (anti-lag) a poškození se aplikuje jako DPS×Δt,
     takže projektily jsou jen efekt a hra neseká ani při obřím DPS.
   ========================================================================= */
export const CONFIG = {
  // --- nepřítel ---
  baseHp: 10,
  hpGrowth: 1.155, // HP za úroveň. Cíl: dlouhá hra (level 1000+ je endgame).
  baseGold: 14,
  // KLÍČOVÉ pro anti-runaway: zlato roste ZNATELNĚ pomaleji než HP. Tím poměr
  // odměna/HP klesá s úrovní → reinvestice (která jinak žene DPS² explozi) se
  // sama dusí a běh se přirozeně zpomalí do "zdi" → motivace k rebirthu.
  goldGrowth: 1.09,
  bossEvery: 5, // každá 5. úroveň = boss (Golden Eki)
  megaBossEvery: 25, // každá 25. = mega boss (Eki Král)
  bossTime: 30000, // limit na zabití bosse (ms), jinak uteče
  megaBossTime: 40000,

  // --- pozdní hra (graduální ztížení) ---
  hardenFrom: 80, // od této úrovně se HP začne ztěžovat navíc
  hardenRamp: 1.012, // +1.2 % HP/úroveň nad hardenFrom (kumulativně)

  // --- souboj ---
  critChance: 0.1,
  critMult: 4,
  comboWindow: 1500, // ms na udržení comba
  comboMax: 100, // strop comba
  comboPerHit: 0.015, // +1.5 % poškození za stupeň comba

  // --- herní smyčka ---
  tickMs: 100, // sim krok (DPS se aplikuje spojitě)
  maxDefeatsPerTick: 25, // pojistka proti zamrznutí (žádné "30000 levelů naráz")

  // --- offline ---
  offlineCapH: 12, // strop offline výdělku (hodiny)
  offlineRate: 0.5, // offline DPS je poloviční → online hra se vyplatí víc

  // --- ANTI-LAG STROPY ---
  maxProjectiles: 32, // víc létajících emoji se nikdy nezobrazí
  maxFloatersPerSec: 18, // strop plovoucích čísel za sekundu
  weaponVisualMinMs: 420, // jedna zbraň pustí projektil nejvýš ~2×/s (jen efekt)
  minWeaponInterval: 200, // logický strop rychlosti palby (ms)
  speedFloor: 0.28, // zbraně nemůžou střílet rychleji než 0.28× základ (~3.5×)
  maxSpeedLevel: 80, // strop levelu "Zrychlení" (endgame — pak už nemá smysl)

  // --- frenzy / zuřivost (dočasný buff za rychlé klikání) ---
  frenzyClicksToFill: 60, // tolik kliků naplní zuřivost
  frenzyDurationMs: 12000,
  frenzyMult: 7, // ×7 poškození během zuřivosti
  frenzyDecayPerSec: 8, // o kolik klesá nálož mimo klikání

  // --- Lucky Eki (zlatá sušenka) ---
  luckySpawnChancePerSec: 0.018, // šance/s, že se objeví
  luckyLifetimeMs: 9000,
};

/* Zrychlující obtížnost v pozdní hře */
export const hardenScale = (level) =>
  Math.pow(CONFIG.hardenRamp, Math.max(0, level - CONFIG.hardenFrom));

/* Multiplikátory (exponenciální "motor" růstu) */
export const MULT = {
  power: 1.11, // gold upgrade "Násobič síly" za level
  rage: 1.16, // prestige "Věčný hněv" za level
  fistPerLevel: 0.5, // prestige "Trénovaná pěst": +50 % k úderu/level
  greedPerLevel: 0.25, // prestige "Štědrost": +25 % zlata/level
  speed: 0.97, // gold "Zrychlení" za level (<1 = rychleji)
  factory: 0.96, // prestige "Sériová výroba" za level
  shadowPerLevel: 1, // prestige "Stín pěsti": +1 auto-úder/s za level
  luckPerLevel: 0.15, // prestige "Štěstí": +15 % šance na Lucky Eki
  critPerLevel: 0.02, // prestige "Přesnost": +2 % crit šance
  weaponMilestone: 25, // každých 25 kusů zbraně = ×2 jejímu poškození
  clickFromDpsPerLevel: 0.01, // gold "Údernost": úder + 1 % DPS za level
  punchStep: 3, // gold "Síla pěsti": +3 základ úderu za level
};
