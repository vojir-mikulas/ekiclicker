# Plan: Season Themes

Status: **implemented** (phases 1–3, client-only) · §6 server `theme` column deferred (optional) · Last updated: 2026-06-26

Builds on `seasons.md` (the full-reset season model) and the bounded-bonus
pattern shared by album / runes / mastery / guild. Read those first.

## 1. Goal

Give every season a **type/theme** that applies one small, season-wide
**passive base buff to everyone competing in that season**. Because the buff is
symmetric (all competitors share the same theme), it flavors the meta and softly
nudges a playstyle **without distorting the leaderboard** — it's a vibe, not an
edge.

Scope for v1 (decided): **passive buff only**, **deterministic cycle** by season
number, **3 themes**. No themed rewards, no hand-pick override, no leaderboard
re-weighting. Those are possible later extensions (§7), explicitly out of scope.

## 2. The 3 themes

| Theme | Fantasy | Base buff (bounded) | Helper(s) it feeds |
|---|---|---|---|
| 🍺 **Kalba** | Round's on the house — gold & forge | +10% gold, +8% dust 💠 | `combatStats.goldPct`, `dustMult` |
| 🏹 **Lovecká sezóna** | The hunt — bosses & 🐲 world boss | +12% boss gold, +8% boss timer, +12 combo cap | `bossGoldMult`, `bossTimeMult`, `comboCap` |
| 🎡 **Matějská** | The funfair — gamble & collect | +12% Lucky-Eki spawn, +5% drop chance | `combatStats.luck`, `dropChanceBonus` |

Each theme maps onto a **non-overlapping helper cluster**, so the three play
genuinely differently (rush-and-forge / boss-and-combo / gamble-and-collect).

**Hard rule — no `dmgPct`.** `dmgPct` is the only stat that touches
`difficultyScale` / the blitz surface, and only the difficulty-snapshotted
gear+pet path may add it. Themes stay entirely on the economy/QoL side, exactly
like album / runes / mastery / guild perks → **zero anti-blitz impact, zero new
cheat surface.** This is the load-bearing constraint; every chosen stat above is
deliberately a non-`dmgPct` one.

## 3. Why this needs (almost) no server work

The buff is a **pure function of the season number**, and the client already
knows that number — `me.season.active.number`, consumed today in
`AccountContext.jsx:26`. So:

```
theme = THEMES[(number - 1) % THEMES.length]
```

is computable client-side. The trust model matches `guildPerks`: bounded,
`dmgPct`-free, and never trusted by the server for scoring (gold/luck submissions
are bounded by `checkPlausibility` regardless of any client buff). So
client-derivation is legitimate — the buff feature is **client-only, no
migration required**.

The server `theme` column (§6) is an **optional companion**, recommended only so
the showcase can label *closed* seasons from frozen, authoritative data (if the
`THEMES` order is ever reordered, history wouldn't relabel). It does not gate the
buff. Ship §4–§5 first; §6 is independent and can follow.

## 4. New data file — `apps/web/src/game/data/seasonThemes.js`

Single source of truth for the themes (mirrors `data/album.js`, `data/runes.js`).

```js
export const SEASON_THEMES = [
  {
    id: 'kalba',
    label: 'Kalba',
    emoji: '🍺',
    blurb: 'Runda na účet podniku — víc zlata, víc úlomků.',
    mods: { goldPct: 0.10, dustPct: 0.08 },
  },
  {
    id: 'lov',
    label: 'Lovecká sezóna',
    emoji: '🏹',
    blurb: 'Hon na bosse — víc času i zlata z bossů, vyšší strop comba.',
    mods: { bossGold: 0.12, bossTime: 0.08, comboCap: 12 },
  },
  {
    id: 'matejska',
    label: 'Matějská',
    emoji: '🎡',
    blurb: 'Pouťová štěstěna — častější Lucky Eki a vyšší šance na drop.',
    mods: { luck: 0.12, dropChance: 0.05 },
  },
];

/* Deterministic cycle by season number (1-based). number==null → no theme. */
export function themeForSeason(number) {
  if (number == null) return null;
  return SEASON_THEMES[(number - 1) % SEASON_THEMES.length];
}

/* Bounded stat contributions of the active theme, in the shared affix-key shape
   read by combatStats / the standalone helpers. dmgPct is NEVER produced. */
export function seasonThemeStats(theme) {
  return (theme && theme.mods) || {};
}
```

> Cycle order: S1 Kalba → S2 Lovecká → S3 Matějská → S4 Kalba … Since the live
> Season is already 2 (`004_season_2.sql`), the rotation just continues from the
> current number; no special-casing.

## 5. Engine + formula wiring (the whole buff)

### 5a. State field — `initialState.js:69` (`createState`)
Add `seasonTheme: null`. This honors the createState invariant: `hardReset()` on
season turnover clears it, and it's re-applied on the next sync. Like
`guildPerks`, it is **server/derived, not persisted to the save or score** — it
exists in state only so the formulas can read it.

### 5b. Engine setter — `engine.js`, mirroring `setGuildPerks` (`engine.js:1226`)
```js
/* Aktivní téma sezóny (odvozené z čísla sezóny v /api/me). NEUKLÁDÁ se do save
   ani skóre. Bounded gold/dust/luck/boss/drop/combo, ŽÁDNÝ dmgPct → mimo
   difficultyScale; promítá se přes combatStats/dustMult/… jako perky cechu.
   Notifikuj jen při reálné změně. */
setSeasonTheme(theme) {
  const next = theme && theme.id ? { id: theme.id, mods: { ...theme.mods } } : null;
  const cur = this.state.seasonTheme || null;
  if ((cur?.id || null) === (next?.id || null)) return;
  this.state.seasonTheme = next;
  this.notify();
}
```

### 5c. Apply it — `AccountContext.jsx` `checkSeason` (around line 26)
The handler already reads `me.season.active`. Add one line:
```js
engine.setSeasonTheme(themeForSeason(s?.active?.number ?? null));
```
(import `themeForSeason`). On no account / logged out, `active` is null → theme
cleared. This is the only call site needed.

### 5d. Fold into the existing helpers — `formulas.js`
Source the theme stats once and add them alongside the existing sources. **No new
multiplier is introduced** — every key lands in a helper that already sums
bounded contributions.

- `combatStats(s)` (`formulas.js:28`): right where guild perks are folded
  (`formulas.js:39-43`), add the theme's `goldPct` and `luck`:
  ```js
  const theme = seasonThemeStats(s.seasonTheme);
  out.goldPct = (out.goldPct || 0) + (theme.goldPct || 0);
  out.luck    = (out.luck    || 0) + (theme.luck    || 0);
  ```
- `dustMult` (`formulas.js:132`): `+ (seasonThemeStats(s.seasonTheme).dustPct || 0)`
- `dropChanceBonus` (`formulas.js:127`): `+ (seasonThemeStats(s.seasonTheme).dropChance || 0)`
- `bossGoldMult` / `bossTimeMult` (`formulas.js:123-124`): `+ (… .bossGold || 0)` / `+ (… .bossTime || 0)`
- `comboCap` (`formulas.js:121`): `+ (… .comboCap || 0)`

That's the complete behavioral change. `globalMult` / `dmgPct` are untouched by
construction → difficulty/blitz math unchanged.

## 6. (Optional companion) server `theme` column — for frozen showcase history

Independent of the buff; ship only if we want closed seasons labeled from
authoritative data rather than re-derived from the (cycle) number.

- New migration `apps/server/migrations/008_season_themes.sql`:
  - `alter table seasons add column theme text;`
  - Backfill existing rows by their number: `update seasons set theme = case ((number-1)%3) when 0 then 'kalba' when 1 then 'lov' else 'matejska' end;`
  - Replace `rotate_season()` so the freshly-opened season also stamps
    `theme` for `active_num + 1` using the same `(n-1)%3` mapping. (The function
    lives in `002_seasons.sql:77`; redefine it here.)
- `getActiveSeason()` (`players.js:181`) already `select *` → `theme` rides along.
- `/api/me` season block (`auth.js:135-137`): include it →
  `active: { number: active.number, theme: active.theme }`. The client can then
  prefer `active.theme` and fall back to `themeForSeason(number)`.
- `/api/seasons` + `/api/seasons/:number` (showcase): include `theme` per row.

If we skip §6, the showcase just calls `themeForSeason(number)` for any season —
correct as long as `SEASON_THEMES` order is never reordered.

## 7. UI surface

- **`SeasonBanner.jsx`** (`SeasonBanner.jsx:18`): under the `SEZÓNA {number}`
  title, render the theme `{emoji} {label}` and a one-line buff summary from
  `mods` (e.g. "🍺 Kalba · +10% zlato · +8% 💠"). Derive via
  `themeForSeason(number)` (or `season.theme` if §6 shipped).
- **`NewSeasonModal.jsx` / `SeasonEndModal.jsx`**: one line naming the new
  season's theme so the reset announcement sets expectations
  ("Nová sezóna: 🎡 Matějská — pouťová štěstěna.").
- **Optional** small active-theme pill in the topbar (like the elixir pill),
  showing `{emoji}` with the buff list on hover. Nice-to-have, not v1-critical.

## 8. Anti-cheat / integrity notes

- **No `dmgPct`** anywhere in the themes → `difficultyScale` and the blitz
  surface are untouched. Same guarantee album / runes / mastery / guild already
  hold.
- The buff is **never trusted by the server**: gold/luck/drop outcomes a client
  submits are still bounded by `checkPlausibility` against the season row. A
  tampered client can't convert "I claim the Kalba buff" into an out-of-bounds
  score.
- **Symmetric within a season** → no competitive distortion; ranking stays a
  pure function of attested progress.
- `seasonTheme` is **not** in the save blob or score payload (like `guildPerks`),
  so it can't drift or be replayed; it's re-derived every sync from the season
  number.

## 9. Decision touch-point: "numbers only, no name"

`seasons.md` decided seasons are **numbered only, no cosmetic name**. Themes
gently evolve that: the identity stays the number ("Sezóna 7"); the theme is a
**derived label from a 3-entry enum**, not free-text, and (in v1) not even stored
— it's computed from the number. Framed as a principled extension of that rule,
not a reversal.

## 10. Phased roadmap

1. **`seasonThemes.js`** data file + cycle/stats helpers (§4).
2. **Engine + formulas** — `createState` field, `setSeasonTheme`, the
   `AccountContext` call, the five helper folds (§5). *Feature is fully live
   after this — client-only, no migration.*
3. **UI** — banner + new-season/end modals copy (§7).
4. **(Optional) `008_season_themes.sql`** + `/api/me` & showcase `theme` (§6),
   only if we want frozen authoritative labels for closed seasons.

## 11. Open / deferred

- Magnitudes (§2) are first-draft; trivially tunable in `seasonThemes.js`.
- Themed **close-of-season rewards** (e.g. Matějská grants extra chests) —
  deferred; would re-touch `rotate_season()` and the reward path.
- **Hand-pick override** per release — deferred; would add an arg to the
  rotation migration and lean on the §6 column. Cycle-only for now.
- 4th theme in the rotation pool (e.g. a 🕊 forgiveness-leaning one) — deferred.
