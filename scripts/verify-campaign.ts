import { Simulation, distance, type Vec } from '../src/simulation.ts';
import { missions } from '../src/campaign.ts';
import { defaultLoadout, type WeaponId } from '../src/weapons.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { weaponSpecs } from '../src/weapons.ts';
mkdirSync('.runtime/campaign', { recursive: true });
const results: unknown[] = [];
function route(sim: Simulation, goal: Vec): Vec[] {
  const locate=(p:Vec)=>{
    const options:Vec[]=[];
    for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
      const q={x:Math.round(p.x)+x,z:Math.round(p.z)+z};
      if(!sim.blocked(q,.45)&&sim.visible(q,p))options.push(q);
    }
    return options.sort((a,b)=>distance(a,p)-distance(b,p))[0];
  };
  const start=locate(sim.player),end=locate(goal);if(!start||!end)return [];
  const key=(p:Vec)=>`${p.x},${p.z}`,queue=[start],prev=new Map<string,Vec|null>([[key(start),null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    if(key(p)===key(end)){const out:Vec[]=[];let q:Vec|null=p;while(q){out.unshift(q);q=prev.get(key(q))!;}out.push(goal);return out;}
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:p.x+dx,z:p.z+dz};if(!prev.has(key(q))&&!sim.blocked(q,.45)){prev.set(key(q),p);queue.push(q);}}
  }
  return [];
}
for(const mission of missions.slice(1))for(const weapon of ['pistol','rifle','smg'] as WeaponId[]){
  let seed=42;const sim=new Simulation(()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;},defaultLoadout(weapon),mission);
  sim.start();let path:Vec[]=[],goal:Vec|undefined,maxEnemies=0;
  for(let frame=0;frame<(mission.duration+180)*60 && sim.state!=='lost'&&sim.state!=='won';frame++){
    if(sim.state==='upgrade')sim.choose(sim.player.hp<sim.player.maxHp*.65?2:0);
    const active=sim.activeObjective;
    if(frame%30===0){
      const supplies=[...sim.crates.filter(c=>c.rounds>0),...sim.drops.filter(d=>d.kind==='ammo')].sort((a,b)=>distance(a,sim.player)-distance(b,sim.player));
      const xp=sim.drops.filter(d=>d.kind==='xp').sort((a,b)=>distance(a,sim.player)-distance(b,sim.player));
      const boss=sim.enemies.find(e=>e.kind==='boss');
      goal=(sim.reserve<36?supplies[0]:undefined)??(sim.extractionReady?mission.extraction:undefined)??
        (xp[0]&&distance(xp[0],sim.player)<5?xp[0]:undefined)??active??xp[0]??boss;
      path=goal?route(sim,goal):[];
    }
    while(path.length&&distance(sim.player,path[0])<.22)path.shift();
    let input:Vec={x:0,z:0};const next=path[0],length=next?distance(sim.player,next):0;
    if(length>.01)input={x:(next.x-sim.player.x)/length,z:(next.z-sim.player.z)/length};
    if(active&&goal===active&&distance(sim.player,active)<active.radius*.65)input={x:0,z:0};
    // 正常生命、伤害、补给和武器；简单危险规避只代表固定脚本，不替代真人平衡验收。
    let danger=0,away={x:0,z:0};
    for(const e of sim.enemies){
      const d=distance(e,sim.player);if(d<3.5&&(e.kind==='runner'||e.kind==='pouncer'||e.kind==='boss')){
        away.x+=(sim.player.x-e.x)/Math.max(.1,d);away.z+=(sim.player.z-e.z)/Math.max(.1,d);danger++;
      }
      if(e.windup&&e.aim&&distance(sim.player,e.aim)<(e.kind==='boss'?4:1.5)){
        away.x+=sim.player.z-e.z;away.z-=sim.player.x-e.x;danger++;
      }
    }
    if(danger){const n=Math.hypot(away.x,away.z);if(n>.01&&!sim.blocked({x:sim.player.x+away.x/n*.6,z:sim.player.z+away.z/n*.6}))input={x:away.x/n,z:away.z/n};}
    if(sim.target&&distance(sim.target,sim.player)<7&&sim.enemies.filter(e=>distance(e,sim.target!)<3.6).length>=3)sim.throwGrenade();
    sim.step(1/60,input);maxEnemies=Math.max(maxEnemies,sim.enemies.length);
    if(sim.ammo+sim.reserve+sim.roundsFired!==sim.magazine+120+sim.roundsCollected)throw new Error('弹药守恒失败');
    if(sim.blocked(sim.player)||sim.enemies.length>mission.maxEnemies)throw new Error('地图边界或敌人数量失败');
  }
  const result={关卡:mission.name,武器:weaponSpecs[weapon].name,结果:sim.state==='won'?'通关':sim.state==='lost'?'失败':'未结束',用时:Math.round(sim.time),生命:Math.round(sim.player.hp),完成目标:sim.objectives.filter(o=>o.completed).length,总目标:sim.objectives.length,巨兽击败:sim.bossDefeated,击倒:sim.kills,等级:sim.level,峰值敌人:maxEnemies,发射:sim.roundsFired,拾取:sim.roundsCollected,打开补给:sim.cratesOpened};
  results.push(result);console.log(JSON.stringify(result));
  assert.equal(sim.state, 'won', `${mission.name}：${weaponSpecs[weapon].name}未完成固定样本`);
  assert.ok(sim.objectivesComplete && sim.bossDefeated && sim.cratesOpened > 0);
}
writeFileSync('.runtime/campaign/playthrough-report.json',JSON.stringify({说明:'固定随机种子42、标准装备、正常生命。简易导航脚本，结果不等于真人平衡或长期性能验收。',样本:results},null,2));
