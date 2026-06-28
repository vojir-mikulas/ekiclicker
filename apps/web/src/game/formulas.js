/* =========================================================================
   FORMULAS — čistá matematika hry (žádný stav, žádné DOM).
   Vše odvozené z herního stavu. Testovatelné, sdílené simulátorem i enginem.
   ========================================================================= */
import { CONFIG, MULT, CAPS, hpCurve, goldCurve, hardenScale } from './config.js';
import { WEAPONS } from './data/weapons.js';
import { UPGRADES } from './data/upgrades.js';
import { PRESTIGE_ALL } from './data/prestige.js';
import { ASCENSION, ASCENSION_UPGRADES } from './data/ascension.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { aggregateEquip } from './data/items.js';
import { equippedPetStats } from './data/pets.js';
import { albumStats } from './data/album.js';
import { socketStats } from './data/runes.js';
import { masteryStats } from './data/mastery.js';
import { elixirMods } from './data/elixirs.js';
import { abilityMods } from './data/abilities.js';
import { hellEnemyAt, hellShopStats } from './data/hellevator.js';
import { seasonThemeStats } from './data/seasonThemes.js';

/* Součet afixů z nasazeného vybavení — sdílí ho všechny bojové formulky.
   Čistá funkce nad stavem; vybavení přidává jen BOUNDED % (žádný nový exponenciál). */
export function equipStats(s) {
  return aggregateEquip(s.equipment);
}

/* Bojové bonusy = afixy výbavy + bonus nasazeného mazlíčka + milníky deníku
   + runy v soketech (vše BOUNDED %, sdílí klíče statů). Tohle čtou bojové formulky
   místo holého equipStats — mazlíček, deník i runy se tak promítnou všude, kde
   výbava, BEZ nového exponenciálu. (Deník i runy ZÁMĚRNĚ nemají dmgPct → žádný
   vliv na obtížnost/blitz; jediný dmgPct ze snapshotu zůstává výbava + mazlíček.) */
/* Mezipaměť combatStats v rámci jednoho překreslení / dávky tiků.
   combatStats agreguje výbavu + mazlíčka + deník + runy + mřížku + cech + peklo +
   téma sezóny a volá ho DESÍTKY bojových formulek za jeden render (globalMult,
   goldMult, critChance, critMult, totalDps…). Jeho výsledek se ale mění JEN při
   diskrétní změně výbavy/mazlíčka/run/… — a všechny ty cesty volají engine.notify(),
   který tuto cache čistí (clearStatCache). Mezi notify() se gear nemění, takže je
   bezpečné výsledek sdílet. Jednoprvková cache klíčovaná identitou stavu:
   simulátor (žene tick bez notify) volá s týmž `s` → po prvním tiku cache drží,
   ale gear v čistém tick-loopu nemění nic → korektní i tam. */
let _csKey = null;
let _csVal = null;
export function clearStatCache() {
  _csKey = null;
  _csVal = null;
}

export function combatStats(s) {
  if (_csKey === s) return _csVal;
  _csVal = _combatStats(s);
  _csKey = s;
  return _csVal;
}

function _combatStats(s) {
  const gear = equipStats(s);
  const pet = equippedPetStats(s);
  const album = albumStats(s);
  const socket = socketStats(s.equipment);
  const mastery = masteryStats(s); // 🔱 mistrovská mřížka (afixové klíče; bez dmgPct)
  const out = {};
  for (const k in gear) out[k] = gear[k] + (pet[k] || 0) + (album[k] || 0) + (socket[k] || 0) + (mastery[k] || 0);
  // 🛡️ perky cechu (server-derived): bounded goldPct + luck, BEZ dmgPct → mimo
  // difficultyScale. dustFind jede zvlášť přes dustMult (stejně jako Klenotník).
  const guild = s.guildPerks;
  if (guild) {
    out.goldPct = (out.goldPct || 0) + (guild.goldFind || 0);
    out.luck = (out.luck || 0) + (guild.luck || 0);
  }
  // 🛗 perky Pekelného krámu (kupované za 🔥): bounded goldPct + luck, BEZ dmgPct →
  // mimo difficultyScale (jako cech/album). dustFind jede zvlášť přes dustMult.
  const hell = hellShopStats(s);
  out.goldPct = (out.goldPct || 0) + hell.goldPct;
  out.luck = (out.luck || 0) + hell.luck;
  // 🗓️ téma sezóny (odvozené z čísla sezóny): bounded goldPct + luck, BEZ dmgPct →
  // mimo difficultyScale. dustPct/dropChance/boss*/comboCap jedou zvlášť přes své helpery.
  const season = seasonThemeStats(s.seasonTheme);
  out.goldPct = (out.goldPct || 0) + (season.goldPct || 0);
  out.luck = (out.luck || 0) + (season.luck || 0);
  return out;
}

const WEAPON_COST_GROWTH = 1.15;
const REWARD_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a.reward]));

/* Součin bonusů z odemčených achievementů. */
export function achievementMult(achievements) {
  let dmg = 1;
  let gold = 1;
  for (const id in achievements) {
    if (!achievements[id]) continue;
    const r = REWARD_BY_ID[id];
    if (!r) continue;
    if (r.dmg) dmg *= r.dmg;
    if (r.gold) gold *= r.gold;
  }
  return { dmg, gold };
}

/* Globální násobič poškození — JEDINÝ exponenciální "motor" růstu.
   (Žádné automatické škálování s úrovní jako dřív → konec runaway.) */
export function globalMult(s) {
  const ach = achievementMult(s.achievements).dmg;
  const frenzy = s.frenzy.active ? CONFIG.frenzyMult : 1;
  const gear = 1 + combatStats(s).dmgPct; // vybavení + mazlíček: bounded % (NE nový exponenciál)
  return (
    Math.pow(MULT.power, s.upgrades.power) *
    Math.pow(MULT.rage, s.prestige.rage) *
    ascensionMult(s) * // 🌌 Kosmický hněv (vstupuje i do obtížnosti → dosah, ne blitz)
    ach *
    frenzy *
    gear *
    elixirMods(s).dmg * // 🍸 elixír (burst, NEvstupuje do obtížnosti — jako frenzy)
    abilityMods(s).dmg // 🌀 bojový rituál (Nářez) — taktéž burst mimo obtížnost
  );
}

export function goldMult(s) {
  const ach = achievementMult(s.achievements).gold;
  const fortune = 1 + (s.upgrades.fortune || 0) * MULT.fortuneGoldPerLevel;
  const gear = 1 + combatStats(s).goldPct;
  return (1 + s.prestige.greed * MULT.greedPerLevel) * fortune * ach * gear * elixirMods(s).gold * abilityMods(s).gold * ascensionGoldMult(s); // 🍺 elixír + 🌀 Hojnost + 💫 Hvězdná štědrost
}

export function critChance(s) {
  return Math.min(0.9, CONFIG.critChance + s.prestige.crit * MULT.critPerLevel + combatStats(s).critChance + elixirMods(s).critChance + abilityMods(s).critChance); // 🐂 elixír + 👁️ Vševidoucí oko
}
/* Krit násobič — základ z CONFIG + gold upgrade "Tvrdý dopad" + vybavení. */
export function critMult(s) {
  return CONFIG.critMult + (s.upgrades.critdmg || 0) * MULT.critDmgPerLevel + combatStats(s).critMult;
}
export function critFactor(s) {
  return 1 + critChance(s) * (critMult(s) - 1);
}

/* Trvání zuřivosti — základ + gold upgrade "Zuřivá nálož" + vybavení. */
export function frenzyDuration(s) {
  return CONFIG.frenzyDurationMs + (s.upgrades.wrath || 0) * MULT.wrathDurMs + combatStats(s).frenzyDur;
}

/* Násobič šance na Lucky Eki — prestige "Štěstí" + vybavení (afix luck). */
export function luckSpawnMult(s) {
  return (1 + s.prestige.luck * MULT.luckPerLevel) * (1 + combatStats(s).luck) * ascensionLuckMult(s); // × 🍀 Kosmické štěstí (vzestup)
}

/* Combo bonus za jeden zásah — základ + gold upgrade "Rytmus". */
export function comboPerHit(s) {
  return CONFIG.comboPerHit + (s.upgrades.rhythm || 0) * MULT.rhythmPerLevel;
}

/* ----------------------------- tier-2 prestige (capstones) -----------------------------
   Vše BOUNDED/aditivní — žádný nový exponenciál (ten zůstává jen power/rage). */
const capLevel = (s, key) => (s.prestige && s.prestige[key]) || 0;

/* 🕯️ Věčné odpuštění — násobič 🕊 z rebirthu. */
export const forgivenessMult = (s) => (1 + capLevel(s, 'eternalForgiveness') * CAPS.forgivenessPerLevel) * ascensionDoveMult(s); // + 🕊 Holubičí roj (vzestup)
/* Capstone-helpery navíc sčítají bounded bonusy z 🔱 mistrovské mřížky (speciální
   klíče comboCap/bossTime/bossGold/dustPct/dropChance — afixové klíče jedou přes combatStats). */
/* 🔗 Mistr comba — strop comba (základ + capstone + mřížka 🥁 Rytmus). */
export const comboCap = (s) => CONFIG.comboMax + capLevel(s, 'comboMaster') * CAPS.comboCapPerLevel + (masteryStats(s).comboCap || 0) + (seasonThemeStats(s.seasonTheme).comboCap || 0);
/* 🏹 Lovec bossů — víc času na bosse a víc jejich zlata (+ mřížka ⏳/👑/💰). */
export const bossTimeMult = (s) => 1 + capLevel(s, 'bossHunter') * CAPS.bossTimePerLevel + (masteryStats(s).bossTime || 0) + (seasonThemeStats(s.seasonTheme).bossTime || 0);
export const bossGoldMult = (s) => 1 + capLevel(s, 'bossHunter') * CAPS.bossGoldPerLevel + (masteryStats(s).bossGold || 0) + (seasonThemeStats(s.seasonTheme).bossGold || 0) + (hellShopStats(s).bossGold || 0); // 👑 Ďáblův desátek
/* ⚒️ Klenotník — víc úlomků a vyšší šance na drop (+ mřížka ⚒️ Kovář / 🌟 / 🎯 / 👑). */
export const dustMult = (s) => 1 + capLevel(s, 'jeweler') * CAPS.dustPerLevel + (masteryStats(s).dustPct || 0) + ((s.guildPerks && s.guildPerks.dustFind) || 0) + hellShopStats(s).dustFind + (seasonThemeStats(s.seasonTheme).dustPct || 0) + ascensionDustBonus(s); // + 💠 Prachová bouře (vzestup)
export const dropChanceBonus = (s) => capLevel(s, 'jeweler') * CAPS.dropChancePerLevel + (masteryStats(s).dropChance || 0) + (seasonThemeStats(s.seasonTheme).dropChance || 0) + (hellShopStats(s).dropChance || 0); // 🎁 Pekelná truhla

export function speedMult(s) {
  const raw =
    Math.pow(MULT.speed, Math.min(s.upgrades.speed, CONFIG.maxSpeedLevel)) *
    Math.pow(MULT.factory, s.prestige.factory);
  return Math.max(CONFIG.speedFloor, raw);
}

export function weaponInterval(s, w) {
  return Math.max(CONFIG.minWeaponInterval, w.interval * speedMult(s));
}

export const milestoneMult = (count) =>
  Math.pow(2, Math.floor(count / MULT.weaponMilestone));

/* 🔗 Arzenálová synergie — počet započítaných milníků napříč CELÝM arzenálem.
   Každá zbraň přispěje min(cap, ⌊počet/milník⌋) tiery (strop na zbraň → nutí
   kupovat napříč, ne mega-stackovat jednu; drží to bounded). Knoby viz MULT. */
export function arsenalSynergyTiers(s) {
  let tiers = 0;
  for (const w of WEAPONS) {
    const c = s.weapons[w.id] || 0;
    if (c >= MULT.weaponMilestone) tiers += Math.min(MULT.arsenalSynergyTierCap, Math.floor(c / MULT.weaponMilestone));
  }
  return tiers;
}
/* Globální násobič poškození VŠECH zbraní ze synergie (1 + Σ tierů × perTier).
   BOUNDED, mimo difficultyScale (jako weaponPct/milník) → anti-blitz beze změny. */
export const arsenalSynergyMult = (s) => 1 + arsenalSynergyTiers(s) * MULT.arsenalSynergyPerTier;

export function weaponShotDamage(s, w) {
  const count = s.weapons[w.id] || 0;
  if (count <= 0) return 0;
  return w.baseDmg * count * milestoneMult(count) * globalMult(s) * (1 + combatStats(s).weaponPct) * arsenalSynergyMult(s) * elixirMods(s).weapon * abilityMods(s).weapon; // 🧃 elixír + 🌀 Přetížení (jen auto-zbraně)
}

export function weaponDps(s, w) {
  const shot = weaponShotDamage(s, w);
  if (shot <= 0) return 0;
  return shot / (weaponInterval(s, w) / 1000);
}

export function totalWeaponDps(s) {
  let d = 0;
  for (const w of WEAPONS) d += weaponDps(s, w);
  return d;
}

/* Základní úder (bez bonusu z DPS) — používá ho i Stín pěsti.
   Afix punchPct (hlavně ze slotu Zbraň) zvýhodňuje právě úder → "meč > pěst". */
export function basePunch(s) {
  const base = 1 + s.upgrades.punch * MULT.punchStep;
  const fist = 1 + s.prestige.fist * MULT.fistPerLevel;
  const weapon = 1 + combatStats(s).punchPct;
  return Math.max(1, base * globalMult(s) * fist * weapon);
}

/* Plný úder hráče = základ + % z DPS (upgrade Údernost). Bez kritu/comba. */
export function clickDamage(s) {
  const fromDps = totalWeaponDps(s) * (s.upgrades.click * MULT.clickFromDpsPerLevel);
  return (basePunch(s) + fromDps) * elixirMods(s).click * abilityMods(s).click; // 🐂 elixír + 🌀 rituál (jen manuální úder, NE stín pěsti)
}

/* DPS Stínu pěsti (auto-údery z prestige), s očekávaným kritem. */
export function shadowDps(s) {
  if (s.prestige.shadow <= 0) return 0;
  return s.prestige.shadow * basePunch(s) * critFactor(s);
}

/* Celkové automatické DPS — tohle se aplikuje jako damage × Δt (anti-lag). */
export function totalDps(s) {
  return totalWeaponDps(s) + shadowDps(s);
}

/* ----------------------------- ceny ----------------------------- */
export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  if (u.max != null && level >= u.max) return Infinity;
  return Math.ceil(u.baseCost * Math.pow(u.growth, level));
}
export const upgradeCostAt = (s, key) => (i) => upgradeCost(key, s.upgrades[key] + i);

export function weaponCost(w, count) {
  return Math.ceil(w.baseCost * Math.pow(WEAPON_COST_GROWTH, count));
}
export const weaponCostAt = (s, w) => (i) => weaponCost(w, (s.weapons[w.id] || 0) + i);

export function prestigeCost(key, level) {
  const p = PRESTIGE_ALL[key];
  if (!p) return Infinity;
  if (p.max != null && level >= p.max) return Infinity; // capstone vymaxovaný
  return Math.ceil(p.baseCost * Math.pow(p.growth, level));
}

export const forgivenessGain = (level) =>
  Math.max(0, Math.floor(Math.pow(level, 1.4) / 14));

/* Hromadný nákup: kolik levelů a za kolik podle násobiče (1/10/100/'max'). */
export function buyBatch(costAt, gold, buyAmount, cap = Infinity) {
  if (buyAmount === 'max') {
    let n = 0;
    let total = 0;
    let money = gold;
    while (n < cap && n < 100000) {
      const c = costAt(n);
      if (!isFinite(c) || money < c) break;
      money -= c;
      total += c;
      n++;
    }
    return { count: n, cost: total };
  }
  const want = Math.min(buyAmount, cap);
  let total = 0;
  for (let i = 0; i < want; i++) {
    const c = costAt(i);
    if (!isFinite(c)) return { count: i, cost: total };
    total += c;
  }
  return { count: want, cost: total };
}

/* ----------------------------- VZESTUP 🌌 (meta-prestige) -----------------------------
   Trvalé kosmické bonusy kupované za ✦ Hvězdný prach (přežijí i další vzestup).
   Vše BOUNDED/aditivní KROMĚ Kosmického hněvu (jediný DMG násobič) — ten záměrně
   SKLÁDÁ do obtížnosti (prestigePower) jako Věčný hněv → dává DOSAH, ne blitz. */
const ascLevel = (s, key) => (s.ascension && s.ascension.levels && s.ascension.levels[key]) || 0;
/* 🌌 Kosmický hněv — globální DMG násobič (×1,40/level). Vstupuje do globalMult
   I do prestigePower (obtížnost) → jako Věčný hněv: anti-blitz beze změny. */
export const ascensionMult = (s) => Math.pow(ASCENSION_UPGRADES.cosmicWrath.mult, ascLevel(s, 'cosmicWrath'));
export const ascensionGoldMult = (s) => 1 + ascLevel(s, 'stardustGreed') * ASCENSION_UPGRADES.stardustGreed.per;
export const ascensionDoveMult = (s) => 1 + ascLevel(s, 'doveStorm') * ASCENSION_UPGRADES.doveStorm.per;
export const ascensionDustBonus = (s) => ascLevel(s, 'dustNova') * ASCENSION_UPGRADES.dustNova.per; // aditivní do dustMult
export const ascensionLuckMult = (s) => 1 + ascLevel(s, 'cosmicLuck') * ASCENSION_UPGRADES.cosmicLuck.per;
export const ascensionHeadstart = (s) => ascLevel(s, 'eternalHeadstart') * ASCENSION_UPGRADES.eternalHeadstart.per;
/* Cena dalšího levelu (nekonečný sink — bez stropu, jako základní prestige). */
export const ascensionCost = (key, level) => {
  const u = ASCENSION_UPGRADES[key];
  if (!u) return Infinity;
  return Math.ceil(u.baseCost * Math.pow(u.growth, level));
};
/* ✦ Hvězdný prach za vzestup — ∝ tomu, JAK VYSOKO jsi došel (snowball: hlubší
   vzestup = víc prachu). Pod prahem 0 (vzestoupit nelze). */
export const stardustGain = (level) =>
  level < ASCENSION.unlockLevel ? 0 : Math.floor(Math.pow(level / ASCENSION.unlockLevel, 1.6) * 4);

/* ----------------------------- obtížnost ----------------------------- */
/* Trvalá prestige síla, kterou si hráč nese do ČERSTVÉHO běhu (kept přes rebirth).
   Hlavní motor blitzu: Věčný hněv (×1,16/level NÁSOBNĚ) + Trénovaná pěst + 🌌 Kosmický
   hněv (po vzestupu hlavní dosahová páka, když je rage smetené).
   Záměrně NEzahrnuje achievementy/greed (mění se během běhu → byla by zpětná vazba). */
export function prestigePower(s) {
  return Math.pow(MULT.rage, s.prestige.rage) * (1 + s.prestige.fist * MULT.fistPerLevel) * ascensionMult(s);
}
/* Násobič HP nepřátel — drží obtížnost úměrnou tvé prestige síle (anti-blitz).
   V rámci jednoho běhu konstantní. Vedle prestige přimíchá i SNAPSHOT síly
   vybavení ze startu běhu (runGearPower) — vybavení přežívá rebirth, takže
   posouvá zeď dál, ale blitz zůstává omezený (kusy nalezené v běhu jsou čistý
   zisk a do obtížnosti se promítnou až příští běh). */
export function difficultyScale(s) {
  if (!CONFIG.difficultyExp) return 1;
  return Math.pow(prestigePower(s) * (s.runGearPower || 1), CONFIG.difficultyExp);
}

/* ----------------------------- nepřítel ----------------------------- */
// Strop HP — POJISTKA PROTI PŘETEČENÍ floatu. Geometrický harden v extrémní hloubce
// (L ~ 34000+) by jinak přerostl Number.MAX_VALUE (~1,8e308) → HP = Infinity → „nekonečné"
// číslo na liště A nepřítel se NIKDY nezabije (amount >= Infinity nikdy neplatí → softlock).
// 1e300 je bezpečně pod stropem floatu, zůstává konečné/zobrazitelné a je to stejně dávno
// za hratelnou zdí (legit hra walluje ~5000-6000, tam je HP ~1e75 → strop se nikdy nedotkne).
const ENEMY_HP_CAP = 1e300;
export function enemyMaxHp(level, variant, diff = 1) {
  // HP = baseHp × křivka (klesající růst → mírná dosažitelná střední hra) × varianta
  // × prestige-snapshot × HLUBOKÝ HARDEN (geometrický ocas od hardenFrom → 5000-10000
  // je TVRDÁ zeď, žádný coast/one-hit v endgame). Dvě nezávislé páky: křivka = střed,
  // hardenScale = hloubka. Výsledek je STROPOVANÝ (anti-overflow, viz výše).
  const hp = CONFIG.baseHp * hpCurve(level) * variant.hp * diff * hardenScale(level);
  return Math.min(ENEMY_HP_CAP, Math.ceil(hp));
}
export function enemyReward(level, variant, goldMultVal) {
  // Zlato roste po STEJNÉ křivce (goldCurve = mírnější verze hpCurve dle goldRatio),
  // takže odměna/HP klesá jen pozvolna → ekonomika drží krok i v pozdní hře.
  return Math.ceil(CONFIG.baseGold * goldCurve(level) * variant.gold * goldMultVal);
}

/* ----------------------------- Pekelný výtah (patra) -----------------------------
   HP patra = HP wall-Ekiho (na tvé NEJVYŠŠÍ úrovni × difficultyScale, jako svět)
   × hellBaseFrac (stáhne patro 1 na malý zlomek) × hellGrowth^(f-1) (čistý
   exponenciál → ~50 pater dělá zeď) × násobič démona/bosse. Protože base škáluje
   s prestige stejně jako poškození, POČET pater měří mezeru mezi tvým 60s výbuchem
   a tvojí ustálenou zdí = headroom buildu (power-normalizováno). Žádný Date.now()
   → deterministický simulátor i server-přepočet (fáze 4). */
export const hellCurve = (f) => Math.pow(CONFIG.hellGrowth, Math.max(0, f - 1));

export function hellFloorHp(s, f) {
  const base = enemyMaxHp(s.highestLevel, { hp: 1, gold: 1 }, difficultyScale(s));
  const enemy = hellEnemyAt(f);
  return Math.ceil(base * CONFIG.hellBaseFrac * hellCurve(f) * enemy.hp);
}
