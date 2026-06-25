import { useState, useEffect, useCallback, useMemo } from 'react';
import { AccountContext } from './accountContext.js';
import { useEngine } from '../hooks/useEngine.js';
import { buildSnapshot } from '../game/persistence.js';
import { buildScore } from '../net/score.js';
import { api, getToken, setToken, getCachedNick, setCachedNick } from '../net/api.js';

const SYNC_INTERVAL_MS = 20_000;

/* Účet hráče + synchronizace skóre na žebříček.
   Stavy: 'loading' → 'local' (hraje bez účtu) | 'joined' (připojen k žebříčku).
   Lokální režim je výchozí; připojení je dobrovolné a VYNULUJE postup. */
export function AccountProvider({ children }) {
  const engine = useEngine();
  const [status, setStatus] = useState('loading');
  const [player, setPlayer] = useState(null); // { id, nickname }
  const [offline, setOffline] = useState(false); // server nedostupný, ale máme token
  const [syncTick, setSyncTick] = useState(0); // ++ po každém přijatém odeslání skóre

  const submitNow = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await api.submitScore(buildScore(engine.state), buildSnapshot(engine.state));
      setOffline(false);
      // server přijal a zapsal (ne throttle/zamítnutí) → signál pro UI (žebříček)
      if (res?.ok && !res.throttled) setSyncTick((t) => t + 1);
    } catch (e) {
      if (e.offline) setOffline(true);
      // ostatní (throttled apod.) tiše ignorujeme — synchronizace je best-effort
    }
  }, [engine]);

  // úvodní načtení: rozhodni lokální vs. připojený podle tokenu
  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) { setStatus('local'); return; }
    api.me()
      .then((me) => {
        if (cancelled) return;
        setCachedNick(me.nickname);
        setPlayer({ id: me.id, nickname: me.nickname });
        setOffline(false);
        setStatus('joined');
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.code === 'unauthorized' || e.code === 'not_found') {
          // token už neplatí → zpět do lokálního režimu
          setToken(null);
          setCachedNick(null);
          setStatus('local');
        } else {
          // server nedostupný — zůstáváme připojeni s cachovaným jménem
          setPlayer({ id: null, nickname: getCachedNick() || 'Hráč' });
          setOffline(true);
          setStatus('joined');
        }
      });
    return () => { cancelled = true; };
  }, []);

  // pravidelná synchronizace, když jsme připojeni
  useEffect(() => {
    if (status !== 'joined') return undefined;
    void submitNow();
    const id = setInterval(() => { void submitNow(); }, SYNC_INTERVAL_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') void submitNow(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [status, submitNow]);

  // připojení k žebříčku — VYNULUJE postup (až po úspěšné registraci)
  const join = useCallback(async (nickname) => {
    const res = await api.register(nickname); // vyhodí chybu s .code (řeší UI)
    setToken(res.token);
    setCachedNick(res.nickname);
    engine.hardReset(); // čistý start pro žebříček
    setPlayer({ id: res.id, nickname: res.nickname });
    setOffline(false);
    setStatus('joined');
    return res; // { recoveryCode }
  }, [engine]);

  const rename = useCallback(async (nickname) => {
    const res = await api.rename(nickname);
    setCachedNick(res.nickname);
    setPlayer((p) => ({ ...(p || {}), nickname: res.nickname }));
    return res;
  }, []);

  // obnova účtu na novém zařízení / po smazání dat — natáhne uložený save
  const recover = useCallback(async (code) => {
    const res = await api.recover(code.trim());
    setToken(res.token);
    setCachedNick(res.nickname);
    if (res.save) engine.loadSnapshot(res.save);
    setPlayer({ id: res.id, nickname: res.nickname });
    setOffline(false);
    setStatus('joined');
    return res;
  }, [engine]);

  // opuštění žebříčku = smazání účtu na serveru (volá se z Nastavení spolu s hardReset)
  const leave = useCallback(async () => {
    try { await api.remove(); } catch { /* i při chybě uklidíme lokálně */ }
    setToken(null);
    setCachedNick(null);
    setPlayer(null);
    setOffline(false);
    setStatus('local');
  }, []);

  const value = useMemo(
    () => ({ status, player, offline, syncTick, join, rename, recover, leave, submitNow }),
    [status, player, offline, syncTick, join, rename, recover, leave, submitNow]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
