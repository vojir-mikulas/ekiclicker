/* =========================================================================
   Auth routy — register / recover / me (GET, PATCH, DELETE).
   ========================================================================= */
import { Router } from 'express';
import { validateNickname, LIMITS, boardByKey, DEFAULT_BOARD } from '@ekiclicker/shared';
import { generateToken, sha256hex } from '../lib/crypto.js';
import { clientIp } from '../lib/ip.js';
import { requirePlayer } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  rowToScore,
  playerRank,
  countRecentAccountsByIp,
  isNicknameTaken,
  createPlayer,
  renamePlayer,
  deletePlayer,
  findByToken,
  touchIp,
} from '../lib/players.js';

const router = Router();
const defaultBoard = boardByKey(DEFAULT_BOARD);

/* POST /api/register — { nickname } → { id, nickname, token, recoveryCode } */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const v = validateNickname(req.body?.nickname);
    if (!v.ok) return res.status(400).json({ error: v.error, code: 'nickname_invalid' });

    const ip = clientIp(req);
    const recent = await countRecentAccountsByIp(ip);
    if (recent >= LIMITS.perIpDailyAccountCap) {
      return res.status(429).json({ error: 'Z této IP bylo založeno příliš mnoho účtů.', code: 'ip_cap' });
    }

    const nicknameCi = v.value.toLowerCase();
    if (await isNicknameTaken(nicknameCi)) {
      return res.status(409).json({ error: 'Tato přezdívka je obsazená.', code: 'nickname_taken' });
    }

    const token = generateToken();
    let player;
    try {
      player = await createPlayer({
        tokenHash: sha256hex(token),
        nickname: v.value,
        nicknameCi,
        ip,
        nowMs: Date.now(),
      });
    } catch (err) {
      // závod o unikátní nickname_ci — Postgres unique violation
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Tato přezdívka je obsazená.', code: 'nickname_taken' });
      }
      throw err;
    }

    res.status(200).json({ id: player.id, nickname: player.nickname, token, recoveryCode: token });
  } catch (err) {
    next(err);
  }
});

/* POST /api/recover — { code } → { id, nickname, token, save, rank, score } */
router.post('/recover', authLimiter, async (req, res, next) => {
  try {
    const code = req.body?.code;
    if (typeof code !== 'string' || code.length === 0) {
      return res.status(404).json({ error: 'Účet nenalezen.', code: 'not_found' });
    }
    // hledáme přímo přes token_hash; touchIp ošetříme ručně
    const player = await findByToken(code);
    if (!player) return res.status(404).json({ error: 'Účet nenalezen.', code: 'not_found' });

    await touchIp(player, clientIp(req), Date.now());
    const rank = await playerRank(player.id, defaultBoard);
    res.status(200).json({
      id: player.id,
      nickname: player.nickname,
      token: code,
      save: player.save_blob ?? null,
      rank,
      score: rowToScore(player),
    });
  } catch (err) {
    next(err);
  }
});

/* GET /api/me — (auth) ?withSave=1 → { id, nickname, rank, score, createdAt, save? } */
router.get('/me', requirePlayer, async (req, res, next) => {
  try {
    const p = req.player;
    const rank = await playerRank(p.id, defaultBoard);
    const out = {
      id: p.id,
      nickname: p.nickname,
      rank,
      score: rowToScore(p),
      createdAt: p.created_at,
    };
    if (req.query.withSave === '1') out.save = p.save_blob ?? null;
    res.status(200).json(out);
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/me — (auth) { nickname } → { id, nickname } */
router.patch('/me', requirePlayer, async (req, res, next) => {
  try {
    const p = req.player;
    const v = validateNickname(req.body?.nickname);
    if (!v.ok) return res.status(400).json({ error: v.error, code: 'nickname_invalid' });

    if (p.renamed_at) {
      const elapsed = Date.now() - new Date(p.renamed_at).getTime();
      if (elapsed < LIMITS.renameMinIntervalMs) {
        return res.status(429).json({
          error: 'Přejmenování je možné jen jednou za hodinu.',
          code: 'rename_throttled',
          retryAfterMs: LIMITS.renameMinIntervalMs - elapsed,
        });
      }
    }

    const nicknameCi = v.value.toLowerCase();
    if (await isNicknameTaken(nicknameCi, p.id)) {
      return res.status(409).json({ error: 'Tato přezdívka je obsazená.', code: 'nickname_taken' });
    }

    let updated;
    try {
      updated = await renamePlayer(p.id, v.value, nicknameCi);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Tato přezdívka je obsazená.', code: 'nickname_taken' });
      }
      throw err;
    }
    res.status(200).json({ id: updated.id, nickname: updated.nickname });
  } catch (err) {
    next(err);
  }
});

/* DELETE /api/me — (auth) → { ok:true } */
router.delete('/me', requirePlayer, async (req, res, next) => {
  try {
    await deletePlayer(req.player.id);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
