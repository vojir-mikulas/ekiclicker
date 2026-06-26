import { useContext } from 'react';
import { GuildContext } from '../state/guildContext.js';

export function useGuild() {
  return useContext(GuildContext);
}
