/* Vizuální varianty SVĚTOVÉHO BOSSE — stejná Eki fotka, ale „epická": výrazný
   barevný filtr + záře + aura kolem. Cyklují v zákrytu se jmény bossů
   (WORLD_BOSS_NAMES v shared), tj. podle `boss.number`. Čistě kosmetické —
   server posílá name/emoji/number, klient si z čísla odvodí vzhled. */
export const WORLD_BOSS_VARIANTS = [
  { // 1 — Eki Ascendant 🦁
    glow: '#ffd23f', aura: 'rgba(255,210,63,.55)',
    tint: 'rgba(255,196,40,.28)',
    filter: 'sepia(.45) saturate(2) brightness(1.12) contrast(1.06)',
  },
  { // 2 — Eki Bubble Bubble 🫧
    glow: '#43d9ff', aura: 'rgba(67,217,255,.5)',
    tint: 'rgba(60,170,255,.3)',
    filter: 'hue-rotate(150deg) saturate(1.5) brightness(1.12) contrast(1.05)',
  },
  { // 3 — Eki Chad 🗿
    glow: '#b9c2d0', aura: 'rgba(185,194,208,.45)',
    tint: 'rgba(120,130,150,.32)',
    filter: 'grayscale(.85) contrast(1.32) brightness(1.04)',
  },
  { // 4 — Eki Fire asf 🔥
    glow: '#ff5a1a', aura: 'rgba(255,90,26,.55)',
    tint: 'rgba(255,80,20,.32)',
    filter: 'sepia(.6) saturate(3) hue-rotate(-22deg) brightness(1.06)',
  },
  { // 5 — Eki Deep 🦑
    glow: '#6a4bff', aura: 'rgba(106,75,255,.5)',
    tint: 'rgba(70,40,180,.36)',
    filter: 'brightness(.78) contrast(1.25) hue-rotate(212deg) saturate(1.55)',
  },
];

export function worldBossVariant(number) {
  const len = WORLD_BOSS_VARIANTS.length;
  const i = (((Number(number || 1) - 1) % len) + len) % len;
  return WORLD_BOSS_VARIANTS[i];
}
