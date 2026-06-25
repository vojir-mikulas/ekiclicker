import { useState } from 'react';
import { validateNickname } from '@ekiclicker/shared';
import { useAccount } from '../../hooks/useAccount.js';
import { accountErrorMessage } from '../../net/errors.js';
import Modal from './Modal.jsx';
import RecoveryCode from './RecoveryCode.jsx';

/* Připojení k žebříčku (vynuluje postup) + obnova podle kódu + zobrazení kódu. */
export default function JoinModal({ onClose }) {
  const account = useAccount();
  const [mode, setMode] = useState('join'); // 'join' | 'recover' | 'done'
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const doJoin = async (e) => {
    e.preventDefault();
    const v = validateNickname(nickname);
    if (!v.ok) { setError(v.error); return; }
    setBusy(true); setError('');
    try {
      const res = await account.join(v.value);
      setRecoveryCode(res.recoveryCode || res.token);
      setMode('done');
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doRecover = async (e) => {
    e.preventDefault();
    if (!code.trim()) { setError('Vlož kód pro obnovu.'); return; }
    setBusy(true); setError('');
    try {
      await account.recover(code);
      onClose();
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'done') {
    return (
      <Modal onClose={onClose} className="join" showClose={false}>
        <h2>🏆 Jsi v žebříčku!</h2>
        <p className="join-lead">Ulož si svůj kód pro obnovu. Zadáním na jiném zařízení (nebo po smazání dat prohlížeče) si účet i postup obnovíš.</p>
        <RecoveryCode code={recoveryCode} />
        <button className="primary-btn" onClick={onClose}>Mám uloženo, jdu hrát</button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} className="join">
      {mode === 'join' ? (
        <>
          <h2>🏆 Připojit se k žebříčku</h2>
          <p className="join-warn">⚠️ Připojením začneš <b>od začátku</b> — tvůj současný postup se vynuluje. Žebříček tak má všichni férově od nuly.</p>
          <form onSubmit={doJoin}>
            <label className="field-label" htmlFor="join-nick">Přezdívka</label>
            <input
              id="join-nick"
              className="text-input"
              autoFocus
              maxLength={24}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Tvoje jméno do žebříčku"
            />
            {error && <p className="form-error">{error}</p>}
            <button className="primary-btn danger" type="submit" disabled={busy}>
              {busy ? 'Připojuji…' : 'Připojit a vynulovat postup'}
            </button>
          </form>
          <button className="link-btn" onClick={() => { setMode('recover'); setError(''); }}>
            Už mám účet — obnovit podle kódu
          </button>
        </>
      ) : (
        <>
          <h2>🔑 Obnova účtu</h2>
          <p className="join-lead">Vlož svůj kód pro obnovu. Načteme tvůj účet i uložený postup.</p>
          <form onSubmit={doRecover}>
            <label className="field-label" htmlFor="rec-code">Kód pro obnovu</label>
            <input
              id="rec-code"
              className="text-input"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="xxxxxxxx-xxxx-…"
            />
            {error && <p className="form-error">{error}</p>}
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? 'Obnovuji…' : 'Obnovit účet'}
            </button>
          </form>
          <button className="link-btn" onClick={() => { setMode('join'); setError(''); }}>
            ← Zpět na připojení
          </button>
        </>
      )}
    </Modal>
  );
}
