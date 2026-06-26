/* =========================================================================
   Events routa — SSE kanál pro push notifikace klientům.
     GET /api/events — text/event-stream; po připojení `hello`, dál `season`.

   Mountuje se PŘED dbGuardem i limiterem (viz index.js): kanál funguje i bez
   DB (verze hry je čistě statická věc) a long-lived spojení nemá co dělat
   v request limiteru. Bez auth — verze i číslo sezóny jsou veřejné info,
   takže banner i přechod sezóny fungují i v lokálním režimu (před přihlášením).

   Co se posílá:
     hello  { version, season }  — verze webového buildu, který server SERVÍRUJE,
                                    + číslo aktivní sezóny (oboje může být null).
     season { number }           — broadcast při reálné rotaci sezóny.
   ========================================================================= */
import { Router } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { addClient, broadcast } from '../lib/sse.js';
import { isDbReady } from '../db.js';
import { getActiveSeason } from '../lib/players.js';

const router = Router();

let servedVersion = null; // verze webového buildu, který tenhle proces servíruje
let seasonNumber = null;  // číslo aktuálně aktivní sezóny (cache pro hello)

/* Verze servírovaného webu = dist/version.json (stejný soubor, ze kterého má
   čerstvě načtený klient svůj __APP_VERSION__). Po nasazení nové várky se
   proces vymění, znovupřipojený klient dostane novou verzi → banner. V devu
   (bez buildu) soubor chybí → null → klient banner neukáže. */
function readServedVersion(webDist) {
  try {
    const f = path.join(webDist, 'version.json');
    if (!existsSync(f)) return null;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    return typeof j.version === 'string' ? j.version : null;
  } catch { return null; }
}

function hello() {
  return { version: servedVersion, season: seasonNumber };
}

/* GET /api/events — SSE kanál. Bez DB i bez auth. Volitelný ?token= přiřadí
   spojení k hráči pro cílené push (EventSource neumí Authorization hlavičku). */
router.get('/events', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  addClient(req, res, hello, token);
});

/* Inicializace: přečti servírovanou verzi a spusť hlídání rotace sezóny.
   Sezónu hlídá JEDEN serverový poll (ne N klientů). Rotace se navíc děje
   migrací `rotate_season()`, kterou může spustit i jiný proces (nasazení /
   ruční migrate) — proto poll, ne jen reconnect: chytí rotaci nezávisle na
   tom, kdo ji vyvolal. (Upgrade path bez pollu: NOTIFY z rotate_season().) */
export function initEvents({ webDist, seasonWatchMs = 30_000 } = {}) {
  servedVersion = readServedVersion(webDist);

  const tick = async () => {
    if (!isDbReady()) return;
    try {
      const active = await getActiveSeason();
      const n = active ? active.number : null;
      if (n != null && n !== seasonNumber) {
        const first = seasonNumber == null; // první načtení po startu, ne rotace
        seasonNumber = n;
        if (!first) broadcast('season', { number: n });
      }
    } catch { /* DB blip — zkusíme příští tick */ }
  };

  void tick(); // hned zjisti výchozí sezónu pro hello
  const id = setInterval(() => void tick(), seasonWatchMs);
  id.unref?.();
  return () => clearInterval(id);
}

export default router;
