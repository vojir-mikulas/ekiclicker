import { useContext } from 'react';
import { ServerEventsContext } from '../state/serverEventsContext.js';

export function useServerEvents() {
  return useContext(ServerEventsContext);
}
