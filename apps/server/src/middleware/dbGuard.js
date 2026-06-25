/* =========================================================================
   dbGuard — když DB není dostupná, /api/* vrací 503 db_unavailable.
   Montuje se jako první middleware na /api routeru.
   ========================================================================= */
import { isDbReady } from '../db.js';

export function dbGuard(_req, res, next) {
  if (!isDbReady()) {
    return res.status(503).json({ error: 'Databáze je nedostupná.', code: 'db_unavailable' });
  }
  next();
}
