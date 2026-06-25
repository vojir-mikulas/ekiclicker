import { useContext } from 'react';
import { RaidContext } from '../state/raidContext.js';

export function useRaid() {
  return useContext(RaidContext);
}
