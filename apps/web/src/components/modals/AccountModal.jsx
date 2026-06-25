import { useState } from 'react';
import { validateNickname } from '@ekiclicker/shared';
import { useAccount } from '../../hooks/useAccount.js';
import { getToken } from '../../net/api.js';
import { accountErrorMessage } from '../../net/errors.js';
import Modal from './Modal.jsx';
import RecoveryCode from './RecoveryCode.jsx';

/* Účet připojeného hráče: přejmenování + kód pro obnovu. */
export default function AccountModal({ onClose }) {
  const account = useAccount();
  const [nickname, setNickname] = useState(account.player?.nickname || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const doRename = async (e) => {
    e.preventDefault();
    const v = validateNickname(nickname);
    if (!v.ok) { setError(v.error); return; }
    if (v.value === account.player?.nickname) { setError('To už je tvoje jméno.'); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      await account.rename(v.value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="account">
      <h2>🏷 Tvůj účet</h2>
      {account.offline && <p className="form-error">📴 Server je teď nedostupný — změny nemusí projít.</p>}

      <form onSubmit={doRename}>
        <label className="field-label" htmlFor="acc-nick">Přezdívka</label>
        <div className="inline-field">
          <input
            id="acc-nick"
            className="text-input"
            maxLength={24}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <button className="ghost-btn" type="submit" disabled={busy}>
            {busy ? '…' : saved ? '✓' : 'Přejmenovat'}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      <hr className="divider" />

      <label className="field-label">Kód pro obnovu</label>
      <p className="settings-note" style={{ margin: '0 0 8px', textAlign: 'left' }}>
        Tímto kódem obnovíš účet i postup na jiném zařízení nebo po smazání dat. Drž ho v tajnosti.
      </p>
      <RecoveryCode code={getToken() || ''} />
    </Modal>
  );
}
