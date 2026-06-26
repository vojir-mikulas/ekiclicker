/* Pekelný výtah 🛗 — CECHOVNÍ aktivita (vstup z cechovní záložky). Tři fáze:
   lobby (rekord/žetony/„Sjet dolů" + krám), PEVNÝ 60s běh a výsledky. Lobby/výsledky
   jsou modal; BĚH je vlastní FULLSCREEN vrstva (ne modal!), ať přes ni letí projektily
   zbraní — poolované .proj/.dmg mají z-index ~120, ale .popup modal je 1000, takže by
   je schoval. Běh tak vypadá a hraje se jako hlavní obrazovka: klikáš (síla = úder) a
   zbraně (auto DPS) pálí na nepřítele, jen na čas a do hloubky. */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useEngine, useEngineFrame, useEngineSelector, useEngineEvent, shallowEqual } from '../../hooks/useEngine.js';
import Modal from '../modals/Modal.jsx';
import EffectsLayer from '../EffectsLayer.jsx';
import AbilityBar from '../arena/AbilityBar.jsx';
import HellShop from './HellShop.jsx';
import { fxRefs } from '../../effects/fxRefs.js';
import { CONFIG } from '../../game/config.js';
import { HELLEVATOR, hellEnemyAt, hellEnemyName, hellEnemyTier, isHellBossFloor, HELL_CURSES, HELL_CURSE_KEYS, hellCurseMult } from '../../game/data/hellevator.js';
import { PLACEHOLDER, REACTION_IMGS, REACTION_EMOJI } from '../../game/data/texts.js';
import { fmt } from '../../game/format.js';

const selPhase = (s) => s.hellRun?.phase || null;

export default function HellevatorModal({ onClose }) {
  const phase = useEngineSelector(selPhase);
  const [tab, setTab] = useState('lobby'); // lobby | shop

  // Běh = fullscreen vrstva mimo modal (viz hlavička) → projektily zbraní jsou vidět.
  if (phase === 'running') return <HellRun />;

  const cls = phase === 'done' ? 'hell hell-results-modal' : 'hell hell-lobby-modal';
  return (
    <Modal onClose={onClose} className={cls}>
      {phase === 'done' ? <HellResults />
        : tab === 'shop' ? <HellShop onBack={() => setTab('lobby')} />
        : <HellLobby onShop={() => setTab('shop')} />}
    </Modal>
  );
}

/* ----------------------------- lobby ----------------------------- */
const selLobby = (s) => ({
  best: s.hell?.bestFloor || 0,
  sira: Math.floor(s.sira || 0),
  curses: HELL_CURSE_KEYS.map((k) => (s.hellCurses && s.hellCurses[k] ? '1' : '0')).join(''),
});

function HellLobby({ onShop }) {
  const engine = useEngine();
  useEngineFrame(); // živý odpočet regenu žetonů
  const { best, sira } = useEngineSelector(selLobby, shallowEqual); // selLobby.curses drží re-render živý
  const curses = engine.state.hellCurses || {};
  const curseMult = hellCurseMult(curses);

  useEffect(() => {
    engine.tickHellPasses();
    const id = setInterval(() => engine.tickHellPasses(), 1000);
    return () => clearInterval(id);
  }, [engine]);

  const h = engine.state.hell;
  const passes = h.passes;
  const canRun = passes >= 1;
  const regenMs = passes < HELLEVATOR.passMax && h.passAt ? Math.max(0, h.passAt - Date.now()) : 0;

  return (
    <div className="hell-lobby">
      <div className="hell-title">🛗 Pekelný výtah</div>
      <p className="hell-tag">
        Cechovní sprint do pekla. Máš <b>přesně 60 s</b> — žádné prodlužování. Klikej
        a zbraněmi se probij co <b>nejhlouběji</b>. Každé patro = jeden zlý Eki. Tvoje
        nejhlubší patro je <b>příspěvek cechu</b>.
      </p>

      <div className="hell-lobby-stats">
        <div className="hell-stat">
          <span className="lbl">Rekord</span>
          <span className="val">{best > 0 ? `${best}. patro` : '—'}</span>
        </div>
        <div className="hell-stat">
          <span className="lbl">🔥 Síra</span>
          <span className="val">{fmt(sira)}</span>
        </div>
        <div className="hell-stat">
          <span className="lbl">🎟️ Žetony</span>
          <span className="val">{passes}/{HELLEVATOR.passMax}</span>
        </div>
      </div>

      {regenMs > 0 && (
        <div className="hell-regen">Další žeton za {fmtClock(regenMs)}</div>
      )}

      <div className="hell-curses">
        <div className="hell-curses-head">
          <span>💀 Kletby</span>
          <span className={'hell-curse-mult' + (curseMult > 1 ? ' on' : '')}>🔥 ×{curseMult.toFixed(2)}</span>
        </div>
        <div className="hell-curse-grid">
          {HELL_CURSE_KEYS.map((id) => {
            const c = HELL_CURSES[id];
            const on = !!curses[id];
            return (
              <button
                key={id}
                className={'hell-curse-chip' + (on ? ' on' : '')}
                onClick={() => engine.toggleHellCurse(id)}
                title={c.desc}
              >
                <span className="ico">{c.emoji}</span>
                <span className="nm">{c.name}</span>
                <span className="ef">{c.desc} · +{Math.round(c.mult * 100)} % 🔥</span>
              </button>
            );
          })}
        </div>
      </div>

      <button className="hell-go" disabled={!canRun} onClick={() => engine.startHellRun()}>
        {canRun ? <>🔻 Sjet dolů (−1 žeton){curseMult > 1 ? ` · 🔥 ×${curseMult.toFixed(2)}` : ''}</> : 'Došly žetony'}
      </button>

      <button className="hell-shop-link" onClick={onShop}>🔥 Pekelný krám</button>

      <p className="hell-foot">
        Odměna je 🔥 <b>Síra</b> — exkluzivní měna z výtahu. Skóre i Síra přežijí
        rebirth (mizí až s koncem sezóny).
      </p>
    </div>
  );
}

/* ----------------------------- běh (pevný 60s sprint) -----------------------------
   Fullscreen vrstva s arénou jako na hlavní obrazovce: fotka nepřítele, HP, zuřivost,
   velké „DEJ MU!" tlačítko. Mountuje EffectsLayer → sdílený FxManager pálí projektily
   zbraní + úderu na fxRefs.photoWrap (engine emituje 'hit'/'frenzy' jako hlavní hra). */
function HellRun() {
  useEngineFrame();
  const engine = useEngine();
  const r = engine.state.hellRun;

  const lastPunch = useRef(0);
  const reactTimer = useRef(0);
  const [reactSrc, setReactSrc] = useState(null);
  const [reactEmoji, setReactEmoji] = useState(null);
  const [imgMode, setImgMode] = useState(true);

  // Reakce fotky na zásah (klik i zbraně) — jako EnemyView na hlavní obrazovce.
  useEngineEvent(useCallback((type) => {
    if (type === 'hit' || type === 'react' || type === 'hellKill') {
      clearTimeout(reactTimer.current);
      if (imgMode) setReactSrc(REACTION_IMGS[(Math.random() * REACTION_IMGS.length) | 0]);
      else setReactEmoji(REACTION_EMOJI[(Math.random() * REACTION_EMOJI.length) | 0]);
      reactTimer.current = setTimeout(() => { setReactSrc(null); setReactEmoji(null); }, 500);
    }
    if (type === 'hellSpawn') { clearTimeout(reactTimer.current); setReactSrc(null); setReactEmoji(null); }
  }, [imgMode]));

  const punch = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    if (!e.nativeEvent?.isTrusted) return;
    const now = performance.now();
    if (now - lastPunch.current < CONFIG.minClickMs) return;
    lastPunch.current = now;
    engine.hellPunch();
  }, [engine]);

  if (!r) return null;
  const now = performance.now();
  const remaining = Math.max(0, r.endsAt - now);
  const panic = remaining <= 10_000;
  const secs = remaining / 1000;
  const v = hellEnemyAt(r.floor);
  const hpPct = r.maxHp > 0 ? Math.max(0, Math.min(100, (r.hp / r.maxHp) * 100)) : 0;
  const frenzyOn = now < r.frenzy.until;
  const frenzyPct = frenzyOn ? 100 : Math.min(100, (r.frenzy.charge / HELLEVATOR.frenzyClicksToFill) * 100);
  const boss = isHellBossFloor(r.floor);
  const curses = r.curses || [];

  return (
    <div className={'hell-run-screen' + (panic ? ' panic' : '')}>
      <EffectsLayer />

      <div className="hell-run-top">
        <div className="hell-floor">
          <span className="num">{r.floor}.</span>
          <span className="lbl">patro</span>
        </div>
        <div className={'hell-clock' + (panic ? ' panic' : '')}>
          <span className="t">{secs.toFixed(panic ? 1 : 0)}</span>
          <span className="u">s</span>
        </div>
        {curses.length > 0 && (
          <div className="hell-run-curses">
            {curses.map((id) => (
              <span key={id} className="hell-run-curse" title={HELL_CURSES[id]?.desc}>{HELL_CURSES[id]?.emoji}</span>
            ))}
            <span className="hell-run-curse mult">🔥×{(r.curseMult || 1).toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className={'hell-arena' + (boss ? ' boss' : '')} ref={(el) => (fxRefs.arena = el)}>
        <div className={'frenzy-bar' + (frenzyOn ? ' active' : '') + (r.noFrenzy ? ' silenced' : '')}>
          <span className="lbl">{r.noFrenzy ? '🤐 Umlčeno' : frenzyOn ? '😡 Zuřivost!' : 'Zuřivost'}</span>
          <div className="fill" style={{ width: (r.noFrenzy ? 0 : frenzyPct) + '%' }} />
        </div>

        <div className={'enemy-name' + (boss ? ' boss' : '')}>{hellEnemyName(r.floor)}</div>
        <div className="enemy-tier">{boss ? '☠️ ' : ''}{hellEnemyTier(r.floor)}</div>

        <div
          className="photo-wrap hell-photo"
          ref={(el) => (fxRefs.photoWrap = el)}
          onPointerDown={punch}
          style={{ '--glow': v.glow }}
        >
          <div className="photo-glow" style={{ background: v.glow }} />
          {imgMode ? (
            <img
              className="photo"
              src={reactSrc || PLACEHOLDER}
              alt={hellEnemyName(r.floor)}
              style={{ filter: v.filter || 'none' }}
              onError={() => setImgMode(false)}
              draggable={false}
            />
          ) : (
            <div className="face-fallback" style={{ filter: v.filter || 'none' }}>{reactEmoji || '😈'}</div>
          )}
          <div className="tint" style={{ background: v.tint || 'transparent', opacity: v.tint ? 1 : 0 }} />
        </div>

        <div className="hpbar hell-hp">
          <div className="hpfill" style={{ width: hpPct + '%' }} />
          <div className="hptext">{fmt(Math.ceil(r.hp))} / {fmt(r.maxHp)}</div>
        </div>
      </div>

      {/* Bojové rituály i tady — sdílí cooldown s hlavní hrou, burst míří do patra. */}
      <AbilityBar />

      <button className="punch-btn hell-punch" ref={(el) => (fxRefs.button = el)} tabIndex={-1} onPointerDown={punch}>
        DEJ MU! 👊
      </button>

      <div className="hell-run-foot">
        <span>{boss ? '☠️ Bossové patro!' : 'klikej a probíjej se hloub'}</span>
        <button className="hell-give" onClick={() => engine.finishHellRun()}>Vzdát</button>
      </div>
    </div>
  );
}

/* ----------------------------- výsledky ----------------------------- */
function HellResults() {
  const engine = useEngine();
  useEngineFrame();
  const r = engine.state.hellRun;
  if (!r || !r.summary) return null;
  const sum = r.summary;
  const passes = engine.state.hell.passes;

  const again = () => { engine.dismissHellRun(); engine.startHellRun(); };
  const back = () => { engine.dismissHellRun(); };

  return (
    <div className="hell-results">
      <div className="hell-res-burst">💥</div>
      <div className="hell-res-floor">
        {sum.deepestFloor > 0 ? <>Dno v <b>{sum.deepestFloor}.</b> patře</> : 'Ani první patro… 🔥'}
      </div>
      {sum.record && <div className="hell-res-record">🏆 Nový rekord! (bylo {sum.prevBest})</div>}

      <div className="hell-res-rows">
        <div className="hell-res-row"><span>🔥 Za patra</span><b>+{fmt(sum.base)}</b></div>
        {sum.curseBonus > 0 && <div className="hell-res-row curse"><span>💀 Kletby ×{(sum.curseMult || 1).toFixed(2)}</span><b>+{fmt(sum.curseBonus)}</b></div>}
        {sum.recordBonus > 0 && <div className="hell-res-row"><span>🏆 Bonus za rekord</span><b>+{fmt(sum.recordBonus)}</b></div>}
        {sum.dailyBonus > 0 && <div className="hell-res-row"><span>📅 První běh dne</span><b>+{fmt(sum.dailyBonus)}</b></div>}
        <div className="hell-res-row total"><span>🔥 Síra celkem</span><b>+{fmt(sum.sira)}</b></div>
      </div>

      <div className="hell-res-actions">
        <button className="hell-go" disabled={passes < 1} onClick={again}>
          {passes >= 1 ? '🔻 Znovu (−1 žeton)' : 'Došly žetony'}
        </button>
        <button className="hell-shop-link" onClick={back}>Zpět do lobby</button>
      </div>
    </div>
  );
}

/* mm:ss z ms */
function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m > 0 ? `${m}:${String(ss).padStart(2, '0')}` : `${ss} s`;
}
