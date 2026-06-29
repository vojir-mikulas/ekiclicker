/* 🛒 Obchod s předměty — recesní „pay-to-win" pultík.
   Čistě UI vtip: nic se nekupuje, nic nesahá do enginu. Hráč si vybere
   nehorázně OP předmět, vyplní si realisticky vypadající platební kartu
   a po „zaplať" mu to po chvíli načítání hodí „nedostatečný zůstatek". :) */
import { useState, useMemo, useCallback } from 'react';
import Modal from './Modal.jsx';

const ITEMS = [
  { id: 'gold', emoji: '♾️', name: 'Nekonečné zlato', desc: 'Počítadlo peněz přeteče a už nikdy se nezastaví. Kup si všechno. Pořád.', price: 19.99, tag: 'BESTSELLER' },
  { id: 'god', emoji: '👑', name: 'Boží režim', desc: 'Každý nepřítel padne na jednu ránu. Včetně světového bosse. Včetně tebe.', price: 49.99, tag: 'P2W' },
  { id: 'dps', emoji: '🚀', name: 'DPS ×1 000 000', desc: 'Tvůj kurzor začne čísla zaokrouhlovat, protože se nevejdou na obrazovku.', price: 99.99 },
  { id: 'skip', emoji: '⏩', name: 'Skok na úroveň 30 000', desc: 'Přeskoč 29 996 úrovní grindu. Tvoje palce ti poděkují.', price: 149.99, tag: 'ČASOVĚ OMEZENO' },
  { id: 'drako', emoji: '🐉', name: 'Celý Drakobijec set', desc: 'Best-in-slot výbava bez jediného zabitého bosse. Plně iluzorní.', price: 199.99 },
  { id: 'luck', emoji: '🍀', name: '100 % drop navždy', desc: 'Každý nepřítel upustí legendární kořist. Inventář se vzdá jako první.', price: 79.99 },
  { id: 'bot', emoji: '🤖', name: 'Auto-rebirth bot 24/7', desc: 'Hraje za tebe, i když spíš. Ber to jako kolegu, co ti krade výsledky.', price: 29.99, sub: '/ měsíc' },
  { id: 'absoluce', emoji: '😇', name: 'Okamžitá Absoluce ×100', desc: 'Sto Vzestupů naráz. Svatozář tak jasná, že vypálí monitor.', price: 499.99, tag: 'LUXUS' },
];

const eur = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export default function ItemShopModal({ onClose }) {
  const [picked, setPicked] = useState(null); // vybraný předmět → checkout

  return (
    <Modal onClose={onClose} className="itemshop">
      {picked ? (
        <Checkout item={picked} onBack={() => setPicked(null)} />
      ) : (
        <Catalog onBuy={setPicked} />
      )}
    </Modal>
  );
}

/* ------------------------------- katalog ------------------------------- */
function Catalog({ onBuy }) {
  return (
    <div className="shop-catalog">
      <div className="shop-head">
        <span className="shop-title">🛒 Obchod s předměty</span>
        <span className="shop-sub">Prémiové, naprosto rozbité výhody. Skutečné peníze, skutečná hanba.</span>
      </div>
      <div className="shop-grid">
        {ITEMS.map((it) => (
          <div key={it.id} className="shop-card">
            {it.tag && <span className="shop-tag">{it.tag}</span>}
            <span className="shop-card-emoji">{it.emoji}</span>
            <span className="shop-card-name">{it.name}</span>
            <span className="shop-card-desc">{it.desc}</span>
            <button className="shop-buy" onClick={() => onBuy(it)}>
              {eur(it.price)}{it.sub && <small>{it.sub}</small>}
            </button>
          </div>
        ))}
      </div>
      <p className="shop-foot">
        💸 Mikrotransakce jsou vážně jen mikro — vejdou se ti do peněženky stokrát.
        (A stejně to nepůjde zaplatit, slibujem.)
      </p>
    </div>
  );
}

/* ------------------------------ pokladna ------------------------------ */
function detectBrand(digits) {
  if (/^4/.test(digits)) return { name: 'VISA', cls: 'visa' };
  if (/^(5[1-5]|2[2-7])/.test(digits)) return { name: 'Mastercard', cls: 'mc' };
  if (/^3[47]/.test(digits)) return { name: 'AMEX', cls: 'amex' };
  if (/^6/.test(digits)) return { name: 'Discover', cls: 'disc' };
  return { name: '', cls: '' };
}

function Checkout({ item, onBack }) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [focus, setFocus] = useState(null); // který field je v ruce (pro flip karty)
  const [status, setStatus] = useState('idle'); // idle | processing | declined

  const brand = useMemo(() => detectBrand(number.replace(/\s/g, '')), [number]);

  const onNumber = (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 16);
    setNumber(d.replace(/(.{4})/g, '$1 ').trim());
  };
  const onExp = (e) => {
    let d = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) d = d.slice(0, 2) + '/' + d.slice(2);
    setExp(d);
  };
  const onCvc = (e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4));

  const digits = number.replace(/\s/g, '');
  const valid = digits.length >= 15 && name.trim().length >= 2 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3;

  const pay = useCallback((e) => {
    e.preventDefault();
    if (!valid || status === 'processing') return;
    setStatus('processing');
    // realistická prodleva „komunikace s bankou", pak zamítnutí
    setTimeout(() => setStatus('declined'), 2200);
  }, [valid, status]);

  return (
    <div className="checkout">
      <button className="shop-back" onClick={onBack}>← Zpět do obchodu</button>

      <div className="co-summary">
        <span className="co-emoji">{item.emoji}</span>
        <div className="co-sum-txt">
          <b>{item.name}</b>
          <small>{item.desc}</small>
        </div>
        <span className="co-price">{eur(item.price)}{item.sub && <small>{item.sub}</small>}</span>
      </div>

      {/* živý náhled karty */}
      <div className={'cc-card ' + brand.cls + (focus === 'cvc' ? ' flipped' : '')}>
        <div className="cc-face cc-front">
          <div className="cc-row1">
            <span className="cc-chip">▭</span>
            <span className="cc-brand">{brand.name || 'KARTA'}</span>
          </div>
          <div className="cc-number">{number || '•••• •••• •••• ••••'}</div>
          <div className="cc-row3">
            <span className="cc-holder">{name.toUpperCase() || 'JMÉNO PŘÍJMENÍ'}</span>
            <span className="cc-exp">{exp || 'MM/RR'}</span>
          </div>
        </div>
        <div className="cc-face cc-back">
          <div className="cc-stripe" />
          <div className="cc-cvc-band"><span>{cvc || '•••'}</span></div>
        </div>
      </div>

      {status === 'declined' ? (
        <div className="co-declined">
          <div className="co-decl-ico">🚫</div>
          <b>Platba zamítnuta</b>
          <p>Nedostatečný zůstatek na účtu. Vaše banka transakci odmítla (kód <code>51 — INSUFFICIENT FUNDS</code>).</p>
          <small>Zkuste jinou kartu, nebo si prostě jdi zahrát zadarmo jako normální člověk. 😅</small>
          <div className="co-decl-actions">
            <button className="shop-buy" onClick={() => setStatus('idle')}>Zkusit znovu</button>
            <button className="co-cancel" onClick={onBack}>Zrušit</button>
          </div>
        </div>
      ) : (
        <form className="cc-form" onSubmit={pay}>
          <label className="cc-field cc-field--full">
            <span>Číslo karty</span>
            <input
              inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"
              value={number} onChange={onNumber}
              onFocus={() => setFocus('number')} onBlur={() => setFocus(null)}
            />
          </label>
          <label className="cc-field cc-field--full">
            <span>Jméno držitele</span>
            <input
              autoComplete="cc-name" placeholder="Jan Novák"
              value={name} onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocus('name')} onBlur={() => setFocus(null)}
            />
          </label>
          <label className="cc-field">
            <span>Platnost</span>
            <input
              inputMode="numeric" autoComplete="cc-exp" placeholder="MM/RR"
              value={exp} onChange={onExp}
              onFocus={() => setFocus('exp')} onBlur={() => setFocus(null)}
            />
          </label>
          <label className="cc-field">
            <span>CVC</span>
            <input
              inputMode="numeric" autoComplete="cc-csc" placeholder="•••"
              value={cvc} onChange={onCvc}
              onFocus={() => setFocus('cvc')} onBlur={() => setFocus(null)}
            />
          </label>
          <button className="cc-pay" type="submit" disabled={!valid || status === 'processing'}>
            {status === 'processing'
              ? <><span className="cc-spin" /> Zpracovávám platbu…</>
              : <>🔒 Zaplatit {eur(item.price)}</>}
          </button>
          <p className="cc-secure">🔒 Zabezpečeno 256bitovým šifrováním, které jsme si vymysleli.</p>
        </form>
      )}
    </div>
  );
}
