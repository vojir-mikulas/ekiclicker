/* ABSOLUCE 😇 — meta-prestige ("rebirth rebirthů", odemyká se na lvl 30000).
   Absoluce smete věž prestiže výměnou za ✨ Svatozář 😇; za ni se kupují TRVALÉ
   nebeské bonusy (přežijí i další absoluci). Re-render řízený podpisem svatozáře
   + levelů bonusů + nejvyšší úrovně (engine mutuje state na místě). */
import { useState } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { ASCENSION, ASCENSION_UPGRADES, ASCENSION_KEYS } from '../../game/data/ascension.js';
import { ascensionCost } from '../../game/formulas.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';
import ShopItem from '../shop/ShopItem.jsx';

const trigger = (s) => [
  Math.floor(s.stardust || 0), s.ascension?.ascends || 0, s.highestLevel,
  ...ASCENSION_KEYS.map((k) => s.ascension?.levels?.[k] || 0),
];

export default function VzestupModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual);
  const [confirm, setConfirm] = useState(false);
  const s = engine.state;
  const stardust = Math.floor(s.stardust || 0);
  const gain = engine.ascensionGain();
  const ascends = s.ascension?.ascends || 0;

  const doAscend = () => {
    setConfirm(false);
    engine.ascend();
  };

  return (
    <Modal onClose={onClose} className="vzestup-modal">
      <h2 className="vz-title">😇 Absoluce</h2>
      <p className="vz-head">
        ✨ Svatozář: <b>{fmt(stardust)} 😇</b> · absolucí: <b>{ascends}×</b>
      </p>

      <div className="vz-ascend">
        {gain >= 1 ? (
          confirm ? (
            <div className="vz-confirm">
              <p className="vz-warn">
                Absoluce <b>SMETE celou věž prestiže</b> — Věčný hněv, pěst, vše
                i nasbírané Odpuštění 🕊. Nebeské bonusy a sběratelské vrstvy
                (výbava, mazlíčci, mřížka…) zůstávají.
              </p>
              <div className="vz-confirm-actions">
                <button className="vz-cancel" onClick={() => setConfirm(false)}>Ještě ne</button>
                <button className="vz-go" onClick={doAscend}>Dát absoluci → +{fmt(gain)} 😇</button>
              </div>
            </div>
          ) : (
            <button className="vz-ascend-btn" onClick={() => setConfirm(true)}>
              <span className="vz-ascend-ico">😇</span>
              <span className="vz-ascend-txt">
                <b>Dát Ekimu absoluci</b>
                <small>+{fmt(gain)} ✨ Svatozář · smete prestiž</small>
              </span>
              <span className="vz-ascend-go">→</span>
            </button>
          )
        ) : (
          <p className="vz-locked">
            Absoluci půjde dát po dosažení úrovně <b>{fmt(ASCENSION.unlockLevel)}</b>{' '}
            (teď nejvýš {fmt(s.highestLevel)}). Čím výš dojdeš, tím víc svatozáře absoluce dá.
          </p>
        )}
      </div>

      <p className="vz-shop-head">💫 Nebeské bonusy — trvalé, přežijí i další absoluci</p>
      <div className="vz-shop">
        {ASCENSION_KEYS.map((key) => {
          const u = ASCENSION_UPGRADES[key];
          const lvl = s.ascension?.levels?.[key] || 0;
          const cost = ascensionCost(key, lvl);
          const can = stardust >= cost;
          return (
            <ShopItem
              key={key}
              emoji={u.emoji}
              name={u.name}
              lvl={`Lv ${lvl}`}
              lvlColor="#b388ff"
              meta={u.desc}
              cost={`${fmt(cost)} 😇`}
              costClass="stardust"
              disabled={!can}
              onClick={() => engine.buyAscension(key)}
            />
          );
        })}
      </div>

      <p className="vz-foot">
        Boží hněv ⚡ se počítá do obtížnosti (jako Věčný hněv) → dává DOSAH, ne blitz.
        Ostatní bonusy jsou ekonomické/QoL. Absoluce mizí jen s koncem sezóny.
      </p>
    </Modal>
  );
}
