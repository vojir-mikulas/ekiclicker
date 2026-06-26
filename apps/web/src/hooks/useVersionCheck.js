/* Hlídá, jestli na serveru neběží novější verze hry, než kterou má načtenou
   tahle karta. Klient zná svou verzi ze zapečeného __APP_VERSION__ (Vite define)
   a porovnává ji s /version.json, které servíruje statika z buildu.

   „Best-effort" — když je server nedostupný / běžíme v devu / soubor chybí,
   prostě se nic neukáže. Žádné automatické reloady, jen signál pro banner. */
import { useState, useEffect, useCallback, useRef } from 'react';

// Verze, se kterou byl sestavený TENHLE bundle (zapečená při buildu).
// V devu (bez buildu) může define chybět → fallback 'dev'.
const RUNNING_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const POLL_MS = 5 * 60 * 1000; // jak často se ptát serveru na nejnovější várku

async function fetchLatestVersion() {
  // cache-busting + no-store, ať nečteme starý version.json z cache prohlížeče
  const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data && typeof data.version === 'string' ? data.version : null;
}

export function useVersionCheck() {
  const [latest, setLatest] = useState(null); // verze na serveru, když se liší od běžící
  const runningRef = useRef(RUNNING_VERSION);

  const check = useCallback(async () => {
    try {
      const v = await fetchLatestVersion();
      if (v && v !== runningRef.current) setLatest(v);
    } catch {
      /* offline / dev / 404 — ignoruj, banner se prostě neukáže */
    }
  }, []);

  useEffect(() => {
    // V devu (žádný build, version.json neexistuje) nemá kontrola smysl.
    if (!import.meta.env.PROD) return undefined;

    let stopped = false;
    const tick = () => { if (!stopped) check(); };

    tick(); // hned po načtení (zachytí i nasazení během toho, co byla karta zavřená)
    const id = setInterval(tick, POLL_MS);
    // zkontroluj i při návratu na kartu a po obnovení připojení — levné a svižné
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', tick);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', tick);
    };
  }, [check]);

  return { updateAvailable: latest != null, latest, running: RUNNING_VERSION };
}
