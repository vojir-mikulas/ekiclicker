/* =========================================================================
   HOSPODA U EKIHO 🍺 — speciální SEZÓNNÍ atrakce tématu „Kalba".
   Zpřístupní se jen v sezóně s tématem `kalba` (deterministická rotace →
   každá 3. sezóna od první: 1, 4, 7…; viz data/seasonThemes.js). Dvě hospodské
   hry sdílí 🍻 rundy (regen v čase + denní dorovnání jako pouťové lístky):

     🍺 Čepování piva — zacálej rundu, zastav ukazatel ve „správné pěně".
                        Trefa do středu → bounded výhra (jako Lucky).
     🎯 Hospodské šipky — zacálej rundu, krátké kolo; zaměřovač kmitá po terči,
                        klikáš = hod. Skóre podle kruhů → bounded výhra.

   Pravidlo jako u pouti/Lucky/tripu/výtahu: odměny jsou BOUNDED a difficulty-
   neutral (zlato = násobek aktuálního DPS-za-sekundy, žádný dmgPct) → nulový
   dopad na snapshot obtížnosti / anti-blitz. Skutečné magnitudy počítá engine
   (zná DPS) a vstupy CLAMPuje (pozice 0..1, skóre na strop).
   ========================================================================= */

export const HOSPODA = {
  themeId: 'kalba',

  /* 🍻 Rundy — sdílená měna obou her. Regenerují v čase + denní dorovnání na
     `freeDaily`. Přežijí rebirth, mřou se sezónou (createState() je vynuluje
     při hardResetu). Mirror pouťových lístků. */
  tokenMax: 6,
  tokenRegenMs: 10 * 60 * 1000, // 1 runda / 10 min
  freeDaily: 3,                 // první vstup dne dorovná rundy až na tuhle hodnotu

  /* 🍺 Čepování piva — jednorázová dovednostní hra. Ukazatel přejíždí škálu
     0..1 a zpět; hráč klikne „Čepuj!". Engine z pozice spočítá ODCHYLKU od
     středu (0 = dokonalá pěna, 1 = kraj) a vybere pásmo. `kind`:
       gold → max(enemyReward·k, totalDps·dpsSeconds)  (jako Lucky)
       none → přelité (jen flavour, žádná odměna)
     `dust` = za úroveň (×dustMult); pásmo `dove:true` občas přihodí 🕊. */
  pour: {
    sweepMs: 1300, // perioda přejezdu ukazatele tam i zpět (UI; kratší = těžší)
    // POŘADÍ od nejtěžšího/nejlepšího; engine bere první pásmo, kam dev ≤ max.
    tiers: [
      { id: 'perfect', max: 0.07, label: 'Dokonalá pěna!',  emoji: '🍺', color: '#ffd700', kind: 'gold', dpsSeconds: 200, rewardMult: 18, dust: 1.3, dove: true, jackpot: true },
      { id: 'great',   max: 0.18, label: 'Pěkně načepováno', emoji: '🍺', color: '#f0a93b', kind: 'gold', dpsSeconds: 80,  rewardMult: 8,  dust: 0.7 },
      { id: 'good',    max: 0.34, label: 'Ujde to',          emoji: '🍻', color: '#f2c14e', kind: 'gold', dpsSeconds: 32,  rewardMult: 3,  dust: 0.35 },
      { id: 'ok',      max: 0.52, label: 'Trochu fláknuté',  emoji: '🫧', color: '#c9a24b', kind: 'gold', dpsSeconds: 12,  rewardMult: 1,  dust: 0.15 },
      { id: 'spill',   max: 1.01, label: 'Přelité!',         emoji: '💦', color: '#6b5840', kind: 'none' },
    ],
    doveChance: 0.5, // šance, že pásmo s `dove:true` přihodí +1 🕊
  },

  /* 🎯 Hospodské šipky — krátké časové kolo. Zaměřovač kmitá po terči (UI,
     Lissajousovy sinusy); klik = hod do aktuální pozice. Skóre podle kruhu
     (vzdálenost od středu). Součet skóre → bounded odměna. Engine skóre
     CLAMPuje na `maxScore`, takže ani podvržený výsledek nepřekročí strop. */
  darts: {
    durationMs: 16000,    // délka kola
    throws: 6,            // kolik šipek hodíš (UI ukončí po vyčerpání nebo čase)
    sweepXMs: 1100,       // perioda vodorovného kmitu zaměřovače
    sweepYMs: 1450,       // perioda svislého kmitu (jiná → krouží/osmička)
    amp: 0.42,            // amplituda kmitu od středu (0..0.5 plochy terče)
    goldDpsPerScore: 0.5, // zlato = totalDps · score · tohle (DPS-sekundy)
    dustPerScore: 0.06,   // 💠 = round(score · level · tohle/100 · dustMult)
    doveEvery: 150,       // každých N skóre → +1 🕊
    // kruhy podle NORMALIZOVANÉ vzdálenosti od středu d ∈ [0,1] (0 = střed).
    // POŘADÍ od středu; UI i strop berou první kruh, kam d ≤ max.
    rings: [
      { id: 'bull',  max: 0.09, score: 50, emoji: '🎯', label: 'Terno!' },
      { id: 'inner', max: 0.20, score: 25, emoji: '🟡', label: '25' },
      { id: 'mid',   max: 0.34, score: 15, emoji: '🟠', label: '15' },
      { id: 'outer', max: 0.52, score: 8,  emoji: '🔵', label: '8' },
      { id: 'edge',  max: 0.78, score: 3,  emoji: '⚪', label: '3' },
      { id: 'miss',  max: 1.01, score: 0,  emoji: '💨', label: 'Vedle' },
    ],
  },
};

/* Strop skóre šipek (throws × nejlepší kruh) — anti-cheat clamp v enginu. */
export function dartsMaxScore() {
  return HOSPODA.darts.throws * HOSPODA.darts.rings[0].score;
}

/* Pásmo čepování podle pozice ukazatele. `pos` ∈ [0,1] (UI dodá, kde marker
   zastavil). Vrací { dev, tier }: dev = odchylka od středu ∈ [0,1]. */
export function pourTier(pos) {
  const p = Math.max(0, Math.min(1, Number(pos) || 0));
  const dev = Math.min(1, Math.abs(p - 0.5) * 2);
  const tiers = HOSPODA.pour.tiers;
  const tier = tiers.find((t) => dev <= t.max) || tiers[tiers.length - 1];
  return { dev, tier };
}

/* Kruh šipky podle vzdálenosti od středu. `dist` ∈ [0,1] (UI spočítá z pozice
   zaměřovače při hodu). Vrací { ring } se score/emoji/label pro UI i součet. */
export function dartRingFor(dist) {
  const d = Math.max(0, Math.min(1, Number(dist) || 0));
  const rings = HOSPODA.darts.rings;
  return { ring: rings.find((r) => d <= r.max) || rings[rings.length - 1] };
}
