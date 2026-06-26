import { useEngineSelector } from '../hooks/useEngine.js';
import { ELIXIRS } from '../game/data/elixirs.js';

/* „Jen tak pro radost" — některé elixíry obarví celou obrazovku, dokud běží.
   Data-driven přes def.screenFilter v data/elixirs.js (CSS filtr string).

   Proč backdrop-filter veil a ne filter na rootu: FX (projektily/mince) visí
   na document.body MIMO .app-shell, a uvnitř .app-shell je spousta position:
   fixed prvků (toasty/modaly/banner). Filtr na rootu by jim přepsal
   containing-block (fixed by se kotvily k app-shell, ne k viewportu). Fixní
   veil s pointer-events:none nic neposouvá, jen probarví pixely za sebou a
   proklikne se. Mount jen když buff opravdu běží → nulová režie jindy. */
export default function ElixirScreenFx() {
  const filter = useEngineSelector((s) => {
    const id = s.elixir && s.elixir.active;
    return (id && ELIXIRS[id] && ELIXIRS[id].screenFilter) || null;
  });
  if (!filter) return null;
  return (
    <div
      className="elixir-veil"
      aria-hidden="true"
      style={{ backdropFilter: filter, WebkitBackdropFilter: filter }}
    />
  );
}
