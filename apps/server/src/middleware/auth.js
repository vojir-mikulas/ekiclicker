/* =========================================================================
   Autentizace — klient posílá tajný token v Authorization: Bearer <token>.
   Server ho hashuje a hledá hráče dle token_hash.

   requirePlayer  — povinné; bez/neplatný token → 401 unauthorized.
   optionalPlayer — volitelné; bez tokenu jen pokračuje (req.player=null).

   Oba při validním tokenu zapíšou req.player a aktualizují IP (touchIp).
   ========================================================================= */
import { findByToken, touchIp } from '../lib/players.js';
import { clientIp } from '../lib/ip.js';

/* Vytáhne raw token z Authorization hlavičky, nebo null. */
function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Neautorizováno.', code: 'unauthorized' });
}

/* Povinná autentizace. */
export async function requirePlayer(req, res, next) {
  const token = bearerToken(req);
  if (!token) return unauthorized(res);
  try {
    const player = await findByToken(token);
    if (!player) return unauthorized(res);
    req.player = player;
    await touchIp(player, clientIp(req), Date.now());
    next();
  } catch (err) {
    next(err);
  }
}

/* Volitelná autentizace — req.player buď hráč, nebo null. */
export async function optionalPlayer(req, _res, next) {
  const token = bearerToken(req);
  req.player = null;
  if (!token) return next();
  try {
    const player = await findByToken(token);
    if (player) {
      req.player = player;
      await touchIp(player, clientIp(req), Date.now());
    }
    next();
  } catch (err) {
    next(err);
  }
}
