import { useState, useEffect, useMemo } from 'react';
import { ServerEventsContext } from './serverEventsContext.js';
import { getToken } from '../net/api.js';

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
  const [mailEpoch, setMailEpoch] = useState(0);     // ++ při každém 'mail' push → signál pro MailboxProvider
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
    // nová zpráva do schránky — jen „nudge", pravdu si dotáhne MailboxProvider fetchem
    const onMail = () => setMailEpoch((x) => x + 1);

    const connect = () => {
      if (closed) return;
      // token v query (EventSource neumí hlavičky) → server přiřadí spojení hráči pro cílené push
      const t = getToken();
      es = new EventSource('/api/events' + (t ? `?token=${encodeURIComponent(t)}` : ''));
      es.addEventListener('hello', onHello);
      es.addEventListener('season', onSeason);
      es.addEventListener('mail', onMail);
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false); // EventSource se zkusí připojit sám
    };

    connect();

    // po probuzení karty / obnově sítě nakopni reconnect, když spojení spadlo na CLOSED
    const nudge = () => {
      if (closed) return;
      if (!es || es.readyState === 2 /* CLOSED */) { es?.close(); connect(); }
    };
    // přihlášení/odhlášení (setToken) → tvrdý reconnect s novou identitou
    const reconnect = () => { if (closed) return; es?.close(); connect(); };
    const onVisible = () => { if (document.visibilityState === 'visible') nudge(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', nudge);
    window.addEventListener('eki-token-changed', reconnect);

    return () => {
      closed = true;
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', nudge);
      window.removeEventListener('eki-token-changed', reconnect);
    };
  }, []);

  const value = useMemo(
    () => ({ connected, version, seasonNumber, seasonEpoch, mailEpoch }),
    [connected, version, seasonNumber, seasonEpoch, mailEpoch],
  );
  return <ServerEventsContext.Provider value={value}>{children}</ServerEventsContext.Provider>;
}
