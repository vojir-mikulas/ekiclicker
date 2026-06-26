/* Oslavný „NOVÁ SEZÓNA" popup — zobrazí se PO vstupu do nové sezóny (po resetu).
   Na rozdíl od SeasonEndModal (rekapitulace + brána resetu) je to čistě hype
   pohled dopředu: čistý štít, nový závod. Zavře se křížkem, pozadím i tlačítkem. */
import Modal from './Modal.jsx';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt } from '../../game/format.js';
import { themeForSeason } from '../../game/data/seasonThemes.js';

export default function NewSeasonModal() {
  const account = useAccount();
  const ns = account.newSeason; // { number, reward }
  if (!ns) return null;

  const reward = ns.reward;
  const champion = reward && reward.rank === 1;
  const theme = themeForSeason(ns.number ?? null); // pasivní téma nové sezóny

  return (
    <Modal onClose={account.dismissNewSeason} className="new-season">
      <div className="ns-confetti" aria-hidden="true">🎉✨🎊</div>
      <div className="ns-kicker">Nová sezóna</div>
      <h2 className="ns-title">SEZÓNA {ns.number ?? ''}</h2>
      <p className="ns-desc">
        Čistý štít, čerstvý závod — všichni startují od nuly. Ukaž, kam to dotáhneš! 🚀
      </p>
      {theme && (
        <div className="ns-theme">
          <b>{theme.emoji} {theme.label}</b> — {theme.blurb}
          <span className="ns-theme-perks">{theme.perks.join(' · ')}</span>
        </div>
      )}
      {reward && reward.forgiveness ? (
        <div className="ns-reward">
          Do startu si neseš <b>{fmt(reward.forgiveness)} 🕊</b>
          {champion ? ' a 👑 trofej šampiona z minulé sezóny' : ''}.
        </div>
      ) : null}
      <button className="primary-btn" onClick={account.dismissNewSeason}>
        Do toho! 🔥
      </button>
    </Modal>
  );
}
