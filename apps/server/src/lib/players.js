/* =========================================================================
   Datová vrstva pro hráče — mapování řádek<->skóre, rank dotazy,
   monotonní update skóre. Mapuje explicitně camelCase SCORE_FIELDS na
   snake_case sloupce.
   ========================================================================= */
import { SCORE_FIELDS, boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { query } from '../db.js';
import { sha256hex } from './crypto.js';
import { nextIpHistory } from './ip.js';

/* Mapa camelCase pole skóre → snake_case sloupec. */
const FIELD_TO_COLUMN = {
  highestLevel: 'highest_level',
  totalGold: 'total_gold',
  kills: 'kills',
  bossKills: 'boss_kills',
  rebirths: 'rebirths',
  maxCombo: 'max_combo',
  playTimeMs: 'play_time_ms',
  achievements: 'achievements',
  peakDps: 'peak_dps',
};

/* numeric sloupce čteme přes Number() (pg vrací numeric jako string). */
const NUMERIC_FIELDS = new Set(['totalGold', 'peakDps']);

/* Z DB řádku vytáhne objekt skóre se všemi SCORE_FIELDS jako čísla. */
export function rowToScore(row) {
  const score = {};
  for (const f of SCORE_FIELDS) {
    score[f] = Number(row[FIELD_TO_COLUMN[f]]);
  }
  return score;
}

/* Sloupec pro field daného žebříčku. */
function boardColumn(board) {
  return FIELD_TO_COLUMN[board.field];
}

/* Najde hráče podle raw tokenu (hashuje ho). null když není. */
export async function findByToken(token) {
  const { rows } = await query('select * from players where token_hash = $1', [sha256hex(token)]);
  return rows[0] || null;
}

/* Najde hráče podle id. */
export async function findById(id) {
  const { rows } = await query('select * from players where id = $1', [id]);
  return rows[0] || null;
}

/* Rank hráče na daném žebříčku = 1 + počet hráčů s vyšší hodnotou pole.
   Remízy řešíme na úrovni výpisu (created_at ASC); pro samotný rank stačí strict-greater. */
export async function playerRank(playerId, board = boardByKey(DEFAULT_BOARD)) {
  const col = boardColumn(board);
  const { rows } = await query(
    `select 1 + count(*)::int as rank
       from players
      where ${col} > (select ${col} from players where id = $1)`,
    [playerId],
  );
  return rows[0]?.rank ?? null;
}

/* Žebříček: top N hráčů dle pole sestupně, remíza created_at vzestupně. */
export async function leaderboardTop(board, limit) {
  const col = boardColumn(board);
  const { rows } = await query(
    `select * from players order by ${col} desc, created_at asc limit $1`,
    [limit],
  );
  return rows.map((row, i) => ({
    rank: i + 1,
    id: row.id,
    nickname: row.nickname,
    value: rowToScore(row)[board.field],
    score: rowToScore(row),
  }));
}

/* Per-IP denní strop: počet účtů založených z této IP za posledních 24 h. */
export async function countRecentAccountsByIp(ip) {
  const { rows } = await query(
    `select count(*)::int as c
       from players
      where created_ip = $1 and created_at > now() - interval '24 hours'`,
    [ip],
  );
  return rows[0]?.c ?? 0;
}

/* Je nickname_ci obsazené (volitelně kromě daného hráče)? */
export async function isNicknameTaken(nicknameCi, exceptId = null) {
  const { rows } = exceptId
    ? await query('select 1 from players where nickname_ci = $1 and id <> $2 limit 1', [nicknameCi, exceptId])
    : await query('select 1 from players where nickname_ci = $1 limit 1', [nicknameCi]);
  return rows.length > 0;
}

/* Registrace nového hráče. Vrací vložený řádek. */
export async function createPlayer({ tokenHash, nickname, nicknameCi, ip, nowMs }) {
  const seed = JSON.stringify([{ ip, at: new Date(nowMs).toISOString() }]);
  const { rows } = await query(
    `insert into players (token_hash, nickname, nickname_ci, created_ip, last_ip, ip_history)
     values ($1, $2, $3, $4, $4, $5::jsonb)
     returning *`,
    [tokenHash, nickname, nicknameCi, ip, seed],
  );
  return rows[0];
}

/* Aktualizuje last_ip/ip_history, pokud se IP změnila. No-op jinak. */
export async function touchIp(player, ip, nowMs) {
  const { changed, history } = nextIpHistory(player.ip_history, player.last_ip, ip, nowMs);
  if (!changed) return;
  await query('update players set last_ip = $1, ip_history = $2::jsonb where id = $3', [
    ip,
    JSON.stringify(history),
    player.id,
  ]);
}

/* Přejmenování — nastaví nickname, nickname_ci a renamed_at=now(). */
export async function renamePlayer(id, nickname, nicknameCi) {
  const { rows } = await query(
    `update players set nickname = $1, nickname_ci = $2, renamed_at = now(), updated_at = now()
       where id = $3 returning *`,
    [nickname, nicknameCi, id],
  );
  return rows[0];
}

/* Smaže hráče. Vrací true při smazání. */
export async function deletePlayer(id) {
  const { rowCount } = await query('delete from players where id = $1', [id]);
  return rowCount > 0;
}

/* Monotonní update skóre: každý sloupec = GREATEST(stávající, nový).
   Volitelně přepíše save_blob. Nastaví last_submit_at i updated_at na now().
   Vrací aktualizovaný řádek. */
export async function updateScoreMonotonic(id, score, save) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const f of SCORE_FIELDS) {
    const col = FIELD_TO_COLUMN[f];
    sets.push(`${col} = greatest(${col}, $${idx})`);
    params.push(score[f]);
    idx += 1;
  }
  if (save !== undefined) {
    sets.push(`save_blob = $${idx}::jsonb`);
    params.push(JSON.stringify(save));
    idx += 1;
  }
  sets.push('last_submit_at = now()');
  sets.push('updated_at = now()');
  params.push(id);
  const { rows } = await query(
    `update players set ${sets.join(', ')} where id = $${idx} returning *`,
    params,
  );
  return rows[0];
}

/* Vyznam NUMERIC_FIELDS dokumentován výše; export pro případné použití. */
export { NUMERIC_FIELDS, FIELD_TO_COLUMN };
