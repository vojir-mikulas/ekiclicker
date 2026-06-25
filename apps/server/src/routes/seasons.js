/* =========================================================================
   Seasons routa — showcase sezón.
     GET /api/seasons         — seznam sezón + šampion u uzavřených.
     GET /api/seasons/:number — meta sezóny + podium (top 3 dle level žebříčku).
   ========================================================================= */
import { Router } from 'express';
import { boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { listSeasons, getSeasonByNumber, leaderboardTopSeason } from '../lib/players.js';

const router = Router();
const defaultBoard = boardByKey(DEFAULT_BOARD);

/* GET /api/seasons — { seasons: [...] } */
router.get('/', async (_req, res, next) => {
  try {
    const seasons = await listSeasons();
    res.status(200).json({
      seasons: seasons.map((s) => ({
        number: s.number,
        status: s.status,
        startedAt: s.started_at,
        closedAt: s.closed_at,
        champion: s.champion_nickname ? { id: s.champion_id, nickname: s.champion_nickname } : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* GET /api/seasons/:number — { number, status, startedAt, closedAt, podium } */
router.get('/:number', async (req, res, next) => {
  try {
    const n = Number.parseInt(req.params.number, 10);
    const season = Number.isFinite(n) ? await getSeasonByNumber(n) : null;
    if (!season) return res.status(404).json({ error: 'Sezóna nenalezena.', code: 'not_found' });
    const podium = await leaderboardTopSeason(season.id, defaultBoard, 3);
    res.status(200).json({
      number: season.number,
      status: season.status,
      startedAt: season.started_at,
      closedAt: season.closed_at,
      podium,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
