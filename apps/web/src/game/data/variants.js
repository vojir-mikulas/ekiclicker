/* Varianty Ekiho — barevný nádech přes fotku + škálování HP/odměny.
   `minLevel` = od kdy se může objevit, `weight` = relativní šance ve fondu.
   `boss`/`mega` se neberou z fondu — řídí je úroveň (bossEvery / megaBossEvery). */
export const VARIANTS = {
  normal:  { name: 'Normal Eki',   tier: 'obyčejný',         hp: 1,    gold: 1,    glow: '#5a6477', tint: null,                      filter: null,                                              minLevel: 1,  weight: 100 },
  red:     { name: 'Red Eki',      tier: 'naštvaný',         hp: 1.7,  gold: 1.7,  glow: '#ff3b47', tint: 'rgba(255,40,50,.55)',     filter: 'saturate(1.4) brightness(.95)',                   minLevel: 3,  weight: 70 },
  blue:    { name: 'Frozen Eki',   tier: 'zmrzlý',           hp: 2.4,  gold: 2.3,  glow: '#3b9dff', tint: 'rgba(40,130,255,.5)',     filter: 'hue-rotate(170deg) brightness(1.05)',             minLevel: 8,  weight: 55 },
  toxic:   { name: 'Toxic Eki',    tier: 'jedovatý',         hp: 3.3,  gold: 3.1,  glow: '#5dff5d', tint: 'rgba(80,255,80,.45)',     filter: 'hue-rotate(70deg) saturate(1.5)',                 minLevel: 15, weight: 45 },
  shadow:  { name: 'Shadow Eki',   tier: 'temný',            hp: 4.6,  gold: 4.2,  glow: '#a06bff', tint: 'rgba(20,10,40,.65)',      filter: 'grayscale(.7) brightness(.55)',                   minLevel: 25, weight: 35 },
  inferno: { name: 'Inferno Eki',  tier: '🔥 pekelný',       hp: 6.5,  gold: 6.0,  glow: '#ff6a1a', tint: 'rgba(255,90,20,.5)',      filter: 'sepia(.5) saturate(2.4) hue-rotate(-18deg) brightness(1.05)', minLevel: 40, weight: 26 },
  cursed:  { name: 'Cursed Eki',   tier: '🟣 prokletý',      hp: 9,    gold: 8.5,  glow: '#c050ff', tint: 'rgba(150,30,220,.5)',     filter: 'saturate(1.6) hue-rotate(255deg) brightness(.85)',minLevel: 60, weight: 18 },
  diamond: { name: 'Diamond Eki',  tier: '💎 nezničitelný',  hp: 16,   gold: 7,    glow: '#7fe9ff', tint: 'rgba(120,220,255,.4)',    filter: 'brightness(1.18) contrast(1.12) saturate(.55) hue-rotate(165deg)', minLevel: 50, weight: 10 },
  abyssal: { name: 'Abyss Eki',    tier: '🌌 propastný',     hp: 14,   gold: 12,   glow: '#3a2bff', tint: 'rgba(30,15,90,.62)',      filter: 'brightness(.7) contrast(1.2) hue-rotate(210deg) saturate(1.3)',    minLevel: 90,  weight: 14 },
  celestial:{ name: 'Celestial Eki',tier: '✨ nebeský',       hp: 22,   gold: 18,   glow: '#ffe9a8', tint: 'rgba(255,235,170,.4)',    filter: 'brightness(1.25) contrast(.95) saturate(1.4) sepia(.25)',          minLevel: 130, weight: 9 },
  eternal: { name: 'Eternal Eki',  tier: '♾️ věčný',         hp: 32,   gold: 26,   glow: '#39ffd0', tint: 'rgba(20,120,100,.5)',     filter: 'hue-rotate(120deg) saturate(1.8) contrast(1.1) brightness(1.05)',  minLevel: 180, weight: 5 },

  // bossové (řízeno úrovní, ne fondem)
  gold:    { name: 'Golden Eki',   tier: '★ BOSS ★',         hp: 11,   gold: 18,   glow: '#ffd23f', tint: 'rgba(255,200,40,.55)',    filter: 'sepia(.6) saturate(2) brightness(1.1)',           boss: true },
  king:    { name: 'Eki Král',     tier: '👑 MEGA BOSS',     hp: 38,   gold: 70,   glow: '#ff2bd0', tint: 'rgba(255,40,200,.5)',     filter: 'saturate(1.8) hue-rotate(285deg) brightness(1.15)', boss: true, mega: true },
  titan:   { name: 'Eki Titán',    tier: '🌟 ULTRA BOSS',    hp: 140,  gold: 320,  glow: '#ff7a18', tint: 'rgba(255,120,20,.55)',    filter: 'saturate(2.2) contrast(1.25) brightness(1.1) drop-shadow(0 0 12px #ff7a18)', boss: true, mega: true, ultra: true },
};

/* Lucky Eki (zlatá sušenka) — neobjevuje se v aréně, je to klikací bonus. */
export const LUCKY = { emoji: '🍀', name: 'Lucky Eki', glow: '#46e08a' };

export function variantPool(level) {
  return Object.entries(VARIANTS)
    .filter(([, v]) => !v.boss && level >= v.minLevel)
    .map(([id, v]) => ({ id, weight: v.weight }));
}
