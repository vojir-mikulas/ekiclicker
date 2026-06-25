import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

/* Veteránský dárek — ukáže se hráči, který měl uložený starý save z předchozí
   verze hry. Hra začíná znovu, ale dostane balík Odpuštění 🕊 za starou snahu. */
export default function GiftModal({ gift, onClose }) {
  return (
    <Modal onClose={onClose} className="offline gift" showClose={false}>
      <h2>Vítej zpět, veteráne! 🎁</h2>
      <div className="offline-amount">+{fmt(gift.forgiveness)} 🕊</div>
      <p className="offline-info">
        Eki Clicker dostal velký update, takže hra začíná od nuly. 🙏<br />
        Za to, žes hru hrál{gift.oldLevel > 1 ? ` až do úrovně ${fmt(gift.oldLevel)}` : ''}
        {gift.rebirths > 0 ? ` a ${gift.rebirths}× odpustil Tomášovi` : ''}, máš
        ale štědrý dárek do startu — utrať ho v <b>Rebirthu</b> na trvalé bonusy.
      </p>
      <button className="offline-claim" onClick={onClose}>Díky, jdu na to! 👊</button>
    </Modal>
  );
}
