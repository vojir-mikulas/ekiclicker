/* =========================================================================
   Aréna / přepady routa.
     GET  /api/raids           — můj stav arény + příchozí přepady + žebříček (auth).
     POST /api/raids/scout     — najdi oběť (snímek + lup na nabídce) (auth).
     POST /api/raids/strike    — přepadni { defenderId, tactic }. Výsledek + lup počítá
                                 SERVER z atestovaného peakDps → klient nic netvrdí (auth).
     POST /api/raids/withdraw  — vyber trezor do bezpečí (→ klient si lup připíše) (auth).
     POST /api/raids/defense   — nastav obrannou taktiku ducha { tactic } (auth).
     POST /api/raids/ack       — označ příchozí přepady za viděné (auth).

   Přepady jsou gateované stejně jako skóre: hráč musí soutěžit v AKTIVNÍ sezóně
   (current_season_id == aktivní), jinak 'season_changed'. Trezor je sezónní.
   ========================================================================= */
import { Router } from 'express';
import { requirePlayer } from '../middleware/auth.js';
import { getActiveSeason, getPlayerSeasonRow, rowToScore } from '../lib/players.js';
import {
  findOpponent, resolveRaid, withdrawVault, setDefenseTactic, ackRaids, getRaidView,
} from '../lib/raids.js';

const router = Router();

/* Aktivní sezóna + gate, že do ní hráč soutěží. Vrátí { active } | null (a sám odpoví). */
async function seasonGate(p, res) {
  const active = await getActiveSeason();
  if (!active) { res.status(200).json({ ok: false, reason: 'no_season' }); return null; }
  if (p.current_season_id !== active.id) { res.status(200).json({ ok: false, reason: 'season_changed' }); return null; }
  return active;
}

/* Atestované sezónní skóre hráče (peakDps/úroveň pro výpočet síly), nebo null. */
async function attestedScore(seasonId, playerId) {
  const row = await getPlayerSeasonRow(seasonId, playerId);
  return row ? rowToScore(row) : null;
}

/* GET /api/raids — kompletní pohled arény. */
router.get('/', requirePlayer, async (req, res, next) => {
  try {
    const active = await getActiveSeason();
    if (!active) return res.status(200).json({ ok: false, reason: 'no_season' });
    const view = await getRaidView(active.id, req.player.id);
    res.status(200).json({ ok: true, ...view });
  } catch (err) {
    next(err);
  }
});

/* POST /api/raids/scout — { ok, opponent } | { ok:false, reason } */
router.post('/scout', requirePlayer, async (req, res, next) => {
  try {
    const active = await seasonGate(req.player, res);
    if (!active) return undefined;
    const score = await attestedScore(active.id, req.player.id);
    if (!score) return res.status(200).json({ ok: false, reason: 'no_score' });
    const opponent = await findOpponent(active.id, req.player.id, score);
    return res.status(200).json({ ok: true, opponent: opponent || null });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/raids/strike — { defenderId, tactic } → výsledek + aktuální pohled. */
router.post('/strike', requirePlayer, async (req, res, next) => {
  try {
    const active = await seasonGate(req.player, res);
    if (!active) return undefined;
    const defenderId = String(req.body?.defenderId || '');
    if (!defenderId) return res.status(400).json({ ok: false, reason: 'no_target' });
    const score = await attestedScore(active.id, req.player.id);
    if (!score) return res.status(200).json({ ok: false, reason: 'no_score' });
    const result = await resolveRaid(active.id, req.player.id, defenderId, req.body?.tactic, score);
    const view = await getRaidView(active.id, req.player.id);
    return res.status(200).json({ ...result, view });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/raids/withdraw — { ok, reward:{ gold, doves, dust } } */
router.post('/withdraw', requirePlayer, async (req, res, next) => {
  try {
    const active = await seasonGate(req.player, res);
    if (!active) return undefined;
    const reward = await withdrawVault(active.id, req.player.id);
    return res.status(200).json({ ok: true, reward });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/raids/defense — { tactic } → { ok, tactic } */
router.post('/defense', requirePlayer, async (req, res, next) => {
  try {
    const active = await seasonGate(req.player, res);
    if (!active) return undefined;
    const tactic = await setDefenseTactic(active.id, req.player.id, req.body?.tactic);
    return res.status(200).json({ ok: true, tactic });
  } catch (err) {
    return next(err);
  }
});

/* POST /api/raids/ack — označ příchozí přepady za viděné. */
router.post('/ack', requirePlayer, async (req, res, next) => {
  try {
    const active = await getActiveSeason();
    if (active) await ackRaids(active.id, req.player.id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
