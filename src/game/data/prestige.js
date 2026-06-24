/* REBIRTH / prestige — kupuje se za Odpuštění 🕊, zůstává napořád.
   Cena = baseCost × growth^level. Žádné levely se po rebirthu neztrácí. */
export const PRESTIGE = {
  rage:      { name: 'Věčný hněv',     emoji: '🩸', baseCost: 1, growth: 1.55, desc: '×1,16 poškození (vše) — násobí se!' },
  greed:     { name: 'Štědrost',       emoji: '🪙', baseCost: 1, growth: 1.5,  desc: '+25 % zlata' },
  fist:      { name: 'Trénovaná pěst', emoji: '👊', baseCost: 2, growth: 1.6,  desc: '+50 % síla úderu' },
  factory:   { name: 'Sériová výroba', emoji: '⚙️', baseCost: 2, growth: 1.6,  desc: 'zbraně +4 % rychlost' },
  shadow:    { name: 'Stín pěsti',     emoji: '🌑', baseCost: 3, growth: 1.7,  desc: 'auto-úder: +1 pěst/s' },
  crit:      { name: 'Přesnost',       emoji: '🎯', baseCost: 3, growth: 1.7,  desc: '+2 % šance na krit' },
  luck:      { name: 'Štěstí',         emoji: '🍀', baseCost: 4, growth: 1.8,  desc: '+15 % šance na Lucky Eki' },
  headstart: { name: 'Náskok',         emoji: '🚀', baseCost: 5, growth: 2.0,  desc: 'start o 3 úrovně výš' },
};

export const PRESTIGE_KEYS = Object.keys(PRESTIGE);
