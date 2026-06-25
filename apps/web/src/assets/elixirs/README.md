# Ikony elixírů

Sem hoď obrázky elixírů jako `<id>.png` (nebo `.webp`/`.jpg`) — napojí se samy
přes `src/game/data/elixirImages.js`. Chybějící soubor → fallback na emoji.

Očekávaná id (viz `src/game/data/elixirs.js`):

| soubor | elixír | foto |
|---|---|---|
| `plznicka.png` | Plznička | plechovka Pilsner Urquell |
| `monster.png` | Monster White | Monster Energy Zero Ultra (bílá) |
| `redbull.png` | Redbullíček | Red Bull plechovka |
| `spendliky.png` | Špendlíky | čirá lahev (vodka/tvrdý) |

Doporučení: čtvercový ořez, průhledné pozadí (PNG/WebP), ~128×128 px stačí.
