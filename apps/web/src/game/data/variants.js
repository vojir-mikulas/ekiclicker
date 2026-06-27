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
  magma:   { name: 'Magma Eki',    tier: '🌋 lávový',        hp: 18,   gold: 15,   glow: '#ff4d1a', tint: 'rgba(255,70,10,.5)',      filter: 'sepia(.45) saturate(2.6) hue-rotate(-22deg) brightness(1.12) contrast(1.2)', minLevel: 110, weight: 13 },
  celestial:{ name: 'Celestial Eki',tier: '✨ nebeský',       hp: 22,   gold: 18,   glow: '#ffe9a8', tint: 'rgba(255,235,170,.4)',    filter: 'brightness(1.25) contrast(.95) saturate(1.4) sepia(.25)',          minLevel: 130, weight: 9 },
  eternal: { name: 'Eternal Eki',  tier: '♾️ věčný',         hp: 32,   gold: 26,   glow: '#39ffd0', tint: 'rgba(20,120,100,.5)',     filter: 'hue-rotate(120deg) saturate(1.8) contrast(1.1) brightness(1.05)',  minLevel: 180, weight: 5 },

  // hlubinné varianty — odemykají se napříč celým výstupem (prestige ladder)
  emerald:  { name: 'Emerald Eki',  tier: '💚 smaragdový',    hp: 37,   gold: 30,   glow: '#1fd980', tint: 'rgba(20,200,110,.45)',    filter: 'hue-rotate(110deg) saturate(1.9) brightness(1.0) contrast(1.1)',   minLevel: 220,  weight: 11 },
  storm:    { name: 'Storm Eki',    tier: '⚡ bouřlivý',      hp: 42,   gold: 34,   glow: '#9d8bff', tint: 'rgba(110,80,255,.5)',     filter: 'hue-rotate(225deg) saturate(1.7) contrast(1.2) brightness(1.08)',  minLevel: 250,  weight: 12 },
  amber:    { name: 'Amber Eki',    tier: '🟡 jantarový',     hp: 48,   gold: 39,   glow: '#ffb22e', tint: 'rgba(255,170,40,.45)',    filter: 'sepia(.55) saturate(2.0) hue-rotate(-8deg) brightness(1.08) contrast(1.05)', minLevel: 300,  weight: 11 },
  plague:   { name: 'Plague Eki',   tier: '☣️ morový',        hp: 54,   gold: 44,   glow: '#b6d23a', tint: 'rgba(150,170,40,.5)',     filter: 'hue-rotate(50deg) saturate(1.8) brightness(.85) sepia(.3)',        minLevel: 350,  weight: 10 },
  sapphire: { name: 'Sapphire Eki', tier: '💙 safírový',      hp: 62,   gold: 50,   glow: '#2f6bff', tint: 'rgba(30,80,255,.5)',      filter: 'hue-rotate(200deg) saturate(2.0) brightness(.95) contrast(1.15)',  minLevel: 430,  weight: 9 },
  crystal:  { name: 'Crystal Eki',  tier: '🔮 křišťálový',    hp: 70,   gold: 56,   glow: '#ff7be0', tint: 'rgba(255,120,220,.42)',   filter: 'hue-rotate(290deg) saturate(1.5) brightness(1.2) contrast(1.05)',  minLevel: 500,  weight: 9 },
  glacial:  { name: 'Glacial Eki',  tier: '🧊 ledový',        hp: 78,   gold: 64,   glow: '#dff2ff', tint: 'rgba(200,235,255,.4)',    filter: 'hue-rotate(185deg) brightness(1.5) contrast(.85) saturate(.5)',    minLevel: 600,  weight: 8 },
  void:     { name: 'Void Eki',     tier: '🕳️ prázdný',       hp: 88,   gold: 72,   glow: '#6b6b88', tint: 'rgba(8,8,16,.7)',         filter: 'grayscale(.85) brightness(.4) contrast(1.3)',                      minLevel: 700,  weight: 8 },
  obsidian: { name: 'Obsidian Eki', tier: '🖤 obsidiánový',   hp: 98,   gold: 80,   glow: '#6a5a8a', tint: 'rgba(8,5,18,.7)',         filter: 'grayscale(.45) brightness(.5) contrast(1.55) saturate(.9) hue-rotate(250deg)', minLevel: 850, weight: 7 },
  blood:    { name: 'Blood Eki',    tier: '🩸 krvavý',        hp: 110,  gold: 90,   glow: '#ff2b3a', tint: 'rgba(180,10,20,.55)',     filter: 'saturate(2.2) hue-rotate(-10deg) brightness(.8) contrast(1.2)',    minLevel: 1000, weight: 7 },
  arcane:   { name: 'Arcane Eki',   tier: '🔯 arkánový',      hp: 122,  gold: 100,  glow: '#8a5cff', tint: 'rgba(90,40,200,.48)',     filter: 'hue-rotate(245deg) saturate(2.0) brightness(1.1) contrast(1.15) drop-shadow(0 0 7px #8a5cff)', minLevel: 1200, weight: 6 },
  spectral: { name: 'Spectral Eki', tier: '👻 přízračný',     hp: 135,  gold: 110,  glow: '#aef0ff', tint: 'rgba(170,240,255,.32)',   filter: 'hue-rotate(160deg) brightness(1.35) contrast(.8) saturate(.7)',    minLevel: 1400, weight: 6 },
  mirror:   { name: 'Mirror Eki',   tier: '🪞 zrcadlový',     hp: 150,  gold: 122,  glow: '#d8e0ec', tint: 'rgba(220,228,240,.3)',    filter: 'grayscale(.85) brightness(1.3) contrast(1.4) saturate(.3)',        minLevel: 1650, weight: 6 },
  ancient:  { name: 'Ancient Eki',  tier: '🗿 prastarý',      hp: 165,  gold: 135,  glow: '#c9a86a', tint: 'rgba(150,120,70,.5)',     filter: 'sepia(.7) saturate(.8) brightness(.85) contrast(1.1)',             minLevel: 1900, weight: 6 },
  plasma:   { name: 'Plasma Eki',   tier: '⚛️ plazmový',      hp: 182,  gold: 150,  glow: '#ff5cf0', tint: 'rgba(255,90,230,.4)',     filter: 'saturate(2.2) brightness(1.25) contrast(1.1) hue-rotate(300deg) drop-shadow(0 0 8px #ff5cf0)', minLevel: 2200, weight: 5 },
  radiant:  { name: 'Radiant Eki',  tier: '🌅 zářivý',        hp: 200,  gold: 165,  glow: '#fff1b0', tint: 'rgba(255,240,180,.38)',   filter: 'brightness(1.4) contrast(1.05) saturate(1.5) sepia(.35) drop-shadow(0 0 8px #ffe88a)', minLevel: 2500, weight: 5 },
  bone:     { name: 'Bone Eki',     tier: '🦴 kostěný',       hp: 222,  gold: 182,  glow: '#e8ddc0', tint: 'rgba(230,220,190,.42)',   filter: 'sepia(.5) saturate(.6) brightness(1.15) contrast(.95)',            minLevel: 2900, weight: 5 },
  nightmare:{ name: 'Nightmare Eki',tier: '💀 noční můra',    hp: 245,  gold: 200,  glow: '#c0309a', tint: 'rgba(40,5,30,.66)',       filter: 'hue-rotate(295deg) saturate(1.7) brightness(.55) contrast(1.3)',   minLevel: 3300, weight: 4 },
  prismatic:{ name: 'Prismatic Eki',tier: '🌈 duhový',        hp: 300,  gold: 250,  glow: '#7affd1', tint: 'rgba(255,255,255,.12)',   filter: 'saturate(2.4) contrast(1.2) brightness(1.2) hue-rotate(40deg) drop-shadow(0 0 10px #ff5ed0)', minLevel: 4200, weight: 4 },

  // tajný „trip" Eki — NEjde z fondu (řídí ho tripSpawnChance v enginu, viz `trip`).
  // Žije s nepřetržitou psychedelickou animací; zabití spustí celoscénový trip + balík
  // bounded odměn. Vzácný 36. záznam Bestiáře (objeví se až v hloubce, ~1 % spawnů).
  tripeki: { name: 'Vyšlehanej Eki', tier: '🍄 zfetovaný',     hp: 170,  gold: 220,  glow: '#ff5ed0', tint: 'rgba(255,120,230,.2)',   filter: 'saturate(2.6) contrast(1.15) brightness(1.18) drop-shadow(0 0 12px #ff5ed0)', minLevel: 2000, trip: true },

  // bossové (řízeno úrovní, ne fondem)
  gold:    { name: 'Golden Eki',   tier: '★ BOSS ★',         hp: 11,   gold: 18,   glow: '#ffd23f', tint: 'rgba(255,200,40,.55)',    filter: 'sepia(.6) saturate(2) brightness(1.1)',           boss: true },
  king:    { name: 'Eki Král',     tier: '👑 MEGA BOSS',     hp: 38,   gold: 70,   glow: '#ff2bd0', tint: 'rgba(255,40,200,.5)',     filter: 'saturate(1.8) hue-rotate(285deg) brightness(1.15)', boss: true, mega: true },
  titan:   { name: 'Eki Titán',    tier: '🌟 ULTRA BOSS',    hp: 140,  gold: 320,  glow: '#ff7a18', tint: 'rgba(255,120,20,.55)',    filter: 'saturate(2.2) contrast(1.25) brightness(1.1) drop-shadow(0 0 12px #ff7a18)', boss: true, mega: true, ultra: true },
  archon:  { name: 'Eki Archón',   tier: '👁️ ARCHÓN',        hp: 600,  gold: 1400, glow: '#b97aff', tint: 'rgba(150,80,255,.55)',    filter: 'saturate(2.4) contrast(1.35) brightness(1.12) drop-shadow(0 0 18px #b97aff)', boss: true, mega: true, ultra: true, archon: true },
};

/* Lucky Eki (zlatá sušenka) — neobjevuje se v aréně, je to klikací bonus. */
export const LUCKY = { emoji: '🍀', name: 'Lucky Eki', glow: '#46e08a' };

/* Boxovací kruh (⭕) — prázdný prsten; cvaknutí = knockout krit buff. Není to
   varianta Ekiho, ale klikací bonus (jako Lucky). Hlášky se vybírají podle strany
   spawnu — levá půlka arény = rány „zleva", pravá = „zprava". */
export const COMBO_RING = {
  name: 'Boxovací kruh',
  glow: '#ff3b47',
  left: ['LEVEJ HÁK! 🥊', 'LOKET! 💢', 'ZLEVA NA BRADU! 🥊'],
  right: ['PRAVEJ HÁK! 🥊', 'TU MÁŠ KOLÍNKO! 🦵', 'ZPRAVA PŘÍMÝ! 👊'],
};

/* Přístupná barva nadpisu z varianty: vezme `glow` (signaturní odstín varianty)
   a podrží jeho ODSTÍN, ale ukotví jas/sytost tak, aby text byl čitelný na tmavém
   navy pozadí — i u tmavých variant (Void, Abyss…) a zároveň ne oslnivě bílý.
   Vrací { color } pro plný text a { light } pro horní konec přechodu. */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
export function variantNameColors(glow) {
  const [h, s, l] = rgbToHsl(...hexToRgb(glow || '#9fd4f5'));
  const sat = Math.min(1, Math.max(s, 0.4));        // ať je hue vidět i u šedivých
  const baseL = Math.min(0.82, Math.max(l, 0.68));  // dolní strop jasu = čitelnost
  const topL = Math.min(0.95, baseL + 0.2);
  const hh = h.toFixed(0);
  return {
    color: `hsl(${hh} ${(sat * 100).toFixed(0)}% ${(baseL * 100).toFixed(0)}%)`,
    light: `hsl(${hh} ${(Math.min(1, sat + 0.08) * 100).toFixed(0)}% ${(topL * 100).toFixed(0)}%)`,
  };
}

export function variantPool(level) {
  return Object.entries(VARIANTS)
    .filter(([, v]) => !v.boss && !v.trip && level >= v.minLevel)
    .map(([id, v]) => ({ id, weight: v.weight }));
}
