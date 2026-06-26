/* Herní potvrzovací dialog — náhrada za window.confirm (žádný systémový popup).
   Vykresluje se jako overlay nad rodičovským modalem. `danger` zčervená tlačítko. */
import Modal from './Modal.jsx';

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
  );
}
