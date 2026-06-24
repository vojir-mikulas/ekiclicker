import { createContext } from 'react';

/* Drží instanci enginu. Oddělené od provideru kvůli React Fast Refresh. */
export const EngineContext = createContext(null);
