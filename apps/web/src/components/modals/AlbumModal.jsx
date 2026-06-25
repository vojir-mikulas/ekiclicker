/* Sběratelský deník — Bestiář (druhy Ekiů) + Arzenál (základy výbavy).
   Záznam se „objeví" prvním setkáním (engine.discoverEnemy / discoverGear).
   Milníky počtu objevených dávají bounded-% bonus (sdílí klíče afixů s výbavou).
   Re-render řízený kompaktním podpisem počtů (engine mutuje state.album na místě). */
import { useEffect, useState } from 'react';
import { useEngine, useEngineSelector } from '../../hooks/useEngine.js';
import {
  ALBUM, ALBUM_PAGES, albumEntries, pageProgress, pageMilestones,
  discoveredCount, isDiscovered, albumStats, albumBonusText,
} from '../../game/data/album.js';
import Modal from './Modal.jsx';
import { PLACEHOLDER } from '../../game/data/texts.js';

/* podpis: počet objevených na každé stránce → re-render jen při novém objevu */
const selectSig = (s) => ALBUM_PAGES.map((p) => discoveredCount(s.album, p.id)).join('|');

/* Karta druhu Ekiho — objevený: stejná fotka jako v aréně (filtr + nádech varianty)
   + název + tier; jinak silueta. Když fotka nenaběhne (offline), spadne zpět na
   barevný terč (glow), aby karta nikdy nezůstala prázdná. */
function BestiaryCard({ e, found }) {
  const [imgOk, setImgOk] = useState(true);
  if (!found) {
    return (
      <div className="album-card locked">
        <div className="album-swatch" />
        <div className="album-card-name">???</div>
        <div className="album-card-sub">neobjeveno</div>
      </div>
    );
  }
  return (
    <div className={'album-card' + (e.boss ? ' boss' : '')}>
      {imgOk ? (
        <div className="album-portrait" style={{ borderColor: e.glow, boxShadow: `0 0 9px ${e.glow}88` }}>
          <img
            src={PLACEHOLDER}
            alt={e.name}
            style={{ filter: e.filter || 'none' }}
            onError={() => setImgOk(false)}
            draggable={false}
          />
          <div className="album-portrait-tint" style={{ background: e.tint || 'transparent' }} />
        </div>
      ) : (
        <div
          className="album-swatch"
          style={{ background: `radial-gradient(circle at 50% 38%, ${e.glow}, #0a0d14 78%)`, borderColor: e.glow }}
        />
      )}
      <div className="album-card-name">{e.name}</div>
      <div className="album-card-sub">{e.tier}</div>
    </div>
  );
}

/* Karta základu výbavy — objevený: emoji + název + slot (+ odznak sady); jinak silueta. */
function ArsenalCard({ e, found }) {
  if (!found) {
    return (
      <div className="album-card locked">
        <div className="album-emoji">❔</div>
        <div className="album-card-name">???</div>
        <div className="album-card-sub">{e.slotName}</div>
      </div>
    );
  }
  return (
    <div className={'album-card' + (e.set ? ' set' : '')}>
      <div className="album-emoji">{e.emoji}</div>
      <div className="album-card-name">{e.name}</div>
      <div className="album-card-sub">{e.slotName}{e.set ? ' · sada' : ''}</div>
    </div>
  );
}

export default function AlbumModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(selectSig); // trigger re-renderu na nové objevy
  const s = engine.state;
  const [page, setPage] = useState('bestiary');

  // otevření deníku vynuluje odznak nových objevů
  useEffect(() => { engine.markAlbumSeen(); }, [engine]);

  const def = ALBUM[page];
  const prog = pageProgress(s.album, page);
  const milestones = pageMilestones(s.album, page);
  const entries = albumEntries(page);
  const totalBonus = albumBonusText(albumStats(s));
  const pct = prog.total ? Math.round((prog.discovered / prog.total) * 100) : 0;

  return (
    <Modal onClose={onClose} className="album-modal">
      <h2>📖 Sběratelský deník</h2>
      <p className="album-total">
        {totalBonus
          ? <>Aktivní bonus z deníku: <b>{totalBonus}</b></>
          : 'Zatím bez bonusu — objevuj záznamy a odemykej milníky. Deník přežívá rebirth.'}
      </p>

      <div className="album-tabs">
        {ALBUM_PAGES.map((p) => {
          const pr = pageProgress(s.album, p.id);
          return (
            <button
              key={p.id}
              className={'album-tab' + (page === p.id ? ' active' : '')}
              onClick={() => setPage(p.id)}
            >
              {p.emoji} {p.name}
              <span className={'album-tab-count' + (pr.complete ? ' done' : '')}>{pr.discovered}/{pr.total}</span>
            </button>
          );
        })}
      </div>

      <p className="album-desc">{def.desc}</p>

      <div className="album-bar"><div className="album-bar-fill" style={{ width: pct + '%' }} /></div>

      <div className="album-milestones">
        {milestones.map((m) => (
          <div key={m.count} className={'album-ms' + (m.active ? ' active' : '')}>
            <span className="album-ms-count">{m.active ? '✓ ' : ''}{m.count} objevů</span>
            <span className="album-ms-bonus">{albumBonusText(m.stats)}</span>
          </div>
        ))}
      </div>

      <div className="album-grid">
        {entries.map((e) => {
          const found = isDiscovered(s.album, page, e.key);
          return page === 'bestiary'
            ? <BestiaryCard key={e.key} e={e} found={found} />
            : <ArsenalCard key={e.key} e={e} found={found} />;
        })}
      </div>

      {prog.discovered === 0 && <p className="album-hint">{def.hint}</p>}
      <p className="album-foot">Objeveno {prog.discovered}/{prog.total} · deník mizí jen s koncem sezóny.</p>
    </Modal>
  );
}
