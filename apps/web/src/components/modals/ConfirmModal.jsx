/* Herní potvrzovací dialog — náhrada za window.confirm (žádný systémový popup).
   Vždy overlay (i nad stránkovým modalem) — proto si vynutí 'popup' režim.
   `danger` zčervená tlačítko. */
import Modal from './Modal.jsx';
import { ModalModeContext } from './modalMode.js';

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Potvrdit',
  cancelLabel = 'Zrušit',
  danger = false,
  onConfirm,
  onClose,
}) {
  return (
    <ModalModeContext.Provider value="popup">
      <Modal onClose={onClose} className="confirm-modal">
        <h2>{title}</h2>
        {message && <p className="confirm-msg">{message}</p>}
        <div className="confirm-btns">
          <button className="confirm-cancel" onClick={onClose}>{cancelLabel}</button>
          <button
            className={'confirm-ok' + (danger ? ' danger' : '')}
            onClick={() => { onConfirm?.(); onClose?.(); }}
          >{confirmLabel}</button>
        </div>
      </Modal>
    </ModalModeContext.Provider>
  );
}
