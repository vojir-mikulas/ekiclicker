/* =========================================================================
   PŘEKLAD id elixíru → URL obrázku (ikona v obchodě / indikátoru).
   POUZE PRO PROHLÍŽEČ — používá import.meta.glob (Vite). NEimportovat z node
   kódu (simulátor/smoke), jinak to spadne. Proto je oddělené od elixirs.js
   (zrcadlo itemImages.js).

   Stačí hodit soubor `src/assets/elixirs/<id>.png` (png/webp/jpg) a napojí se
   sám; chybějící obrázek → komponenty spadnou zpět na emoji.
   ========================================================================= */
const mods = import.meta.glob('../../assets/elixirs/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const MAP = {};
for (const path in mods) {
  const id = path.split('/').pop().replace(/\.[^.]+$/, ''); // 'plznicka.png' → 'plznicka'
  MAP[id] = mods[path];
}

export function elixirImageUrl(id) {
  return MAP[id] || null;
}
