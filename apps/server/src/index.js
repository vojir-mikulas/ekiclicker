/* =========================================================================
   Vstupní bod serveru Eki Clicker.

   Pořadí bootstrapu:
     1) dotenv
     2) init DB (try connect → dbReady)
     3) když dbReady a RUN_MIGRATIONS_ON_BOOT !== 'false' → migrace (awaited)
     4) sestavení Express appky (helmet, compression, json, trust proxy)
     5) /api router (dbGuard 503 když !dbReady)
     6) statika + SPA fallback
     7) listen

   GRACEFUL DEGRADE: i bez DB server naběhne a serveruje hru lokálně;
   /api/* vrací 503 db_unavailable.
   ========================================================================= */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';

import { initDb, isDbReady } from './db.js';
import { runMigrations } from './migrate.js';
import { dbGuard } from './middleware/dbGuard.js';
import { generalLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import scoresRoutes from './routes/scores.js';
import leaderboardRoutes from './routes/leaderboard.js';
import seasonsRoutes from './routes/seasons.js';
import playersRoutes from './routes/players.js';
import worldBossRoutes from './routes/worldboss.js';
import raidsRoutes from './routes/raids.js';
import guildsRoutes, { meGuildRouter } from './routes/guilds.js';
import mailboxRoutes from './routes/mailbox.js';
import eventsRoutes, { initEvents } from './routes/events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3000;

/* ---------- 2) DB ---------- */
await initDb();

/* ---------- 3) migrace ---------- */
if (isDbReady() && process.env.RUN_MIGRATIONS_ON_BOOT !== 'false') {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[boot] migrace selhaly:', err.message);
    process.exit(1);
  }
} else if (!isDbReady()) {
  console.warn('[boot] migrace přeskočeny — DB není dostupná.');
}

/* ---------- 4) Express ---------- */
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY || 1);

// Helmet — CSP vypnuté, protože hra používá inline svg favicon + Google Fonts.
// (Statika běží z jiného originu při dev; v produkci stačí povolit potřebné zdroje.)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '256kb' }));

/* ---------- 5a) SSE kanál ---------- */
// PŘED dbGuardem i limiterem: push funguje i bez DB (verze hry) a long-lived
// spojení nepatří do request limiteru. Express matchuje v pořadí → /api/events
// padne sem, ostatní /api propadne dál na hlavní router.
app.use('/api', eventsRoutes);

/* ---------- 5) /api router ---------- */
const api = express.Router();
api.use(generalLimiter); // obecný strop na všechny /api
api.use(dbGuard); // 503 db_unavailable když !dbReady

// jednoduchý healthcheck (po dbGuard → také 503 bez DB)
api.get('/health', (_req, res) => res.json({ ok: true }));

api.use(authRoutes); // /register /recover /me /me/enter-season
api.use('/scores', scoresRoutes);
api.use('/leaderboard', leaderboardRoutes);
api.use('/seasons', seasonsRoutes);
api.use('/players', playersRoutes);
api.use('/world-boss', worldBossRoutes);
api.use('/raids', raidsRoutes);
api.use('/guilds', guildsRoutes);
api.use('/me/guild', meGuildRouter);
api.use('/mailbox', mailboxRoutes);

app.use('/api', api);

// chybový handler pro /api — jednotná obálka
app.use('/api', (err, _req, res, _next) => {
  console.error('[api] neočekávaná chyba:', err.message);
  res.status(500).json({ error: 'Vnitřní chyba serveru.', code: 'internal_error' });
});

/* ---------- 6) statika + SPA fallback ---------- */
const WEB_DIST = process.env.WEB_DIST || path.resolve(__dirname, '../../web/dist');
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  // catch-all mimo /api → index.html (SPA)
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
  console.log(`[boot] serveruji statiku z ${WEB_DIST}`);
} else {
  console.log(`[boot] WEB_DIST (${WEB_DIST}) neexistuje — statika přeskočena (dev s Vite).`);
}

/* ---------- 6b) SSE init: verze servírovaného webu + hlídání rotace sezóny ---------- */
initEvents({ webDist: WEB_DIST });

/* ---------- 7) listen ---------- */
app.listen(PORT, () => {
  console.log(`[boot] Eki Clicker server běží na http://localhost:${PORT}`);
});
