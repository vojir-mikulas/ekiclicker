/* =========================================================================
   Datová vrstva ARÉNY / PŘEPADŮ — asynchronní PvP nájezdy na DUCHY offline hráčů.

   Klíčové vlastnosti (load-bearing):
     • `resolveRaid` je ATOMICKÝ (SELECT … FOR UPDATE na obou řádcích raid_state)
       → trezor se nikdy „nepřeprodá". Výsledek počítá SERVER z ATESTOVANÉHO
       sezónního peakDps obou hráčů + taktiky + hodu → klient netvrdí „vyhrál jsem".
     • Krade se jen z TREZORU (raid_state.vault_*), který drží SERVER → krádež
       „drží" i u offline oběti (její lokální save je nedotčený a nemůže ji přepsat).
     • Trezor je WITHDRAW-ONLY: plní ho `skimVaultGold` (zlato z atest. postupu)
       + uloupený lup; klient ho jen VYBÍRÁ. Žádný „deposit" → nejde prát falešné zlato.
     • Matchmaking páruje podle peakDps (férové, vyrovnané souboje); rating je jen
       žebříček arény. Štít po vyloupení + cooldowny + denní strop drží přepady fér.
   ========================================================================= */
import {
  RAIDS, isRaidTactic, tacticOutcome, raidPower, raidEffectivePower, raidWinProb,
  raidRatingDelta, raidStolenLoot, raidWinBonus, raidVaultGoldTarget, DEFAULT_DEFENSE_TACTIC,
} from '@ekiclicker/shared';
import { query, tx } from '../db.js';
import { rowToScore } from './players.js';

const ms = (t) => new Date(t).getTime();

/* DB řádek raid_state → tvar pro klienta (camelCase, čísla). */
function shapeState(r, nowMs) {
  return {
    rating: r.rating,
    wins: r.wins,
    losses: r.losses,
    raidedCount: r.raided_count,
    streak: r.streak,
    bestStreak: r.best_streak,
    vault: { gold: Number(r.vault_gold), doves: r.vault_doves, dust: r.vault_dust },
    defenseTactic: r.defense_tactic,
    shieldMs: r.shield_until ? Math.max(0, ms(r.shield_until) - nowMs) : 0,
    cooldownMs: r.last_raid_at ? Math.max(0, RAIDS.raidCooldownMs - (nowMs - ms(r.last_raid_at))) : 0,
    dailyLeft: Math.max(0, RAIDS.dailyRaidCap - dailyCountNow(r, nowMs)),
  };
}

/* Aktuální denní počet (po případném vypršení okna je 0). */
function dailyCountNow(r, nowMs) {
  if (!r.daily_reset_at || nowMs >= ms(r.daily_reset_at)) return 0;
  return r.daily_count;
}

/* Založ defaultní řádek arény (idempotentně). */
async function ensureRow(client, seasonId, playerId) {
  await client.query(
    `insert into raid_state (season_id, player_id, rating, defense_tactic)
     values ($1, $2, $3, $4) on conflict (season_id, player_id) do nothing`,
    [seasonId, playerId, RAIDS.ratingStart, DEFAULT_DEFENSE_TACTIC],
  );
}

/* Skim: dopni hráči zlato v trezoru k cíli odvozenému z ATESTOVANÉHO peakDps.
   Voláno (best-effort) po každém přijatém submitu skóre. Tím má každý aktivní
   hráč pořád co ukrást (zlato je hlavní lup). Strop = cíl (least()). */
export async function skimVaultGold(seasonId, playerId, peakDps) {
  const target = Math.floor(raidVaultGoldTarget(peakDps));
  if (target <= 0) return;
  const inc = Math.max(1, Math.floor(target * RAIDS.skimFracPerSubmit));
  await query(
    `insert into raid_state (season_id, player_id, rating, defense_tactic, vault_gold, skim_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (season_id, player_id) do update set
       vault_gold = least($6::numeric, raid_state.vault_gold + $5::numeric),
       skim_at = now(), updated_at = now()`,
    [seasonId, playerId, RAIDS.ratingStart, DEFAULT_DEFENSE_TACTIC, inc, target],
  );
}

/* Najdi oběť: nejbližší dle peakDps (férový souboj), bez sebe, bez nováčků pod
   štítem úrovně, bez aktivně štítěných a bez nedávno přepadených TEBOU. Z poolu
   vyber náhodně. Vrátí snímek + „naskautovaný" lup (co bys teď z trezoru sebral). */
export async function findOpponent(seasonId, attackerId, attackerScore, nowMs = Date.now()) {
  const myPeak = Number(attackerScore?.peakDps) || 0;
  const { rows } = await query(
    `select ss.player_id, p.nickname, ss.peak_dps, ss.highest_level,
            coalesce(rs.rating, $5) as rating,
            coalesce(rs.vault_gold, 0) as vault_gold,
            coalesce(rs.vault_doves, 0) as vault_doves,
            coalesce(rs.vault_dust, 0) as vault_dust
       from season_scores ss
       join players p on p.id = ss.player_id
       left join raid_state rs on rs.season_id = ss.season_id and rs.player_id = ss.player_id
      where ss.season_id = $1
        and ss.player_id <> $2
        and ss.highest_level >= $3
        and (rs.shield_until is null or rs.shield_until <= now())
        and not exists (
          select 1 from raids r
           where r.attacker_id = $2 and r.defender_id = ss.player_id and r.created_at > $4
        )
      order by abs(ss.peak_dps - $6) asc
      limit $7`,
    [seasonId, attackerId, RAIDS.newbieShieldLevel, new Date(nowMs - RAIDS.targetCooldownMs),
      RAIDS.ratingStart, myPeak, RAIDS.matchPoolSize],
  );
  if (!rows.length) return null;
  const r = rows[(Math.random() * rows.length) | 0];
  const vault = { gold: Number(r.vault_gold), doves: r.vault_doves, dust: r.vault_dust };
  return {
    id: r.player_id,
    nickname: r.nickname,
    level: r.highest_level,
    peakDps: Number(r.peak_dps),
    rating: r.rating,
    loot: raidStolenLoot(vault, myPeak), // co bys teď sebral (orientačně; přepočítá se při úderu)
  };
}

/* Přepad. ATOMICKY: zamkne oba řádky arény, ověří štít/cooldown/strop, spočítá
   výsledek z atestovaných statů + taktiky + hodu, přesune lup mezi trezory a
   upraví rating/sérii/štít. Vrátí { ok, attackerWon, loot, … } | { ok:false, reason }. */
export async function resolveRaid(seasonId, attackerId, defenderId, attackerTactic, attackerScore, nowMs = Date.now()) {
  if (attackerId === defenderId) return { ok: false, reason: 'self' };
  const atkTactic = isRaidTactic(attackerTactic) ? attackerTactic : 'utok';
  if ((Number(attackerScore?.highestLevel) || 1) < RAIDS.newbieShieldLevel) {
    return { ok: false, reason: 'too_low' };
  }
  return tx(async (client) => {
    await ensureRow(client, seasonId, attackerId);
    await ensureRow(client, seasonId, defenderId);
    // zamkni oba řádky v pevném pořadí (anti-deadlock)
    const locked = await client.query(
      `select * from raid_state where season_id = $1 and player_id = any($2::uuid[]) order by player_id for update`,
      [seasonId, [attackerId, defenderId]],
    );
    const att = locked.rows.find((x) => x.player_id === attackerId);
    const def = locked.rows.find((x) => x.player_id === defenderId);
    if (!att || !def) return { ok: false, reason: 'gone' };

    // atestované skóre obránce (peakDps/úroveň ze sezónního řádku)
    const defRow = await client.query(
      'select * from season_scores where season_id = $1 and player_id = $2',
      [seasonId, defenderId],
    );
    if (!defRow.rows[0]) return { ok: false, reason: 'gone' };
    const defScore = rowToScore(defRow.rows[0]);
    if ((defScore.highestLevel || 1) < RAIDS.newbieShieldLevel) return { ok: false, reason: 'protected' };
    if (def.shield_until && nowMs < ms(def.shield_until)) {
      return { ok: false, reason: 'shielded', shieldMs: ms(def.shield_until) - nowMs };
    }
    if (att.last_raid_at && nowMs - ms(att.last_raid_at) < RAIDS.raidCooldownMs) {
      return { ok: false, reason: 'cooldown', cooldownMs: RAIDS.raidCooldownMs - (nowMs - ms(att.last_raid_at)) };
    }
    const recent = await client.query(
      'select 1 from raids where attacker_id = $1 and defender_id = $2 and created_at > $3 limit 1',
      [attackerId, defenderId, new Date(nowMs - RAIDS.targetCooldownMs)],
    );
    if (recent.rows[0]) return { ok: false, reason: 'target_cooldown' };

    // denní strop (okno se po 24 h resetuje)
    let dailyCount = att.daily_count;
    let dailyResetAt = att.daily_reset_at;
    if (!dailyResetAt || nowMs >= ms(dailyResetAt)) {
      dailyCount = 0;
      dailyResetAt = new Date(nowMs + 24 * 3600_000);
    }
    if (dailyCount >= RAIDS.dailyRaidCap) return { ok: false, reason: 'daily_cap' };

    // --- vyřešení souboje (server-authoritative) ---
    const defenseTactic = isRaidTactic(def.defense_tactic) ? def.defense_tactic : DEFAULT_DEFENSE_TACTIC;
    const outcome = tacticOutcome(atkTactic, defenseTactic);
    const attEff = raidEffectivePower(raidPower(attackerScore), outcome);
    const defEff = raidPower(defScore);
    const p = raidWinProb(attEff, defEff);
    const attackerWon = Math.random() < p;
    const ratingDelta = raidRatingDelta(att.rating, def.rating, attackerWon);

    let stolen = { gold: 0, doves: 0, dust: 0 };
    let bonus = { gold: 0, doves: 0, dust: 0 };
    let loot = { gold: 0, doves: 0, dust: 0 };
    let newStreak = attackerWon ? att.streak + 1 : 0;
    if (attackerWon) {
      const defVault = { gold: Number(def.vault_gold), doves: def.vault_doves, dust: def.vault_dust };
      stolen = raidStolenLoot(defVault, attackerScore.peakDps);
      bonus = raidWinBonus(newStreak); // ražený bonus, ať i chudý terč potěší
      loot = { gold: stolen.gold + bonus.gold, doves: stolen.doves + bonus.doves, dust: stolen.dust + bonus.dust };
    }
    const bestStreak = Math.max(att.best_streak, newStreak);

    // útočník: rating + lup do trezoru + cooldown/denní strop
    await client.query(
      `update raid_state set
         rating = greatest(0, rating + $3),
         wins = wins + $4, losses = losses + $5,
         streak = $6, best_streak = $7,
         vault_gold = vault_gold + $8::numeric, vault_doves = vault_doves + $9, vault_dust = vault_dust + $10,
         last_raid_at = $11, daily_count = $12, daily_reset_at = $13, updated_at = now()
       where season_id = $1 and player_id = $2`,
      [seasonId, attackerId, ratingDelta, attackerWon ? 1 : 0, attackerWon ? 0 : 1,
        newStreak, bestStreak, loot.gold, loot.doves, loot.dust,
        new Date(nowMs), dailyCount + 1, dailyResetAt],
    );

    // obránce: opačná změna ratingu; při vyloupení ubyde trezor + naskočí štít
    await client.query(
      `update raid_state set
         rating = greatest(0, rating + $3),
         raided_count = raided_count + $4,
         vault_gold = greatest(0, vault_gold - $5::numeric),
         vault_doves = greatest(0, vault_doves - $6),
         vault_dust = greatest(0, vault_dust - $7),
         shield_until = $8, updated_at = now()
       where season_id = $1 and player_id = $2`,
      [seasonId, defenderId, -ratingDelta, attackerWon ? 1 : 0,
        stolen.gold, stolen.doves, stolen.dust,
        attackerWon ? new Date(nowMs + RAIDS.shieldMs) : def.shield_until],
    );

    await client.query(
      `insert into raids (season_id, attacker_id, defender_id, attacker_tactic, defender_tactic,
         attacker_won, loot_gold, loot_doves, loot_dust, rating_delta)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [seasonId, attackerId, defenderId, atkTactic, defenseTactic,
        attackerWon, loot.gold, loot.doves, loot.dust, ratingDelta],
    );

    return {
      ok: true,
      attackerWon,
      loot,
      stolen,
      bonus,
      ratingDelta,
      streak: newStreak,
      winChance: p,
      attackerTactic: atkTactic,
      defenseTactic,
      tacticOutcome: outcome,
      defender: { id: defenderId, nickname: defRow.rows[0].nickname || null },
    };
  });
}

/* Vyber celý trezor do bezpečí (→ klient si lup připíše do lokálního save). */
export async function withdrawVault(seasonId, playerId) {
  return tx(async (client) => {
    const { rows } = await client.query(
      'select * from raid_state where season_id = $1 and player_id = $2 for update',
      [seasonId, playerId],
    );
    const r = rows[0];
    if (!r) return { gold: 0, doves: 0, dust: 0 };
    const out = { gold: Math.floor(Number(r.vault_gold)), doves: r.vault_doves, dust: r.vault_dust };
    await client.query(
      `update raid_state set vault_gold = 0, vault_doves = 0, vault_dust = 0, updated_at = now()
        where season_id = $1 and player_id = $2`,
      [seasonId, playerId],
    );
    return out;
  });
}

/* Nastav obrannou taktiku mého ducha. */
export async function setDefenseTactic(seasonId, playerId, tactic) {
  const t = isRaidTactic(tactic) ? tactic : DEFAULT_DEFENSE_TACTIC;
  await query(
    `insert into raid_state (season_id, player_id, rating, defense_tactic)
     values ($1, $2, $3, $4)
     on conflict (season_id, player_id) do update set defense_tactic = $4, updated_at = now()`,
    [seasonId, playerId, RAIDS.ratingStart, t],
  );
  return t;
}

/* Označ příchozí přepady za viděné (zhasne odznak). */
export async function ackRaids(seasonId, playerId) {
  await query(
    'update raids set seen_at = now() where season_id = $1 and defender_id = $2 and seen_at is null',
    [seasonId, playerId],
  );
}

/* Kompletní pohled pro klienta: můj stav/trezor/rank + příchozí přepady (pomsta)
   + moje útoky + žebříček arény. */
export async function getRaidView(seasonId, playerId, nowMs = Date.now()) {
  await query(
    `insert into raid_state (season_id, player_id, rating, defense_tactic)
     values ($1, $2, $3, $4) on conflict (season_id, player_id) do nothing`,
    [seasonId, playerId, RAIDS.ratingStart, DEFAULT_DEFENSE_TACTIC],
  );
  const meRow = (await query('select * from raid_state where season_id = $1 and player_id = $2', [seasonId, playerId])).rows[0];
  const rankRes = await query(
    'select 1 + count(*)::int as rank from raid_state where season_id = $1 and rating > $2',
    [seasonId, meRow.rating],
  );
  const me = { ...shapeState(meRow, nowMs), rank: rankRes.rows[0].rank };

  const incRes = await query(
    `select r.id, r.attacker_id, r.attacker_won, r.loot_gold, r.loot_doves, r.loot_dust,
            r.created_at, r.seen_at, p.nickname
       from raids r join players p on p.id = r.attacker_id
      where r.season_id = $1 and r.defender_id = $2
      order by r.created_at desc limit 12`,
    [seasonId, playerId],
  );
  const incoming = incRes.rows.map((r) => ({
    id: r.id,
    attackerId: r.attacker_id,
    nickname: r.nickname,
    looted: r.attacker_won, // útočník vyhrál = vyloupil mě
    loot: { gold: Number(r.loot_gold), doves: r.loot_doves, dust: r.loot_dust },
    at: r.created_at,
    seen: !!r.seen_at,
  }));
  const unseen = incoming.filter((r) => !r.seen).length;

  const mineRes = await query(
    `select r.id, r.defender_id, r.attacker_won, r.loot_gold, r.loot_doves, r.loot_dust,
            r.rating_delta, r.created_at, p.nickname
       from raids r join players p on p.id = r.defender_id
      where r.season_id = $1 and r.attacker_id = $2
      order by r.created_at desc limit 8`,
    [seasonId, playerId],
  );
  const mine = mineRes.rows.map((r) => ({
    id: r.id,
    defenderId: r.defender_id,
    nickname: r.nickname,
    won: r.attacker_won,
    loot: { gold: Number(r.loot_gold), doves: r.loot_doves, dust: r.loot_dust },
    ratingDelta: r.rating_delta,
    at: r.created_at,
  }));

  const topRes = await query(
    `select rs.player_id, rs.rating, rs.wins, rs.best_streak, p.nickname
       from raid_state rs join players p on p.id = rs.player_id
      where rs.season_id = $1
      order by rs.rating desc, rs.wins desc, rs.best_streak desc limit 10`,
    [seasonId],
  );
  const top = topRes.rows.map((r, i) => ({
    rank: i + 1, id: r.player_id, nickname: r.nickname, rating: r.rating, wins: r.wins,
  }));

  return { me, incoming, unseen, mine, top };
}
