/* Aréna / přepady jako PLNÁ ZÁLOŽKA (vedle Hry, Bosse a Žebříčku). Smyčka:
   najdi oběť (ducha offline hráče) → vyber taktiku → přepadni → když vyhraješ,
   ukradneš mu LUP do svého TREZORU → vyber trezor do bezpečí (nebo riskuj, že ti
   ho někdo sebere). Výsledek počítá SERVER z atestovaného peakDps → klient nic
   netvrdí; tady jen přehráváme předem rozhodnutý souboj a ukazujeme kořist. */
import { useEffect, useState, useCallback, useRef } from 'react';
import { RAID_TACTICS, RAIDS } from '@ekiclicker/shared';
import { useRaid } from '../../hooks/useRaid.js';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt, fmtDuration } from '../../game/format.js';
import { PLACEHOLDER } from '../../game/data/texts.js';

const POLL_MS = 12_000;
const TICK_MS = 500;
const FIGHT_MS = 1100;
const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null);
const tacticDef = (id) => RAID_TACTICS.find((t) => t.id === id) || RAID_TACTICS[0];
const tacticName = (id) => `${tacticDef(id).emoji} ${tacticDef(id).label}`;

const REASON = {
  cooldown: 'Eki se ještě sbírá — zkus to za chvíli.',
  target_cooldown: 'Tuhle oběť jsi nedávno přepadl — dej jí pokoj.',
  shielded: 'Soupeř je pod štítem (nedávno vyloupen). Zkus jiného.',
  protected: 'Soupeř je chráněný nováček.',
  daily_cap: 'Pro dnešek došly přepady. Zítra zas!',
  too_low: `Přepadat můžeš až od úrovně ${RAIDS.newbieShieldLevel}.`,
  no_score: 'Nejdřív si zahraj a odešli skóre.',
  season_changed: 'Začala nová sezóna — obnov stránku.',
  self: 'Sám sebe nepřepadneš. 🙃',
  gone: 'Soupeř už není dostupný.',
  fail: 'Přepad se nezdařil. Zkus to znovu.',
};

export default function RaidView({ onJoin, onSelectPlayer }) {
  const rd = useRaid();
  const account = useAccount();

  const [phase, setPhase] = useState('idle');   // idle | scouted | fighting | result
  const [target, setTarget] = useState(null);    // naskautovaná oběť (nebo cíl pomsty)
  const [tactic, setTactic] = useState('utok');
  const [result, setResult] = useState(null);    // výsledek strike
  const [, setTick] = useState(0);
  const fightTimer = useRef(0);

  const me = rd.me;
  const vault = rd.vault;

  const { refresh, ack } = rd;
  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 1e6), TICK_MS);
    return () => clearInterval(id);
  }, []);
  // při otevření záložky označ příchozí přepady za viděné (zhasne odznak)
  useEffect(() => { void ack(); }, [ack]);
  useEffect(() => () => clearTimeout(fightTimer.current), []);

  const cdMs = Math.max(0, rd.cooldownUntil - performance.now());
  const cdReady = cdMs <= 0;
  const dailyLeft = me?.dailyLeft ?? 0;
  const canRaid = cdReady && dailyLeft > 0 && !rd.busy;

  const doScout = useCallback(async () => {
    setResult(null);
    const opp = await rd.scout();
    if (opp) { setTarget(opp); setPhase('scouted'); }
    else { setTarget(null); setPhase('noone'); }
  }, [rd]);

  const doStrike = useCallback(async (defenderId) => {
    if (!defenderId) return;
    setPhase('fighting');
    const res = await rd.strike(defenderId, tactic);
    clearTimeout(fightTimer.current);
    fightTimer.current = setTimeout(() => {
      setResult(res || { ok: false, reason: 'fail' });
      setPhase('result');
    }, FIGHT_MS);
  }, [rd, tactic]);

  const doRevenge = useCallback((attackerId, nickname) => {
    setResult(null);
    setTarget({ id: attackerId, nickname, revenge: true, loot: null });
    setPhase('scouted');
  }, []);

  const doWithdraw = useCallback(() => { void rd.withdraw(); }, [rd]);
  const reset = useCallback(() => { setPhase('idle'); setTarget(null); setResult(null); }, []);

  // --- stavy bez připojení / načítání ---
  if (account.status === 'local') {
    return (
      <div className="raid-page">
        <div className="board-cta">
          <span>Aréna je asynchronní PvP — přepadni ducha offline hráče a ukradni mu lup z trezoru. Připoj se a vyraz na lov!</span>
          <button className="primary-btn" onClick={onJoin}>➕ Připojit se</button>
        </div>
      </div>
    );
  }
  if (!rd.data || !me) return <div className="raid-page"><div className="board-loading">Načítám arénu…</div></div>;

  const scoutLabel = !cdReady ? `⏱ Další přepad za ${Math.ceil(cdMs / 1000)} s`
    : dailyLeft <= 0 ? '🌙 Dnes došly přepady'
      : rd.busy ? 'Hledám oběť…' : '🗡️ Najít oběť';

  const hasLoot = !!vault && (vault.gold > 0 || vault.doves > 0 || vault.dust > 0);

  return (
    <div className="raid-page">
      {/* hlavička: rating / pořadí / bilance / série */}
      <div className="raid-stats">
        <div className="raid-stat"><span className="lbl">Rating</span><span className="val">{me.rating}</span></div>
        <div className="raid-stat"><span className="lbl">Pořadí</span><span className="val">#{me.rank}</span></div>
        <div className="raid-stat"><span className="lbl">Bilance</span><span className="val">{me.wins}–{me.losses}</span></div>
        <div className="raid-stat"><span className="lbl">Série</span><span className="val">{me.streak > 0 ? `🔥${me.streak}` : '—'}</span></div>
      </div>

      {/* trezor — ukraditelný lup; vyber do bezpečí */}
      <div className={'raid-vault' + (hasLoot ? ' loot' : '')}>
        <div className="raid-vault-head">🏦 Trezor {me.shieldMs > 0 && <span className="raid-shield">🛡️ štít {fmtDuration(me.shieldMs / 1000)}</span>}</div>
        <div className="raid-vault-amts">
          <span>💰 {fmt(vault?.gold || 0)}</span>
          <span>🕊 {fmt(vault?.doves || 0)}</span>
          <span>💠 {fmt(vault?.dust || 0)}</span>
        </div>
        <button className="primary-btn" onClick={doWithdraw} disabled={!hasLoot}>
          {hasLoot ? '🔒 Vybrat do bezpečí' : 'Trezor je prázdný'}
        </button>
        <p className="raid-vault-hint">Lup v trezoru ti můžou ostatní ukrást. Vyber ho do bezpečí — pak je tvůj napořád.</p>
      </div>

      {/* jádro: přepad */}
      <div className="raid-arena">
        {phase === 'idle' || phase === 'noone' ? (
          <div className="raid-hunt">
            <button className="punch-btn raid-scout" onClick={doScout} disabled={!canRaid}>{scoutLabel}</button>
            {phase === 'noone' && <p className="raid-msg">Nikdo k přepadení není (málo hráčů nebo všichni pod štítem). Zkus později.</p>}
            <p className="raid-sub">Zbývá dnes <b>{dailyLeft}</b> přepadů.</p>
          </div>
        ) : phase === 'scouted' && target ? (
          <div className="raid-target">
            <div className="raid-target-head">
              {target.revenge ? '⚔️ Pomsta' : '🎯 Oběť na mušce'}
            </div>
            <div className="raid-victim">
              <button className="raid-victim-name" onClick={onSelectPlayer && target.id ? () => onSelectPlayer(target.id) : undefined}>
                {target.nickname}
              </button>
              {!target.revenge && (
                <div className="raid-victim-meta">úroveň {fmt(target.level)} · rating {target.rating}</div>
              )}
            </div>
            {target.loot && (target.loot.gold > 0 || target.loot.doves > 0 || target.loot.dust > 0) ? (
              <div className="raid-offer">
                💼 K ukradení: <b>💰 {fmt(target.loot.gold)}</b>
                {target.loot.doves > 0 && <> · <b>🕊 {fmt(target.loot.doves)}</b></>}
                {target.loot.dust > 0 && <> · <b>💠 {fmt(target.loot.dust)}</b></>}
              </div>
            ) : (
              <div className="raid-offer dim">💼 {target.revenge ? 'Lup zjistíš až při útoku.' : 'Skoupý terč — hlavně rating a 💠 bonus.'}</div>
            )}

            <div className="raid-tactics">
              {RAID_TACTICS.map((t) => (
                <button
                  key={t.id}
                  className={'raid-tactic' + (tactic === t.id ? ' on' : '')}
                  onClick={() => setTactic(t.id)}
                  title={`Poráží: ${tacticName(t.beats)}`}
                >
                  <span className="emoji">{t.emoji}</span>
                  <span className="name">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="raid-tactic-hint">Soupeřovu obranu neznáš — ⚔️ poráží 🎭, 🎭 poráží 🛡️, 🛡️ poráží ⚔️. Trefa do protitahu = velká výhoda.</p>

            <div className="raid-actions">
              <button className="punch-btn" onClick={() => doStrike(target.id)} disabled={!canRaid}>💥 Přepadnout!</button>
              <button className="ghost-btn" onClick={reset}>Zpět</button>
            </div>
          </div>
        ) : phase === 'fighting' ? (
          <div className="raid-fight">
            <div className="raid-fighter me"><img src={PLACEHOLDER} alt="ty" draggable={false} /><span>Ty {tacticDef(tactic).emoji}</span></div>
            <div className="raid-vs">⚔️</div>
            <div className="raid-fighter foe"><img src={PLACEHOLDER} alt={target?.nickname} draggable={false} /><span>{target?.nickname}</span></div>
          </div>
        ) : phase === 'result' ? (
          <RaidResult res={result} target={target} onAgain={() => { reset(); }} />
        ) : null}
      </div>

      {/* obranná taktika ducha */}
      <div className="raid-defense">
        <div className="raid-defense-head">🛡️ Obrana tvého ducha</div>
        <div className="raid-tactics small">
          {RAID_TACTICS.map((t) => (
            <button
              key={t.id}
              className={'raid-tactic' + (me.defenseTactic === t.id ? ' on' : '')}
              onClick={() => rd.setDefense(t.id)}
            >
              <span className="emoji">{t.emoji}</span><span className="name">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="raid-sub">Když jsi offline a někdo tě napadne, tvůj duch se brání touhle taktikou.</p>
      </div>

      {/* příchozí přepady — pomsta */}
      {rd.incoming.length > 0 && (
        <div className="raid-incoming">
          <div className="raid-board-head">📨 Kdo si na tebe troufl</div>
          {rd.incoming.map((r) => (
            <div key={r.id} className="raid-inc-row">
              <span className="who">
                <b>{r.nickname}</b> {r.looted
                  ? <>tě obral o 💰 {fmt(r.loot.gold)}{r.loot.doves > 0 && ` · 🕊 ${fmt(r.loot.doves)}`}{r.loot.dust > 0 && ` · 💠 ${fmt(r.loot.dust)}`}</>
                  : 'na tebe zaútočil, ale tvůj duch ho odrazil! 🛡️'}
              </span>
              <button className="ghost-btn sm" onClick={() => doRevenge(r.attackerId, r.nickname)} disabled={!canRaid}>⚔️ Pomsta</button>
            </div>
          ))}
        </div>
      )}

      {/* žebříček arény */}
      {rd.top.length > 0 && (
        <div className="raid-board">
          <div className="raid-board-head">🏅 Žebříček arény</div>
          {rd.top.map((r) => (
            <div
              key={r.id || r.rank}
              className={'raid-row' + (account.player?.id && r.id === account.player.id ? ' me' : '') + (onSelectPlayer && r.id ? ' clickable' : '')}
              onClick={onSelectPlayer && r.id ? () => onSelectPlayer(r.id) : undefined}
            >
              <span className="rank">{medal(r.rank) || r.rank}</span>
              <span className="nick">{r.nickname}</span>
              <span className="val">{r.rating} <i>· {r.wins}🏆</i></span>
            </div>
          ))}
        </div>
      )}

      <p className="raid-foot">
        Přepadáš <b>ducha</b> offline hráče — stačí, že jsi online ty. Výsledek počítá server z vašeho
        <b> nejlepšího DPS</b> + zvolené <b>taktiky</b> + štěstí. Vyhraješ → ukradneš <b>lup z jeho trezoru</b>.
        Krade se jen <b>trezor</b> — úroveň, výbavu ani vybrané zlato ti nikdo nesebere.
      </p>
    </div>
  );
}

/* Výsledková obrazovka přepadu — výhra (vyloupeno → trezor) / prohra / chyba. */
function RaidResult({ res, target, onAgain }) {
  if (!res || !res.ok) {
    return (
      <div className="raid-result fail">
        <div className="raid-result-title">🚫 Nepovedlo se</div>
        <p className="raid-msg">{REASON[res?.reason] || REASON.fail}</p>
        <button className="punch-btn" onClick={onAgain}>Zpět</button>
      </div>
    );
  }
  const won = res.attackerWon;
  const loot = res.loot || { gold: 0, doves: 0, dust: 0 };
  const delta = res.ratingDelta || 0;
  return (
    <div className={'raid-result ' + (won ? 'win' : 'lose')}>
      <div className="raid-result-title">{won ? '💰 VYLOUPENO!' : '🛡️ Ubránil se!'}</div>
      <p className="raid-result-foe">{won ? 'Obral jsi' : 'Neprorazil jsi obranu'} <b>{res.defender?.nickname || target?.nickname}</b></p>
      {won ? (
        <>
          <div className="raid-loot">
            <span>💰 {fmt(loot.gold)}</span>
            {loot.doves > 0 && <span>🕊 {fmt(loot.doves)}</span>}
            {loot.dust > 0 && <span>💠 {fmt(loot.dust)}</span>}
          </div>
          <p className="raid-loot-note">→ putuje do tvého <b>trezoru</b>. Nezapomeň ho vybrat do bezpečí!{res.streak > 1 && <> 🔥 Série {res.streak}!</>}</p>
        </>
      ) : (
        <p className="raid-msg">Tentokrát nic. Příště zkus jinou taktiku.</p>
      )}
      <div className="raid-result-rating">Rating {delta >= 0 ? `+${delta}` : delta}</div>
      <button className="punch-btn" onClick={onAgain}>Další přepad</button>
    </div>
  );
}
