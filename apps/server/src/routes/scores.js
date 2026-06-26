/* =========================================================================
   Scores routa — POST /api/scores (auth).
   Sanitizace → throttle → (gate na vstup do sezóny) → věrohodnost vůči SEZÓNNÍMU
   řádku → monotonní zápis do sezóny + lifetime.

   Anti-cheat monotonie je SEZÓNNĚ-RELATIVNÍ (po resetu klient legitimně posílá
   menší čísla). Lifetime sloupce v players jsou GREATEST a nikdy neblokují.
   HMAC podpis (sig) je best-effort: při neshodě jen zalogujeme a pokračujeme.
   ========================================================================= */
import { Router } from 'express';
import { sanitizeScore, checkPlausibility, boardByKey, DEFAULT_BOARD, LIMITS } from '@ekiclicker/shared';
import { requirePlayer } from '../middleware/auth.js';
import { hmacVerify } from '../lib/crypto.js';
import {
  rowToScore, updateScoreMonotonic,
  getActiveSeason, getPlayerSeasonRow, upsertSeasonScore, playerSeasonRank,
} from '../lib/players.js';
import { guildIdOf, maybeRecomputeGuildSeason } from '../lib/guilds.js';

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
    if (secret && !hmacVerify(secret, v.value, req.body?.sig)) {
      console.warn(`[scores] HMAC nesedí pro playerId=${p.id} — pokračuji (best-effort).`);
    }

    const save = Object.prototype.hasOwnProperty.call(req.body, 'save') ? req.body.save : undefined;
    const active = await getActiveSeason();

    // GATE: hráč ještě nevstoupil do aktuální sezóny (začala nová) → ulož jen
    // lifetime + save, NErankuj do nové sezóny a signalizuj klientovi reset.
    if (!active || p.current_season_id !== active.id) {
      await updateScoreMonotonic(p.id, v.value, save);
      return res.status(200).json({ ok: true, seasonChanged: !!active });
    }

    // věrohodnost vůči SEZÓNNÍMU řádku (sezónně-relativní monotonie + rate)
    const seasonRow = await getPlayerSeasonRow(active.id, p.id);
    const prev = seasonRow && seasonRow.last_submit_at
      ? { ...rowToScore(seasonRow), atMs: new Date(seasonRow.last_submit_at).getTime() }
      : null;
    const plaus = checkPlausibility(prev, v.value, Date.now());
    if (!plaus.ok) {
      console.warn(`[scores] věrohodnost zamítnuta playerId=${p.id} reason=${plaus.reason}`);
      return res.status(200).json({ ok: false, reason: plaus.reason });
    }

    // snapshot úspěchů sezóny z klíčů save_blob.achievements (když přišel save)
    const achIds = save && save.achievements && typeof save.achievements === 'object'
      ? Object.keys(save.achievements)
      : undefined;
    await upsertSeasonScore(active.id, p.id, v.value, achIds);
    const updated = await updateScoreMonotonic(p.id, v.value, save);
    const rank = await playerSeasonRank(active.id, p.id, defaultBoard);
    // piggyback: přepočti sezónní postavení cechu hráče (throttled, best-effort —
    // selhání nikdy nesmí shodit zápis skóre)
    try {
      const gid = await guildIdOf(p.id);
      if (gid) await maybeRecomputeGuildSeason(active.id, gid);
    } catch { /* best-effort */ }
    res.status(200).json({ ok: true, rank, score: rowToScore(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
