import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MailboxContext } from './mailboxContext.js';
import { useEngine } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { useServerEvents } from '../hooks/useServerEvents.js';
import { api } from '../net/api.js';

const IDLE_POLL_MS = 60_000; // klidové polování (jen pro odznak schránky v topbaru)

/* Nativní upozornění prohlížeče na novou zprávu — jen když je záložka NA POZADÍ
   (na popředí stačí toast) a hráč dal souhlas. Best-effort, nikdy nevyhazuje. */
function notifyNewMail({ count, from, invite, guild }) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && !document.hidden) return; // popředí → řeší toast
    const title = invite
      ? `🛡️ Pozvánka do cechu${guild?.tag ? ` [${guild.tag}]` : ''}`
      : (count > 1 ? `📬 ${count} nové zprávy` : '📬 Nová zpráva');
    const body = invite
      ? 'Otevři schránku a rozhodni se, jestli vstoupíš.'
      : (from ? `Od ${from}` : 'Máš novou zprávu ve schránce.');
    const n = new Notification(title, { body, tag: 'eki-mail' }); // tag → další upozornění nahradí předchozí
    n.onclick = () => { try { window.focus(); } catch { /* ignoruj */ } n.close(); };
  } catch { /* best-effort */ }
}

/* Sdílený stav SCHRÁNKY + polling (POST+poll, žádné WebSockety — jako cech/aréna).
   Identita schránky PŘEŽÍVÁ sezónu, takže polluje, kdykoli je hráč připojen.
   Topbar 📬 a MailboxModal čtou data odsud a po akcích volají refresh(). */
export function MailboxProvider({ children }) {
  const engine = useEngine();
  const account = useAccount();
  const { mailEpoch } = useServerEvents();
  const joined = account.status === 'joined';

  const [data, setData] = useState(null); // { messages, unread }
  const [busy, setBusy] = useState(false);
  const alertedRef = useRef(new Set()); // id zpráv, na které už padl toast (1×/relace)
  const seededRef = useRef(false);       // první načtení neupozorňuje (jen zaznamená stav)

  const apply = useCallback((res) => {
    const messages = res.messages || [];
    setData({ messages, unread: res.unread || 0 });
    // toast za NOVÉ nepřečtené zprávy, které jsme ještě neviděli (až po prvním seedu)
    const fresh = messages.filter((m) => !m.read && !alertedRef.current.has(m.id));
    fresh.forEach((m) => alertedRef.current.add(m.id));
    if (seededRef.current && fresh.length) {
      const invite = fresh.find((m) => m.kind === 'guild_invite');
      const payload = {
        count: fresh.length,
        from: fresh[0].from,
        invite: !!invite,
        guild: invite?.guild || null,
      };
      engine.emit('mailReceived', payload); // in-app toast (popředí)
      notifyNewMail(payload);                // nativní upozornění (pozadí)
    }
    seededRef.current = true;
  }, [engine]);

  const refresh = useCallback(async () => {
    if (!joined) return;
    try { const res = await api.mailbox(); if (res?.ok) apply(res); } catch { /* best-effort */ }
  }, [joined, apply]);

  /* Obecný wrapper akce: zavolá API, po úspěchu obnoví schránku, vrátí výsledek. */
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

  const send = useCallback((payload) => act(() => api.mailSend(payload)), [act]);
  const respond = useCallback((id, accept) => act(() => api.mailRespond(id, accept)), [act]);
  const remove = useCallback((id) => act(() => api.mailDelete(id)), [act]);

  /* Otevření zprávy = přečteno. Optimisticky (bez refetch → plynulé), server best-effort.
     Odznak sniž jen u stále akčních (status 'open') — zrcadlí serverový výpočet unread. */
  const markRead = useCallback((id) => {
    if (!joined) return;
    setData((d) => {
      if (!d) return d;
      const msg = d.messages.find((m) => m.id === id);
      if (!msg || msg.read) return d;
      return {
        messages: d.messages.map((m) => (m.id === id ? { ...m, read: true } : m)),
        unread: Math.max(0, d.unread - (msg.status === 'open' ? 1 : 0)),
      };
    });
    api.mailRead(id).catch(() => { /* best-effort */ });
  }, [joined]);

  /* Označit vše přečtené (tlačítko) — optimisticky shodí odznak i zvýraznění v seznamu. */
  const ackAll = useCallback(async () => {
    if (!joined) return;
    setData((d) => (d ? { messages: d.messages.map((m) => ({ ...m, read: true })), unread: 0 } : d));
    try { await api.mailAck(); } catch { /* best-effort */ }
  }, [joined]);

  // klidové polování pro odznak (záloha, když SSE neprojde), jen když připojen
  useEffect(() => {
    if (!joined) {
      setData(null);
      seededRef.current = false;
      alertedRef.current = new Set();
      return undefined;
    }
    void refresh();
    const id = setInterval(() => { void refresh(); }, IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [joined, refresh]);

  // SSE push 'mail' (mailEpoch++) → okamžitý refetch schránky (latence ~ihned místo ≤60 s).
  // Přes ref, ať efekt běží JEN při novém pushi, ne při změně identity refresh().
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (mailEpoch > 0) void refreshRef.current();
  }, [mailEpoch]);

  const value = useMemo(() => ({
    messages: data?.messages || [],
    unread: data?.unread || 0,
    badge: data?.unread || 0,
    loaded: !!data,
    busy,
    refresh,
    send,
    respond,
    remove,
    markRead,
    ackAll,
  }), [data, busy, refresh, send, respond, remove, markRead, ackAll]);

  return <MailboxContext.Provider value={value}>{children}</MailboxContext.Provider>;
}
