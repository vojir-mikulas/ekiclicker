/* =========================================================================
   ENGINE — imperativní herní jádro.
   - Drží MĚNITELNÝ stav (mutuje se kvůli výkonu, žádné re-rendery na každý zásah).
   - Pevný krok simulace (CONFIG.tickMs) řízený requestAnimationFrame.
   - Poškození se aplikuje spojitě jako DPS × Δt → projektily jsou jen efekt a
     hra neseká ani při obřím DPS (anti-lag).
   - React čte stav přes subscribe() + selektory (viz hooks/useEngine).
   - Vizuály/achievementy oznamuje sémantickými eventy přes emit() (žádné DOM zde).
   ========================================================================= */
import { CONFIG, MULT } from './config.js';
import { WEAPONS } from './data/weapons.js';
import { UPGRADES } from './data/upgrades.js';
import { VARIANTS, variantPool } from './data/variants.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { createState, resetRun } from './initialState.js';
import { save, clearSave, hydrateState } from './persistence.js';
import {
  totalDps, clickDamage, critChance, critMult, comboPerHit, frenzyDuration, goldMult,
  enemyMaxHp, enemyReward, prestigeCost,
  upgradeCostAt, weaponCostAt, buyBatch, forgivenessGain,
} from './formulas.js';

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
    this._running = false;
    this._dmg = []; // klouzavé okno pro měřené DPS: { t, src, nominal, eff }
    if (!this.state.enemy) this.spawnEnemy();
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
    const hp = enemyMaxHp(this.state.level, v);
    const enemy = { id: nextEnemyId++, variantId, hp, maxHp: hp, isBoss: !!v.boss, isMega: !!v.mega, isUltra: !!v.ultra };
    if (v.boss) {
      enemy.timeLimit = v.ultra ? CONFIG.ultraBossTime : v.mega ? CONFIG.megaBossTime : CONFIG.bossTime;
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
    const reward = enemyReward(s.level, v, goldMult(s));
    s.gold += reward;
    s.stats.totalGold += reward;
    s.stats.kills++;
    let loot = null;
    if (v.boss) {
      s.stats.bossKills++;
      if (v.ultra) s.stats.ultraKills++;
      loot = this.rollBossLoot(v, reward);
      s.gold += loot.gold;
      s.stats.totalGold += loot.gold;
      if (loot.forgiveness) {
        s.prestige.forgiveness += loot.forgiveness;
        s.stats.lootDoves += loot.forgiveness;
      }
    }
    this.emit('defeat', {
      reward, boss: !!v.boss, mega: !!v.mega, ultra: !!v.ultra,
      variantId: s.enemy.variantId, loot,
    });
    s.level++;
    if (s.level > s.highestLevel) s.highestLevel = s.level;
    this.spawnEnemy();
  }

  /* Poklad za bosse — zlato navíc (+ 🕊 z mega/ultra). Vše laditelné v CONFIG. */
  rollBossLoot(v, reward) {
    let mult = CONFIG.bossLootMult;
    let forgiveness = 0;
    if (v.ultra) {
      mult = CONFIG.ultraBossLootMult;
      forgiveness = CONFIG.ultraBossDoves;
    } else if (v.mega) {
      mult = CONFIG.megaBossLootMult;
      if (Math.random() < CONFIG.megaBossDoveChance) forgiveness = 1;
    }
    return { gold: Math.ceil(reward * mult), forgiveness };
  }
  bossEscape() {
    const s = this.state;
    this.emit('bossEscape', { variantId: s.enemy.variantId });
    s.level++;
    if (s.level > s.highestLevel) s.highestLevel = s.level;
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
    const comboBonus = 1 + Math.min(s.combo.count, CONFIG.comboMax) * comboPerHit(s);
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
    const chance =
      CONFIG.luckySpawnChancePerSec * (1 + s.prestige.luck * MULT.luckPerLevel) * dt;
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
    const cost = prestigeCost(key, s.prestige[key]);
    if (s.prestige.forgiveness < cost) return;
    s.prestige.forgiveness -= cost;
    s.prestige[key]++;
    this.afterBuy();
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

  /* ---------- rebirth ---------- */
  forgivenessGain() {
    return forgivenessGain(this.state.highestLevel);
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
    this.notify();
  }

  /* Připíše Odpuštění (např. odměna za umístění v sezóně po resetu). */
  grantForgiveness(amount) {
    if (!amount || amount <= 0) return;
    this.state.prestige.forgiveness += amount;
    save(this.state);
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

    // autosave ~ každých 10 s
    this._autosaveTimer += elapsed;
    if (this._autosaveTimer >= 10000) {
      this._autosaveTimer = 0;
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
