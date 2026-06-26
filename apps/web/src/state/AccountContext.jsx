import { useState, useEffect, useCallback, useMemo } from 'react';
import { AccountContext } from './accountContext.js';
import { useEngine } from '../hooks/useEngine.js';
import { useServerEvents } from '../hooks/useServerEvents.js';
import { buildSnapshot } from '../game/persistence.js';
import { buildScore } from '../net/score.js';
import { api, getToken, setToken, getCachedNick, setCachedNick } from '../net/api.js';

const SYNC_INTERVAL_MS = 20_000;

/* Účet hráče + synchronizace skóre na žebříček.
   Stavy: 'loading' → 'local' (hraje bez účtu) | 'joined' (připojen k žebříčku).
   Lokální režim je výchozí; připojení je dobrovolné a VYNULUJE postup. */
export function AccountProvider({ children }) {
  const engine = useEngine();
  const serverEvents = useServerEvents(); // sdílený SSE kanál (verze + rotace sezóny)
  const [status, setStatus] = useState('loading');
  const [player, setPlayer] = useState(null); // { id, nickname }
  const [offline, setOffline] = useState(false); // server nedostupný, ale máme token
  const [syncTick, setSyncTick] = useState(0); // ++ po každém přijatém odeslání skóre
  // čekající přechod do nové sezóny: { endedNumber, activeNumber, reward } | null
  const [pendingSeason, setPendingSeason] = useState(null);
  // oslava PO vstupu do nové sezóny: { number, reward } | null (zobrazí NewSeasonModal)
  const [newSeason, setNewSeason] = useState(null);

  // z /me odvodí, jestli skončila sezóna, ve které hráč soutěžil (active > mine)
  const applyMeSeason = useCallback((me) => {
    const s = me?.season;
    if (s && s.active && s.mine != null && s.active.number > s.mine) {
      setPendingSeason({ endedNumber: s.mine, activeNumber: s.active.number, reward: s.pendingReward || null });
    } else {
      setPendingSeason(null);
    }
  }, []);

  const checkSeason = useCallback(async () => {
    try { applyMeSeason(await api.me()); } catch { /* best-effort */ }
  }, [applyMeSeason]);

  const submitNow = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await api.submitScore(buildScore(engine.state), buildSnapshot(engine.state));
      setOffline(false);
      // server přijal a zapsal (ne throttle/zamítnutí) → signál pro UI (žebříček)
      if (res?.ok && !res.throttled) setSyncTick((t) => t + 1);
      // server hlásí novou sezónu → zjisti detail (umístění + odměnu) pro modal
      if (res?.seasonChanged) await checkSeason();
    } catch (e) {
      if (e.offline) setOffline(true);
      // ostatní (throttled apod.) tiše ignorujeme — synchronizace je best-effort
    }
  }, [engine, checkSeason]);

  // potvrzení přechodu do nové sezóny: claim odměny → hardReset → připsat 🕊 → fresh submit
  const enterSeason = useCallback(async () => {
    const res = await api.enterSeason(); // vyhodí chybu → modal ji ošetří
    engine.hardReset();
    if (res.reward && res.reward.forgiveness) engine.grantForgiveness(res.reward.forgiveness);
    // odměna za umístění cechu z minulé sezóny (bounded 🕊+💠; připíše do čerstvého běhu)
    if (res.guildReward && (res.guildReward.doves || res.guildReward.dust)) engine.grantRaidLoot(res.guildReward);
    const number = pendingSeason?.activeNumber;
    setPendingSeason(null);
    setNewSeason({ number, reward: res.reward || null }); // hype: „Sezóna N je tady!"
    void submitNow();
    return res.reward;
  }, [engine, submitNow, pendingSeason]);

  const dismissNewSeason = useCallback(() => setNewSeason(null), []);

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
        applyMeSeason(me); // skončila sezóna, kterou hráč hrál? → přechod
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
  }, [applyMeSeason]);

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

  // SSE push „rotace sezóny" → okamžitě ověř přechod (místo čekání na 20s sync).
  // seasonEpoch se bumpne jen při reálné 'season' události, ne při výchozím hello.
  // 20s seasonChanged ze /scores zůstává jako fallback, když SSE neprojde.
  useEffect(() => {
    if (status !== 'joined' || serverEvents.seasonEpoch === 0) return;
    void checkSeason();
  }, [serverEvents.seasonEpoch, status, checkSeason]);

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
    setPendingSeason(null);
    setNewSeason(null);
    setStatus('local');
  }, []);

  const value = useMemo(
    () => ({
      status, player, offline, syncTick, pendingSeason, newSeason,
      join, rename, recover, leave, submitNow, enterSeason, dismissNewSeason,
    }),
    [status, player, offline, syncTick, pendingSeason, newSeason,
      join, rename, recover, leave, submitNow, enterSeason, dismissNewSeason]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
