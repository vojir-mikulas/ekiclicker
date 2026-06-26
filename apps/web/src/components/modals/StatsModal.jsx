/* Podrobné statistiky — odvozené bojové hodnoty (krit, combo, násobiče, DPS)
   + nasbírané staty. Čte se přes useEngineSelector (shallowEqual omezí překreslení
   jen na skutečné změny). */
import { useEngineSelector, shallowEqual } from '../../hooks/useEngine.js';
import {
  clickDamage, critChance, critMult, comboPerHit, frenzyDuration,
  totalDps, totalWeaponDps, shadowDps, globalMult, goldMult, speedMult,
  prestigePower, difficultyScale, comboCap,
} from '../../game/formulas.js';
import { CONFIG } from '../../game/config.js';
import { ACHIEVEMENT_COUNT } from '../../game/data/achievements.js';
import { fmt, fmtDuration } from '../../game/format.js';
import Modal from './Modal.jsx';

const pct = (x) => `${(x * 100).toFixed(x * 100 < 10 ? 1 : 0)} %`;
const mult = (x) => `×${x >= 1000 ? fmt(x) : x.toFixed(x < 10 ? 2 : 1)}`;

const select = (s) => ({
  click: Math.floor(clickDamage(s)),
  critChance: critChance(s),
  critMult: critMult(s),
  comboPerHit: comboPerHit(s),
  comboCap: comboCap(s),
  frenzySec: Math.round(frenzyDuration(s) / 1000),
  dpsTotal: Math.floor(totalDps(s)),
  dpsWeapons: Math.floor(totalWeaponDps(s)),
  dpsShadow: Math.floor(shadowDps(s)),
  attackSpeed: 1 / speedMult(s),
  globalMult: globalMult(s),
  goldMult: goldMult(s),
  prestigePower: prestigePower(s),
  difficulty: difficultyScale(s),
  level: s.level,
  highestLevel: s.highestLevel,
  rebirths: s.prestige.rebirths,
  forgiveness: Math.floor(s.prestige.forgiveness),
  achievements: Object.keys(s.achievements).length,
  weapons: Object.values(s.weapons).reduce((a, b) => a + b, 0),
  kills: s.stats.kills,
  bossKills: s.stats.bossKills,
  archonKills: s.stats.archonKills || 0,
  itemsFound: s.stats.itemsFound || 0,
  chestsFound: s.stats.chestsFound || 0,
  dust: Math.floor(s.dust || 0),
  totalGold: Math.floor(s.stats.totalGold),
  totalClicks: s.stats.totalClicks,
  maxCombo: s.stats.maxCombo,
  luckyClicks: s.stats.luckyClicks,
  frenzies: s.stats.frenzies,
  peakDps: Math.floor(s.stats.peakDps),
  playTimeSec: Math.floor(s.stats.playTimeMs / 1000),
  raidWins: s.stats.raidWins || 0,
  raidPlunder: Math.floor(s.stats.raidPlunder || 0),
});

function Section({ title, rows }) {
  return (
    <div className="stats-section">
      <div className="profile-section-head"><h3>{title}</h3></div>
      <div className="profile-statcol">
        {rows.map(([label, value]) => (
          <div key={label} className="ps-row"><span>{label}</span><b>{value}</b></div>
        ))}
      </div>
    </div>
  );
}

export default function StatsModal({ onClose }) {
  const v = useEngineSelector(select, shallowEqual);

  return (
    <Modal onClose={onClose} className="stats-modal">
      <h2>📊 Statistiky</h2>
      <div className="stats-grid">

      <Section title="⚔️ Boj" rows={[
        ['Plný úder', fmt(v.click)],
        ['Šance na krit', pct(v.critChance)],
        ['Krit poškození', mult(v.critMult)],
        ['Combo bonus', `+${(v.comboPerHit * 100).toFixed(1)} % / stupeň`],
        ['Max combo', `×${v.comboCap}`],
        ['Zuřivost', `${mult(CONFIG.frenzyMult)} na ${v.frenzySec} s`],
      ]} />

      <Section title="⚡ DPS" rows={[
        ['Celkové auto DPS', fmt(v.dpsTotal)],
        ['Zbraně', fmt(v.dpsWeapons)],
        ['Stín pěsti', fmt(v.dpsShadow)],
        ['Špičkové (rekord)', fmt(v.peakDps)],
        ['Rychlost útoku', mult(v.attackSpeed)],
      ]} />

      <Section title="💰 Násobiče" rows={[
        ['Poškození (celkem)', mult(v.globalMult)],
        ['Zlato', mult(v.goldMult)],
      ]} />

      <Section title="⚖️ Prestige a obtížnost" rows={[
        ['Prestige síla', mult(v.prestigePower)],
        ['Obtížnost Ekiů (HP)', mult(v.difficulty)],
      ]} />

      <Section title="📈 Nasbíráno" rows={[
        ['Zabití', fmt(v.kills)],
        ['Bossové', fmt(v.bossKills)],
        ['Archóni 👁️', fmt(v.archonKills)],
        ['Celkem zlata', fmt(v.totalGold)],
        ['Kliků', fmt(v.totalClicks)],
        ['Nejvyšší combo', fmt(v.maxCombo)],
        ['Lucky Eki', fmt(v.luckyClicks)],
        ['Zuřivostí', fmt(v.frenzies)],
        ['Čas hraní', fmtDuration(v.playTimeSec)],
      ]} />

      <Section title="🎒 Výbava" rows={[
        ['Nalezené bedny', fmt(v.chestsFound)],
        ['Vyloupené kusy', fmt(v.itemsFound)],
        ['Úlomky 💠', fmt(v.dust)],
      ]} />

      <Section title="⚔️ Aréna" rows={[
        ['Vyhrané přepady', fmt(v.raidWins)],
        ['Nakradené zlato 💰', fmt(v.raidPlunder)],
      ]} />

      <Section title="🌟 Souhrn" rows={[
        ['Úroveň', v.level],
        ['Nejvyšší úroveň', v.highestLevel],
        ['Rebirthy', v.rebirths],
        ['Odpuštění', `${fmt(v.forgiveness)} 🕊`],
        ['Úspěchy', `${v.achievements} / ${ACHIEVEMENT_COUNT}`],
        ['Zbraně celkem', fmt(v.weapons)],
      ]} />
      </div>
    </Modal>
  );
}
