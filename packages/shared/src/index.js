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
   'defeated' = boss padl (plná odměna) · 'expired' = nestihlo se (útěcha = půlka, min 1 🕊). */
export function worldBossReward(rank, outcome) {
  const base =
    rank === 1 ? { doves: 30, dust: 300 } :
    rank <= 3  ? { doves: 18, dust: 200 } :
    rank <= 10 ? { doves: 12, dust: 150 } :
                 { doves: 6,  dust: 100 };
  if (outcome === 'expired') {
    return { doves: Math.max(1, Math.floor(base.doves / 2)), dust: Math.floor(base.dust / 2) };
  }
  return base;
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
