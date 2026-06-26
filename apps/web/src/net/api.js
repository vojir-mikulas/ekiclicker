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
  // signál pro SSE kanál (ServerEventsProvider) → reconnect s novou identitou (cílené push)
  try { window.dispatchEvent(new Event('eki-token-changed')); } catch { /* ignoruj */ }
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
  // aréna / přepady (asynchronní PvP — útok na ducha offline hráče)
  raids: () => req('/raids', { auth: true }),
  raidScout: () => req('/raids/scout', { method: 'POST', auth: true }),
  raidStrike: (defenderId, tactic) => req('/raids/strike', { method: 'POST', body: { defenderId, tactic }, auth: true }),
  raidWithdraw: () => req('/raids/withdraw', { method: 'POST', auth: true }),
  raidDeposit: (balances) => req('/raids/deposit', { method: 'POST', body: balances, auth: true }),
  raidDefense: (tactic) => req('/raids/defense', { method: 'POST', body: { tactic }, auth: true }),
  raidAck: () => req('/raids/ack', { method: 'POST', auth: true }),
  // cechy (perzistentní sociální vrstva — identita přežívá sezónu)
  myGuild: () => req('/me/guild', { auth: true }),
  guildList: (limit = 50) => req(`/guilds?limit=${limit}`, { auth: true }),
  guild: (id) => req(`/guilds/${encodeURIComponent(id)}`, { auth: true }),
  guildFound: (name, tag) => req('/guilds', { method: 'POST', body: { name, tag }, auth: true }),
  guildInvite: (id, { playerId, nickname }) => req(`/guilds/${encodeURIComponent(id)}/invite`, { method: 'POST', body: { playerId, nickname }, auth: true }),
  guildInviteRespond: (inviteId, accept) => req(`/guilds/invites/${encodeURIComponent(inviteId)}/${accept ? 'accept' : 'decline'}`, { method: 'POST', auth: true }),
  guildRequest: (id) => req(`/guilds/${encodeURIComponent(id)}/request`, { method: 'POST', auth: true }),
  guildRequestRespond: (inviteId, approve) => req(`/guilds/requests/${encodeURIComponent(inviteId)}/${approve ? 'approve' : 'decline'}`, { method: 'POST', auth: true }),
  guildKick: (id, playerId) => req(`/guilds/${encodeURIComponent(id)}/kick`, { method: 'POST', body: { playerId }, auth: true }),
  guildLeave: (id) => req(`/guilds/${encodeURIComponent(id)}/leave`, { method: 'POST', auth: true }),
  guildRole: (id, playerId, role) => req(`/guilds/${encodeURIComponent(id)}/role`, { method: 'POST', body: { playerId, role }, auth: true }),
  guildTransfer: (id, playerId) => req(`/guilds/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: { playerId }, auth: true }),
  guildMotd: (id, motd) => req(`/guilds/${encodeURIComponent(id)}/motd`, { method: 'POST', body: { motd }, auth: true }),
  guildDonate: (id, amount) => req(`/guilds/${encodeURIComponent(id)}/donate`, { method: 'POST', body: { amount }, auth: true }),
  guildUpgrade: (id, key) => req(`/guilds/${encodeURIComponent(id)}/upgrade`, { method: 'POST', body: { key }, auth: true }),
  guildDisband: (id) => req(`/guilds/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
  // schránka (mailbox — perzistentní zprávy mezi hráči + doručené pozvánky do cechu)
  mailbox: () => req('/mailbox', { auth: true }),
  mailSend: ({ nickname, recipientId, subject, body }) => req('/mailbox', { method: 'POST', body: { nickname, recipientId, subject, body }, auth: true }),
  mailAck: () => req('/mailbox/ack', { method: 'POST', auth: true }),
  mailRead: (id) => req(`/mailbox/${encodeURIComponent(id)}/read`, { method: 'POST', auth: true }),
  mailRespond: (id, accept) => req(`/mailbox/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`, { method: 'POST', auth: true }),
  mailDelete: (id) => req(`/mailbox/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
};
