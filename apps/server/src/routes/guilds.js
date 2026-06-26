/* =========================================================================
   Cechy (guilds) routa — sociální vrstva: identita (perzistentní) + roster.
     POST   /api/guilds                         — založ cech { name, tag } (auth).
     GET    /api/guilds?limit=                   — žebříček/prohlížeč cechů (public).
     GET    /api/guilds/:id                      — veřejný profil cechu (public).
     GET    /api/me/guild                        — můj cechový stav (auth).
     POST   /api/guilds/:id/invite               — Master/Officer pozve { playerId | nickname } (auth).
     POST   /api/guilds/invites/:inviteId/accept|decline — pozvaný odpoví (auth).
     POST   /api/guilds/:id/request              — hráč ≥ joinLevel požádá o vstup (auth).
     POST   /api/guilds/requests/:inviteId/approve|decline — Officer odpoví (auth).
     POST   /api/guilds/:id/kick                 — { playerId }, role-gated (auth).
     POST   /api/guilds/:id/leave                — odejdi (Master musí přenést) (auth).
     POST   /api/guilds/:id/role                 — Master nastaví { playerId, role } (auth).
     POST   /api/guilds/:id/transfer             — Master → { playerId } nový Mistr (auth).
     POST   /api/guilds/:id/motd                 — Master/Officer nastaví { motd } (auth).
     POST   /api/guilds/:id/donate               — člen přileje { amount } do kasy, server-capped (auth).
     POST   /api/guilds/:id/upgrade              — Mistr koupí { key } vylepšení za kasu (auth).
     DELETE /api/guilds/:id                      — Master rozpustí (auth).

   Identita cechu PŘEŽÍVÁ sezónu (na rozdíl od přepadů/skóre) → žádný season-gate
   na rosteru. Postavení/odměny (Fáze 4–5) gateuje aktivní sezóna stejně jako jinde.
   GET /api/me/guild je samostatná routa mountovaná zvlášť (mimo /api/guilds).
   ========================================================================= */
import { Router } from 'express';
import { requirePlayer, optionalPlayer } from '../middleware/auth.js';
import { clientIp } from '../lib/ip.js';
import {
  createGuild, getGuildView, getMyGuild, guildLeaderboard, findPlayerByNickname,
  invite, respondInvite, request, respondRequest,
  kick, leave, setRole, transferMaster, disband, setMotd,
  donate, buyUpgrade,
} from '../lib/guilds.js';

const router = Router();

/* POST /api/guilds — založ cech. */
router.post('/', requirePlayer, async (req, res, next) => {
  try {
    const result = await createGuild(req.player, req.body || {}, clientIp(req));
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* GET /api/guilds — prohlížeč/žebříček aktivních cechů. */
router.get('/', optionalPlayer, async (req, res, next) => {
  try {
    const guilds = await guildLeaderboard(req.query.limit);
    return res.status(200).json({ ok: true, guilds });
  } catch (err) {
    return next(err);
  }
});

/* GET /api/guilds/:id — veřejný profil cechu. */
router.get('/:id', optionalPlayer, async (req, res, next) => {
  try {
    const result = await getGuildView(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/invite — { playerId } nebo { nickname }. */
router.post('/:id/invite', requirePlayer, async (req, res, next) => {
  try {
    let targetId = String(req.body?.playerId || '');
    if (!targetId && req.body?.nickname) {
      const p = await findPlayerByNickname(req.body.nickname);
      if (!p) return res.status(200).json({ ok: false, reason: 'no_target' });
      targetId = p.id;
    }
    const result = await invite(req.params.id, req.player.id, targetId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/invites/:inviteId/accept | /decline — pozvaný odpoví. */
router.post('/invites/:inviteId/:action', requirePlayer, async (req, res, next) => {
  try {
    const accept = req.params.action === 'accept';
    if (!accept && req.params.action !== 'decline') return res.status(400).json({ ok: false, reason: 'bad_action' });
    const result = await respondInvite(req.params.inviteId, req.player.id, accept);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/request — hráč požádá o vstup. */
router.post('/:id/request', requirePlayer, async (req, res, next) => {
  try {
    const result = await request(req.params.id, req.player);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/requests/:inviteId/approve | /decline — Officer odpoví. */
router.post('/requests/:inviteId/:action', requirePlayer, async (req, res, next) => {
  try {
    const approve = req.params.action === 'approve';
    if (!approve && req.params.action !== 'decline') return res.status(400).json({ ok: false, reason: 'bad_action' });
    const result = await respondRequest(req.params.inviteId, req.player.id, approve);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/kick — { playerId }. */
router.post('/:id/kick', requirePlayer, async (req, res, next) => {
  try {
    const result = await kick(req.params.id, req.player.id, String(req.body?.playerId || ''));
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/leave — odejdi. */
router.post('/:id/leave', requirePlayer, async (req, res, next) => {
  try {
    const result = await leave(req.params.id, req.player.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/role — Master nastaví { playerId, role }. */
router.post('/:id/role', requirePlayer, async (req, res, next) => {
  try {
    const result = await setRole(req.params.id, req.player.id, String(req.body?.playerId || ''), req.body?.role);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/transfer — Master → { playerId }. */
router.post('/:id/transfer', requirePlayer, async (req, res, next) => {
  try {
    const result = await transferMaster(req.params.id, req.player.id, String(req.body?.playerId || ''));
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/motd — Master/Officer nastaví { motd }. */
router.post('/:id/motd', requirePlayer, async (req, res, next) => {
  try {
    const result = await setMotd(req.params.id, req.player.id, req.body?.motd);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/donate — člen přileje { amount } bodů do kasy (server-capped). */
router.post('/:id/donate', requirePlayer, async (req, res, next) => {
  try {
    const result = await donate(req.params.id, req.player, req.body?.amount);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* POST /api/guilds/:id/upgrade — Mistr koupí { key } vylepšení za kasu. */
router.post('/:id/upgrade', requirePlayer, async (req, res, next) => {
  try {
    const result = await buyUpgrade(req.params.id, req.player.id, String(req.body?.key || ''));
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* DELETE /api/guilds/:id — Master rozpustí. */
router.delete('/:id', requirePlayer, async (req, res, next) => {
  try {
    const result = await disband(req.params.id, req.player.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* Samostatná routa pro „můj cech" (mountuje se na /api/me/guild). */
export const meGuildRouter = Router();
meGuildRouter.get('/', requirePlayer, async (req, res, next) => {
  try {
    const result = await getMyGuild(req.player.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

export default router;
