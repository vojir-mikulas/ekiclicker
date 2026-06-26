import { useState, useEffect, useMemo } from 'react';
import { ServerEventsContext } from './serverEventsContext.js';

/* Jeden sdílený SSE kanál (/api/events) pro celou appku. Nahrazuje klientský
   polling dvou věcí:
     - verze hry  → `version`  (banner „čerstvá várka", srovná se s __APP_VERSION__)
     - rotace sezóny → `seasonNumber` + `seasonEpoch` (++ při každé push události)

   EventSource se připojuje SÁM znovu — i po nasazení, kdy se server restartuje:
   spojení spadne, klient se připojí na nový proces a v `hello` dostane jeho
   verzi. Žádný manuální poll tedy není potřeba. Best-effort: když SSE neprojde
   (proxy strhne text/event-stream apod.), prostě se nic nepushne — banner ani
   sezónní modal se neukážou přes tento kanál (sezónu jistí i 20s score-sync). */
export function ServerEventsProvider({ children }) {
  const [version, setVersion] = useState(null);
  const [seasonNumber, setSeasonNumber] = useState(null);
  const [seasonEpoch, setSeasonEpoch] = useState(0); // ++ jen při 'season' události, ne při 'hello'
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es = null;
    let closed = false;

    const onHello = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof d.version === 'string') setVersion(d.version);
        if (typeof d.season === 'number') setSeasonNumber(d.season);
      } catch { /* ignoruj nevalidní rámec */ }
    };
    const onSeason = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof d.number === 'number') {
          setSeasonNumber(d.number);
          setSeasonEpoch((x) => x + 1); // signál pro AccountProvider → checkSeason()
        }
      } catch { /* ignoruj */ }
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource('/api/events');
      es.addEventListener('hello', onHello);
      es.addEventListener('season', onSeason);
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false); // EventSource se zkusí připojit sám
    };

    connect();

    // po probuzení karty / obnově sítě nakopni reconnect, když spojení spadlo na CLOSED
    const nudge = () => {
      if (closed) return;
      if (!es || es.readyState === 2 /* CLOSED */) { es?.close(); connect(); }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') nudge(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', nudge);

    return () => {
      closed = true;
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', nudge);
    };
  }, []);

  const value = useMemo(
    () => ({ connected, version, seasonNumber, seasonEpoch }),
    [connected, version, seasonNumber, seasonEpoch],
  );
  return <ServerEventsContext.Provider value={value}>{children}</ServerEventsContext.Provider>;
}
