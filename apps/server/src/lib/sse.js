/* =========================================================================
   SSE hub — jeden běžící proces drží otevřená spojení a pushuje události
   klientům (verze hry, rotace sezóny). Nahrazuje klientský polling jedním
   push kanálem: latence z „až 5 min" → ~okamžitě, a zátěž z N klientů → 0.

   PŘEDPOKLAD: server běží jako JEDNA instance (viz docker-compose.yml — jediná
   služba `app`). In-memory registr spojení tak pokryje všechny klienty. Při
   horizontálním škálování by broadcast zasáhl jen klienty na téže instanci —
   pak nasaď Postgres LISTEN/NOTIFY nebo Redis pub/sub jako transport pro
   broadcast(); zbytek (route, hello payload) zůstane stejný.
   ========================================================================= */
import { clientIp } from './ip.js';
import { isDbReady } from '../db.js';
import { findByToken } from './players.js';

const HEARTBEAT_MS = 25_000; // ': ping' komentář proti zabití nečinného spojení proxy
const MAX_PER_IP = 8;        // strop souběžných spojení na IP (anti-abuse / FD ochrana)

const clients = new Set(); // { res, ip, playerId }
let heartbeat = null;

/* Zapíše jeden SSE rámec. Selhání (spojení padlo mezitím) ignorujeme —
   uklidí ho 'close' handler. */
function write(res, event, data) {
  try {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch { /* spojení už neexistuje */ }
}

function ensureHeartbeat() {
  if (heartbeat || clients.size === 0) return;
  heartbeat = setInterval(() => {
    for (const c of clients) {
      try { c.res.write(': ping\n\n'); } catch { /* uklidí 'close' */ }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.(); // tikající heartbeat nesmí držet proces naživu
}

function maybeStopHeartbeat() {
  if (heartbeat && clients.size === 0) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

/* Připojí nového SSE klienta. `hello()` vrátí úvodní payload (verze + sezóna),
   který se pošle hned po navázání — fresh i znovupřipojený klient tak dostane
   aktuální pravdu (po nasazení = po reconnectu na nový proces = nová verze).

   `token` (volitelný, z query — EventSource neumí hlavičky) přiřadí spojení
   k hráči pro CÍLENÉ push (např. nová zpráva do schránky). Resolve je async a
   best-effort: spojení žije hned (hello/season/verze fungují i anonymně), id se
   doplní za okamžik. Neplatný token / DB dole → spojení zůstane anonymní. */
export function addClient(req, res, hello, token) {
  const ip = clientIp(req);
  let perIp = 0;
  for (const c of clients) if (c.ip === ip) perIp++;
  if (perIp >= MAX_PER_IP) { res.status(429).end(); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform', // no-transform → compression() stream nebufferuje
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',                 // nginx & spol.: nebufferovat stream
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n'); // doporučený interval reconnectu pro EventSource

  const client = { res, ip, playerId: null };
  clients.add(client);
  ensureHeartbeat();
  write(res, 'hello', hello());

  if (token && isDbReady()) {
    findByToken(token)
      .then((p) => { if (p) client.playerId = p.id; })
      .catch(() => { /* neplatný token → spojení zůstane anonymní */ });
  }

  req.on('close', () => {
    clients.delete(client);
    maybeStopHeartbeat();
  });
}

/* Rozešle událost všem připojeným klientům. */
export function broadcast(event, data) {
  for (const c of clients) write(c.res, event, data);
}

/* Cílený push JEDNOMU hráči (všem jeho spojením). Tichý no-op, když není online
   (žádné spojení s tímto playerId) — push je jen „nudge", pravdu drží poll/fetch. */
export function broadcastToPlayer(playerId, event, data) {
  if (!playerId) return;
  for (const c of clients) if (c.playerId === playerId) write(c.res, event, data);
}

export function clientCount() {
  return clients.size;
}
