import { useState } from 'react';
import { GUILDS, validateGuildName, validateGuildTag } from '@ekiclicker/shared';
import { useGuild } from '../../hooks/useGuild.js';
import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

const select = (s) => ({ level: s.highestLevel || 1, dust: Math.floor(s.dust || 0) });

const REASON = {
  fee: 'Nemáš dost úlomků 💠 na založení.',
  level: `Cech smíš založit až od úrovně ${fmt(GUILDS.foundLevel)}.`,
  name_taken: 'Jméno už někdo má. Zkus jiné.',
  tag_taken: 'TAG už někdo má. Zkus jiný.',
  already_in_guild: 'Už jsi v cechu.',
  ip_cap: 'Z tohoto připojení dnes vzniklo moc cechů. Zkus to zítra.',
  fail: 'Založení se nezdařilo. Zkus to znovu.',
};

/* Založení cechu — jméno + [TAG], gate úrovně + sink úlomků (klientský). */
export default function FoundGuildModal({ onClose }) {
  const guild = useGuild();
  const { level, dust } = useEngineSelector(select, shallowEqual);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canAfford = dust >= GUILDS.foundFeeDust;
  const highEnough = level >= GUILDS.foundLevel;

  const submit = async (e) => {
    e.preventDefault();
    const vn = validateGuildName(name);
    if (!vn.ok) { setError(vn.error); return; }
    const vt = validateGuildTag(tag);
    if (!vt.ok) { setError(vt.error); return; }
    if (!canAfford) { setError(REASON.fee); return; }
    setBusy(true); setError('');
    try {
      const res = await guild.found(vn.value, vt.value);
      if (res?.ok) { onClose(); return; }
      setError(res?.error || REASON[res?.reason] || REASON.fail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="guild-found">
      <h2>🛡️ Založit cech</h2>
      <p className="join-lead">
        Cech je trvalá parta — jméno, <b>[TAG]</b> u přezdívky a bonusy pro členy.
        Ty se staneš <b>Mistrem cechu</b>. Identita přežívá sezóny; postavení se každou
        sezónu počítá nově.
      </p>

      {!highEnough && (
        <p className="join-warn">⚠️ Zakládat cech smíš až od úrovně <b>{fmt(GUILDS.foundLevel)}</b>. Teď jsi na <b>{fmt(level)}</b>. Vstoupit do cizího cechu ale můžeš už od úrovně {fmt(GUILDS.joinLevel)}.</p>
      )}

      <form onSubmit={submit}>
        <label className="field-label" htmlFor="guild-name">Jméno cechu</label>
        <input
          id="guild-name"
          className="text-input"
          autoFocus
          maxLength={GUILDS.name.max}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="např. Pivní rytíři"
        />
        <label className="field-label" htmlFor="guild-tag">TAG (2–4 znaky)</label>
        <input
          id="guild-tag"
          className="text-input guild-tag-input"
          maxLength={GUILDS.tag.max}
          value={tag}
          onChange={(e) => setTag(e.target.value.toUpperCase())}
          placeholder="PIVO"
        />
        <div className="guild-fee-row">
          <span>Poplatek za založení:</span>
          <b className={canAfford ? '' : 'short'}>💠 {fmt(GUILDS.foundFeeDust)}</b>
          <span className="dim">(máš {fmt(dust)})</span>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-btn" type="submit" disabled={busy || !highEnough || !canAfford}>
          {busy ? 'Zakládám…' : `Založit za 💠 ${fmt(GUILDS.foundFeeDust)}`}
        </button>
      </form>
    </Modal>
  );
}
