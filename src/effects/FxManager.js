/* =========================================================================
   FX MANAGER — imperativní vizuální efekty (mimo React).
   Projektily, plovoucí čísla, „POW", mince a otřesy se přidávají přímo do
   document.body. Reaguje na sémantické eventy enginu + sám pouští DEKORATIVNÍ
   projektily zbraní (poškození počítá engine spojitě, tohle je jen efekt).
   Vše má tvrdé stropy → žádné hromadění, žádný lag.
   ========================================================================= */
import { CONFIG } from '../game/config.js';
import { WEAPONS } from '../game/data/weapons.js';
import { PUNCH_TEXTS } from '../game/data/texts.js';
import { fmt } from '../game/format.js';
import { fxRefs } from './fxRefs.js';

export class FxManager {
  constructor(engine) {
    this.engine = engine;
    this._floaters = 0;
    this._floaterReset = 0;
    this._weaponTimers = {};
    for (const w of WEAPONS) this._weaponTimers[w.id] = 0;
    this._off = engine.onEvent((type, payload) => this.onEvent(type, payload));
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    this._off?.();
    cancelAnimationFrame(this._raf);
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
      default:
        break;
    }
  }

  onDefeat({ reward, boss }) {
    const c = this.enemyCenter();
    if (this.canFloat()) this.floatText('+' + fmt(reward) + ' 🪙', 'var(--gold)', c.x, c.y - 30);
    if (boss) {
      this.screenShake();
      this.coinBurst(c.x, c.y, 22);
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
    }
    this._raf = requestAnimationFrame(this._loop);
  }

  weaponProjectile(w, i) {
    const fromX = 20 + (i % 4) * 30;
    const fromY = window.innerHeight - 40 - Math.floor(i / 4) * 36;
    this.throwProjectile(w.emoji, fromX, fromY, w.flight, 0.8, () => {
      this.shake();
    });
  }

  punchProjectile({ amount, kind }) {
    const btn = fxRefs.button;
    const r = btn ? btn.getBoundingClientRect() : { left: window.innerWidth / 2, width: 0, top: window.innerHeight - 120 };
    this.throwProjectile('👊', r.left + r.width / 2, r.top, 240, 1, (x, y) => {
      this.floatDamage(amount, kind, x, y);
      this.shake();
      this.hitText();
    });
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

  /* --- nízkoúrovňové DOM efekty (port z původní hry) --- */
  throwProjectile(emoji, fromX, fromY, flight, scale, onHit) {
    const c = this.enemyCenter();
    if (c.x < 0 || c.x > window.innerWidth || c.y < 0 || c.y > window.innerHeight) {
      try { onHit(c.x, c.y); } catch { /* ignoruj */ }
      return;
    }
    const live = document.getElementsByClassName('proj');
    while (live.length >= CONFIG.maxProjectiles) live[0].remove();

    const p = document.createElement('div');
    p.className = 'proj';
    p.textContent = emoji;
    p.style.left = fromX + 'px';
    p.style.top = fromY + 'px';
    p.style.transform = `translate(-50%,-50%) scale(${0.6 * scale}) rotate(0deg)`;
    document.body.appendChild(p);

    let done = false;
    const cleanup = () => { if (!done) { done = true; p.remove(); } };
    const safety = setTimeout(cleanup, flight + 600);

    p.getBoundingClientRect(); // reflow
    p.style.transition = `left ${flight}ms cubic-bezier(.55,.06,.68,.19), top ${flight}ms cubic-bezier(.55,.06,.68,.19), transform ${flight}ms ease-in`;
    const tx = c.x + (Math.random() * 40 - 20);
    const ty = c.y + (Math.random() * 50 - 25);
    p.style.left = tx + 'px';
    p.style.top = ty + 'px';
    p.style.transform = `translate(-50%,-50%) scale(${1.4 * scale}) rotate(-25deg)`;
    setTimeout(() => {
      try { onHit(tx, ty); } catch { /* ignoruj */ }
      p.style.transition = 'transform 120ms ease-out, opacity 200ms ease-out';
      p.style.transform = `translate(-50%,-50%) scale(${2.0 * scale}) rotate(12deg)`;
      p.style.opacity = '0';
      clearTimeout(safety);
      setTimeout(cleanup, 220);
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
    const el = document.createElement('div');
    el.className = 'pow';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 460);
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
      const c = document.createElement('div');
      c.className = 'coin';
      c.textContent = '🪙';
      c.style.left = x + 'px';
      c.style.top = y + 'px';
      document.body.appendChild(c);
      c.getBoundingClientRect();
      const ang = Math.random() * Math.PI * 2;
      const dist = 70 + Math.random() * 170;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist * 0.5 + 140;
      const dur = 600 + Math.random() * 550;
      c.style.transition = `transform ${dur}ms cubic-bezier(.2,.7,.4,1), opacity ${dur}ms ease-in`;
      c.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${Math.random() * 720 - 360}deg) scale(${0.6 + Math.random() * 0.7})`;
      c.style.opacity = '0';
      setTimeout(() => c.remove(), dur + 60);
    }
  }

  floatDamage(amount, kind, x, y) {
    if (!this.canFloat()) return;
    const c = this.enemyCenter();
    const el = document.createElement('div');
    el.className = 'dmg ' + (kind === 'crit' ? 'crit' : kind === 'auto' ? 'auto' : '');
    el.textContent = (kind === 'crit' ? 'KRIT ' : '') + fmt(amount);
    el.style.left = (x ?? c.x + (Math.random() * 60 - 30)) + 'px';
    el.style.top = (y ?? c.y - 20) + 'px';
    if (kind === 'click') el.style.color = '#fff';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  floatText(text, color, x, y) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.textContent = text;
    el.style.color = color;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }
}
