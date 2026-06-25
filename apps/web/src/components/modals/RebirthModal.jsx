import { useState } from 'react';
import { useEngine } from '../../hooks/useEngine.js';
import { fmt } from '../../game/format.js';
import { FORGIVE_IMG } from '../../game/data/texts.js';
import Modal from './Modal.jsx';

export default function RebirthModal({ onClose }) {
  const engine = useEngine();
  const [step, setStep] = useState('confirm');
  const [imgOk, setImgOk] = useState(true);
  const gain = engine.forgivenessGain();

  const confirm = () => {
    if (engine.rebirth()) setStep('done');
    else onClose();
  };

  return (
    <Modal onClose={onClose}>
      {step === 'confirm' ? (
        <>
          <h2 className="rebirth-title">Odpustit Tomášovi a začít znovu?</h2>
          <div className="rebirth-gain">+{fmt(gain)} 🕊</div>
          <p className="rebirth-desc">
            Vynuluje se <b>peníze, úroveň, zbraně i vylepšení</b>.<br />
            Odpuštění, prestige bonusy i úspěchy zůstávají napořád.
          </p>
          <div className="rebirth-actions">
            <button className="rebirth-cancel" onClick={onClose}>Ještě ne</button>
            <button className="rebirth-confirm" onClick={confirm}>Odpustit 🕊</button>
          </div>
        </>
      ) : (
        <>
          <h2>Právě jsi odklikl: „Pokud na tohle kliknu, všechno Tomášovi odpouštím.“</h2>
          {imgOk ? (
            <img src={FORGIVE_IMG} alt="fotkaOK" onError={() => setImgOk(false)} />
          ) : (
            <div style={{ fontSize: 120, textAlign: 'center' }}>🤝</div>
          )}
          <h1>Výborně. Díky moc.</h1>
        </>
      )}
    </Modal>
  );
}
