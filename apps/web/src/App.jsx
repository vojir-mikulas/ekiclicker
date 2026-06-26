import { ServerEventsProvider } from './state/ServerEventsProvider.jsx';
import { EngineProvider } from './state/EngineContext.jsx';
import { AccountProvider } from './state/AccountContext.jsx';
import { WorldBossProvider } from './state/WorldBossProvider.jsx';
import { RaidProvider } from './state/RaidProvider.jsx';
import { GuildProvider } from './state/GuildProvider.jsx';
import { MailboxProvider } from './state/MailboxProvider.jsx';
import Game from './components/Game.jsx';

export default function App() {
  return (
    <ServerEventsProvider>
      <EngineProvider>
        <AccountProvider>
          <WorldBossProvider>
            <RaidProvider>
              <GuildProvider>
                <MailboxProvider>
                  <Game />
                </MailboxProvider>
              </GuildProvider>
            </RaidProvider>
          </WorldBossProvider>
        </AccountProvider>
      </EngineProvider>
    </ServerEventsProvider>
  );
}
