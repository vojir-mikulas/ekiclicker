/* Cech (guild) jako PLNÁ ZÁLOŽKA (vedle Hry, Bosse, Arény a Žebříčku).
   Bez cechu: prohlížeč cechů + pozvánky + CTA Založit. V cechu: hlavička, perky,
   MOTD, roster s nástroji důstojníků a žádosti o vstup. Identita přežívá sezónu;
   úroveň/perky se počítají per-sezóna (Fáze 4 je naplní — teď default úroveň 1). */
import { useState, useEffect, useCallback } from 'react';
import { GUILDS } from '@ekiclicker/shared';
import { useGuild } from '../../hooks/useGuild.js';
import { useAccount } from '../../hooks/useAccount.js';
import { useEngineSelector } from '../../hooks/useEngine.js';
import { fmt } from '../../game/format.js';

const selectLevel = (s) => s.highestLevel || 1;
const pct = (x) => `${Math.round((x || 0) * 100)} %`;
const roleBadge = (role) => (role === 'master' ? '👑 Mistr' : role === 'officer' ? '🎖️ Důstojník' : 'Člen');

/* Feed: událost → lidská věta (actor/target může být null = smazaný účet). */
const FEED_TEXT = {
  found: (a) => `🛡️ ${a} založil(a) cech`,
  join: (a) => `➕ ${a} se přidal(a)`,
  leave: (a) => `🚪 ${a} odešel/odešla`,
  kick: (a, t) => `✖️ ${t} byl(a) vyhozen(a)`,
  promote: (a, t) => `⬆️ ${t} → důstojník`,
  demote: (a, t) => `⬇️ ${t} → člen`,
  transfer: (a, t) => `👑 ${t} je nový Mistr`,
};
function feedText(f) {
  const fn = FEED_TEXT[f.kind];
  return fn ? fn(f.actor || 'Někdo', f.target || 'někdo') : `${f.actor || 'Někdo'}: ${f.kind}`;
}
function ago(at) {
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'teď';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export default function GuildView({ onJoin, onSelectPlayer, onFound }) {
  const guild = useGuild();
  const account = useAccount();
  const myLevel = useEngineSelector(selectLevel);

  if (account.status === 'local') {
    return (
      <div className="guild-page">
        <div className="board-cta">
          <span>Cechy jsou sociální vrstva — založ partu, sbírej bonusy a perte se o žebříček cechů. Připoj se a vstup do hry!</span>
          <button className="primary-btn" onClick={onJoin}>➕ Připojit se</button>
        </div>
      </div>
    );
  }
  if (!guild?.data) return <div className="guild-page"><div className="board-loading">Načítám cech…</div></div>;

  return (
    <div className="guild-page">
      {guild.guild
        ? <InGuild guild={guild} myLevel={myLevel} account={account} onSelectPlayer={onSelectPlayer} />
        : <NoGuild guild={guild} myLevel={myLevel} onFound={onFound} onSelectPlayer={onSelectPlayer} />}
    </div>
  );
}

/* ---------- bez cechu: pozvánky + prohlížeč + CTA Založit ---------- */
function NoGuild({ guild, myLevel, onFound, onSelectPlayer }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [requested, setRequested] = useState(() => new Set());
  const canJoin = myLevel >= GUILDS.joinLevel;
  const canFound = myLevel >= GUILDS.foundLevel;

  const load = useCallback(async () => { setList(await guild.browse()); }, [guild]);
  useEffect(() => { void load(); }, [load]);

  const doRequest = async (id) => {
    const res = await guild.request(id);
    if (res?.ok) setRequested((s) => new Set(s).add(id));
  };

  const filtered = (list || []).filter((g) => {
    const t = q.trim().toLowerCase();
    return !t || g.name.toLowerCase().includes(t) || g.tag.toLowerCase().includes(t);
  });

  return (
    <>
      <div className="guild-hero">
        <div className="guild-hero-txt">
          <h2>🛡️ Cechy</h2>
          <p>Spoj se s ostatními. Členové cechu sbírají bounded bonusy (zlato/úlomky/štěstí) a perou se o žebříček cechů.</p>
        </div>
        <button className="primary-btn" onClick={onFound} disabled={!canFound}
          title={canFound ? 'Založit nový cech' : `Zakládat lze od úrovně ${fmt(GUILDS.foundLevel)}`}>
          ➕ Založit cech{!canFound && <span className="dim"> (lvl {fmt(GUILDS.foundLevel)})</span>}
        </button>
      </div>

      {guild.invites.length > 0 && (
        <div className="guild-invites">
          <div className="guild-section-head">📨 Pozvánky do cechu</div>
          {guild.invites.map((inv) => (
            <div key={inv.id} className="guild-invite-row">
              <span><span className="guild-tag">[{inv.guildTag}]</span> <b>{inv.guildName}</b> tě zve · od {inv.by}</span>
              <span className="guild-row-actions">
                <button className="primary-btn sm" onClick={() => guild.respondInvite(inv.id, true)} disabled={guild.busy}>Přijmout</button>
                <button className="ghost-btn sm" onClick={() => guild.respondInvite(inv.id, false)} disabled={guild.busy}>Odmítnout</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="guild-browse">
        <div className="guild-section-head">
          🏆 Žebříček cechů
          <input className="text-input guild-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat jméno / TAG…" />
        </div>
        {list === null ? <div className="board-loading">Načítám…</div>
          : filtered.length === 0 ? <div className="board-empty">Žádný cech neodpovídá. {!q && 'Buď první a založ ho! 🛡️'}</div>
            : (
              <div className="guild-list">
                {filtered.map((g) => (
                  <div key={g.id} className="guild-list-row">
                    <button className="guild-list-name" onClick={() => onSelectPlayer && g.masterId ? onSelectPlayer(g.masterId) : undefined}>
                      <span className="guild-tag">[{g.tag}]</span> {g.name}
                    </button>
                    <span className="guild-list-meta">⭐{g.level || 1} · {g.memberCount} 👥</span>
                    {requested.has(g.id)
                      ? <span className="guild-requested">✓ Žádost odeslána</span>
                      : <button className="ghost-btn sm" onClick={() => doRequest(g.id)} disabled={!canJoin || guild.busy}
                        title={canJoin ? 'Požádat o vstup' : `Vstup od úrovně ${fmt(GUILDS.joinLevel)}`}>Požádat</button>}
                  </div>
                ))}
              </div>
            )}
        {!canJoin && <p className="guild-foot">Vstoupit do cechu můžeš od úrovně <b>{fmt(GUILDS.joinLevel)}</b> (teď {fmt(myLevel)}).</p>}
      </div>
    </>
  );
}

/* ---------- v cechu: hlavička + perky + MOTD + roster + žádosti ---------- */
function InGuild({ guild, account, onSelectPlayer }) {
  const g = guild.guild;
  const perks = g.perks || { goldFind: 0, dustFind: 0, luck: 0, memberSlots: 0 };
  const [confirmDisband, setConfirmDisband] = useState(false);
  const myId = account.player?.id;

  return (
    <>
      <div className="guild-header">
        <div className="guild-id">
          <span className="guild-tag big">[{g.tag}]</span>
          <span className="guild-name">{g.name}</span>
        </div>
        <div className="guild-header-meta">
          <span className="guild-pill">⭐ Úroveň {g.level}</span>
          {g.rank && <span className="guild-pill">🏆 #{g.rank}</span>}
          <span className="guild-pill">👥 {g.memberCount}/{g.memberCap}</span>
          <span className="guild-pill">{roleBadge(guild.role)}</span>
        </div>
      </div>

      <div className="guild-cols">
        <div className="guild-col guild-col-main">
          <GuildMotd guild={guild} motd={g.motd} />

          <div className="guild-roster">
            <div className="guild-section-head">👥 Roster ({g.memberCount}/{g.memberCap})</div>
            {guild.roster.map((m) => (
              <div key={m.playerId} className={'guild-member' + (m.playerId === myId ? ' me' : '')}>
                <button className="guild-member-name" onClick={() => onSelectPlayer && onSelectPlayer(m.playerId)}>
                  {m.role === 'master' && <span className="crown">👑</span>}
                  {m.nickname}{m.playerId === myId && <span className="dim"> (ty)</span>}
                </button>
                <span className="guild-member-role">{roleBadge(m.role)}</span>
                <MemberTools guild={guild} member={m} myId={myId} />
              </div>
            ))}
          </div>

          {g.feed && g.feed.length > 0 && (
            <div className="guild-feed">
              <div className="guild-section-head">📰 Dění v cechu</div>
              {g.feed.map((f, i) => (
                <div key={i} className="guild-feed-row">
                  <span className="guild-feed-txt">{feedText(f)}</span>
                  <span className="guild-feed-time">{ago(f.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="guild-col guild-col-side">
          <div className="guild-standing">
            <div className="guild-section-head">📊 Sezónní postavení</div>
            <ul className="guild-perk-list">
              <li><span>🏆 Pořadí cechů</span><b>{g.rank ? `#${g.rank}` : '—'}</b></li>
              <li><span>💪 Příspěvek</span><b>{fmt(Math.round(g.contribution || 0))}</b></li>
              <li><span>🐲 Boss (součet)</span><b>{fmt(Math.round(g.bossDamage || 0))}</b></li>
            </ul>
            <p className="guild-foot">Příspěvek je serverový součet atestovaných statů členů (úroveň + DPS + světový boss). Resetuje se každou sezónu; nejlepší cechy získají odměny pro členy.</p>
          </div>

          <div className="guild-perks">
            <div className="guild-section-head">🎁 Bonusy cechu</div>
            <ul className="guild-perk-list">
              <li><span>🪙 Zlato</span><b>+{pct(perks.goldFind)}</b></li>
              <li><span>💠 Úlomky</span><b>+{pct(perks.dustFind)}</b></li>
              <li><span>🍀 Štěstí</span><b>+{pct(perks.luck)}</b></li>
              {perks.memberSlots > 0 && <li><span>👥 Sloty navíc</span><b>+{perks.memberSlots}</b></li>}
            </ul>
            <p className="guild-foot">Bonusy rostou s úrovní cechu (max {GUILDS.maxLevel}). Nikdy nezvyšují poškození — jen pohodlí, takže neovlivní obtížnost ani žebříček.</p>
          </div>

          {guild.isOfficer && <OfficerTools guild={guild} />}

          <div className="guild-leave">
            {guild.isMaster ? (
              confirmDisband ? (
                <div className="guild-confirm">
                  <span>Opravdu rozpustit cech?</span>
                  <button className="primary-btn sm danger" onClick={() => guild.disband()} disabled={guild.busy}>Ano, rozpustit</button>
                  <button className="ghost-btn sm" onClick={() => setConfirmDisband(false)}>Zpět</button>
                </div>
              ) : (
                <>
                  <button className="ghost-btn danger" onClick={() => setConfirmDisband(true)} disabled={guild.busy}>🗑️ Rozpustit cech</button>
                  <p className="guild-foot">Než odejdeš, předej titul Mistra jinému členovi (přes tlačítko 👑 u jeho jména), nebo cech rozpusť.</p>
                </>
              )
            ) : (
              <button className="ghost-btn danger" onClick={() => guild.leave()} disabled={guild.busy}>🚪 Opustit cech</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* Akce nad členem (kick/povýšení/transfer) dle mé role a role cíle. */
function MemberTools({ guild, member, myId }) {
  if (member.playerId === myId) return null;
  const tools = [];
  if (guild.isMaster) {
    if (member.role === 'member') tools.push(<button key="p" className="guild-tool" title="Povýšit na důstojníka" onClick={() => guild.setRole(member.playerId, 'officer')} disabled={guild.busy}>⬆️</button>);
    if (member.role === 'officer') tools.push(<button key="d" className="guild-tool" title="Snížit na člena" onClick={() => guild.setRole(member.playerId, 'member')} disabled={guild.busy}>⬇️</button>);
    tools.push(<button key="t" className="guild-tool" title="Předat titul Mistra" onClick={() => guild.transfer(member.playerId)} disabled={guild.busy}>👑</button>);
  }
  // Master kickne kohokoli (krom sebe); Officer jen řadové členy
  if (guild.isMaster || (guild.isOfficer && member.role === 'member')) {
    tools.push(<button key="k" className="guild-tool danger" title="Vyhodit z cechu" onClick={() => guild.kick(member.playerId)} disabled={guild.busy}>✖️</button>);
  }
  return tools.length ? <span className="guild-member-tools">{tools}</span> : null;
}

/* Nástroje důstojníka: čekající žádosti + pozvánka podle přezdívky. */
function OfficerTools({ guild }) {
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState('');

  const doInvite = async (e) => {
    e.preventDefault();
    if (!nick.trim()) return;
    const res = await guild.invite({ nickname: nick.trim() });
    if (res?.ok) { setNick(''); setMsg('✓ Pozvánka odeslána'); }
    else setMsg(res?.reason === 'no_target' ? 'Hráče nenašel.' : res?.reason === 'target_in_guild' ? 'Hráč už je v cechu.' : res?.reason === 'already_invited' ? 'Už jsi ho pozval.' : 'Nepovedlo se.');
  };

  return (
    <div className="guild-officer">
      <div className="guild-section-head">🎖️ Nástroje důstojníka</div>
      <form className="guild-invite-form" onSubmit={doInvite}>
        <input className="text-input" value={nick} onChange={(e) => { setNick(e.target.value); setMsg(''); }} placeholder="Pozvat podle přezdívky…" maxLength={24} />
        <button className="primary-btn sm" type="submit" disabled={guild.busy || !nick.trim()}>Pozvat</button>
      </form>
      {msg && <p className="guild-mini-msg">{msg}</p>}

      {guild.requests.length > 0 && (
        <div className="guild-requests">
          <div className="guild-subhead">Žádosti o vstup</div>
          {guild.requests.map((r) => (
            <div key={r.id} className="guild-request-row">
              <b>{r.nickname}</b>
              <span className="guild-row-actions">
                <button className="primary-btn sm" onClick={() => guild.respondRequest(r.id, true)} disabled={guild.busy}>Přijmout</button>
                <button className="ghost-btn sm" onClick={() => guild.respondRequest(r.id, false)} disabled={guild.busy}>Zamítnout</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* MOTD — důstojník edituje, ostatní jen čtou. */
function GuildMotd({ guild, motd }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(motd || '');

  const save = async () => { await guild.setMotd(text); setEditing(false); };

  if (editing) {
    return (
      <div className="guild-motd editing">
        <div className="guild-section-head">📣 Zpráva dne</div>
        <textarea className="text-input guild-motd-input" value={text} maxLength={GUILDS.motdMax} onChange={(e) => setText(e.target.value)} rows={3} />
        <div className="guild-row-actions">
          <button className="primary-btn sm" onClick={save} disabled={guild.busy}>Uložit</button>
          <button className="ghost-btn sm" onClick={() => { setText(motd || ''); setEditing(false); }}>Zrušit</button>
        </div>
      </div>
    );
  }
  return (
    <div className="guild-motd">
      <div className="guild-section-head">📣 Zpráva dne {guild.isOfficer && <button className="ghost-btn sm" onClick={() => setEditing(true)}>✏️ Upravit</button>}</div>
      <p className="guild-motd-text">{motd ? motd : <span className="dim">Zatím tu Mistr nic nevzkázal.</span>}</p>
    </div>
  );
}
