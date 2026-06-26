/* =========================================================================
   Schránka (mailbox) routa — perzistentní asynchronní zprávy mezi hráči.
     GET    /api/mailbox                      — moje schránka { messages, unread } (auth).
     POST   /api/mailbox                      — pošli { nickname | recipientId, subject?, body } (auth).
     POST   /api/mailbox/ack                  — označ vše přečtené (shodí odznak) (auth).
     POST   /api/mailbox/:id/read             — označ jednu zprávu přečtenou (auth).
     POST   /api/mailbox/:id/accept|decline   — odpověz na cechovní pozvánku (auth).
     DELETE /api/mailbox/:id                  — smaž zprávu (auth).

   Identita schránky PŘEŽÍVÁ sezónu (jako cechy) → žádný season-gate. Pozvánky
   delegují na lib/guilds (tentýž atomický vstup jako záložka cechu).
   ========================================================================= */
import { Router } from 'express';
import { requirePlayer } from '../middleware/auth.js';
import { getInbox, send, markRead, ackAll, respond, remove } from '../lib/mailbox.js';

const router = Router();

/* GET /api/mailbox — moje schránka. */
router.get('/', requirePlayer, async (req, res, next) => {
  try {
    return res.status(200).json(await getInbox(req.player.id));
  } catch (err) {
    return next(err);
  }
});

/* POST /api/mailbox — pošli textovou zprávu { nickname | recipientId, subject?, body }. */
router.post('/', requirePlayer, async (req, res, next) => {
  try {
    const result = await send(req.player, req.body || {});
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/mailbox/ack — označ vše přečtené. */
router.post('/ack', requirePlayer, async (req, res, next) => {
  try {
    return res.status(200).json(await ackAll(req.player.id));
  } catch (err) {
    return next(err);
  }
});

/* POST /api/mailbox/:id/read — označ jednu zprávu přečtenou. */
router.post('/:id/read', requirePlayer, async (req, res, next) => {
  try {
    return res.status(200).json(await markRead(req.player.id, req.params.id));
  } catch (err) {
    return next(err);
  }
});

/* POST /api/mailbox/:id/accept | /decline — odpověz na cechovní pozvánku. */
router.post('/:id/:action', requirePlayer, async (req, res, next) => {
  try {
    const accept = req.params.action === 'accept';
    if (!accept && req.params.action !== 'decline') return res.status(400).json({ ok: false, reason: 'bad_action' });
    const result = await respond(req.player.id, req.params.id, accept);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* DELETE /api/mailbox/:id — smaž zprávu. */
router.delete('/:id', requirePlayer, async (req, res, next) => {
  try {
    return res.status(200).json(await remove(req.player.id, req.params.id));
  } catch (err) {
    return next(err);
  }
});

export default router;
