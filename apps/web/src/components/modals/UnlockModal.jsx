/* Uvítací modal nové funkce — ukáže se JEDNOU, když hráč překročí úroveň, na
   které se funkce odemkne (engine emituje 'unlock'). Oslavný, jednoduchý: co to
   je, co s tím a tlačítko, které rovnou otevře danou funkci. Texty žijí ve
   featureUnlocks.js. Zavírá se křížkem (záměrně skrytým) jen přes tlačítka. */
import Modal from './Modal.jsx';
import { FEATURE_UNLOCKS } from '../../game/data/featureUnlocks.js';

export default function UnlockModal({ feature, onClose, onOpen }) {
  const cfg = FEATURE_UNLOCKS[feature];
  if (!cfg) return null;

  return (
    <Modal onClose={onClose} className="unlock-modal" showClose={false}>
      <div className="ul-confetti" aria-hidden="true">🎉✨🎊</div>
      <div className="ul-kicker">Nová funkce · úroveň {cfg.level}</div>
      <div className="ul-badge" aria-hidden="true">{cfg.emoji}</div>
      <h2 className="ul-title">{cfg.name}</h2>
      <p className="ul-tagline">{cfg.tagline}</p>
      <p className="ul-desc">{cfg.desc}</p>
      <ul className="ul-perks">
        {cfg.perks.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <div className="ul-actions">
        {cfg.open ? (
          <>
            <button className="ghost-btn" onClick={onClose}>Později</button>
            <button className="primary-btn" onClick={onOpen}>{cfg.cta}</button>
          </>
        ) : (
          <button className="primary-btn" onClick={onClose}>{cfg.cta}</button>
        )}
      </div>
    </Modal>
  );
}
