import { useState, useCallback, useRef } from 'react';
import { useEngineSelector, useEngineEvent, shallowEqual } from '../../hooks/useEngine.js';
import { VARIANTS } from '../../game/data/variants.js';
import { PLACEHOLDER, REACTION_IMGS, REACTION_EMOJI } from '../../game/data/texts.js';

const selectEnemy = (s) => ({ variantId: s.enemy?.variantId, id: s.enemy?.id });

export default function EnemyView() {
  const { variantId } = useEngineSelector(selectEnemy, shallowEqual);
  const [imageMode, setImageMode] = useState(true);
  const [reactSrc, setReactSrc] = useState(null);
  const [reactEmoji, setReactEmoji] = useState(null);
  const resetTimer = useRef(0);

  useEngineEvent(
    useCallback((type) => {
      if (type === 'hit' || type === 'react') {
        // Při husté auto-palbě drž „zásahovou" fotku až 600 ms po POSLEDNÍM
        // zásahu — jeden sdílený časovač, ať foto nebliká zpět na klidnou.
        clearTimeout(resetTimer.current);
        if (imageMode) {
          setReactSrc(REACTION_IMGS[Math.floor(Math.random() * REACTION_IMGS.length)]);
        } else {
          setReactEmoji(REACTION_EMOJI[Math.floor(Math.random() * REACTION_EMOJI.length)]);
        }
        resetTimer.current = setTimeout(() => {
          setReactSrc(null);
          setReactEmoji(null);
        }, 600);
      } else if (type === 'spawn') {
        clearTimeout(resetTimer.current);
        setReactSrc(null);
        setReactEmoji(null);
      }
    }, [imageMode])
  );

  const v = VARIANTS[variantId] || VARIANTS.normal;
  const filter = v.filter || 'none';

  return (
    <>
      <div className="photo-glow" style={{ background: v.glow || '#444' }} />
      {imageMode ? (
        <img
          className="photo"
          src={reactSrc || PLACEHOLDER}
          alt="Eki"
          style={{ filter }}
          onError={() => setImageMode(false)}
          draggable={false}
        />
      ) : (
        <div className="face-fallback" style={{ filter }}>
          {reactEmoji || '😠'}
        </div>
      )}
      <div
        className="tint"
        style={{ background: v.tint || 'transparent', opacity: v.tint ? 1 : 0 }}
      />
    </>
  );
}
