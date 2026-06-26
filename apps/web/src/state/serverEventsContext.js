import { createContext } from 'react';

/* Oddělený soubor kvůli Fast Refresh (jako accountContext.js / engineContext.js). */
export const ServerEventsContext = createContext(null);
