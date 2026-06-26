/* =========================================================================
   Leaderboard routa — GET /api/leaderboard?board=&limit=&season= (auth VOLITELNÁ).
   Bez `season` → aktivní sezóna. S `season=N` → konkrétní (i uzavřená) sezóna.
   Když je validní token a hráč v sezóně soutěží, přidá i `me` s rankem.
   ========================================================================= */
import { Router } from 'express';
import { boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { optionalPlayer } from '../middleware/auth.js';
import {
  rowToScore, getActiveSeason, getSeasonByNumber,
  leaderboardTopSeason, playerSeasonRank, getPlayerSeasonRow,
} from '../lib/players.js';
import { arenaLeaderboardSeason, playerArenaRank } from '../lib/raids.js';
import {
  guildHellLeaderboardSeason, playerGuildHellRank,
  guildIdOf, maybeRecomputeGuildSeason,
} from '../lib/guilds.js';

const router = Router();

function clampLimit(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, n));
}

/* GET /api/leaderboard — { board, season, entries, me? } */
router.get('/', optionalPlayer, async (req, res, next) => {
  try {
    const board = boardByKey(req.query.board) || boardByKey(DEFAULT_BOARD);
    const limit = clampLimit(req.query.limit);

    let season;
    if (req.query.season != null && req.query.season !== '') {
      const n = Number.parseInt(req.query.season, 10);
      season = Number.isFinite(n) ? await getSeasonByNumber(n) : null;
    } else {
      season = await getActiveSeason();
    }
    if (!season) {
      return res.status(200).json({ board: board.key, season: null, entries: [] });
    }

    // dispatch dle scope žebříčku: 'arena' (raid_state), 'guild' (guild_season),
    // jinak default 'season' (season_scores). Tvar výstupu je sjednocený.
    const scope = board.scope || 'season';
    const out = {
      board: board.key,
      season: { number: season.number, status: season.status },
      entries: [],
    };

    if (scope === 'arena') {
      out.entries = await arenaLeaderboardSeason(season.id, limit);
      if (req.player) {
        const me = await playerArenaRank(season.id, req.player.id);
        if (me) out.me = { ...me, id: req.player.id, nickname: req.player.nickname };
      }
    } else if (scope === 'guild') {
      // self-heal: hell_floors je CACHE (součet hell_best_floor členů), kterou plní jen
      // throttled „compute on access" přepočet. Když členové zleniví, opportunistické
      // triggery (submit/guild-view) cech minou a žebříček zůstane zastaralý. Otevření
      // žebříčku tak vlastní cech prohlížejícího hráče dorovná (throttled, best-effort).
      if (req.player && season.status === 'active') {
        try {
          const gid = await guildIdOf(req.player.id);
          if (gid) await maybeRecomputeGuildSeason(season.id, gid);
        } catch { /* best-effort */ }
      }
      out.entries = await guildHellLeaderboardSeason(season.id, limit);
      if (req.player) {
        const me = await playerGuildHellRank(season.id, req.player.id);
        if (me) out.me = me; // me.id = cech, me.nickname = jméno cechu
      }
    } else {
      out.entries = await leaderboardTopSeason(season.id, board, limit);
      if (req.player) {
        const rank = await playerSeasonRank(season.id, req.player.id, board);
        if (rank != null) {
          const row = await getPlayerSeasonRow(season.id, req.player.id);
          out.me = { rank, id: req.player.id, nickname: req.player.nickname, value: rowToScore(row)[board.field] };
        }
      }
    }

    res.status(200).json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
