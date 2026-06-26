import { createContext } from 'react';

/* Režim vykreslení sdíleného <Modal> wrapperu:
   - 'popup' (výchozí) → klasický overlay přes celou obrazovku
   - 'page'            → vsazená stránka v hlavním obsahu (jako záložky Boss/Cech…)
   Potvrzovací dialogy (ConfirmModal) si vždy vynutí 'popup', ať překryjí stránku. */
export const ModalModeContext = createContext('popup');
