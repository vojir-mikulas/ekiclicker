/* =========================================================================
   Leaderboard routa — GET /api/leaderboard?board=&limit= (auth VOLITELNÁ).
   Když je validní token, přidá i `me` s rankem hráče.
   ========================================================================= */
import { Router } from 'express';
import { boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { optionalPlayer } from '../middleware/auth.js';
import { rowToScore, playerRank, leaderboardTop } from '../lib/players.js';

const router = Router();

function clampLimit(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, n));
}

/* GET /api/leaderboard — { board, entries, me? } */
router.get('/', optionalPlayer, async (req, res, next) => {
  try {
    const board = boardByKey(req.query.board) || boardByKey(DEFAULT_BOARD);
    const limit = clampLimit(req.query.limit);

    const entries = await leaderboardTop(board, limit);

    const out = { board: board.key, entries };

    if (req.player) {
      const rank = await playerRank(req.player.id, board);
      const value = rowToScore(req.player)[board.field];
      out.me = { rank, nickname: req.player.nickname, value };
    }

    res.status(200).json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
