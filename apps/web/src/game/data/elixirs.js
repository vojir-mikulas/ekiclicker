/* =========================================================================
   ELIXÍRY — kupované SPOTŘEBNÍ lektvary s dočasným buffem.
   Vždy běží JEN JEDEN naráz (s.elixir.active). Mechanika je kopie zuřivosti:
   čistě multiplikativní burst, který NEvstupuje do obtížnosti (žádný nový
   exponenciál) → anti-runaway zůstává netknutý.

   effect = sada násobičů aplikovaných ve formulkách:
     dmg        → globalMult (vše: úder, DPS, stín)
     gold       → goldMult
     weapon     → weaponShotDamage (jen auto-zbraně)
     click      → clickDamage (jen manuální úder)
     critChance → critChance (+pp)
   Identita = vše ×1 / +0 (žádný aktivní elixír).

   Čistý JS (žádné import.meta) → bezpečné pro node simulátor i formulky.
   Obrázky ikon řeší zvlášť elixirImages.js (jen prohlížeč), fallback = emoji.
   ========================================================================= */
export const ELIXIRS = {
  plznicka: {
    id: 'plznicka', emoji: '🍺', name: 'Plznička',
    desc: '×2 zlato', durationMs: 5 * 60_000, baseCost: 800,
    effect: { dmg: 1, gold: 2, weapon: 1, click: 1, critChance: 0 },
  },
  monster: {
    id: 'monster', emoji: '🧃', name: 'Monster White',
    desc: '×2 DPS zbraní', durationMs: 3 * 60_000, baseCost: 2000,
    effect: { dmg: 1, gold: 1, weapon: 2, click: 1, critChance: 0 },
  },
  redbull: {
    id: 'redbull', emoji: '🐂', name: 'Redbullíček',
    desc: '×2,5 úder + krit', durationMs: 2 * 60_000, baseCost: 3500,
    effect: { dmg: 1, gold: 1, weapon: 1, click: 2.5, critChance: 0.1 },
  },
  spendliky: {
    id: 'spendliky', emoji: '🍸', name: 'Špendlíky',
    // dmg:5 je GLOBÁLNÍ (úder + DPS + stín) → nejsilnější drink. Proto vlastní,
    // ručně vyšší podíl ze zlata (goldPct) místo poměru z baseCost — viz elixirCost.
    desc: '×5 poškození', durationMs: 90_000, baseCost: 9000, goldPct: 0.44,
    effect: { dmg: 5, gold: 1, weapon: 1, click: 1, critChance: 0 },
  },
};

export const ELIXIR_KEYS = Object.keys(ELIXIRS);

/* Elixíry se odemknou až po dosažení této NEJVYŠŠÍ úrovně — mezistupeň mezi
   výbavou (1000) a mazlíčky (2000). Trvalý příznak (přežívá rebirth) jako u nich.
   goldPct = podíl AKTUÁLNÍHO zlata, který stojí nejlevnější elixír v lategame
   (dražší úměrně víc — viz REF_COST) → drink zůstává „high value" i na obřích
   hromadách zlata, ne drobné. */
export const ELIXIRS_CFG = { unlockLevel: 1500, goldPct: 0.02 };

/* Nejlevnější základ = kotva poměru (tier) pro podíl ze zlata → silnější elixíry
   ukrojí úměrně větší krajíc, ale práh přechodu mají všechny stejný. */
const REF_COST = Math.min(...ELIXIR_KEYS.map((k) => ELIXIRS[k].baseCost));

export const ELIXIR_IDENTITY = { dmg: 1, gold: 1, weapon: 1, click: 1, critChance: 0 };

/* Cena = MAX ze dvou složek (spotřebka → costAt ignoruje index):
   1) PODLAHA škálovaná postupem (baseCost × nejvyšší úroveň) — gold-sink i s málem
      zlata, nikdy zdarma;
   2) PODÍL aktuálního zlata — když sedíš na hromadě, drink stojí smysluplný krajíc
      → „high value". Podíl je buď ruční (def.goldPct, když síla neodpovídá baseCost
      — třeba ×5 globální Špendlíky), jinak odvozený z poměru tieru (baseCost/REF).
   Bez ručního přepisu je práh přechodu pro všechny stejný (poměr baseCost se
   vykrátí): zlato > nejvyšší úroveň × REF_COST / goldPct. */
export function elixirCost(id, level, gold = 0) {
  const def = ELIXIRS[id];
  if (!def) return Infinity;
  const levelFloor = def.baseCost * Math.max(1, level || 1);
  const pct = def.goldPct != null ? def.goldPct : ELIXIRS_CFG.goldPct * (def.baseCost / REF_COST);
  const goldShare = Math.max(0, gold) * pct;
  return Math.ceil(Math.max(levelFloor, goldShare));
}
export const elixirCostAt = (s, id) => () => elixirCost(id, s.highestLevel, s.gold);

/* Násobiče aktivního elixíru (identita, když žádný neběží). Čistá funkce nad
   stavem — tick drží s.elixir.active, formulky jen ČTOU (deterministické). */
export function elixirMods(s) {
  const id = s.elixir && s.elixir.active;
  if (!id) return ELIXIR_IDENTITY;
  const def = ELIXIRS[id];
  return def ? def.effect : ELIXIR_IDENTITY;
}
