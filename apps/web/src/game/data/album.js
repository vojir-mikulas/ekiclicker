/* =========================================================================
   ALBUM — sběratelský deník (Bestiář + Arzenál). ČISTÁ data + agregace
   (žádný stav, žádné DOM) → sdílí engine i simulátor.

   Co dělá: dává SBĚRATELSKÝ smysl obsahu, který dosud žádnou odměnu neměl —
   druhy Ekiů (zabiješ je a zmizí) a základy výbavy (jen kosmetické emoji).
   Každý záznam se „objeví" prvním setkáním (zabití varianty / získání základu).

   Návrhový princip (drží anti-runaway / anti-blitz filozofii hry):
   - Milníky dokončení přidávají jen BOUNDED % bonusy, které sdílí klíče afixů s
     výbavou → promítnou se do combatStats VŠUDE, kde výbava, NIKDY nový exponenciál.
   - ZÁMĚRNĚ žádné dmgPct → bonus se NEpromítá do snapshotu obtížnosti
     (difficultyScale počítá jen prestige + dmgPct výbavy/mazlíčka). Je to tedy
     „čistý zisk" přesně jako non-dmgPct afixy výbavy dnes — bez vlivu na blitz.
   - Deník PŘEŽÍVÁ rebirth (jako achievementy). Maže ho jen konec sezóny (full reset).
   ========================================================================= */

import { VARIANTS } from './variants.js';
import { AFFIXES, affixLabel, SLOT_IDS, SLOT_BY_ID, BASE_BY } from './items.js';

/* ----------------------------- stránky deníku -----------------------------
   bucket = klíč v state.album, kam se ukládají objevené záznamy (id → true).
   milestones = prahy počtu objevených → KUMULATIVNÍ bounded-% bonus (vyšší práh
   se přičítá k nižším). Témata: Bestiář = ekonomika/štěstí, Arzenál = ofenziva. */
export const ALBUM = {
  bestiary: {
    id: 'bestiary', name: 'Bestiář', emoji: '👹', bucket: 'enemies',
    desc: 'Každý druh Ekiho, kterého jsi sejmul. Odhalí se prvním zabitím.',
    hint: 'Druhy Ekiů potkáš samy během hraní — silnější varianty čekají hlouběji, bossové na svých úrovních.',
    milestones: [
      { count: 5,  stats: { goldPct: 0.05 } },
      { count: 10, stats: { goldPct: 0.07, luck: 0.05 } },
      { count: 15, stats: { goldPct: 0.10, critChance: 0.02 } },
      { count: 20, stats: { goldPct: 0.12, luck: 0.08 } },
      { count: 25, stats: { goldPct: 0.15, critChance: 0.04, luck: 0.10 } },
      { count: 30, stats: { goldPct: 0.10, luck: 0.07 } },
      // capstone: kompletní Bestiář (vč. hlubinných variant až do lvl 4200) →
      // bounded bonus ekonomiky/štěstí (bez dmgPct → bez vlivu na obtížnost).
      { count: 35, stats: { goldPct: 0.12, critChance: 0.03, luck: 0.08 } },
    ],
  },
  arsenal: {
    id: 'arsenal', name: 'Arzenál', emoji: '🗡️', bucket: 'gear',
    desc: 'Každý základ výbavy, který ti padl. Odhalí se získáním z bedny.',
    hint: 'Základy padají z beden (odemkne se po prvním bossovi). Vzácnější základy čekají hluboko v ilvl.',
    milestones: [
      { count: 4,  stats: { punchPct: 0.06 } },
      { count: 9,  stats: { weaponPct: 0.08 } },
      { count: 13, stats: { critMult: 0.12 } },
      { count: 17, stats: { punchPct: 0.10, weaponPct: 0.10 } },
      // capstone: poslední 4 základy jsou sada Drakobijec (jen ze Světového bosse) →
      // kompletní Arzenál odměňuje bounded bonusem (bez dmgPct → bez vlivu na obtížnost).
      { count: 21, stats: { punchPct: 0.15, weaponPct: 0.15, critChance: 0.03 } },
    ],
  },
};

export const ALBUM_PAGES = Object.values(ALBUM);

/* ----------------------------- záznamy (odvozené z herních dat) -----------------------------
   Bestiář: všechny varianty Ekiho (běžné i bossové), v pořadí z VARIANTS.
   Arzenál: každý základ výbavy napříč sloty (key = "slot:baseId" = klíč pro state). */
export const BESTIARY_ENTRIES = Object.entries(VARIANTS).map(([id, v]) => ({
  key: id, name: v.name, tier: v.tier, glow: v.glow, boss: !!v.boss,
  filter: v.filter || null, tint: v.tint || null,
}));

export const ARSENAL_ENTRIES = SLOT_IDS.flatMap((slot) =>
  Object.values(BASE_BY[slot]).map((b) => ({
    key: `${slot}:${b.id}`, slot, slotName: SLOT_BY_ID[slot]?.name || slot,
    name: b.name, emoji: b.emoji, minIlvl: b.minIlvl || 0, set: b.set || null,
  }))
);

const ENTRIES = { bestiary: BESTIARY_ENTRIES, arsenal: ARSENAL_ENTRIES };

export const albumEntries = (pageId) => ENTRIES[pageId] || [];
export const pageTotal = (pageId) => (ENTRIES[pageId] || []).length;

/* Klíč záznamu Arzenálu z kusu výbavy (sdílí formát s ARSENAL_ENTRIES.key). */
export const albumKeyForItem = (item) => `${item.slot}:${item.base}`;

/* ----------------------------- objevenost / počty ----------------------------- */
export function isDiscovered(album, pageId, key) {
  const page = ALBUM[pageId];
  return !!(album && page && album[page.bucket] && album[page.bucket][key]);
}

export function discoveredCount(album, pageId) {
  const page = ALBUM[pageId];
  if (!album || !page) return 0;
  const bucket = album[page.bucket];
  if (!bucket) return 0;
  let n = 0;
  for (const e of ENTRIES[pageId]) if (bucket[e.key]) n++;
  return n;
}

/* Souhrn jedné stránky pro UI: { discovered, total, complete }. */
export function pageProgress(album, pageId) {
  const total = pageTotal(pageId);
  const discovered = discoveredCount(album, pageId);
  return { discovered, total, complete: total > 0 && discovered >= total };
}

/* Milníky stránky s příznakem aktivní (počet objevených dosáhl prahu). */
export function pageMilestones(album, pageId) {
  const n = discoveredCount(album, pageId);
  return (ALBUM[pageId]?.milestones || []).map((m) => ({ ...m, active: n >= m.count }));
}

/* ----------------------------- bonusy ----------------------------- */
const STAT_KEYS = Object.keys(AFFIXES);
const zeroStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

/* Součet bounded-% bonusů ze VŠECH dosažených milníků (napříč stránkami).
   Vrací plnou ZERO mapu (klíče afixů) → čistě se sčítá s equipStats/petStats v
   combatStats. ZÁMĚRNĚ neobsahuje dmgPct → žádný vliv na obtížnost (anti-blitz). */
export function albumStats(s) {
  const out = zeroStats();
  const album = s && s.album;
  if (!album) return out;
  for (const pageId in ALBUM) {
    const n = discoveredCount(album, pageId);
    for (const m of ALBUM[pageId].milestones) {
      if (n < m.count) continue;
      for (const k in m.stats) if (out[k] != null) out[k] += m.stats[k];
    }
  }
  return out;
}

/* Doplň objevené základy z aktuální výbavy + inventáře (staří hráči, kteří kusy
   získali ještě před deníkem → ať nevypadají jako neobjevené). Mutuje album.gear. */
export function backfillGear(album, equipment, inventory) {
  if (!album) return;
  album.gear ||= {};
  const mark = (it) => { if (it && it.slot && it.base) album.gear[albumKeyForItem(it)] = true; };
  if (equipment) for (const slot of SLOT_IDS) mark(equipment[slot]);
  if (Array.isArray(inventory)) for (const it of inventory) mark(it);
}

/* ----------------------------- prezentace ----------------------------- */
/* Štítek bonusu (mapa statů → "+5 % zlata • +5 % štěstí") přes affixLabel výbavy. */
export function albumBonusText(stats) {
  if (!stats) return '';
  return Object.entries(stats)
    .filter(([, v]) => v)
    .map(([stat, value]) => affixLabel({ stat, value }))
    .join(' • ');
}
