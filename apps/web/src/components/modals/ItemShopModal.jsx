/* 🛒 Obchod s předměty / Tomášova karta — feature přístupná OD ZAČÁTKU (lvl 1),
   ale platit lze až s vystavenou kartou. Na CARD.unlockLevel Tomáš dostane SKUTEČNÉ
   údaje karty (číslo/jméno/platnost/CVC) → hráč si je OPÍŠE do pokladny. Pokladna
   ověří vyplněné údaje proti vystavené kartě; sedí + je kredit → karta povýší o tier
   (silnější bounded bonus, bez dmgPct → mimo difficulty). Po PRVNÍM nákupu se karta
   uloží na účet → příště stačí jeden klik.

   Decline: 'card' = údaje nesouhlasí, 'funds' = nedostatečný zůstatek (vtip je teď
   skutečný stav). */
import { useState, useMemo, useCallback } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { CARD_MAX_TIER, cardTierDef, nextCardTierDef, cardStatLabel, eur } from '../../game/data/itemshop.js';
import Modal from './Modal.jsx';

const selCard = (s) => ({
  unlocked: !!s.cardUnlocked,
  balance: Math.floor(s.card?.balance || 0),
  tier: s.card?.tier || 0,
  info: s.card?.info || null,
  saved: !!s.card?.saved,
});

function bonusList(def) {
  if (!def) return [];
  return Object.entries(def.stats).map(([k, v]) => cardStatLabel(k, v));
}

export default function ItemShopModal({ onClose }) {
  const [checkout, setCheckout] = useState(false);
  return (
    <Modal onClose={onClose} className="itemshop">
      {checkout ? <Checkout onBack={() => setCheckout(false)} /> : <Overview onUpgrade={() => setCheckout(true)} />}
    </Modal>
  );
}

/* ------------------------------- přehled ------------------------------- */
function Overview({ onUpgrade }) {
  const { balance, tier, info } = useEngineSelector(selCard, shallowEqual);
  const cur = cardTierDef(tier);
  const next = nextCardTierDef(tier);

  return (
    <div className="shop-catalog">
      <div className="shop-head">
        <span className="shop-title">🛒 Obchod s předměty</span>
        <span className="shop-sub">Karta tier {tier}/{CARD_MAX_TIER} · plať svou kartou.</span>
        <div className="shop-balance">
          <span className="icon">💳</span>
          <span className="shop-balance-val">{eur(balance)}</span>
          <span className="shop-balance-lbl">na kartě</span>
        </div>
      </div>

      {/* vystavená karta — objeví se, jakmile ji Tomáš dostane; údaje si hráč opíše do pokladny */}
      {info && (
        <div className="card-issued">
          <span className="ci-label">💳 Tvoje vystavená karta — opiš ji do pokladny</span>
          <div className={'cc-card cc-display cc-tier-' + tier}>
            <div className="cc-face cc-front">
              <div className="cc-row1">
                <span className="cc-chip">▭</span>
                <span className="cc-brand">{cur ? cur.name.toUpperCase() : 'TOMÁŠOVA KARTA'}</span>
              </div>
              <div className="cc-number">{info.number}</div>
              <div className="cc-row3">
                <span className="cc-holder">{info.name}</span>
                <span className="cc-exp">{info.exp}</span>
              </div>
            </div>
          </div>
          <span className="ci-cvc">CVC: <b>{info.cvc}</b></span>
        </div>
      )}

      <div className="card-bonuses">
        <span className="cb-head">Aktivní bonusy (tier {tier})</span>
        {bonusList(cur).length
          ? <ul>{bonusList(cur).map((b, i) => <li key={i}>✓ {b}</li>)}</ul>
          : <p className="cb-empty">Zatím žádné — kup si první tier.</p>}
      </div>

      {next ? (
        <div className="card-upgrade">
          <div className="cu-head">
            <span>{tier >= 1 ? 'Upgrade → ' : 'Koupit '}<b>{next.emoji} {next.name}</b> (tier {next.tier})</span>
            <span className="cu-price">{eur(next.price)}</span>
          </div>
          <ul className="cu-bonuses">{bonusList(next).map((b, i) => <li key={i}>{b}</li>)}</ul>
          <button className={'shop-buy' + (balance >= next.price ? '' : ' poor')} onClick={onUpgrade}>
            💳 Zaplatit kartou · {eur(next.price)}
          </button>
        </div>
      ) : (
        <div className="card-maxed">♾️ Máš nejvyšší kartu. Vesmír ti závidí.</div>
      )}

      <p className="shop-foot">
        💸 Platí se kartou. Z killů chodí € cashback (bossové vždy a víc). Bonusy
        jsou bounded a neovlivňují obtížnost ani žebříček — jen ti ulehčí ekonomiku.
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

function Checkout({ onBack }) {
  const engine = useEngine();
  const { balance, tier, saved } = useEngineSelector(selCard, shallowEqual);
  const next = nextCardTierDef(tier);

  const [useSaved, setUseSaved] = useState(saved);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [focus, setFocus] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | processing | declined | success
  const [reason, setReason] = useState(null); // 'card' | 'funds'

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
  const formValid = digits.length >= 15 && name.trim().length >= 2 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3;
  const canPay = useSaved || formValid;

  const pay = useCallback((e) => {
    e.preventDefault();
    if (!canPay || status === 'processing' || status === 'success') return;
    setStatus('processing');
    setTimeout(() => {
      const res = engine.upgradeCard(useSaved ? null : { number, name, exp, cvc }, useSaved);
      if (res.ok) setStatus('success');
      else { setReason(res.reason); setStatus('declined'); }
    }, 1800);
  }, [canPay, status, engine, useSaved, number, name, exp, cvc]);

  if (!next) {
    return (
      <div className="checkout">
        <div className="co-success">
          <div className="co-succ-ico">♾️</div>
          <b>Máš nejvyšší kartu.</b>
          <button className="shop-buy" onClick={onBack}>← Zpět</button>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="checkout">
        <div className="co-success">
          <div className="co-succ-ico">{next.emoji}</div>
          <b>Karta povýšena!</b>
          <p>Tvoje karta je teď <strong>{next.name}</strong> (tier {next.tier}). Údaje jsme uložili — příště stačí jeden klik.</p>
          <small>Zbývá na kartě: {eur(balance)}</small>
          <button className="shop-buy" onClick={onBack}>← Zpět na kartu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout">
      <button className="shop-back" onClick={onBack}>← Zpět</button>

      <div className="co-summary">
        <span className="co-emoji">{next.emoji}</span>
        <div className="co-sum-txt">
          <b>Upgrade na {next.name}</b>
          <small>Tier {next.tier} · {bonusList(next).join(' · ')}</small>
        </div>
        <span className="co-price">{eur(next.price)}</span>
      </div>

      <div className="co-balance-row">
        <span>💳 Na kartě: <b>{eur(balance)}</b></span>
        <span className={balance >= next.price ? 'co-ok' : 'co-low'}>
          {balance >= next.price ? '✓ Kryto' : `Chybí ${eur(next.price - balance)}`}
        </span>
      </div>

      {!useSaved && (
        <div className={'cc-card cc-tier-' + next.tier + ' ' + brand.cls + (focus === 'cvc' ? ' flipped' : '')}>
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
      )}

      {status === 'declined' ? (
        <div className="co-declined">
          <div className="co-decl-ico">🚫</div>
          {reason === 'funds' ? (
            <>
              <b>Platba zamítnuta</b>
              <p>Nedostatečný zůstatek na kartě. Banka transakci odmítla (kód <code>51 — INSUFFICIENT FUNDS</code>).</p>
              <small>Chybí ti {eur(Math.max(0, next.price - balance))}. Jdi pobít pár nepřátel — cashback dorazí. 😅</small>
            </>
          ) : (
            <>
              <b>Platba zamítnuta</b>
              <p>Karta zamítnuta — údaje nesouhlasí. Zkontroluj číslo, platnost, CVC i jméno (<code>INVALID CARD</code>).</p>
              <small>Platí jen tvoje vystavená karta. Tu dostaneš (a uvidíš její údaje) na vyšší úrovni.</small>
            </>
          )}
          <div className="co-decl-actions">
            <button className="shop-buy" onClick={() => { setStatus('idle'); setReason(null); }}>Zkusit znovu</button>
            <button className="co-cancel" onClick={onBack}>Zpět</button>
          </div>
        </div>
      ) : useSaved ? (
        <div className="cc-saved">
          <div className="cc-saved-row">
            <span>💳 Uložená karta na účtu</span>
            <button type="button" className="cc-other" onClick={() => setUseSaved(false)}>Zadat ručně</button>
          </div>
          <button className="cc-pay" type="button" onClick={pay} disabled={status === 'processing'}>
            {status === 'processing' ? <><span className="cc-spin" /> Zpracovávám platbu…</> : <>🔒 Zaplatit {eur(next.price)}</>}
          </button>
          <p className="cc-secure">🔒 Zabezpečeno 256bitovým šifrováním, které jsme si vymysleli.</p>
        </div>
      ) : (
        <form className="cc-form" onSubmit={pay}>
          {saved && (
            <button type="button" className="cc-use-saved cc-field--full" onClick={() => setUseSaved(true)}>↩︎ Použít uloženou kartu</button>
          )}
          <label className="cc-field cc-field--full">
            <span>Číslo karty</span>
            <input inputMode="numeric" autoComplete="off" placeholder="1234 5678 9012 3456"
              value={number} onChange={onNumber} onFocus={() => setFocus('number')} onBlur={() => setFocus(null)} />
          </label>
          <label className="cc-field cc-field--full">
            <span>Jméno držitele</span>
            <input autoComplete="off" placeholder="JMÉNO PŘÍJMENÍ"
              value={name} onChange={(e) => setName(e.target.value)} onFocus={() => setFocus('name')} onBlur={() => setFocus(null)} />
          </label>
          <label className="cc-field">
            <span>Platnost</span>
            <input inputMode="numeric" autoComplete="off" placeholder="MM/RR"
              value={exp} onChange={onExp} onFocus={() => setFocus('exp')} onBlur={() => setFocus(null)} />
          </label>
          <label className="cc-field">
            <span>CVC</span>
            <input inputMode="numeric" autoComplete="off" placeholder="•••"
              value={cvc} onChange={onCvc} onFocus={() => setFocus('cvc')} onBlur={() => setFocus(null)} />
          </label>
          <button className="cc-pay" type="submit" disabled={!formValid || status === 'processing'}>
            {status === 'processing' ? <><span className="cc-spin" /> Zpracovávám platbu…</> : <>🔒 Zaplatit {eur(next.price)}</>}
          </button>
          <p className="cc-secure">🔒 Zabezpečeno 256bitovým šifrováním, které jsme si vymysleli.</p>
        </form>
      )}
    </div>
  );
}
