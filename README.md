# 👊 Dej mu! — Eki Clicker

Inkrementální „clicker" hra (mlátíš Ekiho) + žebříček. **Monorepo** (npm
workspaces): React/Vite frontend, Express/Postgres backend, Docker.
Inspirace: Clicker Heroes & Cookie Clicker.

```bash
npm install        # nainstaluje všechny workspaces
npm run dev        # web (:5173) + server (:3000) zároveň; /api se proxuje
npm run build      # produkční build webu (do apps/web/dist/)
npm run start      # spustí jen server (servíruje build + /api)
npm run migrate    # spustí DB migrace (potřebuje DATABASE_URL)
npm run balance    # simulátor vyvážení ekonomiky (greedy hráč)
npm run smoke      # headless test herního jádra
npm run lint
```

Hra jde hrát **lokálně bez účtu** (výchozí). Žebříček je dobrovolný — připojení
přezdívkou postup vynuluje (férový start). Bez serveru/DB hra normálně běží,
jen `/api/*` vrací 503 a žebříček je „offline".

## Monorepo

```
apps/
  web/      # React + Vite frontend (původní hra) — viz „Architektura webu"
  server/   # Express backend: účty, skóre, žebříček, statika webu
packages/
  shared/   # sdílený kontrakt (skóre pole, validace přezdívky, meze anti-cheatu)
Dockerfile, docker-compose.yml (+ .local) — viz „Nasazení"
```

### Backend (`apps/server`)

- **Identita = tajný token** v `localStorage` (posílá se jako `Bearer`). Přežije
  změnu IP (práce ↔ domov). „Kód pro obnovu" = ten token — zadáním na jiném
  zařízení / po smazání dat obnovíš účet i **uložený postup** (server drží
  poslední `save_blob`).
- **IP** se ukládá jen pro audit + měkký limit: max **5 nových účtů / IP / den**
  (sdílená firemní NAT tak uživí celý tým).
- **Anti-cheat** (best-effort, ne pevnost): monotonie (skóre neklesá — **v rámci
  sezóny**), věrohodnost (úroveň/zabití vůči času hraní), throttle submitů,
  volitelný HMAC. Lifetime staty v `players` jsou `GREATEST` a neblokují.
- **Sezóny** (časově ohraničené žebříčky): aktivní je vždy jedna (`seasons`),
  standing se drží v `season_scores` a každou sezónou se resetuje. Při uzávěrce
  se spočtou odměny za umístění (`season_rewards`) a hráči po potvrzení resetují
  postup (server-wide rebirth) — viz `docs/plans/seasons.md`.
- **Postgres** přes `pg`; migrace v `apps/server/migrations/*.sql` se pustí samy
  při startu (idempotentně, tabulka `schema_migrations`). Bez `DATABASE_URL`
  server běží dál, jen `/api/*` → 503.

API: `POST /api/register|recover`, `GET|PATCH|DELETE /api/me`,
`POST /api/me/enter-season`, `POST /api/scores`, `GET /api/leaderboard?board=&season=`,
`GET /api/seasons`, `GET /api/players/:id`. Konfigurace v `apps/server/.env.example`.

### Spuštění nové sezóny (na release)

Sezóna se otevírá **z kódu** — přidáš jednořádkovou migraci a nasadíš:

```sql
-- apps/server/migrations/00X_season_N.sql
select rotate_season();
```

Migrace se při nasazení spustí jednou: uzavře aktivní sezónu, spočítá odměny
a otevře další. Hráči při dalším načtení uvidí výzvu k resetu a startují znovu.

## Nasazení (Docker)

Produkce — **externí Postgres** přes `DATABASE_URL`:

```bash
DATABASE_URL=postgres://… HMAC_SECRET=… docker compose up -d --build
```

Lokální stack i s Postgresem (vývoj):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Jeden Node proces servíruje statický web i `/api`; migrace proběhnou při startu.

## Architektura webu

Oddělené **herní jádro** (čistá logika, bez Reactu) a **vrstva zobrazení** (React).

```
apps/web/src/
  game/                 # herní jádro — žádný React, žádné DOM
    config.js           #   všechna laditelná čísla + anti-lag stropy
    formulas.js         #   čistá matematika (poškození, DPS, ceny, škálování)
    engine.js           #   imperativní jádro: měnitelný stav + pevný krok smyčky
    initialState.js     #   tovární funkce stavu + reset běhu
    persistence.js      #   ukládání / načítání + sdílený save „blob" (sync/obnova)
    format.js           #   formátování velkých čísel a času
    data/               #   data hry (zbraně, vylepšení, prestige, varianty, úspěchy)
  state/
    engineContext.js    #   React context (oddělený kvůli Fast Refresh)
    EngineContext.jsx   #   provider: vytvoří engine, spustí smyčku, ukládání
    AccountContext.jsx  #   účet hráče + best-effort synchronizace skóre
  net/                  #   API klient, builder skóre, hlášky chyb
  hooks/
    useEngine.js        #   useSyncExternalStore selektor (re-render jen při změně řezu)
  effects/
    FxManager.js        #   imperativní vizuální efekty (mimo React, na document.body)
    fxRefs.js
  components/           #   UI; obchod, modaly i žebříček jsou lazy (code-splitting)
```

Původní jednosouborová verze je archivovaná v `apps/web/legacy/index.html`.

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
4. **Obtížnost škáluje s prestige silou (anti-blitz)** — po rebirthu si neseš
   veškerou prestige sílu (hlavně Věčný hněv, ×1,16/level), takže čerstvý běh
   jinak instakilluje stovku levelů „o ničem" až ke zdi. HP nepřítele proto dostane
   násobič `(prestige damage power)^difficultyExp` (exp `0.78`, `< 1`). Každý
   rebirth pořád posune zeď **dál** (prestige se vyplatí), ale blitz je **omezený**,
   ne neomezený. První běh (bez prestige) je nedotčený. Lze ladit:
   `npm run balance --blitz` ukáže délku blitzu i polohu zdi pro různé `difficultyExp`.

Ověřeno simulátorem `npm run balance` — greedy hráč nemá runaway (žádné
desítky úrovní za vteřinu mimo krátký dojezd po rebirthu) a postup je plynulý.

## Co je nového oproti původní hře

- **Úspěchy s trvalými odměnami** (+% poškození / zlata / 🕊) a toast oznámení.
- **Nové varianty Ekiho** — Inferno 🔥, Cursed 🟣, a do endgame Abyss 🌌,
  Celestial ✨ a Eternal ♾️. Bossové: **Eki Král** 👑 (každá 25.) a
  **Eki Titán** 🌟 (ultra boss každá 100. — endgame milník).
- **Boss loot** 💰 — bossové pouštějí poklad (zlato navíc); mega/ultra navíc
  upustí **Odpuštění** 🕊 (propojení s prestige metou). Vše laditelné v CONFIG.
- **Více zbraní** (15) podle emoji: 🥊🏏⚾🏀🎳🔨🪓⚔️💣🚀☄️🌋🕳️🌌💥.
- **Více vylepšení za zlato** — Tvrdý dopad 💢 (krit), Chamtivost 🤑 (zlato),
  Rytmus 🥁 (combo) a Zuřivá nálož 🌶️ (delší zuřivost).
- **Zuřivost** 😡 — rychlé klikání nabije dočasný ×7 buff (jako „frenzy").
- **Lucky Eki** 🍀 — občas vyskočí klikací bonus (jako zlatá sušenka): balík
  zlata + spustí zuřivost.
- **Rozšířený prestige strom** (Přesnost, Štěstí, …) a více laditelných čísel.
- **Denní úkoly** 📜 — 3 úkoly denně (zabití, bossové, kliky, Lucky Eki, …) za
  Odpuštění 🕊 + balík zlata; splnění všech drží **sérii** 🔥 s rostoucím bonusem.
  Úkoly měří denní přírůstek statistik (rebirth-proof), výběr je deterministický
  ze seedu dne (stejné po reloadu i po obnově účtu). Lehký důvod vrátit se každý den.
- Všechny ceny **zvednuté**, takže každý nákup má váhu.
```
