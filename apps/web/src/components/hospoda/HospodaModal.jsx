/* Hospoda U Ekiho 🍺 — sezónní atrakce tématu „Kalba". Tři obrazovky:
   lobby (🍻 rundy + regen + volba hry), Čepování piva a Hospodské šipky.
   Vše je modal (žádné letící projektily → nemusí být fullscreen).
   Odměny počítá a CLAMPuje engine (bounded, dmgPct-free) — UI jen hraje. */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useEngine, useEngineFrame, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import Modal from '../modals/Modal.jsx';
import { HOSPODA, dartRingFor, dartsMaxScore } from '../../game/data/hospoda.js';
import { fmt } from '../../game/format.js';

const selTokens = (s) => ({
  tokens: s.pub?.tokens || 0,
  tokenAt: s.pub?.tokenAt || 0,
});

export default function HospodaModal({ onClose }) {
  const [tab, setTab] = useState('lobby'); // lobby | pour | darts
  return (
    <Modal onClose={onClose} className="hospoda pub-modal">
      {tab === 'pour' ? <PourGame onBack={() => setTab('lobby')} />
        : tab === 'darts' ? <DartsGame onBack={() => setTab('lobby')} />
        : <PubLobby onPlay={setTab} />}
    </Modal>
  );
}

/* ----------------------------- lobby ----------------------------- */
function PubLobby({ onPlay }) {
  const engine = useEngine();
  useEngineFrame(); // živý odpočet regenu rund
  const { tokens } = useEngineSelector(selTokens, shallowEqual);

  useEffect(() => {
    engine.tickPubTokens();
    const id = setInterval(() => engine.tickPubTokens(), 1000);
    return () => clearInterval(id);
  }, [engine]);

  const p = engine.state.pub;
  const regenMs = tokens < HOSPODA.tokenMax && p.tokenAt ? Math.max(0, p.tokenAt - Date.now()) : 0;
  const canPlay = tokens >= 1;

  return (
    <div className="mat-lobby">
      <div className="mat-title">🍺 Hospoda U Ekiho</div>
      <p className="mat-tag">
        Hospodské atrakce sezóny <b>Kalba</b>! Zacálej <b>🍻 rundu</b> a zkus
        štěstí i ruku — výhry jsou drobnost navrch (zlato, 💠 úlomky, 🕊 odpuštění),
        nic, co by ti pokazilo žebříček.
      </p>

      <div className="mat-tickets pub-tokens">
        <span className="mat-tk-ico">🍻</span>
        <span className="mat-tk-val">{tokens}/{HOSPODA.tokenMax}</span>
        <span className="mat-tk-lbl">rund</span>
        {regenMs > 0 && <span className="mat-tk-regen">další za {fmtClock(regenMs)}</span>}
      </div>

      <div className="mat-games">
        <button className="mat-game-card pub-pour" disabled={!canPlay} onClick={() => onPlay('pour')}>
          <span className="mat-game-emoji">🍺</span>
          <span className="mat-game-name">Čepování piva</span>
          <span className="mat-game-desc">Trefni dokonalou pěnu. 1 🍻</span>
        </button>
        <button className="mat-game-card pub-darts" disabled={!canPlay} onClick={() => onPlay('darts')}>
          <span className="mat-game-emoji">🎯</span>
          <span className="mat-game-name">Hospodské šipky</span>
          <span className="mat-game-desc">Naházej do středu na čas. 1 🍻</span>
        </button>
      </div>

      {!canPlay && <p className="mat-foot">Došly rundy — počkej na regen nebo se vrať zítra (denní dorovnání na {HOSPODA.freeDaily}).</p>}
    </div>
  );
}

/* ----------------------------- 🍺 Čepování piva ----------------------------- */
const POUR = HOSPODA.pour;

/* Barevná lišta podle pásem: pro každou pozici x∈[0,1] vyber pásmo s nejmenší
   odchylkou od středu (= nejlepší, jako engine.pourTier) a vykresli jeho barvu.
   Symetrické okolo středu 0.5 → uprostřed nejlepší pásmo, na krajích „spill". */
function pourGradient() {
  const samples = 48;
  const grad = [];
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const dev = Math.min(1, Math.abs(x - 0.5) * 2);
    const t = POUR.tiers.find((tt) => dev <= tt.max) || POUR.tiers[POUR.tiers.length - 1];
    grad.push(`${t.color} ${(x * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${grad.join(', ')})`;
}

function PourGame({ onBack }) {
  const engine = useEngine();
  useEngineFrame();
  const { tokens } = useEngineSelector(selTokens, shallowEqual);
  const [pos, setPos] = useState(0.5);
  const [result, setResult] = useState(null);
  const [frozen, setFrozen] = useState(null); // poslední zastavená pozice (pro značku)
  const posRef = useRef(0.5);
  const raf = useRef(0);
  const running = result == null;

  // plynulý přejezd ukazatele (trojúhelníková vlna 0..1..0) přes rAF
  useEffect(() => {
    if (!running) return;
    let start = 0;
    const period = POUR.sweepMs * 2;
    const loop = (t) => {
      if (!start) start = t;
      const ph = ((t - start) % period) / period;
      const p = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      posRef.current = p;
      setPos(p);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [running]);

  const tap = useCallback((e) => {
    if (e && !e.nativeEvent?.isTrusted) return; // jen skutečné kliknutí
    if (result) return;
    cancelAnimationFrame(raf.current);
    const at = posRef.current;
    setFrozen(at);
    const res = engine.pourBeer(at);
    if (!res) { setFrozen(null); return; } // chybí runda (gating)
    setResult(res);
  }, [engine, result]);

  const again = () => {
    if (tokens < 1) return;
    engine.dismissPour();
    setResult(null);
    setFrozen(null);
  };

  const markerPos = frozen != null ? frozen : pos;

  return (
    <div className="mat-screen pour">
      <button className="mat-back" onClick={onBack}>← Zpět</button>
      <div className="mat-screen-head">🍺 Čepování piva</div>
      <p className="mat-tag">Zastav ukazatel co nejblíž <b>středu</b> — tam je dokonalá pěna. Kraje = přelité.</p>

      <div className="pour-bar" onPointerDown={running ? tap : undefined} style={{ cursor: running ? 'pointer' : 'default' }}>
        <div className="pour-fill" style={{ background: pourGradient() }} />
        <div className="pour-center" />
        <div
          className={'pour-marker' + (result ? ' stopped' : '')}
          style={{ left: (markerPos * 100).toFixed(2) + '%' }}
        />
        <div className="pour-glass">🍺</div>
      </div>

      {result ? (
        <PourResult result={result} />
      ) : (
        <div className="wheel-odds">Klikni na lištu nebo na tlačítko ve správnou chvíli.</div>
      )}

      {result ? (
        <div className="mat-res-actions">
          <button className="mat-go" disabled={tokens < 1} onClick={again}>
            {tokens >= 1 ? '🍻 Čepovat znovu (−1 runda)' : 'Došly rundy'}
          </button>
          <button className="mat-back-link" onClick={() => { engine.dismissPour(); onBack(); }}>Zpět do hospody</button>
        </div>
      ) : (
        <button className="mat-go" onClick={tap}>🍻 Čepuj! (−1 runda)</button>
      )}
    </div>
  );
}

function PourResult({ result }) {
  const r = result || {};
  if (r.tierId === 'spill') {
    return <div className="wheel-result miss">💦 Přelité! Příští runda líp.</div>;
  }
  return (
    <div className={'wheel-result win' + (r.jackpot ? ' jackpot' : '')}>
      <span className="wr-head">{r.emoji} {r.label}</span>
      <span className="wr-prize">
        {r.gold > 0 && <b>+{fmt(r.gold)} 🪙</b>}
        {r.dust > 0 && <b>+{fmt(r.dust)} 💠</b>}
        {r.doves > 0 && <b>+{r.doves} 🕊️</b>}
      </span>
    </div>
  );
}

/* ----------------------------- 🎯 Hospodské šipky ----------------------------- */
const DARTS = HOSPODA.darts;

function DartsGame({ onBack }) {
  const phase = useEngineSelector((s) => s.pubDarts?.phase || null);
  const { tokens } = useEngineSelector(selTokens, shallowEqual);
  const engine = useEngine();

  if (phase === 'running') return <DartsRun />;
  if (phase === 'done') return <DartsResults onBack={onBack} />;

  return (
    <div className="mat-screen darts-screen">
      <button className="mat-back" onClick={onBack}>← Zpět</button>
      <div className="mat-screen-head">🎯 Hospodské šipky</div>
      <p className="mat-tag">
        Zaměřovač kmitá po terči. Máš <b>{DARTS.throws} šipek</b> a <b>{Math.round(DARTS.durationMs / 1000)} s</b>.
        Klikni na terč ve chvíli, kdy je kříž ve <b>středu</b> 🎯 — čím blíž, tím víc bodů.
      </p>
      <div className="darts-preview">🎯</div>
      <button className="mat-go" disabled={tokens < 1} onClick={() => engine.startDartsRound()}>
        {tokens >= 1 ? '🍻 Začít (−1 runda)' : 'Došly rundy'}
      </button>
    </div>
  );
}

let dartSeq = 1;

function DartsRun() {
  const engine = useEngine();
  const [reticle, setReticle] = useState({ x: 0.5, y: 0.5 });
  const [darts, setDarts] = useState([]);
  const [score, setScore] = useState(0);
  const [throwsLeft, setThrowsLeft] = useState(DARTS.throws);
  const [remaining, setRemaining] = useState(DARTS.durationMs);
  const retRef = useRef({ x: 0.5, y: 0.5 });
  const scoreRef = useRef(0);
  const throwsRef = useRef(0);
  const raf = useRef(0);
  const endsAt = useRef(performance.now() + DARTS.durationMs);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    cancelAnimationFrame(raf.current);
    engine.finishDartsRound(scoreRef.current, throwsRef.current);
  }, [engine]);

  // kmitání zaměřovače (Lissajous) + odpočet času přes rAF
  useEffect(() => {
    let start = 0;
    const loop = (t) => {
      if (!start) start = t;
      const e = t - start;
      const x = 0.5 + DARTS.amp * Math.sin((e * 2 * Math.PI) / DARTS.sweepXMs);
      const y = 0.5 + DARTS.amp * Math.sin((e * 2 * Math.PI) / DARTS.sweepYMs);
      retRef.current = { x, y };
      setReticle({ x, y });
      const left = Math.max(0, endsAt.current - performance.now());
      setRemaining(left);
      if (left <= 0) { finish(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    endsAt.current = performance.now() + DARTS.durationMs;
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [finish]);

  const shoot = useCallback((e) => {
    if (!e.nativeEvent?.isTrusted) return; // jen skutečné kliknutí
    if (done.current || throwsRef.current >= DARTS.throws) return;
    const { x, y } = retRef.current;
    const dist = Math.min(1, Math.hypot(x - 0.5, y - 0.5) / 0.5);
    const { ring } = dartRingFor(dist);
    scoreRef.current += ring.score;
    throwsRef.current += 1;
    setScore(scoreRef.current);
    setThrowsLeft(DARTS.throws - throwsRef.current);
    setDarts((cur) => [...cur, { id: dartSeq++, x, y, ring }]);
    if (throwsRef.current >= DARTS.throws) setTimeout(finish, 650); // chvilku ukázat poslední hod
  }, [finish]);

  const secs = remaining / 1000;
  const panic = remaining <= 4000;

  return (
    <div className="darts-run">
      <div className="duck-hud">
        <span className="duck-score">🎯 {score}</span>
        <span className="darts-throws">🎟 {throwsLeft} šipek</span>
        <span className={'duck-clock' + (panic ? ' panic' : '')}>{secs.toFixed(1)} s</span>
      </div>
      <div className="darts-board" onPointerDown={shoot}>
        <div className="darts-rings" />
        {darts.map((d) => (
          <span key={d.id} className="dart-stuck" style={{ left: (d.x * 100) + '%', top: (d.y * 100) + '%' }}>📌</span>
        ))}
        <div
          className="darts-reticle"
          style={{ left: (reticle.x * 100) + '%', top: (reticle.y * 100) + '%' }}
        >✛</div>
      </div>
      <button className="mat-give" onClick={finish}>Skončit</button>
    </div>
  );
}

function DartsResults({ onBack }) {
  const engine = useEngine();
  const r = engine.state.pubDarts;
  const { tokens } = useEngineSelector(selTokens, shallowEqual);
  if (!r || !r.summary) return null;
  const sum = r.summary;
  const again = () => { engine.dismissDartsRound(); engine.startDartsRound(); };

  return (
    <div className="mat-screen duck-results">
      <div className="duck-res-burst">🎯</div>
      <div className="duck-res-score">{sum.score} bodů <small>({sum.score >= dartsMaxScore() ? 'strop!' : `max ${dartsMaxScore()}`})</small></div>
      <div className="hell-res-rows">
        {sum.gold > 0 && <div className="hell-res-row"><span>🪙 Zlato</span><b>+{fmt(sum.gold)}</b></div>}
        {sum.dust > 0 && <div className="hell-res-row"><span>💠 Úlomky</span><b>+{fmt(sum.dust)}</b></div>}
        {sum.doves > 0 && <div className="hell-res-row"><span>🕊️ Odpuštění</span><b>+{sum.doves}</b></div>}
        {sum.gold === 0 && sum.dust === 0 && sum.doves === 0 && <div className="hell-res-row"><span>Nic…</span><b>0</b></div>}
      </div>
      <div className="mat-res-actions">
        <button className="mat-go" disabled={tokens < 1} onClick={again}>
          {tokens >= 1 ? '🍻 Znovu (−1 runda)' : 'Došly rundy'}
        </button>
        <button className="mat-back-link" onClick={() => { engine.dismissDartsRound(); onBack(); }}>Zpět do hospody</button>
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
