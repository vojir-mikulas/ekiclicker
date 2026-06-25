/* =========================================================================
   Databázová vrstva — Postgres přes pg Pool.

   GRACEFUL DEGRADE: když DATABASE_URL chybí nebo se pool nepřipojí,
   server se NEPOLOŽÍ. dbReady zůstane false, /api/* vrací 503 a hra
   běží v lokálním režimu (serveruje se statika).
   ========================================================================= */
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let dbReady = false;

/* Stav dostupnosti DB — čte ho dbGuard middleware i index.js. */
export function isDbReady() {
  return dbReady;
}

/* Zkusí navázat pool a ověřit spojení jednoduchým dotazem.
   Při úspěchu nastaví dbReady=true. Při chybě jen zaloguje varování. */
export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL není nastaveno — běžím bez DB (lokální režim, /api → 503).');
    return false;
  }
  try {
    pool = new Pool({ connectionString: url });
    // Pool emituje 'error' na nečinných klientech; bez handleru by to shodilo proces.
    pool.on('error', (err) => {
      console.error('[db] chyba nečinného klienta:', err.message);
    });
    await pool.query('select 1');
    dbReady = true;
    console.log('[db] připojeno k Postgresu.');
    return true;
  } catch (err) {
    console.warn(`[db] připojení selhalo (${err.message}) — běžím bez DB (/api → 503).`);
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignoruj chyby při úklidu */
      }
    }
    pool = null;
    dbReady = false;
    return false;
  }
}

/* Jednorázový dotaz nad poolem. */
export function query(text, params) {
  if (!pool) throw new Error('DB pool není inicializovaný.');
  return pool.query(text, params);
}

/* Práce s jedním vyhrazeným klientem (např. pro transakce nebo migrace). */
export async function withClient(fn) {
  if (!pool) throw new Error('DB pool není inicializovaný.');
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/* Transakce — begin/commit/rollback kolem callbacku. */
export async function tx(fn) {
  return withClient(async (client) => {
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      try {
        await client.query('rollback');
      } catch {
        /* ignoruj rollback chybu */
      }
      throw err;
    }
  });
}

/* Korektní uzavření poolu (pro testy / graceful shutdown). */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    dbReady = false;
  }
}
