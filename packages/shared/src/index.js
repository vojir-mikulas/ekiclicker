/* =========================================================================
   SHARED CONTRACT — sdílené mezi klientem (apps/web) a serverem (apps/server).
   Žádné DOM, žádný React, žádný Node-specifický kód → importovatelné z obou.

   Drží na JEDNOM místě:
     - tvar skóre payloadu (co klient posílá na /api/scores),
     - pravidla pro přezdívku,
     - meze věrohodnosti (anti-cheat) + monotonii,
     - definici žebříčků,
     - limity proti spamu.
   ========================================================================= */

/* ---------- pole skóre (číselné staty, které synchronizujeme) ---------- */
/* Všechna jsou NEKLESAJÍCÍ (kumulativní staty rostou; highestLevel/peakDps/…
   jsou maxima). Server proto odmítne jakýkoli pokles. */
export const SCORE_FIELDS = [
  'highestLevel',
  'totalGold',
  'kills',
  'bossKills',
  'rebirths',
  'maxCombo',
  'playTimeMs',
  'achievements',
  'peakDps',
];

/* Lidsky čitelné popisky (UI). */
export const SCORE_LABELS = {
  highestLevel: 'Úroveň',
  totalGold: 'Zlato',
  kills: 'Zabití',
  bossKills: 'Bossové',
  rebirths: 'Rebirthy',
  maxCombo: 'Combo',
  playTimeMs: 'Čas hraní',
  achievements: 'Úspěchy',
  peakDps: 'Špičkové DPS',
};

/* ---------- definice žebříčků (záložky) ---------- */
export const LEADERBOARD_BOARDS = [
  { key: 'level', field: 'highestLevel', label: 'Úroveň' },
  { key: 'gold', field: 'totalGold', label: 'Zlato' },
  { key: 'rebirths', field: 'rebirths', label: 'Rebirthy' },
  { key: 'kills', field: 'kills', label: 'Zabití' },
  { key: 'dps', field: 'peakDps', label: 'Špičkové DPS' },
];

export const DEFAULT_BOARD = 'level';

export function boardByKey(key) {
  return LEADERBOARD_BOARDS.find((b) => b.key === key) || null;
}

/* ---------- limity proti spamu ---------- */
export const LIMITS = {
  perIpDailyAccountCap: 20, // max nových účtů z jedné IP za 24 h
  scoreSubmitMinIntervalMs: 10_000, // server přijme skóre nejvýš ~1×/10 s
  renameMinIntervalMs: 60 * 60 * 1000, // přejmenování max 1×/h
};

/* ---------- meze věrohodnosti (anti-cheat) ----------
   Záměrně ŠTĚDRÉ — nechytají hraniční hráče, jen absurdní podvrhy
   (úroveň 10^9 za minutu apod.). Engine má tickMs=100 (≤10 auto-zabití/s)
   + manuální kliky → reálný strop ~25 úrovní/s; bereme 2–4× rezervu. */
export const PLAUSIBILITY = {
  maxLevelsPerSec: 50,
  maxKillsPerSec: 60,
  baseLevelBuffer: 1000, // pokrývá headstart skoky a krátké bursty
  baseKillsBuffer: 2000,
  playTimeSlack: 2, // playTime delta ≤ wallclock × slack (+ základ)
  playTimeBaseMs: 15_000,
};

/* =========================================================================
   SVĚTOVÝ BOSS — sezónní kooperativní boss (asynchronní). Sdíleno klientem i
   serverem. Filosofie je stejná jako u zbytku hry:
     • žádný nový exponenciál — příspěvek je BOUNDED zlomek HP bosse, jen mírně
       škálovaný tvým ATESTOVANÝM peakDps. Anti-cheat je tím zadarmo: falešné
       peakDps musí nejdřív projít stejným plausibility filtrem jako žebříček,
       a i pak váha roste jen logaritmicky (strop ×3).
     • odměny jsou bounded (🕊 + 💠) — nic nenásobí poškození ani obtížnost.
     • lokálně-first: server drží JEDINÉ sdílené HP, klient jen polluje a posílá
       „údery" (POST + poll jako žebříček — žádné WebSockety, žádná realtime vrstva).
   ========================================================================= */
export const WORLD_BOSS = {
  baseHp: 1_000_000,            // sdílený HP pool (jednotky = „body bosse", zobrazí se jako proužek)
  durationMs: 48 * 3600_000,    // jak dlouho boss žije, než vyprší (deadline pro komunitu)
  respawnDelayMs: 60 * 60_000,  // pauza po konci (vítězná/únikem obrazovka), než naskočí další
  salvoCooldownMs: 60_000,      // jeden úder / minuta / hráč (server vynucuje přes last_hit_at)
  salvoFrac: 0.004,             // základ: 0,4 % HP za úder (× váha hráče)
  perPlayerCapFrac: 0.34,       // jeden hráč ubere nejvýš 34 % HP → drží to kooperativní (min ~3 hráči na kill)
  fighterWindowMs: 5 * 60_000,  // „právě bojuje" = přispěl za posledních 5 min
  minDps: 50,                   // podlaha peakDps pro výpočet váhy (i nováček smysluplně přispěje)
};

/* Jména bossů (deterministicky podle pořadí bosse). Server uloží jméno/emoji při
   spawnu (z tohoto pole), klient je jen zobrazuje. */
export const WORLD_BOSS_NAMES = [
  { name: 'Eki Ascendant', emoji: '🦁' },
  { name: 'Eki Bubble Bubble', emoji: '🫧' },
  { name: 'Eki Chad', emoji: '🗿' },
  { name: 'Eki Fire asf', emoji: '🔥' },
  { name: 'Eki Deep', emoji: '🦑' },
];
export function worldBossName(number) {
  const len = WORLD_BOSS_NAMES.length;
  return WORLD_BOSS_NAMES[(((number - 1) % len) + len) % len];
}

/* Váha hráče z atestovaného peakDps — BOUNDED (0,5×–3×), aby whale neudělal
   řádově víc než nováček. Logaritmická škála: ~1e2 → ≈0,9 · 1e6 → 2,0 · ≥1e10 → 3,0. */
export function worldBossWeight(peakDps) {
  const d = Math.max(WORLD_BOSS.minDps, Number(peakDps) || 0);
  return Math.min(3, Math.max(0.5, 0.5 + Math.log10(d + 10) / 4));
}

/* Poškození JEDNOHO úderu = zlomek HP bosse × váha hráče. Vrací celé „body".
   Strop a podlaha drží příspěvky řádově srovnatelné napříč hráči. */
export function worldBossSalvoDamage(maxHp, peakDps) {
  return Math.max(1, Math.ceil(maxHp * WORLD_BOSS.salvoFrac * worldBossWeight(peakDps)));
}

/* Odměna za účast podle umístění (rank dle příspěvku) a výsledku.
   'defeated' = boss padl (plná odměna) · 'expired' = nestihlo se (útěcha = půlka, min 1 🕊).
   `chests` = počet „Dračích truhel" 🐉 (exkluzivní bedna jen ze Světového bosse — uvnitř
   sada Drakobijec, nejlepší kořist ve hře). Top přispěvatelé dostanou víc; i poslední
   v pořadí (a i když boss utekl) dostane aspoň jednu → účast se VŽDY vyplatí. */
export function worldBossReward(rank, outcome) {
  const base =
    rank === 1 ? { doves: 30, dust: 300, chests: 4 } :
    rank <= 3  ? { doves: 18, dust: 200, chests: 3 } :
    rank <= 10 ? { doves: 12, dust: 150, chests: 2 } :
                 { doves: 6,  dust: 100, chests: 1 };
  if (outcome === 'expired') {
    return {
      doves: Math.max(1, Math.floor(base.doves / 2)),
      dust: Math.floor(base.dust / 2),
      chests: Math.max(1, Math.floor(base.chests / 2)),
    };
  }
  return base;
}

/* =========================================================================
   PŘEPAD / ARÉNA — asynchronní PvP nájezdy. Zaútočíš na DUCHA offline hráče
   (jeho atestovaný sezónní snímek) a když vyhraješ, ukradneš mu LUP z trezoru.
   Filosofie je stejná jako u zbytku hry:
     • Výsledek počítá SERVER z ATESTOVANÉHO peakDps (+ úroveň) + taktiky + hodu
       → klient nikdy netvrdí „vyhrál jsem". Cheatovat přepad = cheatovat žebříček
       (stejný plausibility filtr) → žádná nová díra pro cheaty.
     • Krade se jen z TREZORU (server-authoritative), NE z lokálního save — proto
       krádež „drží" i když je oběť offline a její klient nemůže nic přepsat.
     • Trezor je WITHDRAW-ONLY: plní se serverem (skim zlata z atestovaného postupu
       + uloupený lup), klient ho jen VYBÍRÁ do bezpečí. Žádný „deposit" → nejde
       prát falešné zlato přes trezor.
     • Lup je BOUNDED (zlomek trezoru + strop). Zlato je hlavní (běžné, regeneruje),
       🕊/💠 jsou vzácný jackpot. Nic nenásobí poškození ani obtížnost.
   ========================================================================= */
export const RAIDS = {
  ratingStart: 1000,
  kFactor: 32,
  minPower: 50,                  // podlaha bojové síly (i nováček má nenulovou)
  tacticEdge: 0.25,              // protitah dá ±25 % efektivní síly útočníka
  winClampMin: 0.06,             // i favorit občas padne
  winClampMax: 0.94,             // i outsider občas vyhraje
  matchPoolSize: 12,             // zvaž N nejbližších dle peakDps, vyber náhodně
  lootGoldFrac: 0.20,            // ukradne až 20 % zlata z trezoru oběti
  lootDovesFrac: 0.34,           // až 34 % 🕊 (vzácnější jackpot)
  lootDustFrac: 0.25,            // až 25 % 💠
  vaultGoldSeconds: 150,         // strop ukradnutelného zlata ≈ peakDps × 150 (cross-tier cap)
  depositIntervalMs: 30 * 60_000, // jak často se strhne „daň" z účtu do trezoru (server-gated)
  depositGoldFrac: 0.12,          // 12 % zlata z účtu → trezor (tvé REÁLNÉ peníze v sázce)
  depositDovesFrac: 0.08,         // 8 % 🕊
  depositDustFrac: 0.10,          // 10 % 💠
  depositDovesCap: 40,            // strop 🕊 za jednu daň (anti-abuse vzácné měny)
  depositDustCap: 500,            // strop 💠 za jednu daň
  withdrawCooldownMs: 3 * 3600_000, // výběr trezoru jen 1× za 3 h → lup leží odhalený = intenzita
  winBonusDust: 12,              // ražený bonus k výhře (💠), ať přepad vždy potěší
  streakDoveEvery: 4,            // každá 4. výhra v sérii → +1 🕊 ražený bonus
  raidCooldownMs: 90_000,        // min. prodleva mezi tvými přepady
  targetCooldownMs: 45 * 60_000, // stejnou oběť nemůžeš hned zas (anti-farma)
  shieldMs: 8 * 3600_000,        // po vyloupení 8 h imunita
  newbieShieldLevel: 60,         // hráče pod touto úrovní nelze přepadnout (ani útočit)
  dailyRaidCap: 30,              // max. přepadů za den
};

/* Tři taktiky (kámen-nůžky-papír). beats = koho poráží. */
export const RAID_TACTICS = [
  { id: 'utok', label: 'Útok', emoji: '⚔️', beats: 'lest' },
  { id: 'lest', label: 'Lest', emoji: '🎭', beats: 'obrana' },
  { id: 'obrana', label: 'Obrana', emoji: '🛡️', beats: 'utok' },
];
export const RAID_TACTIC_IDS = RAID_TACTICS.map((t) => t.id);
export function isRaidTactic(id) { return RAID_TACTIC_IDS.includes(id); }
export const DEFAULT_DEFENSE_TACTIC = 'obrana';

/* Výsledek taktického střetu z pohledu útočníka: 'win' (útočník protitáhl),
   'lose' (obránce protitáhl), 'tie' (stejná taktika). */
export function tacticOutcome(attacker, defender) {
  if (!isRaidTactic(attacker) || !isRaidTactic(defender) || attacker === defender) return 'tie';
  const a = RAID_TACTICS.find((t) => t.id === attacker);
  return a && a.beats === defender ? 'win' : 'lose';
}

/* Bojová síla z atestovaných statů. Dominuje peakDps, úroveň jen jemně.
   (Matchmaking páruje podle peakDps, takže poměr sil je u soupeřů blízko 1 →
   o výsledku pak rozhoduje hlavně taktika + hod → napětí.) */
export function raidPower(score) {
  const dps = Math.max(RAIDS.minPower, Number(score?.peakDps) || 0);
  const lvl = Math.max(1, Number(score?.highestLevel) || 1);
  return dps * (1 + Math.log10(lvl + 1) / 10);
}

/* Efektivní síla útočníka po taktickém protitahu (celý ±swing nese útočník). */
export function raidEffectivePower(power, outcome) {
  if (outcome === 'win') return power * (1 + RAIDS.tacticEdge);
  if (outcome === 'lose') return power * (1 - RAIDS.tacticEdge);
  return power;
}

/* Pravděpodobnost výhry útočníka z efektivních sil. Proporční poměr, ořezaný
   do [min,max], aby šlo o napětí a ne o jistotu. */
export function raidWinProb(attackerPower, defenderPower) {
  const a = Math.max(1, attackerPower);
  const d = Math.max(1, defenderPower);
  return Math.min(RAIDS.winClampMax, Math.max(RAIDS.winClampMin, a / (a + d)));
}

/* Cíl (a strop) zlata v trezoru — škáluje s atestovaným peakDps. */
export function raidVaultGoldTarget(peakDps) {
  return Math.max(0, Math.max(RAIDS.minPower, Number(peakDps) || 0) * RAIDS.vaultGoldSeconds);
}

/* „Daň do trezoru": kolik se hráči strhne z ÚČTU (gold/🕊/💠) do trezoru při jedné
   dani. Zlomek aktuálního zůstatku, vzácné měny stropované (anti-abuse). Klient
   tyhle částky reálně odečte z lokálního save → tvé peníze jsou fakt v sázce. */
export function raidDepositTake(balances) {
  const b = balances || {};
  const gold = Math.floor(Math.max(0, Number(b.gold) || 0) * RAIDS.depositGoldFrac);
  const doves = Math.min(RAIDS.depositDovesCap, Math.floor(Math.max(0, Number(b.doves) || 0) * RAIDS.depositDovesFrac));
  const dust = Math.min(RAIDS.depositDustCap, Math.floor(Math.max(0, Number(b.dust) || 0) * RAIDS.depositDustFrac));
  return { gold: Math.max(0, gold), doves: Math.max(0, doves), dust: Math.max(0, dust) };
}

/* Kolik se ukradne z trezoru oběti (REDISTRIBUCE, žádná ražba). attackerPeakDps
   stropuje zlato proti cross-tier (nevezmeš víc zlata, než je 20 % tvého cíle). */
export function raidStolenLoot(defenderVault, attackerPeakDps) {
  const v = defenderVault || {};
  const goldCap = Math.floor(raidVaultGoldTarget(attackerPeakDps) * RAIDS.lootGoldFrac);
  const gold = Math.min(Math.floor((Number(v.gold) || 0) * RAIDS.lootGoldFrac), goldCap);
  const doves = Math.floor((Number(v.doves) || 0) * RAIDS.lootDovesFrac);
  const dust = Math.floor((Number(v.dust) || 0) * RAIDS.lootDustFrac);
  return { gold: Math.max(0, gold), doves: Math.max(0, doves), dust: Math.max(0, dust) };
}

/* Ražený bonus k výhře (ať i přepad chudého terče potěší). Hlavně 💠 + občas 🕊
   na sérii. Bounded — vzácná měna se nenafoukne. */
export function raidWinBonus(streakAfterWin) {
  const doves = streakAfterWin > 0 && streakAfterWin % RAIDS.streakDoveEvery === 0 ? 1 : 0;
  return { gold: 0, doves, dust: RAIDS.winBonusDust };
}

/* Elo: změna ratingu útočníka (celé číslo). Obránce dostane opačnou. */
export function raidRatingDelta(attackerRating, defenderRating, attackerWon) {
  const expected = 1 / (1 + 10 ** ((defenderRating - attackerRating) / 400));
  return Math.round(RAIDS.kFactor * ((attackerWon ? 1 : 0) - expected));
}

/* ---------- přezdívka ---------- */
export const NICKNAME = {
  min: 2,
  max: 20,
  reserved: ['admin', 'administrator', 'root', 'system', 'null', 'undefined', 'eki', 'moderator', 'mod'],
};

/* Vrátí { ok, value, error }. value = normalizovaná přezdívka (trim + sjednocené mezery). */
export function validateNickname(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Přezdívka chybí.' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < NICKNAME.min) return { ok: false, error: `Přezdívka musí mít aspoň ${NICKNAME.min} znaky.` };
  if (value.length > NICKNAME.max) return { ok: false, error: `Přezdívka smí mít nejvýš ${NICKNAME.max} znaků.` };
  // písmena (vč. diakritiky), číslice, mezera, _ a -
  if (!/^[\p{L}\p{N} _-]+$/u.test(value)) return { ok: false, error: 'Povolena jsou jen písmena, číslice, mezera, _ a -.' };
  if (NICKNAME.reserved.includes(value.toLowerCase())) return { ok: false, error: 'Tato přezdívka je rezervovaná.' };
  return { ok: true, value };
}

/* ---------- sanitizace skóre ---------- */
/* Vytáhne jen známá číselná pole, převede na konečná nezáporná čísla.
   Vrátí { ok, value, error }. */
export function sanitizeScore(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Chybí data skóre.' };
  const value = {};
  for (const f of SCORE_FIELDS) {
    const n = Number(raw[f]);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `Neplatná hodnota: ${f}.` };
    value[f] = n;
  }
  return { ok: true, value };
}

/* ---------- věrohodnost / monotonie ----------
   prev: předchozí uložené skóre + { atMs } (čas posledního submitu) nebo null.
   next: nově sanitizované skóre.
   nowMs: aktuální čas serveru.
   Vrátí { ok, reason }. */
export function checkPlausibility(prev, next, nowMs) {
  // monotonie — nic neklesá
  if (prev) {
    for (const f of SCORE_FIELDS) {
      if (next[f] < (prev[f] ?? 0)) return { ok: false, reason: `decrease:${f}` };
    }
  }

  const P = PLAUSIBILITY;

  if (prev && prev.atMs) {
    const wallMs = Math.max(1, nowMs - prev.atMs);
    const wallSec = wallMs / 1000;
    const dLevel = next.highestLevel - (prev.highestLevel ?? 0);
    if (dLevel > wallSec * P.maxLevelsPerSec + P.baseLevelBuffer) return { ok: false, reason: 'rate:level' };
    const dKills = next.kills - (prev.kills ?? 0);
    if (dKills > wallSec * P.maxKillsPerSec + P.baseKillsBuffer) return { ok: false, reason: 'rate:kills' };
    const dPlay = next.playTimeMs - (prev.playTimeMs ?? 0);
    if (dPlay > wallMs * P.playTimeSlack + P.playTimeBaseMs) return { ok: false, reason: 'rate:playtime' };
  } else {
    // první submit — absolutní meze proti času hraní
    const playSec = next.playTimeMs / 1000;
    if (next.highestLevel > playSec * P.maxLevelsPerSec + P.baseLevelBuffer) return { ok: false, reason: 'abs:level' };
    if (next.kills > playSec * P.maxKillsPerSec + P.baseKillsBuffer) return { ok: false, reason: 'abs:kills' };
  }

  return { ok: true };
}
