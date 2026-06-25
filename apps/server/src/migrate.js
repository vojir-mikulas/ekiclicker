/* =========================================================================
   Spouštěč migrací.

   - Plain .sql soubory v apps/server/migrations/, aplikované v pořadí názvů.
   - Eviduje se v schema_migrations(filename, applied_at); už aplikované přeskakuje.
   - Voláno z index.js při bootu (když je DB) i samostatně: `node src/migrate.js`.
   ========================================================================= */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withClient, initDb, closeDb, isDbReady } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

/* Aplikuje všechny dosud neaplikované .sql migrace. Idempotentní. */
export async function runMigrations() {
  await withClient(async (client) => {
    // evidenční tabulka, pokud ještě není
    await client.query(
      `create table if not exists schema_migrations (
         filename text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    const { rows } = await client.query('select filename from schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let files;
    try {
      files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    } catch {
      console.warn('[migrate] složka migrations neexistuje — nic k aplikaci.');
      return;
    }

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      // každou migraci v transakci → buď celá, nebo nic
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
        count += 1;
        console.log(`[migrate] aplikováno: ${file}`);
      } catch (err) {
        try {
          await client.query('rollback');
        } catch {
          /* ignoruj */
        }
        throw new Error(`Migrace ${file} selhala: ${err.message}`);
      }
    }
    if (count === 0) console.log('[migrate] vše už aplikováno.');
  });
}

/* Samostatné spuštění: `node src/migrate.js`. */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  await initDb();
  if (!isDbReady()) {
    console.error('[migrate] DB není dostupná — nelze migrovat.');
    process.exit(1);
  }
  try {
    await runMigrations();
  } catch (err) {
    console.error('[migrate] chyba:', err.message);
    await closeDb();
    process.exit(1);
  }
  await closeDb();
  console.log('[migrate] hotovo.');
}
