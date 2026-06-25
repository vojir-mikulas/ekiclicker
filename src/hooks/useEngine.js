import { useContext, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { EngineContext } from '../state/engineContext.js';

export function useEngine() {
  return useContext(EngineContext);
}

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

/* Vybere řez stavu a re-renderuje POUZE při jeho skutečné změně,
   přestože engine notifikuje každý snímek. */
export function useEngineSelector(selector, isEqual = Object.is) {
  const engine = useContext(EngineContext);
  const cache = useRef({ has: false, value: undefined });
  const getSnapshot = useCallback(() => {
    const next = selector(engine.state);
    if (cache.current.has && isEqual(cache.current.value, next)) {
      return cache.current.value;
    }
    cache.current = { has: true, value: next };
    return next;
  }, [engine, selector, isEqual]);
  return useSyncExternalStore(engine.subscribe, getSnapshot, getSnapshot);
}

/* Překreslí komponentu KAŽDÝ snímek (sleduje engine.version).
   Použij pro plynulé hodnoty závislé na čase (boss časomíra, combo okno) —
   čti `engine.state` + `performance.now()` až v renderu, NIKDY v selektoru
   (to by rozbilo useSyncExternalStore → nekonečný re-render). */
export function useEngineFrame() {
  const engine = useContext(EngineContext);
  return useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);
}

/* Připojení k sémantickým eventům enginu (FX, toasty). Handler může být inline. */
export function useEngineEvent(handler) {
  const engine = useContext(EngineContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => engine.onEvent((type, payload) => ref.current(type, payload)), [engine]);
}
