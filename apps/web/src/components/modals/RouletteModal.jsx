/* RULETA otevírání bedny (CS:GO styl).
   DŮLEŽITÉ: výsledek je už ZAÚČTOVANÝ enginem (engine._commitOpen) — tahle komponenta
   jen PŘEHRÁVÁ `state.pendingOpen` (pásek + index výhry). Zavření/skip/reload s výsledkem
   nehnou (kus už je v inventáři, bedna spotřebovaná, pendingOpen se neukládá). */
import { useState, useRef, useLayoutEffect } from 'react';
import { useEngine } from '../../hooks/useEngine.js';
import {
  CHESTS, itemEmoji, itemName, rarityName, rarityColor, affixLabel,
} from '../../game/data/items.js';
import { itemImageUrl } from '../../game/data/itemImages.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

const STRIDE = 88; // šířka buňky + mezera (px) — musí sedět s CSS .roul-cell

function Cell({ cell, win }) {
  const url = !cell.miss && cell.base ? itemImageUrl(cell.base) : null;
  return (
    <div className={'roul-cell' + (win ? ' win' : '') + (cell.miss ? ' miss' : '')}
      style={{ borderColor: cell.color, boxShadow: win ? `0 0 16px ${cell.color}` : undefined }}>
      {url
        ? <img className="roul-cell-img" src={url} alt="" draggable={false} />
        : <span className="roul-cell-emoji">{cell.emoji}</span>}
      <span className="roul-cell-bar" style={{ background: cell.color }} />
    </div>
  );
}

function ResultCard({ result }) {
  if (result.miss) {
    return (
      <div className="roul-result miss">
        <div className="roul-result-emoji">💨</div>
        <div className="roul-result-name">Prázdná bedna!</div>
        <div className="roul-result-sub">
          {result.refund ? `Útěcha: +${fmt(result.refund)} 💠` : 'Tentokrát nic… příště to vyjde.'}
        </div>
      </div>
    );
  }
  const it = result.item;
  const url = itemImageUrl(it.base);
  return (
    <div className="roul-result" style={{ borderColor: rarityColor(it) }}>
      {url
        ? <img className="roul-result-img" src={url} alt="" />
        : <div className="roul-result-emoji">{itemEmoji(it)}</div>}
      <div className="roul-result-name" style={{ color: rarityColor(it) }}>{itemName(it)}</div>
      <div className="roul-result-sub"><b style={{ color: rarityColor(it) }}>{rarityName(it)}</b> · ilvl {it.ilvl}</div>
      <ul className="roul-result-affixes">
        {it.affixes.map((a, i) => <li key={i}>{affixLabel(a)}</li>)}
      </ul>
    </div>
  );
}

export default function RouletteModal() {
  const engine = useEngine();
  const po = engine.state.pendingOpen;
  const viewportRef = useRef(null);
  const targetRef = useRef(0);
  const [tx, setTx] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [phase, setPhase] = useState('spin'); // 'spin' | 'done'

  useLayoutEffect(() => {
    if (!po) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const vw = viewportRef.current?.offsetWidth || 320;
    const jitter = (Math.random() - 0.5) * STRIDE * 0.5; // ať nestojí pixel-přesně na středu
    const target = -(po.landingIndex * STRIDE + STRIDE / 2 - vw / 2 + jitter);
    targetRef.current = target;
    if (reduce) { setTx(target); setAnimate(false); setPhase('done'); return undefined; }
    setTx(0); setAnimate(false); setPhase('spin');
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { setAnimate(true); setTx(target); });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [po]);

  if (!po) return null;
  const def = CHESTS[po.tier] || {};

  const skip = () => {
    if (phase === 'done') return;
    setAnimate(false);
    setTx(targetRef.current);
    setPhase('done');
  };
  const close = () => engine.dismissOpen();
  const again = () => engine.openChest(po.tier); // nová ruleta (Game komponentu přemountuje dle id)
  const hasMore = (engine.state.chests[po.tier] || 0) > 0;

  return (
    <Modal onClose={close} className="roulette-modal">
      <h2 style={{ color: def.glow }}>{def.emoji} {def.name}</h2>

      <div className="roul-viewport" ref={viewportRef} onClick={phase === 'spin' ? skip : undefined}>
        <div className="roul-marker" />
        <div
          className="roul-track"
          style={{ transform: `translateX(${tx}px)`, transition: animate ? 'transform 5.2s cubic-bezier(.12,.62,.16,1)' : 'none' }}
          onTransitionEnd={(e) => { if (e.propertyName === 'transform') setPhase('done'); }}
        >
          {po.strip.map((cell, i) => <Cell key={i} cell={cell} win={phase === 'done' && i === po.landingIndex} />)}
        </div>
      </div>

      {phase === 'spin' ? (
        <div className="roul-actions">
          <button className="roul-skip" onClick={skip}>Přeskočit ⏩</button>
        </div>
      ) : (
        <>
          <ResultCard result={po.result} />
          <div className="roul-actions">
            {hasMore && <button className="roul-again" onClick={again}>Otevřít další ({engine.state.chests[po.tier]})</button>}
            <button className="roul-close" onClick={close}>Hotovo</button>
          </div>
        </>
      )}
    </Modal>
  );
}
