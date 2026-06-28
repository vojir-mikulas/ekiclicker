/* =========================================================================
   ZVUK — úderové „mlaskance" na zásah + fanfára na znovuzrození.
   Žije mimo React (jako FxManager): poslouchá sémantické eventy enginu a pouští
   krátké samply. Stav ZTLUMENÍ je v localStorage (přežije reload) a vystavený
   přes malý subscribe/snapshot store, aby ho šlo přepínat tlačítkem v UI.

   VÝKON: každý sampl má vlastní pool <audio> klonů — rychlé klikání tak nepřebíjí
   jeden přehrávač (ten by se musel pořád .currentTime=0 restartovat a kousal by).
   Zvuk se odemkne až po první interakci uživatele (autoplay policy), proto se
   ladně polkne případné odmítnuté play().
   ========================================================================= */
import punch0 from '../assets/sounds/punch0.mp3';
import punch1 from '../assets/sounds/punch1.mp3';
import punch2 from '../assets/sounds/punch2.mp3';
import punch3 from '../assets/sounds/punch3.mp3';
import celebration from '../assets/sounds/celebration.mp3';

const PUNCHES = [punch0, punch1, punch2, punch3];
const MUTE_KEY = 'eki-muted';

/* --- store ztlumení (subscribe/getSnapshot pro useSyncExternalStore) --- */
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch { /* private mode / blokovaný storage */ }

const listeners = new Set();
export const soundStore = {
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  isMuted() {
    return muted;
  },
  toggle() {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch { /* ignoruj */ }
    for (const cb of listeners) cb();
  },
};

/* --- pool přehrávačů jednoho samplu --- */
function makePool(src, size, volume) {
  const pool = [];
  for (let i = 0; i < size; i++) {
    const a = new Audio(src);
    a.volume = volume;
    a.preload = 'auto';
    pool.push(a);
  }
  let i = 0;
  return () => {
    const a = pool[i++ % pool.length];
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {}); // autoplay zatím zablokované → polkni
    } catch { /* ignoruj */ }
  };
}

const playPunch = PUNCHES.map((src) => makePool(src, 4, 0.5));
const playCelebration = makePool(celebration, 1, 0.7);

let lastPunch = -1;
let lastPunchAt = 0;
const PUNCH_MIN_GAP = 60; // ms — strop tempa, aby pozdní hra (auto-zbraně sypou
                          // zabití za sekundu) nezahltila zvuk v jeden šum

function punch() {
  // pozdní hra zabíjí mnohokrát za sekundu (auto-zbraně) → omez tempo přehrávání
  const now = performance.now();
  if (now - lastPunchAt < PUNCH_MIN_GAP) return;
  lastPunchAt = now;
  // náhodný sampl, ale ne dvakrát po sobě stejný (pestřejší)
  let idx = Math.floor(Math.random() * playPunch.length);
  if (idx === lastPunch) idx = (idx + 1) % playPunch.length;
  lastPunch = idx;
  playPunch[idx]();
}

/* --- napojení na engine (mountuje SoundLayer) --- */
export function attachSound(engine) {
  return engine.onEvent((type) => {
    if (muted) return;
    // úderový zvuk na KAŽDÉ zabití (klik i auto-zbraně → 'defeat'), ne jen na klik
    if (type === 'defeat') punch();
    else if (type === 'rebirth') playCelebration();
  });
}
