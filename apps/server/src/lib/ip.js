/* =========================================================================
   Práce s IP adresou klienta. Spoléhá na app.set('trust proxy', …),
   takže req.ip už je správná IP z X-Forwarded-For (za reverzní proxy).
   ========================================================================= */

const IP_HISTORY_CAP = 10; // držíme jen posledních 10 záznamů

/* Klientská IP. req.ip s trust proxy stačí; fallback na socket. */
export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/* Přidá nový záznam do ip_history (cap na posledních 10), když se IP změnila.
   Vrací { changed, history } — history je vždy pole vhodné k uložení do jsonb.
   prevHistory může být cokoli z DB (očekáváme pole); ošetříme i nevalidní vstup. */
export function nextIpHistory(prevHistory, lastIp, ip, nowMs) {
  const history = Array.isArray(prevHistory) ? prevHistory.slice() : [];
  if (lastIp === ip) return { changed: false, history };
  history.push({ ip, at: new Date(nowMs).toISOString() });
  if (history.length > IP_HISTORY_CAP) history.splice(0, history.length - IP_HISTORY_CAP);
  return { changed: true, history };
}
