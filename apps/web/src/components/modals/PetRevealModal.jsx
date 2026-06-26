/* REVEAL líhnutí vejce 🥚.
   DŮLEŽITÉ: výsledek je už ZAÚČTOVANÝ enginem (engine.openEgg → _hatchOne) — tahle
   komponenta jen PŘEHRÁVÁ `state.pendingEgg`. Zavření/reload s výsledkem nehnou
   (mazlíček už je tvůj, vejce spotřebované, pendingEgg se neukládá). */
import { useState, useEffect } from 'react';
import { useEngine } from '../../hooks/useEngine.js';
import { PETS, petEmoji, petName, petBonusLabel, petLevelCap, petRarityName, petRarityColor } from '../../game/data/pets.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

export default function PetRevealModal() {
  const engine = useEngine();
  const pe = engine.state.pendingEgg;
  const [open, setOpen] = useState(false);

  // krátká „prasklina" → odhalení (respektuje reduced-motion)
  useEffect(() => {
    if (!pe) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) { setOpen(true); return undefined; }
    setOpen(false);
    const t = setTimeout(() => setOpen(true), 650);
    return () => clearTimeout(t);
  }, [pe]);

  if (!pe) return null;
  const res = pe.result;
  const def = PETS[res.petId];
  const cap = petLevelCap(res.petId);

  const close = () => engine.dismissEgg();
  const again = () => engine.openEgg(); // nový reveal (Game přemountuje dle id)
  const hasMore = (engine.state.eggs || 0) > 0;

  return (
    <Modal onClose={close} className="pet-reveal-modal">
      <h2>🥚 Líhnutí</h2>

      <div className={'egg-stage' + (open ? ' open' : '')}>
        {!open ? (
          <div className="egg-shell">🥚</div>
        ) : (
          <div className="pet-reveal">
            <div className="pet-reveal-emoji">{petEmoji(res.petId)}</div>
            <div className="pet-reveal-name">{petName(res.petId)}</div>
            <div className="pet-reveal-rarity" style={{ color: petRarityColor(res.petId) }}>{petRarityName(res.petId)}</div>
            {res.isNew ? (
              <div className="pet-reveal-tag new">✨ NOVÝ MAZLÍČEK!</div>
            ) : res.maxed ? (
              <div className="pet-reveal-tag maxed">Už na maximu ({cap}) — útěcha: +{fmt(res.dust)} 💠</div>
            ) : (
              <div className="pet-reveal-tag up">⬆️ Úroveň {res.level}/{cap}</div>
            )}
            <div className="pet-reveal-bonus">{petBonusLabel(res.petId, res.level)}</div>
            {def && <div className="pet-reveal-desc">{def.desc}</div>}
          </div>
        )}
      </div>

      {open && (
        <div className="roul-actions">
          {hasMore && <button className="roul-again" onClick={again}>Vylíhnout další ({engine.state.eggs})</button>}
          <button className="roul-close" onClick={close}>Hotovo</button>
        </div>
      )}
    </Modal>
  );
}
