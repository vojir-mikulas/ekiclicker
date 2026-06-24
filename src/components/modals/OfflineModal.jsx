import { fmt, fmtDuration } from '../../game/format.js';
import Modal from './Modal.jsx';

export default function OfflineModal({ offline, onClose }) {
  return (
    <Modal onClose={onClose} className="offline" showClose={false}>
      <h2>Vítej zpět! 👊</h2>
      <div className="offline-amount">+{fmt(offline.gold)} 🪙</div>
      <p className="offline-info">
        Byl jsi pryč {fmtDuration(offline.away)} — zbraně mezitím makaly za tebe.
      </p>
      <button className="offline-claim" onClick={onClose}>Super, beru!</button>
    </Modal>
  );
}
