import { useState, useEffect, useCallback } from 'react';
import { LEADERBOARD_BOARDS, DEFAULT_BOARD, boardByKey } from '@ekiclicker/shared';
import { api } from '../../net/api.js';
import { accountErrorMessage } from '../../net/errors.js';
import { useAccount } from '../../hooks/useAccount.js';
import { fmt, fmtDuration } from '../../game/format.js';

const POLL_MS = 15_000; // jak často se otevřený žebříček sám obnoví

function formatValue(field, value) {
  if (field === 'playTimeMs') return fmtDuration((value || 0) / 1000);
  return fmt(value || 0);
}

export default function Leaderboard({ onJoin }) {
  const account = useAccount();
  const [boardKey, setBoardKey] = useState(DEFAULT_BOARD);
  const [data, setData] = useState(null); // { entries, me }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const board = boardByKey(boardKey) || boardByKey(DEFAULT_BOARD);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.leaderboard(boardKey, 50);
      setData(res);
    } catch (e) {
      setError(accountErrorMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [boardKey]);

  // Načti při otevření / přepnutí žebříčku, pak průběžně obnovuj (cizí skóre se
  // taky mění) a hned po odeslání vlastního skóre (account.syncTick). Server
  // zvládne 120 req/min/IP, takže poll po 15 s (4/min) je v pohodě.
  const syncTick = account.syncTick;
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, syncTick]);

  const myId = account.player?.id;
  const entries = data?.entries || [];

  return (
    <div className="board">
      <div className="board-head">
        <div className="segmented board-tabs" role="tablist">
          {LEADERBOARD_BOARDS.map((b) => (
            <button
              key={b.key}
              role="tab"
              aria-selected={b.key === boardKey}
              className={'seg' + (b.key === boardKey ? ' active' : '')}
              onClick={() => setBoardKey(b.key)}
            >{b.label}</button>
          ))}
        </div>
        <button className="ghost-btn" onClick={load} title="Obnovit">🔄</button>
      </div>

      {account.status === 'local' && (
        <div className="board-cta">
          <span>Hraješ lokálně. Připoj se a změř síly s ostatními!</span>
          <button className="primary-btn" onClick={onJoin}>➕ Připojit se</button>
        </div>
      )}

      {loading && <div className="board-loading">Načítám…</div>}

      {!loading && error && (
        <div className="board-empty">
          <p>{error}</p>
          <button className="ghost-btn" onClick={load}>Zkusit znovu</button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="board-empty">Zatím tu nikdo není. Buď první! 🏆</div>
      )}

      {!loading && !error && entries.length > 0 && (
        <table className="board-table">
          <thead>
            <tr><th>#</th><th>Hráč</th><th>{board.label}</th></tr>
          </thead>
          <tbody>
            {entries.map((row) => (
              <tr key={row.id || row.rank} className={myId && row.id === myId ? 'me' : ''}>
                <td className="rank">{row.rank}</td>
                <td className="nick">{row.nickname}</td>
                <td className="val">{formatValue(board.field, row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && data?.me && !entries.some((e) => e.id === myId) && (
        <div className="board-me-row">
          <span className="rank">#{data.me.rank}</span>
          <span className="nick">{data.me.nickname} (ty)</span>
          <span className="val">{formatValue(board.field, data.me.value)}</span>
        </div>
      )}
    </div>
  );
}
