/* Pekelný krám — utrať 🔥 Síru: bounded perky (gold/dust/luck — BEZ dmgPct, mimo
   difficulty), dokup žetonů a směna 🔥 → 💠 (denní strop). Mirror ElixirList: řádky
   s tlačítkem nákupu. Žádné perky na čas/start — 60 s je pevných. */
import { useEffect } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { HELLEVATOR, HELL_SHOP, HELL_SHOP_KEYS, hellPerkCost } from '../../game/data/hellevator.js';
import { fmt } from '../../game/format.js';

const sel = (s) => ({
  sira: Math.floor(s.sira || 0),
  passes: s.hell?.passes || 0,
  exchDust: (s.hellExch && s.hellExch.dust) || 0,
  tiers: HELL_SHOP_KEYS.map((k) => s.hellShop?.[k] || 0).join(','),
});

/* Štítek hodnoty perku na daném stupni (bounded % — jen bojové perky). */
function perkLabel(def, tier) {
  if (tier <= 0) return '—';
  return `+${Math.round(def.per * tier * 100)} %`;
}

export default function HellShop({ onBack }) {
  const engine = useEngine();
  const { sira, passes, exchDust } = useEngineSelector(sel, shallowEqual);
  const s = engine.state;

  // dorovnej žetony při otevření krámu (wall-clock regen) + drž to živé
  useEffect(() => {
    engine.tickHellPasses();
    const id = setInterval(() => engine.tickHellPasses(), 2000);
    return () => clearInterval(id);
  }, [engine]);

  const passFull = passes >= HELLEVATOR.passMax;
  const exchLeft = HELLEVATOR.exchangeDailyCapDust - exchDust;

  return (
    <div className="hell-shop">
      <div className="hell-shop-head">
        <button className="hell-back" onClick={onBack}>‹ Zpět</button>
        <h2>🔥 Pekelný krám</h2>
        <span className="hell-sira">🔥 {fmt(sira)}</span>
      </div>

      <div className="hell-shop-scroll">
        {HELL_SHOP_KEYS.map((key) => {
          const def = HELL_SHOP[key];
          const tier = s.hellShop?.[key] || 0;
          const cost = hellPerkCost(key, tier);
          const maxed = tier >= def.max;
          const can = !maxed && sira >= cost;
          return (
            <div className={'hell-perk-row' + (maxed ? ' maxed' : '')} key={key}>
              <div className="hell-perk-ico">{def.emoji}</div>
              <div className="body">
                <div className="name">
                  {def.name}
                  <span className="lvl">{tier}/{def.max}</span>
                </div>
                <div className="meta">{def.desc} · teď <b>{perkLabel(def, tier)}</b></div>
              </div>
              <button className="hell-buy" disabled={!can} onClick={() => engine.buyHellPerk(key)}>
                {maxed ? 'MAX' : <>🔥 {fmt(cost)}</>}
              </button>
            </div>
          );
        })}

        <div className="hell-shop-sep">Žetony &amp; směna</div>

        <div className="hell-perk-row">
          <div className="hell-perk-ico">🎟️</div>
          <div className="body">
            <div className="name">Pekelný žeton</div>
            <div className="meta">Dokup běh navíc · {passes}/{HELLEVATOR.passMax} v zásobě</div>
          </div>
          <button
            className="hell-buy"
            disabled={passFull || sira < HELLEVATOR.passBuyCostSira}
            onClick={() => engine.buyHellPass()}
          >
            {passFull ? 'PLNO' : <>🔥 {HELLEVATOR.passBuyCostSira}</>}
          </button>
        </div>

        <div className="hell-perk-row">
          <div className="hell-perk-ico">💠</div>
          <div className="body">
            <div className="name">Směna 🔥 → 💠</div>
            <div className="meta">
              {HELLEVATOR.exchangeRateSira} 🔥 = 1 💠 · dnes zbývá {Math.max(0, exchLeft)} 💠
            </div>
          </div>
          <div className="hell-exch-btns">
            <button
              className="hell-buy sm"
              disabled={exchLeft <= 0 || sira < HELLEVATOR.exchangeRateSira}
              onClick={() => engine.exchangeSira(1)}
            >+1</button>
            <button
              className="hell-buy sm"
              disabled={exchLeft <= 0 || sira < HELLEVATOR.exchangeRateSira}
              onClick={() => engine.exchangeSira('max')}
            >max</button>
          </div>
        </div>
      </div>

      <p className="hell-shop-foot">
        Perky jsou <b>bounded</b> (gold/úlomky/štěstí) — žádný dmgPct, takže neovlivní
        obtížnost. 🔥 Síra padá jen z výtahu a přežívá rebirth (mře sezónou).
      </p>
    </div>
  );
}
