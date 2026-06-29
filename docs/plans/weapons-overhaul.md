# Weapons overhaul

Status: **PLAN — approved direction, not yet implemented**
Owner: Mikuláš
Last updated: 2026-06-29

## Problem (player-reported)

> "Weapons are obsolete around level 700: I unlock a weapon, buy ~1000× of it, and
> then it doesn't deal any damage. Also sometimes the gain from a new weapon is way
> too much. Make weapons viable on the correct levels with the current settings."

## How weapons work today

Per-shot damage (`formulas.js#weaponShotDamage`):

```
shot = baseDmg × count × 2^⌊count/25⌋ × globalMult × (1+weaponPct) × arsenalSynergy × elixir × ability
cost(nth copy) = baseCost × 1.15^count
```

- **46 hand-placed tiers** (`data/weapons.js`), geometric **×7 baseDmg / ×15.5 baseCost**
  per tier, `unlock` placed by hand 1 → 28500. Unlock is checked vs **current** level
  (`engine.js:1245` `s.level < w.unlock`) so weapons re-lock each rebirth.
- `globalMult` (power ×1.11/lvl @ cost ×1.165, rage ×1.16/lvl, ascension) is the
  **only exponential engine**. Weapons deliberately do **not** scale with level.
- Enemy HP scales with level via the decaying `hpCurve`; weapons are gated only by `unlock`.
- **Arsenal synergy**: every 25 copies (`weaponMilestone`) of *any* weapon grants +2%
  (`arsenalSynergyPerTier`) to *all* weapon damage, capped at **5 milestones/weapon**
  (`arsenalSynergyTierCap`, = 125 copies). Max ×5.6. Bounded, outside `difficultyScale`.

## Diagnosis — why it fails (the math)

Both complaints share one root: weapon viability-at-level is an **accident** of
hand-placed `baseDmg/baseCost/unlock` vs. the HP+gold curves, which have since been
retuned (decaying curve, goldRatio, harden, ascension nerf). The numbers no longer
line up with where difficulty actually sits.

1. **"Tops out / does nothing after buying a chunk."**
   - Cost grows ×1.15/copy; damage×count grows ~linearly + the ×2/25 milestone. Net: a
     **single weapon's DPS scales only as gold^0.20** (each ×2 milestone costs ×33 gold).
     It tops out almost immediately — you can't buy it to keep pace.
   - Meanwhile `power` scales globalMult as **gold^0.69**. So power is the real engine and
     weapons are a flat floor *by construction*. The **only** thing that re-floats a weapon
     is unlocking the next tier — but deep-zone unlock gaps are **700–2200 levels wide**, so
     between unlocks the best weapon is frozen while HP climbs → "does no damage."

2. **"Gain is sometimes way too much."**
   - A new tier is **×7 base**. One copy is weak; pushing it to its first ×2 milestone
     multiplies total arsenal DPS by a lumpy factor. ×7/tier + ×2/25 = **spiky handoffs**.

3. **Buy-1000× is pointless past 125 copies** — arsenal synergy hard-caps at 5
   milestones/weapon, so the deep-stacking playstyle the player actually uses hits a dead wall.

## Design goals & invariants

Goals:
- Each weapon is the *right buy* around its unlock and a meaningful contributor for a band
  of levels; smooth handoffs (no dead zones, no overshoot).
- "Viable at the correct level" holds **by construction**, derived from the live curves —
  robust to future curve tuning.
- **Weapons are a deliberate minority DPS source:** total weapon DPS ≈ **1/4 → 1/3 of the
  fist** (punching stays the primary damage). Reward the buy-1000× playstyle without ever
  letting weapons overtake clicking.

Hard invariants (from the balance architecture — do not violate):
- Weapons stay **out of `difficultyScale`** → zero anti-blitz / anti-runaway impact.
- No new exponential engine; `globalMult` (power/rage/ascension) stays the only one.
- Old saves keep working (new/renamed ids auto-init to 0 via `createWeapons`).

### The strength anchor (the key number)

The ratio `weaponDPS / fist` is **independent of globalMult** (both carry it), so it can be
targeted directly from the *upgrade/copy profile* at each level. Using the sim's punch-DPS
convention (`effDps = totalDps + CLICK_RATE × clickDamage`, `CLICK_RATE = 3.5`):

```
ζ(L) = totalWeaponDps / (CLICK_RATE × basePunch)        target ζ ∈ [0.25, 0.33]
```

- Base arsenal (just-unlocked, lightly stacked) targets **ζ ≈ 0.25**.
- The diminishing-uncap synergy carries a dedicated deep-stacker up toward **ζ ≈ 0.33**,
  asymptoting there — so buy-1000× matters but never breaks the ceiling.
- `CLICK_RATE = 3.5` is the cadence assumption and a tuning knob. We anchor on `basePunch`
  (not `clickDamage`) to avoid the `fromDps` circular coupling.

## The overhaul — 4 pieces

### Piece 1 — Curve-anchored arsenal generator (core fix)

Stop hand-placing 46 weapons. A build script (`scripts/genweapons.js`) **derives** the
`WEAPONS` array from the live curves so unlocks land where difficulty actually is:

- Inputs: `hpCurve`, `goldCurve`, target unlock cadence, target ζ, CLICK_RATE.
- Reuse `simulate.js`'s greedy buyer to get the **expected (upgrades, weapons, gold) profile
  at each level** (prestige-agnostic — ζ is globalMult-independent).
- For each tier, solve `unlock / baseDmg / baseCost` so that buying the weapon to its first
  ~1–2 milestones with the gold available at its unlock level puts ζ in band, AND the weapon
  is the marginal-best ROI buy for a contiguous band of levels (verified against the sim's
  ROI picker).
- Emits the array (sorted by unlock) + a validation report. Re-runnable whenever curves change.

This makes viability-at-level a **designed, re-derivable property** instead of a guess.

### Piece 2 — Denser unlocks + gentler per-tier ratio

Folded into the generator's targets:
- Per-tier ratio **×7 → ~×3–4 baseDmg** (smaller jumps → fixes "gain too much").
- **Cap unlock gaps** (deep zone ≤ ~300–400 levels) so there's always a "next weapon" near
  the frontier (fixes the dead band). Likely **more than 46 tiers** out to the playable
  ceiling (~200k); generator decides count from cadence × ceiling.

### Piece 3 — Smoother within-weapon growth

Replace the lumpy **×2 / 25 copies** milestone with a gentler curve (candidate: **×1.4 / 20**,
or a continuous `count^k` factor) so pushing a single weapon feels steady, not a cliff every
25 copies. Knobs to `config.js MULT`; `milestoneMult` in `formulas.js`. Keep the global synergy.

### Piece 4 — Uncapped (diminishing) arsenal synergy

Reward the buy-1000× playstyle. Replace the hard `arsenalSynergyTierCap = 5` with a
**diminishing-per-milestone** curve: each milestone past the 5th gives progressively less, so
it's unbounded-in-principle but asymptotes (carries ζ from ~0.25 toward ~0.33). Implementation:
change the accumulation in `arsenalSynergyTiers` (`formulas.js`), add a decay knob to `MULT`,
update the `WeaponList` banner copy.

**Safety (verified):** synergy is additive-linear in milestones (+2% each) and each milestone
costs ×33 gold → total synergy grows only **logarithmically in gold**, while globalMult grows
as gold^0.69. Synergy can **never** outrun the engine → no runaway, even uncapped. It is already
**outside `difficultyScale`** → zero anti-blitz impact at any magnitude. The 1.15^count cost
curve self-throttles mega-stacking. The diminishing curve also preserves the original cross-buy
incentive (mega-stacking one cheap weapon hits steep diminishing returns).

### Explicitly NOT doing: level-familiarity ramp

A bounded `(currentLevel − unlock)` damage ramp was considered to keep a just-bought weapon
alive in the dead zone. **Dropped:** pieces 1–2 remove the dead zone structurally, and the ramp
would risk pushing ζ past the 1/3 ceiling in exactly the band it targets, while adding a new
mechanic. Weapons stay a clean flat floor.

## Knobs (final surface)

| Knob | Location | Controls |
|------|----------|----------|
| target ζ band | generator | weapons-vs-fist strength (0.25 → 0.33) |
| unlock cadence / gap cap | generator | dead-zone elimination, tier count |
| per-tier baseDmg ratio (~3–4) | generator | handoff smoothness |
| milestone curve (×1.4/20?) | `MULT` + `milestoneMult` | within-weapon pacing |
| synergy per-tier (0.02) + decay | `MULT` + `arsenalSynergyTiers` | buy-1000× payoff, ζ asymptote |
| CLICK_RATE (3.5) | generator / sim | cadence assumption |

## Phased implementation

1. **Generator + harness** — build `scripts/genweapons.js`, regenerate `WEAPONS`, validate.
   Pure data + tooling; no gameplay-feel risk until the array ships.
2. **Milestone curve** — gentler `milestoneMult` + config knobs.
3. **Synergy uncap** — diminishing `arsenalSynergyTiers` + knob + `WeaponList` copy.
4. **Tune** against the sim ladder; update `weapons-progression` memory + this doc.

## Validation gates (existing tooling)

`wallsweep.js` and `simulate.js` greedily pick weapons by ROI, so the new arsenal is provable:

- **Coverage:** every weapon is the marginal-best buy for some level band (no dead tiers) —
  add a per-level "chosen weapon" trace to the generator report.
- **Strength:** ζ(L) ∈ [0.25, 0.33] across the playable range (base ≈0.25, deep-stacked ≈0.33).
- **No runaway:** `npm run balance` greedy sim max levels/s < ~12.
- **Walls unchanged:** `wallsweep.js` fresh→whale ladder within tolerance (weapons stay out of
  difficultyScale → must not move walls).
- `smoke.js` green; old saves load (ids default to 0).

## Open questions

- Final ζ band edges (0.25/0.33 vs slightly different) — tune once generator output is visible.
- Milestone curve shape (×1.4/20 vs continuous `count^k`) — pick after seeing pacing in sim.
- Exact synergy decay function (geometric vs harmonic) for the asymptote target.
- Tier count / ceiling: regenerate out to ~200k or stop earlier with a coarse tail?
