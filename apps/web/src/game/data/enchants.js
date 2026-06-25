/* =========================================================================
   ZAKLÍNÁNÍ (enchanting) — pozdní endgame nad vybavením (odemyká se na 3000).
   ČISTÁ data + generace (žádný stav, žádné DOM) → sdílí engine i UI.

   Inspirace Minecraftem: zaklínací stůl s tajemnými RUNAMI (Starší futhark →
   „nepřečteš to" efekt jako Standard Galactic Alphabet) a hromada ZLATA jako cena.

   Návrhový princip (drží anti-runaway / anti-blitz filozofii hry — stejně jako
   afixy a kovárna):
   - Zaklínadlo přidá kusu jen DALŠÍ bounded-% bonus (sčítá se k afixům přes
     aggregateEquip), NIKDY nový exponenciál. Jediné exponenciály zůstávají
     power/rage (viz formulas.globalMult).
   - Bounded i POČTEM: jeden kus uneseš max ENCHANTS_CFG.maxLevel zaklínadel.
   - Cena je ZLATO (ne úlomky) → konečně velký pozdní odvod hlavní měny. Roste s
     ilvl (kopíruje růst příjmu, takže zůstává „hodně peněz" v každé hloubce),
     se vzácností a hlavně s počtem už nasazených zaklínadel (každé další je
     řádově dražší → hluboký sink).
   - Bonus se SNAPSHOTuje do obtížnosti (přes gearPower → runGearPower), stejně
     jako afixy → posouvá zeď dál, ale blitz zůstává omezený.
   ========================================================================= */
import { CONFIG } from '../config.js';
import { ITEMS, RARITIES, AFFIXES } from './items.js';

export const ENCHANTS_CFG = {
  unlockLevel: 3000,   // nejvyšší dosažená úroveň, od které se zaklínání odemkne
  maxLevel: 8,         // strop zaklínadel na jeden kus (drží bonus bounded i počtem)
  offers: 3,           // kolik nabídek stůl ukáže naráz (jako 3 sloty v Minecraftu)
  costBase: 5000,      // základ ceny v ZLATĚ (× ilvl × vzácnost × tier × lvl-růst)
  costLevelGrowth: 3.2, // cena × tohle za každé už nasazené zaklínadlo (hluboký sink)
  rerollMult: 0.35,    // přehození run = nejlevnější nabídka × tohle
  glyphMin: 4,         // délka runového „názvu" nabídky
  glyphMax: 7,
};

/* Starší futhark (24 run) — renderuje se systémovým fontem, žádná závislost.
   Slouží jen jako NEČITELNÝ tajemný „název" zaklínadla (vizuál à la Minecraft). */
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛟᛞ';

/* Pool zaklínadel — vtipné české názvy mapované na herní staty (stejné klíče
   jako afixy → sčítají se přes aggregateEquip). `tierMag` = relativní síla
   tří nabídek (levná / standardní / velkolepá). */
export const ENCHANTS = {
  sharpness: { name: 'Ostrost',    emoji: '⚔️', stat: 'dmgPct'     },
  power:     { name: 'Drtivost',   emoji: '👊', stat: 'punchPct'   },
  flame:     { name: 'Plamen',     emoji: '🔥', stat: 'weaponPct'  },
  fortune:   { name: 'Hojnost',    emoji: '💰', stat: 'goldPct'    },
  luck:      { name: 'Štěstěna',   emoji: '🍀', stat: 'luck'       },
  cruelty:   { name: 'Krutost',    emoji: '💢', stat: 'critMult'   },
  precision: { name: 'Preciznost', emoji: '🎯', stat: 'critChance' },
  fury:      { name: 'Běsnění',    emoji: '😤', stat: 'frenzyDur'  },
};
export const ENCHANT_IDS = Object.keys(ENCHANTS);

/* Tři tiery nabídky: [síla bonusu, násobič ceny, štítek]. */
const TIERS = [
  { mag: 0.6, costMult: 1,  label: 'Šepot' },
  { mag: 1.1, costMult: 4,  label: 'Volání' },
  { mag: 1.9, costMult: 14, label: 'Bouře' },
];

const rnd = () => Math.random();

/* Kolik zaklínadel kus už nese (0, když žádné). */
export const enchantTotalLvl = (item) => item?.enchant?.lvl || 0;
/* Lze kus ještě zaklít? (pod stropem) */
export const canEnchant = (item) => !!item && enchantTotalLvl(item) < ENCHANTS_CFG.maxLevel;

/* Staty z nasazených zaklínadel kusu (plain {stat:value} → sčítá aggregateEquip). */
export const enchantStats = (item) => item?.enchant?.stats || null;

/* Runový „název" zaklínadla — nečitelné glyfy (jen vizuál à la zaklínací stůl). */
export function runeWord() {
  const n = ENCHANTS_CFG.glyphMin + Math.floor(rnd() * (ENCHANTS_CFG.glyphMax - ENCHANTS_CFG.glyphMin + 1));
  let out = '';
  for (let i = 0; i < n; i++) out += RUNES[Math.floor(rnd() * RUNES.length)];
  return out;
}

/* Cena ZLATA za zaklít kusu daným tierem. Roste s ilvl (kopíruje růst příjmu),
   se vzácností a hlavně s počtem už nasazených zaklínadel. */
export function enchantCost(item, tierIndex) {
  if (!item) return Infinity;
  const tier = TIERS[tierIndex] || TIERS[0];
  const ilvlMult = Math.pow(CONFIG.goldGrowth, Math.max(0, item.ilvl || 0));
  const rarityMult = RARITIES[item.rarity]?.mult || 1;
  const lvlMult = Math.pow(ENCHANTS_CFG.costLevelGrowth, enchantTotalLvl(item));
  return Math.ceil(ENCHANTS_CFG.costBase * ilvlMult * rarityMult * tier.costMult * lvlMult);
}

/* Cena přehození nabídek (levná vůči zaklití — jen gamble o lepší runy). */
export function rerollOffersCost(item) {
  return Math.ceil(enchantCost(item, 0) * ENCHANTS_CFG.rerollMult);
}

/* Hodnota bonusu jednoho zaklínadla (bounded %, škáluje s ilvl jako afixy). */
function enchantValue(stat, ilvl, tierMag) {
  const def = AFFIXES[stat];
  const ilvlMult = 1 + Math.max(0, ilvl) / ITEMS.ilvlScale;
  const jitter = 0.85 + rnd() * 0.3;
  const raw = def.base * tierMag * ilvlMult * jitter;
  switch (def.kind) {
    case 'ms': return Math.round(raw / 10) * 10;
    case 'flat': return Math.round(raw * 100) / 100;
    default: return Math.round(raw * 1000) / 1000; // pct / pp
  }
}

let _offSeq = 0;
function offerId() {
  _offSeq = (_offSeq + 1) % 1e6;
  return 'e' + _offSeq.toString(36) + Math.floor(rnd() * 1296).toString(36);
}

/* Naroluj nabídky stolu pro daný kus: ENCHANTS_CFG.offers kusů, každý jiný tier,
   náhodné zaklínadlo, runový název, hodnota bonusu a cena. Vrací pole nabídek. */
export function rollEnchantOffers(item) {
  if (!item) return [];
  const ids = ENCHANT_IDS.slice();
  const offers = [];
  for (let t = 0; t < ENCHANTS_CFG.offers; t++) {
    const tier = TIERS[t] || TIERS[TIERS.length - 1];
    const ench = ids[Math.floor(rnd() * ids.length)];
    const def = ENCHANTS[ench];
    offers.push({
      id: offerId(),
      ench,
      stat: def.stat,
      value: enchantValue(def.stat, item.ilvl || 0, tier.mag),
      tier: t,
      tierLabel: tier.label,
      glyph: runeWord(),
      cost: enchantCost(item, t),
    });
  }
  return offers;
}

/* Aplikuj nabídku na kus → vrátí NOVÝ kus s přidaným/zvýšeným zaklínadlem
   (čistá fce). enchant.lvl roste o 1, hodnota se přičte ke statu (sčítá se). */
export function applyOffer(item, offer) {
  const prev = item.enchant || { lvl: 0, stats: {} };
  const stats = { ...prev.stats };
  const cur = stats[offer.stat] || 0;
  const next = cur + offer.value;
  const def = AFFIXES[offer.stat];
  stats[offer.stat] = def?.kind === 'ms' ? Math.round(next) : Math.round(next * 1000) / 1000;
  return { ...item, enchant: { lvl: prev.lvl + 1, stats } };
}

/* Hrubá síla zaklínadel kusu (pro itemScore — řazení / auto-rozklad). */
export function enchantScore(item) {
  const stats = enchantStats(item);
  if (!stats) return 0;
  let s = 0;
  for (const stat in stats) s += stats[stat] / (AFFIXES[stat]?.base || 1);
  return s;
}
