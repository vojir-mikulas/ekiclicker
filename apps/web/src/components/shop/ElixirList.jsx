import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { ELIXIRS, ELIXIR_KEYS, elixirCostAt } from '../../game/data/elixirs.js';
import { buyBatch } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import { elixirImageUrl } from '../../game/data/elixirImages.js';

const trigger = (s) => [
  s.gold,
  s.buyAmount,
  s.elixir.active,
  ...ELIXIR_KEYS.map((k) => s.elixirStock[k] || 0),
];

function durLabel(ms) {
  return ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`;
}

function ElixirIcon({ def }) {
  const url = elixirImageUrl(def.id);
  return url
    ? <img className="elixir-img" src={url} alt="" />
    : <span className="emoji">{def.emoji}</span>;
}

export default function ElixirList() {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const s = engine.state;

  return (
    <div className="shop-scroll">
      {ELIXIR_KEYS.map((key) => {
        const def = ELIXIRS[key];
        const stock = s.elixirStock[key] || 0;
        const batch = buyBatch(elixirCostAt(s, key), s.gold, s.buyAmount);
        const can = batch.count > 0 && s.gold >= batch.cost;
        const amt = batch.count > 1 ? `${batch.count}× ` : '';
        const isActive = s.elixir.active === key;
        return (
          <div className={'elixir-row' + (isActive ? ' active' : '')} key={key}>
            <div className="elixir-ico"><ElixirIcon def={def} /></div>
            <div className="body">
              <div className="name">
                {def.name}
                {stock > 0 && <span className="lvl">×{stock}</span>}
              </div>
              <div className="meta">{def.desc} · {durLabel(def.durationMs)}</div>
            </div>
            <div className="elixir-actions">
              <button className="elixir-buy" disabled={!can} onClick={() => engine.buyElixir(key)}>
                {amt}{fmt(batch.cost)} 🪙
              </button>
              <button
                className={'elixir-drink' + (isActive ? ' on' : '')}
                disabled={stock <= 0}
                onClick={() => engine.drinkElixir(key)}
              >
                {isActive ? 'Aktivní' : 'Vypít'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
