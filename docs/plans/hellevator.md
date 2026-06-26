# Plán: Pekelný výtah (Hellevator)

Status: **návrh** · Naposledy: 2026-06-26

Souvisí s [`guilds.md`](guilds.md) — Hellevator je první **cechovní aktivita**
(cechovní žebříček pater). Tady řešíme jádro režimu; cechovní vrstvu jen
naťukneme (§11) a detail je v plánu cechů.

## 1. Cíl

Nový **časový režim**: Ekiho výtah se utrhne a padá do pekla. Každé **patro** =
jeden **zlý Eki (démon)**. Hráč má **60 sekund** a snaží se probít co **nejhlouběji** —
skóre = nejhlubší dosažené patro. Vše **nápadně animované** (šachta výtahu ujíždí
nahoru, kabina cuká dolů po každém zabití, pekelná záře sílí, bossové roztřesou
obraz). Odemčeno **od levelu 100** — nejdřívější „pokročilý" režim a přirozená
ukázka **zuřivosti** (burst).

**Klíčový poznatek (drží celý design):** „nejvíc pater za 60 s" je matematicky
**benchmark špičkového DPS**. Server už `peakDps` atestuje (plausibility +
`worldBossWeight`). Aby z toho nebyl jen reskin DPS žebříčku **a** nové cheat
okno, držíme každou mechaniku patra jako **deterministickou funkci poškození +
času** → server umí z atestovaného `peakDps` dopočítat „max věrohodné patro" a
podvodné nároky zahodit. **Skill** se rodí ze **smyčky kombo-prodlužování času**
(§3), ne z ničeho, co by klient mohl zfalšovat. Stejná anti-runaway filozofie
jako `difficultyScale` snapshot a bounded world-boss damage — aplikovaná na sprint.

Lokálně-first, čeština napevno (žádné i18n) — jako zbytek hry.

## 2. Rozhodnutí (DECIDED ✅ / OTEVŘENÉ ❓)

| Téma | Rozhodnutí |
|---|---|
| Formát | ✅ **60s sprint**, skóre = nejhlubší patro. Patro = 1 démon; zabití → kabina o patro dolů → další (silnější) démon. |
| Skill vrstva | ✅ **Kombo-prodloužení času.** Zabití démona pod jeho „par time" → **+0,4 s** na hodiny. Drží tě v běhu jen burst-build → měří *headroom* mezi výbuchem a tvojí zdí, ne raw level. A je to 100 % z poškození → server-ověřitelné. |
| Obtížnost patra | ✅ Recykluje `difficultyScale(s)` + `enemyMaxHp` (§5) — **power-normalizováno**: L100 i L5000 hráč topují kolem podobného počtu pater podle *optimalizace buildu*, ne podle progrese. Čerstvá metrika. |
| Odemčení | ✅ **Level 100** (`highestLevel`), dle zadání. Pozn.: ostatní systémy jsou 1000+, takže brzy je tu málo build-páček (gear až 1000, mazlíčci 2000…) — early Hellevator = klikání + zbraně + **frenzy**. Odměny brzy skromné, režim „roste" s tebou. |
| Nová měna | ✅ **🔥 Síra** — exkluzivní pro Hellevator (jako 🐉 jen z world bosse). Padá po patrech (klesající výnos, strop na běh) + denní bonus + milníkové truhly. |
| Limiter běhů | ❓ **Pekelné žetony** — návrh ~3–5/den, regen 1 / pár hodin, stack ~5, dokupitelné za 💠. Bez nich by 🔥 byl nekonečný faucet. Čísla k ladění. |
| Žebříček | ✅ Sezónní **patrový žebříček** (nový board `hellevator`), server-odvozený z atestovaného `peakDps` (§9). Top-N → 🕊/💠 jako world-boss ranky. |
| Démoni / art | ✅ 10 variant + bossové, **CSS-filter recolor** základního sprite (jako stávající varianty — „barevné grading, ne textura"). Zero nový art na ship. |
| Vliv na obtížnost | ✅ Žádný. Odměny **bez `dmgPct`** (gold find / dust find / luck / krit) → mimo difficulty snapshot, jako mastery/runy/album. |
| Rebirth / sezóna | ✅ `bestFloor` rekord a 🔥 přežívají rebirth (jako bedny/úlomky); full-reset sezóny smaže (čerstvý `createState`). Sezónní žebříček pater se resetuje sezónou. |
| Cech | ✅ Hellevator je první cechovní aktivita — viz §11 a [`guilds.md`](guilds.md). Patra členů se sčítají do cechovního žebříčku. |

## 3. Herní smyčka

1. Utrať **1 pekelný žeton** → spustí se 60s odpočet, výtah na patře 1.
2. V kabině se zjeví démon Eki. **Zabij** → kabina **cukne o patro dolů**,
   počítadlo cvakne, vjede další (silnější) démon.
3. **Kombo-prodloužení času:** zabití pod „par time" patra → **+0,4 s** na
   hodinách. Minul jsi par → nic. Silný burst řetěz žije dál a fakticky běží
   déle — momentum hra jako runner. Pořád 100 % z poškození → server to dopočítá.
4. Hodiny na 0 → konec, skóre = nejhlubší patro, **udělí se odměny**, výtah s 💥
   dorazí na dno.

`par time` patra `f` = referenční „kolik ms má slušný build na to patro stačit".
Návrh: odvozeno z `floorHP(f)` a běhového efektivního DPS klienta (`meteredDps`),
aby +čas dostával ten, kdo patro probil **rychleji než průměr svého výkonu** —
samo-kalibruje napříč silami. Detail k ladění ve fázi 4.

## 4. Obsah — 10 démonů (+ bossové)

Stejný data-shape jako `apps/web/src/game/data/variants.js`
(`name/tier/hp/gold/glow/tint/filter/minLevel/weight`), ale **patrově laděné**
(rozsahy pater) místo weighted-random. Každý démon dostane **deterministickou**
mechaniku (funkce poškození/času → server-bounded; **žádné client-RNG ani
input-pattern** mechaniky, jinak se znovu otevře cheat plocha).

| Patra | id | Démon | Mechanika (vše z poškození/času) |
|---|---|---|---|
| 1–5 | `imp` | **Šotek Eki** | rozjezd, malé HP, rychlý |
| 3–9 | `horned` | **Rohatý Eki** | mírně tanky |
| 6–14 | `brimstone` | **Sírový Eki** | sirný oblak při smrti (kosmetický chain glow) |
| 8–18 | `cinder` | **Popelavý Eki** | — |
| 10–24 | `bloodthirsty` | **Krvelačný Eki** | **regeneruje, když ho neprobiješ pod par** → tlačí na burst |
| 12–28 | `thorned` | **Trnitý Eki** | **štít: prvních N úderů uždíbe armor**, pak HP |
| 15–34 | `magma` | **Lávový Eki** | vysoké HP, žhne |
| 18–40 | `shadowflame` | **Stínoplamenný Eki** | — |
| 22–44 | `soulless` | **Bezduchý Eki** | **požírá tvoje kombo**, když přežije moc dlouho |
| 26+ | `hellspawn` | **Pekelný Eki** | elitní výplň hlubokých pater |

**Bossové** na milníkových patrech (každé 10.: 10/20/30/40/50), recyklují
`bossShake` + dramatické otevření dveří + červený alarm vignette:

| Patro | Boss |
|---|---|
| 10 | **Vrátný Pekla** |
| 20 | **Sirný Tyran** |
| 30 | **Pán Popela** |
| 40 | **Kníže Plamenů** |
| 50+ | **Eki Lucifer** — finální hloubkový démon, dojde málokdo |

Definice (`apps/web/src/game/data/hellevator.js`):

```js
export const HELLEVATOR = {
  unlockLevel: 100,
  runMs: 60_000,
  comboBonusMs: 400,        // +0,4 s za podpar zabití
  passMax: 5, passRegenMs: 3*3600_000, passDailyFree: 3,
};
// démoni: patrová tabulka (floorFrom/floorTo/weight) + boss every 10
export const HELL_DEMONS = { imp:{ name:'Šotek Eki', tier:'😈', hp:0.6, glow:'#…',
  filter:'hue-rotate(-20deg) saturate(1.6) brightness(.9)', floorFrom:1, floorTo:5, weight:100 }, /* … */ };
export const HELL_BOSSES = { 10:{ name:'Vrátný Pekla', hp:14, filter:'…' }, /* … */ };
```

## 5. Formulky — obtížnost pater (`formulas.js`)

Recykluj stávající stroj, ať výtah škáluje s hráčem přesně jako svět. Floor HP se
**samo-kalibruje** z `enemyMaxHp` na hráčově highestLevel (= „tvůj aktuální svět,
ale eskalující rychle"), takže patra jsou power-normalizovaná out of the box:

```js
import { enemyMaxHp, difficultyScale } from './formulas.js';
const NORMAL = VARIANTS.normal;
// strmější než hpCurve — jen ~50 pater max → čistý exponenciál dělá zeď
const hellCurve = (f) => Math.pow(CONFIG.hellGrowth /* ~1.20 */, f - 1);

export function hellFloorHp(s, f) {
  const base = enemyMaxHp(s.highestLevel, NORMAL, difficultyScale(s));
  const demon = hellDemonAt(f);            // hp multiplier varianty/bosse
  return Math.ceil(base * hellCurve(f) * demon.hp);
}
```

Protože `difficultyScale` roste s prestige stejně jako poškození, **počet pater
měří mezeru mezi tvým 60s výbuchem a tvojí ustálenou zdí** = headroom buildu.
Žádný `Date.now()` ve formulkách (deterministický simulátor). Konstanty
(`hellGrowth`, `comboBonusMs`) jdou i do `packages/shared`, ať je server umí
ověřit (§9).

## 6. Stav + engine

`initialState.js` → `createState()`:

```js
hellevatorUnlocked: false,    // one-way (jako inventoryUnlocked)
hell: { bestFloor: 0, passes: 0, passAt: 0, freeAt: 0 }, // rekord + žetony (přežívá rebirth)
sira: 0,                      // 🔥 měna (přežívá rebirth, mře sezónou)
hellShop: {},                 // koupené bounded perky (id -> tier)
```

`resetRun()` (rebirth) — **NEmazat** `hell`/`sira`/`hellShop` (jako bedny/úlomky).

Odemčení v `engine.checkLevelUnlocks()` (vedle ostatních):

```js
checkHellevatorUnlock() {
  const s = this.state;
  if (!s.hellevatorUnlocked && s.highestLevel >= HELLEVATOR.unlockLevel) {
    s.hellevatorUnlocked = true;
    this.emit('unlock', { feature: 'hellevator' });
  }
}
```

Běh je **vlastní mini-engine** (oddělený od hlavní areny — jiný spawn, hodiny,
žádné bedny/loot z normálních zabití). Sdílí ale `clickDamage`/`weaponShotDamage`/
`meteredDps`, takže build hráče platí 1:1. Konec běhu: `grantHellLoot(deepestFloor)`
(🔥 + milníky), update `bestFloor`, a **odešle skóre na server** (§9).

## 7. Animace (čisté CSS + FxManager pooling)

Žádná nová knihovna — sedí na stávající `@keyframes` + `_restartAnim()` + DOM pool
(jako projektily/mince).

- Vertikální **šachta** ujíždí nahoru; čísla pater + pekelná záře **sílí** s hloubkou.
- Při zabití: kabina **spadne o patro** (`translateY` cuk + ease), dveře probliknou,
  počítadlo popne, vjede další démon — pooled DOM.
- Boss patra: dveře se rozletí, `bossShake`, tint obrazovky.
- Posledních 10 s: **červený alarm vignette**, rychlejší kadence.

```css
@keyframes hellDrop { 0%{transform:translateY(-18px);} 60%{transform:translateY(6px);} 100%{transform:translateY(0);} }
.hell-car.drop { animation: hellDrop .28s cubic-bezier(.36,.07,.19,.97); }
@keyframes hellAlarm { 0%,100%{box-shadow:inset 0 0 80px rgba(255,40,0,.0);} 50%{box-shadow:inset 0 0 120px rgba(255,40,0,.55);} }
.hell-shaft.panic { animation: hellAlarm .8s ease-in-out infinite; }
```

## 8. UI

- Topbar tlačítko **🛗** (jen když `hellevatorUnlocked`), badge = volné žetony.
  V `TopBar.jsx` stejný pattern jako 🧪/🐾/🔣 — `onOpenHellevator` → `setModal('hellevator')`
  v `Game.jsx`. (Alternativa: plnohodnotná záložka jako World Boss; navrhuji **modal**
  s fullscreen během, ať to je „událost", ne další tab.)
- `HellevatorModal.jsx`: pre-run lobby (rekord, žetony, „Sjet dolů" tlačítko,
  odkaz na **Pekelný krám**) → fullscreen 60s běh (šachta + démon + hodiny +
  počítadlo pater + kombo indikátor) → výsledková obrazovka (patra, 🔥, milníky,
  rank).
- `HellShop.jsx`: utrať 🔥 — bounded perky (tiery), dokup žetonů, kosmetika
  (démon-skiny / témata výtahu), směna 🔥→💠/🕊 (denní strop).

## 9. Anti-cheat / žebříček (klíčové)

- Klient hlásí `{ deepestFloor, peakDps, durationMs, comboExtensions }`. Server z
  **už-atestovaného `peakDps`** + známé `hellCurve`/`difficultyScale` spočítá
  **max věrohodné patro** (kumulativní čas na probití pater 1..F při daném DPS ≤
  60 s + prodloužení). Nárok nad strop → **nehodnotit do žebříčku** (lifetime save
  se uloží jako vždy). **Žádná nová trust plocha.**
- 🔥 Síra je local-first, ale **strop na běh + denní strop** → falešný běh nenatěží
  smysluplnou měnu (jako raid vault skim caps).
- Perky **bez `dmgPct`** → mimo difficulty snapshot, žádná kontaminace ladderu;
  gold/dust jsou stejně už plausibility-bounded.
- Schema: nový board `hellevator` do `LEADERBOARD_BOARDS` (`packages/shared`) a
  sloupec `hell_best_floor` do `season_scores` (aditivní migrace), submit přes
  rozšířený `POST /api/scores` (server přepočte věrohodnost). Detail mirroruje
  `seasons.md` submit path.

## 10. Dotčené soubory

| Soubor | Akce |
|---|---|
| `game/data/hellevator.js` | **nový** — config, démoni, bossové, ceny perků |
| `game/data/hellImages.js` | **nový** — glob skinů (browser-only, jako elixirImages) |
| `game/formulas.js` | edit — `hellFloorHp`, `hellCurve`, par-time helper |
| `game/engine.js` | edit — `checkHellevatorUnlock`, mini-engine běhu, `grantHellLoot`, buy perks/žetony |
| `game/initialState.js` | edit — `hell`, `sira`, `hellShop`, `hellevatorUnlocked`; `resetRun` je nemaže |
| `game/persistence.js` | edit — snapshot + hydrate nových polí (aditivně, bez bumpu `v`) |
| `components/HellevatorModal.jsx` | **nový** — lobby + 60s běh + výsledky |
| `components/hell/HellShop.jsx` | **nový** — 🔥 krám |
| `components/TopBar.jsx` | edit — 🛗 tlačítko + badge žetonů |
| `components/Game.jsx` | edit — `modal === 'hellevator'` |
| `packages/shared/src/index.js` | edit — `HELLEVATOR` konstanty, board `hellevator`, věrohodnost pater |
| `apps/server/migrations/00X_hellevator.sql` | **nový** — `alter table season_scores add column hell_best_floor` + index |
| `apps/server/routes/scores.js` + `lib/players.js` | edit — přijmout/ověřit/rankovat patra |
| styly (css) | edit — šachta, kabina, alarm, démon recolory, krám |

## 11. Cechovní vrstva (naťuknutí — detail v `guilds.md`)

Hellevator je první **cechovní aktivita**: součet `hell.bestFloor` členů → cechovní
„hloubka", samostatný **cechovní žebříček pater** v sezóně + týdenní „cechovní
sjezd" event. Protože patra jsou **už atestovaná** (§9), cech jen agreguje
server-side — **žádná nová trust plocha**. Cechovní bonus za top umístění =
bounded 🕊/💠 členům (jako `season_rewards`).

## 12. Fáze

1. **Jádro (hratelné):** data + state + `hellFloorHp` + mini-engine běhu
   (spawn/hodiny/kombo) + konec běhu. Bez UI lazení (běh přes placeholder).
2. **Animace + UI:** `HellevatorModal` (lobby/běh/výsledky), šachta + cuk + alarm,
   topbar 🛗.
3. **Ekonomika:** 🔥 Síra, milníky, `HellShop`, žetony (limiter).
4. **Žebříček + server:** migrace `hell_best_floor`, submit + věrohodnost, board.
5. **Cech:** napojení na `guilds.md` (cechovní žebříček pater).

Každá fáze je samostatně shippable (1 dá hratelný sprint přes konzoli, 2 vizuál,
3 odměny, 4 kompetici).

## 13. Rizika / otevřené otázky

- **`hellGrowth` ladění:** moc nízké → whale dojde na patro 999; moc vysoké → zeď
  hned. Cíl ~30–50 pater u dobrého buildu. Vyladit ve fázi 1 proti reálným DPS.
- **Early game thin (L100):** bez gearu/mazlíčků je build mělký → early Hellevator
  je hlavně frenzy + zbraně. Zvážit: ve výtahu **frenzy přednabité / nabíjí rychleji**
  (ať je to „frenzy hřiště"). Odměny brzy skromné.
- **Par-time férovost:** špatně nastavený par → buď nikdy +čas (frustrace), nebo
  vždy +čas (běh nikdy nekončí). Self-kalibrace z `meteredDps` je návrh; sledovat.
- **Žeton ekonomika:** příliš štědré = 🔥 inflace. Strop na běh + denní směna 🔥→💠
  jsou pojistky; držet konzervativně.
</content>
</invoke>
