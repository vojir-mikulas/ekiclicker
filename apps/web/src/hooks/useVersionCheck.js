/* Hlídá, jestli server neservíruje novější verzi hry, než kterou má načtenou
   tahle karta. Klient zná svou verzi ze zapečeného __APP_VERSION__ (Vite define);
   verzi serveru dostává přes sdílený SSE kanál (ServerEventsProvider) v `hello`
   — žádný polling. Po nasazení nové várky se server restartuje, EventSource se
   připojí na nový proces a dostane jeho verzi → rozdíl → banner.

   „Best-effort" — když SSE nejede / běžíme v devu, prostě se nic neukáže. */
import { useServerEvents } from './useServerEvents.js';

// Verze, se kterou byl sestavený TENHLE bundle (zapečená při buildu).
// V devu (bez buildu) může define chybět → fallback 'dev'.
const RUNNING_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function useVersionCheck() {
  const { version } = useServerEvents();
  // Banner jen v produkci a jen když server servíruje JINOU verzi než tahle karta.
  const updateAvailable =
    import.meta.env.PROD && typeof version === 'string' && version !== RUNNING_VERSION;
  return { updateAvailable, latest: version, running: RUNNING_VERSION };
}
