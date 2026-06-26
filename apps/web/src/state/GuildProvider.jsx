import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GUILDS, guildDonationGoldPerPoint } from '@ekiclicker/shared';
import { GuildContext } from './guildContext.js';
import { useEngine } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { api } from '../net/api.js';

const IDLE_POLL_MS = 60_000; // klidové polování (jen pro odznak pozvánek v topbaru)

/* Sdílený stav CECHU + polling (POST+poll, žádné WebSockety — jako aréna/boss).
   Identita cechu PŘEŽÍVÁ sezónu, takže polluje, kdykoli je hráč připojen.
   Záložka 🛡️ Cech čte data odsud a po akcích volá refresh(). */
export function GuildProvider({ children }) {
  const engine = useEngine();
  const account = useAccount();
  const joined = account.status === 'joined';

  const [data, setData] = useState(null); // { guild, role, roster, invites, requests }
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!joined) return;
    try {
      const res = await api.myGuild();
      if (res?.ok) {
        setData({
          guild: res.guild || null,
          role: res.role || null,
          roster: res.roster || [],
          invites: res.invites || [],
          requests: res.requests || [],
          donation: res.donation || null,
        });
        // promítni bounded perky cechu do enginu (gold/dust/luck; bez dmgPct)
        engine.setGuildPerks(res.guild?.perks || null);
      }
    } catch { /* best-effort — server nedostupný apod. */ }
  }, [joined, engine]);

  /* Obecný wrapper akce: zavolá API, po úspěchu obnoví pohled, vrátí výsledek. */
  const act = useCallback(async (fn) => {
    if (!joined || busy) return null;
    setBusy(true);
    try {
      const res = await fn();
      await refresh();
      return res;
    } catch (e) {
      return { ok: false, reason: e?.code || 'fail' };
    } finally {
      setBusy(false);
    }
  }, [joined, busy, refresh]);

  /* Založ cech — zakládací poplatek 💠 je KLIENTSKÝ sink (server gateuje jen úroveň).
     Strhneme ho až PO úspěchu serveru, ať o úlomky nepřijdeš při zamítnutí. */
  const found = useCallback(async (name, tag) => {
    if (!joined || busy) return null;
    if ((engine.state.dust || 0) < GUILDS.foundFeeDust) return { ok: false, reason: 'fee' };
    setBusy(true);
    try {
      const res = await api.guildFound(name, tag);
      if (res?.ok) {
        engine.payGuildFee(GUILDS.foundFeeDust);
        await refresh();
      }
      return res;
    } catch (e) {
      return { ok: false, reason: e?.code || 'fail' };
    } finally {
      setBusy(false);
    }
  }, [joined, busy, engine, refresh]);

  const myId = data?.guild?.id || null;

  /* Přilij ZLATO do kasy — server připíše bounded `granted` body (denní strop dle
     atestované úrovně), zlato strhneme KLIENTSKY až za skutečně připsané body. */
  const donate = useCallback(async (points) => {
    if (!joined || busy || !myId) return null;
    setBusy(true);
    try {
      const res = await api.guildDonate(myId, Math.max(0, Math.floor(points || 0)));
      if (res?.ok && res.granted > 0) {
        const level = engine.state.level || engine.state.highestLevel || 1;
        engine.payGuildGold(guildDonationGoldPerPoint(level) * res.granted);
        await refresh();
      }
      return res;
    } catch (e) {
      return { ok: false, reason: e?.code || 'fail' };
    } finally {
      setBusy(false);
    }
  }, [joined, busy, myId, engine, refresh]);

  /* Mistr koupí vylepšení za kasu (žádná lokální měna — kasa žije na serveru). */
  const buyUpgrade = useCallback((key) => act(() => api.guildUpgrade(myId, key)), [act, myId]);

  const invite = useCallback((payload) => act(() => api.guildInvite(myId, payload)), [act, myId]);
  const respondInvite = useCallback((inviteId, accept) => act(() => api.guildInviteRespond(inviteId, accept)), [act]);
  const request = useCallback((guildId) => act(() => api.guildRequest(guildId)), [act]);
  const respondRequest = useCallback((inviteId, approve) => act(() => api.guildRequestRespond(inviteId, approve)), [act]);
  const kick = useCallback((playerId) => act(() => api.guildKick(myId, playerId)), [act, myId]);
  const leave = useCallback(() => act(() => api.guildLeave(myId)), [act, myId]);
  const setRole = useCallback((playerId, role) => act(() => api.guildRole(myId, playerId, role)), [act, myId]);
  const transfer = useCallback((playerId) => act(() => api.guildTransfer(myId, playerId)), [act, myId]);
  const setMotd = useCallback((motd) => act(() => api.guildMotd(myId, motd)), [act, myId]);
  const disband = useCallback(() => act(() => api.guildDisband(myId)), [act, myId]);
  const browse = useCallback((limit = 50) => api.guildList(limit).then((r) => (r?.ok ? r.guilds : [])).catch(() => []), []);

  // klidové polování pro odznak pozvánek, jen když připojen
  useEffect(() => {
    if (!joined) { setData(null); engine.setGuildPerks(null); return undefined; }
    void refresh();
    const id = setInterval(() => { void refresh(); }, IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [joined, refresh, engine]);

  // přechod do nové sezóny: identita zůstává, ale úroveň/perky se přepočtou → obnov
  const wasPendingRef = useRef(false);
  useEffect(() => {
    const had = wasPendingRef.current;
    wasPendingRef.current = !!account.pendingSeason;
    if (had && !account.pendingSeason && joined) void refresh();
  }, [account.pendingSeason, joined, refresh]);

  // Odvozeniny počítáme uvnitř memo (z `data`), ať nevznikají nové identity každý
  // render → memo se přepočítá jen při skutečné změně dat / akcí.
  const value = useMemo(() => {
    const role = data?.role || null;
    const invites = data?.invites || [];
    const requests = data?.requests || [];
    const isOfficer = role === 'master' || role === 'officer';
    return {
      data,
      guild: data?.guild || null,
      role,
      roster: data?.roster || [],
      invites,
      requests,
      donation: data?.donation || null,
      isOfficer,
      isMaster: role === 'master',
      // odznak: čekající pozvánka na mě, nebo (pro důstojníka) čekající žádost o vstup
      badge: invites.length + (isOfficer ? requests.length : 0),
      busy,
      refresh,
      found,
      donate,
      buyUpgrade,
      invite,
      respondInvite,
      request,
      respondRequest,
      kick,
      leave,
      setRole,
      transfer,
      setMotd,
      disband,
      browse,
    };
  }, [data, busy, refresh, found, donate, buyUpgrade, invite, respondInvite, request, respondRequest,
    kick, leave, setRole, transfer, setMotd, disband, browse]);

  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}
