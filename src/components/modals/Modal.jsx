/* Obecný overlay modal — zavře se křížkem nebo klikem na pozadí. */
export default function Modal({ onClose, className = '', children, showClose = true }) {
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
