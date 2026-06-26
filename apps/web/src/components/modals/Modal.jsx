import { useContext } from 'react';
import { ModalModeContext } from './modalMode.js';

/* Obecný wrapper obsahu. Podle ModalModeContext se vykreslí buď jako overlay
   (zavře se křížkem nebo klikem na pozadí), nebo jako vsazená stránka v obsahu
   (zpětné tlačítko místo křížku). */
export default function Modal({ onClose, className = '', children, showClose = true }) {
  const mode = useContext(ModalModeContext);

  if (mode === 'page') {
    return (
      <section className="modal-page">
        <div className={'popup-content as-page ' + className}>
          {showClose && (
            <button className="page-back" onClick={onClose}>
              ← Zpět
            </button>
          )}
          {children}
        </div>
      </section>
    );
  }

  return (
    <div
      className="popup"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={'popup-content ' + className}>
        {showClose && (
          <button className="closeBtn" onClick={onClose} aria-label="Zavřít">
            &times;
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
