/* =========================================================================
   PEKELNÝ VÝTAH (Hellevator) — DATA + čisté helpery (žádný stav, žádné DOM).
   CECHOVNÍ aktivita: výtah se utrhne a padá do pekla. Patro = jeden zlý Eki
   (démon). Máš PŘESNĚ 60 s — žádné prodlužování — a klikáním + zbraněmi se probij
   co NEJHLOUBĚJI. Skóre = nejhlubší patro. Hraje se jen jako člen cechu (vstup je
   z cechovní záložky), patra se sčítají do cechovního příspěvku.

   Návrhové principy (drží stejnou anti-runaway filozofii jako zbytek hry):
   - „Nejvíc pater za 60 s" je matematicky BENCHMARK špičkového DPS — stejný build
     (úder = síla, zbraně = auto DPS) jako na hlavní obrazovce, jen na čas a do
     hloubky. Obtížnost patra je DETERMINISTICKÁ funkce highestLevel ×
     difficultyScale × hellGrowth → server umí z atestovaného peakDps dopočítat
     „max věrohodné patro". Proto: žádné client-RNG mechaniky (cheat plocha).
   - 60 s je PEVNÝCH: žádné kombo-prodlužování času. Hloubka = čistě tvůj burst.
   - Odměny (🔥 Síra) jsou BEZ dmgPct → mimo difficultyScale, jako mastery/runy.

   Tenhle modul je ČISTÝ (NEimportuje formulas → žádný cyklus): formulky pro HP
   patra (hellFloorHp/hellCurve) žijí ve formulas.js a importují tahle data.
   Obrázky/skiny řeší zvlášť (browser-only), fallback = CSS-filter recolor
   základního sprite (jako stávající varianty — „barevné grading, ne textura").
   ========================================================================= */

export const HELLEVATOR = {
  runMs: 60_000,           // PEVNÁ délka sprintu (žádné prodlužování — 60 s je 60 s)
  maxKillsPerTick: 40,     // pojistka kill/tick (anti-lag), jako CONFIG.maxDefeatsPerTick

  // hell-lokální zuřivost (klikání) — kratší než hlavní, ať se vejde do 60s běhu.
  // Záměrně samostatná od s.frenzy (běh je vlastní mini-engine), ale vizuálně i
  // mechanicky stejná jako na hlavní obrazovce (klikáním nabíjíš, pak burst).
  frenzyMs: 6_000,
  frenzyClicksToFill: 22,

  // 🔥 Síra — exkluzivní měna z Hellevatoru (jako 🐉 jen ze world bosse). Klesající
  // výnos řeší STROP na běh; deep farma je tak limitovaná (jako raid vault skim caps).
  siraRunCap: 120,         // strop 🔥 za jeden běh
  siraBossBonus: 4,        // +🔥 navíc za každé bossové (každé 10.) patro
  siraDailyFirst: 30,      // bonus 🔥 za PRVNÍ běh dne (denní lákadlo)
  siraRecordBonus: 2,      // +🔥 za každé NOVÉ rekordní patro (přes minulý best)

  // Pekelné žetony — limiter běhů (jinak by 🔥 byl nekonečný faucet).
  passMax: 5,              // strop nasbíraných žetonů
  passRegenMs: 3 * 3_600_000, // regen 1 žeton / 3 h
  passDailyFree: 3,        // denní doplnění aspoň na tolik žetonů
  passBuyCostSira: 50,     // dokup 1 žetonu za 🔥

  // Směna 🔥 → 💠 (denní strop) → 🔥 má dno hodnoty i po vymaxování perků.
  exchangeRateSira: 6,     // 🔥 za 1 💠
  exchangeDailyCapDust: 40,// nejvíc 💠 ze směny za den
};

/* ----------------------------- démoni (patrová tabulka) -----------------------------
   Stejný data-shape jako variants.js (name/tier/glow/tint/filter/hp), ale PATROVĚ
   laděné: [floorFrom,floorTo] místo weighted-random. Výběr je DETERMINISTICKÝ
   (hellEnemyAt) — „nejpokročilejší démon dostupný na patře" → eskaluje a server to
   umí přepočítat. `hp` = násobič HP patra. `mech` = vlajka mechaniky (zatím spíš
   kosmetická; tvrdé per-démon mechaniky jsou připravené pro fázi 4). */
export const HELL_DEMONS = {
  imp:        { id: 'imp',        name: 'Šotek Eki',         tier: '😈 šotek',      hp: 0.6, glow: '#ff7a3c', tint: 'rgba(255,90,20,.45)',  filter: 'hue-rotate(-25deg) saturate(1.7) brightness(1.0)',                 floorFrom: 1,  floorTo: 5,  mech: 'rush' },
  horned:     { id: 'horned',     name: 'Rohatý Eki',        tier: '👿 rohatý',     hp: 0.9, glow: '#ff5a2a', tint: 'rgba(255,70,15,.5)',   filter: 'hue-rotate(-18deg) saturate(1.9) brightness(.92) contrast(1.1)',   floorFrom: 3,  floorTo: 9,  mech: 'tanky' },
  brimstone:  { id: 'brimstone',  name: 'Sírový Eki',        tier: '🟡 sírový',     hp: 1.2, glow: '#ffd23f', tint: 'rgba(255,190,40,.45)', filter: 'sepia(.6) saturate(2.4) hue-rotate(-8deg) brightness(1.05)',       floorFrom: 6,  floorTo: 14, mech: 'cloud' },
  cinder:     { id: 'cinder',     name: 'Popelavý Eki',      tier: '🌑 popelavý',   hp: 1.5, glow: '#9a8a78', tint: 'rgba(60,45,40,.55)',   filter: 'grayscale(.5) sepia(.4) brightness(.8) contrast(1.15)',            floorFrom: 8,  floorTo: 18, mech: '' },
  bloodthirsty:{ id: 'bloodthirsty', name: 'Krvelačný Eki',  tier: '🩸 krvelačný',  hp: 1.9, glow: '#ff2b3a', tint: 'rgba(180,10,20,.55)',  filter: 'saturate(2.3) hue-rotate(-12deg) brightness(.82) contrast(1.2)',   floorFrom: 10, floorTo: 24, mech: 'regen' },
  thorned:    { id: 'thorned',    name: 'Trnitý Eki',        tier: '🌵 trnitý',     hp: 2.4, glow: '#7bd23a', tint: 'rgba(110,180,40,.5)',  filter: 'hue-rotate(55deg) saturate(1.8) brightness(.9) contrast(1.15)',    floorFrom: 12, floorTo: 28, mech: 'shield' },
  magma:      { id: 'magma',      name: 'Lávový Eki',        tier: '🌋 lávový',     hp: 3.0, glow: '#ff4d1a', tint: 'rgba(255,70,10,.55)',  filter: 'sepia(.45) saturate(2.7) hue-rotate(-22deg) brightness(1.12) contrast(1.2)', floorFrom: 15, floorTo: 34, mech: '' },
  shadowflame:{ id: 'shadowflame',name: 'Stínoplamenný Eki', tier: '🟣 stínoplamenný', hp: 3.8, glow: '#b25cff', tint: 'rgba(90,20,140,.6)', filter: 'hue-rotate(250deg) saturate(2.0) brightness(.7) contrast(1.25)',   floorFrom: 18, floorTo: 40, mech: '' },
  soulless:   { id: 'soulless',   name: 'Bezduchý Eki',      tier: '🕳️ bezduchý',   hp: 4.8, glow: '#5a5a72', tint: 'rgba(10,8,18,.7)',     filter: 'grayscale(.8) brightness(.45) contrast(1.35)',                     floorFrom: 22, floorTo: 44, mech: 'eat' },
  hellspawn:  { id: 'hellspawn',  name: 'Pekelný Eki',       tier: '🔥 pekelný',    hp: 6.0, glow: '#ff3a1a', tint: 'rgba(255,50,10,.6)',   filter: 'saturate(2.6) hue-rotate(-15deg) brightness(1.0) contrast(1.3) drop-shadow(0 0 8px #ff5a1a)', floorFrom: 26, floorTo: 9999, mech: 'elite' },
};

export const HELL_DEMON_LIST = Object.values(HELL_DEMONS);

/* Bossové na milníkových patrech (každé 10.). Recyklují bossShake + dramatický
   nájezd. `every` = perioda; pro patro f%10===0 vyber bosse podle hloubky. */
export const HELL_BOSS_EVERY = 10;
export const HELL_BOSSES = [
  { floor: 10, name: 'Vrátný Pekla', tier: '🔑 BOSS', hp: 9,  glow: '#ffd23f', tint: 'rgba(255,200,40,.55)', filter: 'sepia(.6) saturate(2.2) brightness(1.1)' },
  { floor: 20, name: 'Sirný Tyran',  tier: '🟡 BOSS', hp: 14, glow: '#ffb22e', tint: 'rgba(255,170,40,.55)', filter: 'sepia(.7) saturate(2.6) hue-rotate(-8deg) brightness(1.1) contrast(1.15)' },
  { floor: 30, name: 'Pán Popela',   tier: '🌑 BOSS', hp: 20, glow: '#b0a090', tint: 'rgba(70,55,48,.6)',    filter: 'grayscale(.55) sepia(.4) brightness(.78) contrast(1.25)' },
  { floor: 40, name: 'Kníže Plamenů',tier: '🔥 BOSS', hp: 28, glow: '#ff4d1a', tint: 'rgba(255,70,10,.6)',   filter: 'saturate(2.8) hue-rotate(-20deg) brightness(1.12) contrast(1.3) drop-shadow(0 0 12px #ff5a1a)' },
  { floor: 50, name: 'Eki Lucifer',  tier: '👑 FINÁLE', hp: 40, glow: '#ff2bd0', tint: 'rgba(150,10,90,.62)', filter: 'saturate(2.6) hue-rotate(300deg) brightness(.95) contrast(1.35) drop-shadow(0 0 16px #ff2bd0)' },
];

/* Démon na daném patře — DETERMINISTICKY (žádné RNG): „nejpokročilejší démon,
   jehož rozsah patro obsahuje" (= největší floorFrom ≤ f ≤ floorTo). */
export function hellDemonAt(floor) {
  let best = HELL_DEMONS.imp;
  for (const d of HELL_DEMON_LIST) {
    if (floor >= d.floorFrom && floor <= d.floorTo && d.floorFrom >= best.floorFrom) best = d;
  }
  return best;
}

/* Boss na daném patře (jen pokud f je násobek HELL_BOSS_EVERY) — poslední boss,
   jehož `floor` ≤ f (hlubší patra dostanou Lucifera). */
export function hellBossAt(floor) {
  if (floor % HELL_BOSS_EVERY !== 0) return null;
  let boss = HELL_BOSSES[0];
  for (const b of HELL_BOSSES) if (floor >= b.floor) boss = b;
  return boss;
}

/* Sjednocený „nepřítel patra" (démon nebo boss) — sdílí hp/glow/tint/filter/name. */
export function hellEnemyAt(floor) {
  return hellBossAt(floor) || hellDemonAt(floor);
}
export const isHellBossFloor = (floor) => floor % HELL_BOSS_EVERY === 0;

/* ----------------------------- 🔥 ekonomika ----------------------------- */
/* Hrubá 🔥 za běh (PŘED denními bonusy/stropem — ty řeší engine.grantHellLoot):
   1 🔥/patro + bonus za bossová patra, zastropováno siraRunCap (klesající výnos
   řeší právě strop → deep farma je limitovaná). */
export function siraForRun(deepestFloor) {
  const f = Math.max(0, Math.floor(deepestFloor));
  if (f <= 0) return 0;
  const bosses = Math.floor(f / HELL_BOSS_EVERY);
  return Math.min(HELLEVATOR.siraRunCap, f + bosses * HELLEVATOR.siraBossBonus);
}

/* ----------------------------- 🔥 krám (bounded perky) -----------------------------
   Perky kupované za 🔥. ZÁMĚRNĚ BEZ dmgPct (gold/dust/luck = už plausibility-bounded
   výstupy) → mimo difficultyScale, žádná kontaminace ekonomiky (jako album/runy/cech).
   Žádné „run" páčky na čas/start — 60 s je pevných, takže by jen narušily
   srovnatelnost hloubky napříč cechem. stat = klíč; kind: 'combat' (fold přes
   hellShopStats). */
export const HELL_SHOP = {
  toll:    { id: 'toll',    emoji: '🪙', name: 'Pekelná mýtnice', kind: 'combat', stat: 'goldPct',    per: 0.04,  max: 5, baseCost: 30, growth: 1.6, desc: '+4 % zlata za stupeň' },
  mill:    { id: 'mill',    emoji: '💠', name: 'Struskový mlýn',  kind: 'combat', stat: 'dustFind',   per: 0.04,  max: 5, baseCost: 30, growth: 1.6, desc: '+4 % úlomků za stupeň' },
  fortune: { id: 'fortune', emoji: '🍀', name: 'Ďáblovo štěstí',  kind: 'combat', stat: 'luck',       per: 0.04,  max: 5, baseCost: 36, growth: 1.6, desc: '+4 % štěstí za stupeň' },
  chest:   { id: 'chest',   emoji: '🎁', name: 'Pekelná truhla',  kind: 'combat', stat: 'dropChance', per: 0.002, max: 5, baseCost: 40, growth: 1.6, desc: '+0,2 p.b. šance na bednu za stupeň' },
  tithe:   { id: 'tithe',   emoji: '👑', name: 'Ďáblův desátek',  kind: 'combat', stat: 'bossGold',   per: 0.06,  max: 5, baseCost: 36, growth: 1.6, desc: '+6 % zlata z bossů za stupeň' },
};
export const HELL_SHOP_KEYS = Object.keys(HELL_SHOP);

/* Cena dalšího stupně perku (🔥). Infinity = vymaxováno. */
export function hellPerkCost(id, tier) {
  const def = HELL_SHOP[id];
  if (!def) return Infinity;
  if (tier >= def.max) return Infinity;
  return Math.ceil(def.baseCost * Math.pow(def.growth, tier));
}

/* Bounded BOJOVÉ staty z koupených perků (fold do combatStats/dustMult/dropChance/
   bossGold ve formulas). Vrací jen klíče, co formulky čtou: goldPct, luck
   (→ combatStats), dustFind (→ dustMult), dropChance (→ dropChanceBonus) a bossGold
   (→ bossGoldMult). K dustFind přičte i 🌋 Sírovou pec (nekonečný 🔥 sink, bounded
   křivkou). Čistá funkce nad stavem; žádný dmgPct. */
export function hellShopStats(s) {
  const out = { goldPct: 0, luck: 0, dustFind: 0, dropChance: 0, bossGold: 0 };
  const shop = s && s.hellShop;
  if (shop) {
    for (const id of HELL_SHOP_KEYS) {
      const def = HELL_SHOP[id];
      if (def.kind !== 'combat') continue;
      const tier = shop[id] || 0;
      if (tier > 0 && out[def.stat] != null) out[def.stat] += def.per * tier;
    }
  }
  out.dustFind += hellForgeBonus((s && s.hellForge && s.hellForge.tier) || 0);
  return out;
}

/* ----------------------------- 🌋 Sírová pec (nekonečný 🔥 sink) -----------------------------
   Pozdní endgame: jakmile jsou perky vymaxované, 🔥 jinak jen leží. Pec ji žere
   donekonečna — cena stupně roste GEOMETRICKY (nekonečný sink), ale bonus (dustFind)
   má MĚKKÝ STROP přes klesající křivku: každý stupeň přidá *něco* (pořád je co kupovat),
   ale součet konverguje pod softCap → žádný runaway (jako mastery/runy: bounded, bez
   dmgPct, mimo difficultyScale). dustFind fold řeší hellShopStats → dustMult. */
export const HELL_FORGE = {
  emoji: '🌋', name: 'Sírová pec', stat: 'dustFind',
  baseCost: 60, growth: 1.35, // cena stupně = baseCost × growth^tier (geometrický sink)
  softCap: 0.40, decay: 0.90, // bonus = softCap × (1 − decay^tier) → strop +40 % úlomků
};

/* Cena DALŠÍHO stupně pece (🔥). Roste geometricky → nikdy se „nevymaxuje". */
export function hellForgeCost(tier) {
  return Math.ceil(HELL_FORGE.baseCost * Math.pow(HELL_FORGE.growth, Math.max(0, tier)));
}

/* Bounded dustFind bonus na daném žárovém stupni — klesající křivka k softCap. */
export function hellForgeBonus(tier) {
  const t = Math.max(0, Math.floor(tier));
  if (t <= 0) return 0;
  return HELL_FORGE.softCap * (1 - Math.pow(HELL_FORGE.decay, t));
}

/* ----------------------------- 💀 kletby (volitelné debuffy běhu) -----------------------------
   Pozdní endgame výzva: zaškrtni si před během kletby → běh je TĚŽŠÍ (víc HP / míň času /
   bez zuřivosti / bez zbraní), ale 🔥 za patra se násobí. SAMOLIMITUJÍCÍ a leaderboard-safe:
   kletby hloubku jen SNIŽUJÍ, takže nikdy nenafouknou rekord ani cechovní patra — jen tvůj
   výdělek 🔥 (a strop běhu škáluje s multiplikátorem, takže výzva má smysl i hluboko).
   Server pořád ověří patra z peakDps (kletby ho nezvyšují). */
export const HELL_CURSES = {
  granite:  { id: 'granite',  emoji: '🧱', name: 'Pekelná tuhost', mult: 0.35, hpMult: 1.6,      desc: 'Nepřátelé mají +60 % HP' },
  fuse:     { id: 'fuse',     emoji: '⏳', name: 'Krátký knot',    mult: 0.30, timeMs: 45_000,   desc: 'Jen 45 s místo 60 s' },
  silence:  { id: 'silence',  emoji: '🤐', name: 'Klatba ticha',   mult: 0.30, noFrenzy: true,   desc: 'Žádná zuřivost' },
  barefist: { id: 'barefist', emoji: '🥊', name: 'Holé pěsti',     mult: 0.40, noAuto: true,     desc: 'Žádné zbraně — jen klikání' },
};
export const HELL_CURSE_KEYS = Object.keys(HELL_CURSES);

/* Seznam aktivních kletbových id (z mapy id→bool). */
export function hellActiveCurses(curses) {
  if (!curses) return [];
  return HELL_CURSE_KEYS.filter((id) => curses[id]);
}

/* Multiplikátor 🔥 za patra = 1 + součet mult aktivních kleteb (max ~2,35×). */
export function hellCurseMult(curses) {
  let m = 1;
  for (const id of hellActiveCurses(curses)) m += HELL_CURSES[id].mult;
  return m;
}

/* Odvozené parametry běhu z aktivních kleteb (čte engine v startHellRun). */
export function hellRunMods(curses) {
  const active = hellActiveCurses(curses);
  let hpMult = 1, runMs = HELLEVATOR.runMs, noFrenzy = false, noAuto = false;
  for (const id of active) {
    const c = HELL_CURSES[id];
    if (c.hpMult) hpMult *= c.hpMult;
    if (c.timeMs) runMs = Math.min(runMs, c.timeMs);
    if (c.noFrenzy) noFrenzy = true;
    if (c.noAuto) noAuto = true;
  }
  return { active, hpMult, runMs, noFrenzy, noAuto, mult: hellCurseMult(curses) };
}

/* ----------------------------- prezentace ----------------------------- */
export const hellEnemyName = (floor) => hellEnemyAt(floor).name;
export const hellEnemyTier = (floor) => hellEnemyAt(floor).tier;
