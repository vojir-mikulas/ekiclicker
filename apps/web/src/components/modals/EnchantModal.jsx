/* ZAKLÍNACÍ STŮL (à la Minecraft). Tajemné RUNY (Starší futhark) + hromada ZLATA.
   DŮLEŽITÉ: každé zaklití je už ZAÚČTOVANÉ enginem (engine.enchantApply mutuje kus) —
   tahle komponenta jen ZRCADLÍ state.pendingEnchant (nabídky stolu) a posílá akce.
   pendingEnchant se neukládá → zavření okna / reload kus nezmění (zaklínadla jsou v něm). */
import { useEngine, useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  itemEmoji, itemName, rarityName, rarityColor, affixLabel,
} from '../../game/data/items.js';
import {
  ENCHANTS, ENCHANTS_CFG, enchantTotalLvl, enchantStats, rerollOffersCost,
} from '../../game/data/enchants.js';
import { itemImageUrl } from '../../game/data/itemImages.js';
import { fmt } from '../../game/format.js';
import Modal from './Modal.jsx';

/* barva záře tieru nabídky (Šepot / Volání / Bouře) */
const TIER_GLOW = ['#8c7bff', '#46d6e0', '#ffd23f'];

function Icon({ item }) {
  const url = itemImageUrl(item.base);
  if (url) return <img className="ench-item-img" src={url} alt="" draggable={false} />;
  return <div className="ench-item-emoji">{itemEmoji(item)}</div>;
}

/* Jedna nabídka stolu: tier, runový (nečitelný) název, odhalený efekt, cena ve zlatě. */
function Offer({ offer, gold, onPick }) {
  const def = ENCHANTS[offer.ench];
  const glow = TIER_GLOW[offer.tier] || TIER_GLOW[0];
  const afford = gold >= offer.cost;
  return (
    <div className="ench-offer" style={{ '--glow': glow }}>
      <div className="ench-offer-tier">{offer.tierLabel}</div>
      <div className="ench-glyph" lang="non" aria-hidden="true">{offer.glyph}</div>
      <div className="ench-offer-name">{def.emoji} {def.name}</div>
      <div className="ench-offer-effect">{affixLabel({ stat: offer.stat, value: offer.value })}</div>
      <button className="ench-pick" disabled={!afford} onClick={onPick}>
        Zaklít · 💰 {fmt(offer.cost)}
      </button>
    </div>
  );
}

export default function EnchantModal() {
  const engine = useEngine();
  // překresli při změně nabídek (rev) i při změně zlata (dostupnost tlačítek)
  useEngineSelector(
    (s) => ({ rev: s.pendingEnchant?.rev || 0, gold: Math.floor(s.gold || 0) }),
    shallowEqual,
  );

  const pe = engine.state.pendingEnchant;
  if (!pe) return null;
  const ref = engine.findItem(pe.itemId);
  const item = ref?.item;
  const close = () => engine.closeEnchant();
  if (!item) { close(); return null; }

  const gold = Math.floor(engine.state.gold || 0);
  const lvl = enchantTotalLvl(item);
  const maxed = lvl >= ENCHANTS_CFG.maxLevel;
  const stats = enchantStats(item);
  const rerollCost = rerollOffersCost(item);

  return (
    <Modal onClose={close} className="enchant-modal">
      <h2 className="ench-title">✨ Zaklínací stůl</h2>

      <div className="ench-item" style={{ '--rc': rarityColor(item) }}>
        <Icon item={item} />
        <div className="ench-item-info">
          <div className="ench-item-name">{itemName(item)}</div>
          <div className="ench-item-sub">
            <b style={{ color: rarityColor(item) }}>{rarityName(item)}</b> · ilvl {item.ilvl}
            <span className="ench-item-lvl">✨ {lvl}/{ENCHANTS_CFG.maxLevel}</span>
          </div>
          {stats && (
            <ul className="ench-item-stats">
              {Object.entries(stats).map(([stat, value]) => (
                <li key={stat}>{affixLabel({ stat, value })}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {maxed ? (
        <div className="ench-maxed">
          <div className="ench-maxed-glyph" aria-hidden="true">ᛗᚨᚲᛊ</div>
          <p>Kus je <b>plně zaklet</b> — runy už neunese víc.</p>
        </div>
      ) : (
        <>
          <p className="ench-hint">
            Tři runy našeptávají sílu. Zaplať <b>zlato</b> a vsaď jednu do kusu — nebo přehoď stůl o jiné.
          </p>
          <div className="ench-offers">
            {pe.offers.map((o) => (
              <Offer key={o.id} offer={o} gold={gold} onPick={() => engine.enchantApply(o.id)} />
            ))}
          </div>
          <div className="ench-actions">
            <button
              className="ench-reroll"
              disabled={gold < rerollCost}
              onClick={() => engine.enchantReroll()}
              title="Přehodit runy na stole (jiné nabídky)"
            >🔄 Přehodit runy · 💰 {fmt(rerollCost)}</button>
          </div>
        </>
      )}

      <div className="ench-footer">
        <span className="ench-gold">💰 {fmt(gold)}</span>
        <button className="ench-done" onClick={close}>Hotovo</button>
      </div>
    </Modal>
  );
}
