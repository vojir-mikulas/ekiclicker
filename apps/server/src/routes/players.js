/* =========================================================================
   Players routa — GET /api/players/:id (auth VOLITELNÁ).
   Veřejný, read-only profil: jméno, postup + úspěchy PO SEZÓNÁCH, celkové staty,
   trofeje. NIKDY nevrací token ani raw save_blob — úspěchy jsou jen seznam id.
   ========================================================================= */
import { Router } from 'express';
import { boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { optionalPlayer } from '../middleware/auth.js';
import {
  findById, rowToScore, getActiveSeason, getPlayerSeasons, playerSeasonRank, getPlayerTrophies,
} from '../lib/players.js';

const router = Router();
const defaultBoard = boardByKey(DEFAULT_BOARD);

/* GET /api/players/:id — veřejný profil hráče */
router.get('/:id', optionalPlayer, async (req, res, next) => {
  try {
    const player = await findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Hráč nenalezen.', code: 'not_found' });

    const active = await getActiveSeason();
    const seasons = await getPlayerSeasons(player.id);
    // u aktivní sezóny doplň ŽIVÝ rank (odměny ještě nejsou spočtené)
    if (active) {
      const a = seasons.find((s) => s.number === active.number);
      if (a) a.rank = await playerSeasonRank(active.id, player.id, defaultBoard);
    }
    const trophies = await getPlayerTrophies(player.id);

    res.status(200).json({
      id: player.id,
      nickname: player.nickname,
      createdAt: player.created_at,
      rebirths: player.rebirths,
      activeSeason: active ? active.number : null,
      lifetime: { score: rowToScore(player) },
      seasons,
      trophies,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
