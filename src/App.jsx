import { EngineProvider } from './state/EngineContext.jsx';
import Game from './components/Game.jsx';

export default function App() {
  return (
    <EngineProvider>
      <Game />
    </EngineProvider>
  );
}
