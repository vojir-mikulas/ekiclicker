/* =========================================================================
   FX MANAGER — imperativní vizuální efekty (mimo React).
   Projektily, plovoucí čísla, „POW", mince a otřesy se přidávají přímo do
   document.body. Reaguje na sémantické eventy enginu + sám pouští DEKORATIVNÍ
   projektily zbraní (poškození počítá engine spojitě, tohle je jen efekt).

   VÝKON: všechny DOM prvky se RECYKLUJÍ z object-poolů (DomPool) — žádné
   createElement/remove každý snímek. Při zaplnění stropu se recykluje nejstarší.
   Žádné hromadění, žádný GC tlak, žádný lag.
   ========================================================================= */
import { CONFIG } from '../game/config.js';
import { WEAPONS } from '../game/data/weapons.js';
import { PUNCH_TEXTS } from '../game/data/texts.js';
import { weaponShotDamage, shadowDps } from '../game/formulas.js';
import { equippedWeaponEmoji } from '../game/data/items.js';
import { itemImageUrl } from '../game/data/itemImages.js';
import { fmt } from '../game/format.js';
import { fxRefs } from './fxRefs.js';

/* -------------------------------------------------------------------------
   DomPool — recykluje DOM prvky jedné třídy místo jejich vytváření/mazání.
   • acquire() vrátí volný (nebo nově vytvořený) prvek, vyresetuje inline styly
     a přidělí mu nový `_token` (generaci).
   • release(el, token) vrátí prvek do poolu — JEN když token sedí. Tím zpožděné
     časovače z předchozího použití nemůžou zneviditelně sebrat už recyklovaný
     prvek (chrání před „křížením" animací).
   • při dosažení stropu (cap) se násilně recykluje nejstarší aktivní prvek.
   ------------------------------------------------------------------------- */
class DomPool {
  constructor(className, cap) {
    this.className = className;
    this.cap = cap;
    this.free = [];
    this.active = []; // FIFO — nejstarší na indexu 0
    this.seq = 0;
  }

  acquire() {
    // jsme na stropu → uvolni nejstarší aktivní prvky a recykluj je
    while (this.active.length >= this.cap) this._reclaim(this.active[0]);

    let el = this.free.pop();
    if (!el) {
      el = document.createElement('div');
      document.body.appendChild(el);
    }
    el.className = this.className;
    el.style.cssText = ''; // smaž všechny inline styly z minulého použití
    el.textContent = '';
    el._token = ++this.seq;
    this.active.push(el);
    return el;
  }

  // vrať prvek do poolu (skryj a zařaď mezi volné) — jen pokud token stále platí
  release(el, token) {
    if (el._token !== token) return; // mezitím recyklován jinde
    this._detach(el);
  }

  _reclaim(el) {
    el._token = -1; // zneplatni případné běžící časovače tohoto prvku
    this._detach(el);
  }

  _detach(el) {
    const i = this.active.indexOf(el);
    if (i !== -1) this.active.splice(i, 1);
    el.style.display = 'none';
    this.free.push(el);
  }

  destroy() {
    for (const el of this.active) el.remove();
    for (const el of this.free) el.remove();
    this.active.length = 0;
    this.free.length = 0;
  }
}

export class FxManager {
  constructor(engine) {
    this.engine = engine;
    this._floaters = 0;
    this._floaterReset = 0;
    this._weaponTimers = {};
    for (const w of WEAPONS) this._weaponTimers[w.id] = 0;
    this._shadowTimer = 0; // časovač vizuálu Stínu pěsti (auto-úderů)
    this._tripEl = null; // celoscénový psychedelický overlay (🍄 trip)
    this._tripTimer = 0;

    // object-pooly FX prvků (recyklace místo alokace)
    this._proj = new DomPool('proj', CONFIG.maxProjectiles);
    this._coin = new DomPool('coin', CONFIG.maxCoins);
    this._dmg = new DomPool('dmg', CONFIG.maxFloaters);
    this._pow = new DomPool('pow', CONFIG.maxPows);

    this._off = engine.onEvent((type, payload) => this.onEvent(type, payload));
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    this._off?.();
    cancelAnimationFrame(this._raf);
    this._proj.destroy();
    this._coin.destroy();
    this._dmg.destroy();
    this._pow.destroy();
    clearTimeout(this._tripTimer);
    this._tripEl?.remove();
    this._tripEl = null;
  }

  /* --- pomocné --- */
  enemyCenter() {
    const el = fxRefs.photoWrap;
    if (!el) return { x: window.innerWidth / 2, y: 240, ok: false };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ok: true };
  }
  canFloat() {
    const now = performance.now();
    if (now - this._floaterReset > 1000) {
      this._floaterReset = now;
      this._floaters = 0;
    }
    if (this._floaters >= CONFIG.maxFloatersPerSec) return false;
    this._floaters++;
    return true;
  }

  /* --- reakce na eventy enginu --- */
  onEvent(type, payload) {
    // Během pekelného běhu (fullscreen) jede hlavní hra na pozadí — její
    // 'defeat'/'lucky'/'bossEscape' reakce by smetly fotku pekelného nepřítele.
    // Pusť jen úder/zuřivost (ty pekelný běh emituje sám); projektily zbraní
    // řeší dekorativní _loop zvlášť (pálí na fxRefs.photoWrap = pekelný nepřítel).
    if (this.engine.state.hellRun?.phase === 'running' && type !== 'hit' && type !== 'frenzy') return;
    switch (type) {
      case 'hit':
        this.punchProjectile(payload);
        break;
      case 'defeat':
        this.onDefeat(payload);
        break;
      case 'bossEscape': {
        const c = this.enemyCenter();
        this.floatText('Eki utekl! 💨', '#ff6b6b', c.x, c.y - 50);
        break;
      }
      case 'frenzy':
        if (payload.active) {
          const c = this.enemyCenter();
          this.floatText('ZUŘIVOST! 😡', '#ff8a2b', c.x, c.y - 70);
          fxRefs.arena?.classList.add('frenzy');
        } else {
          fxRefs.arena?.classList.remove('frenzy');
        }
        break;
      case 'lucky':
        if (payload.catch) {
          const c = this.enemyCenter();
          this.floatText('+' + fmt(payload.bonus) + ' 🪙', 'var(--good)', c.x, c.y - 40);
          this.coinBurst(c.x, c.y, 18);
        }
        break;
      case 'comboRing':
        if (payload.catch) {
          const c = this.enemyCenter();
          // velká vtipná červená hláška podle strany (levej/pravej hák…) + náraz
          this.floatPunch(payload.phrase, c.x + (payload.side === 'left' ? -40 : 40), c.y - 30);
          this.screenShake();
          this.coinBurst(c.x, c.y, 6);
        }
        break;
      case 'trip':
        this.onTrip(payload);
        break;
      default:
        break;
    }
  }

  /* 🍄 Vyšlehanej Eki poražen → celá scéna jde na „trip" + balík kořisti. */
  onTrip({ gold, dust, doves }) {
    const c = this.enemyCenter();
    this.floatText('🍄 TRIP! +' + fmt(gold) + ' 🪙', '#ff5ed0', c.x, c.y - 44);
    if (dust) this.floatText('💠 +' + fmt(dust), '#8be9ff', c.x - 54, c.y - 74);
    if (doves) this.floatText('🕊 +' + doves, 'var(--dove)', c.x + 54, c.y - 96);
    this.coinBurst(c.x, c.y, 34);
    this.tripScreen();
  }

  /* Psychedelický overlay přes celou obrazovku po CONFIG.tripScreenMs. */
  tripScreen() {
    let el = this._tripEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'trip-overlay';
      document.body.appendChild(el);
      this._tripEl = el;
    }
    el.style.setProperty('--trip-ms', CONFIG.tripScreenMs + 'ms');
    el.classList.remove('on');
    void el.offsetWidth; // reflow → restart animace i při řetězení tripů
    el.classList.add('on');
    clearTimeout(this._tripTimer);
    this._tripTimer = setTimeout(() => el.classList.remove('on'), CONFIG.tripScreenMs);
  }

  onDefeat({ reward, boss, mega, ultra, archon, loot }) {
    const c = this.enemyCenter();
    if (this.canFloat()) this.floatText('+' + fmt(reward) + ' 🪙', 'var(--gold)', c.x, c.y - 30);
    if (!boss) return;
    this.screenShake();
    this.coinBurst(c.x, c.y, archon ? 64 : ultra ? 48 : mega ? 34 : 22);
    if (!loot) return;
    // poklad: zlatý balík + (u mega/ultra) holubice 🕊
    this.floatText('💰 +' + fmt(loot.gold) + ' 🪙', 'var(--gold)', c.x + 46, c.y - 64);
    if (loot.forgiveness) {
      this.floatText('🕊 +' + loot.forgiveness, 'var(--dove)', c.x - 46, c.y - 86);
    }
  }

  /* --- dekorativní smyčka zbraní --- */
  _loop(t) {
    const dt = t - (this._last || t);
    this._last = t;
    const s = this.engine.state;
    if (s.enemy) {
      WEAPONS.forEach((w, i) => {
        if ((s.weapons[w.id] || 0) <= 0) return;
        this._weaponTimers[w.id] -= dt;
        if (this._weaponTimers[w.id] <= 0) {
          this._weaponTimers[w.id] = Math.max(w.interval, CONFIG.weaponVisualMinMs);
          this.weaponProjectile(w, i);
        }
      });
      // Stín pěsti (prestige auto-údery) — ať je vidět, ne jen úbytek HP
      if ((s.prestige.shadow || 0) > 0) {
        this._shadowTimer -= dt;
        if (this._shadowTimer <= 0) {
          this._shadowTimer = CONFIG.shadowVisualMs;
          this.shadowProjectile();
        }
      }
    }
    this._raf = requestAnimationFrame(this._loop);
  }

  weaponProjectile(w, i) {
    const fromX = 20 + (i % 4) * 30;
    const fromY = window.innerHeight - 40 - Math.floor(i / 4) * 36;
    this.throwProjectile(w.emoji, fromX, fromY, w.flight, 0.8, (x, y) => {
      this.shake();
      this.engine.emit('react'); // i zásah zbraní vymění fotku, nejen otřese
      this.floatDamage(weaponShotDamage(this.engine.state, w), 'auto', x, y); // viditelný „burst" zásah
    });
  }

  // Stín pěsti — duch-pěst z náhodné spodní strany + číslo poškození.
  // Číslo = dávka DPS za jeden vizuální interval (drží se reálného shadowDps).
  shadowProjectile() {
    const fromX = window.innerWidth * (Math.random() < 0.5 ? 0.12 : 0.88);
    const fromY = window.innerHeight - 60;
    const amount = shadowDps(this.engine.state) * (CONFIG.shadowVisualMs / 1000);
    this.throwProjectile('👊', fromX, fromY, 260, 0.85, (x, y) => {
      this.shake();
      this.engine.emit('react');
      this.floatDamage(amount, 'auto', x, y);
    });
  }

  punchProjectile({ amount, kind }) {
    const btn = fxRefs.button;
    const r = btn ? btn.getBoundingClientRect() : { left: window.innerWidth / 2, width: 0, top: window.innerHeight - 120 };
    // letící úder = nasazená zbraň: obrázek (když je nahraný), jinak emoji (👊 → 🥊 → ⚔️ …)
    const s = this.engine.state;
    const w = s.equipment?.weapon;
    const imgUrl = w ? itemImageUrl(w.base) : null;
    const emoji = equippedWeaponEmoji(s);
    this.throwProjectile(emoji, r.left + r.width / 2, r.top, 240, 1, (x, y) => {
      this.floatDamage(amount, kind, x, y);
      this.shake();
      this.hitText();
    }, imgUrl);
  }

  hitText() {
    if (Math.random() < 0.4) {
      const c = this.enemyCenter();
      this.powBurst(
        PUNCH_TEXTS[Math.floor(Math.random() * PUNCH_TEXTS.length)],
        c.x + (Math.random() * 60 - 30),
        c.y - 40
      );
    }
  }

  /* --- nízkoúrovňové DOM efekty (recyklované z poolů) --- */
  throwProjectile(emoji, fromX, fromY, flight, scale, onHit, imgUrl) {
    const c = this.enemyCenter();
    if (c.x < 0 || c.x > window.innerWidth || c.y < 0 || c.y > window.innerHeight) {
      try { onHit(c.x, c.y); } catch { /* ignoruj */ }
      return;
    }

    const p = this._proj.acquire();
    const token = p._token;
    if (imgUrl) {
      // obrázek zbraně místo emoji (inline styly — pool je při recyklaci smaže)
      p.textContent = '';
      p.style.width = '56px';
      p.style.height = '56px';
      p.style.backgroundImage = `url("${imgUrl}")`;
      p.style.backgroundSize = 'contain';
      p.style.backgroundRepeat = 'no-repeat';
      p.style.backgroundPosition = 'center';
    } else {
      p.textContent = emoji;
    }
    p.style.left = fromX + 'px';
    p.style.top = fromY + 'px';
    p.style.opacity = '1';
    p.style.transform = `translate(-50%,-50%) scale(${0.6 * scale}) rotate(0deg)`;

    p.getBoundingClientRect(); // reflow — startovní pozice se nastaví bez přechodu
    p.style.transition = `left ${flight}ms cubic-bezier(.55,.06,.68,.19), top ${flight}ms cubic-bezier(.55,.06,.68,.19), transform ${flight}ms ease-in`;
    const tx = c.x + (Math.random() * 40 - 20);
    const ty = c.y + (Math.random() * 50 - 25);
    p.style.left = tx + 'px';
    p.style.top = ty + 'px';
    p.style.transform = `translate(-50%,-50%) scale(${1.4 * scale}) rotate(-25deg)`;

    setTimeout(() => {
      try { onHit(tx, ty); } catch { /* ignoruj */ }
      if (p._token !== token) return; // prvek byl mezitím recyklován — nehýbej s ním
      p.style.transition = 'transform 120ms ease-out, opacity 200ms ease-out';
      p.style.transform = `translate(-50%,-50%) scale(${2.0 * scale}) rotate(12deg)`;
      p.style.opacity = '0';
      setTimeout(() => this._proj.release(p, token), 220);
    }, flight);
  }

  shake() {
    const el = fxRefs.photoWrap;
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  powBurst(text, x, y) {
    const el = this._pow.acquire();
    const token = el._token;
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this._restartAnim(el); // znovu spusť CSS animaci na recyklovaném prvku
    setTimeout(() => this._pow.release(el, token), 460);
  }

  screenShake() {
    const a = fxRefs.arena;
    if (!a) return;
    a.classList.remove('boss-shake');
    void a.offsetWidth;
    a.classList.add('boss-shake');
    setTimeout(() => a.classList.remove('boss-shake'), 520);
  }

  coinBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const c = this._coin.acquire();
      const token = c._token;
      c.textContent = '🪙';
      c.style.left = x + 'px';
      c.style.top = y + 'px';
      c.style.opacity = '1';
      c.style.transform = 'translate(-50%,-50%)';
      c.getBoundingClientRect(); // reflow — start bez přechodu
      const ang = Math.random() * Math.PI * 2;
      const dist = 70 + Math.random() * 170;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist * 0.5 + 140;
      const dur = 600 + Math.random() * 550;
      c.style.transition = `transform ${dur}ms cubic-bezier(.2,.7,.4,1), opacity ${dur}ms ease-in`;
      c.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${Math.random() * 720 - 360}deg) scale(${0.6 + Math.random() * 0.7})`;
      c.style.opacity = '0';
      setTimeout(() => this._coin.release(c, token), dur + 60);
    }
  }

  floatDamage(amount, kind, x, y) {
    if (!this.canFloat()) return;
    const c = this.enemyCenter();
    const el = this._dmg.acquire();
    const token = el._token;
    el.className = 'dmg ' + (kind === 'crit' ? 'crit' : kind === 'auto' ? 'auto' : '');
    el.textContent = (kind === 'crit' ? 'KRIT ' : '') + fmt(amount);
    el.style.left = (x ?? c.x + (Math.random() * 60 - 30)) + 'px';
    el.style.top = (y ?? c.y - 20) + 'px';
    if (kind === 'click') el.style.color = '#fff';
    this._restartAnim(el);
    setTimeout(() => this._dmg.release(el, token), 800);
  }

  floatText(text, color, x, y) {
    const el = this._dmg.acquire();
    const token = el._token;
    el.className = 'dmg';
    el.textContent = text;
    el.style.color = color;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this._restartAnim(el);
    setTimeout(() => this._dmg.release(el, token), 800);
  }

  /* ⭕ boxovací hláška — velká, červená, „úderná" (vlastní @keyframes punchText). */
  floatPunch(text, x, y) {
    const el = this._dmg.acquire();
    const token = el._token;
    el.className = 'dmg punch-text';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = '';
    this._restartAnim(el);
    setTimeout(() => this._dmg.release(el, token), 1100);
  }

  /* Restartuje CSS @keyframes animaci na recyklovaném prvku
     (jinak by se na již použitém uzlu znovu nepřehrála). */
  _restartAnim(el) {
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = '';
  }
}
