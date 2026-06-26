import { EngineProvider } from './state/EngineContext.jsx';
import { AccountProvider } from './state/AccountContext.jsx';
import { WorldBossProvider } from './state/WorldBossProvider.jsx';
import { RaidProvider } from './state/RaidProvider.jsx';
import { GuildProvider } from './state/GuildProvider.jsx';
import Game from './components/Game.jsx';

export default function App() {
  return (
    <EngineProvider>
      <AccountProvider>
        <WorldBossProvider>
          <RaidProvider>
            <GuildProvider>
              <Game />
            </GuildProvider>
          </RaidProvider>
        </WorldBossProvider>
      </AccountProvider>
    </EngineProvider>
  );
}
