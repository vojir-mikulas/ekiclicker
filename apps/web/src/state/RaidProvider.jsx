import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RaidContext } from './raidContext.js';
import { useEngine } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { api } from '../net/api.js';

const IDLE_POLL_MS = 60_000; // klidové polování (jen pro odznak v topbaru)

/* Sdílený stav arény + polling (POST+poll, žádné WebSockety — stejně jako boss).
   Aktivní jen když je hráč připojen k žebříčku (přepady jsou sezónní serverová věc).
   Záložka si polluje rychleji sama přes refresh(); data jsou sdílená. */
export function RaidProvider({ children }) {
  const engine = useEngine();
  const account = useAccount();
  const joined = account.status === 'joined';

  const [data, setData] = useState(null); // { me, incoming, unseen, mine, top }
  const [busy, setBusy] = useState(false);
  const cooldownUntilRef = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  // ulož pohled + odvoď okamžik konce cooldownu z serverového snapshotu
  const applyView = useCallback((view) => {
    if (!view) return;
    const next = {
      me: view.me || null,
      incoming: view.incoming || [],
      unseen: view.unseen || 0,
      mine: view.mine || [],
      top: view.top || [],
    };
    setData(next);
    const cd = next.me?.cooldownMs || 0;
    const until = performance.now() + cd;
    cooldownUntilRef.current = until;
    setCooldownUntil(until);
  }, []);

  const refresh = useCallback(async () => {
    if (!joined) return;
    try {
      const res = await api.raids();
      if (res?.ok) applyView(res);
    } catch {
      /* best-effort — server nedostupný apod. */
    }
  }, [joined, applyView]);

  // najdi oběť (scout) — vrátí snímek soupeře + lup na nabídce, nebo null
  const scout = useCallback(async () => {
    if (!joined || busy) return null;
    setBusy(true);
    try {
      const res = await api.raidScout();
      return res?.ok ? (res.opponent || null) : null;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [joined, busy]);

  // přepad — server vyřeší výsledek; lup (při výhře) přistane v TREZORU (server)
  const strike = useCallback(async (defenderId, tactic) => {
    if (!joined || busy || !defenderId) return null;
    if (performance.now() < cooldownUntilRef.current) return null;
    setBusy(true);
    try {
      const res = await api.raidStrike(defenderId, tactic);
      if (res?.view) applyView(res.view);
      return res;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [joined, busy, applyView]);

  // vyber trezor do bezpečí → lup se připíše do lokálního save (grantRaidLoot)
  const withdraw = useCallback(async () => {
    if (!joined) return null;
    try {
      const res = await api.raidWithdraw();
      const r = res?.reward;
      if (r && (r.gold > 0 || r.doves > 0 || r.dust > 0)) engine.grantRaidLoot(r);
      await refresh();
      return r || null;
    } catch {
      return null;
    }
  }, [joined, engine, refresh]);

  const setDefense = useCallback(async (tactic) => {
    if (!joined) return;
    try {
      await api.raidDefense(tactic);
      await refresh();
    } catch { /* best-effort */ }
  }, [joined, refresh]);

  const ack = useCallback(async () => {
    if (!joined) return;
    try {
      await api.raidAck();
      await refresh();
    } catch { /* best-effort */ }
  }, [joined, refresh]);

  // klidové polování pro odznak (příchozí přepady / lup k vybrání), jen když připojen
  useEffect(() => {
    if (!joined) { setData(null); return undefined; }
    void refresh();
    const id = setInterval(() => { void refresh(); }, IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [joined, refresh]);

  // přechod do nové sezóny: zhasni starý trezor/rating a natáhni čerstvý (jako boss)
  const wasPendingRef = useRef(false);
  useEffect(() => {
    const had = wasPendingRef.current;
    wasPendingRef.current = !!account.pendingSeason;
    if (had && !account.pendingSeason && joined) {
      setData(null);
      void refresh();
    }
  }, [account.pendingSeason, joined, refresh]);

  const vault = data?.me?.vault || null;
  const hasLoot = !!vault && (vault.gold > 0 || vault.doves > 0 || vault.dust > 0);
  const value = useMemo(() => ({
    data,
    me: data?.me || null,
    incoming: data?.incoming || [],
    unseen: data?.unseen || 0,
    mine: data?.mine || [],
    top: data?.top || [],
    vault,
    hasLoot,
    // odznak: nevyřízený příchozí přepad nebo lup čekající v trezoru
    badge: (data?.unseen || 0) > 0 || hasLoot,
    busy,
    cooldownUntil,
    refresh,
    scout,
    strike,
    withdraw,
    setDefense,
    ack,
  }), [data, vault, hasLoot, busy, cooldownUntil, refresh, scout, strike, withdraw, setDefense, ack]);

  return <RaidContext.Provider value={value}>{children}</RaidContext.Provider>;
}
