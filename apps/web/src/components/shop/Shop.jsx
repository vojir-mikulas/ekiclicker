import { lazy, Suspense, useState } from 'react';
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import { UPGRADES, UPGRADE_KEYS } from '../../game/data/upgrades.js';
import { WEAPONS } from '../../game/data/weapons.js';
import { PRESTIGE_KEYS } from '../../game/data/prestige.js';
import { ELIXIR_KEYS, elixirCost } from '../../game/data/elixirs.js';
import { upgradeCost, weaponCost, prestigeCost } from '../../game/formulas.js';

// code-splitting: každý panel je vlastní chunk, načte se až při otevření záložky
const UpgradeList = lazy(() => import('./UpgradeList.jsx'));
const WeaponList = lazy(() => import('./WeaponList.jsx'));
const ElixirList = lazy(() => import('./ElixirList.jsx'));
const PrestigeList = lazy(() => import('./PrestigeList.jsx'));
const Achievements = lazy(() => import('./Achievements.jsx'));

const TABS = [
  { id: 'upgrades', label: '💪 Vylepšení', title: 'Vylepšení', sub: 'Pěst + globální bonusy' },
  { id: 'weapons', label: '⚔️ Zbraně', title: 'Automatické zbraně', sub: 'Kup a vrstvi — střílí samy na Ekiho' },
  { id: 'elixirs', label: '🧪 Elixíry', title: '🧪 Elixíry', sub: 'Dočasné buffy — kup a vypij (jeden naráz)' },
  { id: 'prestige', label: '🕊 Odpuštění', title: '🕊 Odpuštění', sub: 'Trvalé bonusy přežijí rebirth' },
  { id: 'achiev', label: '🏆 Úspěchy', title: '🏆 Úspěchy', sub: '' },
];

const BUY_OPTS = [1, 10, 100, 'max'];

// levný výpočet "je tu něco na koupi" (žádná smyčka přes 'max')
const selectDeals = (s) => ({
  upgrades: UPGRADE_KEYS.some((k) => {
    const u = UPGRADES[k];
    const cap = u.max != null ? u.max - s.upgrades[k] : Infinity;
    return cap > 0 && s.gold >= upgradeCost(k, s.upgrades[k]);
  }),
  weapons: WEAPONS.some((w) => s.level >= w.unlock && s.gold >= weaponCost(w, s.weapons[w.id] || 0)),
  elixirs: ELIXIR_KEYS.some((k) => s.gold >= elixirCost(k, s.highestLevel)),
  prestige: PRESTIGE_KEYS.some((k) => s.prestige.forgiveness >= prestigeCost(k, s.prestige[k])),
  achiev: false,
});

const selectBuyAmount = (s) => s.buyAmount;
const selectElixirsUnlocked = (s) => s.elixirsUnlocked;

export default function Shop() {
  const engine = useEngine();
  const [tab, setTab] = useState('upgrades');
  const deals = useEngineSelector(selectDeals, shallowEqual);
  const buyAmount = useEngineSelector(selectBuyAmount);
  const elixirsUnlocked = useEngineSelector(selectElixirsUnlocked);
  // záložka Elixíry se ukáže až po dosažení úrovně 1500 (trvalé odemčení)
  const tabs = TABS.filter((t) => t.id !== 'elixirs' || elixirsUnlocked);
  const active = tabs.find((t) => t.id === tab) || tabs[0];
  const showBuyAmount = active.id === 'upgrades' || active.id === 'weapons' || active.id === 'elixirs';

  return (
    <div className="shop">
      <div className="shop-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'shop-tab' + (active.id === t.id ? ' active' : '') + (deals[t.id] ? ' has-deals' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showBuyAmount && (
        <div className="buy-amount">
          <span className="buy-amount-label">Kupovat</span>
          {BUY_OPTS.map((amt) => (
            <button
              key={amt}
              className={'buy-opt' + (buyAmount === amt ? ' active' : '')}
              onClick={() => engine.setBuyAmount(amt)}
            >
              {amt === 'max' ? 'Max' : amt + '×'}
            </button>
          ))}
        </div>
      )}

      <div className="panel">
        <h3>{active.title}</h3>
        {active.sub && <p className="sub">{active.sub}</p>}
        <Suspense fallback={<div className="panel-loading">Načítám…</div>}>
          {active.id === 'upgrades' && <UpgradeList />}
          {active.id === 'weapons' && <WeaponList />}
          {active.id === 'elixirs' && <ElixirList />}
          {active.id === 'prestige' && <PrestigeList />}
          {active.id === 'achiev' && <Achievements />}
        </Suspense>
      </div>
    </div>
  );
}
