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
import { save, clearSave } from './persistence.js';
import {
  totalDps, clickDamage, critChance, goldMult,
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
    const enemy = { id: nextEnemyId++, variantId, hp, maxHp: hp, isBoss: !!v.boss, isMega: !!v.mega };
    if (v.boss) {
      enemy.timeLimit = v.mega ? CONFIG.megaBossTime : CONFIG.bossTime;
      enemy.deadline = performance.now() + enemy.timeLimit;
    }
    this.state.enemy = enemy;
    this.emit('spawn', enemy);
  }

  /* ---------- poškození a porážka ---------- */
  applyDamage(amount) {
    const e = this.state.enemy;
    if (!e || amount <= 0) return 0;
    // Žádné přelévání přebytečného poškození na dalšího nepřítele:
    // jeden úder / tick porazí NEJVÝŠE jednoho nepřítele → 1 zabití = 1 úroveň
    // (přebytek se „ztratí“, úrovně už nepřeskakují po 5).
    if (amount >= e.hp) {
      e.hp = 0;
      this.defeat();
      return 1;
    }
    e.hp -= amount;
    return 0;
  }
  defeat() {
    const s = this.state;
    const v = VARIANTS[s.enemy.variantId];
    const reward = enemyReward(s.level, v, goldMult(s));
    s.gold += reward;
    s.stats.totalGold += reward;
    s.stats.kills++;
    if (v.boss) s.stats.bossKills++;
    this.emit('defeat', { reward, boss: !!v.boss, mega: !!v.mega, variantId: s.enemy.variantId });
    s.level++;
    if (s.level > s.highestLevel) s.highestLevel = s.level;
    this.spawnEnemy();
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
    const comboBonus = 1 + Math.min(s.combo.count, CONFIG.comboMax) * CONFIG.comboPerHit;
    const dmg = clickDamage(s) * comboBonus * (isCrit ? CONFIG.critMult : 1);
    this.applyDamage(dmg);
    this.emit('hit', { amount: dmg, kind: isCrit ? 'crit' : 'click', combo: s.combo.count });
    this.notify();
  }

  startFrenzy(now) {
    const s = this.state;
    s.frenzy.active = true;
    s.frenzy.until = now + CONFIG.frenzyDurationMs;
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
    this.spawnEnemy();
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
    if (dps > 0) this.applyDamage(dps * dt);

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
