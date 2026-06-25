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
  // --- pozdní hra: arzenál za Supernovou (drží stejnou geometrii ×7 dmg / ×~15,5 cena
  // za tier, takže nové zbraně sednou do ROI křivky beze změny anti-runaway balance;
  // vyplňují prázdné pásmo 380→2200, kde dřív nebylo co odemykat). ---
  { id: 'starrain',  emoji: '🌠', name: 'Hvězdný déšť',      baseCost: 6.5e18,    baseDmg: 1.0e13,   interval: 3800, flight: 650, unlock: 470 },
  { id: 'planet',    emoji: '🪐', name: 'Zatoulaná planeta', baseCost: 1.0e20,    baseDmg: 7.0e13,   interval: 4000, flight: 680, unlock: 590 },
  { id: 'sun',       emoji: '☀️', name: 'Vzteklé slunce',    baseCost: 1.6e21,    baseDmg: 4.9e14,   interval: 4200, flight: 700, unlock: 730 },
  { id: 'nuke',      emoji: '☢️', name: 'Atomovka',          baseCost: 2.5e22,    baseDmg: 3.4e15,   interval: 4300, flight: 720, unlock: 900 },
  { id: 'pulsar',    emoji: '💫', name: 'Pulsar',            baseCost: 3.9e23,    baseDmg: 2.4e16,   interval: 4400, flight: 730, unlock: 1080 },
  { id: 'nebula',    emoji: '🌫️', name: 'Mlhovina',          baseCost: 6.0e24,    baseDmg: 1.7e17,   interval: 4400, flight: 740, unlock: 1340 },
  { id: 'ufo',       emoji: '🛸', name: 'Vesmírná invaze',   baseCost: 9.3e25,    baseDmg: 1.2e18,   interval: 4400, flight: 750, unlock: 1640 },
  { id: 'darkmatter',emoji: '🌑', name: 'Temná hmota',       baseCost: 1.4e27,    baseDmg: 8.4e18,   interval: 4500, flight: 760, unlock: 1980 },
  { id: 'heatdeath', emoji: '⏳', name: 'Konec vesmíru',     baseCost: 2.2e28,    baseDmg: 5.9e19,   interval: 4500, flight: 770, unlock: 2400 },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
