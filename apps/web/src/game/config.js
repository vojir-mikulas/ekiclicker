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
// Ladicí přepis číselných knobů přes env (jen pro simulátor; v prohlížeči je
// `process` undefined → vždy se použijí výchozí literály níže). Umožní `FLOOR=1.01
// node scripts/simulate.js` bez editace souboru.
const tune = (k, d) => {
  const v = typeof process !== 'undefined' && process.env ? process.env[k] : undefined;
  return v !== undefined && v !== '' ? Number(v) : d;
};

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
  curveG0: tune('G0', 1.16),    // počáteční růst HP/úroveň (≈ původní hpGrowth)
  curveFloor: tune('FLOOR', 1.20), // asymptota růstu HP/úroveň. POZOR: tahle páčka NEZASTAVÍ
  // „buy→blitz" — silný/ascended účet protne i strmou křivku za pár minut (sim: i @1,049 blitz
  // na ~700-2000). Navíc >1,02 rozjede HP geometricky → přeteče float / 30000 NEDOSAŽITELNÉ.
  // Drž ji na 1,0 (mírná střední hra, dosažitelnost). Tvrdost coastu/endgame řeš HARDENem (níž)
  // + difficultyExp; blitz ASCENDED účtů umí utlumit JEN strop meta-síly (cosmicWrath/rage) — viz exp.
  curveKnee: tune('KNEE', 200),   // „koleno": L, kde růst klesne na půl cesty mezi G0 a floor
  // Zlato je svázané se STEJNOU křivkou: goldGrowth(L) = 1 + goldRatio×(g(L)-1).
  // goldRatio<1 → mírná, ale TRVALÁ brzda (odměna/HP pomalu klesá → zeď existuje
  // v každé hloubce, žádný coast-to-∞). NASTAVUJE ZEĎ ČERSTVÉHO BĚHU (bez prestige):
  // 0,62 → čerstvý dojede až ~1289 („1→1200 bez rebirthu"); 0,58 → ~298 (rebirth se
  // VYŽADUJE brzo). Hypersenzitivní kolem 0,55–0,62 (sweep: 0,55→99, 0,58→298,
  // 0,60→693, 0,62→1289), ale zeď SATURUJE — i +400 % zlata (album/cech/peklo/sezóna)
  // posune čerstvou zeď jen 298→~880, NE zpět na 1200 → bezpečně drží „žádný 1→1200".
  // Páruje se s difficultyExp (níž): goldRatio = základní zeď, exp = rozpětí prestiže.
  goldRatio: tune('RATIO', 0.68),
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
  bossLootMult: 0.7, // Golden Eki: poklad = odměna × tohle (jen zlato)
  megaBossLootMult: 0.75, // Eki Král: trochu víc zlata…
  megaBossDoveChance: 0.4, // …a šance upustit 1 🕊
  ultraBossLootMult: 3, // Eki Titán: balík zlata…
  ultraBossDoves: 2, // …a zaručeně 2 🕊 (odměna za velký milník)
  archonBossLootMult: 8, // Eki Archón: obří balík zlata…
  archonBossDoves: 5, // …a zaručeně 5 🕊 + jeden kus sady „Věčný" (rollSetItem)

  // --- HLUBOKÝ HARDEN (geometrický ocas obtížnosti) — ENDGAME STROP ~5000 ---
  // Plochý ocas křivky (floor=1,0) sám HP asymptotuje → koupená síla ho v endgame
  // přeroste DONEKONEČNA = žádný strop (whale „utíkal" za 6000+, nikdy nezdil).
  // MÍRNÝ harden to opravuje: +0,1 %/úr HP nad křivku od hardenFrom. To dá nejhlubší
  // prestiži REÁLNÝ endgame strop ~5000 (whale zeď 4989), ale je dost mírný, aby
  // ZŮSTAL POLYNOMIÁLNĚ MĚKKÝ → hlubší prestiž ho dál posouvá (žebřík ...3351→4989→…
  // pokračuje DONEKONEČNA, žádná cihlová zeď). Bezpečný proti přetečení: 1,001 drží
  // HP konečné do ~L450k (a ENEMY_HP_CAP=1e300 chrání i dál → vždy zabitelné). Strmější
  // harden (1,018) přeteče float kolem L~34000 — proto JEN mírný. Páka „tvrdost endgame".
  hardenFrom: tune('HFROM', 2000),
  hardenRamp: tune('HRAMP', 1.0023), // 1,0 = vypnuto. Měkká zeď ~6500: harden od L2000, +0,23 %/úr →
  // u L1000 a roste +0,3 %/úr. ODMĚNA SE NEHARDÍ (jen HP) → nad L1000 padá odměna/HP geometricky →
  // ekonomika UŠKRTÍ blitz (nedá se ufinancovat skok) A každý hlubší level trvá geometricky dýl = grind
  // na DNY. Bezpečné proti přetečení: HP@30000 ≈ 1e90 (cap 1e300 chrání i dál). Páka „tvrdost coastu+endgame".

  // --- obtížnost škáluje s prestige silou (ANTI-BLITZ) ---
  // Problém: po rebirthu si neseš veškerou prestige sílu (hlavně Věčný hněv,
  // ×1,16/level NÁSOBNĚ). Čerstvý běh pak instakilluje VŠECHNO až ke zdi — klidně
  // 150 levelů „o ničem". Řešení: HP nepřítele × (prestige damage power)^difficultyExp.
  // exp<1 → každý rebirth pořád posune zeď dál (prestige se VYPLATÍ), ale blitz je
  // OMEZENÝ, ne neomezený. První běh (bez prestige) je nedotčený (power=1 → ×1).
  // Laděno simulátorem (`npm run balance --blitz`). Vyšší exp = kratší blitz, ale
  // menší přínos prestige; 0 = vypnuto (původní chování).
  // POZN. (decaying-curve přestavba): při ploché pozdní křivce hluboká prestiž jinak
  // „burstne" instakillem (vše one-hit). HLAVNÍ páka proti one-hitu ⇄ dosahu:
  //   nižší exp = větší dosah prestiže, ale delší one-hit burst po rebirthu;
  //   vyšší exp = krátký/žádný burst (svižnější tempo), ale menší přínos prestiže.
  // Laděno simulátorem (blitz tabulka, @goldRatio0,58) — exp NASTAVUJE ROZPĚTÍ DOSAHU
  // PRESTIŽE (čerstvá zeď ~298 je exp-nezávislá; prestiž ji posouvá výš):
  //   exp | fresh modest strong  deep  whale     (brány: loot1000 elix1500 pets2000
  //   0,74|  298   872   1774   3111   3264       wpn2400 rune2500 ench3000 mast4000)
  //   0,78|  298   791   1299   2481   3192   ← čistý žebřík, každý stupeň má reálnou GRIND zónu
  //   0,82|  298   769    998   1871   3129       po výbuchu (strong<1000 → mine loot bránu)
  // 0,78 = sweet spot: strong→loot, deep→pets/wpn, whale→ench; žádný stupeň není jen
  // „burst". Burst je v REÁLNÉM čase rychlý (maxDefeatsPerTick 50×10/s = 500 killů/s →
  // 2400 lvl ≈ 5 s nárazu síly), pak nastane skutečný GRIND v zóně killS 0,3–8 s.
  // Nižší exp = větší dosah prestiže ale delší náraz; vyšší = svižnější ale stlačený
  // žebřík. Páruje se s goldRatio (výš): goldRatio = základní zeď, exp = rozpětí.
  // (Dřív 0,95 — to ale bylo s goldRatio0,62, kde volná ekonomika „utíkala" na 5000;
  // při utažené 0,58 zeď saturuje, takže nižší exp už neutíká → koherentní spolu-laděno.)
  difficultyExp: tune('DEXP', 0.39),

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
  // Strop překreslování UI (notify) ODPOJENÝ od obnovovací frekvence displeje.
  // Bez něj jede React reconciliation na 120/144 Hz panelech 2–2,4× častěji než
  // je potřeba (proto „seká" právě na výkonných zařízeních). 33 ms ≈ 30 Hz —
  // HP/časomíry mají CSS transition, takže zůstanou plynulé i při tomto kroku.
  uiTickMs: 33,
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

  // --- Boxovací kruh (⭕) — reflexní klikací prsten → jeden velký KNOCKOUT úder ---
  // Cvaknutí sejme JEDEN velký zásah = totalDps × comboRingNukeDpsSeconds (= „N sekund
  // tvého plného DPS v jednom úderu", stejný základ jako nuke rituál „Bouřka" i zlatý
  // balík Lucky). totalDps nese CELÝ build (zbraně + Stín pěsti + power/rage/fist/gear),
  // takže škáluje pro KAŽDÝ build — ne jen punch (clickDamage je u zbraňového buildu
  // titěrný → dřív byl nuke slabší než vlastní auto-DPS). Bez buffu (zuřivost dává
  // čtyřlístek/Lucky). Záměrně mimo _recordDmg (jako nuke rituálů/výtah) → nenafoukne
  // atestovaný peakDps. Jeden zásah zabije max 1 Ekiho (applyDamage nepřelévá), proti
  // bossovi ubere balík HP úměrný DPS. Strana spawnu = hláška.
  comboRingSpawnChancePerSec: 0.012, // šance/s (vzácnější než Lucky)
  comboRingLifetimeMs: 5000,         // jak dlouho prsten visí, než zmizí (reflex)
  // úder = max(totalDps × dpsSeconds, clickDamage × krit × punchFloor) — bere VĚTŠÍ
  // z obou zdrojů síly: DPS (zbraňový build) nebo úder×krit (punch build / než máš
  // zbraně). Floor drží úder smysluplný i u čerstvého hráče (jako Lucky max()).
  comboRingNukeDpsSeconds: 15,       // knockout úder ≥ totalDps × tolik sekund
  comboRingNukePunchFloor: 10,       // …a zároveň ≥ clickDamage × krit. násobič × tohle
  // KASKÁDA: úder prorazí ŘADOU Ekiů (přebytek po zabití přeteče na dalšího), aby bylo
  // škálování z buildu VIDĚT — na jednom Ekim ho strop HP schová (1 zásah = 1 kill).
  // Strop killů = anti-blitz mez (silný build jinak skočí o moc úrovní z jednoho kruhu).
  comboRingMaxKills: 12,             // nejvíc tolik Ekiů srazí jeden knockout

  // --- Vyšlehanej Eki (🍄 tajná psychedelická varianta) ---
  // Vzácně se objeví v aréně (jen v hloubce); zabití tě pošle na „trip": celá scéna
  // se rozvlní + balík BOUNDED odměn (zlato/💠/🕊/zuřivost) → žádný dmgPct, žádný
  // vliv na snapshot obtížnosti (drží anti-blitz filozofii jako Lucky/album/runy).
  tripMinLevel: 2000,        // objeví se až od této úrovně (endgame překvapení)
  tripSpawnChance: 0.0015,   // ~0,15 % nebossových spawnů v hloubce
  tripGoldDpsSeconds: 120,   // zlatý balík ≥ 120 s aktuálního DPS…
  tripGoldRewardMult: 8,     // …nebo 8× vlastní odměna varianty (co je víc)
  tripDustPerLevel: 0.5,     // 💠 úlomky = level × 0,5 × dustMult
  tripDoves: 1,              // 🕊 Odpuštění z tripu (bounded)
  tripFrenzyBonusMs: 6000,   // trip prodlouží spuštěnou zuřivost o tolik (euforie)
  tripScreenMs: 9000,        // jak dlouho trvá psychedelický „trip" celé scény

  // --- Pekelný výtah (Hellevator) ---
  // Patro = jeden démon; HP každého patra = HP wall-Ekiho × hellBaseFrac × hellGrowth^(f-1).
  // hellBaseFrac stáhne PRVNÍ patro na malý zlomek wall-enemy (rychlý rozjezd), hellGrowth
  // pak dělá ČISTÝ exponenciál → ~50 pater je matematická zeď i pro whaly. Obě páčky se ladí
  // simulátorem proti reálnému DPS (cíl ~30–50 pater u dobrého buildu). Protože base škáluje
  // s highestLevel × difficultyScale (jako svět), počet pater je POWER-NORMALIZOVANÝ —
  // měří headroom buildu, ne raw progres. (Plný config je v data/hellevator.js.)
  hellBaseFrac: 0.025, // patro 1 = 2,5 % HP wall-Ekiho na tvé nejvyšší úrovni
  hellGrowth: 1.18,    // násobič HP mezi patry (čistý exponenciál → zeď kolem ~50)
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
   drží konstantně. Strop 220k → křivka „žije" až do cílových 200k úrovní (jinak by se
   nad 12k zploštila a hra by tam ztratila progresi). LUT ~3,5 MB, build ~pár ms 1×. */
const CURVE_MAX = 220000;
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
  weaponMilestone: 20, // každých 20 kusů zbraně = milník (×weaponMilestoneMult poškození + tier synergie)
  weaponMilestoneMult: 1.4, // ×1,4 poškození zbraně za milník (dřív ×2 — plynulejší růst, méně skoková)
  // ARZENÁLOVÁ SYNERGIE — drží rané/střední zbraně „za nákup" i v endgame.
  // Rané zbraně mají oproti špičce ŘÁDOVĚ nižší baseDmg → jako PŘÍMÝ zdroj DPS pozdní
  // hru nikdy nedohoní. Místo toho každý milník (každých weaponMilestone kusů) JAKÉKOLIV
  // zbraně dá malý GLOBÁLNÍ bonus ke VŠEM zbraním → dotlačit i levnou ranou zbraň na další
  // milník posílí celý arzenál. BOUNDED + NEvstupuje do difficultyScale (jako weaponPct/
  // milník) → anti-blitz/anti-runaway beze změny.
  // ODSTROPOVÁNO (2026-06-29): místo tvrdého stropu 5/zbraň teď DIMINISHING-UNCAP —
  // prvních arsenalSynergyTierFull milníků/zbraň se počítá plně, každý další jen
  // arsenalSynergyFalloff^k (klesající řada → asymptota) → mega-stack jedné zbraně
  // (buy-1000×) se VYPLATÍ, ale výnos rychle klesá (drží napříč-nákup smysl) a celá
  // synergie zůstává malá (strop ζ ≈ 1/3 pěsti — viz docs/plans/weapons-overhaul.md).
  arsenalSynergyPerTier: 0.02,  // +2 % všem zbraním za každý započítaný milník
  arsenalSynergyTierFull: 5,    // prvních N milníků/zbraň plně (= 100 kusů)
  arsenalSynergyFalloff: 0.7,   // každý další milník přispěje 0,7^k (klesající → asymptota ≈ +full/(1-falloff)/zbraň)
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
