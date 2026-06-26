import { createContext } from 'react';

/* Oddělený soubor kvůli Fast Refresh (jako raidContext.js / accountContext.js). */
export const GuildContext = createContext(null);
