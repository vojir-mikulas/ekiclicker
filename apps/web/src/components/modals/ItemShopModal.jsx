/* 🛒 Obchod s předměty — katalog upgradů. Kupuješ upgrady a tvoje karta se po
   každém nákupu AUTOMATICKY zušlechtí na další themovanou kartu (Obyčejná → … →
   Obsidiánová = nejlepší). Platí se kartou: v pokladně se ukáže themovaná karta
   s předvyplněnými údaji, klikneš zaplatit.

   Obchod vypadá jako skutečný krám od začátku (žádné meta hlášky). Dokud nemáš
   vystavenou kartu, prostě nemáš čím zaplatit (formulář je prázdný / platba projde
   až s vystavenou kartou). Žádné vysvětlování. */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { CARD_TIERS, cardTierDef, nextCardTierDef, cardStatLabel, eur } from '../../game/data/itemshop.js';
import Modal from './Modal.jsx';

const selCard = (s) => ({
  balance: Math.floor(s.card?.balance || 0),
  tier: s.card?.tier || 0,
  info: s.card?.info || null,
});

const bonusList = (def) => (def ? Object.entries(def.stats).map(([k, v]) => cardStatLabel(k, v)) : []);

export default function ItemShopModal({ onClose }) {
  const [checkout, setCheckout] = useState(false);
  return (
    <Modal onClose={onClose} className="itemshop">
      {checkout ? <Checkout onBack={() => setCheckout(false)} /> : <Overview onBuy={() => setCheckout(true)} />}
    </Modal>
  );
}

/* ------------------------------- katalog ------------------------------- */
function Overview({ onBuy }) {
  const { balance, tier, info } = useEngineSelector(selCard, shallowEqual);
  const cur = cardTierDef(tier);
  const next = nextCardTierDef(tier);

  return (
    <div className="shop-catalog">
      <div className="shop-head">
        <span className="shop-title">🛒 Obchod s předměty</span>
        <span className="shop-sub">Prémiové upgrady. Tvoje karta roste s každým nákupem.</span>
        <div className="shop-balance">
          <span className="icon">💳</span>
          <span className="shop-balance-val">{eur(balance)}</span>
          <span className="shop-balance-lbl">na kartě</span>
        </div>
      </div>

      {/* tvoje karta (themovaná dle tieru) — objeví se, jakmile ji máš */}
      {info && (
        <div className="card-issued">
          <span className="ci-label">💳 Tvoje karta</span>
          <div className={'cc-card cc-display cc-tier-' + tier}>
            <div className="cc-face cc-front">
              <div className="cc-row1">
                <span className="cc-chip">▭</span>
                <span className="cc-brand">{cur ? cur.name.toUpperCase() : 'KARTA'}</span>
              </div>
              <div className="cc-number">{info.number}</div>
              <div className="cc-row3">
                <span className="cc-holder">{info.name}</span>
                <span className="cc-exp">{info.exp}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* žebřík upgradů — vlastněné / další ke koupi / zamčené budoucí */}
      <div className="up-ladder">
        {CARD_TIERS.map((t) => {
          const owned = tier >= t.tier;
          const isNext = next && t.tier === next.tier;
          return (
            <div key={t.tier} className={'up-row' + (owned ? ' owned' : isNext ? ' next' : ' locked')}>
              <span className={'up-emoji cc-swatch cc-tier-' + t.tier}>{t.emoji}</span>
              <div className="up-txt">
                <b>{t.name}</b>
                <small>{bonusList(t).join(' · ')}</small>
              </div>
              {owned ? (
                <span className="up-state owned">✓</span>
              ) : isNext ? (
                <button className={'shop-buy up-buy' + (balance >= t.price ? '' : ' poor')} onClick={onBuy}>
                  {eur(t.price)}
                </button>
              ) : (
                <span className="up-state locked">{eur(t.price)}</span>
              )}
            </div>
          );
        })}
      </div>

      {!next && <div className="card-maxed">⬛ Máš Obsidiánovou kartu — nejvyšší možnou. Vesmír ti závidí.</div>}

      <p className="shop-foot">Platí se kartou. Bonusy jsou bounded — neovlivní obtížnost ani žebříček.</p>
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
  const { balance, tier, info } = useEngineSelector(selCard, shallowEqual);
  const next = nextCardTierDef(tier);

  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [focus, setFocus] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | processing | declined | success
  const [reason, setReason] = useState(null);

  // jakmile máš vystavenou kartu → předvyplň pokladnu jejími údaji (stačí zaplatit)
  useEffect(() => {
    if (info) { setNumber(info.number); setName(info.name); setExp(info.exp); setCvc(info.cvc); }
  }, [info]);

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

  const pay = useCallback((e) => {
    e.preventDefault();
    if (!formValid || status === 'processing' || status === 'success') return;
    setStatus('processing');
    setTimeout(() => {
      const res = engine.upgradeCard({ number, name, exp, cvc });
      if (res.ok) setStatus('success');
      else { setReason(res.reason); setStatus('declined'); }
    }, 1700);
  }, [formValid, status, engine, number, name, exp, cvc]);

  if (!next) {
    return (
      <div className="checkout">
        <div className="co-success">
          <div className="co-succ-ico">⬛</div>
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
          <b>Hotovo!</b>
          <p>Upgrade zakoupen — tvoje karta je teď <strong>{next.name}</strong>. Nové bonusy běží okamžitě.</p>
          <small>Zbývá na kartě: {eur(balance)}</small>
          <button className="shop-buy" onClick={onBack}>← Zpět do obchodu</button>
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
          <b>{next.name}</b>
          <small>{bonusList(next).join(' · ')}</small>
        </div>
        <span className="co-price">{eur(next.price)}</span>
      </div>

      <div className="co-balance-row">
        <span>💳 Na kartě: <b>{eur(balance)}</b></span>
        <span className={balance >= next.price ? 'co-ok' : 'co-low'}>
          {balance >= next.price ? '✓ Kryto' : `Chybí ${eur(next.price - balance)}`}
        </span>
      </div>

      {/* themovaná karta, kterou platíš (skin další úrovně), předvyplněná */}
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

      {status === 'declined' ? (
        <div className="co-declined">
          <div className="co-decl-ico">🚫</div>
          {reason === 'funds' ? (
            <>
              <b>Platba zamítnuta</b>
              <p>Nedostatečný zůstatek na kartě (kód <code>51 — INSUFFICIENT FUNDS</code>).</p>
              <small>Chybí ti {eur(Math.max(0, next.price - balance))}.</small>
            </>
          ) : (
            <>
              <b>Platba zamítnuta</b>
              <p>Karta zamítnuta (kód <code>14 — INVALID CARD</code>).</p>
              <small>Zkontroluj číslo, platnost, CVC i jméno a zkus to znovu.</small>
            </>
          )}
          <div className="co-decl-actions">
            <button className="shop-buy" onClick={() => { setStatus('idle'); setReason(null); }}>Zkusit znovu</button>
            <button className="co-cancel" onClick={onBack}>Zpět</button>
          </div>
        </div>
      ) : (
        <form className="cc-form" onSubmit={pay}>
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
