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

    const entries = await leaderboardTopSeason(season.id, board, limit);
    const out = {
      board: board.key,
      season: { number: season.number, status: season.status },
      entries,
    };

    if (req.player) {
      const rank = await playerSeasonRank(season.id, req.player.id, board);
      if (rank != null) {
        const row = await getPlayerSeasonRow(season.id, req.player.id);
        out.me = { rank, id: req.player.id, nickname: req.player.nickname, value: rowToScore(row)[board.field] };
      }
    }

    res.status(200).json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
