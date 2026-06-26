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
  // --- nepřítel: KŘIVKA OBTÍŽNOSTI (klesající růst / decaying growth) ---
  // Růst HP za úroveň NENÍ konstantní — klesá z curveG0 k curveFloor podle
  // „kolena" curveKnee:  g(L) = curveFloor + (curveG0 - curveFloor)/(1 + L/curveKnee).
  // Brzká hra je strmá (×~1,14/úr → tvrdý výstup, motivace k rebirthu), pozdní hra
  // mírná (×~1,02/úr) → úroveň 3000–5000 je DOSAŽITELNÁ pro hlubokou prestiž a
  // magnitudy zůstanou zvládnutelné (zbraně i zlato drží krok). Nahrazuje původní
  // konstantní hpGrowth=1,155, kvůli kterému měl L3000 ~1e188 HP a zbraně „nic".
  baseHp: 10,
  baseGold: 14,
  curveG0: 1.16,    // počáteční růst HP/úroveň (≈ původní hpGrowth)
  curveFloor: 1.0,  // asymptota růstu v pozdní hře (×1 → HP přestane prudce růst)
  curveKnee: 200,   // „koleno": L, kde růst klesne na půl cesty mezi G0 a floor
  // Zlato je svázané se STEJNOU křivkou: goldGrowth(L) = 1 + goldRatio×(g(L)-1).
  // goldRatio<1 → mírná, ale TRVALÁ brzda (odměna/HP pomalu klesá → zeď existuje
  // v každé hloubce, žádný coast-to-∞). HLAVNÍ ladicí páka obtížnosti („mid").
  goldRatio: 0.62,
  bossEvery: 5, // každá 5. úroveň = boss (Golden Eki)
  megaBossEvery: 25, // každá 25. = mega boss (Eki Král)
  ultraBossEvery: 100, // každá 100. = ultra boss (Eki Titán) — endgame milník
  archonBossEvery: 500, // každá 500. = Eki Archón — pozdní endgame, zdroj sady „Věčný"
  bossTime: 30000, // limit na zabití bosse (ms), jinak uteče
  megaBossTime: 40000,
  ultraBossTime: 60000,
  archonBossTime: 90000,
  maxDefeatsPerTick: 50, // pojistka kill/tick (anti-lag) — nejvíc tolik porážek za krok

  // --- BOSS LOOT (poklad za zabití bosse) ---
  // Navíc K normální odměně. Zlato je jen KONSTANTNÍ násobič (nezpůsobuje
  // runaway — ten dělá jen růst závislý na úrovni). Hlavní lákadlo jsou 🕊
  // z mega/ultra bossů → propojení s prestige metou. Vše laditelné zde.
  // POZOR: bossové už jsou dominantní zdroj zlata (Golden Eki = 18× normál), takže
  // i malý násobič se přes reinvestici znásobí. Drž ho NÍZKO — hlavní odměna jsou 🕊.
  bossLootMult: 0.25, // Golden Eki: poklad = odměna × tohle (jen zlato)
  megaBossLootMult: 0.75, // Eki Král: trochu víc zlata…
  megaBossDoveChance: 0.4, // …a šance upustit 1 🕊
  ultraBossLootMult: 3, // Eki Titán: balík zlata…
  ultraBossDoves: 2, // …a zaručeně 2 🕊 (odměna za velký milník)
  archonBossLootMult: 8, // Eki Archón: obří balík zlata…
  archonBossDoves: 5, // …a zaručeně 5 🕊 + jeden kus sady „Věčný" (rollSetItem)

  // --- pozdní hra (graduální ztížení) ---
  hardenFrom: 80, // od této úrovně se HP začne ztěžovat navíc
  hardenRamp: 1.012, // +1.2 % HP/úroveň nad hardenFrom (kumulativně)

  // --- obtížnost škáluje s prestige silou (ANTI-BLITZ) ---
  // Problém: po rebirthu si neseš veškerou prestige sílu (hlavně Věčný hněv,
  // ×1,16/level NÁSOBNĚ). Čerstvý běh pak instakilluje VŠECHNO až ke zdi — klidně
  // 150 levelů „o ničem". Řešení: HP nepřítele × (prestige damage power)^difficultyExp.
  // exp<1 → každý rebirth pořád posune zeď dál (prestige se VYPLATÍ), ale blitz je
  // OMEZENÝ, ne neomezený. První běh (bez prestige) je nedotčený (power=1 → ×1).
  // Laděno simulátorem (`npm run balance --blitz`). Vyšší exp = kratší blitz, ale
  // menší přínos prestige; 0 = vypnuto (původní chování).
  difficultyExp: 0.78,

  // --- souboj ---
  critChance: 0.1,
  critMult: 4,
  comboWindow: 1500, // ms na udržení comba
  comboMax: 100, // strop comba
  comboPerHit: 0.015, // +1.5 % poškození za stupeň comba

  // --- anti-cheat ---
  // Strop tempa kliků (~22/s). Lidská ruka tohle nepřekročí; autokliker ano.
  // Kontroluje se na vstupu (Arena.jsx) — klik rychlejší než tohle se zahodí,
  // takže nenabíjí ani combo, ani nálož zuřivosti. Engine zůstává nedotčený.
  minClickMs: 45,

  // --- herní smyčka ---
  tickMs: 100, // sim krok (DPS se aplikuje spojitě)
  dpsWindowMs: 1500, // okno pro měřené DPS (úder/skutečné) — plynulý klouzavý průměr

  // --- offline ---
  offlineCapH: 12, // strop offline výdělku (hodiny)
  offlineRate: 0.5, // offline DPS je poloviční → online hra se vyplatí víc

  // --- ANTI-LAG STROPY ---
  // FX prvky se RECYKLUJÍ z object-poolů (žádné createElement/remove každý snímek).
  // Tyto stropy = kolik prvků daného typu smí být živých zároveň; při překročení
  // se recykluje nejstarší (žádné nové alokace → žádný GC tlak → žádné sekání).
  maxProjectiles: 32, // víc létajících emoji (zbraně + pěst) se nikdy nezobrazí
  maxCoins: 96, // strop živých mincí (jeden výbuch jich pustí 18–22)
  maxFloaters: 40, // strop živých plovoucích čísel/textů zároveň
  maxPows: 24, // strop živých „POW" bublin zároveň
  maxFloatersPerSec: 18, // strop plovoucích čísel za sekundu
  weaponVisualMinMs: 420, // jedna zbraň pustí projektil nejvýš ~2×/s (jen efekt)
  shadowVisualMs: 480, // jak často letí „duch-pěst" Stínu pěsti (jen efekt)
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

/* Zrychlující obtížnost v pozdní hře (PONECHÁNO pro zpětnou kompatibilitu, ale
   křivka obtížnosti ho už NEPOUŽÍVÁ — klesající růst dělá tvarování sám; geometrický
   harden by nad křivku zase přimíchal exponenciál a rozbil magnitudy). */
export const hardenScale = (level) =>
  Math.pow(CONFIG.hardenRamp, Math.max(0, level - CONFIG.hardenFrom));

/* KŘIVKA OBTÍŽNOSTI — kumulativní součin klesajícího růstu g(i).
   Bez uzavřené formy → předpočítáno do LUT při načtení modulu (O(1) čtení, sdílí
   ho hra, simulátor i cena zaklínání). hpCurve(L)=Π_{i<L} g(i) (jako dřív
   hpGrowth^(L-1)); goldCurve(L)=Π_{i<L} (1+goldRatio·(g(i)-1)). Nad CURVE_MAX se
   drží konstantně (nikdo tam nedojde). */
const CURVE_MAX = 12000;
const HP_CURVE = new Float64Array(CURVE_MAX + 1);
const GOLD_CURVE = new Float64Array(CURVE_MAX + 1);
HP_CURVE[1] = 1;
GOLD_CURVE[1] = 1;
for (let L = 2; L <= CURVE_MAX; L++) {
  const g = CONFIG.curveFloor + (CONFIG.curveG0 - CONFIG.curveFloor) / (1 + (L - 1) / CONFIG.curveKnee);
  HP_CURVE[L] = HP_CURVE[L - 1] * g;
  GOLD_CURVE[L] = GOLD_CURVE[L - 1] * (1 + CONFIG.goldRatio * (g - 1));
}
const clampLevel = (level) => Math.min(CURVE_MAX, Math.max(1, Math.floor(level)));
export const hpCurve = (level) => HP_CURVE[clampLevel(level)];
export const goldCurve = (level) => GOLD_CURVE[clampLevel(level)];

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
  critDmgPerLevel: 0.5, // gold "Tvrdý dopad": +0,5 ke krit násobiči za level
  fortuneGoldPerLevel: 0.08, // gold "Chamtivost": +8 % zlata za level (lineárně)
  rhythmPerLevel: 0.004, // gold "Rytmus": +0,4 % combo poškození/zásah za level
  wrathDurMs: 600, // gold "Zuřivá nálož": +0,6 s trvání zuřivosti za level
};

/* Tier-2 prestige (capstones) — odemykají se po hluboké investici do rodiče.
   Vše BOUNDED/aditivní (žádný nový exponenciál — ten zůstává jen power/rage).
   Magnitudy za level; popisky v data/prestige.js z nich vychází. */
export const CAPS = {
  forgivenessPerLevel: 0.08, // 🕯️ Věčné odpuštění: +8 % 🕊 z rebirthu / level
  comboCapPerLevel: 5,       // 🔗 Mistr comba: +5 ke stropu comba / level
  bossTimePerLevel: 0.08,    // 🏹 Lovec bossů: +8 % času na bosse / level
  bossGoldPerLevel: 0.12,    // 🏹 Lovec bossů: +12 % zlata z bossů / level
  dustPerLevel: 0.20,        // ⚒️ Klenotník: +20 % úlomků / level
  dropChancePerLevel: 0.003, // ⚒️ Klenotník: +0,3 p.b. šance na drop / level
};
