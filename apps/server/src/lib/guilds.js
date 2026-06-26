/* =========================================================================
   Datová vrstva CECHŮ — persistentní sociální skupina (jméno + [TAG] + roster)
   se sezónně resetovaným postavením a bounded perky.

   Klíčové vlastnosti (load-bearing):
     • IDENTITA (guilds, guild_members, guild_invites) PŘEŽÍVÁ sezónu; POSTAVENÍ
       (guild_season, guild_member_season) resetuje čerstvými řádky — stejný split
       jako players vs season_scores.
     • Všechny mutace rosteru jsou ATOMICKÉ: zamknou řádek `guilds` (FOR UPDATE)
       → souběžné invite/accept/kick nikdy nepřekročí strop členů ani nedvoj-připojí.
       Jeden cech na hráče drží `unique(player_id)` na guild_members (23505 → odmítnutí).
     • Brány jsou ATESTOVANÉ: založení vyžaduje players.highest_level ≥ foundLevel,
       vstup ≥ joinLevel (monotonní, plausibility-filtrované číslo žebříčku). Měnový
       sink (zakládací poplatek 💠) je KLIENTSKÝ jako celá ekonomika — server gateuje
       jen úroveň + per-IP strop zakládání (anti-squatting).
     • Tato vrstva NEpočítá postavení (Fáze 4) — jen roster a invarianty.
   ========================================================================= */
import {
  GUILDS, GUILD_ROLES, isGuildRole, guildMemberCap, guildPerks,
  guildLevelWeight, guildDpsWeight, guildLevelForContribution,
  validateGuildName, validateGuildTag, validateNickname,
} from '@ekiclicker/shared';
import { query, tx } from '../db.js';
import { getActiveSeason } from './players.js';

/* Pořadí rolí pro výpis rosteru (Mistr → Důstojník → Člen). */
const ROLE_ORDER = `case role when 'master' then 0 when 'officer' then 1 else 2 end`;

/* Aktuální úroveň cechu v AKTIVNÍ sezóně (default 1, dokud Fáze 4 nepočítá postavení).
   Slouží jen ke stropu členů + perkům. Bez aktivní sezóny → 1. */
async function activeGuildLevel(guildId) {
  const active = await getActiveSeason();
  if (!active) return 1;
  const { rows } = await query(
    'select level from guild_season where season_id = $1 and guild_id = $2',
    [active.id, guildId],
  );
  return rows[0]?.level ?? 1;
}

/* Plné sezónní postavení cechu (úroveň/příspěvek/boss/pořadí) pro pohledy. */
async function activeGuildStanding(guildId) {
  const active = await getActiveSeason();
  if (!active) return { level: 1, contribution: 0, bossDamage: 0, rank: null };
  const { rows } = await query(
    'select contribution, level, boss_damage from guild_season where season_id = $1 and guild_id = $2',
    [active.id, guildId],
  );
  const gs = rows[0];
  let rank = null;
  if (gs) {
    const rk = await query(
      'select 1 + count(*)::int as rank from guild_season where season_id = $1 and contribution > $2',
      [active.id, gs.contribution],
    );
    rank = rk.rows[0].rank;
  }
  return {
    level: gs?.level ?? 1,
    contribution: Number(gs?.contribution ?? 0),
    bossDamage: Number(gs?.boss_damage ?? 0),
    rank,
  };
}

/* Posledních N událostí feedu (přezdívky doplněny při čtení; null = smazaný účet). */
async function feedOf(guildId) {
  const { rows } = await query(
    `select gf.kind, gf.created_at, pa.nickname as actor, pt.nickname as target
       from guild_feed gf
       left join players pa on pa.id = gf.actor_id
       left join players pt on pt.id = gf.target_id
      where gf.guild_id = $1
      order by gf.created_at desc limit $2`,
    [guildId, GUILDS.feedLimit],
  );
  return rows.map((r) => ({ kind: r.kind, at: r.created_at, actor: r.actor, target: r.target }));
}

/* Zapiš událost do feedu (uvnitř transakce mutace rosteru). */
async function recordFeed(client, guildId, kind, actorId, targetId = null) {
  await client.query(
    'insert into guild_feed (guild_id, kind, actor_id, target_id) values ($1, $2, $3, $4)',
    [guildId, kind, actorId || null, targetId],
  );
}

/* =========================================================================
   POSTAVENÍ (server-side agregát ATESTOVANÝCH dat členů — zero trust surface)
   ========================================================================= */

/* Přepočti sezónní příspěvek cechu z atestovaných dat členů (úroveň + peakDps +
   světový boss). Vše log-bounded → jeden whale nezastíní aktivní cech a falešný
   save stejně neprojde plausibility filtrem žebříčku. Upsertne guild_season i
   per-člena guild_member_season. */
export async function recomputeGuildSeason(seasonId, guildId, nowMs = Date.now()) {
  const { rows } = await query(
    `select gm.player_id,
            coalesce(ss.highest_level, 1)   as highest_level,
            coalesce(ss.peak_dps, 0)        as peak_dps,
            coalesce(ss.hell_best_floor, 0) as hell_best_floor,
            coalesce(bd.dmg, 0)             as boss_damage
       from guild_members gm
       left join season_scores ss on ss.season_id = $1 and ss.player_id = gm.player_id
       left join (
         select wbc.player_id, sum(wbc.damage) as dmg
           from world_boss_contrib wbc
           join world_bosses wb on wb.id = wbc.boss_id and wb.season_id = $1
          group by wbc.player_id
       ) bd on bd.player_id = gm.player_id
      where gm.guild_id = $2`,
    [seasonId, guildId],
  );

  let totalContribution = 0;
  let totalBossDamage = 0;
  let totalHellFloors = 0; // KOLEKTIVNÍ postup cechu výtahem = součet rekordů členů
  const perMember = rows.map((r) => {
    const bossDmg = Number(r.boss_damage) || 0;
    const bossW = bossDmg > 0 ? Math.min(2, Math.log10(bossDmg + 1) / 3) : 0; // bounded boss term
    const c = guildLevelWeight(r.highest_level) + guildDpsWeight(r.peak_dps) + bossW;
    totalContribution += c;
    totalBossDamage += bossDmg;
    totalHellFloors += Number(r.hell_best_floor) || 0;
    return { playerId: r.player_id, contribution: c };
  });
  const level = guildLevelForContribution(totalContribution);

  await query(
    `insert into guild_season (season_id, guild_id, contribution, level, boss_damage, hell_floors, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (season_id, guild_id) do update
       set contribution = excluded.contribution, level = excluded.level,
           boss_damage = excluded.boss_damage, hell_floors = excluded.hell_floors,
           updated_at = excluded.updated_at`,
    [seasonId, guildId, totalContribution, level, totalBossDamage, totalHellFloors, new Date(nowMs)],
  );
  for (const m of perMember) {
    await query(
      `insert into guild_member_season (season_id, guild_id, player_id, contribution)
       values ($1, $2, $3, $4)
       on conflict (season_id, player_id) do update
         set contribution = excluded.contribution, guild_id = excluded.guild_id`,
      [seasonId, guildId, m.playerId, m.contribution],
    );
  }
  return { contribution: totalContribution, level };
}

/* Přepočítej jen když je guild_season starší než throttle (dedup napříč členy —
   model „compute on access" jako ensureActiveWorldBoss). */
export async function maybeRecomputeGuildSeason(seasonId, guildId, throttleMs = 30_000, nowMs = Date.now()) {
  const { rows } = await query(
    'select updated_at from guild_season where season_id = $1 and guild_id = $2',
    [seasonId, guildId],
  );
  const r = rows[0];
  if (r && nowMs - new Date(r.updated_at).getTime() < throttleMs) return null;
  return recomputeGuildSeason(seasonId, guildId, nowMs);
}

/* Force přepočet pro aktivní sezónu (po změně rosteru). Best-effort. */
async function recomputeForGuild(guildId, force = false) {
  const active = await getActiveSeason();
  if (!active) return;
  if (force) await recomputeGuildSeason(active.id, guildId);
  else await maybeRecomputeGuildSeason(active.id, guildId);
}

/* Cech hráče (pro piggyback přepočtu na /api/scores), nebo null. */
export async function guildIdOf(playerId) {
  const { rows } = await query('select guild_id from guild_members where player_id = $1', [playerId]);
  return rows[0]?.guild_id || null;
}

/* Členský řádek hráče (na kterém klientovi/serveru záleží), nebo null. */
async function membershipOf(playerId) {
  const { rows } = await query(
    'select guild_id, role from guild_members where player_id = $1',
    [playerId],
  );
  return rows[0] || null;
}

/* Roster cechu: hráči + role + nick, seřazeno dle role pak data vstupu. */
async function rosterOf(guildId) {
  const { rows } = await query(
    `select gm.player_id, gm.role, gm.joined_at, p.nickname
       from guild_members gm join players p on p.id = gm.player_id
      where gm.guild_id = $1
      order by ${ROLE_ORDER}, gm.joined_at asc`,
    [guildId],
  );
  return rows.map((r) => ({
    playerId: r.player_id, nickname: r.nickname, role: r.role, joinedAt: r.joined_at,
  }));
}

/* Veřejný tvar cechu (bez tokenů/save) — pro GET /api/guilds/:id i embed do /me. */
async function shapeGuild(guildRow) {
  const standing = await activeGuildStanding(guildRow.id);
  const level = standing.level;
  const roster = await rosterOf(guildRow.id);
  const feed = await feedOf(guildRow.id);
  return {
    id: guildRow.id,
    name: guildRow.name,
    tag: guildRow.tag,
    masterId: guildRow.master_id,
    motd: guildRow.motd || '',
    level,
    perks: guildPerks(level),
    memberCap: guildMemberCap(level),
    memberCount: roster.length,
    contribution: standing.contribution,
    bossDamage: standing.bossDamage,
    rank: standing.rank,
    foundedAt: guildRow.founded_at,
    roster,
    feed,
  };
}

/* Cech podle id (jen aktivní — disbanded_at is null), nebo null. */
async function getGuildRow(guildId) {
  const { rows } = await query(
    'select * from guilds where id = $1 and disbanded_at is null',
    [guildId],
  );
  return rows[0] || null;
}

/* =========================================================================
   ZALOŽENÍ
   ========================================================================= */

/* Založ cech. Gate: atestovaná highestLevel ≥ foundLevel + per-IP denní strop
   + unikátní jméno/TAG + hráč ještě není v cechu. Zakladatel = Master.
   Vrací { ok, guild } | { ok:false, reason, error? }. */
export async function createGuild(player, body, ip, nowMs = Date.now()) {
  const founderLevel = Number(player.highest_level) || 1;
  if (founderLevel < GUILDS.foundLevel) return { ok: false, reason: 'level', need: GUILDS.foundLevel };

  const vName = validateGuildName(body?.name);
  if (!vName.ok) return { ok: false, reason: 'name', error: vName.error };
  const vTag = validateGuildTag(body?.tag);
  if (!vTag.ok) return { ok: false, reason: 'tag', error: vTag.error };

  const nameCi = vName.value.toLowerCase();
  const tagCi = vTag.value; // už VELKÁ z validátoru

  // per-IP strop zakládání (anti-squatting) — precedent perIpDailyAccountCap
  if (ip) {
    const { rows } = await query(
      `select count(*)::int as c from guilds
        where founder_ip = $1 and founded_at > $2`,
      [ip, new Date(nowMs - 24 * 3600_000)],
    );
    if ((rows[0]?.c ?? 0) >= GUILDS.perIpDailyGuildCap) return { ok: false, reason: 'ip_cap' };
  }

  const res = await tx(async (client) => {
    // hráč už v cechu? (rychlá čistá chyba; tvrdou invariantu drží unique níže)
    const mine = await client.query('select 1 from guild_members where player_id = $1', [player.id]);
    if (mine.rows[0]) return { ok: false, reason: 'already_in_guild' };

    let guild;
    try {
      const ins = await client.query(
        `insert into guilds (name, name_ci, tag, tag_ci, master_id, founder_ip)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [vName.value, nameCi, vTag.value, tagCi, player.id, ip || null],
      );
      guild = ins.rows[0];
      await client.query(
        `insert into guild_members (guild_id, player_id, role) values ($1, $2, 'master')`,
        [guild.id, player.id],
      );
      await recordFeed(client, guild.id, 'found', player.id);
    } catch (err) {
      if (err.code === '23505') {
        // unikát: name_ci / tag_ci / player_id
        const reason = /tag/.test(err.constraint || '') ? 'tag_taken'
          : /player/.test(err.constraint || '') ? 'already_in_guild' : 'name_taken';
        return { ok: false, reason };
      }
      throw err;
    }
    return { ok: true, guildRow: guild };
  });
  if (!res.ok) return res;
  // seed sezónního postavení (po commitu — recompute běží na vlastním spojení)
  try { await recomputeForGuild(res.guildRow.id, true); } catch { /* best-effort */ }
  return { ok: true, guild: await shapeGuild(res.guildRow) };
}

/* =========================================================================
   POHLEDY
   ========================================================================= */

/* Veřejný profil cechu. Vrací { ok, guild } | { ok:false, reason:'gone' }. */
export async function getGuildView(guildId) {
  const row = await getGuildRow(guildId);
  if (!row) return { ok: false, reason: 'gone' };
  return { ok: true, guild: await shapeGuild(row) };
}

/* Můj cechový stav: členství/role/roster/perky + příchozí pozvánky + (pro důstojníka)
   čekající žádosti. Bez cechu → guild:null + jen moje pozvánky. */
export async function getMyGuild(playerId) {
  const mem = await membershipOf(playerId);

  // příchozí pozvánky NA MĚ (vždy, i bez cechu)
  const invRes = await query(
    `select gi.id, gi.guild_id, gi.created_at, g.name, g.tag, p.nickname as by_nick
       from guild_invites gi
       join guilds g on g.id = gi.guild_id and g.disbanded_at is null
       join players p on p.id = gi.created_by
      where gi.player_id = $1 and gi.kind = 'invite' and gi.status = 'pending'
      order by gi.created_at desc`,
    [playerId],
  );
  const invites = invRes.rows.map((r) => ({
    id: r.id, guildId: r.guild_id, guildName: r.name, guildTag: r.tag,
    by: r.by_nick, createdAt: r.created_at,
  }));

  if (!mem) {
    return { ok: true, guild: null, role: null, roster: [], invites, requests: [] };
  }

  const row = await getGuildRow(mem.guild_id);
  if (!row) return { ok: true, guild: null, role: null, roster: [], invites, requests: [] };
  // compute-on-access: pokud je postavení zatuchlé, přepočti (throttle dedupuje členy)
  const active = await getActiveSeason();
  if (active) { try { await maybeRecomputeGuildSeason(active.id, mem.guild_id); } catch { /* best-effort */ } }
  const guild = await shapeGuild(row);

  // čekající ŽÁDOSTI o vstup (vidí jen Master/Officer)
  let requests = [];
  if (mem.role === 'master' || mem.role === 'officer') {
    const reqRes = await query(
      `select gi.id, gi.player_id, gi.created_at, p.nickname
         from guild_invites gi join players p on p.id = gi.player_id
        where gi.guild_id = $1 and gi.kind = 'request' and gi.status = 'pending'
        order by gi.created_at asc`,
      [mem.guild_id],
    );
    requests = reqRes.rows.map((r) => ({
      id: r.id, playerId: r.player_id, nickname: r.nickname, createdAt: r.created_at,
    }));
  }

  return { ok: true, guild, role: mem.role, roster: guild.roster, invites, requests };
}

/* Hráč podle přezdívky (pro pozvánku „podle nicku") — { id, nickname } | null. */
export async function findPlayerByNickname(nick) {
  const v = validateNickname(nick);
  if (!v.ok) return null;
  const { rows } = await query(
    'select id, nickname from players where nickname_ci = $1',
    [v.value.toLowerCase()],
  );
  return rows[0] || null;
}

/* Žebříček cechů — aktivní cechy řazené dle sezónního PŘÍSPĚVKU (server-agregát).
   Cechy bez postavení (nově založené / prázdná sezóna) padají na konec dle velikosti. */
export async function guildLeaderboard(limit = 50, seasonId = null) {
  const active = seasonId ? { id: seasonId } : await getActiveSeason();
  if (!active) {
    const { rows } = await query(
      `select g.id, g.name, g.tag, g.master_id,
              (select count(*)::int from guild_members gm where gm.guild_id = g.id) as members
         from guilds g where g.disbanded_at is null
        order by members desc, g.founded_at asc limit $1`,
      [Math.min(100, Math.max(1, Number(limit) || 50))],
    );
    return rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, tag: r.tag, masterId: r.master_id, memberCount: r.members, contribution: 0, level: 1 }));
  }
  const { rows } = await query(
    `select g.id, g.name, g.tag, g.master_id,
            coalesce(gs.contribution, 0) as contribution,
            coalesce(gs.level, 1)        as level,
            (select count(*)::int from guild_members gm where gm.guild_id = g.id) as members
       from guilds g
       left join guild_season gs on gs.season_id = $1 and gs.guild_id = g.id
      where g.disbanded_at is null
      order by gs.contribution desc nulls last, members desc, g.founded_at asc
      limit $2`,
    [active.id, Math.min(100, Math.max(1, Number(limit) || 50))],
  );
  return rows.map((r, i) => ({
    rank: i + 1, id: r.id, name: r.name, tag: r.tag, masterId: r.master_id,
    memberCount: r.members, contribution: Number(r.contribution), level: r.level,
  }));
}

/* =========================================================================
   ŽEBŘÍČEK PEKELNÉHO VÝTAHU — KOLEKTIVNÍ (pro hlavní žebříčkovou sekci, scope='guild').
   Řadí AKTIVNÍ cechy dle guild_season.hell_floors = SOUČET rekordů (hell_best_floor)
   členů → „kolektivní postup cechu". Tvar řádku sjednocen s ostatními žebříčky
   (id = cech, nickname = jméno cechu, tag = [TAG], value = patra) → stejná tabulka.
   ========================================================================= */
export async function guildHellLeaderboardSeason(seasonId, limit) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const { rows } = await query(
    `select g.id, g.name, g.tag,
            coalesce(gs.hell_floors, 0) as hell_floors,
            (select count(*)::int from guild_members gm where gm.guild_id = g.id) as members
       from guilds g
       left join guild_season gs on gs.season_id = $1 and gs.guild_id = g.id
      where g.disbanded_at is null and coalesce(gs.hell_floors, 0) > 0
      order by gs.hell_floors desc nulls last, members desc, g.founded_at asc
      limit $2`,
    [seasonId, lim],
  );
  return rows.map((r, i) => ({
    rank: i + 1, id: r.id, nickname: r.name, tag: r.tag,
    value: Number(r.hell_floors) || 0, memberCount: r.members,
  }));
}

/* Kolektivní patra cechu hráče + jeho rank v žebříčku výtahu dané sezóny.
   null když hráč není v cechu nebo cech nemá záznam (0 pater). */
export async function playerGuildHellRank(seasonId, playerId) {
  const guildId = await guildIdOf(playerId);
  if (!guildId) return null;
  const { rows } = await query(
    `with me as (
       select g.name, g.tag, coalesce(gs.hell_floors, 0) as hf
         from guilds g
         left join guild_season gs on gs.season_id = $1 and gs.guild_id = g.id
        where g.id = $2 and g.disbanded_at is null
     )
     select (select name from me) as name, (select tag from me) as tag,
            (select hf from me) as value,
            case when (select hf from me) is null or (select hf from me) <= 0 then null
                 else 1 + (select count(*)::int from guild_season
                            where season_id = $1 and hell_floors > (select hf from me)) end as rank`,
    [seasonId, guildId],
  );
  const r = rows[0];
  if (!r || r.rank == null) return null;
  return { rank: r.rank, id: guildId, nickname: r.name, tag: r.tag, value: Number(r.value) || 0 };
}

/* =========================================================================
   POZVÁNKY / ŽÁDOSTI / VSTUP
   ========================================================================= */

/* Společný ATOMICKÝ vstup hráče do cechu (z přijaté pozvánky i schválené žádosti).
   Zamkne guilds(id) → kontrola stropu + jednoho-cechu je serializovaná. */
async function joinAtomic(client, guildId, playerId) {
  const g = await client.query(
    'select id from guilds where id = $1 and disbanded_at is null for update',
    [guildId],
  );
  if (!g.rows[0]) return { ok: false, reason: 'gone' };

  const already = await client.query('select 1 from guild_members where player_id = $1', [playerId]);
  if (already.rows[0]) return { ok: false, reason: 'already_in_guild' };

  const cnt = await client.query('select count(*)::int as c from guild_members where guild_id = $1', [guildId]);
  const level = await activeGuildLevel(guildId);
  if ((cnt.rows[0]?.c ?? 0) >= guildMemberCap(level)) return { ok: false, reason: 'full' };

  try {
    await client.query(
      `insert into guild_members (guild_id, player_id, role) values ($1, $2, 'member')`,
      [guildId, playerId],
    );
  } catch (err) {
    if (err.code === '23505') return { ok: false, reason: 'already_in_guild' };
    throw err;
  }
  // zruš VŠECHNY ostatní čekající pozvánky/žádosti hráče (přijatou vyřeší volající)
  await client.query(
    `update guild_invites set status = 'declined'
      where player_id = $1 and status = 'pending'`,
    [playerId],
  );
  return { ok: true };
}

/* Master/Officer pozve hráče. Vrací { ok } | { ok:false, reason }. */
export async function invite(guildId, byPlayerId, targetPlayerId) {
  if (!targetPlayerId) return { ok: false, reason: 'no_target' };
  const by = await membershipOf(byPlayerId);
  if (!by || by.guild_id !== guildId) return { ok: false, reason: 'not_member' };
  if (by.role !== 'master' && by.role !== 'officer') return { ok: false, reason: 'forbidden' };

  const target = await membershipOf(targetPlayerId);
  if (target) return { ok: false, reason: 'target_in_guild' };
  const exists = await query('select 1 from players where id = $1', [targetPlayerId]);
  if (!exists.rows[0]) return { ok: false, reason: 'no_target' };

  let inviteId;
  try {
    const ins = await query(
      `insert into guild_invites (guild_id, player_id, kind, created_by)
       values ($1, $2, 'invite', $3) returning id`,
      [guildId, targetPlayerId, byPlayerId],
    );
    inviteId = ins.rows[0].id;
  } catch (err) {
    if (err.code === '23505') return { ok: false, reason: 'already_invited' };
    throw err;
  }

  // doruč pozvánku i do SCHRÁNKY jako akční zprávu (přijmout/odmítnout). Best-effort —
  // selhání zápisu schránky nesmí shodit pozvánku (záložka cechu ji ukáže i tak).
  try {
    const g = (await query('select name, tag from guilds where id = $1', [guildId])).rows[0];
    if (g) {
      await query(
        `insert into mail (recipient_id, sender_id, kind, subject, payload)
         values ($1, $2, 'guild_invite', $3, $4::jsonb)`,
        [
          targetPlayerId, byPlayerId, `Pozvánka do cechu [${g.tag}] ${g.name}`,
          JSON.stringify({ inviteId, guildId, guildName: g.name, guildTag: g.tag }),
        ],
      );
    }
  } catch { /* best-effort — pozvánka platí i bez zrcadla ve schránce */ }
  return { ok: true };
}

/* Pozvaný hráč odpoví na pozvánku. accept=true → atomický vstup. */
export async function respondInvite(inviteId, playerId, accept) {
  const res = await tx(async (client) => {
    const inv = (await client.query(
      `select * from guild_invites where id = $1 and kind = 'invite' and status = 'pending' for update`,
      [inviteId],
    )).rows[0];
    if (!inv) return { ok: false, reason: 'gone' };
    if (inv.player_id !== playerId) return { ok: false, reason: 'forbidden' };

    if (!accept) {
      await client.query(`update guild_invites set status = 'declined' where id = $1`, [inviteId]);
      return { ok: true, joined: false };
    }
    const joined = await joinAtomic(client, inv.guild_id, playerId);
    if (!joined.ok) return joined;
    // joinAtomic zneplatnil všechny pending — tuhle označ accepted
    await client.query(`update guild_invites set status = 'accepted' where id = $1`, [inviteId]);
    await recordFeed(client, inv.guild_id, 'join', playerId);
    return { ok: true, joined: true, guildId: inv.guild_id };
  });
  if (res.ok && res.joined && res.guildId) {
    try { await recomputeForGuild(res.guildId, true); } catch { /* best-effort */ }
  }
  return res;
}

/* Hráč ≥ joinLevel požádá o vstup. Vrací { ok } | { ok:false, reason }. */
export async function request(guildId, player) {
  if ((Number(player.highest_level) || 1) < GUILDS.joinLevel) {
    return { ok: false, reason: 'level', need: GUILDS.joinLevel };
  }
  const mine = await membershipOf(player.id);
  if (mine) return { ok: false, reason: 'already_in_guild' };
  const g = await getGuildRow(guildId);
  if (!g) return { ok: false, reason: 'gone' };
  // strop už plný? (měkká kontrola; tvrdou drží joinAtomic při schválení)
  const cnt = await query('select count(*)::int as c from guild_members where guild_id = $1', [guildId]);
  const level = await activeGuildLevel(guildId);
  if ((cnt.rows[0]?.c ?? 0) >= guildMemberCap(level)) return { ok: false, reason: 'full' };

  try {
    await query(
      `insert into guild_invites (guild_id, player_id, kind, created_by)
       values ($1, $2, 'request', $2)`,
      [guildId, player.id],
    );
  } catch (err) {
    if (err.code === '23505') return { ok: false, reason: 'already_requested' };
    throw err;
  }
  return { ok: true };
}

/* Master/Officer schválí/zamítne žádost. approve=true → atomický vstup. */
export async function respondRequest(inviteId, officerId, approve) {
  const res = await tx(async (client) => {
    const reqRow = (await client.query(
      `select * from guild_invites where id = $1 and kind = 'request' and status = 'pending' for update`,
      [inviteId],
    )).rows[0];
    if (!reqRow) return { ok: false, reason: 'gone' };

    const by = (await client.query(
      'select role from guild_members where player_id = $1 and guild_id = $2',
      [officerId, reqRow.guild_id],
    )).rows[0];
    if (!by) return { ok: false, reason: 'not_member' };
    if (by.role !== 'master' && by.role !== 'officer') return { ok: false, reason: 'forbidden' };

    if (!approve) {
      await client.query(`update guild_invites set status = 'declined' where id = $1`, [inviteId]);
      return { ok: true, joined: false };
    }
    const joined = await joinAtomic(client, reqRow.guild_id, reqRow.player_id);
    if (!joined.ok) return joined;
    await client.query(`update guild_invites set status = 'accepted' where id = $1`, [inviteId]);
    await recordFeed(client, reqRow.guild_id, 'join', reqRow.player_id);
    return { ok: true, joined: true, guildId: reqRow.guild_id };
  });
  if (res.ok && res.joined && res.guildId) {
    try { await recomputeForGuild(res.guildId, true); } catch { /* best-effort */ }
  }
  return res;
}

/* =========================================================================
   SPRÁVA ROSTERU
   ========================================================================= */

/* Officer vyhodí člena; Officera smí vyhodit jen Master. Mistra vyhodit nelze. */
export async function kick(guildId, byPlayerId, targetPlayerId) {
  if (byPlayerId === targetPlayerId) return { ok: false, reason: 'self' };
  const res = await tx(async (client) => {
    const g = await client.query(
      'select id from guilds where id = $1 and disbanded_at is null for update',
      [guildId],
    );
    if (!g.rows[0]) return { ok: false, reason: 'gone' };

    const by = (await client.query(
      'select role from guild_members where guild_id = $1 and player_id = $2', [guildId, byPlayerId],
    )).rows[0];
    if (!by) return { ok: false, reason: 'not_member' };
    if (by.role !== 'master' && by.role !== 'officer') return { ok: false, reason: 'forbidden' };

    const target = (await client.query(
      'select role from guild_members where guild_id = $1 and player_id = $2', [guildId, targetPlayerId],
    )).rows[0];
    if (!target) return { ok: false, reason: 'not_in_guild' };
    if (target.role === 'master') return { ok: false, reason: 'cannot_kick_master' };
    if (target.role === 'officer' && by.role !== 'master') return { ok: false, reason: 'forbidden' };

    await client.query('delete from guild_members where guild_id = $1 and player_id = $2', [guildId, targetPlayerId]);
    await recordFeed(client, guildId, 'kick', byPlayerId, targetPlayerId);
    return { ok: true };
  });
  if (res.ok) { try { await recomputeForGuild(guildId, true); } catch { /* best-effort */ } }
  return res;
}

/* Člen odejde sám. Master musí nejdřív přenést titul (nebo rozpustit cech). */
export async function leave(guildId, playerId) {
  const res = await tx(async (client) => {
    const g = await client.query(
      'select id from guilds where id = $1 and disbanded_at is null for update',
      [guildId],
    );
    if (!g.rows[0]) return { ok: false, reason: 'gone' };
    const me = (await client.query(
      'select role from guild_members where guild_id = $1 and player_id = $2', [guildId, playerId],
    )).rows[0];
    if (!me) return { ok: false, reason: 'not_member' };
    if (me.role === 'master') return { ok: false, reason: 'master_must_transfer' };
    await client.query('delete from guild_members where guild_id = $1 and player_id = $2', [guildId, playerId]);
    await recordFeed(client, guildId, 'leave', playerId);
    return { ok: true };
  });
  if (res.ok) { try { await recomputeForGuild(guildId, true); } catch { /* best-effort */ } }
  return res;
}

/* Master povýší/sníží člena (jen 'officer' | 'member'; ne 'master' — to je transfer). */
export async function setRole(guildId, byMasterId, targetPlayerId, role) {
  if (!isGuildRole(role) || role === 'master') return { ok: false, reason: 'bad_role' };
  if (byMasterId === targetPlayerId) return { ok: false, reason: 'self' };
  return tx(async (client) => {
    const g = await client.query(
      'select master_id from guilds where id = $1 and disbanded_at is null for update', [guildId],
    );
    if (!g.rows[0]) return { ok: false, reason: 'gone' };
    if (g.rows[0].master_id !== byMasterId) return { ok: false, reason: 'forbidden' };

    const target = (await client.query(
      'select role from guild_members where guild_id = $1 and player_id = $2', [guildId, targetPlayerId],
    )).rows[0];
    if (!target) return { ok: false, reason: 'not_in_guild' };
    if (target.role === 'master') return { ok: false, reason: 'is_master' };

    await client.query(
      'update guild_members set role = $3 where guild_id = $1 and player_id = $2',
      [guildId, targetPlayerId, role],
    );
    await recordFeed(client, guildId, role === 'officer' ? 'promote' : 'demote', byMasterId, targetPlayerId);
    return { ok: true };
  });
}

/* Přenos titulu Mistra: nový člen → 'master', starý Mistr → 'officer'. */
export async function transferMaster(guildId, byMasterId, targetPlayerId) {
  if (byMasterId === targetPlayerId) return { ok: false, reason: 'self' };
  return tx(async (client) => {
    const g = await client.query(
      'select master_id from guilds where id = $1 and disbanded_at is null for update', [guildId],
    );
    if (!g.rows[0]) return { ok: false, reason: 'gone' };
    if (g.rows[0].master_id !== byMasterId) return { ok: false, reason: 'forbidden' };

    const target = (await client.query(
      'select 1 from guild_members where guild_id = $1 and player_id = $2', [guildId, targetPlayerId],
    )).rows[0];
    if (!target) return { ok: false, reason: 'not_in_guild' };

    await client.query(`update guild_members set role = 'master' where guild_id = $1 and player_id = $2`, [guildId, targetPlayerId]);
    await client.query(`update guild_members set role = 'officer' where guild_id = $1 and player_id = $2`, [guildId, byMasterId]);
    await client.query('update guilds set master_id = $2 where id = $1', [guildId, targetPlayerId]);
    await recordFeed(client, guildId, 'transfer', byMasterId, targetPlayerId);
    return { ok: true };
  });
}

/* Master rozpustí cech (soft-delete) — kaskáda smaže členy/pozvánky. */
export async function disband(guildId, byMasterId) {
  return tx(async (client) => {
    const g = await client.query(
      'select master_id from guilds where id = $1 and disbanded_at is null for update', [guildId],
    );
    if (!g.rows[0]) return { ok: false, reason: 'gone' };
    if (g.rows[0].master_id !== byMasterId) return { ok: false, reason: 'forbidden' };
    await client.query('update guilds set disbanded_at = now() where id = $1', [guildId]);
    // kaskáda na členství/pozvánky (FK on delete cascade je na delete; tady soft-delete →
    // smaž členství ručně, ať uvolníš unique(player_id) pro budoucí cechy)
    await client.query('delete from guild_members where guild_id = $1', [guildId]);
    await client.query(`update guild_invites set status = 'declined' where guild_id = $1 and status = 'pending'`, [guildId]);
    return { ok: true };
  });
}

/* Master/Officer nastaví MOTD (asynchronní „zpráva dne"). */
export async function setMotd(guildId, byPlayerId, motdRaw) {
  const motd = String(motdRaw ?? '').slice(0, GUILDS.motdMax);
  const by = await membershipOf(byPlayerId);
  if (!by || by.guild_id !== guildId) return { ok: false, reason: 'not_member' };
  if (by.role !== 'master' && by.role !== 'officer') return { ok: false, reason: 'forbidden' };
  await query('update guilds set motd = $2 where id = $1 and disbanded_at is null', [guildId, motd]);
  return { ok: true, motd };
}

export { GUILD_ROLES };
