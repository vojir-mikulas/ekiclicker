# Obrázky kusů (item icons)

Sem dej PNG/WebP/JPG pojmenované podle **id základu** (base id) z
`src/game/data/items.js`. Soubor se automaticky napojí (Vite glob), jinak se
použije náhradní emoji.

Příklady (slot „weapon"):

| soubor          | kus                |
|-----------------|--------------------|
| `knuckles.png`  | 🥊 Boxer (boxer)   |
| `dagger.png`    | 🔪 Kudla           |
| `chair.png`     | 🪑 Skládací židle  |

Další základy: `fist`, `sword`, `trident`, `bolt`, `star` (weapon),
`mitt/belt/wing` (gloves), `ring/beads/orb` (charm), `shield/spark/swirl` (aura).

Pozn.: ikony se ukazují v inventáři/na slotech. Pro **letící projektil úderu**
se zatím používá emoji (obrázky mají neprůhledné pozadí) — až budou s
průhledným pozadím, dají se použít i tam.
