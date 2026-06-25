/* =========================================================================
   Rate limiting (express-rate-limit).
   - generalLimiter: obecný strop na /api (default 120 req/min/IP).
   - authLimiter: přísnější na register/recover (default 10/min/IP).
   Limity jsou laditelné přes env; výchozí hodnoty jsou rozumné.
   ========================================================================= */
import { rateLimit } from 'express-rate-limit';

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const WINDOW_MS = intEnv('RATE_WINDOW_MS', 60_000);

/* Jednotná chybová obálka pro překročení limitu. */
function limitHandler(_req, res) {
  res.status(429).json({ error: 'Příliš mnoho požadavků, zkus to za chvíli.', code: 'rate_limited' });
}

export const generalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: intEnv('RATE_GENERAL_MAX', 120),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: intEnv('RATE_AUTH_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});
