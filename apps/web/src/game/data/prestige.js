/* REBIRTH / prestige — kupuje se za Odpuštění 🕊, zůstává napořád.
   Cena = baseCost × growth^level. Žádné levely se po rebirthu neztrácí. */
export const PRESTIGE = {
  rage:      { name: 'Věčný hněv',     emoji: '🩸', baseCost: 1, growth: 1.48, desc: '×1,16 poškození (vše) — násobí se!' },
  greed:     { name: 'Štědrost',       emoji: '🪙', baseCost: 1, growth: 1.5,  desc: '+25 % zlata' },
  fist:      { name: 'Trénovaná pěst', emoji: '👊', baseCost: 2, growth: 1.6,  desc: '+50 % síla úderu' },
  factory:   { name: 'Sériová výroba', emoji: '⚙️', baseCost: 2, growth: 1.6,  desc: 'zbraně +4 % rychlost' },
  shadow:    { name: 'Stín pěsti',     emoji: '🌑', baseCost: 3, growth: 1.7,  desc: 'auto-úder: +1 pěst/s' },
  crit:      { name: 'Přesnost',       emoji: '🎯', baseCost: 3, growth: 1.7,  desc: '+2 % šance na krit' },
  luck:      { name: 'Štěstí',         emoji: '🍀', baseCost: 4, growth: 1.8,  desc: '+15 % šance na Lucky Eki' },
  headstart: { name: 'Náskok',         emoji: '🚀', baseCost: 5, growth: 2.0,  desc: 'start o 3 úrovně výš' },
};

export const PRESTIGE_KEYS = Object.keys(PRESTIGE);

/* TIER-2 PRESTIGE (capstones) — odemknou se až po hluboké investici do rodiče
   (`unlock`). Dražší (vyšší base/growth) a stropované (`max`) → pozdní sink na 🕊.
   Vše BOUNDED/aditivní; magnitudy za level jsou v config.CAPS (formulas je čtou).
   Levely se ukládají do stejného `state.prestige` objektu (klíče níž). */
export const CAPSTONES = {
  eternalForgiveness: {
    name: 'Věčné odpuštění', emoji: '🕯️', baseCost: 40, growth: 1.8, max: 25,
    unlock: { key: 'rage', level: 20 }, desc: '+8 % Odpuštění 🕊 z rebirthu',
  },
  comboMaster: {
    name: 'Mistr comba', emoji: '🔗', baseCost: 30, growth: 1.7, max: 30,
    unlock: { key: 'crit', level: 12 }, desc: '+5 ke stropu comba',
  },
  bossHunter: {
    name: 'Lovec bossů', emoji: '🏹', baseCost: 35, growth: 1.7, max: 20,
    unlock: { key: 'factory', level: 12 }, desc: '+8 % času na bosse a +12 % jejich zlata',
  },
  jeweler: {
    name: 'Klenotník', emoji: '⚒️', baseCost: 50, growth: 1.9, max: 20,
    unlock: { key: 'headstart', level: 8 }, desc: '+20 % úlomků 💠 a +0,3 % šance na drop',
  },
};

export const CAPSTONE_KEYS = Object.keys(CAPSTONES);

/* Sloučená mapa pro ceny/dohled (prestigeCost, buyPrestige). */
export const PRESTIGE_ALL = { ...PRESTIGE, ...CAPSTONES };
