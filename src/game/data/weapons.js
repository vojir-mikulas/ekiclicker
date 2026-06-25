/* Automatické zbraně — kupují se po KUSECH (jako budovy v Cookie Clickeru).
   poškození/zásah = baseDmg × počet × milníky(×2 za každých 25) × globalMult
   cena n-tého kusu = baseCost × 1.15^počet
   Každá zbraň má vyšší základ → nutí střídat a rozšiřovat arzenál.
   Pořadí = tier; odemyká se podle dosažené úrovně. */
export const WEAPONS = [
  { id: 'glove',   emoji: '🥊', name: 'Boxerská rukavice', baseCost: 50,        baseDmg: 2,        interval: 1000, flight: 240, unlock: 1 },
  { id: 'bat',     emoji: '🏏', name: 'Kriketová pálka',   baseCost: 600,       baseDmg: 14,       interval: 1100, flight: 300, unlock: 4 },
  { id: 'baseball',emoji: '⚾', name: 'Baseball',          baseCost: 7000,      baseDmg: 95,       interval: 950,  flight: 320, unlock: 8 },
  { id: 'basket',  emoji: '🏀', name: 'Basketbal',         baseCost: 90000,     baseDmg: 640,      interval: 1250, flight: 340, unlock: 14 },
  { id: 'bowling', emoji: '🎳', name: 'Bowlingová koule',  baseCost: 1.1e6,     baseDmg: 4200,     interval: 1400, flight: 360, unlock: 22 },
  { id: 'hammer',  emoji: '🔨', name: 'Kladivo',           baseCost: 14e6,      baseDmg: 28000,    interval: 1600, flight: 340, unlock: 32 },
  { id: 'axe',     emoji: '🪓', name: 'Sekera',            baseCost: 1.8e8,     baseDmg: 190000,   interval: 1500, flight: 320, unlock: 45 },
  { id: 'sword',   emoji: '⚔️', name: 'Velký meč',         baseCost: 2.4e9,     baseDmg: 1.3e6,    interval: 1450, flight: 320, unlock: 60 },
  { id: 'bomb',    emoji: '💣', name: 'Bomba',             baseCost: 3.2e10,    baseDmg: 9.2e6,    interval: 1900, flight: 400, unlock: 80 },
  { id: 'rocket',  emoji: '🚀', name: 'Raketa',            baseCost: 4.5e11,    baseDmg: 6.6e7,    interval: 2000, flight: 440, unlock: 105 },
  { id: 'meteor',  emoji: '☄️', name: 'Meteor',            baseCost: 6.5e12,    baseDmg: 4.9e8,    interval: 2400, flight: 480, unlock: 140 },
  { id: 'volcano', emoji: '🌋', name: 'Sopka',             baseCost: 1.0e14,    baseDmg: 3.8e9,    interval: 2800, flight: 520, unlock: 185 },
  { id: 'blackhole',emoji: '🕳️', name: 'Černá díra',       baseCost: 1.6e15,    baseDmg: 2.7e10,   interval: 3000, flight: 540, unlock: 240 },
  { id: 'galaxy',  emoji: '🌌', name: 'Galaxie',           baseCost: 2.6e16,    baseDmg: 1.9e11,   interval: 3300, flight: 580, unlock: 300 },
  { id: 'nova',    emoji: '💥', name: 'Supernova',         baseCost: 4.2e17,    baseDmg: 1.4e12,   interval: 3600, flight: 620, unlock: 380 },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
