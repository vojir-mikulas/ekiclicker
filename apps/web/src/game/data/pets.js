/* =========================================================================
   PETS — mazlíčci (pozdní endgame, odemyká se na PETS.unlockLevel).
   ČISTÁ data + losování (žádný stav, žádné DOM) → sdílí engine i simulátor.

   Návrhový princip (drží stejnou anti-runaway filozofii jako items.js):
   - Jeden NASAZENÝ mazlíček přidá JEDEN bounded-% bonus (sdílí klíče afixů s
     výbavou → promítne se do existujících formulek, NIKDY nový exponenciál).
   - Mazlíček PŘEŽÍVÁ rebirth (jako výbava). Jeho dmg% se SNAPSHOTuje do
     obtížnosti při startu běhu (petPower → difficultyScale) → posouvá zeď dál,
     ale blitz zůstává OMEZENÝ (stejný mechanismus jako gearPower).
   - Vejce 🥚 padají z nepřátel (od unlockLevel). Líhnou se „casem" (commit-at-open
     jako bedny): buď NOVÝ mazlíček, nebo +1 ÚROVEŇ u už vlastněného (duplikát →
     síla). Síla roste s úrovní, ale je STROPOVANÁ (max) → bounded, ne runaway.
   ========================================================================= */

import { AFFIXES, affixLabel } from './items.js';

export const PETS_CFG = {
  unlockLevel: 2000,   // nejvyšší dosažená úroveň, od které se mazlíčci odemknou
  // šance na drop vejce podle typu nepřítele (Archón dává vejce zaručeně)
  eggDropChance: 0.004,    // běžný nepřítel
  eggBossDropChance: 0.06, // boss (Golden Eki)
  eggMegaDropChance: 0.5,  // mega / ultra boss
  maxDupeDust: 250,    // útěcha v úlomcích 💠, když padne duplikát už vymaxovaného mazlíčka
};

/* ----------------------------- mazlíčci -----------------------------
   stat = klíč afixu (sdílí s výbavou → affixLabel umí formátovat i bonus).
   base = hodnota bonusu na úrovni 1; per = přírůstek za každou další úroveň;
   max  = strop úrovně (duplikáty nad ním → útěcha v úlomcích); weight = váha dropu
   (čím nižší, tím vzácnější — silnější/univerzálnější mazlíčci jsou vzácnější). */
export const PETS = {
  ohnivak: {
    id: 'ohnivak', emoji: '🐉', name: 'Ohnivák',
    stat: 'dmgPct', base: 0.10, per: 0.04, max: 20, weight: 8,
    desc: 'Dýchá oheň na všechno poškození. Vzácný a univerzální.',
  },
  myval: {
    id: 'myval', emoji: '🦝', name: 'Mýval Lupič',
    stat: 'goldPct', base: 0.12, per: 0.05, max: 20, weight: 18,
    desc: 'Šmejdí v popelnicích a nosí ti drobné navíc.',
  },
  sova: {
    id: 'sova', emoji: '🦉', name: 'Sova Věštkyně',
    stat: 'luck', base: 0.10, per: 0.04, max: 20, weight: 18,
    desc: 'Vidí budoucnost — častěji ti přivolá Lucky Eki.',
  },
  rostak: {
    id: 'rostak', emoji: '🐕', name: 'Rošťák',
    stat: 'critChance', base: 0.03, per: 0.012, max: 20, weight: 16,
    desc: 'Kouše do slabin. Pořádně zvedne šanci na krit.',
  },
  kocour: {
    id: 'kocour', emoji: '🐈‍⬛', name: 'Kocour Rváč',
    stat: 'punchPct', base: 0.12, per: 0.05, max: 20, weight: 16,
    desc: 'Pouliční drsňák — posílí každý tvůj úder.',
  },
  orel: {
    id: 'orel', emoji: '🦅', name: 'Orel Bombarďák',
    stat: 'weaponPct', base: 0.12, per: 0.05, max: 20, weight: 16,
    desc: 'Shazuje shora — posílí poškození zbraní (auto-DPS).',
  },
};

export const PET_IDS = Object.keys(PETS);
export const PET_LIST = PET_IDS.map((id) => PETS[id]);
export const PET_COUNT = PET_IDS.length;

/* ----------------------------- síla / agregace ----------------------------- */
const STAT_KEYS = Object.keys(AFFIXES);
const zeroStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

export const petLevelCap = (id) => PETS[id]?.max || 1;

/* Hodnota bonusu mazlíčka na dané úrovni (stropovaná na max). */
export function petBonus(def, level) {
  if (!def) return 0;
  const L = Math.max(1, Math.min(level || 1, def.max));
  return def.base + (L - 1) * def.per;
}

/* Bonus NASAZENÉHO mazlíčka jako mapa statů (sčítá se k afixům výbavy ve formulkách).
   Vrací vždy plnou ZERO mapu (se statem doplněným) → čisté sčítání s equipStats. */
export function equippedPetStats(s) {
  const out = zeroStats();
  const id = s && s.equippedPet;
  if (!id) return out;
  const owned = s.pets && s.pets[id];
  const def = PETS[id];
  if (!owned || !def) return out;
  out[def.stat] = petBonus(def, owned.level);
  return out;
}

/* Násobič poškození z mazlíčka (1 + dmg%) — SNAPSHOTuje se do obtížnosti při
   startu běhu (vedle gearPower), stejně jako vybavení → anti-blitz zůstává v mezích. */
export function petPower(s) {
  return 1 + equippedPetStats(s).dmgPct;
}

/* ----------------------------- losování ----------------------------- */
/* Z vejce vypadne mazlíček vážený `weight` (vzácní jsou méně pravděpodobní). */
export function rollPetId() {
  let total = 0;
  for (const id of PET_IDS) total += PETS[id].weight;
  let r = Math.random() * total;
  for (const id of PET_IDS) {
    r -= PETS[id].weight;
    if (r <= 0) return id;
  }
  return PET_IDS[0];
}

/* ----------------------------- prezentace ----------------------------- */
export const petName = (id) => PETS[id]?.name || '???';
export const petEmoji = (id) => PETS[id]?.emoji || '🐾';
export const petDesc = (id) => PETS[id]?.desc || '';

/* Štítek bonusu mazlíčka na dané úrovni (přes affixLabel — sdílí formát s výbavou). */
export function petBonusLabel(id, level) {
  const def = PETS[id];
  if (!def) return '';
  return affixLabel({ stat: def.stat, value: petBonus(def, level) });
}
