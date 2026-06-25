/* Načítací overlay zobrazený, dokud se dolíne (lazy) chunk modalu — aby po
   kliknutí byla okamžitá zpětná vazba místo „nic se neděje". */
export default function ModalFallback() {
  return (
    <div className="popup" aria-busy="true">
      <div className="popup-content modal-loading">
        <span className="spinner" aria-label="Načítám…" />
      </div>
    </div>
  );
}
