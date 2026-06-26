/* Matějská pouť 🎡 — sezónní atrakce tématu „Matějská". Tři obrazovky:
   lobby (🎟️ lístky + regen + volba hry), Kolo štěstí a Střelnice na kachny.
   Vše je modal (žádné letící projektily jako u výtahu → nemusí být fullscreen).
   Odměny počítá a CLAMPuje engine (bounded, dmgPct-free) — UI jen hraje. */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useEngine, useEngineFrame, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import Modal from '../modals/Modal.jsx';
import { MATEJSKA, wheelTotalWeight } from '../../game/data/matejska.js';
import { fmt } from '../../game/format.js';

const selTickets = (s) => ({
  tickets: s.fair?.tickets || 0,
  ticketAt: s.fair?.ticketAt || 0,
});

export default function MatejskaModal({ onClose }) {
  const [tab, setTab] = useState('lobby'); // lobby | wheel | duck
  return (
    <Modal onClose={onClose} className="matejska mat-modal">
      {tab === 'wheel' ? <WheelGame onBack={() => setTab('lobby')} />
        : tab === 'duck' ? <DuckGame onBack={() => setTab('lobby')} />
        : <MatLobby onPlay={setTab} />}
    </Modal>
  );
}

/* ----------------------------- lobby ----------------------------- */
function MatLobby({ onPlay }) {
  const engine = useEngine();
  useEngineFrame(); // živý odpočet regenu lístků
  const { tickets } = useEngineSelector(selTickets, shallowEqual);

  useEffect(() => {
    engine.tickFairTickets();
    const id = setInterval(() => engine.tickFairTickets(), 1000);
    return () => clearInterval(id);
  }, [engine]);

  const f = engine.state.fair;
  const regenMs = tickets < MATEJSKA.ticketMax && f.ticketAt ? Math.max(0, f.ticketAt - Date.now()) : 0;
  const canPlay = tickets >= 1;

  return (
    <div className="mat-lobby">
      <div className="mat-title">🎡 Matějská pouť</div>
      <p className="mat-tag">
        Pouťové atrakce sezóny <b>Matějská</b>! Zacálej <b>🎟️ lístek</b> a zkus
        štěstí — výhry jsou drobnost navrch (zlato, 💠 úlomky, 🕊 odpuštění, zuřivost),
        nic, co by ti pokazilo žebříček.
      </p>

      <div className="mat-tickets">
        <span className="mat-tk-ico">🎟️</span>
        <span className="mat-tk-val">{tickets}/{MATEJSKA.ticketMax}</span>
        <span className="mat-tk-lbl">lístků</span>
        {regenMs > 0 && <span className="mat-tk-regen">další za {fmtClock(regenMs)}</span>}
      </div>

      <div className="mat-games">
        <button className="mat-game-card wheel" disabled={!canPlay} onClick={() => onPlay('wheel')}>
          <span className="mat-game-emoji">🎡</span>
          <span className="mat-game-name">Kolo štěstí</span>
          <span className="mat-game-desc">Zatoč a urvi výhru. 1 🎟️</span>
        </button>
        <button className="mat-game-card duck" disabled={!canPlay} onClick={() => onPlay('duck')}>
          <span className="mat-game-emoji">🦆</span>
          <span className="mat-game-name">Střelnice</span>
          <span className="mat-game-desc">Sestřel kachny na čas. 1 🎟️</span>
        </button>
      </div>

      {!canPlay && <p className="mat-foot">Došly lístky — počkej na regen nebo se vrať zítra (denní dorovnání na {MATEJSKA.freeDaily}).</p>}
    </div>
  );
}

/* ----------------------------- 🎡 Kolo štěstí ----------------------------- */
const SEGS = MATEJSKA.wheel.segments;
const SEG_DEG = 360 / SEGS.length;

function wheelGradient() {
  const stops = SEGS.map((s, i) => `${s.color} ${i * SEG_DEG}deg ${(i + 1) * SEG_DEG}deg`);
  return `conic-gradient(from ${-SEG_DEG / 2}deg, ${stops.join(', ')})`;
}

function WheelGame({ onBack }) {
  const engine = useEngine();
  useEngineFrame();
  const { tickets } = useEngineSelector(selTickets, shallowEqual);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const spin = useCallback(() => {
    if (spinning) return;
    const res = engine.spinWheel();
    if (!res) return; // chybí lístek
    setResult(null);
    setSpinning(true);
    // dotoč tak, aby střed výseče res.index skončil nahoře pod ukazatelem.
    // Gradient má `from -SEG_DEG/2` → střed výseče i je na absolutním úhlu i*SEG_DEG.
    const target = -(res.index * SEG_DEG);
    const jitter = (Math.random() - 0.5) * SEG_DEG * 0.6;
    const current = ((rot % 360) + 360) % 360;
    let delta = ((target + jitter - current) % 360 + 360) % 360;
    const next = rot + 360 * 5 + delta;
    setRot(next);
    timer.current = setTimeout(() => {
      engine.settleWheel();
      setSpinning(false);
      setResult(res);
    }, MATEJSKA.wheel.spinMs);
  }, [engine, rot, spinning]);

  return (
    <div className="mat-screen wheel">
      <button className="mat-back" onClick={onBack}>← Zpět</button>
      <div className="mat-screen-head">🎡 Kolo štěstí</div>

      <div className="wheel-stage">
        <div className="wheel-pointer">▼</div>
        <div
          className="wheel-disc"
          style={{
            background: wheelGradient(),
            transform: `rotate(${rot}deg)`,
            transition: spinning ? `transform ${MATEJSKA.wheel.spinMs}ms cubic-bezier(.17,.67,.2,1)` : 'none',
          }}
        >
          {SEGS.map((s, i) => (
            <span
              key={s.id}
              className="wheel-label"
              style={{ transform: `rotate(${i * SEG_DEG}deg) translateY(-78px) rotate(${-(i * SEG_DEG)}deg)` }}
            >
              {s.emoji}
            </span>
          ))}
          <div className="wheel-hub">🎪</div>
        </div>
      </div>

      {result ? (
        <WheelResult result={result} />
      ) : (
        <div className="wheel-odds">Šance: {SEGS.map((s) => `${s.emoji} ${Math.round((s.weight / wheelTotalWeight()) * 100)}%`).join('  ·  ')}</div>
      )}

      <button className="mat-go" disabled={spinning || tickets < 1} onClick={spin}>
        {spinning ? 'Točí se…' : tickets >= 1 ? '🎟️ Zatoč (−1 lístek)' : 'Došly lístky'}
      </button>
    </div>
  );
}

function WheelResult({ result }) {
  const seg = SEGS.find((s) => s.id === result.segId) || SEGS[result.index];
  const r = result.reward || {};
  if (r.kind === 'none') {
    return <div className="wheel-result miss">🥨 Smůla! Příště to vyjde.</div>;
  }
  return (
    <div className={'wheel-result win' + (r.jackpot ? ' jackpot' : '')}>
      <span className="wr-head">{r.jackpot ? '🎰 JACKPOT!' : `${seg.emoji} ${seg.label}`}</span>
      <span className="wr-prize">
        {r.gold > 0 && <b>+{fmt(r.gold)} 🪙</b>}
        {r.dust > 0 && <b>+{fmt(r.dust)} 💠</b>}
        {r.doves > 0 && <b>+{r.doves} 🕊️</b>}
        {r.frenzy && <b>😡 Zuřivost!</b>}
      </span>
    </div>
  );
}

/* ----------------------------- 🦆 Střelnice ----------------------------- */
const DUCK = MATEJSKA.duck;
let duckSeq = 1;

function DuckGame({ onBack }) {
  const engine = useEngine();
  const phase = useEngineSelector((s) => s.fairRun?.phase || null);
  const { tickets } = useEngineSelector(selTickets, shallowEqual);

  if (phase === 'running') return <DuckRun />;
  if (phase === 'done') return <DuckResults onBack={onBack} />;

  return (
    <div className="mat-screen duck">
      <button className="mat-back" onClick={onBack}>← Zpět</button>
      <div className="mat-screen-head">🦆 Střelnice</div>
      <p className="mat-tag">
        Máš <b>{Math.round(DUCK.durationMs / 1000)} s</b>. Klikej na kachny, co plavou
        přes lavici — každá trefa se počítá. Zlaté 🦆 dávají víc. Trefy = výhra
        (zlato, 💠, 🕊).
      </p>
      <div className="duck-preview">🦆 🦆 🦆 <span className="gold">🦆</span> 🦆</div>
      <button className="mat-go" disabled={tickets < 1} onClick={() => engine.startDuckRun()}>
        {tickets >= 1 ? '🎟️ Začít (−1 lístek)' : 'Došly lístky'}
      </button>
    </div>
  );
}

function DuckRun() {
  const engine = useEngine();
  const [ducks, setDucks] = useState([]);
  const [hits, setHits] = useState(0);
  const [remaining, setRemaining] = useState(DUCK.durationMs);
  const hitsRef = useRef(0);
  const endsAt = useRef(performance.now() + DUCK.durationMs);

  // spawn + odpočet + úklid; po vypršení času ukonči běh s naskákanými trefy
  useEffect(() => {
    endsAt.current = performance.now() + DUCK.durationMs;
    const spawn = setInterval(() => {
      setDucks((cur) => {
        if (cur.length >= DUCK.maxConcurrent) return cur;
        const golden = Math.random() < DUCK.goldenChance;
        const fromLeft = Math.random() < 0.5;
        return [...cur, {
          id: duckSeq++,
          y: 14 + Math.random() * 60,        // % výšky lavice
          from: fromLeft ? 'left' : 'right',
          golden,
        }];
      });
    }, DUCK.spawnEveryMs);

    const tick = setInterval(() => {
      const left = Math.max(0, endsAt.current - performance.now());
      setRemaining(left);
      if (left <= 0) {
        clearInterval(spawn); clearInterval(tick);
        engine.finishDuckRun(hitsRef.current);
      }
    }, 100);

    return () => { clearInterval(spawn); clearInterval(tick); };
  }, [engine]);

  const shoot = useCallback((e, duck) => {
    if (!e.nativeEvent?.isTrusted) return;        // jen skutečné kliknutí
    e.stopPropagation();
    setDucks((cur) => cur.filter((d) => d.id !== duck.id));
    const inc = duck.golden ? DUCK.goldenMult : 1;
    hitsRef.current += inc;
    setHits(hitsRef.current);
  }, []);

  const removeMissed = useCallback((id) => {
    setDucks((cur) => cur.filter((d) => d.id !== id));
  }, []);

  const secs = remaining / 1000;
  const panic = remaining <= 4000;

  return (
    <div className="duck-run">
      <div className="duck-hud">
        <span className="duck-score">🎯 {hits}</span>
        <span className={'duck-clock' + (panic ? ' panic' : '')}>{secs.toFixed(1)} s</span>
      </div>
      <div className="duck-field">
        {ducks.map((d) => (
          <button
            key={d.id}
            className={'duck' + (d.golden ? ' golden' : '') + ' from-' + d.from}
            style={{ top: d.y + '%', animationDuration: DUCK.lifeMs + 'ms' }}
            onPointerDown={(e) => shoot(e, d)}
            onAnimationEnd={() => removeMissed(d.id)}
            tabIndex={-1}
          >
            {d.golden ? '🦆' : '🦆'}
          </button>
        ))}
        <div className="duck-water" />
      </div>
      <button className="mat-give" onClick={() => engine.finishDuckRun(hitsRef.current)}>Skončit</button>
    </div>
  );
}

function DuckResults({ onBack }) {
  const engine = useEngine();
  const r = engine.state.fairRun;
  const { tickets } = useEngineSelector(selTickets, shallowEqual);
  if (!r || !r.summary) return null;
  const sum = r.summary;
  const again = () => { engine.dismissDuckRun(); engine.startDuckRun(); };

  return (
    <div className="mat-screen duck-results">
      <div className="duck-res-burst">🎯</div>
      <div className="duck-res-score">{sum.hits} {sum.hits === 1 ? 'trefa' : 'trefy/trefů'}</div>
      <div className="hell-res-rows">
        {sum.gold > 0 && <div className="hell-res-row"><span>🪙 Zlato</span><b>+{fmt(sum.gold)}</b></div>}
        {sum.dust > 0 && <div className="hell-res-row"><span>💠 Úlomky</span><b>+{fmt(sum.dust)}</b></div>}
        {sum.doves > 0 && <div className="hell-res-row"><span>🕊️ Odpuštění</span><b>+{sum.doves}</b></div>}
        {sum.gold === 0 && sum.dust === 0 && sum.doves === 0 && <div className="hell-res-row"><span>Nic…</span><b>0</b></div>}
      </div>
      <div className="mat-res-actions">
        <button className="mat-go" disabled={tickets < 1} onClick={again}>
          {tickets >= 1 ? '🎟️ Znovu (−1 lístek)' : 'Došly lístky'}
        </button>
        <button className="mat-back-link" onClick={() => { engine.dismissDuckRun(); onBack(); }}>Zpět na pouť</button>
      </div>
    </div>
  );
}

/* mm:ss / s z ms */
function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m > 0 ? `${m}:${String(ss).padStart(2, '0')}` : `${ss} s`;
}
