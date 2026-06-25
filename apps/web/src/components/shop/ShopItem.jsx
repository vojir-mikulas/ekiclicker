/* Prezentační dlaždice obchodu (žádný stav). */
export default function ShopItem({ emoji, name, lvl, lvlColor, meta, cost, costClass, disabled, equipped, locked, onClick }) {
  return (
    <button
      className={'item' + (equipped ? ' equipped' : '') + (locked ? ' locked-tier' : '')}
      disabled={disabled}
      onClick={onClick}
    >
      <div className="emoji">{emoji}</div>
      <div className="body">
        <div className="name">
          {name}
          {lvl != null && <span className="lvl" style={lvlColor ? { color: lvlColor } : undefined}>{lvl}</span>}
        </div>
        <div className="meta">{meta}</div>
      </div>
      <div className={'cost ' + (costClass || '')}>{cost}</div>
    </button>
  );
}
