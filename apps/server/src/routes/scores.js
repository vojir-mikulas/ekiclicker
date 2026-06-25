/* =========================================================================
   Scores routa — POST /api/scores (auth).
   Sanitizace → throttle → věrohodnost (anti-cheat) → monotonní update.
   HMAC podpis (sig) je best-effort: při neshodě jen zalogujeme a pokračujeme.
   ========================================================================= */
import { Router } from 'express';
import { sanitizeScore, checkPlausibility, boardByKey, DEFAULT_BOARD, LIMITS } from '@ekiclicker/shared';
import { requirePlayer } from '../middleware/auth.js';
import { hmacVerify } from '../lib/crypto.js';
import { rowToScore, playerRank, updateScoreMonotonic } from '../lib/players.js';

const router = Router();
const defaultBoard = boardByKey(DEFAULT_BOARD);

/* POST /api/scores — { score, save?, sig? } */
router.post('/', requirePlayer, async (req, res, next) => {
  try {
    const p = req.player;
    const v = sanitizeScore(req.body?.score);
    if (!v.ok) return res.status(400).json({ error: v.error, code: 'score_invalid' });

    // throttle — bez zápisu, ale 200 (klient si to nepamatuje jako chybu)
    if (p.last_submit_at) {
      const elapsed = Date.now() - new Date(p.last_submit_at).getTime();
      if (elapsed < LIMITS.scoreSubmitMinIntervalMs) {
        return res.status(200).json({ ok: true, throttled: true });
      }
    }

    // HMAC ověření (best-effort, NEblokuje) — jen log při neshodě
    const secret = process.env.HMAC_SECRET;
    if (secret) {
      if (!hmacVerify(secret, v.value, req.body?.sig)) {
        console.warn(`[scores] HMAC nesedí pro playerId=${p.id} — pokračuji (best-effort).`);
      }
    }

    // prev = stávající skóre + atMs (čas posledního submitu) nebo null
    const prev = p.last_submit_at
      ? { ...rowToScore(p), atMs: new Date(p.last_submit_at).getTime() }
      : null;

    const plaus = checkPlausibility(prev, v.value, Date.now());
    if (!plaus.ok) {
      console.warn(`[scores] věrohodnost zamítnuta playerId=${p.id} reason=${plaus.reason}`);
      return res.status(200).json({ ok: false, reason: plaus.reason });
    }

    const save = Object.prototype.hasOwnProperty.call(req.body, 'save') ? req.body.save : undefined;
    const updated = await updateScoreMonotonic(p.id, v.value, save);
    const rank = await playerRank(updated.id, defaultBoard);
    res.status(200).json({ ok: true, rank, score: rowToScore(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
