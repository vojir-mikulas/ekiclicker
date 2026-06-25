# Plán: Elixíry (dočasné buffy)

Status: **návrh** · Naposledy: 2026-06-25

## 1. Cíl

Přidat do obchodu novou záložku **🧪 Elixíry** — kupované, **spotřební** lektvary
(pití/energy drinky), které na omezenou dobu dají silný **dočasný buff**. Vždy
je aktivní **jen jeden naráz** a běží mu odpočet, který se hráči **nápadně
zobrazuje** (pill v TopBaru + odpočítávací proužek).

Mechanika je **kopie zuřivosti** (`s.frenzy`) — žádný nový exponenciál do
obtížnosti, čistě multiplikativní burst jako frenzy ×7. Tím zůstává anti-runaway
filozofie netknutá: elixír zrychlí probití aktuální zdi, ale **nesnižuje HP**
(obtížnost drží `prestigePower` + `runGearPower` snapshot, ani jeden elixír
neobsahuje).

Lokálně-first, offline-friendly, vše v češtině napevno (žádné i18n) — jako zbytek hry.

## 2. Rozhodnutí (DECIDED ✅ / OTEVŘENÉ ❓)

| Téma | Rozhodnutí |
|---|---|
| Model nákupu | ✅ **Stock + Vypít** (spotřebka). Koupě → přidá na sklad (`elixirStock[id]++`), tlačítko „Vypít" buff aktivuje. Lze stockpilovat (1×/10×/100×/max) a popnout před bossem. |
| Jeden aktivní | ✅ `s.elixir.active` je jediné id. Vypití nového **přepíše** běžící (žádný stacking). |
| Odpočet / čas | ✅ `until = Date.now() + durationMs` (**wall-clock**, ne `performance.now()`). Přežije reload se správným zbývajícím časem; odtikává i při zavřené kartě (poctivé, jako offline výdělek). |
| Vliv na obtížnost | ✅ Žádný. Elixír není v `prestigePower` ani `runGearPower` → čistý burst (jako frenzy). |
| Persistence buffu | ✅ Aktivní buff i sklad se ukládají; expirovaný buff se při loadu zahodí. |
| Rebirth | ✅ Sklad **přežívá** rebirth (jako bedny/vejce); aktivní buff se **zruší** (`resetRun`). |
| Sezóna | ✅ Full-reset sezóny smaže vše vč. skladu (čerstvý `createState`) — nic navíc. |
| Odemčení | ✅ **Bez levelové brány** — přirozenou bránou je cena (Plznička levná, Špendlíky drahé). Dají se odemknout brzy jako fun gold-sink. |
| Cena | ❓ Návrh: škáluje s `highestLevel` (`baseCost * level`), ať nezlevní v lategame. K doladění. |
| Multiplikátory / délky | ❓ Tabulka níže je **návrh** — vyladit, ať nepřebijí bosse (mají deadline → burst je zamýšlený counter). |
| Ikony | ❓ Foto produktů (Plzeň/Monster/Red Bull/lahev) → `assets/elixirs/*.png`, fallback emoji. Soubory dodá hráč. |

## 3. Obsah — 4 elixíry (návrh balancu)

Multiplikátory jsou multiplikativní (jako frenzy). Drženy ≤ frenzy úrovně, ať je
serverový plausibility strop (frenzy ×7 už toleruje) bez úprav unesl.

| id | Název | Emoji (fallback) | Efekt | Délka | Cena (návrh) | Flavor |
|---|---|---|---|---|---|---|
| `plznicka` | **Plznička** | 🍺 | `gold ×2` (goldMult) | 5 min | levná | „Po pivku se líp farmí." — klidný gold-farm |
| `monster` | **Monster White** | 🧃 | `weapon ×2` (auto-DPS) | 3 min | střední | „Zero Ultra fokus." — auto zbraně válí |
| `redbull` | **Redbullíček** | 🐂 | `click ×2,5` + `critChance +0,1` | 2 min | vyšší | „Křídla na klikání." — manuální burst |
| `spendliky` | **Špendlíky** | 🍸 | `dmg ×5` (globální) | 90 s | drahá | „Tvrdej matroš." — frenzy on-demand |

Definice (`apps/web/src/game/data/elixirs.js`):

```js
export const ELIXIRS = {
  plznicka: { id:'plznicka', emoji:'🍺', name:'Plznička',
    desc:'×2 zlato', durationMs: 5*60_000, baseCost: 800,
    effect:{ dmg:1, gold:2, weapon:1, click:1, critChance:0 } },
  monster:  { id:'monster', emoji:'🧃', name:'Monster White',
    desc:'×2 DPS zbraní', durationMs: 3*60_000, baseCost: 2000,
    effect:{ dmg:1, gold:1, weapon:2, click:1, critChance:0 } },
  redbull:  { id:'redbull', emoji:'🐂', name:'Redbullíček',
    desc:'×2,5 úder + krit', durationMs: 2*60_000, baseCost: 3500,
    effect:{ dmg:1, gold:1, weapon:1, click:2.5, critChance:0.1 } },
  spendliky:{ id:'spendliky', emoji:'🍸', name:'Špendlíky',
    desc:'×5 poškození', durationMs: 90_000, baseCost: 9000,
    effect:{ dmg:5, gold:1, weapon:1, click:1, critChance:0 } },
};
export const ELIXIR_KEYS = Object.keys(ELIXIRS);

// cena škáluje s postupem, ať je to gold-sink i v lategame
export function elixirCost(id, level) {
  return Math.ceil(ELIXIRS[id].baseCost * Math.max(1, level));
}
export const elixirCostAt = (s, id) => () => elixirCost(id, s.highestLevel);
```

## 4. Stav (state shape)

`initialState.js` → `createState()`:

```js
elixir: { active: null, until: 0 }, // active = id elixíru | null; until = Date.now() epoch ms
elixirStock: {},                    // id -> počet koupených (přežívá rebirth)
```

`resetRun()` (rebirth) — sklad NEresetovat, jen zrušit běžící buff:

```js
state.elixir = { active: null, until: 0 };
// elixirStock se NEmaže (jako chests/eggs)
```

## 5. Formulky — aplikace efektu (`formulas.js`)

Přesná kopie frenzy patternu: tick drží `s.elixir.active`, formulky jen čtou
(žádný `Date.now()` ve formulkách → simulátor zůstává deterministický).

```js
import { ELIXIRS } from './data/elixirs.js';
const ELIXIR_IDENTITY = { dmg:1, gold:1, weapon:1, click:1, critChance:0 };
export function elixirMods(s) {
  const id = s.elixir && s.elixir.active;
  if (!id) return ELIXIR_IDENTITY;
  const def = ELIXIRS[id];
  return def ? def.effect : ELIXIR_IDENTITY;
}
```

Zapojení (přidat `* elixirMods(s).X` k existujícím násobičům):

| Funkce | Změna |
|---|---|
| `globalMult(s)` | `... * frenzy * gear * elixirMods(s).dmg` |
| `goldMult(s)` | `... * gear * elixirMods(s).gold` |
| `weaponShotDamage(s,w)` | `... * (1 + combatStats(s).weaponPct) * elixirMods(s).weapon` |
| `clickDamage(s)` | výsledek `* elixirMods(s).click` (jen manuální úder, ne auto) |
| `critChance(s)` | `Math.min(0.9, ... + elixirMods(s).critChance)` |

## 6. Engine (`engine.js`)

```js
buyElixir(id) {
  const s = this.state, def = ELIXIRS[id]; if (!def) return;
  const batch = buyBatch(elixirCostAt(s, id), s.gold, s.buyAmount); // 1/10/100/max
  if (batch.count <= 0 || s.gold < batch.cost) return;
  s.gold -= batch.cost;
  s.elixirStock[id] = (s.elixirStock[id] || 0) + batch.count;
  this.afterBuy();
}

drinkElixir(id) {
  const s = this.state;
  if ((s.elixirStock[id] || 0) <= 0 || !ELIXIRS[id]) return;
  s.elixirStock[id] -= 1;
  s.elixir.active = id;
  s.elixir.until = Date.now() + ELIXIRS[id].durationMs;
  this.emit('elixir', { active: id });
  this.afterInventory(); // save + notify
}
```

Expirace v `tick()` (vedle frenzy checku) — wall-clock:

```js
if (s.elixir.active && Date.now() >= s.elixir.until) {
  s.elixir.active = null;
  this.emit('elixir', { active: null });
}
```

## 7. UI

### 7.1 Záložka v obchodě
`Shop.jsx`: přidat tab `{ id:'elixirs', label:'🧪 Elixíry', title:'Elixíry', sub:'Dočasné buffy — vypij a popni' }`,
lazy `ElixirList`, zařadit do `showBuyAmount` (kvůli stockpile 1/10/100/max) a do `selectDeals`
(má-li hráč na nějaký elixír).

`ElixirList.jsx`: vlastní dlaždice (ne čistý `ShopItem`, protože potřebujeme **dvě**
akce). Řádek = ikona (obrázek/emoji) · název · efekt+délka · sklad `×N` · **Koupit**
(cost, +stock) · **Vypít** (disabled když `stock===0`; zvýrazní běžící).

### 7.2 Aktivní elixír — nápadný indikátor
`ActiveElixir.jsx` renderovaný v TopBaru (jen když `s.elixir.active`): pill s ikonou,
názvem a **odpočítávacím proužkem** + zbývajícími sekundami.

Engine notifikuje každý frame (`frame()` → `notify()`), takže komponenta přihlášená
selectorem `{ activeId, until }` se přerenderuje plynule a `remaining = max(0, until - Date.now())`
spočítá živě — žádný vlastní timer netřeba. Proužek může jet i čistě CSS animací
`width 100%→0` po `durationMs`.

### 7.3 Ikony / assety
Zrcadlo `itemImages.js`: nový `apps/web/src/game/data/elixirImages.js`:

```js
const mods = import.meta.glob('../../assets/elixirs/*.{png,webp,jpg,jpeg}',
  { eager:true, query:'?url', import:'default' });
const MAP = {};
for (const p in mods) MAP[p.split('/').pop().replace(/\.[^.]+$/,'')] = mods[p];
export const elixirImageUrl = (id) => MAP[id] || null;
```

Soubory: `assets/elixirs/{plznicka,monster,redbull,spendliky}.png` (foto produktů od
hráče). Chybí-li → fallback na emoji. *(Pozn.: foto z chatu nejdou uložit
automaticky — soubory je třeba do složky dodat, jinak pojedou emoji.)*

## 8. Persistence (`persistence.js`)

`buildSnapshot()` — přidat (aditivně, starý save bez nich = prázdný; **bez bumpu `v`**):

```js
elixir: state.elixir,
elixirStock: state.elixirStock,
```

`hydrateState()` — default + zahození expirovaného buffu při loadu:

```js
state.elixirStock = (d.elixirStock && typeof d.elixirStock === 'object') ? d.elixirStock : {};
state.elixir = (d.elixir && d.elixir.active && Date.now() < d.elixir.until)
  ? { active: d.elixir.active, until: d.elixir.until }
  : { active: null, until: 0 };
```

## 9. Anti-cheat / žebříček

- Elixír je **lokální burst**, do žebříčku se nic neukládá → žádná kontaminace, žádné schema změny na serveru.
- Aktivní ×5 může na chvíli zvednout kills/sec; serverový `PLAUSIBILITY` (`maxKillsPerSec 60` + `baseKillsBuffer 2000`) už toleruje frenzy ×7 → elixíry v rozsahu ×2–×5 jsou ve stejné obálce. **Bez úprav.**
- Save podpis (cyrb53) automaticky pokryje nová pole. Wall-clock `until` jde teoreticky natáhnout přetočením hodin — stejný (přijatelný) limit jako offline výdělek; necílíme na odhodlaného cheatera.

## 10. Dotčené soubory

| Soubor | Akce |
|---|---|
| `game/data/elixirs.js` | **nový** — definice, ceny, `elixirCost` |
| `game/data/elixirImages.js` | **nový** — glob obrázků (browser-only) |
| `assets/elixirs/*.png` | **nové** — foto produktů (dodá hráč) |
| `components/shop/ElixirList.jsx` | **nový** — panel záložky (Koupit + Vypít) |
| `components/ActiveElixir.jsx` | **nový** — pill s odpočtem |
| `game/initialState.js` | edit — `elixir`, `elixirStock`; `resetRun` zruší aktivní |
| `game/formulas.js` | edit — `elixirMods` + zapojení do 5 násobičů |
| `game/engine.js` | edit — `buyElixir`, `drinkElixir`, expirace v `tick` |
| `game/persistence.js` | edit — snapshot + hydrate nových polí |
| `components/shop/Shop.jsx` | edit — tab + lazy + buyAmount + deals |
| `components/TopBar.jsx` | edit — vykreslit `ActiveElixir` |
| styly (css) | edit — dlaždice elixíru + pill + proužek |

## 11. Fáze

1. **Jádro (hratelné):** data + state + `elixirMods` + engine (buy/drink/expire) + persistence. Bez UI lazení.
2. **UI obchodu:** záložka + `ElixirList` (Koupit/Vypít), buyAmount, deals tečka.
3. **Aktivní indikátor:** `ActiveElixir` pill s odpočtem + CSS proužek.
4. **Ikony + lazení:** foto assety, doladit ceny/délky/multiplikátory dle pocitu.

Každá fáze je samostatně shippable (1 dá funkční buff přes konzoli, 2 přidá nákup, 3 vizuál).

## 12. Rizika / otevřené otázky

- **Balance Špendlíků:** ×5 + stockpile + boss deadline = může trivializovat bosse. Možná snížit na ×4 / kratší / přidat cooldown na vypití. (K ladění ve fázi 4.)
- **Cena vs. lategame:** lineární `baseCost*level` možná nestačí; zvážit jiný škálovací vztah, ať zůstane gold-sink.
- **Buy = activate alternativa:** lze zjednodušit (koupě rovnou aktivuje, bez skladu) + cooldown proti trvalému uptime — méně stavu, ale ztratí „barový regál". Pokud chceš lean verzi, je to fork ve fázi 1.
- **Odtikávání offline:** buff hoří i při zavřené kartě. Pokud má vadit, jít přes „zbývající ms" místo absolutního `until` — ale to zve cheat hodinami. Doporučeno nechat wall-clock.
