/* =========================================================================
   MATĚJSKÁ POUŤ 🎡 — speciální SEZÓNNÍ atrakce tématu „Matějská".
   Zpřístupní se jen v sezóně s tématem `matejska` (deterministická rotace →
   každá 3. sezóna; viz data/seasonThemes.js). Dvě pouťové hry:

     🎡 Kolo štěstí  — zacáláš 1 lístek, zatočíš kolem, padne bounded výhra.
     🦆 Střelnice     — zacáláš 1 lístek, krátký časový hon na kachny; trefy → výhra.

   Pravidlo jako u Lucky/tripu/výtahu: odměny jsou BOUNDED a difficulty-neutral
   (zlato = násobek aktuálního DPS-za-sekundy, žádný dmgPct) → nulový dopad na
   snapshot obtížnosti / anti-blitz. Skutečné magnitudy počítá engine (zná DPS).
   ========================================================================= */

export const MATEJSKA = {
  themeId: 'matejska',

  /* 🎟️ Pouťové lístky — sdílená měna obou her. Regenerují v čase (jako žetony
     výtahu) + denní dorovnání na `freeDaily`. Přežijí rebirth, mřou se sezónou
     (createState() je vynuluje při hardResetu). */
  ticketMax: 6,
  ticketRegenMs: 10 * 60 * 1000, // 1 lístek / 10 min
  freeDaily: 3,                  // první vstup dne dorovná lístky až na tuhle hodnotu

  /* 🎡 Kolo štěstí — vážené výseče. `kind` říká enginu, jak odměnu spočítat:
       gold   → max(enemyReward·k, totalDps·dpsSeconds)  (jako Lucky)
       dust   → max(1, round(level·perLevel·dustMult))
       doves  → pevný počet 🕊
       frenzy → spustí (a případně prodlouží) zuřivost
       none   → smůla (jen flavour)
     Pořadí v poli = pořadí výsečí na kole (UI dopočítá úhel). */
  wheel: {
    spinMs: 4200, // délka animace zatočení
    segments: [
      { id: 'gold-s',   label: 'Pytlík zlata', emoji: '🪙', color: '#f2c14e', weight: 24, kind: 'gold',   dpsSeconds: 40,  rewardMult: 5 },
      { id: 'dust',     label: 'Hrst úlomků',  emoji: '💠', color: '#5ec8d8', weight: 18, kind: 'dust',   perLevel: 0.9 },
      { id: 'frenzy',   label: 'Zuřivost!',    emoji: '😡', color: '#e8643c', weight: 14, kind: 'frenzy' },
      { id: 'gold-m',   label: 'Truhlička',    emoji: '💰', color: '#f0a93b', weight: 12, kind: 'gold',   dpsSeconds: 150, rewardMult: 14 },
      { id: 'dove',     label: 'Holubice',     emoji: '🕊️', color: '#cfe3ff', weight: 9,  kind: 'doves',  doves: 1 },
      { id: 'none',     label: 'Smůla',        emoji: '🥨', color: '#6b5840', weight: 13, kind: 'none' },
      { id: 'gold-cons',label: 'Pár drobných', emoji: '🎫', color: '#c9a24b', weight: 8,  kind: 'gold',   dpsSeconds: 12,  rewardMult: 1 },
      { id: 'jackpot',  label: 'JACKPOT',      emoji: '🎰', color: '#ffd700', weight: 2,  kind: 'gold',   dpsSeconds: 700, rewardMult: 40, jackpot: true },
    ],
  },

  /* 🦆 Střelnice — krátký časový hon. Kachny se objevují a plavou přes lavici;
     klikni = trefa. Skóre (trefy) → bounded odměna. Engine trefy CLAMPuje na
     `maxHits`, takže ani podvržený výsledek nepřekročí strop. */
  duck: {
    durationMs: 18000,    // délka kola
    spawnEveryMs: 620,    // jak často přiletí kachna
    lifeMs: 2100,         // jak dlouho kachna vydrží, než upláchne
    maxConcurrent: 4,     // strop kachen naráz na lavici
    maxHits: 36,          // strop trefů pro výpočet odměny (anti-cheat clamp)
    goldDpsPerHit: 5,     // zlato za trefu = totalDps · tohle (DPS-sekundy/kachna)
    dustPerHit: 0.6,      // 💠 = round(hits · level · tohle/100 · dustMult) — viz engine
    doveEvery: 18,        // každých N trefů → +1 🕊
    goldenChance: 0.12,   // šance, že kachna je zlatá (×goldenMult bodů)
    goldenMult: 3,
  },
};

/* Součet vah kola (pro výpočet pravděpodobnosti). */
export function wheelTotalWeight() {
  return MATEJSKA.wheel.segments.reduce((a, s) => a + s.weight, 0);
}

/* Vyber výseč kola podle vah. `roll` ∈ [0,1) (engine dodá Math.random()).
   Vrací { index, segment }. */
export function pickWheelSegment(roll) {
  const segs = MATEJSKA.wheel.segments;
  const total = wheelTotalWeight();
  let acc = roll * total;
  for (let i = 0; i < segs.length; i++) {
    acc -= segs[i].weight;
    if (acc < 0) return { index: i, segment: segs[i] };
  }
  return { index: segs.length - 1, segment: segs[segs.length - 1] };
}
