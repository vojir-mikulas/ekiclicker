/* =========================================================================
   BOJOVÉ RITUÁLY (active abilities) — aktivní schopnosti s cooldownem.
   Pozdní endgame VERB: na rozdíl od pasivních vrstev (výbava/runy/mřížka) je
   tohle aktivní vstup — tlačítka, která mačkáš v boji. Každý rituál má LEVEL
   (kupuje se ZLATEM, přežívá rebirth — trvalý gold-sink jako zaklínání) a
   PROBUZENÍ (awakening tier à la Naruto): při překročení prahu levelu se rituál
   „probudí" do silnější formy (nový název + emoji + násobič efektu + kratší cd).

   ANTI-BLITZ INVARIANT: efekty jsou čistý BURST (jako zuřivost / elixír) —
   násobí globalMult/click/weapon/gold nebo dají okamžitý zásah, ale NEvstupují
   do prestigePower/difficultyScale (ta čte jen power/rage/fist + runGearPower).
   → žádný nový exponenciál, žádný vliv na obtížnost/zeď. Rituály jen zpříjemní
   aktivní hru a oživí jinak „mrtvý" blitz po rebirthu.

   Druhy (kind):
     buff   → po `durationMs` aktivní; `effect` = stat + magnituda (viz abilityMods)
     nuke   → okamžitý zásah = totalDps × N sekund (N škáluje s levelem/probuzením)
     frenzy → spustí a prodlouží zuřivost (euforie)

   Čistý JS (žádné import.meta / DOM) → bezpečné pro node simulátor i formulky.
   ========================================================================= */

export const ABILITIES = {
  // 1) Globální burst poškození — „Final Smash". Krátké, silné, časté.
  naraz: {
    id: 'naraz', emoji: '👊', name: 'Nářez', kind: 'buff',
    cooldownMs: 40_000, durationMs: 10_000, maxLevel: 500,
    cost: { base: 8_000, growth: 1.11 },
    // stat 'dmg' je multiplikativní → výsledný násobič = 1 + mag (mag=1 → ×2).
    effect: { stat: 'dmg', base: 1.0, perLevel: 0.012 },
    desc: 'Globální poškození ×{x} na {dur} s',
    awakenings: [
      { at: 0,   name: 'Nářez',      emoji: '👊', mult: 1.0, cdMult: 1.0 },
      { at: 60,  name: 'Běsnění',    emoji: '😤', mult: 1.4, cdMult: 0.92 },
      { at: 150, name: 'Apokalypsa', emoji: '☄️', mult: 1.9, cdMult: 0.84 },
      { at: 320, name: 'Boží hněv',  emoji: '⚡', mult: 2.6, cdMult: 0.74 },
    ],
  },

  // 2) Okamžitý „delete boss" zásah = N sekund tvého DPS najednou.
  bourka: {
    id: 'bourka', emoji: '⚡', name: 'Bouřka', kind: 'nuke',
    cooldownMs: 60_000, durationMs: 0, maxLevel: 500,
    cost: { base: 12_000, growth: 1.115 },
    // mag = sekundy DPS uštědřené naráz; výsledné poškození = totalDps × mag.
    effect: { stat: 'nukeSeconds', base: 22, perLevel: 0.35 },
    desc: 'Okamžitý úder za {x} s tvého DPS',
    awakenings: [
      { at: 0,   name: 'Jiskra',     emoji: '⚡', mult: 1.0, cdMult: 1.0 },
      { at: 60,  name: 'Hromobití',  emoji: '🌩️', mult: 1.5, cdMult: 0.92 },
      { at: 150, name: 'Bouře',      emoji: '⛈️', mult: 2.2, cdMult: 0.85 },
      { at: 320, name: 'Armagedon',  emoji: '☄️', mult: 3.4, cdMult: 0.76 },
    ],
  },

  // 3) Okno jistého kritu — „Sharingan". Sčítá se ke crit šanci (capováno na 0,9).
  oko: {
    id: 'oko', emoji: '👁️', name: 'Vševidoucí oko', kind: 'buff',
    cooldownMs: 50_000, durationMs: 12_000, maxLevel: 500,
    cost: { base: 10_000, growth: 1.108 },
    // stat 'critChance' je aditivní (+pp); mag = přidaná šance (cap řeší formulka).
    effect: { stat: 'critChance', base: 0.25, perLevel: 0.0010 },
    desc: '+{x} ke crit šanci na {dur} s',
    awakenings: [
      { at: 0,   name: 'Soustředění',   emoji: '🎯', mult: 1.0, cdMult: 1.0 },
      { at: 60,  name: 'Trans',         emoji: '🌀', mult: 1.4, cdMult: 0.92 },
      { at: 150, name: 'Osvícení',      emoji: '🔮', mult: 1.8, cdMult: 0.85 },
      { at: 320, name: 'Vševidoucí oko', emoji: '👁️', mult: 2.4, cdMult: 0.78 },
    ],
  },

  // 4) Zlatá horečka — multiplikátor zlata (farmící rituál, mimo boj).
  hojnost: {
    id: 'hojnost', emoji: '🪙', name: 'Hojnost', kind: 'buff',
    cooldownMs: 45_000, durationMs: 20_000, maxLevel: 500,
    cost: { base: 6_000, growth: 1.10 },
    effect: { stat: 'gold', base: 1.5, perLevel: 0.02 }, // multiplikativní (1+mag)
    desc: 'Zlato ×{x} na {dur} s',
    awakenings: [
      { at: 0,   name: 'Hrabivost',     emoji: '🪙', mult: 1.0, cdMult: 1.0 },
      { at: 60,  name: 'Bohatství',     emoji: '💰', mult: 1.35, cdMult: 0.94 },
      { at: 150, name: 'Král Midas',    emoji: '👑', mult: 1.7, cdMult: 0.88 },
      { at: 320, name: 'Zlatá horečka', emoji: '🤑', mult: 2.2, cdMult: 0.82 },
    ],
  },

  // 5) Přetížení zbraní — multiplikátor jen auto-zbraní (DPS sloup).
  pretizeni: {
    id: 'pretizeni', emoji: '🧃', name: 'Přetížení', kind: 'buff',
    cooldownMs: 50_000, durationMs: 14_000, maxLevel: 500,
    cost: { base: 9_000, growth: 1.11 },
    effect: { stat: 'weapon', base: 1.2, perLevel: 0.014 }, // multiplikativní (1+mag)
    desc: 'DPS zbraní ×{x} na {dur} s',
    awakenings: [
      { at: 0,   name: 'Přetížení',     emoji: '🧃', mult: 1.0, cdMult: 1.0 },
      { at: 60,  name: 'Sériová palba',  emoji: '🔫', mult: 1.4, cdMult: 0.92 },
      { at: 150, name: 'Uragán',        emoji: '⚙️', mult: 1.9, cdMult: 0.85 },
      { at: 320, name: 'Roj',           emoji: '🐝', mult: 2.5, cdMult: 0.77 },
    ],
  },

  // 6) Druhý dech — spustí & prodlouží zuřivost (řetězí burst, euforie).
  druhydech: {
    id: 'druhydech', emoji: '🔥', name: 'Druhý dech', kind: 'frenzy',
    cooldownMs: 90_000, durationMs: 0, maxLevel: 500,
    cost: { base: 14_000, growth: 1.12 },
    // mag = bonusové ms zuřivosti navíc k základnímu trvání (na vrch startu frenzy).
    effect: { stat: 'frenzyMs', base: 4_000, perLevel: 40 },
    desc: 'Spustí zuřivost + {x} s navíc',
    awakenings: [
      { at: 0,   name: 'Druhý dech',   emoji: '🔥', mult: 1.0, cdMult: 1.0 },
      { at: 60,  name: 'Nával',        emoji: '🌋', mult: 1.4, cdMult: 0.92 },
      { at: 150, name: 'Extáze',       emoji: '💥', mult: 1.9, cdMult: 0.85 },
      { at: 320, name: 'Nesmrtelnost', emoji: '♾️', mult: 2.6, cdMult: 0.78 },
    ],
  },
};

export const ABILITY_KEYS = Object.keys(ABILITIES);

/* Odemkne se po dosažení této NEJVYŠŠÍ úrovně (trvalý příznak, přežívá rebirth —
   jako výbava/elixíry/mazlíčci/mřížka). „Velká" brána: aspirační endgame VERB,
   který cílí přesně na hráče s nejdelším blitzem (hluboká prestiž). Laditelné.
   cooldownMult škáluje VŠECHNY cooldowny (rituály jsou vzácný burst, ne spam). */
export const ABILITIES_CFG = { unlockLevel: 3500, cooldownMult: 5 };

/* Identita modifikátorů (žádný rituál aktivní). dmg/gold/weapon/click = ×1,
   critChance = +0. Mirror ELIXIR_IDENTITY. */
export const ABILITY_IDENTITY = { dmg: 1, gold: 1, weapon: 1, click: 1, critChance: 0 };

/* Index aktuálního probuzení (awakening tier) pro daný level. */
export function abilityTier(id, level) {
  const a = ABILITIES[id];
  if (!a) return 0;
  let t = 0;
  for (let i = 0; i < a.awakenings.length; i++) if ((level || 0) >= a.awakenings[i].at) t = i;
  return t;
}
export function abilityAwakening(id, level) {
  const a = ABILITIES[id];
  return a ? a.awakenings[abilityTier(id, level)] : null;
}

/* Magnituda efektu při daném levelu (× násobič probuzení). Význam dle stat:
   - dmg/gold/weapon → BONUS frakce (výsledný násobič = 1 + value, viz abilityMods)
   - critChance      → přidaná crit šance (pp)
   - nukeSeconds     → kolik sekund DPS uštědří nuke
   - frenzyMs        → bonusové ms zuřivosti */
export function abilityValue(id, level) {
  const a = ABILITIES[id];
  if (!a) return 0;
  const aw = abilityAwakening(id, level);
  return (a.effect.base + a.effect.perLevel * (level || 0)) * aw.mult;
}

/* Efektivní cooldown (ms) — základ × globální cooldownMult × cdMult probuzení
   (vyšší tier = svižnější). */
export function abilityCooldown(id, level) {
  const a = ABILITIES[id];
  if (!a) return Infinity;
  return Math.round(a.cooldownMs * ABILITIES_CFG.cooldownMult * abilityAwakening(id, level).cdMult);
}

/* Cena dalšího levelu (zlato). Roste geometricky → trvalý endgame gold-sink. */
export function abilityCost(id, level) {
  const a = ABILITIES[id];
  if (!a || (level || 0) >= a.maxLevel) return Infinity;
  return Math.ceil(a.cost.base * Math.pow(a.cost.growth, level || 0));
}

/* Lidsky čitelný „×N" / „+N" pro popisek (UI). */
export function abilityDisplayValue(id, level) {
  const a = ABILITIES[id];
  const v = abilityValue(id, level);
  const stat = a.effect.stat;
  if (stat === 'dmg' || stat === 'gold' || stat === 'weapon' || stat === 'click') return `×${(1 + v).toFixed(1)}`;
  if (stat === 'critChance') return `+${Math.round(v * 100)} %`;
  if (stat === 'nukeSeconds') return `${Math.round(v)} s`;
  if (stat === 'frenzyMs') return `${(v / 1000).toFixed(1)} s`;
  return String(Math.round(v));
}

/* Popisek efektu s dosazenými hodnotami (sdílí ho bar i panel). {x} = magnituda,
   {dur} = trvání buffu v sekundách. */
export function abilityDescText(id, level) {
  const def = ABILITIES[id];
  if (!def) return '';
  return def.desc
    .replace('{x}', abilityDisplayValue(id, level))
    .replace('{dur}', String(Math.round(def.durationMs / 1000)));
}

/* Násobiče VŠECH aktivních buff-rituálů (mirror elixirMods). Čistá funkce nad
   stavem — engine drží s.abilities.active (klíče = právě aktivní; expiraci řeší
   tick), formulky jen ČTOU (deterministické; simulátor je neaktivuje → identita).
   Multiplikativní staty se násobí (1+value), aditivní (critChance) se sčítají. */
export function abilityMods(s) {
  const out = { dmg: 1, gold: 1, weapon: 1, click: 1, critChance: 0 };
  const ab = s.abilities;
  if (!ab || !ab.active) return out;
  for (const id in ab.active) {
    const def = ABILITIES[id];
    if (!def || def.kind !== 'buff') continue;
    const level = (ab.levels && ab.levels[id]) || 0;
    const v = abilityValue(id, level);
    const stat = def.effect.stat;
    if (stat === 'critChance') out.critChance += v;
    else if (out[stat] != null) out[stat] *= 1 + v;
  }
  return out;
}
