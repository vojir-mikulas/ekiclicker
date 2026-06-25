import { useContext } from 'react';
import { WorldBossContext } from '../state/worldBossContext.js';

export function useWorldBoss() {
  return useContext(WorldBossContext);
}
