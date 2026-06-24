# 👊 Dej mu! — Eki Clicker

Inkrementální „clicker" hra (mlátíš Ekiho), přepsaná z jednoho HTML souboru do
škálovatelné React + Vite aplikace. Inspirace: Clicker Heroes & Cookie Clicker.

```bash
npm install
npm run dev        # vývojový server
npm run build      # produkční build (do dist/)
npm run preview    # náhled produkčního buildu
npm run balance    # simulátor vyvážení ekonomiky (greedy hráč)
npm run smoke      # headless test herního jádra
npm run lint
```

Původní jednosouborová verze je archivovaná v `legacy/index.html`.

## Architektura

Oddělené **herní jádro** (čistá logika, bez Reactu) a **vrstva zobrazení** (React).

```
src/
  game/                 # herní jádro — žádný React, žádné DOM
    config.js           #   všechna laditelná čísla + anti-lag stropy
    formulas.js         #   čistá matematika (poškození, DPS, ceny, škálování)
    engine.js           #   imperativní jádro: měnitelný stav + pevný krok smyčky
    initialState.js     #   tovární funkce stavu + reset běhu
    persistence.js      #   ukládání / načítání / offline výdělek
    format.js           #   formátování velkých čísel a času
    data/               #   data hry (zbraně, vylepšení, prestige, varianty, úspěchy)
  state/
    engineContext.js    #   React context (oddělený kvůli Fast Refresh)
    EngineContext.jsx   #   provider: vytvoří engine, spustí smyčku, ukládání
  hooks/
    useEngine.js        #   useSyncExternalStore selektor (re-render jen při změně řezu)
  effects/
    FxManager.js        #   imperativní vizuální efekty (mimo React, na document.body)
    fxRefs.js
  components/           #   UI; panely obchodu a modaly jsou lazy (code-splitting)
```

### Jak to drží vysoký výkon (a neseká)

- **Engine mutuje stav** a běží v pevném kroku (`CONFIG.tickMs`) řízeném
  `requestAnimationFrame`. React si stav jen **vzorkuje** přes selektory —
  komponenta se překreslí jen když se její konkrétní řez opravdu změní,
  i když engine notifikuje každý snímek.
- **Poškození se aplikuje spojitě jako `DPS × Δt`**, ne jako jednotlivé zásahy.
  Létající emoji jsou tedy jen **dekorace** s tvrdým stropem počtu — obří DPS
  proto nikdy nezahltí stránku projektily (to byl zdroj původního lagu).
- **Code-splitting**: každý panel obchodu i každý modal je vlastní chunk
  (`React.lazy`), načte se až při otevření.

## Vyvážení (proč už nejde za 10 min na úroveň 30000)

Původní hra škálovala tvé poškození **automaticky s úrovní** → zabij rychle →
leveluj rychle → poškození samo roste → zabíjej ještě rychleji. To je kladná
zpětná vazba `dDPS/dt ∝ DPS²`, která vždy exploduje.

Oprava:
1. **Žádné automatické škálování poškození** — veškerý růst síly je z nákupů
   (každé vylepšení se počítá).
2. **Zlato roste znatelně pomaleji než HP** (`goldGrowth 1.09` vs `hpGrowth 1.155`).
   Poměr odměna/HP s úrovní klesá → reinvestice se sama dusí, běh se přirozeně
   zpomalí do „zdi" → motivace k **rebirthu** (Clicker Heroes treadmill).
3. **Stropy proti lagu**: limit projektilů a plovoucích čísel, podlaha intervalu
   palby a strop levelu „Zrychlení" (endgame), pojistka kill/​tick.

Ověřeno simulátorem `npm run balance` — greedy hráč nemá runaway (žádné
desítky úrovní za vteřinu mimo krátký dojezd po rebirthu) a postup je plynulý.

## Co je nového oproti původní hře

- **Úspěchy s trvalými odměnami** (+% poškození / zlata / 🕊) a toast oznámení.
- **Nové varianty Ekiho** — Inferno 🔥, Cursed 🟣 a mega-boss **Eki Král** 👑 (každá 25.).
- **Více zbraní** (12) podle emoji: 🥊🏏⚾🏀🎳🔨🪓⚔️💣🚀☄️🌋.
- **Zuřivost** 😡 — rychlé klikání nabije dočasný ×7 buff (jako „frenzy").
- **Lucky Eki** 🍀 — občas vyskočí klikací bonus (jako zlatá sušenka): balík
  zlata + spustí zuřivost.
- **Rozšířený prestige strom** (Přesnost, Štěstí, …) a více laditelných čísel.
- Všechny ceny **zvednuté**, takže každý nákup má váhu.
```
