# Plan: Trýzeň (Torment) — boss mechaniky + opt-in obtížnost

Status: **proposed** (not started) · Last updated: 2026-06-26

Builds on the difficulty-snapshot anti-blitz model (`difficultyScale` /
`runGearPower`), the Hellevator (`hellevator.md` — a *power-normalized side mode*
with its own currency + server-recomputed board) and the World Boss
(`world-boss-architecture` — server bounds outcome from attested `peakDps`). Read
those first; this plan reuses all three patterns deliberately.

## 1. Goal — fix the blitz *feel*, don't add another power layer

The vertical axis is saturated (a gear layer at nearly every gate 1000→4000). The
documented open problem is different: **`balance-structural-wall` — a whale
one-hits content to ~2471, ~5 s/dead, "not long".** That is a *texture* problem,
not a numbers problem. More enemy HP just moves the wall; it doesn't make the kill
feel like anything.

Trýzeň attacks the feel directly, in two halves:

1. **Boss mechaniky** — milestone bosses stop being a bigger HP bar that pops in
   one frame. A bounded **per-tick damage cap** guarantees a minimum encounter
   length, which gives **phases / shields / drink-breaks / weak-points** room to
   actually play out. This is the "content that can't be solved by raw DPS" lever.
2. **Trýzeň (Torment) dial** — an **opt-in** difficulty escalation (tiers 0..N)
   that intensifies those mechanics and multiplies enemy HP, in exchange for
   **bounded** loot (💠/🕊/bedny) + a cosmetic flex. This is the knob for whales
   who've outgrown the curve — content that *doesn't* die in 5 s, by choice.

**Scope for v1 (decided):** mechanics on **mega/ultra/archon** bosses only (the
milestone fights), one **mechanic library** (4 mechanics), a **single Torment
dial** with a bounded HP curve + bounded loot curve, and **one new leaderboard
board** (`scope: 'torment'`). No new craftable power, no `dmgPct`, no per-mechanic
upgrades. Those are §11 extensions.

## 2. The two halves

### 2a. The damage cap — the linchpin (self-targeting)

A boss takes **at most `bossDmgCapFrac` of its `maxHp` per second** (overflow
discarded, exactly like the existing overkill rule at `engine.js:130-133`). This
is *self-targeting*: a player who already needs 4 s to kill never notices it; a
whale who'd one-shot is stretched to the same `minBossDurationMs`. **Only the
people experiencing the hollow blitz are affected** — and only on milestone
bosses, so the moment-to-moment golden-Eki dopamine is untouched.

The cap is **symmetric** (everyone faces the same fraction) → it changes *pace*,
not *ranking*, so the leaderboard is undistorted. It is always ≤ `bossTime`
(`engine.js:117-121`) so bosses still never escape from the cap alone.

> Pace cost is real and is the main tradeoff — see §9. v1 caps only **mega+**
> (every 25/100/500) to keep it small; whether T0 golden bosses also get a light
> cap is an explicit decision for you, not baked in.

### 2b. The mechanic library

Data-driven, composed onto a variant the way affixes compose onto gear. Each
mechanic is a small state machine ticked in `tick()` and pokeable by `punch()` /
`castAbility()`. All four are **idle-survivable at T0** (auto-resolve if ignored,
you just kill slower) and become **hard gates** only at higher Torment.

| Mechanika | Téma | Co dělá | Co odměňuje | Idle-safe? |
|---|---|---|---|---|
| 🛡️ **Štít** | Eki si kryje pivo | Shield HP appears at 66%/33%; absorbs **auto** DPS, breaks faster from **manual klik** | active clicking | T0: shield decays on its own; T≥k: must break |
| 🍺 **Doušek** | Pivní pauza | Boss "takes a sip" → heals X%/s for a window unless **interrupted** by an ability cast or active frenzy | abilities 🌀 / frenzy | T0: small heal; T≥k: big heal, must interrupt |
| ⏱️ **Vztek** | Eki se nasere | Sub-timer; if not killed in time, boss enrages (+HP regen / faster) | burst (elixir/ability/combo) | T0: mild; T≥k: punishing |
| 🎯 **Slabina** | Otevřená merunda | A clickable weak-point flashes for ~1.5 s → bonus dmg + bounded loot on hit | reaction | always upside (no downside) |

🎯 **Slabina works even at T0** → it's the "feel" win for non-Torment players:
the milestone kill now has a *moment* you can react to. The other three escalate
with Torment.

## 3. The load-bearing constraint — Trýzeň can only ever *slow* the main board

This is the integrity rule that makes the whole feature safe, and it is the exact
mirror of the "no `dmgPct`" rule the rest of the game holds:

> **Torment never speeds main progression. It makes enemies harder for bounded
> side-rewards, so the standard board (`highestLevel`, …) can only ever rank a
> Torment player *lower*, never higher. Torment gets its OWN board.**

Concretely, three hard rules:

1. **No `dmgPct`, no gold/level multiplier from Torment.** Torment touches enemy
   **HP** (a self-imposed handicap) and **bounded faucets** (💠/🕊/bedny, per-run
   capped) only. `enemyReward` (gold) is **untouched** → no faster wall-climb, no
   leaderboard pace exploit.
2. **The Torment HP multiplier is SEPARATE from `difficultyScale`.** It is *not*
   folded into the prestige/`runGearPower` snapshot — that machinery exists to
   bound *carried* power (anti-blitz) and is delicately tuned (`difficultyExp`).
   Torment is a *chosen* difficulty, applied transparently at the spawn callsite,
   so it never perturbs the snapshot math.
3. **Torment damage is normal damage → it feeds `peakDps` honestly** (no nuke, no
   burst-outside-difficulty). The boss damage cap only ever *lowers* recorded
   `eff` (overflow discarded) → it can only *under*-count `peakDps` → conservative,
   zero new cheat surface. Same guarantee the Hellevator already holds
   (`engine.js:1163`).

## 4. New data file — `apps/web/src/game/data/torment.js`

Single source of truth (mirrors `data/hellevator.js`, `data/seasonThemes.js`).

```js
export const TORMENT = {
  maxTier: 10,
  // Enemy HP × this per tier — bounded, transparent, NOT in difficultyScale.
  // Mild geometric so high tiers are a real wall but not float-breaking.
  hpMultPerTier: 0.45,          // T(n) HP mult = (1 + 0.45·n)  → T10 = ×5.5
  // Bounded loot bonus per tier, applied to DROP RATES of existing faucets only.
  dropBonusPerTier: 0.06,       // +6 pp chest/egg/rune drop chance per tier (capped below)
  dustBonusPerTier: 0.15,       // +15% 💠 from Torment kills per tier (via dustMult-style fold)
  maxDropBonus: 0.40,           // hard ceiling on the drop-rate bump
  // Per-run faucet cap (mirrors ITEMS.maxChestsPerRun / PETS.maxEggsPerRun) so
  // Torment can't become the dominant farm — it's flavor + flex, not a printer.
  bonusChestsPerRun: 12,
  bonusDovesPerRun: 8,
  // Boss damage cap (the linchpin). Applies to mega+ only in v1.
  bossDmgCapFrac: 0.22,         // boss loses ≤22%/s of maxHp  → min ~4.5 s encounter
  capFromVariant: 'mega',       // 'mega' | 'ultra' — smallest boss tier the cap bites
  // Which mechanics are live at which tier (T0 = baseline feel only).
  mechanics: {
    slabina: { fromTier: 0 },                 // weak-point: always on (the T0 feel win)
    stit:    { fromTier: 1, hardFromTier: 4 },// shield: decays<4, must-break≥4
    dousek:  { fromTier: 2, hardFromTier: 5 },// drink-heal: big-heal≥5
    vztek:   { fromTier: 3, hardFromTier: 6 },// enrage: punishing≥6
  },
};

export const tormentHpMult = (tier) =>
  1 + TORMENT.hpMultPerTier * Math.max(0, Math.min(TORMENT.maxTier, tier || 0));

/* Bounded loot bonuses of the active tier (drop-rate + dust). Never gold/levels. */
export function tormentLoot(tier) {
  const t = Math.max(0, Math.min(TORMENT.maxTier, tier || 0));
  return {
    drop: Math.min(TORMENT.maxDropBonus, TORMENT.dropBonusPerTier * t),
    dust: TORMENT.dustBonusPerTier * t,
  };
}

/* Per-boss mechanic loadout for a given variant at a given tier (data only —
   the engine ticks the state machine). Returns [] for non-milestone variants. */
export function tormentMechanics(variant, tier) { /* compose from TORMENT.mechanics */ }
```

## 5. Engine + formula wiring

The whole feature is **client-side** except the leaderboard board (§6). Hooks, in
order of the combat loop:

### 5a. State — `initialState.js:70` (`createState`)
```js
tormentTier: 0,            // opt-in dial (0 = off). Persists rebirth (like buyAmount/settings); dies with season.
tormentBest: 0,            // highest tier at which you've cleared a milestone boss THIS season (board scalar)
tormentLootThisRun: { chests: 0, doves: 0 }, // per-run faucet counters (reset in resetRun)
```
`resetRun` (`initialState.js:139`) zeroes `tormentLootThisRun` (mirrors
`itemsThisRun`/`eggsThisRun` at `:155-157`); `tormentTier`/`tormentBest` survive
rebirth, die with the season — like `mastery`/`hell` at `:121-127`.

### 5b. Spawn — fold the HP mult + attach mechanic state (`engine.js:112-124`)
At `:115`, multiply the chosen difficulty by the **transparent** Torment mult
(keeps `difficultyScale` pure, per §3 rule 2):
```js
const hp = enemyMaxHp(this.state.level, v, difficultyScale(this.state) * tormentHpMult(this.state.tormentTier));
```
After building `enemy` (`:116`), if `v.mega` (or whatever `capFromVariant` gates),
attach `enemy.dmgCap = enemy.maxHp * TORMENT.bossDmgCapFrac * dt`-style budget and
`enemy.mech = tormentMechanics(v, this.state.tormentTier)` (shield HP, enrageAt,
heal window, weak-point schedule).

### 5c. Damage cap + shield routing — `applyDamage` (`engine.js:127-147`)
Before the kill check (`:136`), clamp `amount` to the boss's per-tick cap budget
and route through any active 🛡️ shield (auto DPS chips the shield slowly, `'punch'`
chips it fast). Overflow past the cap is discarded **exactly like overkill today**
(`:130-133`) → `eff` is what actually landed → `peakDps` stays honest (§3 rule 3).

### 5d. Mechanic timers — `tick` (`engine.js:1676`)
Alongside the existing frenzy/elixir/ability-expiry blocks (`:1681-1702`), tick the
boss mechanic state: shield decay (soft tiers), drink-heal window (heal unless
`s.frenzy.active` or a buff in `s.abilities.active`), enrage sub-timer, weak-point
lifecycle. Emit `'tormentMech'` events (`{ kind, phase }`) for FX — same `emit`
channel as `'spawn'`/`'frenzy'` (`engine.js:90`).

### 5e. Active interaction — `punch` (`engine.js:943`) + `castAbility` (`engine.js:1133`)
`punch` already routes to `applyDamage(dmg,'punch')` (`:961`) → shield-break is
automatic via 5c; add a weak-point hit-test. `castAbility` (any cast) sets an
"interrupt" flag the drink-heal reads on the next tick.

### 5f. Defeat — bounded loot + board scalar (`engine.js:172-212`)
After the existing drops (`maybeDropChest/Egg/Rune` at `:198-200`), if
`tormentTier > 0` and `v.boss`: apply the **drop-rate bump** + **dust trickle**
from `tormentLoot(tier)`, **respecting `tormentLootThisRun` caps** (mirror the
`itemsThisRun` guard). Then:
```js
if (s.tormentTier > s.tormentBest) s.tormentBest = s.tormentTier; // season board scalar
```
`enemyReward` (gold, `:176`) and the mastery-point grant (`:204-207`) are
**untouched** → Torment adds zero progression speed (§3 rule 1).

### 5g. No `formulas.js` change to the difficulty path
`difficultyScale` (`formulas.js:261-264`) and `enemyMaxHp` (`:273-280`) stay
**byte-for-byte the same**. The Torment mult lives only at the spawn callsite
(5b). `tormentLoot.dust` folds into the dust award the way `dustMult` already does
(`formulas.js:140`) — a bounded faucet, never gold.

## 6. Server — one board, one migration (the only server work)

Reuses the `scope` discriminator that already added Aréna/Výtah
(`leaderboard-boards-expansion`) and the `hellBestFloor` SCORE_FIELD precedent.

- **`SCORE_FIELDS`** (`packages/shared/src/index.js:16-27`): add `tormentBest`.
  Client attests it in `buildScore` (`net/score.js`) next to `hellBestFloor`.
- **Migration `009_torment.sql`**: `alter table season_scores add column torment_best int not null default 0;` + a new board row (`scope = 'torment'`), sorted by `torment_best` desc, tie-broken by `highest_level`. Mirror `008_leaderboards.sql`.
- **Plausibility bound** (`packages/shared/src/index.js` `checkPlausibility`):
  bound `tormentBest` like a power-normalized claim — a tier `T` is reachable only
  if killing a milestone boss at the attested `highestLevel` with HP ×
  `tormentHpMult(T)` is consistent with attested `peakDps` over `bossTime`:
  ```
  enemyMaxHp(highestLevel) * tormentHpMult(T)  ≤  peakDps * bossTime * slack
  ```
  This is the **same shape** as the World Boss `worldBossWeight`/`peakDps` bound
  (`packages/shared/src/index.js:121-131`) and the Hellevator floor recompute —
  no new trust surface, no new server-authoritative state.
- **Standard board untouched** → Torment players, climbing slower, simply rank as
  they would; the only thing Torment unlocks is the Trýzeň board + a `[T7]`-style
  badge.

## 7. UI surface

- **Torment dial** in the arena (a ☠️/🔥 segmented selector near the boss), gated
  to `>0` only once the player has cleared the first milestone boss normally.
  Setting it is free and instant; it applies from the next spawn.
- **Boss mechanic FX** via `FxManager` + the existing `emit` channel: a shield
  ring (🛡️), a "Doušek!" heal bar with an interrupt prompt, an enrage screen
  flash, a flashing 🎯 weak-point sprite. Reuse the arena/FX wiring the Hellevator
  already shares (`hellevator-architecture`).
- **Trýzeň leaderboard tab** — a `scope:'torment'` board, ranking by tier with a
  `[T{n}]` badge on the row (mirrors the `[TAG]` guild badge).
- **Topbar / boss banner**: show the active tier + a one-line mechanic legend on
  the milestone boss so the mechanic is teachable on first sight.

## 8. Anti-cheat / integrity notes

- **No `dmgPct`, no gold/level mult** (§3 rule 1) → `difficultyScale` and the
  blitz surface are untouched; same guarantee album/runes/mastery/guild/themes
  hold. The HP mult is a self-imposed *handicap*, applied outside the snapshot.
- **`peakDps` stays honest** (§3 rule 3): the boss damage cap discards overflow
  like overkill (`engine.js:130-133`) → recorded `eff` can only go *down* →
  conservative. No nuke-style `_recordDmg` bypass is introduced.
- **Bounded faucets + per-run caps** (`tormentLootThisRun`): Torment can't out-farm
  the existing chest/egg/rune sinks — same cap pattern as `maxChestsPerRun`.
- **Board is power-normalized + server-bounded** from attested `peakDps` +
  `highestLevel` (§6), identical in shape to World Boss / Hellevator. A tampered
  client claiming `tormentBest: 10` with low `peakDps` is rejected by
  `checkPlausibility`.
- **Symmetric within the standard board**: the damage cap changes pace, not rank;
  Torment can only ever lower a player's standard-board position → never an edge.

## 9. Decision touch-point — idle-fast vs textured-slow

There is a genuine product tension: the base loop being *fast* is **correct for an
idle game**; the "hollow" complaint is specifically a **top-end / whale** feeling.
This plan resolves it by making texture **opt-in** (Torment) rather than forcing it
on the idle base loop, and touching the base loop only lightly (mega+ cap + the
always-on 🎯 weak-point). That's the most defensible split and the least
disruptive to the tuned curve.

**Open for you (taste call, not baked in):** should **T0 golden bosses** (every 5)
also get a light damage cap so the moment-to-moment blitz feels less hollow? It's
a one-line change (`capFromVariant: 'gold'`) but it adds real pace to a fresh
1→2400 blitz (~480 golden bosses). v1 says **no** (mega+ only) to protect pace;
flip it if you'd rather bias toward feel over speed.

## 10. Phased roadmap

1. **`torment.js`** data file + `tormentHpMult`/`tormentLoot`/`tormentMechanics`
   (§4). Pure functions, unit-testable, simulator-visible.
2. **Mechanic library + damage cap, T0 baseline** (§5b-5e) — milestone bosses get
   the cap + the always-on 🎯 Slabina. *The "feel" fix is live after this,
   client-only, no dial yet.*
3. **Torment dial + HP/loot curve + per-run caps** (§5a, 5b, 5f) — the opt-in
   escalation; mechanics scale by tier. *Fully playable, client-only.*
4. **Server board** — `009_torment.sql`, `tormentBest` SCORE_FIELD + attest,
   `checkPlausibility` bound, `scope:'torment'` board (§6). *The only server work.*
5. **UI polish** — FX, dial, Trýzeň tab, badge, boss legend (§7).

Phases 1-3 ship the whole single-player experience; 4-5 add the competitive +
cosmetic layer. Each phase is independently shippable.

## 11. Open / deferred

- Magnitudes (§4) are first-draft; tune against `npm run balance` (the cap's
  `minBossDurationMs` and `hpMultPerTier` are the load-bearing dials).
- **Torment-exclusive cosmetics / album entries** (a 🔥-charred Eki skin, a
  Trýzeň title) — the "better loot" hook that stays anti-blitz-safe. Deferred.
- **Per-tier composite board** (`tier × depth` instead of tier-only) for finer
  ranking — deferred; tier-only keeps the §6 plausibility bound trivial.
- **Mechanics on golden bosses / normal enemies** — deferred (pace risk, §9).
- **Guild Torment ladder** (collective best tier, like Výtah) — natural tie-in to
  `guilds-architecture`, deferred to a later phase.
- **A 5th mechanic** (e.g. 🔀 "Záměna" — boss swaps weak element, rewards
  build-flex) — deferred; 4 is enough to prove the loop.
