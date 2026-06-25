/* Mistrovská mřížka 🔱 — paragon "rune tree" (staré LoL Masteries). Tři větve,
   řady (tiery) se odemykají investicí bodů ve větvi, na dně klíčový uzel.
   Body 🔱 padají za úrovně nad MASTERY.unlockLevel (engine.defeat). Re-render
   řízený kompaktním podpisem bodů + ranků (engine mutuje state.mastery na místě). */
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  MASTERY, MASTERY_TREES, MASTERY_NODES, treeTiers, nodeRank, pointsInTree,
  spentTotal, tierUnlocked, canBuyNode, nodeStats, masteryStats, masteryBonusText,
} from '../../game/data/mastery.js';
import Modal from './Modal.jsx';
import { fmt } from '../../game/format.js';

/* podpis: body + rank každého uzlu → re-render jen na koupi / nový bod */
const trigger = (s) => [s.mastery?.points || 0, ...MASTERY_NODES.map((n) => s.mastery?.nodes?.[n.id] || 0)];

function MasteryNode({ node, rank, can, locked, onBuy }) {
  const maxed = rank >= node.max;
  // při rank 0 ukaž efekt JEDNOHO ranku (co dostaneš koupí), jinak součet ranků
  const stats = nodeStats(node, Math.max(rank, 1));
  return (
    <button
      type="button"
      className={
        'mnode' +
        (node.keystone ? ' keystone' : '') +
        (rank > 0 ? ' owned' : '') +
        (locked ? ' locked' : '') +
        (maxed ? ' maxed' : '')
      }
      onClick={onBuy}
      disabled={!can}
    >
      <span className="mnode-emoji">{node.emoji}</span>
      <span className="mnode-name">{node.name}</span>
      <span className="mnode-rank">{locked ? '🔒' : maxed ? 'MAX' : `${rank}/${node.max}`}</span>
      <span className="mnode-bonus">{masteryBonusText(stats)}</span>
    </button>
  );
}

export default function MasteryModal({ onClose }) {
  const engine = useEngine();
  useEngineSelector(trigger, shallowEqual); // trigger re-renderu
  const s = engine.state;
  const points = s.mastery?.points || 0;
  const totalBonus = masteryBonusText(masteryStats(s));

  return (
    <Modal onClose={onClose} className="mastery-modal">
      <h2>🔱 Mistrovská mřížka</h2>
      <p className="mastery-head">
        Body: <b>{fmt(points)} 🔱</b> · utraceno {spentTotal(s)} · padají za každou úroveň nad{' '}
        {fmt(MASTERY.unlockLevel)}.
      </p>
      <p className="mastery-total">
        {totalBonus ? (
          <>Aktivní bonus: <b>{totalBonus}</b></>
        ) : (
          'Zatím bez bonusu — investuj body do větví. Mřížka přežívá rebirth.'
        )}
      </p>

      <div className="mastery-trees">
        {MASTERY_TREES.map((tree) => {
          const inTree = pointsInTree(s, tree.id);
          return (
            <div className="mtree" key={tree.id} style={{ '--tree': tree.color }}>
              <div className="mtree-head">
                <span className="mtree-emoji">{tree.emoji}</span>
                <span className="mtree-name">{tree.name}</span>
                <span className="mtree-pts">{inTree} b.</span>
              </div>
              <p className="mtree-desc">{tree.desc}</p>

              {treeTiers(tree).map(({ tier, gate, nodes }) => {
                const unlocked = tierUnlocked(s, tree, tier);
                return (
                  <div className={'mtier' + (unlocked ? '' : ' locked')} key={tier}>
                    {gate > 0 && (
                      <div className="mtier-gate">
                        {unlocked ? '✓' : '🔒'} {gate} bodů ve větvi
                      </div>
                    )}
                    <div className="mtier-nodes">
                      {nodes.map((node) => (
                        <MasteryNode
                          key={node.id}
                          node={node}
                          rank={nodeRank(s, node.id)}
                          can={canBuyNode(s, node)}
                          locked={!unlocked}
                          onBuy={() => engine.buyMasteryNode(node.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mastery-foot">
        Každý uzel je BOUNDED a stropovaný — žádný runaway, žádný vliv na obtížnost ani žebříček.
        Mřížka mizí jen s koncem sezóny.
      </p>
    </Modal>
  );
}
