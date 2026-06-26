/* FEATURE_UNLOCKS — texty pro uvítací modal, který se ukáže JEDNOU při odemčení
   pozdní funkce (engine emituje event 'unlock' s { feature }). Čistá data, žádné
   DOM/stav. `open` = id modalu, který otevře CTA tlačítko (null = jen zavřít);
   `level` slouží jen pro flavor v hlavičce (odpovídá *_CFG.unlockLevel v enginu). */
export const FEATURE_UNLOCKS = {
  hellevator: {
    emoji: '🛗',
    name: 'Pekelný výtah',
    level: 100,
    tagline: '60sekundový sprint do pekla',
    desc: 'Naskoč do výtahu a sjížděj pekelná patra na čas. Čím hlouběji se dostaneš, tím lepší kořist — 🔥 Síra a pekelné propustky.',
    perks: [
      '⏱️ Časový sprint — zabíjej a prodlužuj si combo čas',
      '👹 10 démonských eki + boss každé 10. patro',
      '🔥 Síra do pekelného obchodu',
    ],
    cta: 'Otevřít výtah 🛗',
    open: 'hellevator',
  },
  inventory: {
    emoji: '🎒',
    name: 'Výbava & kořist',
    level: 1000,
    tagline: 'Z nepřátel teď padají bedny',
    desc: 'Nepřátelé teď roní bedny s kořistí. Otevírej je, vystroj se nejlepšími kusy a slabší rozlož na úlomky 💠 pro kovárnu.',
    perks: [
      '📦 Bedny s náhodnou výbavou',
      '💠 Úlomky z rozkladu → kovárna',
      '⚒️ Vylepšuj a překovávej kusy',
    ],
    cta: 'Otevřít výbavu 🎒',
    open: 'inventory',
  },
  elixirs: {
    emoji: '🧪',
    name: 'Elixíry',
    level: 1500,
    tagline: 'Dočasné nápojové buffy',
    desc: 'V Obchodě přibyla záložka 🧪. Kup a vypij elixír pro krátký, ale pořádný boost — aktivní může být vždy jen jeden.',
    perks: [
      '🍺 4 české nápoje',
      '⚡ Silný dočasný boost',
      '🛒 Kup → vypij, kdykoliv se hodí',
    ],
    cta: 'Paráda! 🧪',
    open: null,
  },
  pets: {
    emoji: '🐾',
    name: 'Mazlíčci',
    level: 2000,
    tagline: 'Z nepřátel padají vejce',
    desc: 'Z nepřátel teď padají vejce 🥚. Vylíhni si parťáka, jednoho si nasaď a leveluj ho duplikáty pro trvalý bonus.',
    perks: [
      '🥚 Vejce z nepřátel',
      '🐉 6 mazlíčků, jeden nasazený',
      '⬆️ Duplikáty zvyšují úroveň',
    ],
    cta: 'Mrknout na mazlíčky 🐾',
    open: 'pets',
  },
  runes: {
    emoji: '🔣',
    name: 'Runy & sokety',
    level: 2500,
    tagline: 'Pivní tácky do výbavy',
    desc: 'Z Archónů padají „Pivní tácky". Vsaď barevné runy do soketů své výbavy a vymáčkni z kusů ještě víc.',
    perks: [
      '🟥🟩🟦🟨 4 barvy run',
      '🔌 Sokety podle vzácnosti kusu',
      '💠 Kovej a slévej runy na vyšší tier',
    ],
    cta: 'Otevřít runy 🔣',
    open: 'runes',
  },
  enchanting: {
    emoji: '✨',
    name: 'Zaklínací stůl',
    level: 3000,
    tagline: 'Zaklínej kusy za zlato',
    desc: 'Ve Výbavě 🎒 přibyl zaklínací stůl. Utrať zlato 💰 a vlož do kusů tajemné runy pro ještě lepší staty.',
    perks: [
      '💰 Zlato jako palivo',
      'ᚱ Tajemné runové enchanty',
      '📈 Vyšší staty na výbavě',
    ],
    cta: 'Otevřít výbavu 🎒',
    open: 'inventory',
  },
  mastery: {
    emoji: '🔱',
    name: 'Mistrovská mřížka',
    level: 4000,
    tagline: 'Paragon strom bonusů',
    desc: 'Úrovně nad 4000 ti teď sypou Mistrovské body 🔱. Investuj je do tří stromů plných trvalých bonusů a klíčových kamenů.',
    perks: [
      '🔱 Body za úrovně nad 4000',
      '🌳 3 stromy × tiery',
      '🗝️ Klíčové kameny (keystones)',
    ],
    cta: 'Otevřít mřížku 🔱',
    open: 'mastery',
  },
};
