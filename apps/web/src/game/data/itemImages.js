/* =========================================================================
   PŘEKLAD id základu kusu → URL obrázku (ikona v inventáři).
   POUZE PRO PROHLÍŽEČ — používá import.meta.glob (Vite). NEimportovat z node
   kódu (simulátor/smoke), jinak to spadne. Proto je oddělené od items.js.

   Stačí hodit soubor `src/assets/items/<baseId>.png` (png/webp/jpg) a napojí se
   sám; chybějící obrázek → komponenty spadnou zpět na emoji.
   ========================================================================= */
const mods = import.meta.glob('../../assets/items/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const MAP = {};
for (const path in mods) {
  const id = path.split('/').pop().replace(/\.[^.]+$/, ''); // 'knuckles.png' → 'knuckles'
  MAP[id] = mods[path];
}

export function itemImageUrl(baseId) {
  return MAP[baseId] || null;
}
