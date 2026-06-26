/* Modal přechodu mezi sezónami — nelze zavřít křížkem ani pozadím.
   Hráč musí potvrdit reset; teprve pak se claimne odměna a začíná nová sezóna. */
import { useState } from 'react';
import Modal from './Modal.jsx';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt } from '../../game/format.js';
import { themeForSeason } from '../../game/data/seasonThemes.js';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function SeasonEndModal() {
  const account = useAccount();
  const ps = account.pendingSeason; // { endedNumber, activeNumber, reward }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!ps) return null;
  const reward = ps.reward;
  const gotMedal = reward && reward.rank <= 3; // top 3 → trvalá medaile na profilu
  const theme = themeForSeason(ps.activeNumber ?? null); // pasivní téma nadcházející sezóny

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
      <div className="se-emoji">{gotMedal ? MEDAL[reward.rank] : '🏁'}</div>
      <h2 className="se-title">Sezóna {ps.endedNumber} skončila!</h2>
      {reward ? (
        <p className="se-desc">
          Umístil ses na <b>#{reward.rank}</b>
          {gotMedal ? ' — získáváš medaili na profil!' : '.'} 🎉<br />
          Začíná <b>Sezóna {ps.activeNumber}</b> — začínáš s čistým štítem: úroveň, vybavení,
          mazlíčci, deník, denní úkoly i světový boss se resetují. Za snahu si ale odnášíš{' '}
          <b>{fmt(reward.forgiveness)} 🕊</b> do nového startu
          {reward.rank === 1 ? ' a 👑 trofej šampiona' : ''}.
        </p>
      ) : (
        <p className="se-desc">
          Začíná <b>Sezóna {ps.activeNumber}</b> — začínáš s čistým štítem: úroveň, vybavení,
          mazlíčci, deník, denní úkoly i světový boss se resetují a závodí se znovu od nuly.
          Hodně štěstí! 🚀
        </p>
      )}
      {theme && (
        <div className="se-theme">
          Téma nové sezóny: <b>{theme.emoji} {theme.label}</b> — {theme.blurb}
        </div>
      )}
      {err && <p className="se-err">{err}</p>}
      <button className="primary-btn" disabled={busy} onClick={confirm}>
        {busy ? 'Resetuji…' : `Začít Sezónu ${ps.activeNumber} 🚀`}
      </button>
    </Modal>
  );
}
