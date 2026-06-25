/* =========================================================================
   Datová vrstva SVĚTOVÉHO BOSSE — sdílený sezónní kooperativní boss.

   Klíčové vlastnosti:
     • Spawn i finalizace odměn řeší TADY server (žádný cron). `ensureActiveWorldBoss`
       je idempotentní: vrátí běžícího bosse, nebo (po deadline / respawn pauze)
       založí dalšího. Partial unique index `world_bosses_one_active` brání souběhu.
     • `applyHit` je ATOMICKÝ (SELECT … FOR UPDATE na řádku bosse) → HP se nikdy
       „nepřeprodá". Poškození serveru počítá z ATESTOVANÉHO peakDps hráče (sezónní
       řádek prošel plausibility filtrem) → klient nemůže poslat libovolný damage.
     • Cooldown úderů (last_hit_at) i per-hráč strop (perPlayerCapFrac) drží boss
       kooperativní a odolný proti spamu.
   ========================================================================= */
import {
  WORLD_BOSS, worldBossName, worldBossSalvoDamage, worldBossReward,
} from '@ekiclicker/shared';
import { query, tx } from '../db.js';

const ms = (t) => new Date(t).getTime();

/* DB řádek → tvar pro klienta (camelCase, čísla). */
function shapeBoss(b) {
  return {
    id: b.id,
    number: b.number,
    name: b.name,
    emoji: b.emoji,
    status: b.status,
    maxHp: Number(b.max_hp),
    hp: Math.max(0, Number(b.hp)),
    startedAt: b.started_at,
    endsAt: b.ends_at,
    endedAt: b.ended_at,
  };
}

/* Uzavři bosse (defeated/expired) a spočti odměny podle pořadí příspěvku.
   Běží uvnitř transakce volajícího (dostane `client`). */
async function finalizeBoss(client, boss, outcome, nowMs) {
  await client.query(
    `update world_bosses set status = $2, ended_at = $3 where id = $1`,
    [boss.id, outcome, new Date(nowMs)],
  );
  // pořadí dle příspěvku (remíza = dřívější poslední úder)
  const { rows } = await client.query(
    `select player_id from world_boss_contrib
      where boss_id = $1 order by damage desc, last_hit_at asc`,
    [boss.id],
  );
  for (let i = 0; i < rows.length; i++) {
    const { doves, dust } = worldBossReward(i + 1, outcome);
    await client.query(
      `update world_boss_contrib set reward_doves = $2, reward_dust = $3
        where boss_id = $1 and player_id = $4`,
      [boss.id, doves, dust, rows[i].player_id],
    );
  }
}

/* Vrátí „aktuálního" bosse sezóny: běžícího, nebo nedávno skončilého (vítězná/
   úniková obrazovka v respawn pauze), nebo čerstvě spawnutého. Idempotentní. */
export async function ensureActiveWorldBoss(seasonId, nowMs = Date.now()) {
  return tx(async (client) => {
    const { rows } = await client.query(
      `select * from world_bosses where season_id = $1 order by number desc limit 1 for update`,
      [seasonId],
    );
    let latest = rows[0] || null;

    // běžící boss po deadline → vyprší (expired) a spočítají se útěšné odměny
    if (latest && latest.status === 'active' && nowMs >= ms(latest.ends_at)) {
      await finalizeBoss(client, latest, 'expired', nowMs);
      latest = (await client.query('select * from world_bosses where id = $1', [latest.id])).rows[0];
    }

    if (latest && latest.status === 'active') return latest; // pořád běží

    // nedávno skončil → ukaž ho (respawn pauza = okno na vítěznou obrazovku)
    if (latest && latest.ended_at && nowMs - ms(latest.ended_at) < WORLD_BOSS.respawnDelayMs) {
      return latest;
    }

    // spawn dalšího
    const number = latest ? latest.number + 1 : 1;
    const { name, emoji } = worldBossName(number);
    const endsAt = new Date(nowMs + WORLD_BOSS.durationMs);
    const ins = await client.query(
      `insert into world_bosses (season_id, number, name, emoji, max_hp, hp, ends_at)
       values ($1, $2, $3, $4, $5, $5, $6)
       on conflict (season_id) where status = 'active' do nothing
       returning *`,
      [seasonId, number, name, emoji, WORLD_BOSS.baseHp, endsAt],
    );
    if (ins.rows[0]) return ins.rows[0];
    // souběžný spawn vyhrál → vrať aktuálně aktivního
    const active = await client.query(
      `select * from world_bosses where season_id = $1 and status = 'active' limit 1`,
      [seasonId],
    );
    return active.rows[0] || latest;
  });
}

/* Hráč udeří. ATOMICKY: zamkne řádek bosse, ověří stav/cooldown/strop, spočítá
   poškození z peakDps a ubere HP. Vrátí { ok, dmg, defeated } nebo { ok:false, reason }.

   `effort` ∈ [0,1] = kolik svého (boundovaného) stropu salvy hráč „nabil" interaktivně
   (údery + zbraně v klientu). Strop salvy je pořád dán ATESTOVANÝM peakDps, takže
   effort jen škáluje DOLŮ — poslat 1 = dosáhnout stejného maxima jako dosud,
   žádná nová díra pro cheaty. Spodní mez 0,1, ať salva vždy něco udělá. */
export async function applyHit(bossId, playerId, peakDps, nowMs = Date.now(), effort = 1) {
  const eff = Math.min(1, Math.max(0.1, Number(effort) || 0));
  return tx(async (client) => {
    const { rows } = await client.query('select * from world_bosses where id = $1 for update', [bossId]);
    const b = rows[0];
    if (!b || b.status !== 'active') return { ok: false, reason: 'not_active' };
    if (nowMs >= ms(b.ends_at)) {
      await finalizeBoss(client, b, 'expired', nowMs);
      return { ok: false, reason: 'expired' };
    }

    const cr = await client.query(
      'select * from world_boss_contrib where boss_id = $1 and player_id = $2 for update',
      [bossId, playerId],
    );
    const c = cr.rows[0] || null;
    if (c && nowMs - ms(c.last_hit_at) < WORLD_BOSS.salvoCooldownMs) {
      return { ok: false, reason: 'cooldown', cooldownMs: WORLD_BOSS.salvoCooldownMs - (nowMs - ms(c.last_hit_at)) };
    }

    const maxHp = Number(b.max_hp);
    const hp = Number(b.hp);
    const already = c ? Number(c.damage) : 0;
    const room = Math.max(0, maxHp * WORLD_BOSS.perPlayerCapFrac - already);
    if (room <= 0) return { ok: false, reason: 'capped' };

    let dmg = Math.max(1, Math.ceil(worldBossSalvoDamage(maxHp, peakDps) * eff));
    dmg = Math.min(dmg, hp, room);
    if (dmg <= 0) return { ok: false, reason: 'capped' };

    await client.query(
      `insert into world_boss_contrib (boss_id, player_id, damage, hits, last_hit_at)
       values ($1, $2, $3, 1, $4)
       on conflict (boss_id, player_id) do update set
         damage = world_boss_contrib.damage + $3,
         hits = world_boss_contrib.hits + 1,
         last_hit_at = $4`,
      [bossId, playerId, dmg, new Date(nowMs)],
    );
    const newHp = hp - dmg;
    await client.query('update world_bosses set hp = $2 where id = $1', [bossId, newHp]);

    let defeated = false;
    if (newHp <= 0) {
      defeated = true;
      await finalizeBoss(client, b, 'defeated', nowMs);
    }
    return { ok: true, dmg, defeated };
  });
}

/* Kompletní pohled pro klienta: boss + top přispěvatelé + počet „právě bojujících"
   + můj příspěvek/cooldown + nevyzvednutá odměna napříč sezónou. */
export async function getWorldBossView(seasonId, playerId, nowMs = Date.now()) {
  const boss = await ensureActiveWorldBoss(seasonId, nowMs);

  const topRes = await query(
    `select c.player_id, c.damage, p.nickname
       from world_boss_contrib c join players p on p.id = c.player_id
      where c.boss_id = $1 order by c.damage desc, c.last_hit_at asc limit 10`,
    [boss.id],
  );
  const top = topRes.rows.map((r, i) => ({
    rank: i + 1, id: r.player_id, nickname: r.nickname, damage: Number(r.damage),
  }));

  const fightersRes = await query(
    'select count(*)::int as n from world_boss_contrib where boss_id = $1 and last_hit_at > $2',
    [boss.id, new Date(nowMs - WORLD_BOSS.fighterWindowMs)],
  );
  const fighters = fightersRes.rows[0].n;

  let me = null;
  let unclaimed = null;
  if (playerId) {
    const cr = await query(
      'select * from world_boss_contrib where boss_id = $1 and player_id = $2',
      [boss.id, playerId],
    );
    const c = cr.rows[0] || null;
    if (c) {
      const rankRes = await query(
        `select 1 + count(*)::int as rank from world_boss_contrib
          where boss_id = $1 and (damage > $2 or (damage = $2 and last_hit_at < $3))`,
        [boss.id, c.damage, c.last_hit_at],
      );
      me = {
        damage: Number(c.damage),
        hits: c.hits,
        rank: rankRes.rows[0].rank,
        cooldownMs: Math.max(0, WORLD_BOSS.salvoCooldownMs - (nowMs - ms(c.last_hit_at))),
      };
    } else {
      me = { damage: 0, hits: 0, rank: null, cooldownMs: 0 };
    }

    const ur = await query(
      `select coalesce(sum(c.reward_doves), 0)::int as doves,
              coalesce(sum(c.reward_dust), 0)::int as dust,
              count(*)::int as n
         from world_boss_contrib c join world_bosses b on b.id = c.boss_id
        where b.season_id = $1 and c.player_id = $2
          and c.reward_doves is not null and c.claimed_at is null`,
      [seasonId, playerId],
    );
    if (ur.rows[0].n > 0) unclaimed = { doves: ur.rows[0].doves, dust: ur.rows[0].dust, count: ur.rows[0].n };
  }

  return { boss: shapeBoss(boss), top, fighters, me, unclaimed };
}

/* Vyzvedni všechny spočtené (a dosud nevyzvednuté) odměny hráče za bosse SEZÓNY.
   Idempotentní (claimed_at se nastaví jen poprvé). Vrací souhrn { doves, dust, count }. */
export async function claimWorldBossRewards(seasonId, playerId) {
  const { rows } = await query(
    `update world_boss_contrib c set claimed_at = now()
       from world_bosses b
      where b.id = c.boss_id and b.season_id = $1 and c.player_id = $2
        and c.reward_doves is not null and c.claimed_at is null
      returning c.reward_doves, c.reward_dust`,
    [seasonId, playerId],
  );
  const doves = rows.reduce((a, r) => a + r.reward_doves, 0);
  const dust = rows.reduce((a, r) => a + r.reward_dust, 0);
  return { doves, dust, count: rows.length };
}
