/* Světový boss jako PLNÁ ZÁLOŽKA (vedle Hry a Žebříčku) — záměrně vypadá jako
   hlavní aréna: stejná fotka Ekiho, stejné velké tlačítko „DEJ MU!", plovoucí
   čísla, shake. Rozdíl: boss má JEDNO sdílené HP (drží server) a JEDEN KLIK =
   jedna rána za tvůj plný příspěvek (strop dává atestovaný peakDps). Pak minuta
   pauza. Žádné nabíjení salvy ani druhé tlačítko — prostle do něj jednou praštíš. */
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

const POLL_MS = 8_000;   // rychlejší polování, dokud je záložka otevřená
const TICK_MS = 500;     // živý překreslovák odpočtu („další rána za N s")

const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);
const selectPower = (s) => ({ peakDps: s.stats?.peakDps || 0, click: clickDamage(s), dps: totalDps(s) });
const eqPower = (a, b) => a.peakDps === b.peakDps && a.click === b.click && a.dps === b.dps;

export default function WorldBossView({ onJoin, onSelectPlayer }) {
  const wb = useWorldBoss();
  const account = useAccount();
  const { peakDps, dps } = useEngineSelector(selectPower, eqPower);

  // plovoucí čísla + reakční fotka — mimo React state kvůli výkonu
  const lastPunchAt = useRef(0);
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

  // jen živý překreslovák odpočtu („další rána za N s")
  useEffect(() => {
    const id = setInterval(() => { setTick((n) => (n + 1) % 1e6); }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const maxHp = boss?.maxHp || 1;
  const capped = !!me && me.damage >= maxHp * WORLD_BOSS.perPlayerCapFrac;
  const salvoDmg = active ? worldBossSalvoDamage(maxHp, peakDps) : 0; // co srazí jedna rána
  const cdMs = Math.max(0, wb.cooldownUntil - performance.now());
  const cdReady = cdMs <= 0;
  const canHit = active && !wb.busy && cdReady && !capped;

  // jedna rána: anti-autokliker (jen trusted pointer + strop tempa), pak rovnou
  // vypustí plný příspěvek na sdílené HP (server effort klampuje, posíláme 1 = max).
  const doHit = useCallback(async (e) => {
    if (e?.button != null && e.button !== 0) return;
    if (e && !e.nativeEvent?.isTrusted) return;
    const now = performance.now();
    if (now - lastPunchAt.current < CONFIG.minClickMs) return;
    lastPunchAt.current = now;
    if (!active || capped || wb.busy || now < wb.cooldownUntil) return;

    const res = await wb.hit(1);
    if (!res?.ok) return;

    // reakční fotka + shake (restart animace přes reflow) + velké plovoucí „−X HP"
    clearTimeout(reactTimer.current);
    if (imageMode) setReactSrc(REACTION_IMGS[(Math.random() * REACTION_IMGS.length) | 0]);
    else setReactEmoji(REACTION_EMOJI[(Math.random() * REACTION_EMOJI.length) | 0]);
    reactTimer.current = setTimeout(() => { setReactSrc(null); setReactEmoji(null); }, 450);
    const el = wrapRef.current;
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    const id = floatId.current++;
    const f = { id, x: 50, y: 34, text: '−' + fmt(res.dmg || 0), big: true };
    setFloats((arr) => [...arr, f]);
    setTimeout(() => setFloats((arr) => arr.filter((x) => x.id !== id)), 1100);
  }, [active, capped, imageMode, wb]);

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
  const v = worldBossVariant(boss.number);

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

        <div className="photo-wrap" ref={wrapRef} onPointerDown={canHit ? doHit : undefined}>
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
            <button className="punch-btn" tabIndex={-1} onPointerDown={canHit ? doHit : undefined} disabled={!canHit}>
              {capped ? '💪 MÁŠ MAX'
                : !cdReady ? `⏱ Další rána za ${Math.ceil(cdMs / 1000)} s`
                : `👊 DEJ MU! − ${fmt(salvoDmg)} HP`}
            </button>

            <div className="wb-power">
              👊 Tvá rána <b>{fmt(salvoDmg)} HP</b> · jednou za minutu · strop dává tvé DPS <b>{fmt(dps)}</b>
              {me && <> · příspěvek <b>{fmt(me.damage)}</b>{me.rank ? <> (#{me.rank})</> : null}</>}
            </div>
          </>
        ) : (
          <p className="wb-ended">Další boss naskočí za chvíli — vrať se a přidej se k němu.</p>
        )}
      </div>

      {board}

      <p className="wb-foot">
        Boss má jedno <b>sdílené HP</b> — sejměte ho společně, než vyprší čas. Jednou za minutu
        do něj <b>jednou praštíš</b> za svůj plný příspěvek (strop dává tvé nejlepší DPS).
        Odměny dostane každý, kdo přispěl.
      </p>
    </div>
  );
}
