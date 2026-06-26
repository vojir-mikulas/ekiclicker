/* =========================================================================
   Datová vrstva pro hráče — mapování řádek<->skóre, rank dotazy,
   monotonní update skóre. Mapuje explicitně camelCase SCORE_FIELDS na
   snake_case sloupce.
   ========================================================================= */
import { SCORE_FIELDS, boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { query, tx } from '../db.js';
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
  hellBestFloor: 'hell_best_floor',
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

/* Žebříček: top N hráčů dle pole sestupně, remíza created_at vzestupně.
   `tag` = [TAG] cechu hráče (left join na aktivní cech), nebo null. */
export async function leaderboardTop(board, limit) {
  const col = boardColumn(board);
  const { rows } = await query(
    `select p.*, g.tag as guild_tag
       from players p
       left join guild_members gm on gm.player_id = p.id
       left join guilds g on g.id = gm.guild_id and g.disbanded_at is null
      order by p.${col} desc, p.created_at asc limit $1`,
    [limit],
  );
  return rows.map((row, i) => ({
    rank: i + 1,
    id: row.id,
    nickname: row.nickname,
    tag: row.guild_tag || null,
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

/* Registrace nového hráče. Vrací vložený řádek. currentSeasonId = aktivní sezóna. */
export async function createPlayer({ tokenHash, nickname, nicknameCi, ip, nowMs, currentSeasonId = null }) {
  const seed = JSON.stringify([{ ip, at: new Date(nowMs).toISOString() }]);
  const { rows } = await query(
    `insert into players (token_hash, nickname, nickname_ci, created_ip, last_ip, ip_history, current_season_id)
     values ($1, $2, $3, $4, $4, $5::jsonb, $6)
     returning *`,
    [tokenHash, nickname, nicknameCi, ip, seed, currentSeasonId],
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

/* =========================================================================
   SEZÓNY — aktivní sezóna, sezónní standing (žebříček), odměny, rotace.
   season_scores má STEJNÉ názvy sloupců jako players (highest_level, …), takže
   rowToScore() funguje i na sezónní řádek.
   ========================================================================= */

/* Aktuálně aktivní sezóna, nebo null. */
export async function getActiveSeason() {
  const { rows } = await query(`select * from seasons where status = 'active' order by number desc limit 1`);
  return rows[0] || null;
}

/* Sezóna podle čísla / id. */
export async function getSeasonByNumber(number) {
  const { rows } = await query('select * from seasons where number = $1', [number]);
  return rows[0] || null;
}
export async function getSeasonById(id) {
  if (!id) return null;
  const { rows } = await query('select * from seasons where id = $1', [id]);
  return rows[0] || null;
}

/* Seznam sezón (sestupně) + šampion (rank 1) u uzavřených (z season_rewards). */
export async function listSeasons() {
  const { rows } = await query(
    `select s.id, s.number, s.status, s.started_at, s.closed_at,
            champ.player_id as champion_id, champ.nickname as champion_nickname
       from seasons s
       left join lateral (
         select sr.player_id, p.nickname
           from season_rewards sr
           join players p on p.id = sr.player_id
          where sr.season_id = s.id and sr.rank = 1
          limit 1
       ) champ on true
      order by s.number desc`,
  );
  return rows;
}

/* Sezónní řádek hráče, nebo null. */
export async function getPlayerSeasonRow(seasonId, playerId) {
  const { rows } = await query(
    'select * from season_scores where season_id = $1 and player_id = $2',
    [seasonId, playerId],
  );
  return rows[0] || null;
}

/* Rank hráče v sezóně dle pole; null když hráč nemá v sezóně řádek. */
export async function playerSeasonRank(seasonId, playerId, board = boardByKey(DEFAULT_BOARD)) {
  const col = boardColumn(board);
  const { rows } = await query(
    `with me as (select ${col} as v from season_scores where season_id = $1 and player_id = $2)
     select case when not exists (select 1 from me) then null
            else 1 + (select count(*)::int from season_scores
                       where season_id = $1 and ${col} > (select v from me)) end as rank`,
    [seasonId, playerId],
  );
  return rows[0]?.rank ?? null;
}

/* Žebříček sezóny: top N dle pole sestupně, remíza created_at vzestupně. */
export async function leaderboardTopSeason(seasonId, board, limit) {
  const col = boardColumn(board);
  const { rows } = await query(
    `select ss.*, p.nickname, g.tag as guild_tag
       from season_scores ss
       join players p on p.id = ss.player_id
       left join guild_members gm on gm.player_id = ss.player_id
       left join guilds g on g.id = gm.guild_id and g.disbanded_at is null
      where ss.season_id = $1
      order by ss.${col} desc, ss.created_at asc
      limit $2`,
    [seasonId, limit],
  );
  return rows.map((row, i) => ({
    rank: i + 1,
    id: row.player_id,
    nickname: row.nickname,
    tag: row.guild_tag || null,
    value: rowToScore(row)[board.field],
    score: rowToScore(row),
  }));
}

/* Monotonní upsert sezónního skóre: GREATEST per sloupec, set updated_at/last_submit_at.
   achievementIds (pole id) je volitelný snapshot úspěchů sezóny (přepisuje se
   posledním submitem — v rámci sezóny úspěchy jen přibývají, takže je nejúplnější). */
export async function upsertSeasonScore(seasonId, playerId, score, achievementIds) {
  const cols = SCORE_FIELDS.map((f) => FIELD_TO_COLUMN[f]);
  const params = [seasonId, playerId, ...SCORE_FIELDS.map((f) => score[f])];
  const insertCols = [...cols, 'last_submit_at'];
  const insertVals = [...cols.map((_, i) => `$${i + 3}`), 'now()'];
  const updates = cols.map((c) => `${c} = greatest(season_scores.${c}, excluded.${c})`);
  updates.push('updated_at = now()', 'last_submit_at = now()');

  if (Array.isArray(achievementIds)) {
    params.push(JSON.stringify(achievementIds));
    insertCols.push('achievement_ids');
    insertVals.push(`$${params.length}::jsonb`);
    updates.push('achievement_ids = excluded.achievement_ids');
  }

  const { rows } = await query(
    `insert into season_scores (season_id, player_id, ${insertCols.join(', ')})
     values ($1, $2, ${insertVals.join(', ')})
     on conflict (season_id, player_id) do update set ${updates.join(', ')}
     returning *`,
    params,
  );
  return rows[0];
}

/* Nenárokovaná odměna hráče (souhrn přes nepřevzaté sezóny), bez claimu — pro /me. */
export async function getUnclaimedReward(playerId) {
  const { rows } = await query(
    `select sr.rank, sr.forgiveness, s.number as season_number
       from season_rewards sr
       join seasons s on s.id = sr.season_id
      where sr.player_id = $1 and sr.claimed_at is null
      order by s.number desc`,
    [playerId],
  );
  if (!rows.length) return null;
  const forgiveness = rows.reduce((a, r) => a + r.forgiveness, 0);
  return { forgiveness, rank: rows[0].rank, seasonNumber: rows[0].season_number };
}

/* Postup hráče po sezónách (sestupně) — staty, snapshot úspěchů a finální rank
   (z odměn u uzavřených; u aktivní null, živý rank doplní routa). Pro profil. */
export async function getPlayerSeasons(playerId) {
  const { rows } = await query(
    `select s.number, s.status, sr.rank, ss.*
       from season_scores ss
       join seasons s on s.id = ss.season_id
       left join season_rewards sr on sr.season_id = ss.season_id and sr.player_id = ss.player_id
      where ss.player_id = $1
      order by s.number desc`,
    [playerId],
  );
  return rows.map((r) => ({
    number: r.number,
    status: r.status,
    rank: r.rank ?? null,
    score: rowToScore(r),
    achievements: Array.isArray(r.achievement_ids) ? r.achievement_ids : [],
  }));
}

/* Trofeje hráče (umístění napříč sezónami) — pro profil. */
export async function getPlayerTrophies(playerId) {
  const { rows } = await query(
    `select s.number as season, sr.rank
       from season_rewards sr
       join seasons s on s.id = sr.season_id
      where sr.player_id = $1
      order by s.number desc`,
    [playerId],
  );
  return rows.map((r) => ({ season: r.season, rank: r.rank }));
}

/* Vstup hráče do aktivní sezóny (po resetu): claimni odměny, přepni current_season_id,
   založ čerstvý sezónní řádek. Vrací { reward } (souhrn forgiveness + nejnovější rank). */
export async function enterSeason(playerId, activeSeasonId) {
  return tx(async (client) => {
    const { rows: rewardRows } = await client.query(
      `update season_rewards sr
          set claimed_at = now()
         from seasons s
        where sr.season_id = s.id
          and sr.player_id = $1
          and sr.claimed_at is null
        returning sr.rank, sr.forgiveness, s.number as season_number`,
      [playerId],
    );
    await client.query('update players set current_season_id = $1 where id = $2', [activeSeasonId, playerId]);
    await client.query(
      `insert into season_scores (season_id, player_id) values ($1, $2)
       on conflict (season_id, player_id) do nothing`,
      [activeSeasonId, playerId],
    );
    // nárokuj i nevyzvednuté odměny cechu (placement spočtený při uzávěrce) — idempotentně
    const { rows: guildRows } = await client.query(
      `update guild_member_season set claimed_at = now()
        where player_id = $1 and claimed_at is null
          and (coalesce(reward_doves, 0) > 0 or coalesce(reward_dust, 0) > 0)
        returning reward_doves, reward_dust`,
      [playerId],
    );
    let reward = null;
    if (rewardRows.length) {
      const forgiveness = rewardRows.reduce((a, r) => a + r.forgiveness, 0);
      const latest = rewardRows.reduce((a, b) => (b.season_number > a.season_number ? b : a));
      reward = { forgiveness, rank: latest.rank, seasonNumber: latest.season_number };
    }
    let guildReward = null;
    if (guildRows.length) {
      const doves = guildRows.reduce((a, r) => a + (r.reward_doves || 0), 0);
      const dust = guildRows.reduce((a, r) => a + (r.reward_dust || 0), 0);
      if (doves > 0 || dust > 0) guildReward = { doves, dust };
    }
    return { reward, guildReward };
  });
}

/* Vyznam NUMERIC_FIELDS dokumentován výše; export pro případné použití. */
export { NUMERIC_FIELDS, FIELD_TO_COLUMN };
