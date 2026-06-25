import { useState, useEffect } from 'react';
import { Engine } from '../game/engine.js';
import { load, save } from '../game/persistence.js';
import { rollItem } from '../game/data/items.js';
import { EngineContext } from './engineContext.js';

export function EngineProvider({ children }) {
  const [engine] = useState(() => {
    const loaded = load();
    const e = new Engine(loaded?.state);
    e.pendingOffline = loaded?.offline || null;
    e.pendingGift = loaded?.gift || null;
    return e;
  });

  useEffect(() => {
    engine.start();
    const onHide = () => save(engine.state);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save(engine.state);
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);

    // Konzolové cheaty — ZÁMĚRNĚ i v produkci (na vlastní žádost, kvůli testování
    // pozdní hry). Mění ŽIVÝ stav enginu (ne localStorage), pak notify() překreslí
    // UI a save() to uloží → přežije i reload. Žebříček je tím neohrožený: server
    // má sezónně-relativní monotonii + věrohodnostní strop tempa (checkPlausibility),
    // takže skok úrovně/zlata se do ranku stejně neprotlačí.
    // Použití:  eki.setMoney(1e12)   eki.setLevel(1000)   eki.dropItem(5)
    const cheats = {
      engine,
      setMoney(n = 1e12) {
        engine.state.gold = Math.max(0, Number(n) || 0);
        engine.notify();
        save(engine.state);
        return engine.state.gold;
      },
      setLevel(n = 1000) {
        const lvl = Math.max(1, Math.floor(Number(n) || 1));
        engine.state.level = lvl;
        engine.state.highestLevel = Math.max(engine.state.highestLevel, lvl);
        engine.checkInventoryUnlock(); // setLevel(1000) rovnou odemkne výbavu
        engine.spawnEnemy();
        engine.notify();
        save(engine.state);
        return lvl;
      },
      // Testování kořisti: vyrobí n kusů na aktuální (nebo zadané) úrovni.
      dropItem(count = 1, level) {
        engine.state.inventoryUnlocked = true;
        const ilvl = level || engine.state.level;
        for (let i = 0; i < count; i++) engine.addItem(rollItem(ilvl));
        engine.notify();
        save(engine.state);
        return engine.state.inventory.length;
      },
      unlock() {
        engine.state.inventoryUnlocked = true;
        engine.notify();
        save(engine.state);
        return true;
      },
    };
    window.eki = cheats;
    window.__eki = cheats; // zpětně kompatibilní alias
    console.info('%c🥊 eki cheaty: eki.setMoney(1e12) · eki.setLevel(1000) · eki.dropItem(5)', 'color:#ffd23f;font-weight:bold');

    return () => {
      engine.stop();
      save(engine.state);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      delete window.eki;
      delete window.__eki;
    };
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}
