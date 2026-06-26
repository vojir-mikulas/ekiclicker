/* =========================================================================
   SEASON THEMES — téma sezóny = jeden malý, celosezónní PASIVNÍ bounded buff,
   který platí pro VŠECHNY hráče dané sezóny. Symetrický → dochucuje meta, ale
   nezvýhodňuje nikoho na žebříčku.

   Pravidlo (stejně jako album/runy/mřížka/cech): ŽÁDNÝ dmgPct → mimo
   difficultyScale → nulový dopad na blitz / anti-cheat. Každý klíč níže míří do
   helperu ve formulas.js, který už bounded příspěvky sčítá.

   Výběr tématu je čistá funkce čísla sezóny (deterministická rotace) → klient
   ho odvodí sám z `me.season.active.number`; server nic posílat nemusí.
   ========================================================================= */

export const SEASON_THEMES = [
  {
    id: 'kalba',
    label: 'Kalba',
    emoji: '🍺',
    blurb: 'Runda na účet podniku — víc zlata, víc úlomků.',
    perks: ['+10 % zlato', '+8 % 💠 úlomků'],
    mods: { goldPct: 0.1, dustPct: 0.08 },
  },
  {
    id: 'lov',
    label: 'Lovecká sezóna',
    emoji: '🏹',
    blurb: 'Hon na bosse — víc času i zlata z bossů a vyšší strop comba.',
    perks: ['+12 % zlato z bossů', '+8 % čas na bosse', '+12 strop comba'],
    mods: { bossGold: 0.12, bossTime: 0.08, comboCap: 12 },
  },
  {
    id: 'matejska',
    label: 'Matějská',
    emoji: '🎡',
    blurb: 'Pouťová štěstěna — častější Lucky Eki a vyšší šance na drop.',
    perks: ['+12 % šance na Lucky Eki', '+5 % šance na drop'],
    mods: { luck: 0.12, dropChance: 0.05 },
  },
];

/* Deterministická rotace podle čísla sezóny (1-based). number==null → bez tématu. */
export function themeForSeason(number) {
  if (number == null) return null;
  return SEASON_THEMES[(number - 1) % SEASON_THEMES.length];
}

/* Bounded příspěvky aktivního tématu ve sdíleném tvaru afixových klíčů, který
   čtou combatStats / samostatné helpery. dmgPct se NIKDY neprodukuje. */
export function seasonThemeStats(theme) {
  return (theme && theme.mods) || {};
}
