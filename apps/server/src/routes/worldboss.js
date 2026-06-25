/* =========================================================================
   Světový boss routa.
     GET  /api/world-boss        — stav bosse + top + můj příspěvek (auth VOLITELNÁ).
     POST /api/world-boss/hit    — udeř (auth). Poškození počítá SERVER z atestovaného
                                   sezónního peakDps → klient žádný damage neposílá.
     POST /api/world-boss/claim  — vyzvedni spočtené odměny za uzavřené bosse (auth).

   Boss je vázaný na AKTIVNÍ sezónu. Údery jsou gateované stejně jako skóre: hráč
   musí soutěžit v aktuální sezóně (current_season_id == aktivní), jinak 'season_changed'.
   ========================================================================= */
import { Router } from 'express';
import { requirePlayer, optionalPlayer } from '../middleware/auth.js';
import {
  getActiveSeason, getPlayerSeasonRow, rowToScore,
} from '../lib/players.js';
import {
  ensureActiveWorldBoss, applyHit, getWorldBossView, claimWorldBossRewards,
} from '../lib/worldboss.js';

const router = Router();

/* Atestované peakDps hráče v dané sezóně (0, když ještě nemá řádek). */
async function attestedPeakDps(seasonId, playerId) {
  const row = await getPlayerSeasonRow(seasonId, playerId);
  return row ? rowToScore(row).peakDps : 0;
}

/* GET /api/world-boss — { boss, top, fighters, me?, unclaimed? } | { boss: null } */
router.get('/', optionalPlayer, async (req, res, next) => {
  try {
    const active = await getActiveSeason();
    if (!active) return res.status(200).json({ boss: null });
    const view = await getWorldBossView(active.id, req.player?.id || null);
    res.status(200).json(view);
  } catch (err) {
    next(err);
  }
});

/* POST /api/world-boss/hit — { ok, defeated?, dmg?, reason?, ...view } */
router.post('/hit', requirePlayer, async (req, res, next) => {
  try {
    const p = req.player;
    const active = await getActiveSeason();
    if (!active) return res.status(200).json({ ok: false, reason: 'no_season' });
    if (p.current_season_id !== active.id) {
      return res.status(200).json({ ok: false, reason: 'season_changed' });
    }

    const boss = await ensureActiveWorldBoss(active.id);
    if (!boss || boss.status !== 'active') {
      // boss je ve vítězné / respawn pauze — vrať aktuální pohled
      const view = await getWorldBossView(active.id, p.id);
      return res.status(200).json({ ok: false, reason: 'not_active', ...view });
    }

    const peakDps = await attestedPeakDps(active.id, p.id);
    const result = await applyHit(boss.id, p.id, peakDps);
    const view = await getWorldBossView(active.id, p.id);
    res.status(200).json({ ...result, ...view });
  } catch (err) {
    next(err);
  }
});

/* POST /api/world-boss/claim — { ok, reward: { doves, dust, count } } */
router.post('/claim', requirePlayer, async (req, res, next) => {
  try {
    const active = await getActiveSeason();
    if (!active) return res.status(200).json({ ok: false, reason: 'no_season' });
    const reward = await claimWorldBossRewards(active.id, req.player.id);
    res.status(200).json({ ok: true, reward });
  } catch (err) {
    next(err);
  }
});

export default router;
