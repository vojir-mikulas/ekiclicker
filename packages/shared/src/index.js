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
  'hellBestFloor',
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
  hellBestFloor: 'Pekelný výtah',
};

/* ---------- definice žebříčků (záložky) ----------
   `scope` rozlišuje ZDROJ řádků (server route podle něj dispatchuje):
     • 'season' (default) — hráči dle sezónního sloupce v season_scores.
     • 'arena'            — hráči dle Elo ratingu v raid_state (server-autoritativní).
     • 'guild'            — CECHY dle kolektivního agregátu v guild_season.
   `valueLabel` = volitelný nadpis hodnotového sloupce (default = label). */
export const LEADERBOARD_BOARDS = [
  { key: 'level', field: 'highestLevel', label: 'Úroveň', scope: 'season' },
  { key: 'gold', field: 'totalGold', label: 'Zlato', scope: 'season' },
  { key: 'rebirths', field: 'rebirths', label: 'Rebirthy', scope: 'season' },
  { key: 'kills', field: 'kills', label: 'Zabití', scope: 'season' },
  { key: 'dps', field: 'peakDps', label: 'Špičkové DPS', scope: 'season' },
  { key: 'arena', field: 'rating', label: 'Aréna', valueLabel: 'Rating', scope: 'arena' },
  { key: 'hell', field: 'hellFloors', label: 'Výtah 🛗', valueLabel: 'Pater', scope: 'guild' },
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
  shieldMs: 1 * 3600_000,        // štít = 1 h imunita (naskočí až po nasčítání ztrát)
  shieldLossThreshold: 3,        // štít naskočí až po 3. vyloupení v okně (ne hned po 1.)
  shieldWindowMs: 60 * 60_000,   // okno, ve kterém se vyloupení sčítají k prahu štítu
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
/* ---------- vulgarismy / nadávky (sdílený filtr pro jména) ----------
   Záměrně malý seznam KOŘENŮ (substring po normalizaci). Normalizace srovná
   diakritiku, leetspeak (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s) a zopakované
   znaky, takže "n3gr", "n e g r", "négřř" apod. taky chytne. Krátké kořeny
   (≤4) se kvůli Scunthorpe efektu matchují jen jako CELÉ slovo. */
export const PROFANITY_ROOTS = [
  'negr', 'nigger', 'nigga', 'cikan', 'zid', 'buzna', 'teplous',
  'pico', 'kurva', 'mrdk', 'mrdat', 'hovno', 'prdel', 'curak', 'cura',
  'kokot', 'debil', 'idiot', 'jebat', 'jeb', 'sracka', 'svine', 'hajzl',
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'retard',
];

const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

/* Normalizuje text pro porovnání s kořeny nadávek. */
function normalizeForProfanity(raw) {
  return String(raw)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // pryč s diakritikou
    .replace(/[013457@$]/g, (c) => LEET_MAP[c] || c)     // leetspeak
    .replace(/[^a-z]+/g, ' ')                            // nech jen písmena, zbytek = mezera
    .replace(/(.)\1+/g, '$1')                            // sraz zopakované znaky (kuuurva→kurva)
    .trim();
}

/* Vrátí true, pokud text obsahuje nadávku. */
export function containsProfanity(raw) {
  if (typeof raw !== 'string') return false;
  const norm = normalizeForProfanity(raw);
  if (!norm) return false;
  const collapsed = norm.replace(/ /g, '');              // dlouhé kořeny: hledej i přes mezery
  // Sraz souvislé řady JEDNOPÍSMENNÝCH tokenů do slova ("n e g r" → "negr"),
  // aby krátké kořeny chytly i prosypané písmenka, ale "zídka" zůstalo slovem.
  const words = norm.split(' ').reduce((acc, w) => {
    if (w.length === 1 && acc.length && acc[acc.length - 1].single) {
      acc[acc.length - 1].text += w;
    } else {
      acc.push({ text: w, single: w.length === 1 });
    }
    return acc;
  }, []).map((t) => t.text);
  for (const root of PROFANITY_ROOTS) {
    if (root.length <= 4) {
      if (words.includes(root)) return true;             // krátké jen jako celé slovo
    } else if (collapsed.includes(root)) {
      return true;
    }
  }
  return false;
}

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
  if (containsProfanity(value)) return { ok: false, error: 'Přezdívka obsahuje nevhodné slovo.' };
  return { ok: true, value };
}

/* ---------- sanitizace skóre ---------- */
/* Vytáhne jen známá číselná pole, převede na konečná nezáporná čísla.
   Vrátí { ok, value, error }. */
export function sanitizeScore(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Chybí data skóre.' };
  const value = {};
  for (const f of SCORE_FIELDS) {
    // Chybějící pole → 0 (forward/backward kompatibilita: starší klient nemusí
    // posílat nově přidané pole; monotonní GREATEST zachová dosavadní hodnotu).
    const raw_f = raw[f];
    const n = (raw_f === undefined || raw_f === null) ? 0 : Number(raw_f);
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

/* =========================================================================
   CECHY (GUILDS) — sociální vrstva: persistentní skupina (jméno + [TAG] + roster)
   se sezónně resetovaným postavením a bounded perky. Filosofie je stejná jako
   u zbytku hry:
     • POSTAVENÍ cechu je VŽDY serverový AGREGÁT z UŽ ATESTOVANÝCH dat členů
       (season_scores.highestLevel/peakDps + světový boss) — NIKDY nové číslo,
       které by klient tvrdil. Cheatovat cech = cheatovat žebříček → žádná díra.
     • PERKY jsou bounded gold/dust/luck a NESOU `dmgPct=0` → mimo difficultyScale,
       takže nemůžou prorazit zeď ani kontaminovat blitz/žebříček (jako album/runy).
     • IDENTITA (guilds, guild_members) přežívá sezónu; POSTAVENÍ (guild_season)
       resetuje — stejný split jako players vs season_scores.
     • Žádný realtime — MOTD + feed (POST+poll), ne živý chat.
   Měnové sinky (zakládací poplatek) jsou KLIENTSKÉ jako celá ekonomika (gold/💠/🕊
   žijí v lokálním save); server gateuje jen ATESTOVANOU úroveň. ======================= */
export const GUILDS = {
  foundLevel: 888,         // gate pro založení (atestovaná highestLevel — odemkne se po DOSAŽENÍ, příznak je trvalý)
  joinLevel: 100,          // gate pro vstup (sjednoceno s Hellevator unlockem)
  foundFeeDust: 500,       // jednorázový sink 💠 při založení (KLIENTSKÝ — lokální ekonomika)
  baseMemberCap: 20,       // základní strop členů (zvyšují perky úrovně cechu)
  perIpDailyGuildCap: 3,   // anti-squatting: max nově založených cechů z jedné IP / 24 h
  maxLevel: 10,            // strop úrovně cechu (= poslední perk tier)
  motdMax: 200,            // délka MOTD
  name: { min: 3, max: 24, reserved: ['admin', 'system', 'eki', 'moderator', 'mod', 'null'] },
  tag: { min: 2, max: 4 },
  feedLimit: 20,           // kolik událostí drží feed (Fáze 6)
};

/* Role v cechu (přesně jeden master). */
export const GUILD_ROLES = ['master', 'officer', 'member'];
export function isGuildRole(r) { return GUILD_ROLES.includes(r); }

/* Perk tiery podle úrovně cechu — bounded gold/dust/luck (ŽÁDNÝ dmgPct) + sloty.
   Aplikuje je KLIENT stejně jako album/mastery; server perk-matiku nevynucuje
   (jsou to plausibility-bounded výstupy mimo difficultyScale). */
export const GUILD_PERK_TIERS = [
  { level: 1,  goldFind: 0.03, dustFind: 0,    luck: 0,    memberSlots: 0 },
  { level: 3,  goldFind: 0.03, dustFind: 0.03, luck: 0,    memberSlots: 0 },
  { level: 5,  goldFind: 0.05, dustFind: 0.03, luck: 0.02, memberSlots: 0 },
  { level: 8,  goldFind: 0.06, dustFind: 0.05, luck: 0.03, memberSlots: 1 },
  { level: 10, goldFind: 0.08, dustFind: 0.06, luck: 0.04, memberSlots: 2 },
];

/* Aktivní perky = nejvyšší tier, jehož `level` cech dosáhl. */
export function guildPerks(level) {
  let p = { goldFind: 0, dustFind: 0, luck: 0, memberSlots: 0 };
  for (const t of GUILD_PERK_TIERS) if ((Number(level) || 1) >= t.level) p = t;
  return { goldFind: p.goldFind, dustFind: p.dustFind, luck: p.luck, memberSlots: p.memberSlots };
}

/* Strop členů = základ + sloty z perků (bounded jako každý raids/boss cap). */
export function guildMemberCap(level) {
  return GUILDS.baseMemberCap + guildPerks(level).memberSlots;
}

/* Práh příspěvku pro úroveň cechu — step funkce (jako reward tiery). Úroveň L
   vyžaduje GUILD_LEVEL_THRESHOLDS[L-1] příspěvku. Vstup do příspěvku je vždy
   bounded (guildContribWeight*), takže prahy jsou kalibrované na AKTIVNÍ roster:
   člen přispěje ~1,5–7 (slabý–whale), strop členů ~22 → plný silný cech se blíží
   úrovni 10 (≈150), smíšený dosáhne 6–8, malá parta 2–4. Záměrně laditelné. */
export const GUILD_LEVEL_THRESHOLDS = [0, 10, 22, 36, 52, 70, 90, 112, 130, 150];
export function guildLevelForContribution(contribution) {
  const c = Math.max(0, Number(contribution) || 0);
  let lvl = 1;
  for (let i = 0; i < GUILD_LEVEL_THRESHOLDS.length; i += 1) {
    if (c >= GUILD_LEVEL_THRESHOLDS[i]) lvl = i + 1;
  }
  return Math.min(GUILDS.maxLevel, lvl);
}

/* Váha člena dle ATESTOVANÉ úrovně — log-bounded (jako worldBossWeight), aby
   jeden whale nezastínil celý aktivní cech. ~lvl 100 → ≈1,0 · 1000 → ≈1,75 · 5000 → ≈2,4. */
export function guildLevelWeight(highestLevel) {
  const l = Math.max(1, Number(highestLevel) || 1);
  return Math.min(3, Math.max(0.3, 0.25 + Math.log10(l + 1) / 2));
}

/* Váha člena dle ATESTOVANÉHO peakDps — sdílí log-bounded tvar se světovým bossem. */
export function guildDpsWeight(peakDps) {
  return worldBossWeight(peakDps);
}

/* Odměna člena za umístění cechu na sezónním žebříčku (snapshot při uzávěrce).
   Bounded 🕊 + 💠 (žádný dmgPct), tvarem jako worldBossReward / season_rewards. */
export function guildSeasonReward(rank) {
  if (rank === 1) return { doves: 40, dust: 400 };
  if (rank <= 3) return { doves: 24, dust: 250 };
  if (rank <= 10) return { doves: 14, dust: 150 };
  if (rank <= 25) return { doves: 6, dust: 80 };
  return { doves: 0, dust: 0 };
}

/* =========================================================================
   CECHOVNÍ POKLADNICE (treasury) + Mistrova VYLEPŠENÍ — „Shakes & Fidget" model:
   členové přilévají do společné kasy, Mistr za ni kupuje bounded perky. Sezónně
   resetované (žije na guild_season). Filosofie shodná se zbytkem cechů:
     • PŘÍSPĚVEK do kasy je serverem CAPNUTÝ denním stropem dle ATESTOVANÉ úrovně
       (donationDailyCap) → klient utratí zlato lokálně (sink jako zakládací poplatek),
       server připíše jen bounded množství. Cheater nepřekročí strop své úrovně.
     • VYLEPŠENÍ = bounded gold/dust/luck/sloty, ŽÁDNÝ dmgPct → mimo difficultyScale,
       stejně jako perky úrovně. Stackují se na perky úrovně (oba bounded).
   ========================================================================= */
export const GUILD_TREASURY = {
  dailyCapBase: 20,        // základ denního stropu příspěvku člena (body kasy)
  dailyCapMax: 120,        // tvrdý strop denního příspěvku (i pro nejvyšší úroveň)
  dailyCapPerDecade: 18,   // přírůstek stropu na řád atestované úrovně (log10)
};

/* Denní strop příspěvku člena do kasy — bounded log-křivkou dle ATESTOVANÉ úrovně
   (jako guildLevelWeight). lvl 100 → ~56 · 1000 → ~74 · 5000 → ~85 · strop 120. */
export function donationDailyCap(highestLevel) {
  const l = Math.max(1, Number(highestLevel) || 1);
  const cap = GUILD_TREASURY.dailyCapBase + GUILD_TREASURY.dailyCapPerDecade * Math.log10(l + 1);
  return Math.min(GUILD_TREASURY.dailyCapMax, Math.round(cap));
}

/* Klientský zlatý sink: kolik ZLATA stojí 1 bod kasy (škáluje s úrovní hráče, ať to
   pozdní hra pořád pocítí jako „přilití peněz"). Bounded denním stropem výš → server
   zlato nikdy nevidí (utrácí se lokálně jako celá ekonomika). Čistě laditelné. */
export function guildDonationGoldPerPoint(level) {
  const l = Math.max(1, Number(level) || 1);
  return Math.max(1, Math.round(50 * (l ** 1.6)));
}

/* Mistrova vylepšení kasy — per-track bounded efekt/úroveň + nákladová křivka (body
   kasy). max úrovně drží celkový perk bounded (viz guildUpgradePerks). */
export const GUILD_UPGRADES = {
  goldFind: { label: 'Zlato',  icon: '🪙', perLevel: 0.02,  max: 5, baseCost: 40, costGrowth: 1.6 },
  dustFind: { label: 'Úlomky', icon: '💠', perLevel: 0.02,  max: 5, baseCost: 50, costGrowth: 1.6 },
  luck:     { label: 'Štěstí', icon: '🍀', perLevel: 0.015, max: 4, baseCost: 60, costGrowth: 1.7 },
  slots:    { label: 'Sloty',  icon: '👥', perLevel: 1,     max: 5, baseCost: 80, costGrowth: 1.8 },
};
export const GUILD_UPGRADE_KEYS = Object.keys(GUILD_UPGRADES);
export function isGuildUpgradeKey(k) { return Object.prototype.hasOwnProperty.call(GUILD_UPGRADES, k); }

/* Cena další úrovně vylepšení (z aktuální úrovně). null = neznámý klíč. */
export function guildUpgradeCost(key, currentLevel) {
  const u = GUILD_UPGRADES[key];
  if (!u) return null;
  return Math.round(u.baseCost * (u.costGrowth ** Math.max(0, Number(currentLevel) || 0)));
}

/* Bounded perky z koupených vylepšení (clamp na max úrovně). Tvar jako guildPerks. */
export function guildUpgradePerks(upgrades) {
  const u = upgrades || {};
  const lvl = (k) => Math.min(GUILD_UPGRADES[k].max, Math.max(0, Number(u[k]) || 0));
  return {
    goldFind: lvl('goldFind') * GUILD_UPGRADES.goldFind.perLevel,
    dustFind: lvl('dustFind') * GUILD_UPGRADES.dustFind.perLevel,
    luck:     lvl('luck')     * GUILD_UPGRADES.luck.perLevel,
    memberSlots: lvl('slots') * GUILD_UPGRADES.slots.perLevel,
  };
}

/* Efektivní perky cechu = perky ÚROVNĚ (atestovaný příspěvek) + perky VYLEPŠENÍ (kasa).
   Oba bounded, žádný dmgPct → engine je promítne přes combatStats/dustMult jako dosud. */
export function combinedGuildPerks(level, upgrades) {
  const base = guildPerks(level);
  const up = guildUpgradePerks(upgrades);
  return {
    goldFind: base.goldFind + up.goldFind,
    dustFind: base.dustFind + up.dustFind,
    luck: base.luck + up.luck,
    memberSlots: base.memberSlots + up.memberSlots,
  };
}

/* Strop členů včetně slotů z vylepšení (bounded jako každý cap). */
export function guildMemberCapWith(level, upgrades) {
  return GUILDS.baseMemberCap + combinedGuildPerks(level, upgrades).memberSlots;
}

/* ---------- jméno / tag cechu (zrcadlí validateNickname) ---------- */
export function validateGuildName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Jméno cechu chybí.' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < GUILDS.name.min) return { ok: false, error: `Jméno musí mít aspoň ${GUILDS.name.min} znaky.` };
  if (value.length > GUILDS.name.max) return { ok: false, error: `Jméno smí mít nejvýš ${GUILDS.name.max} znaků.` };
  if (!/^[\p{L}\p{N} _-]+$/u.test(value)) return { ok: false, error: 'Povolena jsou jen písmena, číslice, mezera, _ a -.' };
  if (GUILDS.name.reserved.includes(value.toLowerCase())) return { ok: false, error: 'Toto jméno je rezervované.' };
  if (containsProfanity(value)) return { ok: false, error: 'Jméno obsahuje nevhodné slovo.' };
  return { ok: true, value };
}

/* TAG: 2–4 znaky, jen písmena/číslice (bez diakritiky), normalizován na VELKÁ. */
export function validateGuildTag(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'TAG chybí.' };
  const value = raw.trim().toUpperCase();
  if (value.length < GUILDS.tag.min || value.length > GUILDS.tag.max) {
    return { ok: false, error: `TAG musí mít ${GUILDS.tag.min}–${GUILDS.tag.max} znaky.` };
  }
  if (!/^[A-Z0-9]+$/.test(value)) return { ok: false, error: 'TAG smí mít jen písmena A–Z a číslice.' };
  if (containsProfanity(value)) return { ok: false, error: 'TAG obsahuje nevhodné slovo.' };
  return { ok: true, value };
}

/* =========================================================================
   SCHRÁNKA (MAIL) — perzistentní asynchronní zprávy mezi hráči + doručení
   pozvánek do cechu jako AKČNÍ zprávy (přijmout/odmítnout). Žádná nová
   důvěryhodná plocha: posílá se jen bounded text (rate-limited), pozvánky
   delegují na guild_invites (stejný atomický vstup jako záložka cechu).
   Identita přežívá sezónu (jako cechy) — schránka se sezónou neresetuje.
   ========================================================================= */
export const MAIL = {
  subjectMax: 60,          // délka předmětu (volitelný)
  bodyMax: 500,            // délka těla zprávy
  inboxCap: 100,           // kolik zpráv schránka drží na příjemce (starší PŘEČTENÉ se prořežou)
  sendWindowMs: 3_600_000, // okno pro rate-limit odesílání (1 h)
  sendPerWindow: 30,       // max odeslaných textovek na odesílatele / okno (anti-spam)
  maxUnreadFromSender: 5,  // anti-flood: max NEPŘEČTENÝCH textovek od jednoho odesílatele u příjemce
  kinds: ['text', 'guild_invite', 'system'],
};

/* Tělo zprávy (povinné, bounded). Vrátí { ok, value, error }. */
export function validateMailBody(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Zpráva chybí.' };
  const value = raw.trim();
  if (value.length < 1) return { ok: false, error: 'Zpráva je prázdná.' };
  if (value.length > MAIL.bodyMax) return { ok: false, error: `Zpráva smí mít nejvýš ${MAIL.bodyMax} znaků.` };
  return { ok: true, value };
}

/* Předmět zprávy (volitelný, bounded). Prázdný = ok s value:''. */
export function validateMailSubject(raw) {
  if (raw == null || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'Neplatný předmět.' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length > MAIL.subjectMax) return { ok: false, error: `Předmět smí mít nejvýš ${MAIL.subjectMax} znaků.` };
  return { ok: true, value };
}
