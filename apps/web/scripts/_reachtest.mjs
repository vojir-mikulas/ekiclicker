import { CONFIG } from '../src/game/config.js';
import { WEAPONS } from '../src/game/data/weapons.js';
import { UPGRADE_KEYS } from '../src/game/data/upgrades.js';
import { VARIANTS } from '../src/game/data/variants.js';
import { createState } from '../src/game/initialState.js';
import { totalDps, clickDamage, goldMult, enemyMaxHp, enemyReward, upgradeCost, weaponCost, difficultyScale } from '../src/game/formulas.js';
const effDps = (s) => totalDps(s) + 3.5 * clickDamage(s);
function variantForLevel(level){
  if (level % CONFIG.archonBossEvery===0) return {id:'archon',...VARIANTS.archon};
  if (level % CONFIG.ultraBossEvery===0) return {id:'titan',...VARIANTS.titan};
  if (level % CONFIG.megaBossEvery===0) return {id:'king',...VARIANTS.king};
  if (level % CONFIG.bossEvery===0) return {id:'gold',...VARIANTS.gold};
  return {id:'normal',...VARIANTS.normal};
}
function bestPurchase(s){let best=null;const before=effDps(s);const roiOf=(a,r,c)=>{if(!isFinite(c)||c<=0||s.gold<c)return -1;a();const af=effDps(s);r();return (af-before)/c;};
  for(const k of UPGRADE_KEYS){const c=upgradeCost(k,s.upgrades[k]);const roi=roiOf(()=>s.upgrades[k]++,()=>s.upgrades[k]--,c);if(roi>0&&(!best||roi>best.roi))best={roi,cost:c,do:()=>s.upgrades[k]++};}
  for(const w of WEAPONS){if(s.level<w.unlock)continue;const c=weaponCost(w,s.weapons[w.id]||0);const roi=roiOf(()=>s.weapons[w.id]++,()=>s.weapons[w.id]--,c);if(roi>0&&(!best||roi>best.roi))best={roi,cost:c,do:()=>s.weapons[w.id]++};}
  return best;}
function spend(s){for(let i=0;i<800;i++){const b=bestPurchase(s);if(!b||s.gold<b.cost)break;s.gold-=b.cost;b.do();}}
function measure(prestige,maxLevel){const s=createState();Object.assign(s.prestige,prestige);let wall=null;
  for(s.level=1;s.level<=maxLevel;s.level++){const v=variantForLevel(s.level);const hp=enemyMaxHp(s.level,v,difficultyScale(s));spend(s);const killS=hp/effDps(s);
    if(!v.boss&&wall==null&&killS>8)wall=s.level;
    let rew=enemyReward(s.level,v,goldMult(s));let gain=rew;if(v.boss){const m=v.archon?CONFIG.archonBossLootMult:v.ultra?CONFIG.ultraBossLootMult:v.mega?CONFIG.megaBossLootMult:CONFIG.bossLootMult;gain+=Math.ceil(rew*m);}s.gold+=gain;
    if(wall!=null&&s.level>wall+5)break;}
  return wall||maxLevel;}
const loads={
 'r400':{rage:400,fist:160,factory:36,crit:35,greed:80,shadow:40},
 'r700':{rage:700,fist:250,factory:40,crit:40,greed:120,shadow:60},
 'r1000':{rage:1000,fist:350,factory:44,crit:45,greed:160,shadow:80},
 'r1500':{rage:1500,fist:500,factory:48,crit:50,greed:220,shadow:110},
};
for(const [n,p] of Object.entries(loads)) console.log(n.padEnd(7), 'wall=', measure(p,40000));
