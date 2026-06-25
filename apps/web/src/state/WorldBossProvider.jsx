import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { WORLD_BOSS } from '@ekiclicker/shared';
import { WorldBossContext } from './worldBossContext.js';
import { useEngine } from '../hooks/useEngine.js';
import { useAccount } from '../hooks/useAccount.js';
import { api } from '../net/api.js';

const IDLE_POLL_MS = 45_000; // klidové polování (jen pro odznak v topbaru)
const AUTO_TICK_MS = 4_000;  // jak často auto-salva zkouší vypálit (server stejně drží 60s cooldown)
const AUTO_KEY = 'eki.wb.auto';

// auto-salva: záměrně zapnutá by default — palba je serverem boundovaná i cooldownovaná
// (effort=1 = stejný strop jako manuál), takže „udělej to za mě" nepřináší žádnou výhodu.
function loadAuto() {
  try { const v = localStorage.getItem(AUTO_KEY); return v == null ? true : v === '1'; } catch { return true; }
}
function saveAuto(on) {
  try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* ignoruj */ }
}

/* Sdílený stav světového bosse + polling (POST+poll, žádné WebSockety).
   Aktivní jen když je hráč připojen k žebříčku (boss je sezónní serverová věc).
   Modal si polluje rychleji sám přes refresh(); data jsou sdílená. */
export function WorldBossProvider({ children }) {
  const engine = useEngine();
  const account = useAccount();
  const joined = account.status === 'joined';

  const [data, setData] = useState(null);   // { boss, top, fighters, me, unclaimed }
  const [busy, setBusy] = useState(false);   // probíhá úder
  const [autoSalvo, setAutoSalvoState] = useState(loadAuto); // auto vypouštění salvy
  // performance.now() okamžik, kdy smí padnout další úder (živý odpočet v UI)
  const cooldownUntilRef = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const setAutoSalvo = useCallback((on) => { saveAuto(on); setAutoSalvoState(on); }, []);

  // ulož pohled + odvoď okamžik konce cooldownu z serverového snapshotu
  const applyView = useCallback((view) => {
    if (!view) return;
    const next = {
      boss: view.boss || null,
      top: view.top || [],
      fighters: view.fighters || 0,
      me: view.me || null,
      unclaimed: view.unclaimed || null,
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
      const res = await api.worldBoss();
      if (res && 'boss' in res) applyView(res);
    } catch {
      /* best-effort — server nedostupný apod. */
    }
  }, [joined, applyView]);

  const hit = useCallback(async (effort = 1) => {
    if (!joined || busy) return null;
    if (performance.now() < cooldownUntilRef.current) return null; // lokální cooldown gate
    setBusy(true);
    try {
      const res = await api.worldBossHit(effort);
      if (res && 'boss' in res) applyView(res);
      return res;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [joined, busy, applyView]);

  // auto-salva: na pozadí (i mimo záložku bosse) vypálí salvu vždy, když je boss živý,
  // uplynul cooldown a ještě nejsem na svém stropu. effort=1 = serverem boundovaný max,
  // takže žádná výhoda proti manuálu — jen to za tebe odklikává tu otravnou minutovku.
  const dataRef = useRef(null);
  const hitRef = useRef(hit);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { hitRef.current = hit; }, [hit]);
  useEffect(() => {
    if (!joined || !autoSalvo) return undefined;
    const tryFire = () => {
      const b = dataRef.current?.boss;
      if (!b || b.status !== 'active') return;
      if (performance.now() < cooldownUntilRef.current) return;
      const capped = (dataRef.current?.me?.damage || 0) >= (b.maxHp || 0) * WORLD_BOSS.perPlayerCapFrac;
      if (capped) return;
      void hitRef.current(1); // hit() si sám pohlídá busy + lokální cooldown
    };
    const id = setInterval(tryFire, AUTO_TICK_MS);
    return () => clearInterval(id);
  }, [joined, autoSalvo]);

  const claim = useCallback(async () => {
    if (!joined) return null;
    try {
      const res = await api.worldBossClaim();
      if (res?.ok && res.reward?.count > 0) engine.grantWorldBossReward(res.reward);
      await refresh();
      return res?.reward || null;
    } catch {
      return null;
    }
  }, [joined, engine, refresh]);

  // klidové polování pro odznak (boss živý / odměna k vyzvednutí), jen když připojen
  useEffect(() => {
    if (!joined) { setData(null); return undefined; }
    void refresh();
    const id = setInterval(() => { void refresh(); }, IDLE_POLL_MS);
    return () => clearInterval(id);
  }, [joined, refresh]);

  // přechod do nové sezóny (pendingSeason: {…} → null po enterSeason): okamžitě
  // zhasni starého bosse a natáhni čerstvého z nové sezóny — jinak by topbar držel
  // bosse i můj příspěvek z minulé sezóny až do dalšího pollu (≤45 s).
  const wasPendingRef = useRef(false);
  useEffect(() => {
    const had = wasPendingRef.current;
    wasPendingRef.current = !!account.pendingSeason;
    if (had && !account.pendingSeason && joined) {
      setData(null);
      void refresh();
    }
  }, [account.pendingSeason, joined, refresh]);

  const value = useMemo(() => ({
    data,
    boss: data?.boss || null,
    top: data?.top || [],
    fighters: data?.fighters || 0,
    me: data?.me || null,
    unclaimed: data?.unclaimed || null,
    live: !!(data?.boss && data.boss.status === 'active'),
    claimable: !!data?.unclaimed,
    busy,
    cooldownUntil,
    autoSalvo,
    setAutoSalvo,
    refresh,
    hit,
    claim,
  }), [data, busy, cooldownUntil, autoSalvo, setAutoSalvo, refresh, hit, claim]);

  return <WorldBossContext.Provider value={value}>{children}</WorldBossContext.Provider>;
}
