/* Světový boss jako PLNÁ ZÁLOŽKA (vedle Hry a Žebříčku) — záměrně vypadá jako
   hlavní aréna: stejná fotka Ekiho, stejné velké tlačítko „DEJ MU!", combo,
   plovoucí čísla, shake. Rozdíl: boss má JEDNO sdílené HP (drží server).
   Smyčka: naval Ekimu sérii úderů (~10) → tím vypustíš svůj plný smash na sdílené
   HP → pak minuta klid. Žádné druhé tlačítko ani auto — prostě do něj mlátíš,
   a poslední úder série odpálí celý příspěvek a nasadí 60s cooldown. */
import { useEffect, useState, useRef, useCallback } from 'react';
import { WORLD_BOSS, worldBossSalvoDamage } from '@ekiclicker/shared';
import { useWorldBoss } from '../../hooks/useWorldBoss.js';
import { useAccount } from '../../hooks/useAccount.js';
import { useEngineSelector } from '../../hooks/useEngine.js';
import { fmt, fmtDuration } from '../../game/format.js';
import { CONFIG } from '../../game/config.js';
import { PLACEHOLDER, REACTION_IMGS, REACTION_EMOJI } from '../../game/data/texts.js';
import { worldBossVariant } from '../../game/data/worldBossVariants.js';

const POLL_MS = 8_000;          // rychlejší polování, dokud je záložka otevřená
const TICK_MS = 250;            // živý překreslovák (combo okno + odpočet)
const CHARGE_PER_SMASH = 0.1;   // co přidá jeden úder; ~10 úderů = plný smash
const CLICKS_TO_FULL = Math.ceil(1 / CHARGE_PER_SMASH);

const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);
const selectPeakDps = (s) => s.stats?.peakDps || 0;

export default function WorldBossView({ onJoin, onSelectPlayer }) {
  const wb = useWorldBoss();
  const account = useAccount();
  const peakDps = useEngineSelector(selectPeakDps);

  // nálož smashe + plovoucí čísla + reakční fotka — mimo React state kvůli výkonu
  const chargeRef = useRef(0);       // 0→1, plní se údery; při 1 se odpálí celý smash
  const firingRef = useRef(false);   // brání dvojímu výstřelu na hraně 1.0
  const lastPunchAt = useRef(0);
  const comboRef = useRef({ count: 0, at: 0 });
  const reactTimer = useRef(0);
  const floatId = useRef(0);
  const wrapRef = useRef(null);
  const [, setTick] = useState(0);
  const [floats, setFloats] = useState([]);
  const [reactSrc, setReactSrc] = useState(null);
  const [reactEmoji, setReactEmoji] = useState(null);
  const [imageMode, setImageMode] = useState(true);

  const boss = wb.boss;
  const me = wb.me;
  const active = boss?.status === 'active';

  // rychlé polování, dokud je záložka vidět
  const { refresh } = wb;
  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // živý překreslovák (combo okno dohasíná, odpočet cooldownu tiká)
  useEffect(() => {
    const id = setInterval(() => { setTick((n) => (n + 1) % 1e6); }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const maxHp = boss?.maxHp || 1;
  const capped = !!me && me.damage >= maxHp * WORLD_BOSS.perPlayerCapFrac;
  const salvoDmg = active ? worldBossSalvoDamage(maxHp, peakDps) : 0;     // celý smash
  const chunkDmg = Math.max(1, Math.ceil(salvoDmg * CHARGE_PER_SMASH));   // jeden úder
  const cdMs = Math.max(0, wb.cooldownUntil - performance.now());
  const cdReady = cdMs <= 0;
  const canSmash = active && !capped && !wb.busy && cdReady;

  // odpálení celé série na sdílené HP (effort=1 = serverem boundovaný max),
  // nasadí 60s cooldown a vynuluje nálož; spustí ho poslední úder série.
  const doFire = useCallback(async () => {
    if (firingRef.current) return;
    firingRef.current = true;
    const res = await wb.hit(1);
    firingRef.current = false;
    chargeRef.current = 0;
    if (!res?.ok) return;
    const el = wrapRef.current;
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    const id = floatId.current++;
    const f = { id, x: 50, y: 30, text: '−' + fmt(res.dmg || 0), big: true };
    setFloats((arr) => [...arr, f]);
    setTimeout(() => setFloats((arr) => arr.filter((x) => x.id !== id)), 1100);
  }, [wb]);

  // jeden úder smashe: anti-autokliker (jen trusted pointer + strop tempa), juice,
  // přidá nálož; jakmile je plná, poslední úder odpálí celou sérii.
  const doSmash = useCallback((e) => {
    if (e?.button != null && e.button !== 0) return;
    if (e && !e.nativeEvent?.isTrusted) return;
    const now = performance.now();
    if (now - lastPunchAt.current < CONFIG.minClickMs) return;
    lastPunchAt.current = now;
    if (!active || capped || wb.busy || now < wb.cooldownUntil || firingRef.current) return;

    // combo (jen pro pocit, jako v hlavní hře)
    const c = comboRef.current;
    c.count = now - c.at < CONFIG.comboWindow ? c.count + 1 : 1;
    c.at = now;

    // reakční fotka + shake (restart animace přes reflow)
    clearTimeout(reactTimer.current);
    if (imageMode) setReactSrc(REACTION_IMGS[(Math.random() * REACTION_IMGS.length) | 0]);
    else setReactEmoji(REACTION_EMOJI[(Math.random() * REACTION_EMOJI.length) | 0]);
    reactTimer.current = setTimeout(() => { setReactSrc(null); setReactEmoji(null); }, 450);
    const el = wrapRef.current;
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

    chargeRef.current = Math.min(1, chargeRef.current + CHARGE_PER_SMASH);
    if (chargeRef.current >= 1) {
      void doFire();   // poslední úder série → odpálí celý smash + 60s cooldown
    } else {
      const id = floatId.current++;
      const f = { id, x: 24 + Math.random() * 52, y: 26 + Math.random() * 34, text: '−' + fmt(chunkDmg) };
      setFloats((arr) => [...arr, f]);
      setTimeout(() => setFloats((arr) => arr.filter((x) => x.id !== id)), 760);
    }
    setTick((n) => (n + 1) % 1e6);
  }, [active, capped, imageMode, chunkDmg, wb, doFire]);

  const doClaim = useCallback(() => { void wb.claim(); }, [wb]);

  const claimBanner = wb.unclaimed && (
    <div className="wb-claim">
      <span>
        🎁 Odměna za bosse: <b>+{wb.unclaimed.doves} 🕊</b> · <b>+{fmt(wb.unclaimed.dust)} 💠</b>
        {wb.unclaimed.chests > 0 && <> · <b>+{wb.unclaimed.chests}× 🐉</b></>}
      </span>
      <button className="primary-btn" onClick={doClaim}>Vyzvednout</button>
    </div>
  );

  const board = wb.top.length > 0 && (
    <div className="wb-board">
      <div className="wb-board-head">🏅 Největší přispěvatelé</div>
      {wb.top.map((r) => (
        <div
          key={r.id || r.rank}
          className={'wb-row' + (account.player?.id && r.id === account.player.id ? ' me' : '') + (onSelectPlayer && r.id ? ' clickable' : '')}
          onClick={onSelectPlayer && r.id ? () => onSelectPlayer(r.id) : undefined}
        >
          <span className="rank">{medal(r.rank) || r.rank}</span>
          <span className="nick">{r.nickname}</span>
          <span className="val">{fmt(r.damage)}</span>
        </div>
      ))}
    </div>
  );

  // --- stavy bez aktivního souboje ---
  if (account.status === 'local') {
    return (
      <div className="wb-page">
        <div className="board-cta">
          <span>Světový boss je sezónní souboj celé komunity o jedno sdílené HP. Připoj se a přidej ránu!</span>
          <button className="primary-btn" onClick={onJoin}>➕ Připojit se</button>
        </div>
      </div>
    );
  }
  if (!wb.data) return <div className="wb-page"><div className="board-loading">Načítám bosse…</div></div>;
  if (!boss) {
    return (
      <div className="wb-page">
        {claimBanner}
        <div className="board-empty">Právě teď tu žádný boss není. Mrkni později. 🐉</div>
      </div>
    );
  }

  const hp = Math.max(0, boss.hp);
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const deadlineMs = Math.max(0, new Date(boss.endsAt).getTime() - Date.now());
  const respawnMs = boss.respawnAt ? Math.max(0, new Date(boss.respawnAt).getTime() - Date.now()) : 0;
  const charge = chargeRef.current;
  const v = worldBossVariant(boss.number);
  const combo = comboRef.current;
  const comboOn = active && combo.count > 1 && performance.now() - combo.at < CONFIG.comboWindow;

  const tier =
    boss.status === 'defeated' ? '🎉 Komunita ho složila' :
    boss.status === 'expired' ? '🏳️ Tentokrát utekl' :
    `🐲 SVĚTOVÝ BOSS · č. ${boss.number}`;

  return (
    <div className="wb-page">
      {claimBanner}

      <div className={'arena wb-arena ' + boss.status}>
        <div className="enemy-name">{boss.name}</div>
        <div className="enemy-tier">{tier}</div>

        <div className="hpbar wb-hp">
          <div className={'hpfill ' + boss.status} style={{ width: pct + '%' }} />
          <div className="hptext">{fmt(Math.ceil(hp))} / {fmt(maxHp)} HP</div>
        </div>

        {active && (
          <div className="wb-chips">
            <span className="wb-chip">🔥 {wb.fighters} bojuje</span>
            <span className="wb-chip">⏳ zbývá {fmtDuration(deadlineMs / 1000)}</span>
          </div>
        )}

        {active && <div className={'combo' + (comboOn ? ' on' : '')}>{comboOn ? `x${combo.count} combo` : ' '}</div>}

        <div className="photo-wrap" ref={wrapRef} onPointerDown={canSmash ? doSmash : undefined}>
          <div className="photo-glow" style={{ background: v.glow }} />
          {imageMode ? (
            <img
              className="photo"
              src={reactSrc || PLACEHOLDER}
              alt={boss.name}
              style={{ filter: v.filter }}
              onError={() => setImageMode(false)}
              draggable={false}
            />
          ) : (
            <div className="face-fallback" style={{ filter: v.filter }}>{reactEmoji || '😤'}</div>
          )}
          <div className="tint" style={{ background: v.tint, opacity: v.tint ? 1 : 0 }} />
          {floats.map((f) => (
            <span key={f.id} className={'wb-float' + (f.big ? ' big' : '')} style={{ left: f.x + '%', top: f.y + '%' }}>
              {f.text}
            </span>
          ))}
        </div>

        {active ? (
          <>
            {/* nálož smashe — plní se tvými údery, při plné se odpálí celý příspěvek */}
            <div className="wb-smash">
              <div className="fill" style={{ width: Math.round(charge * 100) + '%' }} />
              <span className="num">
                {!cdReady ? 'Eki se sbírá…' : capped ? 'máš max' : charge > 0 ? `${Math.round(charge * 100)} %` : 'naval mu to!'}
              </span>
            </div>

            <button className="punch-btn" tabIndex={-1} onPointerDown={canSmash ? doSmash : undefined} disabled={!canSmash}>
              {capped ? '💪 MÁŠ MAX'
                : !cdReady ? `⏱ Další smash za ${Math.ceil(cdMs / 1000)} s`
                : 'DEJ MU! 👊'}
            </button>

            <div className="wb-power">
              💥 Plný smash <b>{fmt(salvoDmg)} HP</b> · ~{CLICKS_TO_FULL} úderů, pak minuta klid
              {me && <> · příspěvek <b>{fmt(me.damage)}</b>{me.rank ? <> (#{me.rank})</> : null}</>}
            </div>
          </>
        ) : (
          <p className="wb-ended">
            {respawnMs > 0
              ? <>🐲 Další boss naskočí za <b>{fmtDuration(respawnMs / 1000)}</b> — vrať se a přidej se k němu.</>
              : 'Další boss už naskakuje… vydrž chvilku. 🐉'}
          </p>
        )}
      </div>

      {board}

      <p className="wb-foot">
        Boss má jedno <b>sdílené HP</b> — sejměte ho společně, než vyprší čas. Naval Ekimu
        <b> sérii úderů</b> (~{CLICKS_TO_FULL}) — poslední rána vypustí tvůj <b>plný smash</b> (strop
        dává tvé nejlepší DPS) a pak je minuta klid. Odměny dostane každý, kdo přispěl.
      </p>
    </div>
  );
}
