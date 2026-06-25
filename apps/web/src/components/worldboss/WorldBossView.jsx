/* Světový boss jako PLNÁ ZÁLOŽKA (vedle Hry a Žebříčku) — záměrně vypadá jako
   hlavní aréna: stejná fotka Ekiho, stejné velké tlačítko „DEJ MU!", combo,
   plovoucí čísla, shake. Rozdíl: boss má JEDNO sdílené HP (drží server) a tvoje
   údery + zbraně NABÍJEJÍ tvou „salvu" až po strop daný tvým atestovaným peakDps.
   Když je salva nabitá a uplynul cooldown, vypustíš ji na sdílené HP. */
import { useEffect, useState, useRef, useCallback } from 'react';
import { WORLD_BOSS, worldBossSalvoDamage } from '@ekiclicker/shared';
import { useWorldBoss } from '../../hooks/useWorldBoss.js';
import { useAccount } from '../../hooks/useAccount.js';
import { useEngineSelector } from '../../hooks/useEngine.js';
import { clickDamage, totalDps } from '../../game/formulas.js';
import { fmt, fmtDuration } from '../../game/format.js';
import { CONFIG } from '../../game/config.js';
import { PLACEHOLDER, REACTION_IMGS, REACTION_EMOJI } from '../../game/data/texts.js';
import { worldBossVariant } from '../../game/data/worldBossVariants.js';

const POLL_MS = 8_000;            // rychlejší polování, dokud je záložka otevřená
const TICK_MS = 80;               // překreslování proužků / odpočtu / nálože
const CHARGE_PER_PUNCH = 0.09;    // kolik nálože přidá jeden úder (≈11 úderů = plná)
const PASSIVE_FILL_SEC = 90;      // nálož se sama (zbraněmi) naplní za ~90 s → údery se vyplatí
const MIN_EFFORT = 0.1;           // pod tímhle salvu nepustíme (server stejně klampuje na 0,1)

const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);
const selectPower = (s) => ({ peakDps: s.stats?.peakDps || 0, click: clickDamage(s), dps: totalDps(s) });
const eqPower = (a, b) => a.peakDps === b.peakDps && a.click === b.click && a.dps === b.dps;

export default function WorldBossView({ onJoin, onSelectPlayer }) {
  const wb = useWorldBoss();
  const account = useAccount();
  const { peakDps, click, dps } = useEngineSelector(selectPower, eqPower);

  // nálož + plovoucí čísla + reakční fotka — mimo React state kvůli výkonu
  const chargeRef = useRef(0);
  const lastPunchAt = useRef(0);
  const lastTrickleAt = useRef(performance.now());
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

  // herní ticker: pasivní dobíjení nálože zbraněmi + živý překreslovák
  useEffect(() => {
    lastTrickleAt.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTrickleAt.current) / 1000;
      lastTrickleAt.current = now;
      if (active && chargeRef.current < 1) {
        chargeRef.current = Math.min(1, chargeRef.current + dt / PASSIVE_FILL_SEC);
      }
      setTick((n) => (n + 1) % 1e6);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  const maxHp = boss?.maxHp || 1;
  const capped = !!me && me.damage >= maxHp * WORLD_BOSS.perPlayerCapFrac;
  const salvoMax = active ? worldBossSalvoDamage(maxHp, peakDps) : 0;
  const perPunchHp = Math.max(1, Math.ceil(salvoMax * CHARGE_PER_PUNCH));

  // jeden úder: anti-autokliker (jen trusted pointer + strop tempa), nabití + juice
  const punch = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    if (!e.nativeEvent?.isTrusted) return;
    if (!active || capped) return;
    const now = performance.now();
    if (now - lastPunchAt.current < CONFIG.minClickMs) return;
    lastPunchAt.current = now;

    chargeRef.current = Math.min(1, chargeRef.current + CHARGE_PER_PUNCH);

    // combo (jen pro pocit, jako v hlavní hře)
    const c = comboRef.current;
    c.count = now - c.at < CONFIG.comboWindow ? c.count + 1 : 1;
    c.at = now;

    // reakční fotka + shake (restart animace přes reflow) + plovoucí „+X HP"
    clearTimeout(reactTimer.current);
    if (imageMode) setReactSrc(REACTION_IMGS[(Math.random() * REACTION_IMGS.length) | 0]);
    else setReactEmoji(REACTION_EMOJI[(Math.random() * REACTION_EMOJI.length) | 0]);
    reactTimer.current = setTimeout(() => { setReactSrc(null); setReactEmoji(null); }, 450);
    const el = wrapRef.current;
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

    const id = floatId.current++;
    const f = { id, x: 26 + Math.random() * 48, y: 28 + Math.random() * 30, text: '+' + fmt(perPunchHp) };
    setFloats((arr) => [...arr, f]);
    setTimeout(() => setFloats((arr) => arr.filter((x) => x.id !== id)), 760);
    setTick((n) => (n + 1) % 1e6);
  }, [active, capped, imageMode, perPunchHp]);

  // vypusť salvu na sdílené HP (server škáluje boundovaný strop tvou náloží = effort)
  const doFire = useCallback(async () => {
    const charge = chargeRef.current;
    if (charge < MIN_EFFORT) return;
    const res = await wb.hit(charge);
    if (res?.ok) {
      chargeRef.current = 0;
      const id = floatId.current++;
      const f = { id, x: 50, y: 34, text: '−' + fmt(res.dmg || 0), big: true };
      setFloats((arr) => [...arr, f]);
      setTimeout(() => setFloats((arr) => arr.filter((x) => x.id !== id)), 1100);
    }
  }, [wb]);
  const doClaim = useCallback(() => { void wb.claim(); }, [wb]);

  const claimBanner = wb.unclaimed && (
    <div className="wb-claim">
      <span>🎁 Odměna za bosse: <b>+{wb.unclaimed.doves} 🕊</b> · <b>+{fmt(wb.unclaimed.dust)} 💠</b></span>
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
  const cdMs = Math.max(0, wb.cooldownUntil - performance.now());
  const cdReady = cdMs <= 0;
  const charge = chargeRef.current;
  const currentSalvo = Math.min(hp, Math.ceil(salvoMax * charge));
  const fireReady = active && !wb.busy && cdReady && !capped && charge >= MIN_EFFORT;
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

        {active && <div className={'combo' + (comboOn ? ' on' : '')}>{comboOn ? `x${combo.count} combo` : ' '}</div>}

        <div className="photo-wrap" ref={wrapRef} onPointerDown={active ? punch : undefined}>
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
            {/* salva: kolik HP máš nabito (roste s údery + tvými zbraněmi) */}
            <div className="wb-salvo">
              <span className="lbl">Salva</span>
              <div className="fill" style={{ width: Math.round(charge * 100) + '%' }} />
              <span className="num">{fmt(currentSalvo)} / {fmt(salvoMax)} HP</span>
            </div>

            <button className="punch-btn" tabIndex={-1} onPointerDown={punch} disabled={capped}>
              {capped ? '💪 MÁŠ MAX' : 'DEJ MU!'}
            </button>

            <button className="wb-fire" disabled={!fireReady} onClick={doFire}>
              {capped ? '💪 Tvůj max příspěvek'
                : !cdReady ? `⏱ Salva za ${Math.ceil(cdMs / 1000)} s`
                : charge < MIN_EFFORT ? '👊 Nabij salvu údery'
                : `💥 Vypustit salvu — ${fmt(currentSalvo)} HP`}
            </button>

            <div className="wb-power">
              👊 Úder <b>{fmt(click)}</b> · ⚔️ DPS <b>{fmt(dps)}</b> → strop salvy <b>{fmt(salvoMax)} HP</b>
              {me && <> · příspěvek <b>{fmt(me.damage)}</b>{me.rank ? <> (#{me.rank})</> : null}</>}
            </div>
          </>
        ) : (
          <p className="wb-ended">Další boss naskočí za chvíli — vrať se a přidej se k němu.</p>
        )}
      </div>

      {board}

      <p className="wb-foot">
        Boss má jedno <b>sdílené HP</b> — sejměte ho společně, než vyprší čas. Tvé <b>údery</b> a
        tvoje <b>zbraně</b> nabíjejí salvu až po strop daný tvým nejlepším DPS; vypustit ji jde
        jednou za minutu. Odměny dostane každý, kdo přispěl.
      </p>
    </div>
  );
}
