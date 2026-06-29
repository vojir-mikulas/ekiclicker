/* =========================================================================
   ENGINE — imperativní herní jádro.
   - Drží MĚNITELNÝ stav (mutuje se kvůli výkonu, žádné re-rendery na každý zásah).
   - Pevný krok simulace (CONFIG.tickMs) řízený requestAnimationFrame.
   - Poškození se aplikuje spojitě jako DPS × Δt → projektily jsou jen efekt a
     hra neseká ani při obřím DPS (anti-lag).
   - React čte stav přes subscribe() + selektory (viz hooks/useEngine).
   - Vizuály/achievementy oznamuje sémantickými eventy přes emit() (žádné DOM zde).
   ========================================================================= */
import { CONFIG } from './config.js';
import { WEAPONS } from './data/weapons.js';
import { UPGRADES } from './data/upgrades.js';
import { VARIANTS, variantPool, COMBO_RING } from './data/variants.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { CAPSTONES } from './data/prestige.js';
import { createState, resetRun, createPrestige } from './initialState.js';
import { save, clearSave, hydrateState } from './persistence.js';
import {
  rollDaily, dayStr, prevDayStr, questDef, questDone,
  questGoldReward, streakBonusDoves,
} from './data/quests.js';
import {
  totalDps, clickDamage, critChance, critMult, comboPerHit, frenzyDuration, goldMult,
  enemyMaxHp, enemyReward, prestigeCost, difficultyScale, luckSpawnMult,
  upgradeCostAt, weaponCostAt, buyBatch, forgivenessGain,
  comboCap, forgivenessMult, bossTimeMult, bossGoldMult, dustMult, dropChanceBonus,
  hellFloorHp, clearStatCache,
  stardustGain, ascensionCost, ascensionHeadstart,
} from './formulas.js';
import { ASCENSION, ASCENSION_UPGRADES } from './data/ascension.js';
import {
  HELLEVATOR, HELL_SHOP, hellPerkCost, siraForRun, isHellBossFloor,
  HELL_FORGE, hellForgeCost, HELL_CURSES, hellRunMods,
} from './data/hellevator.js';
import {
  ITEMS, CHESTS, SLOT_IDS, itemScore, upgradeDelta,
  salvageValue, rerollCost, rerollItem, upgradeRarityCost, upgradeRarity, nextRarity,
  rollChestResult, buildRouletteStrip, chestMissDust, chestCost, doveExchangeCost,
} from './data/items.js';
import { PETS, PETS_CFG, rollPetId, petLevelCap, allPetsMaxed, allPetsEvolved, petEvoCost } from './data/pets.js';
import { RUNES_CFG, rollRune, mintRune, socketCount, canFuse, groupRunes, runeDustValue, MAX_TIER } from './data/runes.js';
import { ALBUM, discoveredCount, albumKeyForItem } from './data/album.js';
import { ELIXIRS, elixirCostAt, ELIXIRS_CFG } from './data/elixirs.js';
import {
  ABILITIES, ABILITIES_CFG, abilityCost, abilityCooldown, abilityValue,
  abilityTier, abilityAwakening,
} from './data/abilities.js';
import {
  ENCHANTS_CFG, canEnchant, rollEnchantOffers, applyOffer, rerollOffersCost,
} from './data/enchants.js';
import { MASTERY, NODE_BY_ID, TREE_BY_NODE, pointsInTree, masteryRemaining } from './data/mastery.js';
import { MATEJSKA, pickWheelSegment } from './data/matejska.js';
import { HOSPODA, pourTier, dartsMaxScore } from './data/hospoda.js';
import { GUILDS } from '@ekiclicker/shared';

let nextEnemyId = 1;

export class Engine {
  constructor(initialState) {
    this.state = initialState || createState();
    this.version = 0;
    this._listeners = new Set();
    this._eventSinks = new Set();
    this._raf = 0;
    this._lastFrame = 0;
    this._acc = 0;
    this._uiAcc = 0; // akumulátor pro strop překreslování UI (viz frame())
    this._achTimer = 0;
    this._autosaveTimer = 0;
    this._openSeq = 0; // id přechodné rulety (pendingOpen)
    this._eggSeq = 0;  // id přechodného líhnutí (pendingEgg)
    this._enchantSeq = 0; // revize přechodného zaklínacího stolu (pendingEnchant)
    this._running = false;
    this._dmg = []; // klouzavé okno pro měřené DPS: { t, src, nominal, eff }
    if (!this.state.enemy) this.spawnEnemy();
    this.refreshDaily();
  }

  /* ---------- pub/sub pro React (useSyncExternalStore) ---------- */
  subscribe = (listener) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };
  getVersion = () => this.version;
  notify() {
    clearStatCache(); // gear se mohl změnit → zahoď cache odvozených statů (viz formulas.js)
    this.version++;
    for (const l of this._listeners) l();
  }

  /* ---------- sémantické eventy pro FX / toasty ---------- */
  onEvent(cb) {
    this._eventSinks.add(cb);
    return () => this._eventSinks.delete(cb);
  }
  emit(type, payload) {
    for (const cb of this._eventSinks) cb(type, payload);
  }

  /* ---------- nepřítel ---------- */
  pickVariantId(level) {
    if (level % CONFIG.archonBossEvery === 0) return 'archon';
    if (level % CONFIG.ultraBossEvery === 0) return 'titan';
    if (level % CONFIG.megaBossEvery === 0) return 'king';
    if (level % CONFIG.bossEvery === 0) return 'gold';
    // 🍄 tajný Vyšlehanej Eki — ~1 % nebossových spawnů v hloubce (před fondem,
    // takže ho boss nikdy nepřebije; z fondu je vyřazen přes `trip` flag).
    if (level >= CONFIG.tripMinLevel && Math.random() < CONFIG.tripSpawnChance) return 'tripeki';
    const pool = variantPool(level);
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p.id;
    }
    return 'normal';
  }
  spawnEnemy() {
    const variantId = this.pickVariantId(this.state.level);
    const v = VARIANTS[variantId];
    const hp = enemyMaxHp(this.state.level, v, difficultyScale(this.state));
    const enemy = { id: nextEnemyId++, variantId, hp, maxHp: hp, isBoss: !!v.boss, isMega: !!v.mega, isUltra: !!v.ultra, isArchon: !!v.archon };
    if (v.boss) {
      const base = v.archon ? CONFIG.archonBossTime : v.ultra ? CONFIG.ultraBossTime : v.mega ? CONFIG.megaBossTime : CONFIG.bossTime;
      enemy.timeLimit = Math.round(base * bossTimeMult(this.state)); // 🏹 Lovec bossů přidává čas
      enemy.deadline = performance.now() + enemy.timeLimit;
    }
    this.state.enemy = enemy;
    this.emit('spawn', enemy);
  }

  /* ---------- poškození a porážka ---------- */
  applyDamage(amount, src = 'auto') {
    const e = this.state.enemy;
    if (!e || amount <= 0) return 0;
    // Žádné přelévání přebytečného poškození na dalšího nepřítele:
    // jeden úder / tick porazí NEJVÝŠE jednoho nepřítele → 1 zabití = 1 úroveň
    // (přebytek se „ztratí“, úrovně už nepřeskakují po 5).
    // „eff“ = skutečně ubrané HP (přebytek = overkill se do skutečného DPS nepočítá).
    let eff;
    let killed = 0;
    if (amount >= e.hp) {
      eff = e.hp;
      e.hp = 0;
      this.defeat();
      killed = 1;
    } else {
      eff = amount;
      e.hp -= amount;
    }
    this._recordDmg(src, amount, eff);
    return killed;
  }

  /* Zaznamenej zásah do klouzavého okna pro měřené DPS. */
  _recordDmg(src, nominal, eff) {
    this._dmg.push({ t: performance.now(), src, nominal, eff });
  }

  /* Měřené DPS za posledních CONFIG.dpsWindowMs:
       - auto:  teoretické pasivní DPS (totalDps, bez jitteru),
       - punch: nominální výstup z manuálních úderů (combo/krit/zuřivost jak padly),
       - real:  skutečná průchodnost obou zdrojů (eff — bez overkillu).
     real může být < auto+punch kvůli overkillu / útěku bosse — to je záměr. */
  meteredDps(auto) {
    const now = performance.now();
    const win = CONFIG.dpsWindowMs;
    while (this._dmg.length && now - this._dmg[0].t > win) this._dmg.shift();
    let punchNom = 0;
    let allEff = 0;
    for (const d of this._dmg) {
      allEff += d.eff;
      if (d.src === 'punch') punchNom += d.nominal;
    }
    const sec = win / 1000;
    // `auto` lze předat z volajícího, který už totalDps spočítal (tick) → bez dvojího výpočtu
    return { auto: auto ?? totalDps(this.state), punch: punchNom / sec, real: allEff / sec };
  }
  defeat() {
    const s = this.state;
    const v = VARIANTS[s.enemy.variantId];
    this.discoverEnemy(s.enemy.variantId); // sběratelský deník: Bestiář
    const reward = enemyReward(s.level, v, goldMult(s));
    s.gold += reward;
    s.stats.totalGold += reward;
    s.stats.kills++;
    let loot = null;
    if (v.boss) {
      s.stats.bossKills++;
      if (v.ultra) s.stats.ultraKills++;
      if (v.archon) s.stats.archonKills = (s.stats.archonKills || 0) + 1;
      loot = this.rollBossLoot(v, reward);
      s.gold += loot.gold;
      s.stats.totalGold += loot.gold;
      if (loot.forgiveness) {
        s.prestige.forgiveness += loot.forgiveness;
        s.stats.lootDoves += loot.forgiveness;
      }
    }
    if (v.trip) this.rollTrip(reward); // 🍄 Vyšlehanej Eki → trip (po základní odměně)
    this.emit('defeat', {
      reward, boss: !!v.boss, mega: !!v.mega, ultra: !!v.ultra, archon: !!v.archon,
      variantId: s.enemy.variantId, loot,
    });
    this.maybeDropChest(v);
    this.maybeDropEgg(v);
    this.maybeDropRune(v);
    // 🔱 mistrovské body — za každou poraženou úroveň NAD prahem mřížky (∝ hloubce běhu).
    // Body přežívají rebirth (jako prestige); utratí se v Mistrovské mřížce. Strop:
    // nikdy nepřipíšeme víc, než kolik zbývá v mřížce utratit (masteryRemaining).
    if (s.level >= MASTERY.unlockLevel) {
      const cap = masteryRemaining(s);
      if (s.mastery.points < cap) s.mastery.points = Math.min(cap, s.mastery.points + MASTERY.pointsPerLevel);
    }
    s.level++;
    if (s.level > s.highestLevel) s.highestLevel = s.level;
    this.checkLevelUnlocks();
    this.spawnEnemy();
  }

  /* Pozdní funkce se odemykají po dosažení své NEJVYŠŠÍ úrovně (skutečně
     vystoupanou, ne součet). Příznaky jsou trvalé → jednou odemčeno, zůstává.
     Voláno po každém posunu nejvyšší úrovně. */
  checkLevelUnlocks() {
    this.checkInventoryUnlock();
    this.checkElixirsUnlock();
    this.checkPetsUnlock();
    this.checkPetEvolveUnlock();
    this.checkRunesUnlock();
    this.checkEnchantingUnlock();
    this.checkAbilitiesUnlock();
    this.checkMasteryUnlock();
    this.checkAscensionUnlock();
    this.checkGuildUnlock();
  }

  /* Vzestup 🌌 se odemkne po dosažení ASCENSION.unlockLevel (nejvyšší úroveň).
     Trvalý příznak — stejně jako ostatní pozdní funkce (přežívá rebirth i vzestup). */
  checkAscensionUnlock() {
    const s = this.state;
    if (!s.ascensionUnlocked && s.highestLevel >= ASCENSION.unlockLevel) {
      s.ascensionUnlocked = true;
      this.emit('unlock', { feature: 'ascension' });
    }
  }

  /* Cech 🛡️ se odemkne po DOSAŽENÍ GUILDS.foundLevel (nejvyšší úroveň). Příznak je
     trvalý jako u ostatních pozdních funkcí → jednou odemčeno, zůstává (přežívá rebirth;
     sezónu nepřežívá — hardReset ho vynuluje). Drží KLIENTSKOU bránu založení (živá
     highestLevel se rebirthem resetuje, proto na ni nelze gateovat) i jednorázový uvítací
     popup. Server gatuje nezávisle atestovanou (monotonní all-time) highestLevel ≥ foundLevel. */
  checkGuildUnlock() {
    const s = this.state;
    if (!s.guildUnlocked && s.highestLevel >= GUILDS.foundLevel) {
      s.guildUnlocked = true;
      this.emit('unlock', { feature: 'guild' });
    }
  }

  /* Pekelný výtah 🛗 je CECHOVNÍ aktivita — přístup gatuje členství v cechu (UI),
     ne level. Žádný samostatný unlock příznak/popup; vstup je z cechovní záložky. */

  /* Mistrovská mřížka 🔱 se odemkne po dosažení MASTERY.unlockLevel (nejvyšší úroveň).
     Trvalý příznak — stejně jako výbava/elixíry/mazlíčci/runy/zaklínání. */
  checkMasteryUnlock() {
    const s = this.state;
    if (!s.masteryUnlocked && s.highestLevel >= MASTERY.unlockLevel) {
      s.masteryUnlocked = true;
      this.emit('unlock', { feature: 'mastery' });
    }
  }

  /* Zaklínání se odemkne po dosažení ENCHANTS_CFG.unlockLevel (nejvyšší úroveň).
     Trvalý příznak — stejně jako výbava/elixíry/mazlíčci/runy. */
  checkEnchantingUnlock() {
    const s = this.state;
    if (!s.enchantingUnlocked && s.highestLevel >= ENCHANTS_CFG.unlockLevel) {
      s.enchantingUnlocked = true;
      this.emit('unlock', { feature: 'enchanting' });
    }
  }

  /* ---------- kořist / vybavení ---------- */
  /* Výbava se odemkne po dosažení ITEMS.unlockLevel (nejvyšší úroveň, ne součet).
     Příznak je trvalý (přežívá rebirth) → pak kořist padá napořád. */
  checkInventoryUnlock() {
    const s = this.state;
    if (!s.inventoryUnlocked && s.highestLevel >= ITEMS.unlockLevel) {
      s.inventoryUnlocked = true;
      this.emit('unlock', { feature: 'inventory' });
    }
  }

  /* Elixíry se odemknou po dosažení ELIXIRS_CFG.unlockLevel (nejvyšší úroveň).
     Trvalý příznak — stejně jako výbava a mazlíčci. */
  checkElixirsUnlock() {
    const s = this.state;
    if (!s.elixirsUnlocked && s.highestLevel >= ELIXIRS_CFG.unlockLevel) {
      s.elixirsUnlocked = true;
      this.emit('unlock', { feature: 'elixirs' });
    }
  }

  /* Bojové rituály 🌀 se odemknou po dosažení ABILITIES_CFG.unlockLevel (nejvyšší
     úroveň). Trvalý příznak — stejně jako výbava/elixíry/mazlíčci/mřížka. */
  checkAbilitiesUnlock() {
    const s = this.state;
    if (!s.abilitiesUnlocked && s.highestLevel >= ABILITIES_CFG.unlockLevel) {
      s.abilitiesUnlocked = true;
      this.emit('unlock', { feature: 'abilities' });
    }
  }

  /* Drop BEDNY po zabití — typ a šance dle nepřítele (+ ⚒️ Klenotník na šanci).
     Kus se vyloupne až otevřením bedny (ruleta). Archón dává truhlu zaručeně. */
  maybeDropChest(v) {
    const s = this.state;
    if (!s.inventoryUnlocked) return;
    let tier, chance, capped = true; // capped = počítá se do stropu beden za běh
    if (v.archon) { tier = 'archon'; chance = 1; capped = false; } // milník: zaručená speciální truhla, MIMO strop
    else if (v.ultra) { tier = 'golden'; chance = ITEMS.ultraDropChance; }
    else if (v.mega) { tier = 'golden'; chance = ITEMS.megaDropChance; }
    else if (v.boss) { tier = 'golden'; chance = ITEMS.bossDropChance; }
    else { tier = 'wooden'; chance = ITEMS.dropChance + dropChanceBonus(s); }
    if (capped && (s.itemsThisRun || 0) >= ITEMS.maxChestsPerRun) return; // strop náhodné kořisti za běh
    if (Math.random() >= chance) return;
    if (capped) s.itemsThisRun = (s.itemsThisRun || 0) + 1;
    this.grantChest(tier);
  }
  grantChest(tier) {
    const s = this.state;
    s.chests[tier] = (s.chests[tier] || 0) + 1;
    s.stats.chestsFound = (s.stats.chestsFound || 0) + 1;
    this.emit('chest', { tier });
  }

  /* Rozlož kus na úlomky 💠 (× ⚒️ Klenotník). Volá se při zahození i přetečení
     inventáře → žádná kořist nepřijde nazmar. */
  grantDust(item) {
    const amt = Math.round(salvageValue(item) * dustMult(this.state));
    if (amt > 0) {
      this.state.dust = (this.state.dust || 0) + amt;
      this.emit('salvage', { amount: amt, item });
    }
    return amt;
  }

  /* Přidej kus do inventáře. Při plném inventáři nahraď nejslabší kus, pokud je
     nový lepší — a ten slabší (nebo zahozený nový) rozlož na úlomky. */
  addItem(item) {
    this.discoverGear(item); // sběratelský deník: Arzenál (objev i kus, který se hned rozloží)
    const inv = this.state.inventory;
    if (inv.length < ITEMS.invCap) { inv.push(item); return; }
    let worstI = 0;
    let worst = Infinity;
    for (let i = 0; i < inv.length; i++) {
      const sc = itemScore(inv[i]);
      if (sc < worst) { worst = sc; worstI = i; }
    }
    if (itemScore(item) > worst) { this.grantDust(inv[worstI]); inv[worstI] = item; }
    else this.grantDust(item);
  }

  /* Nasaď kus z inventáře do jeho slotu (případný předchozí se vrátí do inventáře).
     NEMĚNÍ runGearPower — kusy nalezené v běhu jsou čistý zisk (snapshot až rebirth). */
  equipItem(itemId) {
    const s = this.state;
    const idx = s.inventory.findIndex((it) => it.id === itemId);
    if (idx === -1) return;
    const item = s.inventory[idx];
    s.inventory.splice(idx, 1);
    const prev = s.equipment[item.slot];
    s.equipment[item.slot] = item;
    if (prev) s.inventory.push(prev);
    this.afterInventory();
  }

  /* Sundej kus ze slotu zpět do inventáře (když je místo). */
  unequipSlot(slot) {
    const s = this.state;
    const it = s.equipment[slot];
    if (!it || s.inventory.length >= ITEMS.invCap) return;
    s.equipment[slot] = null;
    s.inventory.push(it);
    this.afterInventory();
  }

  /* Zahoď kus z inventáře — rozloží se na úlomky 💠. */
  discardItem(itemId) {
    const s = this.state;
    const idx = s.inventory.findIndex((it) => it.id === itemId);
    if (idx === -1) return;
    this.grantDust(s.inventory[idx]);
    s.inventory.splice(idx, 1);
    this.afterInventory();
  }

  /* Náhled: kolik úlomků 💠 by dalo rozložení celého inventáře (BEZ mutace).
     Sčítá po kusech zaokrouhleně — stejně jako grantDust → souhlasí na 1:1. */
  dismantleAllValue() {
    const mult = dustMult(this.state);
    let amt = 0;
    for (const it of this.state.inventory) amt += Math.round(salvageValue(it) * mult);
    return amt;
  }

  /* Hromadné rozložení: rozloží VŠECHNY kusy v inventáři na úlomky najednou
     (nasazené kusy zůstávají). Jeden souhrnný 'salvage' event místo desítek. */
  dismantleAll() {
    const s = this.state;
    const count = s.inventory.length;
    if (count === 0) return { count: 0, dust: 0 };
    const amt = this.dismantleAllValue();
    s.inventory = [];
    if (amt > 0) {
      s.dust = (s.dust || 0) + amt;
      this.emit('salvage', { amount: amt, bulk: count });
    }
    this.afterInventory();
    return { count, dust: amt };
  }

  /* Kusy v inventáři SLABŠÍ nebo stejně silné jako právě nasazený kus ve stejném
     slotu (itemScore) — „trash", co bys nikdy nenasadil. CHRÁNÍ investici: kus se
     zaklínadlem (zlato) nebo vsazenou runou se NIKDY nepovažuje za trash. Prázdný
     slot → cokoliv je vylepšení → nic se nezahodí. */
  _worseItems() {
    const s = this.state;
    return s.inventory.filter((it) => {
      if (it.enchant?.lvl) return false;            // investice (zlato) — nech být
      if (it.runes?.some(Boolean)) return false;    // investice (runy) — nech být
      return !upgradeDelta(it, s.equipment[it.slot]); // null = není silnější → trash
    });
  }

  /* Náhled hromadného rozkladu „slabších než nasazené" (BEZ mutace). */
  dismantleWorseValue() {
    const mult = dustMult(this.state);
    const items = this._worseItems();
    let dust = 0;
    for (const it of items) dust += Math.round(salvageValue(it) * mult);
    return { count: items.length, dust };
  }

  /* QoL: rozloží všechny kusy slabší/stejné než nasazené (per slot) na úlomky 💠
     najednou. Nechá potenciální vylepšení i investované kusy. Jeden 'salvage'. */
  dismantleWorse() {
    const s = this.state;
    const items = this._worseItems();
    if (items.length === 0) return { count: 0, dust: 0 };
    const ids = new Set(items.map((it) => it.id));
    const mult = dustMult(s);
    let dust = 0;
    for (const it of items) dust += Math.round(salvageValue(it) * mult);
    s.inventory = s.inventory.filter((it) => !ids.has(it.id));
    if (dust > 0) {
      s.dust = (s.dust || 0) + dust;
      this.emit('salvage', { amount: dust, bulk: items.length });
    }
    this.afterInventory();
    return { count: items.length, dust };
  }

  /* ---------- kovárna (úlomky → reroll / povýšení) ---------- */
  /* Najdi kus podle id v inventáři NEBO nasazený (kovat lze obojí). */
  findItem(id) {
    const s = this.state;
    const i = s.inventory.findIndex((it) => it.id === id);
    if (i !== -1) return { loc: 'inv', index: i, item: s.inventory[i] };
    for (const slot of SLOT_IDS) if (s.equipment[slot]?.id === id) return { loc: 'equip', slot, item: s.equipment[slot] };
    return null;
  }
  replaceItem(ref, item) {
    if (ref.loc === 'inv') this.state.inventory[ref.index] = item;
    else this.state.equipment[ref.slot] = item;
  }

  /* Přeroluj afixy kusu za úlomky (drží slot/base/vzácnost/ilvl). */
  forgeReroll(id) {
    const ref = this.findItem(id);
    if (!ref) return;
    const cost = rerollCost(ref.item);
    if ((this.state.dust || 0) < cost) return;
    this.state.dust -= cost;
    this.replaceItem(ref, rerollItem(ref.item));
    this.emit('forge', { kind: 'reroll' });
    this.afterInventory();
  }

  /* Povyš vzácnost kusu o tier za úlomky. */
  forgeUpgrade(id) {
    const ref = this.findItem(id);
    if (!ref || !nextRarity(ref.item.rarity)) return;
    const cost = upgradeRarityCost(ref.item);
    if (!isFinite(cost) || (this.state.dust || 0) < cost) return;
    this.state.dust -= cost;
    this.replaceItem(ref, upgradeRarity(ref.item));
    this.emit('forge', { kind: 'upgrade' });
    this.afterInventory();
  }

  afterInventory() {
    save(this.state);
    this.notify();
  }

  /* ---------- zaklínací stůl (zlato → bounded-% bonusy na kusu) ----------
     Pozdní ZLATÝ sink (odemyká se na ENCHANTS_CFG.unlockLevel). Stůl ukáže
     ENCHANTS_CFG.offers nabídek (runové názvy + odhalený stat) → výběr zaplatí
     ZLATEM a přidá kusu zaklínadlo (bounded %, sčítá se k afixům, max-počet
     stropovaný). pendingEnchant je PŘECHODNÝ vizuál stolu (neukládá se — výsledek
     každého zaklití je už zaúčtovaný v kusu). `rev` se zvyšuje při každé změně
     nabídek → UI ví, že má překreslit. */
  openEnchant(itemId) {
    const s = this.state;
    if (!s.enchantingUnlocked) return;
    const ref = this.findItem(itemId);
    if (!ref || !canEnchant(ref.item)) return;
    s.pendingEnchant = { rev: ++this._enchantSeq, itemId, offers: rollEnchantOffers(ref.item) };
    this.notify();
  }

  /* Přerol nabídek stolu za zlato (gamble o lepší runy; neaplikuje nic). */
  enchantReroll() {
    const s = this.state;
    const pe = s.pendingEnchant;
    if (!pe) return;
    const ref = this.findItem(pe.itemId);
    if (!ref || !canEnchant(ref.item)) return;
    const cost = rerollOffersCost(ref.item);
    if ((s.gold || 0) < cost) return;
    s.gold -= cost;
    pe.rev = ++this._enchantSeq;
    pe.offers = rollEnchantOffers(ref.item);
    this.afterInventory();
  }

  /* Zaplať zlato a vsaď vybranou nabídku do kusu. Po zaklití naroluje čerstvé
     nabídky (cena dalšího zaklití roste) — nebo stůl uzavře, když je kus na maxu. */
  enchantApply(offerId) {
    const s = this.state;
    const pe = s.pendingEnchant;
    if (!pe) return;
    const offer = pe.offers.find((o) => o.id === offerId);
    if (!offer) return;
    const ref = this.findItem(pe.itemId);
    if (!ref || !canEnchant(ref.item)) return;
    if ((s.gold || 0) < offer.cost) return;
    s.gold -= offer.cost;
    const next = applyOffer(ref.item, offer);
    this.replaceItem(ref, next);
    pe.rev = ++this._enchantSeq;
    pe.offers = canEnchant(next) ? rollEnchantOffers(next) : [];
    this.emit('enchant', { ench: offer.ench, stat: offer.stat, value: offer.value, maxed: !canEnchant(next) });
    this.afterInventory();
  }

  /* Zavři zaklínací stůl (každé zaklití je dávno zaúčtované v kusu). */
  closeEnchant() {
    if (!this.state.pendingEnchant) return;
    this.state.pendingEnchant = null;
    this.notify();
  }

  /* ---------- směnárna úlomků (💠 → 🕊) ---------- */
  /* Aktuální kurz: kolik úlomků stojí 1 🕊 (roste s nejvyšší úrovní). */
  doveExchangeCost() {
    return doveExchangeCost(this.state.highestLevel);
  }
  /* Směň přebytečné úlomky na 🕊 odpuštění. count = počet 🕊, nebo 'max'.
     Vrací skutečně získané 🕊 (0 = málo úlomků / zamčeno). */
  exchangeDust(count) {
    const s = this.state;
    if (!s.inventoryUnlocked) return 0;
    const cost = this.doveExchangeCost();
    const affordable = Math.floor((s.dust || 0) / cost);
    const n = count === 'max' ? affordable : Math.min(count, affordable);
    if (n <= 0) return 0;
    s.dust -= n * cost;
    s.prestige.forgiveness += n;
    this.emit('exchange', { doves: n, dust: n * cost });
    this.afterInventory();
    return n;
  }

  /* ---------- bedny / rulety ---------- */
  /* Otevři bednu daného typu. KLÍČOVÉ (anti-exploit): výsledek se ZAÚČTUJE HNED —
     bedna se spotřebuje, kus se přidá do inventáře (nebo se připíše útěcha za
     prázdnou) a stav se uloží. Ruleta v UI je jen PŘEHRÁNÍ už rozhodnutého výsledku;
     zavření okna ani reload stránky s ním nehne (pendingOpen se neukládá → po reloadu
     je pryč, ale kus už je v inventáři a bedna spotřebovaná). Jedna animace naráz. */
  openChest(tier) {
    const s = this.state;
    if (s.pendingOpen) return;             // jedna ruleta naráz (anti-spam)
    if ((s.chests[tier] || 0) < 1) return;
    s.chests[tier]--;                      // spotřebuj atomicky
    this._commitOpen(tier);
  }

  /* Kup a otevři „vykovanou" bednu za úlomky 💠 (gamble sink). */
  buyDustChest() {
    const s = this.state;
    if (s.pendingOpen) return;
    const cost = chestCost('dust');
    if ((s.dust || 0) < cost) return;
    s.dust -= cost;
    this._commitOpen('dust');
  }

  /* ilvl kusu z bedny. Běžné bedny = úroveň běhu (kořist roste s tím, jak hluboko
     jsi). Bedny s `ilvlFloor` (Dračí truhla) škálují na NEJVYŠŠÍ dosaženou úroveň
     (ne na aktuální běh) a mají štědrou podlahu → endgame magnituda i pro slabšího
     hráče (catch-up), a zároveň roste s whaly (zůstává viable v endgame). */
  _chestLevel(tier) {
    const s = this.state;
    const floor = CHESTS[tier]?.ilvlFloor || 0;
    const base = floor ? Math.max(s.level, s.highestLevel || 0) : s.level;
    return Math.max(base, floor);
  }

  /* Zaúčtuj výsledek (kus / útěcha) a postav pásek pro ruletu. */
  _commitOpen(tier) {
    const s = this.state;
    const lvl = this._chestLevel(tier);
    const res = rollChestResult(tier, lvl);
    if (res.miss) {
      res.refund = chestMissDust(tier);
      if (res.refund) s.dust = (s.dust || 0) + res.refund;
    } else {
      this.addItem(res.item);
      s.stats.itemsFound = (s.stats.itemsFound || 0) + 1;
    }
    const landingIndex = 48;
    const strip = buildRouletteStrip(tier, lvl, res, landingIndex, 56);
    s.pendingOpen = { id: ++this._openSeq, tier, strip, landingIndex, result: res };
    save(s);  // uloží ZAÚČTOVANÝ výsledek (buildSnapshot pendingOpen vynechává)
    this.notify();
    this.emit('open', { tier, result: res });
  }

  /* Zavři ruletu (po doběhnutí / skipu / zavření okna). Výsledek je dávno zaúčtovaný. */
  dismissOpen() {
    if (!this.state.pendingOpen) return;
    this.state.pendingOpen = null;
    this.notify();
  }

  /* Rychlé otevření VŠECH beden daného typu naráz (bez rulety). Vrátí souhrn pro UI. */
  openAll(tier) {
    const s = this.state;
    const n = s.chests[tier] || 0;
    if (n < 1 || s.pendingOpen) return null;
    s.chests[tier] = 0;
    const lvl = this._chestLevel(tier);
    const rarities = {};
    let misses = 0;
    let dust = 0;
    for (let i = 0; i < n; i++) {
      const res = rollChestResult(tier, lvl);
      if (res.miss) {
        misses++;
        const rf = chestMissDust(tier);
        if (rf) { s.dust = (s.dust || 0) + rf; dust += rf; }
      } else {
        this.addItem(res.item);
        s.stats.itemsFound = (s.stats.itemsFound || 0) + 1;
        rarities[res.item.rarity] = (rarities[res.item.rarity] || 0) + 1;
      }
    }
    save(s);
    this.notify();
    const summary = { tier, count: n, rarities, misses, dust };
    this.emit('openAll', summary);
    return summary;
  }

  /* ---------- mazlíčci (pozdní endgame) ---------- */
  /* Odemkne se po dosažení PETS_CFG.unlockLevel (nejvyšší úroveň). Trvalý příznak
     (přežívá rebirth) — stejně jako odemčení výbavy. */
  checkPetsUnlock() {
    const s = this.state;
    if (!s.petsUnlocked && s.highestLevel >= PETS_CFG.unlockLevel) {
      s.petsUnlocked = true;
      this.emit('unlock', { feature: 'pets' });
    }
  }

  /* Evoluce mazlíčků 🌟 — sub-feature pets. Trvalý příznak (highestLevel se rebirthem
     resetuje, proto na ni nelze gateovat — stejně jako u cechu/výbavy). */
  checkPetEvolveUnlock() {
    const s = this.state;
    if (!s.petEvolveUnlocked && s.highestLevel >= PETS_CFG.evolveUnlockLevel) {
      s.petEvolveUnlocked = true;
      this.emit('unlock', { feature: 'petEvolve' });
    }
  }

  /* Drop vejce 🥚 po zabití — šance dle nepřítele (Archón dává zaručeně).
     Mazlíček se vylíhne až otevřením vejce (líhnutí). */
  maybeDropEgg(v) {
    const s = this.state;
    if (!s.petsUnlocked) return;
    // Vejce přestanou padat, až z nich nic víc nezískáš:
    //  - po odemčení evoluce jsou vejce PALIVO evoluce → padají, dokud nejsou všichni
    //    vyevolvovaní (allPetsEvolved); jinak (před evolucí) stačí všichni na max úrovni.
    if (s.petEvolveUnlocked ? allPetsEvolved(s.pets) : allPetsMaxed(s.pets)) return;
    if ((s.eggsThisRun || 0) >= PETS_CFG.maxEggsPerRun) return; // strop vajec za běh
    let chance;
    if (v.archon) chance = PETS_CFG.eggArchonDropChance;
    else if (v.ultra) chance = PETS_CFG.eggUltraDropChance;
    else if (v.mega) chance = PETS_CFG.eggMegaDropChance;
    else if (v.boss) chance = PETS_CFG.eggBossDropChance;
    else chance = PETS_CFG.eggDropChance;
    if (Math.random() >= chance) return;
    s.eggsThisRun = (s.eggsThisRun || 0) + 1;
    this.grantEgg();
  }
  grantEgg() {
    const s = this.state;
    s.eggs = (s.eggs || 0) + 1;
    s.stats.eggsFound = (s.stats.eggsFound || 0) + 1;
    this.emit('egg', {});
  }

  /* Vylíhni jedno vejce. KLÍČOVÉ (anti-exploit, stejně jako bedny): výsledek se
     ZAÚČTUJE HNED — vejce se spotřebuje, mazlíček se přidá/povýší a stav se uloží.
     Reveal v UI je jen PŘEHRÁNÍ; zavření okna ani reload s ním nehne (pendingEgg
     se neukládá → po reloadu je pryč, ale mazlíček už je tvůj a vejce spotřebované). */
  openEgg() {
    const s = this.state;
    if (s.pendingEgg) return;            // jedno líhnutí naráz (anti-spam)
    if ((s.eggs || 0) < 1) return;
    s.eggs--;                            // spotřebuj atomicky
    const res = this._hatchOne();
    s.pendingEgg = { id: ++this._eggSeq, result: res };
    save(s);
    this.notify();
    this.emit('hatch', res);
  }

  /* Zaúčtuj jedno líhnutí (mutuje state.pets) a vrať popis výsledku pro UI.
     Nový mazlíček → level 1 (a auto-nasadí se, když žádný nasazený není);
     duplikát → +1 úroveň; duplikát na maxu → útěcha v úlomcích 💠. */
  _hatchOne() {
    const s = this.state;
    const petId = rollPetId();
    const prev = s.pets[petId];
    const cap = petLevelCap(petId);
    if (!prev) {
      s.pets[petId] = { level: 1 };
      if (!s.equippedPet) s.equippedPet = petId; // první mazlíček se rovnou nasadí
      return { petId, isNew: true, level: 1, dust: 0 };
    }
    if (prev.level >= cap) {
      const d = PETS_CFG.maxDupeDust;
      if (d) s.dust = (s.dust || 0) + d;
      return { petId, isNew: false, level: prev.level, maxed: true, dust: d };
    }
    prev.level += 1;
    return { petId, isNew: false, level: prev.level, dust: 0 };
  }

  /* Rychlé vylíhnutí VŠECH vajec naráz (bez revealu). Vrátí souhrn pro UI. */
  openAllEggs() {
    const s = this.state;
    const n = s.eggs || 0;
    if (n < 1 || s.pendingEgg) return null;
    s.eggs = 0;
    const news = [];     // petId nově získaných
    const levels = {};   // petId -> kolik úrovní přibylo
    let dust = 0;
    for (let i = 0; i < n; i++) {
      const res = this._hatchOne();
      if (res.isNew) news.push(res.petId);
      else if (!res.maxed) levels[res.petId] = (levels[res.petId] || 0) + 1;
      dust += res.dust || 0;
    }
    save(s);
    this.notify();
    const summary = { count: n, news, levels, dust };
    this.emit('hatchAll', summary);
    return summary;
  }

  /* Zavři reveal líhnutí (výsledek je dávno zaúčtovaný). */
  dismissEgg() {
    if (!this.state.pendingEgg) return;
    this.state.pendingEgg = null;
    this.notify();
  }

  /* Nasaď mazlíčka (musíš ho vlastnit). NEMĚNÍ runGearPower — jako u výbavy je
     mazlíček nalezený/posílený v běhu čistý zisk (snapshot do obtížnosti až rebirth). */
  equipPet(petId) {
    const s = this.state;
    if (!s.pets[petId]) return;
    s.equippedPet = petId;
    this.afterInventory();
  }
  unequipPet() {
    this.state.equippedPet = null;
    this.afterInventory();
  }

  /* Evolvuj mazlíčka o jeden ⭐ stupeň. Podmínky: odemčená evoluce, mazlíček VLASTNĚNÝ a
     na MAX ÚROVNI, ještě ne na max evoluci, a dost paliva (vejce 🥚 + úlomky 💠). Spotřebuje
     palivo a zvedne pets[id].evo. Jako equipPet NEMĚNÍ runGearPower — posílení v běhu je čistý
     zisk, dmg% z evoluce se do obtížnosti promítne až snapshotem při příštím rebirth (resetRun).
     Vrací true při úspěchu (UI re-render přes afterInventory → save+notify). */
  evolvePet(petId) {
    const s = this.state;
    if (!s.petEvolveUnlocked) return false;
    const owned = s.pets[petId];
    const def = PETS[petId];
    if (!owned || !def) return false;
    if ((owned.level || 0) < petLevelCap(petId)) return false; // musí být na MAX úrovni
    const evo = owned.evo || 0;
    const cost = petEvoCost(evo);
    if (!cost) return false; // už na max evoluci
    if ((s.eggs || 0) < cost.eggs || (s.dust || 0) < cost.dust) return false;
    s.eggs -= cost.eggs;
    s.dust -= cost.dust;
    owned.evo = evo + 1;
    this.afterInventory(); // save + notify (přepočítá odvozené staty z combatStats)
    this.emit('petEvolve', { petId, evo: owned.evo });
    return true;
  }

  /* ---------- runy & sokety („Pivní tácky", pozdní endgame) ---------- */
  /* Odemkne se po dosažení RUNES_CFG.unlockLevel (nejvyšší úroveň). Trvalý
     příznak (přežívá rebirth) — stejně jako výbava, elixíry a mazlíčci. */
  checkRunesUnlock() {
    const s = this.state;
    if (!s.runesUnlocked && s.highestLevel >= RUNES_CFG.unlockLevel) {
      s.runesUnlocked = true;
      this.emit('unlock', { feature: 'runes' });
    }
  }

  /* Drop runy po zabití — hlavně z Eki Archóna (zaručeně), malá šance z mega/ultra.
     Runa padne rovnou do skladu (žádná ruleta) — socketuje se ručně ve 🔣 Runách. */
  maybeDropRune(v) {
    const s = this.state;
    if (!s.runesUnlocked) return;
    if ((s.runesThisRun || 0) >= RUNES_CFG.maxRunesPerRun) return; // strop run za běh
    let chance;
    if (v.archon) chance = RUNES_CFG.archonDropChance;
    else if (v.ultra || v.mega) chance = RUNES_CFG.megaDropChance;
    else return;
    if (Math.random() >= chance) return;
    s.runesThisRun = (s.runesThisRun || 0) + 1;
    this.grantRune();
  }
  grantRune() {
    const s = this.state;
    const rune = rollRune(s.level);
    if ((s.runes?.length || 0) >= RUNES_CFG.stashCap) {
      // plný sklad → útěcha v úlomcích (žádná runa nepřijde nazmar, jako přetečení inventáře)
      const d = RUNES_CFG.fullDust;
      if (d) s.dust = (s.dust || 0) + d;
      this.emit('rune', { kind: rune.kind, tier: rune.tier, full: true, dust: d });
      return;
    }
    s.runes.push(rune);
    s.stats.runesFound = (s.stats.runesFound || 0) + 1;
    this.emit('rune', { kind: rune.kind, tier: rune.tier });
  }

  /* Vsaď runu ze skladu do soketu kusu (nasazeného i v inventáři). Obsazený soket
     → stávající runa se vrátí do skladu (prohození). NEMĚNÍ runGearPower — runy
     nemají dmgPct, takže obtížnost neovlivní (na rozdíl od výbavy/mazlíčka). */
  socketRune(itemId, socketIdx, runeId) {
    const s = this.state;
    const ref = this.findItem(itemId);
    if (!ref) return;
    const item = ref.item;
    if (socketIdx < 0 || socketIdx >= socketCount(item)) return;
    const ri = s.runes.findIndex((r) => r.id === runeId);
    if (ri === -1) return;
    if (!Array.isArray(item.runes)) item.runes = [];
    const prev = item.runes[socketIdx] || null;
    const [rune] = s.runes.splice(ri, 1);
    item.runes[socketIdx] = rune;
    if (prev) s.runes.push(prev); // prohození drží počet ve skladu → žádný strop problém
    this.emit('socket', { kind: rune.kind });
    this.afterInventory();
  }

  /* Vyndej runu ze soketu zpět do skladu (když je v něm místo). */
  unsocketRune(itemId, socketIdx) {
    const s = this.state;
    if ((s.runes?.length || 0) >= RUNES_CFG.stashCap) return; // plný sklad
    const ref = this.findItem(itemId);
    if (!ref) return;
    const item = ref.item;
    const rune = item.runes && item.runes[socketIdx];
    if (!rune) return;
    item.runes[socketIdx] = null;
    s.runes.push(rune);
    this.afterInventory();
  }

  /* Vykuj náhodnou runu za úlomky 💠 (deep sink). */
  craftRune() {
    const s = this.state;
    if (!s.runesUnlocked) return;
    if ((s.runes?.length || 0) >= RUNES_CFG.stashCap) return;
    const cost = RUNES_CFG.craftCost;
    if ((s.dust || 0) < cost) return;
    s.dust -= cost;
    const rune = rollRune(s.level);
    s.runes.push(rune);
    this.emit('rune', { kind: rune.kind, tier: rune.tier, crafted: true });
    this.afterInventory();
  }

  /* Slij fuseCount stejných run (kind+tier) + úlomky → jedna runa o tier výš. */
  fuseRunes(kind, tier) {
    const s = this.state;
    if (!canFuse(s.runes, kind, tier)) return;
    const cost = RUNES_CFG.fuseCost;
    if ((s.dust || 0) < cost) return;
    let need = RUNES_CFG.fuseCount;
    const keep = [];
    for (const r of s.runes) {
      if (need > 0 && r.kind === kind && r.tier === tier) { need--; continue; }
      keep.push(r);
    }
    if (need > 0) return; // pojistka (canFuse už prošlo)
    s.dust -= cost;
    s.runes = keep;
    s.runes.push(mintRune(kind, tier + 1));
    this.emit('fuse', { kind, tier: tier + 1 });
    this.afterInventory();
  }

  /* Hromadné slévání: opakovaně slij NEJNIŽŠÍ slévatelnou skupinu (kind+tier),
     dokud je dost úlomků a aspoň fuseCount stejných run. Nově slitá runa o tier
     výš může odemknout slévání ještě výš → kaskáduje až k nejvyššímu tieru.
     „Slož všechen přebytek do mála silných run." Jeden souhrnný 'fuse' event. */
  fuseAll() {
    const s = this.state;
    if (!s.runesUnlocked) return { fused: 0 };
    let fused = 0;
    for (;;) {
      if ((s.dust || 0) < RUNES_CFG.fuseCost) break;
      const g = groupRunes(s.runes)
        .filter((x) => x.tier < MAX_TIER && x.count >= RUNES_CFG.fuseCount)
        .sort((a, b) => a.tier - b.tier)[0];
      if (!g) break;
      let need = RUNES_CFG.fuseCount;
      const keep = [];
      for (const r of s.runes) {
        if (need > 0 && r.kind === g.kind && r.tier === g.tier) { need--; continue; }
        keep.push(r);
      }
      s.dust -= RUNES_CFG.fuseCost;
      keep.push(mintRune(g.kind, g.tier + 1));
      s.runes = keep; // počet vždy klesá (−3 +1) → smyčka skončí
      fused++;
    }
    if (fused > 0) {
      this.emit('fuse', { bulk: fused });
      this.afterInventory();
    }
    return { fused };
  }

  /* Rozlož JEDNU runu ze skladu na úlomky 💠 (zničí ji nevratně). Analogie
     discardItem u výbavy — runy nemají dmgPct, takže obtížnost se nehne. */
  dismantleRune(runeId) {
    const s = this.state;
    const idx = (s.runes || []).findIndex((r) => r.id === runeId);
    if (idx === -1) return 0;
    const amt = runeDustValue(s.runes[idx].tier);
    s.runes.splice(idx, 1);
    if (amt > 0) {
      s.dust = (s.dust || 0) + amt;
      this.emit('salvage', { amount: amt, rune: true });
    }
    this.afterInventory();
    return amt;
  }

  /* Náhled: počet + úlomky 💠 za rozložení run daného tieru (tier=null → všech)
     BEZ mutace. Sčítá po kusech zaokrouhleně → souhlasí s dismantleTier 1:1. */
  dismantleRunesValue(tier = null) {
    let count = 0;
    let dust = 0;
    for (const r of this.state.runes || []) {
      if (tier != null && r.tier !== tier) continue;
      count++;
      dust += runeDustValue(r.tier);
    }
    return { count, dust };
  }

  /* Hromadně rozlož všechny runy daného tieru (tier=null → celý sklad) na úlomky
     💠 najednou. Vsazené runy (v soketech) zůstanou. Jeden souhrnný 'salvage'. */
  dismantleTier(tier = null) {
    const s = this.state;
    const keep = [];
    let count = 0;
    let dust = 0;
    for (const r of s.runes || []) {
      if (tier == null || r.tier === tier) { count++; dust += runeDustValue(r.tier); }
      else keep.push(r);
    }
    if (count === 0) return { count: 0, dust: 0 };
    s.runes = keep;
    if (dust > 0) {
      s.dust = (s.dust || 0) + dust;
      this.emit('salvage', { amount: dust, bulk: count, rune: true });
    }
    this.afterInventory();
    return { count, dust };
  }

  /* ---------- sběratelský deník (Bestiář + Arzenál) ---------- */
  /* Objev varianty Ekiho (zabití). No-op, když už je objevená. */
  discoverEnemy(variantId) {
    const a = this.state.album;
    if (!a || !variantId || a.enemies[variantId]) return;
    a.enemies[variantId] = true;
    this._afterDiscover('bestiary');
  }
  /* Objev základu výbavy (kus padl z bedny). No-op, když už je objevený. */
  discoverGear(item) {
    const a = this.state.album;
    if (!a || !item) return;
    const key = albumKeyForItem(item);
    if (a.gear[key]) return;
    a.gear[key] = true;
    this._afterDiscover('arsenal');
  }
  /* Společná dohra objevu: odznak „nové" + toast při překročení milníku bonusu.
     BEZ explicitního save — objev se uloží příštím autosave (jako level/kill). */
  _afterDiscover(pageId) {
    const a = this.state.album;
    a.new = (a.new || 0) + 1;
    const n = discoveredCount(a, pageId);
    const page = ALBUM[pageId];
    const m = page.milestones.find((x) => x.count === n);
    if (m) this.emit('albumMilestone', { page: pageId, name: page.name, emoji: page.emoji, stats: m.stats });
  }
  /* Hráč otevřel deník → vynuluj odznak nových objevů (a ulož). */
  markAlbumSeen() {
    const a = this.state.album;
    if (!a || !a.new) return;
    a.new = 0;
    save(this.state);
    this.notify();
  }

  /* Poklad za bosse — zlato navíc (+ 🕊 z mega/ultra). Vše laditelné v CONFIG. */
  rollBossLoot(v, reward) {
    let mult = CONFIG.bossLootMult;
    let forgiveness = 0;
    if (v.archon) {
      mult = CONFIG.archonBossLootMult;
      forgiveness = CONFIG.archonBossDoves;
    } else if (v.ultra) {
      mult = CONFIG.ultraBossLootMult;
      forgiveness = CONFIG.ultraBossDoves;
    } else if (v.mega) {
      mult = CONFIG.megaBossLootMult;
      if (Math.random() < CONFIG.megaBossDoveChance) forgiveness = 1;
    }
    return { gold: Math.ceil(reward * mult * bossGoldMult(this.state)), forgiveness }; // 🏹 Lovec bossů: víc zlata
  }
  bossEscape() {
    const s = this.state;
    this.emit('bossEscape', { variantId: s.enemy.variantId });
    s.level++;
    if (s.level > s.highestLevel) s.highestLevel = s.level;
    this.checkLevelUnlocks();
    this.spawnEnemy();
  }

  /* ---------- manuální úder (klik hráče) ---------- */
  punch() {
    const s = this.state;
    if (!s.enemy) return;
    const now = performance.now();
    s.combo.count = now - s.combo.lastClickAt < CONFIG.comboWindow ? s.combo.count + 1 : 1;
    s.combo.lastClickAt = now;
    if (s.combo.count > s.stats.maxCombo) s.stats.maxCombo = s.combo.count;
    s.stats.totalClicks++;

    // zuřivost: klikání nabíjí; po naplnění se spustí
    if (!s.frenzy.active) {
      s.frenzy.charge += 1;
      if (s.frenzy.charge >= CONFIG.frenzyClicksToFill) this.startFrenzy(now);
    }

    const isCrit = Math.random() < critChance(s);
    const comboBonus = 1 + Math.min(s.combo.count, comboCap(s)) * comboPerHit(s); // 🔗 Mistr comba zvyšuje strop
    const dmg = clickDamage(s) * comboBonus * (isCrit ? critMult(s) : 1);
    this.applyDamage(dmg, 'punch');
    this.emit('hit', { amount: dmg, kind: isCrit ? 'crit' : 'click', combo: s.combo.count });
    this.notify();
  }

  startFrenzy(now) {
    const s = this.state;
    s.frenzy.active = true;
    s.frenzy.until = now + frenzyDuration(s);
    s.frenzy.charge = 0;
    s.stats.frenzies++;
    this.emit('frenzy', { active: true });
  }

  /* ---------- Vyšlehanej Eki (🍄 trip) ----------
     Zabití tajné varianty → balík BOUNDED odměn navrch základní (zlato/💠/🕊) +
     spuštěná & prodloužená zuřivost (euforie). Vše difficulty-neutral (žádný dmgPct
     → žádný vliv na snapshot obtížnosti = drží anti-blitz filozofii jako Lucky). */
  rollTrip(reward) {
    const s = this.state;
    s.stats.trippedKills = (s.stats.trippedKills || 0) + 1;
    // zlatý balík: ≥ N s aktuálního DPS, nebo násobek vlastní odměny — co je víc
    const gold = Math.max(
      Math.floor(reward * CONFIG.tripGoldRewardMult),
      Math.floor(totalDps(s) * CONFIG.tripGoldDpsSeconds)
    );
    s.gold += gold;
    s.stats.totalGold += gold;
    // 💠 úlomky (škálují s ⚒️ Klenotníkem) + 🕊 Odpuštění (bounded)
    const dust = Math.max(1, Math.round(s.level * CONFIG.tripDustPerLevel * dustMult(s)));
    s.dust = (s.dust || 0) + dust;
    const doves = CONFIG.tripDoves;
    s.prestige.forgiveness += doves;
    s.stats.lootDoves += doves;
    // euforie: spusť zuřivost a o kousek ji prodluž
    this.startFrenzy(performance.now());
    s.frenzy.until += CONFIG.tripFrenzyBonusMs;
    this.emit('trip', { gold, dust, doves });
  }

  /* ---------- Lucky Eki (zlatá sušenka) ---------- */
  maybeSpawnLucky(dt) {
    const s = this.state;
    if (s.lucky) return;
    const chance = CONFIG.luckySpawnChancePerSec * luckSpawnMult(s) * dt;
    if (Math.random() < chance) {
      s.lucky = {
        id: nextEnemyId++,
        until: performance.now() + CONFIG.luckyLifetimeMs,
        x: 12 + Math.random() * 66, // % v rámci arény
        y: 14 + Math.random() * 40,
      };
      this.emit('lucky', { spawn: true });
    }
  }
  catchLucky() {
    const s = this.state;
    if (!s.lucky) return;
    s.lucky = null;
    s.stats.luckyClicks++;
    // odměna: zlato (≈ 60 s aktuálního DPS, min. slušný balík) + spuštění zuřivosti
    const bonus = Math.max(
      enemyReward(s.level, VARIANTS.gold, goldMult(s)) * 5,
      Math.floor(totalDps(s) * 60)
    );
    s.gold += bonus;
    s.stats.totalGold += bonus;
    this.startFrenzy(performance.now());
    this.emit('lucky', { catch: true, bonus });
    this.checkAchievements();
    this.notify();
  }

  /* ---------- Boxovací kruh (⭕ knockout) ----------
     Občas se objeví prázdný prsten (levá/pravá půlka arény). Cvaknutí sejme JEDEN velký
     knockout úder, který škáluje z celého buildu (clickDamage × krit. násobič × mult).
     Žádný buff (zuřivost už dává čtyřlístek/Lucky). Strana spawnu řídí vtipnou hlášku. */
  maybeSpawnComboRing(dt) {
    const s = this.state;
    if (s.comboRing) return;
    const chance = CONFIG.comboRingSpawnChancePerSec * luckSpawnMult(s) * dt; // sdílí škálování štěstí s Lucky
    if (Math.random() < chance) {
      const left = Math.random() < 0.5;
      s.comboRing = {
        id: nextEnemyId++,
        until: performance.now() + CONFIG.comboRingLifetimeMs,
        side: left ? 'left' : 'right',
        // levá / pravá půlka arény (drží odstup od kraje) → řídí hlášku
        x: left ? 10 + Math.random() * 28 : 62 + Math.random() * 28,
        y: 16 + Math.random() * 40,
      };
      this.emit('comboRing', { spawn: true });
    }
  }
  catchComboRing() {
    const s = this.state;
    if (!s.comboRing) return;
    const side = s.comboRing.side || (s.comboRing.x < 50 ? 'left' : 'right');
    s.comboRing = null;
    s.stats.comboRingHits = (s.stats.comboRingHits || 0) + 1;
    // jeden velký KNOCKOUT úder = max(totalDps × N s, clickDamage × krit × floor) — bere
    // VĚTŠÍ z obou zdrojů síly: DPS (zbraňový build) nebo úder×krit (punch build / než máš
    // zbraně). Oboje škáluje z CELÉHO buildu: totalDps i clickDamage čtou combatStats →
    // tj. zbraně, Stín, power/rage/fist, VYBAVENÍ, MAZLÍČEK, runy, mřížka, deník, cech…
    // Floor drží úder smysluplný i čerstvý (totalDps po rebirthu bez zbraní = 0).
    let nuke = 0;
    const e = s.enemy;
    if (e) {
      nuke = Math.max(
        totalDps(s) * CONFIG.comboRingNukeDpsSeconds,
        clickDamage(s) * critMult(s) * CONFIG.comboRingNukePunchFloor
      );
      this.emit('hit', { amount: nuke, kind: 'crit' });
      // KASKÁDA: přebytek prorazí na dalšího Ekiho → silnější build srazí VÍC Ekiů =
      // škálování je vidět (na jednom by ho strop HP schoval). Strop killů = anti-blitz
      // mez. Vše mimo _recordDmg (defeat nezaznamenává dmg) → peakDps-safe jako nuke.
      let remaining = nuke;
      let kills = 0;
      while (s.enemy && kills < CONFIG.comboRingMaxKills && remaining >= s.enemy.hp) {
        remaining -= s.enemy.hp;
        this.defeat(); // zabije aktuálního, naroluje dalšího (+1 level)
        kills++;
      }
      // zbytek, co nestačí na další kill → částečně ubliž aktuálnímu (nezabije ho)
      if (s.enemy && remaining > 0 && remaining < s.enemy.hp) s.enemy.hp -= remaining;
    }
    const pool = COMBO_RING[side];
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    this.emit('comboRing', { catch: true, phrase, side, nuke });
    this.checkAchievements();
    this.notify();
  }

  /* ---------- nákupy ---------- */
  buyUpgrade(key) {
    const s = this.state;
    const u = UPGRADES[key];
    const cap = u.max != null ? u.max - s.upgrades[key] : Infinity;
    const batch = buyBatch(upgradeCostAt(s, key), s.gold, s.buyAmount, cap);
    if (batch.count <= 0 || s.gold < batch.cost) return;
    s.gold -= batch.cost;
    s.upgrades[key] += batch.count;
    this.afterBuy();
  }
  buyWeapon(id) {
    const s = this.state;
    const w = WEAPONS.find((x) => x.id === id);
    if (!w || s.level < w.unlock) return;
    const batch = buyBatch(weaponCostAt(s, w), s.gold, s.buyAmount);
    if (batch.count <= 0 || s.gold < batch.cost) return;
    s.gold -= batch.cost;
    s.weapons[id] += batch.count;
    this.afterBuy();
  }
  buyPrestige(key) {
    const s = this.state;
    const cap = CAPSTONES[key];
    if (cap && (s.prestige[cap.unlock.key] || 0) < cap.unlock.level) return; // capstone ještě zamčený
    const cost = prestigeCost(key, s.prestige[key] || 0);
    if (!isFinite(cost) || s.prestige.forgiveness < cost) return; // chybí 🕊 / vymaxováno
    s.prestige.forgiveness -= cost;
    s.prestige[key] = (s.prestige[key] || 0) + 1;
    this.afterBuy();
  }
  /* Kup 1 level kosmického bonusu vzestupu 🌌 za ✦ Hvězdný prach (nekonečný sink). */
  buyAscension(key) {
    const s = this.state;
    if (!s.ascensionUnlocked || !ASCENSION_UPGRADES[key]) return;
    const lvl = (s.ascension.levels[key] || 0);
    const cost = ascensionCost(key, lvl);
    if (!isFinite(cost) || (s.stardust || 0) < cost) return; // chybí prach
    s.stardust -= cost;
    s.ascension.levels[key] = lvl + 1;
    this.afterBuy();
  }
  /* Kup 1 rank uzlu mistrovské mřížky 🔱. Hradla: odemčená fíčura, řada
     odemčená počtem bodů ve větvi, nepřekročený strop, dost bodů. */
  buyMasteryNode(nodeId) {
    const s = this.state;
    if (!s.masteryUnlocked) return;
    const node = NODE_BY_ID[nodeId];
    const tree = TREE_BY_NODE[nodeId];
    if (!node || !tree) return;
    if (pointsInTree(s, tree.id) < (MASTERY.tierGates[node.tier] || 0)) return; // řada zamčená
    const rank = s.mastery.nodes[nodeId] || 0;
    if (rank >= node.max) return; // vymaxováno
    const cost = node.cost || 1;
    if ((s.mastery.points || 0) < cost) return; // chybí body
    s.mastery.points -= cost;
    s.mastery.nodes[nodeId] = rank + 1;
    this.afterBuy();
  }
  /* Kup elixír na sklad (spotřebka; hromadně dle buyAmount). */
  buyElixir(id) {
    const s = this.state;
    if (!s.elixirsUnlocked || !ELIXIRS[id]) return;
    const batch = buyBatch(elixirCostAt(s, id), s.gold, s.buyAmount);
    if (batch.count <= 0 || s.gold < batch.cost) return;
    s.gold -= batch.cost;
    s.elixirStock[id] = (s.elixirStock[id] || 0) + batch.count;
    this.afterBuy();
  }

  /* Vypij elixír ze skladu → aktivuj buff. Přepíše případný běžící (jeden naráz).
     Expirace je wall-clock (Date.now) → přežije reload se správným zbytkem. */
  drinkElixir(id) {
    const s = this.state;
    const def = ELIXIRS[id];
    if (!def || (s.elixirStock[id] || 0) <= 0) return;
    s.elixirStock[id] -= 1;
    s.elixir.active = id;
    s.elixir.until = Date.now() + def.durationMs;
    this.emit('elixir', { active: id });
    this.afterInventory(); // save + notify
  }

  /* ---------- bojové rituály 🌀 (active abilities) ---------- */
  /* Kup LEVEL rituálu za ZLATO (hromadně dle buyAmount). Level přežívá rebirth
     (trvalý gold-sink jako zaklínání). Překročení prahu probuzení → 'awaken'. */
  levelAbility(id) {
    const s = this.state;
    const def = ABILITIES[id];
    if (!s.abilitiesUnlocked || !def) return;
    const before = s.abilities.levels[id] || 0;
    const cap = def.maxLevel - before;
    const batch = buyBatch((i) => abilityCost(id, before + i), s.gold, s.buyAmount, cap);
    if (batch.count <= 0 || s.gold < batch.cost) return;
    s.gold -= batch.cost;
    const after = before + batch.count;
    s.abilities.levels[id] = after;
    if (abilityTier(id, after) > abilityTier(id, before)) {
      const aw = abilityAwakening(id, after);
      this.emit('awaken', { id, name: aw.name, emoji: aw.emoji, tier: abilityTier(id, after) });
    }
    this.afterBuy();
  }

  /* Sešli rituál (odemčeno + koupený ≥1 + mimo cooldown). Efekt je čistý BURST
     (jako zuřivost/elixír) → mimo difficultyScale, žádný anti-blitz dopad.
       buff   → nastav běžící buff (abilityMods ho čtou; tick ho nech vypršet),
       nuke   → okamžitý zásah = totalDps × N s (BEZ _recordDmg → nenafoukne
                atestovaný peakDps, stejně jako Pekelný výtah),
       frenzy → spusť & prodluž zuřivost. */
  castAbility(id) {
    const s = this.state;
    const def = ABILITIES[id];
    if (!s.abilitiesUnlocked || !def) return;
    const level = s.abilities.levels[id] || 0;
    if (level < 1) return;                                  // nekoupený rituál nejde seslat
    const now = Date.now();
    if ((s.abilities.cooldowns[id] || 0) > now) return;     // ještě se nabíjí
    s.abilities.cooldowns[id] = now + abilityCooldown(id, level);
    // Cooldown žije ve sdíleném s.abilities.cooldowns → JEDEN cooldown napříč hlavní
    // hrou i Pekelným výtahem (cast v jednom „nabíjí" i ten druhý). Pokud běží výtah,
    // burst míří do PATRA (ne do arény), jinak normálně do nepřítele.
    const hell = s.hellRun && s.hellRun.phase === 'running' ? s.hellRun : null;
    if (def.kind === 'buff') {
      s.abilities.active[id] = now + def.durationMs;        // abilityMods ho čtou i v běhu výtahu
    } else if (def.kind === 'nuke') {
      const dmg = totalDps(s) * abilityValue(id, level);
      if (hell) {
        this._hellDamage(dmg);                              // burst do patra (mimo _recordDmg jako klik/auto)
      } else {
        const e = s.enemy;
        if (e && dmg > 0) {
          if (dmg >= e.hp) { e.hp = 0; this.defeat(); } else e.hp -= dmg; // mimo _recordDmg (anti peakDps)
        }
      }
    } else if (def.kind === 'frenzy') {
      const bonus = abilityValue(id, level);                // bonus ms navíc k základu zuřivosti
      if (hell) {
        if (!hell.noFrenzy) {                               // 🤐 kletba ticha umlčí i rituál
          const pnow = performance.now();
          hell.frenzy.until = Math.max(hell.frenzy.until, pnow) + HELLEVATOR.frenzyMs + bonus;
          hell.frenzy.charge = 0;
          hell.frenzy.on = true;
          this.emit('frenzy', { active: true });
        }
      } else {
        this.startFrenzy(performance.now());
        s.frenzy.until += bonus;
      }
    }
    const aw = abilityAwakening(id, level);
    this.emit('ability', { id, name: aw.name, emoji: aw.emoji, kind: def.kind });
    this.afterInventory(); // save + notify
  }

  /* ====================================================================
     PEKELNÝ VÝTAH 🛗 — vlastní mini-engine 60s sprintu (oddělený od arény:
     jiný spawn, vlastní hodiny, žádné bedny/loot z normálních zabití). Sdílí ale
     clickDamage/totalDps/critChance, takže build hráče platí 1:1. Damage běhu
     ZÁMĚRNĚ NEpolitujeme do _recordDmg → nenafoukne atestovaný peakDps (server ho
     ve fázi 4 použije jako strop věrohodnosti pater). Vše deterministické (HP patra
     = funkce poškození/času) → žádná nová cheat plocha.
     ==================================================================== */

  /* Žetony: denní free doplnění + regen 1/passRegenMs (wall-clock). Voláno při
     otevření krámu / startu běhu / nákupu žetonu (NE z tick → tick je čistý). */
  tickHellPasses(now = Date.now()) {
    const h = this.state.hell;
    if (!h) return;
    const today = dayStr();
    if (h.freeDay !== today) {
      h.freeDay = today;
      if (h.passes < HELLEVATOR.passDailyFree) h.passes = HELLEVATOR.passDailyFree;
    }
    if (h.passes < HELLEVATOR.passMax) {
      if (!h.passAt) h.passAt = now + HELLEVATOR.passRegenMs;
      let guard = 0;
      while (h.passes < HELLEVATOR.passMax && now >= h.passAt && guard++ < 1000) {
        h.passes++;
        h.passAt += HELLEVATOR.passRegenMs;
      }
      if (h.passes >= HELLEVATOR.passMax) h.passAt = 0;
    } else {
      h.passAt = 0;
    }
  }

  /* Spotřebuj 1 žeton a spusť PEVNÝ 60s běh (výtah na patře 1). Vrací true při úspěchu. */
  startHellRun() {
    const s = this.state;
    if (s.hellRun && s.hellRun.phase === 'running') return false;
    this.tickHellPasses();
    if (s.hell.passes < 1) return false;
    s.hell.passes -= 1;
    if (!s.hell.passAt && s.hell.passes < HELLEVATOR.passMax) s.hell.passAt = Date.now() + HELLEVATOR.passRegenMs;
    const now = performance.now();
    // 💀 kletby: tvrdší běh (víc HP / míň času / bez zuřivosti / bez zbraní) za víc 🔥.
    const mods = hellRunMods(s.hellCurses);
    s.hellRun = {
      phase: 'running', startedAt: now, endsAt: now + mods.runMs,
      floor: 1, cleared: 0, dealt: 0, clicks: 0,
      hp: 0, maxHp: 0, floorStartedAt: now, isBossFloor: false,
      frenzy: { charge: 0, until: 0, on: false }, summary: null,
      curses: mods.active.slice(), curseHpMult: mods.hpMult, curseMult: mods.mult,
      noFrenzy: mods.noFrenzy, noAuto: mods.noAuto,
    };
    this._hellSpawn(1);
    save(s);
    this.notify();
    this.emit('hellStart', {});
    return true;
  }

  _hellSpawn(floor) {
    const s = this.state;
    const r = s.hellRun;
    if (!r) return;
    r.floor = floor;
    r.maxHp = Math.ceil(hellFloorHp(s, floor) * (r.curseHpMult || 1)); // 🧱 kletba tuhosti = víc HP
    r.hp = r.maxHp;
    r.floorStartedAt = performance.now();
    r.isBossFloor = isHellBossFloor(floor);
    this.emit('hellSpawn', { floor, boss: r.isBossFloor });
  }

  /* Ubrání HP patru; přebytek (overkill) se PŘELÉVÁ na další patro → silný burst
     řetězí zabití (geometrický růst HP řetěz sám utne). maxKillsPerTick = pojistka. */
  _hellDamage(amount) {
    const r = this.state.hellRun;
    if (!r || r.phase !== 'running' || amount <= 0) return;
    let kills = 0;
    while (amount > 0 && kills < HELLEVATOR.maxKillsPerTick) {
      if (amount >= r.hp) {
        amount -= r.hp;
        r.dealt += r.hp;
        r.hp = 0;
        this._hellKill();
        kills++;
      } else {
        r.hp -= amount;
        r.dealt += amount;
        amount = 0;
      }
    }
  }

  _hellKill() {
    const r = this.state.hellRun;
    const killed = r.floor;
    r.cleared = killed;
    // 60 s je PEVNÝCH — žádné prodlužování času. Zabití jen posune o patro níž.
    this.emit('hellKill', { floor: killed, boss: r.isBossFloor });
    this._hellSpawn(killed + 1);
  }

  /* Manuální úder v běhu = TÁŽ síla jako na hlavní obrazovce (clickDamage + krit).
     Nabíjí hell-lokální zuřivost. Emituje 'hit'/'frenzy' jako hlavní hra → sdílený
     FxManager hází úderový projektil a maluje záři (stejný pocit jako hlavní hra). */
  hellPunch() {
    const s = this.state;
    const r = s.hellRun;
    if (!r || r.phase !== 'running') return;
    const now = performance.now();
    if (now >= r.endsAt) { this.finishHellRun(); return; }
    r.clicks++;
    if (!r.noFrenzy && now >= r.frenzy.until) { // 🤐 kletba ticha = zuřivost se nenabíjí
      r.frenzy.charge += 1;
      if (r.frenzy.charge >= HELLEVATOR.frenzyClicksToFill) {
        r.frenzy.charge = 0;
        r.frenzy.until = now + HELLEVATOR.frenzyMs;
        r.frenzy.on = true;
        this.emit('frenzy', { active: true });
      }
    }
    const isCrit = Math.random() < critChance(s);
    const mult = now < r.frenzy.until ? CONFIG.frenzyMult : 1;
    const dmg = clickDamage(s) * (isCrit ? critMult(s) : 1) * mult;
    this._hellDamage(dmg);
    this.emit('hit', { amount: dmg, kind: isCrit ? 'crit' : 'click' });
    this.notify();
  }

  /* Krok běhu — volá ho hlavní tick(). Spojité auto DPS (zbraně) + hodiny + konec. */
  hellTick(dt) {
    const s = this.state;
    const r = s.hellRun;
    if (!r || r.phase !== 'running') return;
    const now = performance.now();
    const auto = r.noAuto ? 0 : totalDps(s); // 🥊 kletba holých pěstí = bez auto-DPS zbraní
    if (auto > 0) {
      const mult = now < r.frenzy.until ? CONFIG.frenzyMult : 1;
      this._hellDamage(auto * dt * mult);
    }
    // konec zuřivosti → zhasni záři (FxManager poslouchá 'frenzy')
    if (r.frenzy.on && now >= r.frenzy.until) {
      r.frenzy.on = false;
      this.emit('frenzy', { active: false });
    }
    if (now >= r.endsAt) this.finishHellRun();
  }

  /* Konec běhu: spočítej skóre, uděl 🔥, zapiš rekord. Výsledky ukáže UI. */
  finishHellRun() {
    const s = this.state;
    const r = s.hellRun;
    if (!r || r.phase !== 'running') return;
    r.phase = 'done';
    if (r.frenzy.on) { r.frenzy.on = false; this.emit('frenzy', { active: false }); }
    // skóre = nejhlubší DOSAŽENÉ patro (= aktuální patro, na kterém doběhl čas) →
    // sedí s velkým počítadlem v běhu, žádný matoucí pokles o 1 na výsledkovce.
    const deepest = r.floor;
    const loot = this.grantHellLoot(deepest);
    r.summary = { deepestFloor: deepest, clicks: r.clicks, ...loot };
    save(s);
    this.notify();
    this.emit('hellEnd', r.summary);
  }

  /* 🔥 Síra za běh: základ (siraForRun, stropovaný) + bonus za nový rekord +
     denní bonus za první běh. Bounded faucet — žádný dmgPct, mimo difficulty. */
  grantHellLoot(deepest) {
    const s = this.state;
    // 💀 kletby násobí JEN základ za patra (challenge reward); rekord/denní bonus jsou
    // ploché lákadlo. Kletby hloubku jen snižují → strop běhu (siraRunCap) škáluje s
    // multiplikátorem, takže výzva má smysl i hluboko, ale zůstává bounded faucet.
    const curseMult = (s.hellRun && s.hellRun.curseMult) || 1;
    const curses = (s.hellRun && s.hellRun.curses) || [];
    const baseRaw = siraForRun(deepest);
    const base = Math.round(baseRaw * curseMult);
    const curseBonus = base - baseRaw;
    const prevBest = s.hell.bestFloor || 0;
    let recordBonus = 0;
    const record = deepest > prevBest;
    if (record) {
      recordBonus = (deepest - prevBest) * HELLEVATOR.siraRecordBonus;
      s.hell.bestFloor = deepest;
    }
    const today = dayStr();
    let dailyBonus = 0;
    if (s.hell.lastRunDay !== today) {
      s.hell.lastRunDay = today;
      dailyBonus = HELLEVATOR.siraDailyFirst;
    }
    const total = base + recordBonus + dailyBonus;
    if (total > 0) s.sira = (s.sira || 0) + total;
    return { sira: total, base: baseRaw, curseBonus, curseMult, curses: curses.slice(), recordBonus, dailyBonus, record, prevBest };
  }

  /* Zavři výsledky běhu (skóre/🔥 jsou dávno zaúčtované) → zpět do lobby.
     Běh, který ještě běží, NEruší (jede dál v tick — jako world boss na pozadí). */
  dismissHellRun() {
    const r = this.state.hellRun;
    if (!r || r.phase !== 'done') return;
    this.state.hellRun = null;
    this.notify();
  }

  /* ---------- Pekelný krám (🔥 sink) ---------- */
  buyHellPerk(id) {
    const s = this.state;
    const def = HELL_SHOP[id];
    if (!def) return;
    const tier = s.hellShop[id] || 0;
    const cost = hellPerkCost(id, tier);
    if (!isFinite(cost) || (s.sira || 0) < cost) return;
    s.sira -= cost;
    s.hellShop[id] = tier + 1;
    this.emit('hellPerk', { id, tier: tier + 1 });
    this.afterBuy();
  }

  /* 🌋 Sírová pec — utop 🔥 do dalšího žárového stupně (cena roste geometricky →
     nekonečný sink; bonus dustFind má měkký strop přes klesající křivku). */
  buyHellForge() {
    const s = this.state;
    if (!s.hellForge) s.hellForge = { tier: 0 };
    const tier = s.hellForge.tier || 0;
    const cost = hellForgeCost(tier);
    if (!isFinite(cost) || (s.sira || 0) < cost) return;
    s.sira -= cost;
    s.hellForge.tier = tier + 1;
    this.emit('hellForge', { tier: tier + 1 });
    this.afterBuy();
  }

  /* 💀 Přepni kletbu (volitelný debuff běhu) — drží se mezi běhy (přežívá rebirth,
     mře sezónou). Aplikuje se až při startHellRun → během běhu se nemění. */
  toggleHellCurse(id) {
    const s = this.state;
    if (!HELL_CURSES[id]) return;
    if (s.hellRun && s.hellRun.phase === 'running') return; // za běhu kletby nepřepínej
    if (!s.hellCurses) s.hellCurses = {};
    s.hellCurses[id] = !s.hellCurses[id];
    this.emit('hellCurse', { id, on: !!s.hellCurses[id] });
    save(s);
    this.notify();
  }

  /* Dokup 1 žeton za 🔥 (do stropu passMax). */
  buyHellPass() {
    const s = this.state;
    this.tickHellPasses();
    if (s.hell.passes >= HELLEVATOR.passMax) return;
    const cost = HELLEVATOR.passBuyCostSira;
    if ((s.sira || 0) < cost) return;
    s.sira -= cost;
    s.hell.passes += 1;
    this.emit('hellPass', { passes: s.hell.passes });
    save(s);
    this.notify();
  }

  /* Směň 🔥 → 💠 (denní strop) → 🔥 má dno hodnoty i po vymaxování perků. */
  exchangeSira(count) {
    const s = this.state;
    const today = dayStr();
    if (!s.hellExch || s.hellExch.day !== today) s.hellExch = { day: today, dust: 0 };
    const capLeft = HELLEVATOR.exchangeDailyCapDust - s.hellExch.dust;
    if (capLeft <= 0) return 0;
    const rate = HELLEVATOR.exchangeRateSira;
    const affordable = Math.floor((s.sira || 0) / rate);
    const n = count === 'max' ? Math.min(affordable, capLeft) : Math.min(count, affordable, capLeft);
    if (n <= 0) return 0;
    s.sira -= n * rate;
    s.dust = (s.dust || 0) + n;
    s.hellExch.dust += n;
    this.emit('hellExchange', { dust: n, sira: n * rate });
    save(s);
    this.notify();
    return n;
  }

  setBuyAmount(amt) {
    this.state.buyAmount = amt;
    this.notify();
  }
  afterBuy() {
    this.checkAchievements();
    save(this.state);
    this.notify();
  }

  /* ---------- achievementy ---------- */
  checkAchievements() {
    const s = this.state;
    const ctx = {
      level: s.level,
      highestLevel: s.highestLevel,
      stats: s.stats,
      weapons: s.weapons,
      upgrades: s.upgrades,
      prestige: s.prestige,
      pets: s.pets,
      weaponDefs: Object.fromEntries(WEAPONS.map((w) => [w.id, w])),
    };
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      if (a.check(ctx)) {
        s.achievements[a.id] = true;
        if (a.reward.forgiveness) s.prestige.forgiveness += a.reward.forgiveness;
        this.emit('achievement', { id: a.id, name: a.name, emoji: a.emoji, reward: a.reward });
      }
    }
  }

  /* ---------- denní úkoly ---------- */
  /* Naroluj nové úkoly, když chybí nebo je dnešek jiný den. Volá se při startu,
     periodicky (autosave) a po obnově účtu. No-op, když jsou úkoly aktuální. */
  refreshDaily() {
    const today = dayStr();
    if (!this.state.daily || this.state.daily.day !== today) {
      this.state.daily = rollDaily(today, this.state);
      save(this.state);
      this.notify();
    }
  }
  /* Vyzvedne odměnu za splněný (a dosud nevyzvednutý) úkol. */
  claimQuest(id) {
    const s = this.state;
    if (!s.daily) return;
    const q = s.daily.quests.find((x) => x.id === id);
    if (!q || q.claimed || !questDone(s, q)) return;
    q.claimed = true;
    const def = questDef(id);
    const gold = questGoldReward(s);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.prestige.forgiveness += def.doves;
    this.emit('questClaim', { id, emoji: def.emoji, gold, doves: def.doves });

    // všechny splněné a vyzvednuté? → posuň streak + bonus (jen jednou za den)
    if (s.daily.lastFullDay !== s.daily.day && s.daily.quests.every((x) => x.claimed)) {
      s.daily.streak = s.daily.lastFullDay === prevDayStr(s.daily.day) ? s.daily.streak + 1 : 1;
      s.daily.lastFullDay = s.daily.day;
      const bonus = streakBonusDoves(s.daily.streak);
      s.prestige.forgiveness += bonus;
      this.emit('questAllDone', { streak: s.daily.streak, bonus });
    }
    this.checkAchievements();
    save(s);
    this.notify();
  }

  /* ========================================================================
     MATĚJSKÁ POUŤ 🎡 — sezónní atrakce (jen téma „matejska"). Dvě hry sdílí
     🎟️ pouťové lístky (regen v čase + denní dorovnání jako žetony výtahu).
     Odměny jsou BOUNDED a difficulty-neutral (zlato = násobek DPS-sekund jako
     Lucky/trip; žádný dmgPct) → nulový dopad na anti-blitz. Brána je klientská
     (seasonTheme.id === 'matejska') — gating řeší UI; engine jen počítá.
     ======================================================================== */

  /* Je pouť právě dostupná? (aktivní téma sezóny = Matějská) */
  fairAvailable() {
    return this.state.seasonTheme?.id === MATEJSKA.themeId;
  }

  /* Dorovnej 🎟️ lístky: denní free + regen v čase (mirror tickHellPasses). */
  tickFairTickets(now = Date.now()) {
    const f = this.state.fair;
    if (!f) return;
    const today = dayStr();
    if (f.freeDay !== today) {
      f.freeDay = today;
      if (f.tickets < MATEJSKA.freeDaily) f.tickets = MATEJSKA.freeDaily;
    }
    if (f.tickets < MATEJSKA.ticketMax) {
      if (!f.ticketAt) f.ticketAt = now + MATEJSKA.ticketRegenMs;
      let guard = 0;
      while (f.tickets < MATEJSKA.ticketMax && now >= f.ticketAt && guard++ < 1000) {
        f.tickets++;
        f.ticketAt += MATEJSKA.ticketRegenMs;
      }
      if (f.tickets >= MATEJSKA.ticketMax) f.ticketAt = 0;
    } else {
      f.ticketAt = 0;
    }
  }

  /* Spotřebuj 1 lístek (rozjede regen, pokud stál na stropu). Vrací true při úspěchu. */
  _spendFairTicket() {
    const f = this.state.fair;
    this.tickFairTickets();
    if (!this.fairAvailable() || f.tickets < 1) return false;
    f.tickets -= 1;
    if (!f.ticketAt && f.tickets < MATEJSKA.ticketMax) f.ticketAt = Date.now() + MATEJSKA.ticketRegenMs;
    return true;
  }

  /* Bounded zlato pro pouť — jako Lucky: max(odměna·k, DPS·sekundy). */
  _fairGold(dpsSeconds, rewardMult) {
    const s = this.state;
    return Math.max(
      Math.floor(enemyReward(s.level, VARIANTS.gold, goldMult(s)) * (rewardMult || 1)),
      Math.floor(totalDps(s) * (dpsSeconds || 0))
    );
  }

  /* 🎡 Zatoč kolem štěstí. Spotřebuje 1 lístek, vybere váženou výseč, PŘIPÍŠE
     bounded odměnu a uloží přechodný výsledek do s.fairWheel (UI na něj dotočí).
     Vrací { index, segment, reward } nebo null (nejde / chybí lístek). */
  spinWheel() {
    const s = this.state;
    if (s.fairWheel && s.fairWheel.phase === 'spinning') return null;
    if (!this._spendFairTicket()) return null;
    const { index, segment } = pickWheelSegment(Math.random());
    const reward = this._grantWheelReward(segment);
    s.stats.fairPlays = (s.stats.fairPlays || 0) + 1;
    s.fairWheel = { phase: 'spinning', index, segId: segment.id, reward, at: Date.now() };
    save(s);
    this.emit('fairSpin', { index, seg: segment.id, reward });
    this.checkAchievements();
    this.notify();
    return { index, segment, reward };
  }

  /* Připíše odměnu jedné výseče kola (bounded, dmgPct-free). */
  _grantWheelReward(seg) {
    const s = this.state;
    const out = { kind: seg.kind, jackpot: !!seg.jackpot };
    if (seg.kind === 'gold') {
      const gold = this._fairGold(seg.dpsSeconds, seg.rewardMult);
      s.gold += gold; s.stats.totalGold += gold; out.gold = gold;
    } else if (seg.kind === 'dust') {
      const dust = Math.max(1, Math.round(s.level * (seg.perLevel || 0) * dustMult(s)));
      s.dust = (s.dust || 0) + dust; out.dust = dust;
    } else if (seg.kind === 'doves') {
      const doves = seg.doves || 1;
      s.prestige.forgiveness += doves; s.stats.lootDoves += doves; out.doves = doves;
    } else if (seg.kind === 'frenzy') {
      this.startFrenzy(performance.now()); out.frenzy = true;
    }
    return out;
  }

  /* UI dotočilo kolo → přepni z 'spinning' na 'done' (zobrazí výsledek). */
  settleWheel() {
    const w = this.state.fairWheel;
    if (w && w.phase === 'spinning') { w.phase = 'done'; this.notify(); }
  }
  dismissWheel() { this.state.fairWheel = null; this.notify(); }

  /* 🦆 Spusť kolo střelnice. Spotřebuje 1 lístek, nastaví přechodný běh
     (UI řídí kachny i klikání; engine jen hlídá dvojí útratu a strop trefů). */
  startDuckRun() {
    const s = this.state;
    if (s.fairRun && s.fairRun.phase === 'running') return false;
    if (!this._spendFairTicket()) return false;
    const now = performance.now();
    s.fairRun = { phase: 'running', startedAt: now, endsAt: now + MATEJSKA.duck.durationMs, hits: 0, summary: null };
    s.stats.fairPlays = (s.stats.fairPlays || 0) + 1;
    save(s);
    this.emit('duckStart', {});
    this.notify();
    return true;
  }

  /* Ukonči střelnici se skóre `rawHits` (UI). Trefy se CLAMPnou na maxHits →
     i podvržený výsledek je shora omezen. Připíše bounded odměnu. */
  finishDuckRun(rawHits = 0) {
    const s = this.state;
    const r = s.fairRun;
    if (!r || r.phase !== 'running') return;
    const d = MATEJSKA.duck;
    const hits = Math.max(0, Math.min(d.maxHits, Math.floor(rawHits) || 0));
    const gold = Math.floor(totalDps(s) * hits * d.goldDpsPerHit);
    const dust = Math.max(0, Math.round((hits * s.level * d.dustPerHit / 100) * dustMult(s)));
    const doves = Math.floor(hits / d.doveEvery);
    if (gold > 0) { s.gold += gold; s.stats.totalGold += gold; }
    if (dust > 0) s.dust = (s.dust || 0) + dust;
    if (doves > 0) { s.prestige.forgiveness += doves; s.stats.lootDoves += doves; }
    r.phase = 'done';
    r.hits = hits;
    r.summary = { hits, gold, dust, doves };
    save(s);
    this.emit('duckDone', r.summary);
    this.checkAchievements();
    this.notify();
  }
  dismissDuckRun() { this.state.fairRun = null; this.notify(); }

  /* ========================================================================
     HOSPODA U EKIHO 🍺 — sezónní atrakce (jen téma „kalba"). Dvě hospodské
     hry sdílí 🍻 rundy (regen v čase + denní dorovnání jako pouťové lístky).
     Odměny jsou BOUNDED a difficulty-neutral (zlato = násobek DPS-sekund jako
     Lucky/pouť; žádný dmgPct) → nulový dopad na anti-blitz. Brána je klientská
     (seasonTheme.id === 'kalba') — gating řeší UI; engine jen počítá a CLAMPuje
     vstupy (pozice čepování 0..1, skóre šipek na strop). Sdílí _fairGold. */
  /* Je hospoda právě otevřená? (aktivní téma sezóny = Kalba) */
  pubAvailable() {
    return this.state.seasonTheme?.id === HOSPODA.themeId;
  }

  /* Dorovnej 🍻 rundy: denní free + regen v čase (mirror tickFairTickets). */
  tickPubTokens(now = Date.now()) {
    const p = this.state.pub;
    if (!p) return;
    const today = dayStr();
    if (p.freeDay !== today) {
      p.freeDay = today;
      if (p.tokens < HOSPODA.freeDaily) p.tokens = HOSPODA.freeDaily;
    }
    if (p.tokens < HOSPODA.tokenMax) {
      if (!p.tokenAt) p.tokenAt = now + HOSPODA.tokenRegenMs;
      let guard = 0;
      while (p.tokens < HOSPODA.tokenMax && now >= p.tokenAt && guard++ < 1000) {
        p.tokens++;
        p.tokenAt += HOSPODA.tokenRegenMs;
      }
      if (p.tokens >= HOSPODA.tokenMax) p.tokenAt = 0;
    } else {
      p.tokenAt = 0;
    }
  }

  /* Spotřebuj 1 rundu (rozjede regen, pokud stála na stropu). Vrací true při úspěchu. */
  _spendPubToken() {
    const p = this.state.pub;
    this.tickPubTokens();
    if (!this.pubAvailable() || p.tokens < 1) return false;
    p.tokens -= 1;
    if (!p.tokenAt && p.tokens < HOSPODA.tokenMax) p.tokenAt = Date.now() + HOSPODA.tokenRegenMs;
    return true;
  }

  /* 🍺 Načepuj pivo. Spotřebuje rundu, z `rawPos` (∈[0,1], kde ukazatel zastavil)
     spočítá pásmo kvality, PŘIPÍŠE bounded odměnu a uloží přechodný výsledek do
     s.pubPour. Vrací výsledek nebo null (nejde / chybí runda). */
  pourBeer(rawPos = 0.5) {
    const s = this.state;
    if (!this._spendPubToken()) return null;
    const { dev, tier } = pourTier(rawPos);
    const out = { tierId: tier.id, label: tier.label, emoji: tier.emoji, dev, jackpot: !!tier.jackpot };
    if (tier.kind === 'gold') {
      const gold = this._fairGold(tier.dpsSeconds, tier.rewardMult);
      s.gold += gold; s.stats.totalGold += gold; out.gold = gold;
      if (tier.dust) {
        const dust = Math.max(1, Math.round(s.level * tier.dust * dustMult(s)));
        s.dust = (s.dust || 0) + dust; out.dust = dust;
      }
      if (tier.dove && Math.random() < HOSPODA.pour.doveChance) {
        s.prestige.forgiveness += 1; s.stats.lootDoves += 1; out.doves = 1;
      }
    }
    s.stats.pubPlays = (s.stats.pubPlays || 0) + 1;
    s.pubPour = { phase: 'done', ...out, at: Date.now() };
    save(s);
    this.emit('pubPour', { tier: tier.id, ...out });
    this.checkAchievements();
    this.notify();
    return out;
  }
  dismissPour() { this.state.pubPour = null; this.notify(); }

  /* 🎯 Spusť kolo šipek. Spotřebuje rundu, nastaví přechodný běh (UI řídí
     zaměřovač i klikání; engine jen hlídá dvojí útratu a strop skóre). */
  startDartsRound() {
    const s = this.state;
    if (s.pubDarts && s.pubDarts.phase === 'running') return false;
    if (!this._spendPubToken()) return false;
    const now = performance.now();
    s.pubDarts = { phase: 'running', startedAt: now, endsAt: now + HOSPODA.darts.durationMs, throws: 0, score: 0, summary: null };
    s.stats.pubPlays = (s.stats.pubPlays || 0) + 1;
    save(s);
    this.emit('dartsStart', {});
    this.notify();
    return true;
  }

  /* Ukonči šipky se skóre `rawScore` (UI). Skóre se CLAMPne na strop →
     i podvržený výsledek je shora omezen. Připíše bounded odměnu. */
  finishDartsRound(rawScore = 0, rawThrows = 0) {
    const s = this.state;
    const r = s.pubDarts;
    if (!r || r.phase !== 'running') return;
    const d = HOSPODA.darts;
    const score = Math.max(0, Math.min(dartsMaxScore(), Math.floor(rawScore) || 0));
    const gold = Math.floor(totalDps(s) * score * d.goldDpsPerScore);
    const dust = Math.max(0, Math.round((score * s.level * d.dustPerScore / 100) * dustMult(s)));
    const doves = Math.floor(score / d.doveEvery);
    if (gold > 0) { s.gold += gold; s.stats.totalGold += gold; }
    if (dust > 0) s.dust = (s.dust || 0) + dust;
    if (doves > 0) { s.prestige.forgiveness += doves; s.stats.lootDoves += doves; }
    r.phase = 'done';
    r.score = score;
    r.summary = { score, throws: Math.max(0, Math.floor(rawThrows) || 0), gold, dust, doves };
    save(s);
    this.emit('dartsDone', r.summary);
    this.checkAchievements();
    this.notify();
  }
  dismissDartsRound() { this.state.pubDarts = null; this.notify(); }

  /* ---------- rebirth ---------- */
  forgivenessGain() {
    return Math.floor(forgivenessGain(this.state.highestLevel) * forgivenessMult(this.state)); // 🕯️ Věčné odpuštění
  }
  /* Startovní úroveň čerstvého běhu = 1 + Náskok (prestige) + 🚀 Věčný náskok (vzestup). */
  startLevel() {
    const s = this.state;
    return 1 + s.prestige.headstart * 3 + ascensionHeadstart(s);
  }
  rebirth() {
    const s = this.state;
    const gain = this.forgivenessGain();
    if (gain < 1) return false;
    s.prestige.forgiveness += gain;
    s.prestige.rebirths++;
    resetRun(s, this.startLevel());
    this.spawnEnemy();
    this.checkAchievements();
    this.emit('rebirth', { rebirths: s.prestige.rebirths, gain });
    save(s);
    this.notify();
    return true;
  }

  /* ---------- vzestup 🌌 (meta-prestige) ---------- */
  ascensionGain() {
    return stardustGain(this.state.highestLevel);
  }
  /* VZESTUP: smete celou věž prestiže (rage/pěst/… i Odpuštění) výměnou za ✦ Hvězdný
     prach ∝ dosažené hloubce. Kosmické bonusy (state.ascension) PŘEŽIJÍ. Pak čerstvý
     běh (startLevel už počítá 🚀 Věčný náskok, prestige.headstart je po resetu 0). */
  ascend() {
    const s = this.state;
    const gain = this.ascensionGain();
    if (gain < 1) return false; // ještě jsi nedošel dost vysoko (< ASCENSION.unlockLevel)
    s.stardust = (s.stardust || 0) + gain;
    s.ascension.ascends = (s.ascension.ascends || 0) + 1;
    s.prestige = createPrestige(); // smaž věž prestiže (rage/fist/…/forgiveness/rebirths)
    resetRun(s, this.startLevel());
    this.spawnEnemy();
    this.checkAchievements();
    save(s);
    this.notify();
    return true;
  }

  /* ---------- reset ---------- */
  hardReset() {
    clearSave();
    const fresh = createState();
    fresh.buyAmount = this.state.buyAmount;
    this.state = fresh;
    this._dmg = [];
    this.spawnEnemy();
    this.refreshDaily();
    this.notify();
  }

  /* Připíše Odpuštění (např. odměna za umístění v sezóně po resetu). */
  grantForgiveness(amount) {
    if (!amount || amount <= 0) return;
    this.state.prestige.forgiveness += amount;
    save(this.state);
    this.notify();
  }

  /* Připíše odměnu za světového bosse (🕊 + 💠 + 🐉 Dračí truhly). Bounded, lokální
     grant — stejně jako sezónní odměna; server jen eviduje, kdo přispěl, a odměnu
     označí za vyzvednutou. Truhly se přičtou rovnou do stavu (jeden souhrnný toast
     místo desítek 'chest' eventů) a otevřou se přes existující ruletu. */
  grantWorldBossReward({ doves = 0, dust = 0, chests = 0 } = {}) {
    const s = this.state;
    if (doves > 0) s.prestige.forgiveness += doves;
    if (dust > 0) s.dust = (s.dust || 0) + dust;
    if (chests > 0) {
      s.chests.boss = (s.chests.boss || 0) + chests;
      s.stats.chestsFound = (s.stats.chestsFound || 0) + chests;
    }
    if (doves > 0 || dust > 0 || chests > 0) {
      save(s);
      this.notify();
      this.emit('worldBossReward', { doves, dust, chests });
    }
  }

  /* Připíše vybraný LUP z arény (přepad / výběr trezoru). Zlato → utratitelné
     (záměrně NE do stats.totalGold, ať nejde nafukovat zlatý žebříček přepady),
     🕊 → odpuštění, 💠 → úlomky. Bounded grant; server už trezor odepsal. */
  grantRaidLoot({ gold = 0, doves = 0, dust = 0 } = {}) {
    const s = this.state;
    if (gold > 0) s.gold += gold;
    if (doves > 0) s.prestige.forgiveness += doves;
    if (dust > 0) s.dust = (s.dust || 0) + dust;
    if (gold > 0 || doves > 0 || dust > 0) {
      save(s);
      this.notify();
      this.emit('raidLoot', { gold, doves, dust });
    }
  }

  /* Zaznamenej VÝHRU přepadu (aréna) pro úspěchy/statistiky. Lup míří do trezoru
     na serveru (do lokálního save až přes grantRaidLoot při výběru) — tady jen
     lokální počítadla + kontrola úspěchů (⚔️ Lupič). */
  recordRaidWin({ gold = 0 } = {}) {
    const s = this.state;
    s.stats.raidWins = (s.stats.raidWins || 0) + 1;
    s.stats.raidPlunder = (s.stats.raidPlunder || 0) + Math.max(0, Math.floor(gold));
    this.checkAchievements();
    save(s);
    this.notify();
  }

  /* Strhni „daň do trezoru" z lokálního save (inverze grantRaidLoot). Server už
     částku přičetl do trezoru a vrátil PŘESNĚ tolik, kolik strhnout — zlato/🕊/💠
     reálně ubude z účtu → tvé peníze jsou v sázce (vyber je v aréně do bezpečí). */
  applyVaultDeposit({ gold = 0, doves = 0, dust = 0 } = {}) {
    const s = this.state;
    if (gold > 0) s.gold = Math.max(0, s.gold - gold);
    if (doves > 0) s.prestige.forgiveness = Math.max(0, s.prestige.forgiveness - doves);
    if (dust > 0) s.dust = Math.max(0, (s.dust || 0) - dust);
    if (gold > 0 || doves > 0 || dust > 0) {
      save(s);
      this.notify();
      this.emit('vaultDeposit', { gold, doves, dust });
    }
  }

  /* Zaplať zakládací poplatek cechu (💠) z lokálního save. Měnový sink jako celá
     ekonomika — server gateuje jen ATESTOVANOU úroveň, ne zůstatek. Vrátí true při
     úspěchu (dost úlomků), jinak false (UI neodešle žádost o založení). */
  payGuildFee(dust = 0) {
    const s = this.state;
    const cost = Math.max(0, Math.floor(dust));
    if ((s.dust || 0) < cost) return false;
    s.dust -= cost;
    save(s);
    this.notify();
    return true;
  }

  /* Přilij ZLATO do cechovní kasy — klientský sink jako zakládací poplatek (server
     kasu připisuje bounded a vidí jen atestovaná data, ne zůstatek zlata). Strhne
     `min(cost, zůstatek)`, ať nikdy nespadneš pod nulu. Vrátí skutečně stržené zlato. */
  payGuildGold(gold = 0) {
    const s = this.state;
    const cost = Math.max(0, Math.min(Math.floor(gold), s.gold || 0));
    if (cost <= 0) return 0;
    s.gold -= cost;
    save(s);
    this.notify();
    return cost;
  }

  /* Nastav perky cechu (server-derived z /api/me/guild). NEUKLÁDÁ se do save ani
     skóre — po reloadu je znovu natáhne GuildProvider. Bounded gold/dust/luck, ŽÁDNÝ
     dmgPct → mimo difficultyScale; promítnou se přes combatStats/dustMult jako
     album/runy. Notifikuj jen při reálné změně (poll běží každou minutu). */
  setGuildPerks(perks) {
    const next = perks && (perks.goldFind || perks.dustFind || perks.luck)
      ? { goldFind: perks.goldFind || 0, dustFind: perks.dustFind || 0, luck: perks.luck || 0 }
      : null;
    const cur = this.state.guildPerks || null;
    const same = (!next && !cur)
      || (!!next && !!cur && next.goldFind === cur.goldFind && next.dustFind === cur.dustFind && next.luck === cur.luck);
    if (same) return;
    this.state.guildPerks = next;
    this.notify();
  }

  /* Aktivní téma sezóny (odvozené z čísla sezóny v /api/me — viz data/seasonThemes.js).
     NEUKLÁDÁ se do save ani skóre; po reloadu ho znovu nastaví AccountProvider.
     Bounded gold/dust/luck/boss/drop/combo, ŽÁDNÝ dmgPct → mimo difficultyScale;
     promítá se přes combatStats/dustMult/… jako perky cechu. Notifikuj jen při změně. */
  setSeasonTheme(theme) {
    const next = theme && theme.id ? { id: theme.id, mods: { ...theme.mods } } : null;
    const cur = this.state.seasonTheme || null;
    if ((cur && cur.id ? cur.id : null) === (next ? next.id : null)) return;
    this.state.seasonTheme = next;
    this.notify();
  }

  /* Nahraj stav ze save blobu (obnova účtu na novém zařízení / po smazání dat).
     Přepíše lokální postup uloženými daty ze serveru. */
  loadSnapshot(blob) {
    if (!blob) return;
    const buyAmount = this.state.buyAmount;
    this.state = hydrateState(blob);
    if (!this.state.buyAmount) this.state.buyAmount = buyAmount;
    this._dmg = [];
    this.spawnEnemy();
    this.refreshDaily();
    save(this.state);
    this.notify();
  }

  /* ---------- offline ---------- */
  creditOffline(o) {
    if (!o) return;
    this.state.gold += o.gold;
    this.state.stats.totalGold += o.gold;
    save(this.state);
    this.notify();
  }

  /* ---------- herní smyčka ---------- */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrame = performance.now();
    const loop = (t) => {
      if (!this._running) return;
      this.frame(t);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }
  /* Dočasné zmrazení simulace (např. během oslavné fanfáry po znovuzrození), aby
     auto-zbraně nezabíjely a nepřebíjely zvuk. resume() restartuje smyčku a díky
     start() se i resetují simulační hodiny → žádný nárazový damage po odmrazení. */
  pause() {
    this.stop();
  }
  resume() {
    this.start();
  }
  frame(t) {
    let elapsed = t - this._lastFrame;
    this._lastFrame = t;
    // ochrana proti skoku (skrytá karta / lag) — žádné nárazové dumpy damage
    if (elapsed > 250) elapsed = 250;
    this._acc += elapsed;
    const step = CONFIG.tickMs;
    let steps = 0;
    while (this._acc >= step && steps < 8) {
      this.tick(step / 1000);
      this._acc -= step;
      steps++;
    }
    if (this._acc > step) this._acc = 0; // zahoď nahromaděný skluz

    // autosave ~ každých 10 s (+ kontrola změny dne pro denní úkoly)
    this._autosaveTimer += elapsed;
    if (this._autosaveTimer >= 10000) {
      this._autosaveTimer = 0;
      this.refreshDaily(); // no-op, pokud je pořád stejný den
      save(this.state);
    }
    // React překresli NEJVÝŠ ~30×/s, ne na každý snímek displeje. Simulace běží dál
    // na pevném tickMs; vizuály (projektily, plovoucí čísla) jedou ve vlastní RAF
    // smyčce FxManageru, takže klikání zůstává okamžité. Diskrétní akce (nákup,
    // otevření okna) volají notify() přímo → ty se projeví hned, mimo tento strop.
    this._uiAcc += elapsed;
    if (this._uiAcc >= CONFIG.uiTickMs) {
      this._uiAcc = 0;
      this.notify();
    }
  }
  tick(dt) {
    const s = this.state;
    s.stats.playTimeMs += dt * 1000;

    // zuřivost
    if (s.frenzy.active && performance.now() >= s.frenzy.until) {
      s.frenzy.active = false;
      this.emit('frenzy', { active: false });
    } else if (!s.frenzy.active && s.frenzy.charge > 0) {
      s.frenzy.charge = Math.max(0, s.frenzy.charge - CONFIG.frenzyDecayPerSec * dt);
    }

    // elixír: vyprší (wall-clock, ať odpočet sedí i po reloadu)
    if (s.elixir.active && Date.now() >= s.elixir.until) {
      s.elixir.active = null;
      this.emit('elixir', { active: null });
    }

    // bojové rituály: vyprší běžící buffy (wall-clock; klíč v active = právě
    // aktivní, abilityMods je čtou). Smaž vypršelé → formulky se vrátí na identitu.
    const ab = s.abilities;
    if (ab && ab.active) {
      const nowA = Date.now();
      for (const id in ab.active) {
        if (nowA >= ab.active[id]) { delete ab.active[id]; this.emit('ability', { id, expired: true }); }
      }
    }

    // Pekelný výtah 🛗 — běh má vlastní hodiny + spawn (oddělený od arény níž)
    if (s.hellRun && s.hellRun.phase === 'running') this.hellTick(dt);

    // automatické DPS (zbraně + stín pěsti) — spojitě
    const dps = totalDps(s);
    if (dps > 0) this.applyDamage(dps * dt, 'auto');

    // špičkové (skutečné) DPS — pro staty/žebříček (totalDps už máme → předej ho)
    const real = this.meteredDps(dps).real;
    if (real > s.stats.peakDps) s.stats.peakDps = real;

    // boss časomíra
    const e = s.enemy;
    if (e && e.deadline) {
      if (performance.now() >= e.deadline) this.bossEscape();
    }

    // Lucky Eki: vyprší / může se objevit
    if (s.lucky && performance.now() >= s.lucky.until) {
      s.lucky = null;
      this.emit('lucky', { expire: true });
    }
    this.maybeSpawnLucky(dt);

    // ⭕ boxovací kruh: vyprší (nestihl jsi cvaknout) / může se objevit
    if (s.comboRing && performance.now() >= s.comboRing.until) {
      s.comboRing = null;
      this.emit('comboRing', { ringExpire: true });
    }
    this.maybeSpawnComboRing(dt);

    // achievementy (kontroluj ~4×/s, ne každý tick)
    this._achTimer += dt;
    if (this._achTimer >= 0.25) {
      this._achTimer = 0;
      this.checkAchievements();
    }
  }
}
