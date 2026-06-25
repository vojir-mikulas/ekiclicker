/* Modal přechodu mezi sezónami — nelze zavřít křížkem ani pozadím.
   Hráč musí potvrdit reset; teprve pak se claimne odměna a začíná nová sezóna. */
import { useState } from 'react';
import Modal from './Modal.jsx';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt } from '../../game/format.js';

export default function SeasonEndModal() {
  const account = useAccount();
  const ps = account.pendingSeason; // { endedNumber, activeNumber, reward }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!ps) return null;
  const reward = ps.reward;

  const confirm = async () => {
    setBusy(true);
    setErr('');
    try {
      await account.enterSeason();
    } catch {
      setErr('Reset se nepodařil — zkus to prosím znovu.');
      setBusy(false);
    }
  };

  return (
    <Modal showClose={false} className="season-end">
      <div className="se-emoji">🏁</div>
      <h2 className="se-title">Sezóna {ps.endedNumber} skončila!</h2>
      {reward ? (
        <p className="se-desc">
          Umístil ses na <b>#{reward.rank}</b>. 🎉<br />
          Začíná <b>Sezóna {ps.activeNumber}</b> — všem se postup resetuje, ale za snahu si
          odnášíš <b>{fmt(reward.forgiveness)} 🕊</b> do nového startu
          {reward.rank === 1 ? ' a 👑 trofej šampiona' : ''}.
        </p>
      ) : (
        <p className="se-desc">
          Začíná <b>Sezóna {ps.activeNumber}</b> — postup se resetuje a závodí se znovu od nuly.
          Hodně štěstí! 🚀
        </p>
      )}
      {err && <p className="se-err">{err}</p>}
      <button className="primary-btn" disabled={busy} onClick={confirm}>
        {busy ? 'Resetuji…' : `Začít Sezónu ${ps.activeNumber} 🚀`}
      </button>
    </Modal>
  );
}
