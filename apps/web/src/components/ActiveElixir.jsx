import { useEngine, useEngineSelector, useEngineFrame } from '../hooks/useEngine.js';
import { ELIXIRS } from '../game/data/elixirs.js';
import { elixirImageUrl } from '../game/data/elixirImages.js';

/* Nápadný indikátor aktivního elixíru s živým odpočtem.
   Vnější komponenta se přerenderuje jen při změně aktivního elixíru (levný
   selektor); samotný odpočítávací pill jede přes useEngineFrame (per-frame),
   takže per-frame render je jen když buff opravdu běží. */
export default function ActiveElixir() {
  const id = useEngineSelector((s) => (s.elixir && s.elixir.active) || null);
  if (!id) return null;
  return <ActiveElixirPill id={id} />;
}

function ActiveElixirPill({ id }) {
  useEngineFrame(); // odpočet běží v čase → potřebujeme aktuální čas v renderu
  const engine = useEngine();
  const e = engine.state.elixir;
  const def = ELIXIRS[id];
  if (!def || !e) return null;

  const remaining = Math.max(0, e.until - Date.now());
  const pct = Math.max(0, Math.min(100, (remaining / def.durationMs) * 100));
  const secs = Math.ceil(remaining / 1000);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  const time = mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : `${ss} s`;
  const url = elixirImageUrl(id);

  return (
    <div className="elixir-active" title={`${def.name} — ${def.desc}`}>
      <span className="elixir-active-ico">
        {url ? <img src={url} alt="" /> : def.emoji}
      </span>
      <span className="elixir-active-txt">
        <span className="elixir-active-name">{def.name}</span>
        <span className="elixir-active-time">{time}</span>
      </span>
      <span className="elixir-active-bar"><span className="fill" style={{ width: pct + '%' }} /></span>
    </div>
  );
}
