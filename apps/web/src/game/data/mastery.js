/* =========================================================================
   MISTROVSKÁ MŘÍŽKA — paragon "rune tree" pozdního endgame (odemyká se na
   MASTERY.unlockLevel). ČISTÁ data + agregace (žádný stav, žádné DOM) →
   sdílí engine i simulátor. Inspirace: staré Masteries z League of Legends —
   tři větve, řady (tiery) se odemykají investicí bodů, na dně klíčový uzel.

   Návrhový princip (drží anti-runaway / anti-blitz filozofii hry — stejně
   jako [[album]] a afixy výbavy):
   - Měna: Mistrovské body 🔱, vydělané ∝ úrovním nad unlockLevel (engine je
     připisuje v defeat()). Přežívají rebirth (jako 🕊), mizí jen s koncem sezóny.
   - Každý uzel přidává jen BOUNDED %, má STROP (max ranků) a navíc je řada
     hradlovaná počtem bodů ve větvi (soft-cap "zadarmo" — jako tiery v LoL).
   - ZÁMĚRNĚ žádné dmgPct → bonus se NEpromítá do snapshotu obtížnosti
     (difficultyScale počítá jen prestige + dmgPct výbavy/mazlíčka). Je to tedy
     "čistý zisk" — žádný nový exponenciál, nulový vliv na blitz/žebříček.
   - Stat klíče sdílí s afixy výbavy (weaponPct, critChance, …) → promítnou se
     přes combatStats VŠUDE, kde výbava; speciální klíče (comboCap, dustPct,
     bossTime, bossGold, dropChance) čtou capstone-helpery ve formulas.js.
   ========================================================================= */

export const MASTERY = {
  unlockLevel: 4000, // od této NEJVYŠŠÍ dosažené úrovně se mřížka odemkne (laditelné; sniž pro testy)
  // 🔱 za každou úroveň zabitou NAD unlockLevel — ZÁMĚRNĚ zlomek: body se sčítají
  // průběžně (i při re-climbu po rebirthu), ale POMALU. 0.002 = 1 bod / 500 úrovní,
  // tj. ~2 body za běh, který vyšplhá k ~5000 (1000 úrovní nad prahem). Paragon grind:
  // celá mřížka (69 bodů) ~ 35 běhů. Body jsou zlomkové ve stavu, v UI se floorují.
  pointsPerLevel: 0.002,
  emoji: '🔱',
  currencyName: 'Mistrovské body',
  // Kolik bodů (ranků) ve VĚTVI je potřeba, aby se odemkla daná řada (tier).
  // Řada 4 = klíčový uzel (keystone), řada 5 = velmistr (grandmaster). Hradlo =
  // "soft-cap zadarmo". Pozn.: max ranků v jedné větvi přes tiery 1–4 je 23
  // (5+5+5+5+3) → hradlo řady 5 musí být < 23, jinak by nešla odemknout. 22 =
  // (skoro) plná investice do větve, než se velmistr otevře.
  tierGates: { 1: 0, 2: 5, 3: 10, 4: 18, 5: 22 },
};

/* Tři větve × řady (tier). Každý uzel: bounded stats za 1 rank, strop `max`,
   1 bod za rank (`cost`). Klíčový uzel (tier 4) má víc statů a nižší strop. */
export const MASTERY_TREES = [
  {
    id: 'fury', name: 'Zuřivost', emoji: '🔥', color: '#ff6b5a',
    desc: 'Ofenziva — krit, DPS zbraní, combo.',
    nodes: [
      { id: 'fury_edge',   tier: 1, name: 'Ostří',         emoji: '🗡️', max: 5, cost: 1, stats: { weaponPct: 0.02 } },
      { id: 'fury_frenzy', tier: 1, name: 'Zběsilost',     emoji: '⚡',  max: 5, cost: 1, stats: { critChance: 0.01 } },
      { id: 'fury_hard',   tier: 2, name: 'Tvrdost',       emoji: '💢', max: 5, cost: 1, stats: { critMult: 0.3 } },
      { id: 'fury_rhythm', tier: 3, name: 'Rytmus',        emoji: '🥁', max: 5, cost: 1, stats: { comboCap: 4 } },
      { id: 'fury_blood',  tier: 4, name: 'Krvežíznivost', emoji: '🩸', max: 3, cost: 1, keystone: true, stats: { weaponPct: 0.06, critChance: 0.02 } },
      { id: 'fury_apex',   tier: 5, name: 'Apoteóza',      emoji: '👹', max: 3, cost: 1, keystone: true, stats: { weaponPct: 0.07, critMult: 0.5, comboCap: 3 } },
    ],
  },
  {
    id: 'bounty', name: 'Hojnost', emoji: '🪙', color: '#ffcf5a',
    desc: 'Ekonomika — zlato, štěstí, úlomky.',
    nodes: [
      { id: 'bounty_greed',  tier: 1, name: 'Lakota',        emoji: '🤑', max: 5, cost: 1, stats: { goldPct: 0.05 } },
      { id: 'bounty_seek',   tier: 1, name: 'Hledač',        emoji: '🔍', max: 5, cost: 1, stats: { luck: 0.05 } },
      { id: 'bounty_smith',  tier: 2, name: 'Kovář',         emoji: '⚒️', max: 5, cost: 1, stats: { dustPct: 0.1 } },
      { id: 'bounty_patron', tier: 3, name: 'Mecenáš',       emoji: '💰', max: 5, cost: 1, stats: { bossGold: 0.08 } },
      { id: 'bounty_rush',   tier: 4, name: 'Zlatá horečka', emoji: '🌟', max: 3, cost: 1, keystone: true, stats: { goldPct: 0.1, dustPct: 0.15 } },
      { id: 'bounty_eldorado', tier: 5, name: 'Eldorádo',  emoji: '🏆', max: 3, cost: 1, keystone: true, stats: { goldPct: 0.12, dustPct: 0.18, bossGold: 0.1 } },
    ],
  },
  {
    id: 'guile', name: 'Důvtip', emoji: '🔮', color: '#7fc8ff',
    desc: 'Utilita — drop, čas na bosse, zuřivost.',
    nodes: [
      { id: 'guile_hunt',   tier: 1, name: 'Lov',          emoji: '🎯', max: 5, cost: 1, stats: { dropChance: 0.003 } },
      { id: 'guile_calm',   tier: 1, name: 'Klid',         emoji: '🧘', max: 5, cost: 1, stats: { frenzyDur: 400 } },
      { id: 'guile_time',   tier: 2, name: 'Trpělivost',   emoji: '⏳', max: 5, cost: 1, stats: { bossTime: 0.08 } },
      { id: 'guile_fore',   tier: 3, name: 'Předvídavost', emoji: '🔭', max: 5, cost: 1, stats: { critChance: 0.01 } },
      { id: 'guile_master', tier: 4, name: 'Mistr lovu',   emoji: '👑', max: 3, cost: 1, keystone: true, stats: { dropChance: 0.004, bossTime: 0.06, luck: 0.05 } },
      { id: 'guile_omni',   tier: 5, name: 'Vševědoucí',   emoji: '🦉', max: 3, cost: 1, keystone: true, stats: { dropChance: 0.005, bossTime: 0.08, frenzyDur: 600 } },
    ],
  },
];

/* Odvozené mapy pro engine/UI (id → uzel, id → větev). */
export const MASTERY_NODES = MASTERY_TREES.flatMap((t) => t.nodes);
export const NODE_BY_ID = Object.fromEntries(MASTERY_NODES.map((n) => [n.id, n]));
export const TREE_BY_NODE = Object.fromEntries(
  MASTERY_TREES.flatMap((t) => t.nodes.map((n) => [n.id, t]))
);

/* Řady (tiery) jedné větve, seřazené — pro mřížku v UI. */
export function treeTiers(tree) {
  const byTier = {};
  for (const n of tree.nodes) (byTier[n.tier] ||= []).push(n);
  return Object.keys(byTier)
    .map(Number)
    .sort((a, b) => a - b)
    .map((tier) => ({ tier, gate: MASTERY.tierGates[tier] || 0, nodes: byTier[tier] }));
}

/* ----------------------------- stav / hradla ----------------------------- */
export const nodeRank = (s, id) => (s && s.mastery && s.mastery.nodes && s.mastery.nodes[id]) || 0;

/* Body (ranky) utracené v dané větvi — hradluje odemčení vyšších řad. */
export function pointsInTree(s, treeId) {
  const tree = MASTERY_TREES.find((t) => t.id === treeId);
  if (!tree) return 0;
  let n = 0;
  for (const node of tree.nodes) n += nodeRank(s, node.id);
  return n;
}

/* Celkem utracené body napříč všemi větvemi (pro přehled v UI). */
export function spentTotal(s) {
  let n = 0;
  for (const node of MASTERY_NODES) n += nodeRank(s, node.id);
  return n;
}

/* Strop bodů: kolik se jich za celou sezónu vůbec dá utratit (Σ max × cost všech
   uzlů). Nad to nemá smysl body sbírat — celá mřížka by stejně byla plná. */
export const MASTERY_MAX_POINTS = MASTERY_NODES.reduce((n, node) => n + node.max * (node.cost || 1), 0);

/* Kolik bodů ještě LZE získat (strop − už utracené). Engine nepřipíše nad tuto
   mez → nikdy nebudeš mít víc bodů, než kolik reálně utratíš. */
export const masteryRemaining = (s) => Math.max(0, MASTERY_MAX_POINTS - spentTotal(s));

export const tierUnlocked = (s, tree, tier) => pointsInTree(s, tree.id) >= (MASTERY.tierGates[tier] || 0);

/* Lze koupit další rank uzlu? (odemčená fíčura + hradlo řady + strop + dost bodů) */
export function canBuyNode(s, node) {
  if (!s || !s.masteryUnlocked) return false;
  const tree = TREE_BY_NODE[node.id];
  if (!tree || !tierUnlocked(s, tree, node.tier)) return false;
  if (nodeRank(s, node.id) >= node.max) return false;
  return (s.mastery.points || 0) >= (node.cost || 1);
}

/* ----------------------------- bonusy ----------------------------- */
/* Stat za daný rank uzlu (per × rank). */
export function nodeStats(node, rank) {
  const out = {};
  if (rank <= 0) return out;
  for (const k in node.stats) out[k] = node.stats[k] * rank;
  return out;
}

/* Součet VŠECH bounded bonusů z mřížky. Vrací mapu stat klíčů; combatStats si
   vezme afixové klíče (weaponPct/critChance/…), capstone-helpery ve formulas
   speciální (comboCap/dustPct/bossTime/bossGold/dropChance). ZÁMĚRNĚ bez dmgPct. */
export function masteryStats(s) {
  const out = {};
  const m = s && s.mastery;
  if (!m || !m.nodes) return out;
  for (const node of MASTERY_NODES) {
    const rank = m.nodes[node.id] || 0;
    if (rank <= 0) continue;
    for (const k in node.stats) out[k] = (out[k] || 0) + node.stats[k] * rank;
  }
  return out;
}

/* ----------------------------- prezentace ----------------------------- */
const cz = (n) => String(n).replace('.', ',');
const STAT_LABEL = {
  weaponPct: (v) => `+${Math.round(v * 100)} % DPS zbraní`,
  punchPct: (v) => `+${Math.round(v * 100)} % úder`,
  critChance: (v) => `+${Math.round(v * 100)} % šance na krit`,
  critMult: (v) => `+${cz(Math.round(v * 100) / 100)} ke krit. násobiči`,
  goldPct: (v) => `+${Math.round(v * 100)} % zlata`,
  luck: (v) => `+${Math.round(v * 100)} % štěstí`,
  frenzyDur: (v) => `+${cz(Math.round(v / 100) / 10)} s zuřivosti`,
  comboCap: (v) => `+${Math.round(v)} ke stropu comba`,
  dustPct: (v) => `+${Math.round(v * 100)} % úlomků`,
  bossGold: (v) => `+${Math.round(v * 100)} % zlata z bossů`,
  bossTime: (v) => `+${Math.round(v * 100)} % času na bosse`,
  dropChance: (v) => `+${cz(Math.round(v * 1000) / 10)} p.b. šance na drop`,
};

/* Mapa statů → "+10 % zlata • +1,5 p.b. drop" (přeskočí nuly a neznámé klíče). */
export function masteryBonusText(stats) {
  if (!stats) return '';
  return Object.entries(stats)
    .filter(([k, v]) => v && STAT_LABEL[k])
    .map(([k, v]) => STAT_LABEL[k](v))
    .join(' • ');
}
