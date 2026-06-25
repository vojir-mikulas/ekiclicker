import { EngineProvider } from './state/EngineContext.jsx';
import { AccountProvider } from './state/AccountContext.jsx';
import Game from './components/Game.jsx';

export default function App() {
  return (
    <EngineProvider>
      <AccountProvider>
        <Game />
      </AccountProvider>
    </EngineProvider>
  );
}
