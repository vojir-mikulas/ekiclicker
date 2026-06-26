import { useState, useEffect } from 'react';
import { Engine } from '../game/engine.js';
import { load, save } from '../game/persistence.js';
import { rollItem } from '../game/data/items.js';
import { petLevelCap } from '../game/data/pets.js';
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

    // Konzolové cheaty — NATVRDO VYPNUTÉ (false). Kód je tu ponechán pro budoucí
    // ladění; přepni gate na true (nebo zpět na env check), když je budeš potřebovat.
    // Mění ŽIVÝ stav enginu (ne localStorage), pak notify() překreslí UI a save() to
    // uloží → přežije i reload. Žebříček je tím neohrožený: server má sezónně-relativní
    // monotonii + věrohodnostní strop tempa (checkPlausibility), takže skok úrovně/zlata
    // se do ranku stejně neprotlačí.
    // Použití:  eki.setMoney(1e12)   eki.setLevel(1000)   eki.dropItem(5)
    const CHEATS_ENABLED = false;
    if (CHEATS_ENABLED) {
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
          engine.checkLevelUnlocks(); // setLevel(1000/1500/2000) rovnou odemkne výbavu/elixíry/mazlíčky
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
        // Testování beden/rulety: přidá n beden daného typu (wooden/golden/archon/dust).
        dropChest(tier = 'golden', count = 1) {
          engine.state.inventoryUnlocked = true;
          for (let i = 0; i < count; i++) engine.grantChest(tier);
          engine.notify();
          save(engine.state);
          return engine.state.chests;
        },
        // Testování mazlíčků: odemkne a přidá n vajec 🥚.
        dropEgg(count = 1) {
          engine.state.petsUnlocked = true;
          for (let i = 0; i < count; i++) engine.grantEgg();
          engine.notify();
          save(engine.state);
          return engine.state.eggs;
        },
        // Testování evoluce mazlíčků: odemkne evoluci, dosype palivo (vejce + úlomky) a
        // pokud zadáš id, mazlíčka rovnou vymaxuje na úrovni a evolvuje o jeden ⭐.
        evolvePet(id) {
          engine.state.petsUnlocked = true;
          engine.state.petEvolveUnlocked = true;
          engine.state.eggs = (engine.state.eggs || 0) + 20;
          engine.state.dust = (engine.state.dust || 0) + 50000;
          if (id && engine.state.pets[id]) {
            engine.state.pets[id].level = petLevelCap(id);
            engine.evolvePet(id);
          }
          engine.notify();
          save(engine.state);
          return id ? engine.state.pets[id] : { eggs: engine.state.eggs, dust: engine.state.dust };
        },
        // Testování zaklínání: odemkne výbavu + zaklínací stůl (jinak až na lvl 3000).
        unlockEnchant() {
          engine.state.inventoryUnlocked = true;
          engine.state.enchantingUnlocked = true;
          engine.notify();
          save(engine.state);
          return true;
        },
        // Testování mřížky: odemkne Mistrovskou mřížku 🔱 + přidá n bodů (jinak až na lvl 4000).
        addMastery(n = 100) {
          engine.state.masteryUnlocked = true;
          engine.state.mastery.points = (engine.state.mastery.points || 0) + Math.max(0, Math.floor(Number(n) || 0));
          engine.notify();
          save(engine.state);
          return engine.state.mastery.points;
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
      console.info('%c🥊 eki cheaty: eki.setMoney(1e12) · eki.setLevel(4000) · eki.dropItem(5) · eki.dropChest("golden",3) · eki.dropEgg(5) · eki.evolvePet("ohnivak") · eki.unlockEnchant() · eki.addMastery(100)', 'color:#ffd23f;font-weight:bold');
    }

    return () => {
      engine.stop();
      save(engine.state);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      if (CHEATS_ENABLED) {
        delete window.eki;
        delete window.__eki;
      }
    };
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}
