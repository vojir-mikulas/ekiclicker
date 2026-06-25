/* Tenký klient nad backendem žebříčku. Volá relativní /api/* (v devu proxuje
   Vite na :3000, v produkci servíruje stejný Node server). Vše „best-effort“ —
   hra funguje i bez serveru (lokální režim), tady jen řešíme chyby čistě. */

const TOKEN_KEY = 'ekiAccountToken';
const NICK_KEY = 'ekiAccountNick'; // cache pro offline zobrazení jména

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}
export function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignoruj */ }
}
export function getCachedNick() {
  try { return localStorage.getItem(NICK_KEY) || null; } catch { return null; }
}
export function setCachedNick(n) {
  try { if (n) localStorage.setItem(NICK_KEY, n); else localStorage.removeItem(NICK_KEY); } catch { /* ignoruj */ }
}

/* Společný požadavek. Vrátí JSON; při chybě vyhodí Error s .code/.status. */
async function req(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('Server je nedostupný.');
    e.code = 'network';
    e.offline = true;
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* prázdné tělo */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || `Chyba ${res.status}`);
    e.code = (data && data.code) || `http_${res.status}`;
    e.status = res.status;
    if (res.status === 503) e.offline = true;
    throw e;
  }
  return data;
}

export const api = {
  register: (nickname) => req('/register', { method: 'POST', body: { nickname } }),
  recover: (code) => req('/recover', { method: 'POST', body: { code } }),
  me: () => req('/me', { auth: true }),
  rename: (nickname) => req('/me', { method: 'PATCH', body: { nickname }, auth: true }),
  remove: () => req('/me', { method: 'DELETE', auth: true }),
  submitScore: (score, save) => req('/scores', { method: 'POST', body: { score, save }, auth: true }),
  enterSeason: () => req('/me/enter-season', { method: 'POST', auth: true }),
  leaderboard: (board, limit = 50, season) =>
    req(
      `/leaderboard?board=${encodeURIComponent(board)}&limit=${limit}` +
        (season != null ? `&season=${encodeURIComponent(season)}` : ''),
      { auth: true },
    ),
  seasons: () => req('/seasons'),
  season: (n) => req(`/seasons/${encodeURIComponent(n)}`),
  player: (id) => req(`/players/${encodeURIComponent(id)}`, { auth: true }),
  // světový boss (sdílený sezónní kooperativní boss)
  worldBoss: () => req('/world-boss', { auth: true }),
  worldBossHit: (effort = 1) => req('/world-boss/hit', { method: 'POST', body: { effort }, auth: true }),
  worldBossClaim: () => req('/world-boss/claim', { method: 'POST', auth: true }),
};
