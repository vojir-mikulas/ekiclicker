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
import { VARIANTS, variantPool } from './data/variants.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { CAPSTONES } from './data/prestige.js';
import { createState, resetRun } from './initialState.js';
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
} from './formulas.js';
import {
  ITEMS, CHESTS, SLOT_IDS, itemScore,
  salvageValue, rerollCost, rerollItem, upgradeRarityCost, upgradeRarity, nextRarity,
  rollChestResult, buildRouletteStrip, chestMissDust, chestCost, doveExchangeCost,
} from './data/items.js';
import { PETS_CFG, rollPetId, petLevelCap, allPetsMaxed } from './data/pets.js';
import { RUNES_CFG, rollRune, mintRune, socketCount, canFuse } from './data/runes.js';
import { ALBUM, discoveredCount, albumKeyForItem } from './data/album.js';
import { ELIXIRS, elixirCostAt, ELIXIRS_CFG } from './data/elixirs.js';
import {
  ENCHANTS_CFG, canEnchant, rollEnchantOffers, applyOffer, rerollOffersCost,
} from './data/enchants.js';
import { MASTERY, NODE_BY_ID, TREE_BY_NODE, pointsInTree } from './data/mastery.js';

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
  meteredDps() {
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
    return { auto: totalDps(this.state), punch: punchNom / sec, real: allEff / sec };
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
    this.emit('defeat', {
      reward, boss: !!v.boss, mega: !!v.mega, ultra: !!v.ultra, archon: !!v.archon,
      variantId: s.enemy.variantId, loot,
    });
    this.maybeDropChest(v);
    this.maybeDropEgg(v);
    this.maybeDropRune(v);
    // 🔱 mistrovské body — za každou poraženou úroveň NAD prahem mřížky (∝ hloubce běhu).
    // Body přežívají rebirth (jako prestige); utratí se v Mistrovské mřížce.
    if (s.level >= MASTERY.unlockLevel) s.mastery.points += MASTERY.pointsPerLevel;
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
    this.checkRunesUnlock();
    this.checkEnchantingUnlock();
    this.checkMasteryUnlock();
  }

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

  /* Drop BEDNY po zabití — typ a šance dle nepřítele (+ ⚒️ Klenotník na šanci).
     Kus se vyloupne až otevřením bedny (ruleta). Archón dává truhlu zaručeně. */
  maybeDropChest(v) {
    const s = this.state;
    if (!s.inventoryUnlocked) return;
    let tier, chance;
    if (v.archon) { tier = 'archon'; chance = 1; }
    else if (v.ultra || v.mega) { tier = 'golden'; chance = 1; }
    else if (v.boss) { tier = 'golden'; chance = ITEMS.bossDropChance; }
    else { tier = 'wooden'; chance = ITEMS.dropChance + dropChanceBonus(s); }
    if (Math.random() >= chance) return;
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

  /* Drop vejce 🥚 po zabití — šance dle nepřítele (Archón dává zaručeně).
     Mazlíček se vylíhne až otevřením vejce (líhnutí). */
  maybeDropEgg(v) {
    const s = this.state;
    if (!s.petsUnlocked) return;
    if (allPetsMaxed(s.pets)) return; // kolekce kompletní → vejce už nepadají
    let chance;
    if (v.archon) chance = 1;
    else if (v.ultra) chance = PETS_CFG.eggUltraDropChance;
    else if (v.mega) chance = PETS_CFG.eggMegaDropChance;
    else if (v.boss) chance = PETS_CFG.eggBossDropChance;
    else chance = PETS_CFG.eggDropChance;
    if (Math.random() >= chance) return;
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
    let chance;
    if (v.archon) chance = RUNES_CFG.archonDropChance;
    else if (v.ultra || v.mega) chance = RUNES_CFG.megaDropChance;
    else return;
    if (Math.random() >= chance) return;
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

  /* ---------- rebirth ---------- */
  forgivenessGain() {
    return Math.floor(forgivenessGain(this.state.highestLevel) * forgivenessMult(this.state)); // 🕯️ Věčné odpuštění
  }
  rebirth() {
    const s = this.state;
    const gain = this.forgivenessGain();
    if (gain < 1) return false;
    s.prestige.forgiveness += gain;
    s.prestige.rebirths++;
    resetRun(s, 1 + s.prestige.headstart * 3);
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
    this.notify();
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

    // automatické DPS (zbraně + stín pěsti) — spojitě
    const dps = totalDps(s);
    if (dps > 0) this.applyDamage(dps * dt, 'auto');

    // špičkové (skutečné) DPS — pro staty/žebříček
    const real = this.meteredDps().real;
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

    // achievementy (kontroluj ~4×/s, ne každý tick)
    this._achTimer += dt;
    if (this._achTimer >= 0.25) {
      this._achTimer = 0;
      this.checkAchievements();
    }
  }
}
