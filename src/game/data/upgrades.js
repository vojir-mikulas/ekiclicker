/* Vylepšení za zlato 🪙. Cena = baseCost × growth^level.
   `max` (volitelný) = strop levelu (endgame ceiling). */
export const UPGRADES = {
  punch: { name: 'Síla pěsti',      emoji: '💪', baseCost: 40,   growth: 1.16, desc: '+3 k základu úderu' },
  power: { name: 'Násobič síly',    emoji: '🔥', baseCost: 400,  growth: 1.165, desc: '×1,11 poškození (vše) — násobí se!' },
  speed: { name: 'Zrychlení zbraní', emoji: '⚡', baseCost: 1200, growth: 1.55, desc: 'zbraně střílí o ~3 % rychleji', max: 80 },
  click: { name: 'Údernost',        emoji: '🎯', baseCost: 2500, growth: 1.5,  desc: 'úder navíc dostane +1 % z DPS' },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);
