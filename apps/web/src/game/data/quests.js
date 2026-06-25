/* =========================================================================
   DENNÍ ÚKOLY — lehký retenční loop (důvod vrátit se každý den).
   Každý úkol měří DENNÍ přírůstek nějaké lifetime statistiky. Staty se
   rebirthem NEnulují, takže „dnešní postup" = aktuální hodnota − snapshot
   pořízený na začátku dne (rebirth-proof).
   Výběr úkolů je deterministický ze seedu dne → stejný den dá stejné úkoly
   i po reloadu nebo na jiném zařízení (po obnově účtu).
   Odměny: trvalé Odpuštění 🕊 + balík zlata škálovaný podle příjmu (ať dává
   smysl i v endgame). Splnění VŠECH úkolů dne drží streak → rostoucí bonus.
   ========================================================================= */
import { enemyReward, goldMult } from '../formulas.js';
import { fmt } from '../format.js';

export const QUEST_COUNT = 3; // kolik úkolů denně

export const QUEST_POOL = [
  { id: 'kills',  emoji: '👊', stat: 'kills',       label: (n) => `Zmlať ${fmt(n)} Ekiů`,        targets: [200, 450, 900],    doves: 1 },
  { id: 'bosses', emoji: '🥇', stat: 'bossKills',   label: (n) => `Sejmi ${n} bossů`,            targets: [8, 16, 30],        doves: 2 },
  { id: 'clicks', emoji: '🖱️', stat: 'totalClicks', label: (n) => `Klikni ${fmt(n)}×`,           targets: [400, 900, 1800],   doves: 1 },
  { id: 'lucky',  emoji: '🍀', stat: 'luckyClicks', label: (n) => `Chyť ${n}× Lucky Eki`,        targets: [2, 4, 7],          doves: 1 },
  { id: 'frenzy', emoji: '😡', stat: 'frenzies',    label: (n) => `Spusť ${n}× zuřivost`,        targets: [4, 8, 15],         doves: 1 },
  { id: 'loot',   emoji: '🕊', stat: 'lootDoves',   label: (n) => `Vyraz ${n}× 🕊 z bossů`,      targets: [2, 4, 8],          doves: 2 },
  { id: 'gold',   emoji: '🪙', stat: 'totalGold',   label: (n) => `Vydělej ${fmt(n)} 🪙`,        targets: 'scaled',           doves: 1 },
];

const POOL_BY_ID = Object.fromEntries(QUEST_POOL.map((q) => [q.id, q]));
export const questDef = (id) => POOL_BY_ID[id];

/* ---- deterministický seedovaný RNG z řetězce dne (FNV-1a + mulberry32) ---- */
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Lokální datum jako YYYY-MM-DD (den se počítá podle hráčova času). */
export function dayStr(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/* Předchozí den (pro navazování streaku). */
export function prevDayStr(day) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dayStr(dt.getTime());
}

/* Naroluj denní úkoly pro daný den. Snapshot startů bere ze SOUČASNÉHO stavu,
   streak/lastFullDay přenese z předchozího dne (ten řeší claim). */
export function rollDaily(day, state) {
  const rng = mulberry32(hashStr('eki-daily-' + day));
  const pool = [...QUEST_POOL];
  for (let i = pool.length - 1; i > 0; i--) { // seedovaný Fisher–Yates
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const quests = pool.slice(0, QUEST_COUNT).map((def) => {
    let target;
    if (def.targets === 'scaled') {
      const est = enemyReward(state.level, { hp: 1, gold: 1 }, goldMult(state));
      const mult = [180, 400, 800][Math.floor(rng() * 3)];
      target = Math.max(1000, Math.ceil(est * mult));
    } else {
      target = def.targets[Math.floor(rng() * def.targets.length)];
    }
    return { id: def.id, target, start: state.stats[def.stat] || 0, claimed: false };
  });
  return { day, quests, streak: state.daily?.streak || 0, lastFullDay: state.daily?.lastFullDay || null };
}

/* ---- dotazy nad stavem úkolu ---- */
export const questProgress = (state, q) =>
  Math.max(0, (state.stats[questDef(q.id)?.stat] || 0) - q.start);
export const questDone = (state, q) => questProgress(state, q) >= q.target;
export const questClaimable = (state, q) => !q.claimed && questDone(state, q);
export const claimableCount = (state) =>
  state.daily ? state.daily.quests.filter((q) => questClaimable(state, q)).length : 0;

/* Odměna zlata za splněný úkol — škáluje s příjmem, ať má smysl i v endgame. */
export function questGoldReward(state) {
  return Math.ceil(enemyReward(state.level, { hp: 1, gold: 1 }, goldMult(state)) * 120);
}

/* Bonus 🕊 za dokončení VŠECH úkolů dne — roste se streakem (zastropováno). */
export const streakBonusDoves = (streak) => Math.min(2 + streak, 12);
