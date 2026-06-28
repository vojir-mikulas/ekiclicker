import { useState, useEffect } from 'react';
import { useEngine } from '../../hooks/useEngine.js';
import { fmt } from '../../game/format.js';
import { difficultyScale } from '../../game/formulas.js';
import { FORGIVE_IMG } from '../../game/data/texts.js';
import Modal from './Modal.jsx';

export default function RebirthModal({ onClose }) {
  const engine = useEngine();
  const [step, setStep] = useState('confirm');
  const [imgOk, setImgOk] = useState(true);
  const gain = engine.forgivenessGain();
  const diff = difficultyScale(engine.state);

  const confirm = () => {
    if (engine.rebirth()) {
      // zmraz hru, ať oslavná fanfára zazní načisto (auto-zbraně jinak hned
      // zabíjejí nové Eky → úderový zvuk by celebraci přebil); odmrazí se při
      // zavření okna (cleanup efektu níže).
      engine.pause();
      setStep('done');
    } else {
      onClose();
    }
  };

  // pojistka: ať se hra rozmrazí i při zavření přes pozadí / Esc / odmount
  useEffect(() => () => engine.resume(), [engine]);

  return (
    <Modal onClose={onClose}>
      {step === 'confirm' ? (
        <>
          <h2 className="rebirth-title">Odpustit Tomášovi a začít znovu?</h2>
          <div className="rebirth-gain">+{fmt(gain)} 🕊</div>
          <p className="rebirth-desc">
            Vynuluje se <b>peníze, úroveň, zbraně i vylepšení</b>.<br />
            Odpuštění, prestige bonusy i úspěchy zůstávají napořád.
            {diff > 1.05 && (
              <>
                <br /><small>
                  Čím silnější prestige, tím tužší Ekiové: teď drží <b>×{fmt(diff)} HP</b>.
                  Pořád postoupíš dál než dřív — jen ne „zadarmo".
                </small>
              </>
            )}
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
