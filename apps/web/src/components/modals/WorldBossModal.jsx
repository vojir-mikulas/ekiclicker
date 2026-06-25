/* Světový boss — sezónní kooperativní souboj. Jedno SDÍLENÉ HP, které komunita
   společně ubíjí (server drží stav, klient polluje). Udeř jednou za minutu;
   poškození počítá server z tvého atestovaného peakDps. Odměny (🕊 + 💠) dostane
   každý, kdo přispěl — vyzvedneš je po pádu/úniku bosse. */
import { useEffect, useState, useCallback } from 'react';
import { WORLD_BOSS } from '@ekiclicker/shared';
import { useWorldBoss } from '../../hooks/useWorldBoss.js';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt, fmtDuration } from '../../game/format.js';
import Modal from './Modal.jsx';

const POLL_MS = 8_000; // rychlejší polování, dokud je okno otevřené (živý proužek)
const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);

/* Lehký „ticker" — překresluje komponentu na živý odpočet cooldownu/deadline. */
function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => (n + 1) % 1e6), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function WorldBossModal({ onClose, onJoin }) {
  const wb = useWorldBoss();
  const account = useAccount();
  useTick(500);

  // dokud je okno otevřené, polluj rychleji (sdílená data se aktualizují i pro topbar)
  const { refresh } = wb;
  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const doHit = useCallback(() => { void wb.hit(); }, [wb]);
  const doClaim = useCallback(() => { void wb.claim(); }, [wb]);

  const myId = account.player?.id;
  const boss = wb.boss;
  const me = wb.me;

  const claimBanner = wb.unclaimed && (
    <div className="wb-claim">
      <span>🎁 Odměna za bosse: <b>+{wb.unclaimed.doves} 🕊</b> · <b>+{fmt(wb.unclaimed.dust)} 💠</b></span>
      <button className="primary-btn" onClick={doClaim}>Vyzvednout</button>
    </div>
  );

  let body;
  if (account.status === 'local') {
    body = (
      <div className="board-cta">
        <span>Světový boss je sezónní souboj celé komunity o jedno sdílené HP. Připoj se a přidej ránu!</span>
        <button className="primary-btn" onClick={onJoin}>➕ Připojit se</button>
      </div>
    );
  } else if (!wb.data) {
    body = <div className="board-loading">Načítám bosse…</div>;
  } else if (!boss) {
    body = <div className="board-empty">Právě teď tu žádný boss není. Mrkni později. 🐉</div>;
  } else {
    const maxHp = boss.maxHp || 1;
    const hp = Math.max(0, boss.hp);
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const active = boss.status === 'active';
    const deadlineMs = Math.max(0, new Date(boss.endsAt).getTime() - Date.now());
    const cdMs = Math.max(0, wb.cooldownUntil - performance.now());
    const capped = !!me && me.damage >= maxHp * WORLD_BOSS.perPlayerCapFrac;
    const hitDisabled = !active || wb.busy || cdMs > 0 || capped;

    const statusLine =
      boss.status === 'defeated' ? '🎉 Komunita ho složila!' :
      boss.status === 'expired' ? '🏳️ Tentokrát utekl — příště ho dostaneme.' :
      `Sezónní světový boss č. ${boss.number}`;

    body = (
      <>
        <div className={'wb-hero ' + boss.status}>
          <div className="wb-emoji">{boss.emoji}</div>
          <div className="wb-title">
            <div className="wb-name">{boss.name}</div>
            <div className="wb-sub">{statusLine}</div>
          </div>
        </div>

        <div className="wb-hpbar">
          <div className={'wb-hpfill ' + boss.status} style={{ width: pct + '%' }} />
          <span className="wb-hptext">{fmt(Math.ceil(hp))} / {fmt(maxHp)} HP</span>
        </div>

        {active && (
          <div className="wb-chips">
            <span className="wb-chip">🔥 {wb.fighters} {wb.fighters === 1 ? 'bojuje' : 'bojuje'}</span>
            <span className="wb-chip">⏳ zbývá {fmtDuration(deadlineMs / 1000)}</span>
          </div>
        )}

        {active ? (
          <div className="wb-hitwrap">
            <button className="wb-hit primary-btn" disabled={hitDisabled} onClick={doHit}>
              {capped ? '💪 Tvůj max příspěvek' : cdMs > 0 ? `⏱ Nabíjím… ${Math.ceil(cdMs / 1000)} s` : '💥 Udeř!'}
            </button>
            {me && (
              <div className="wb-me">
                Tvůj příspěvek: <b>{fmt(me.damage)}</b>{me.rank ? <> · pořadí <b>#{me.rank}</b></> : null}
              </div>
            )}
          </div>
        ) : (
          <p className="wb-ended">Další boss naskočí za chvíli — vrať se a přidej se k němu.</p>
        )}

        {claimBanner}

        {wb.top.length > 0 && (
          <div className="wb-board">
            <div className="wb-board-head">🏅 Největší přispěvatelé</div>
            {wb.top.map((r) => (
              <div key={r.id || r.rank} className={'wb-row' + (myId && r.id === myId ? ' me' : '')}>
                <span className="rank">{medal(r.rank) || r.rank}</span>
                <span className="nick">{r.nickname}</span>
                <span className="val">{fmt(r.damage)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="wb-foot">
          Boss má jedno <b>sdílené HP</b> — sejměte ho společně, než vyprší čas. Udeřit jde
          jednou za minutu; tvoje rána roste s tvým nejlepším DPS. Odměny dostane každý, kdo přispěl.
        </p>
      </>
    );
  }

  return (
    <Modal onClose={onClose} className="world-boss-modal">
      <h2>🐲 Světový boss</h2>
      {/* claim banner ukaž i bez aktivního bosse (po respawnu / mezi bossy) */}
      {account.status === 'joined' && !boss && claimBanner}
      {body}
    </Modal>
  );
}
