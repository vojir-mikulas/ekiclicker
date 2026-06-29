/* ============================ 💳 Obchod s předměty / Tomášova karta ============================
   Pozdní endgame (odemyká se na CARD.unlockLevel). Premise: Tomáš si pořídí
   kreditku a z poražených nepřátel mu chodí „cashback" v € (CARD currency).
   V obchodě pak svou kartu POSTUPNĚ UPGRADUJE na vyšší tiery — zaplatí (naoko
   vyplní údaje ze své karty) a karta povýší o stupeň. Každý vyšší tier = silnější
   verze STEJNÉ karty (kumulativní bounded bonus).

   ANTI-BLITZ / ANTI-RUNAWAY: ZÁMĚRNĚ BEZ dmgPct (a bez weaponPct/punchPct) →
   bonusy NEvstupují do difficultyScale (jako album/runy/cech/peklo/sezóna). Vše
   se foldí přes existující helpery (combatStats goldPct/luck, dustMult, dropChance,
   bossGoldMult, comboCap, bossTimeMult). Kredit je samostatná měna oddělená od
   zlata → nenafoukne ekonomiku ani žebříček. Přežívá rebirth, mře sezónou. */

export const CARD = {
  unlockLevel: 6000,         // odemkne se po dosažení této nejvyšší úrovně (volné okno mezi mřížkou 4000 a Absolucí 10000)
  cashbackChance: 0.1,       // ~10 % NEbossových killů připíše cashback (bossové vždy)
  cashbackBase: 4,           // základ € za jeden cashback
  cashbackPerLevel: 0.0004,  // mírné škálování s úrovní (drží relevanci v hloubce, bez runaway)
  bossCashbackMult: 6,       // boss = ×6 cashback (a vždy)
  megaCashbackMult: 16,      // mega/ultra/archón = ×16 (velký balík)
  jitter: 0.5,               // ± náhoda kolem základu (×0,5 … ×1,5)
  welcomeBalance: 2000,      // € připsané při vystavení karty (na první nákup hned)
};

/* Tiery karty (1..8). stats = TOTAL bounded bonus na daném tieru (kumulativní —
   vyšší tier je vždy lepší). price je v € za POVÝŠENÍ na tento tier. Všechny tiery
   se kupují (žádný zdarma) → obchod vypadá jako skutečný krám už od začátku. Bez karty
   se ale nezaplatí (každá vyplněná karta zamítnuta). NIKDY dmgPct. */
export const CARD_TIERS = [
  { tier: 1, emoji: '💳', name: 'Obyčejná karta',   price: 1500,   stats: { goldPct: 0.10 } },
  { tier: 2, emoji: '💳', name: 'Stříbrná karta',   price: 4000,   stats: { goldPct: 0.20, luck: 0.10 } },
  { tier: 3, emoji: '💳', name: 'Zlatá karta',      price: 9000,   stats: { goldPct: 0.30, luck: 0.15, dustFind: 0.20 } },
  { tier: 4, emoji: '💳', name: 'Platinová karta',  price: 18000,  stats: { goldPct: 0.40, luck: 0.20, dustFind: 0.30, dropChance: 0.005 } },
  { tier: 5, emoji: '🖤', name: 'Černá karta',      price: 35000,  stats: { goldPct: 0.55, luck: 0.25, dustFind: 0.40, dropChance: 0.01, bossGold: 0.25 } },
  { tier: 6, emoji: '💎', name: 'Diamantová karta', price: 60000,  stats: { goldPct: 0.70, luck: 0.30, dustFind: 0.55, dropChance: 0.015, bossGold: 0.40, comboCap: 20 } },
  { tier: 7, emoji: '👑', name: 'Concierge Elite',  price: 100000, stats: { goldPct: 0.85, luck: 0.40, dustFind: 0.70, dropChance: 0.02, bossGold: 0.60, comboCap: 30, bossTime: 0.20 } },
  { tier: 8, emoji: '♾️', name: 'Eki Infinite Card', price: 200000, stats: { goldPct: 1.00, luck: 0.50, dustFind: 0.90, dropChance: 0.025, bossGold: 0.80, comboCap: 40, bossTime: 0.30 } },
];
export const CARD_MAX_TIER = CARD_TIERS.length;

/* Definice AKTUÁLNÍHO tieru (1-based) nebo null (tier 0 = ještě bez karty). */
export const cardTierDef = (tier) => (tier >= 1 && tier <= CARD_MAX_TIER ? CARD_TIERS[tier - 1] : null);
/* Definice NÁSLEDUJÍCÍHO tieru (cíl upgradu) nebo null (už na maximu). */
export const nextCardTierDef = (tier) => (tier < CARD_MAX_TIER ? CARD_TIERS[tier] : null);

/* Bounded staty z AKTUÁLNÍHO tieru karty (fold do combatStats/dustMult/dropChance/
   bossGold/comboCap/bossTime ve formulas). Vrací VŽDY všechny klíče (nuly), ať fold
   nikdy nedostane undefined. Čistá funkce nad stavem; žádný dmgPct. */
export function cardStats(s) {
  const out = { goldPct: 0, luck: 0, dustFind: 0, dropChance: 0, bossGold: 0, comboCap: 0, bossTime: 0 };
  const def = cardTierDef(s && s.card && s.card.tier);
  if (def) {
    for (const k in def.stats) if (out[k] != null) out[k] = def.stats[k];
  }
  return out;
}

/* Lidsky čitelný popisek jednoho statu karty (pro UI). */
export function cardStatLabel(key, val) {
  const pct = (v) => {
    const n = v * 100;
    return (Math.round(n * 10) / 10).toString().replace('.', ',');
  };
  switch (key) {
    case 'goldPct': return `+${pct(val)} % zlata`;
    case 'luck': return `+${pct(val)} % štěstí`;
    case 'dustFind': return `+${pct(val)} % úlomků`;
    case 'dropChance': return `+${pct(val)} p.b. šance na bednu`;
    case 'bossGold': return `+${pct(val)} % zlata z bossů`;
    case 'comboCap': return `+${val} ke stropu comba`;
    case 'bossTime': return `+${pct(val)} % času na bosse`;
    default: return `${key}: ${val}`;
  }
}

/* Základní € cashback za jeden kill (PŘED jitterem) — škáluje mírně s úrovní a
   skokově s typem bosse. Jitter/náhodu řeší engine (kvůli determinismu formulek). */
export function cashbackBaseFor(level, variant) {
  const scale = 1 + Math.max(0, level) * CARD.cashbackPerLevel;
  let amt = CARD.cashbackBase * scale;
  if (variant && (variant.mega || variant.ultra || variant.archon)) amt *= CARD.megaCashbackMult;
  else if (variant && variant.boss) amt *= CARD.bossCashbackMult;
  return amt;
}

/* Formátování € kreditu pro UI (1 500 €). */
export const eur = (n) =>
  Math.floor(n || 0).toLocaleString('cs-CZ') + ' €';

/* ----------------------------- vystavení platební karty -----------------------------
   Při odemčení Tomášovi vystavíme SKUTEČNÉ údaje karty (číslo/jméno/platnost/CVC),
   které si hráč musí opsat do pokladny. Číslo je Luhn-validní (vypadá reálně), začíná
   4 → VISA styl. Generuje engine jednorázově a uloží do s.card.info. */
const HOLDER_NAMES = ['TOMÁŠ EKI', 'EKI NOVÁK', 'EKI SVOBODA', 'TOMÁŠ DVOŘÁK', 'EKI ČERNÝ', 'TOMÁŠ KRÁL'];

function luhnCheckDigit(num15) {
  let sum = 0;
  // num15 jsou číslice BEZ kontrolní; pozice kontrolní je sudá zprava → násob od ní
  for (let i = 0; i < num15.length; i++) {
    let d = Number(num15[num15.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } // každá druhá (počítáno od kontrolní pozice)
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function generateCardInfo(rnd = Math.random) {
  const r = (n) => Math.floor(rnd() * n);
  let base = '4'; // VISA-styl → konzistentní vizuál (detectBrand v UI)
  for (let i = 0; i < 14; i++) base += r(10);
  const number = base + luhnCheckDigit(base); // 16 číslic, Luhn-validní
  const grouped = number.replace(/(.{4})/g, '$1 ').trim();
  const name = HOLDER_NAMES[r(HOLDER_NAMES.length)];
  const exp = String(1 + r(12)).padStart(2, '0') + '/' + String(28 + r(6)); // MM/YY (28..33)
  const cvc = String(100 + r(900)); // 3 číslice
  return { number: grouped, name, exp, cvc };
}

/* Porovná vyplněné údaje s vystavenou kartou (číslo/platnost/CVC striktně, jméno
   bez ohledu na velikost/mezery). Vrací true = sedí → platba projde. */
export function cardMatches(info, entered) {
  if (!info || !entered) return false;
  const norm = (s) => String(s || '').replace(/\s/g, '');
  const upn = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return (
    norm(entered.number) === norm(info.number) &&
    norm(entered.exp) === norm(info.exp) &&
    norm(entered.cvc) === norm(info.cvc) &&
    upn(entered.name) === upn(info.name)
  );
}
