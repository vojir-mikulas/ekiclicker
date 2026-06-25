import { useEngine } from '../../hooks/useEngine.js';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt, fmtDuration } from '../../game/format.js';
import { ACHIEVEMENT_COUNT } from '../../game/data/achievements.js';
import Modal from './Modal.jsx';

export default function SettingsModal({ onClose }) {
  const engine = useEngine();
  const account = useAccount();
  const s = engine.state;
  const unlocked = Object.keys(s.achievements).length;
  const joined = account.status === 'joined';

  const reset = async () => {
    const extra = joined
      ? '\n\nSmaže se i tvůj účet v žebříčku (přezdívka i skóre). Po smazání už ho kódem pro obnovu nezískáš zpět.'
      : '';
    if (
      !window.confirm(
        'Opravdu smazat VEŠKERÝ postup?\n\nVynuluje se úplně všechno — peníze, úroveň, zbraně, vylepšení, rebirthy, odpuštění i úspěchy.' +
          extra +
          '\nTohle nejde vrátit.'
      )
    )
      return;
    if (joined) await account.leave(); // smaž účet na serveru (best-effort) + zruš token
    engine.hardReset();
    onClose();
  };

  return (
    <Modal onClose={onClose} className="settings">
      <h2>⚙️ Nastavení</h2>
      <div className="settings-stats">
        <span>Úroveň <b>{s.level}</b></span>
        <span>Max <b>{s.highestLevel}</b></span>
        <span><b>{s.prestige.rebirths}</b>× rebirth</span>
        <span><b style={{ color: 'var(--dove)' }}>{fmt(s.prestige.forgiveness)}</b> 🕊</span>
        <span>Úspěchy <b>{unlocked}/{ACHIEVEMENT_COUNT}</b></span>
        <span>Hráno <b>{fmtDuration(s.stats.playTimeMs / 1000)}</b></span>
        <span>Klikem <b>{fmt(s.stats.totalClicks)}</b>×</span>
        <span>Zabito <b>{fmt(s.stats.kills)}</b></span>
      </div>
      <button className="danger-btn" onClick={reset}>🗑 Smazat veškerý postup</button>
      <p className="settings-note">Nevratné — hra se vynuluje úplně od začátku, včetně rebirthů, odpuštění a úspěchů.</p>
    </Modal>
  );
}
