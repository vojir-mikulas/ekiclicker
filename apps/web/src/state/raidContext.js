import { createContext } from 'react';

/* Oddělený soubor kvůli Fast Refresh (jako worldBossContext.js / accountContext.js). */
export const RaidContext = createContext(null);
