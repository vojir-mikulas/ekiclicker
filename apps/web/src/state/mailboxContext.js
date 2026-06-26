import { createContext } from 'react';

/* Oddělený soubor kvůli Fast Refresh (jako guildContext.js / raidContext.js). */
export const MailboxContext = createContext(null);
