/* ABSOLUCE 😇 — meta-prestige nad rebirthem (odemyká se na úrovni 30000).
   Vyšší stupeň ODPUŠTĚNÍ: rebirth Tomášovi „jen" odpouští (Odpuštění 🕊), ABSOLUCE
   ho zprostí úplně všeho. Jednou za běh můžeš dát Ekimu absoluci — to SMETE celou
   věž prestiže (Věčný hněv, pěst, … i nasbírané Odpuštění 🕊) a místo toho ti dá
   ✨ Svatozář 😇 podle toho, JAK VYSOKO jsi došel. Za svatozář se kupují TRVALÉ
   nebeské bonusy, které přežijí i další absoluci → každý cyklus vyletíš výš a
   rychleji (nekonečná smyčka „new game+"). Vzor: data/prestige.js.

   (Kódové klíče zůstávají „ascension/stardust/cosmicWrath…" kvůli stabilitě;
    uživateli se ukazují jen české názvy níže.)

   Bezpečné vůči vyvážení (viz balance-decaying-curve-fix):
   - Boží hněv je jediný DMG násobič a SKLÁDÁ se do obtížnosti (prestigePower)
     stejně jako Věčný hněv → dává DOSAH, ne blitz (anti-blitz beze změny).
   - Ostatní bonusy jsou ekonomické/QoL (zlato/🕊/💠/štěstí/náskok) → NEvstupují
     do obtížnosti, žádný nový level-scaling exponenciál, žádný runaway. */
export const ASCENSION = {
  unlockLevel: 30000,           // dosažená NEJVYŠŠÍ úroveň pro odemčení + každou další absoluci
  emoji: '😇',
  currencyName: 'Svatozář',
};

/* Bez `max` → nekonečný sink (jako základní prestige). `mult` = násobič za level
   (Boží hněv), `per` = aditivní bonus za level (vše ostatní). Cena = baseCost
   × growth^level (ascensionCost ve formulas.js). */
export const ASCENSION_UPGRADES = {
  cosmicWrath: {
    name: 'Boží hněv', emoji: '⚡', baseCost: 3, growth: 1.55, mult: 1.40,
    desc: '×1,40 poškození (vše) — násobí se! Počítá se do obtížnosti (dosah, ne blitz).',
  },
  stardustGreed: {
    name: 'Nebeská štědrost', emoji: '💫', baseCost: 2, growth: 1.5, per: 0.6,
    desc: '+60 % zlata za úroveň',
  },
  doveStorm: {
    name: 'Holubičí roj', emoji: '🕊️', baseCost: 2, growth: 1.5, per: 0.3,
    desc: '+30 % Odpuštění 🕊 z rebirthu za úroveň (rozjede sub-smyčku po absoluci)',
  },
  eternalHeadstart: {
    name: 'Andělská křídla', emoji: '🪽', baseCost: 4, growth: 1.7, per: 15,
    desc: '+15 startovních úrovní po každém rebirthu za úroveň',
  },
  dustNova: {
    name: 'Svatý prach', emoji: '💠', baseCost: 3, growth: 1.6, per: 0.5,
    desc: '+50 % úlomků 💠 za úroveň',
  },
  cosmicLuck: {
    name: 'Požehnání', emoji: '🍀', baseCost: 3, growth: 1.6, per: 0.25,
    desc: '+25 % šance na Lucky Eki za úroveň',
  },
};

export const ASCENSION_KEYS = Object.keys(ASCENSION_UPGRADES);
