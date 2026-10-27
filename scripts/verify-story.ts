import {StorySession,findRoute} from '../src/story.ts';
import {distance,type Vec} from '../src/simulation.ts';
import {defaultLoadout,type WeaponId} from '../src/weapons.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
const weapon=(process.argv[2]??'rifle') as WeaponId,seed=Number(process.argv[3]??42);
const run=new StorySession(defaultLoadout(weapon));run.rng=seed;
let route:Vec[]=[],lastGoal='',lastArea='',frames=0,idle=0,lastProgress='',replans=0;
const areas:Record<string,unknown>[]=[];let started=0;let retries=0,checkpointRetries=0,checkpointKey='',attemptTime=0;let reachableSupplies:(Vec&{rounds:number;medical?:number;aidUsed?:boolean})[]=[];
for(;frames<60*60*60*3&&!run.finished;frames++){
 if(run.sim.state==='lost'&&checkpointRetries<6){checkpointRetries++;retries++;console.log(JSON.stringify({事件:'检查点重试',分区:run.sectorIndex+1,次数:checkpointRetries}));run.restartCheckpoint();route=[];lastGoal='';idle=0;continue;}
 if(run.sim.state==='lost'){console.log(JSON.stringify({结果:'失败',武器:weapon,随机种子:seed,区域:run.sector.name,目标:run.task?.name,生命:run.sim.player.hp,位置:run.sim.player,敌人:run.sim.enemies.map(e=>({x:e.x,z:e.z,hp:e.hp,类型:e.mutation,静默:e.dormant}))}));break;}
 if(run.sim.state==='upgrade')run.sim.choose(run.sim.player.hp<65||checkpointRetries%2?2:0);
 const ck=`${run.lastCheckpoint?.sector}/${run.lastCheckpoint?.task}`;if(ck!==checkpointKey){checkpointKey=ck;checkpointRetries=0;}
 if(lastArea!==run.sector.id){if(lastArea)areas.push({区域:lastArea,耗时:Math.round(run.elapsed-started),剩余生命:Math.round(run.sim.player.hp)});lastArea=run.sector.id;reachableSupplies=[];started=run.elapsed;console.log(JSON.stringify({进入:run.sectorIndex+1,区域:run.sector.name,生命:Math.round(run.sim.player.hp),备弹:run.sim.reserve}));route=[];}
 const sim=run.sim,task=run.task,active=sim.enemies.filter(e=>!e.dormant&&e.hp>0),near=active.sort((a,b)=>distance(a,sim.player)-distance(b,sim.player));
 let goal:Vec=task?.position??run.sector.exit,interact=true,resupplying=false;
 const down=run.companions.filter(c=>c.hp<=0).sort((a,b)=>distance(a,sim.player)-distance(b,sim.player));
 if((sim.reserve<30||sim.player.hp<60)&&(frames%60===0||reachableSupplies.length===0))reachableSupplies=sim.crates.filter(c=>(c.rounds>0||(!c.aidUsed&&(c.medical??0)>0))&&!sim.blocked(c)&&!run.world.gates.some(g=>run.taskIndex<=g.after&&c.z<g.wall.z)).sort((a,b)=>distance(a,sim.player)-distance(b,sim.player));
 const ammo=reachableSupplies.filter(c=>c.rounds>0),medical=reachableSupplies.filter(c=>!c.aidUsed&&(c.medical??0)>0);
 if(down.length){goal=down[0];interact=true;resupplying=true;}
 else if(sim.player.hp<60&&medical.length){goal=medical[0];interact=false;resupplying=true;}
 else if(sim.reserve<30&&ammo.length){goal=ammo[0];interact=false;resupplying=true;}
 else if(task?.kind==='strike'){
  const p={x:task.position.x,z:task.position.z+15};goal=p;
  if(distance(sim.player,p)<2&&!run.strikes.length){if(!run.callStrike(task.position)){run.command('follow');}}
 }else if(task?.kind==='defend'&&run.defendAt>=0&&near.length){goal=near[0];interact=false;}
 else if(task?.kind==='boss'&&near.length){goal=near[0];interact=false;}
 if(task&&!resupplying&&distance(sim.player,task.position)<4){const blocker=near.find(e=>distance(e,task.position)<6&&!sim.hasShot(sim.player,e));if(blocker){goal=blocker;interact=false;}}
 const visibleThreat=near.find(e=>distance(e,sim.player)<sim.range-2&&sim.hasShot(sim.player,e));if(visibleThreat&&!resupplying&&sim.ammo+sim.reserve>30&&distance(visibleThreat,sim.player)>8){goal={x:sim.player.x,z:sim.player.z};interact=false;}
 if(run.strikes.some(s=>distance(s,goal)<12)){goal={x:sim.player.x,z:sim.player.z};interact=false;}
 const goalKey=`${run.sectorIndex}/${Math.round(goal.x)}/${Math.round(goal.z)}`;
 if(goalKey!==lastGoal||(frames%30===0&&(!route.length||distance(sim.player,route[0])>3))){route=findRoute(sim,sim.player,goal);lastGoal=goalKey;replans++;}
 while(route.length&&distance(sim.player,route[0])<.22)route.shift();const next=route[0];let input={x:0,z:0};if(next&&distance(sim.player,goal)>1){const d=distance(sim.player,next);input={x:(next.x-sim.player.x)/Math.max(.1,d),z:(next.z-sim.player.z)/Math.max(.1,d)};}
 if(task&&distance(sim.player,task.position)<2.4&&sim.visible(sim.player,task.position)&&interact)input={x:0,z:0};
 let away={x:0,z:0};let danger=false;
 for(const e of near){const d=distance(e,sim.player);if(d<(e.kind==='boss'?11:e.kind==='pouncer'?8:7)&&sim.hasShot(e,sim.player)&&['runner','pouncer','boss'].includes(e.kind)){away.x+=(sim.player.x-e.x)/Math.max(.1,d);away.z+=(sim.player.z-e.z)/Math.max(.1,d);danger=true;}if(e.windup&&e.aim&&distance(e.aim,sim.player)<(e.kind==='boss'?5:2)){away.x+=sim.player.z-e.z;away.z-=sim.player.x-e.x;danger=true;}}
 if(run.strikes.some(s=>distance(s,sim.player)<11))danger=true;
 if(danger){
  let best=-Infinity,bestInput={x:0,z:0};
  for(let k=0;k<24;k++){const angle=(k+checkpointRetries*.25)*Math.PI*2/24,dx=Math.sin(angle),dz=Math.cos(angle),p={x:sim.player.x+dx*1.2,z:sim.player.z+dz*1.2};if(sim.blocked(p,.42)||!sim.visible(sim.player,p))continue;
   const melee=near.filter(e=>['runner','pouncer','boss'].includes(e.kind));const closest=Math.min(...melee.map(e=>distance(e,p)),10);let score=closest-distance(p,goal)*.018;for(const strike of run.strikes)if(distance(p,strike)<11)score-=50+(11-distance(p,strike))*5;
   for(const e of near)if(e.windup&&e.aim&&distance(p,e.aim)<(e.kind==='boss'?4.5:1.8))score-=15;
   for(const bullet of sim.bullets)if(bullet.hostile&&distance(p,{x:bullet.x+bullet.vx*.15,z:bullet.z+bullet.vz*.15})<1)score-=8;
   if(score>best){best=score;bestInput={x:dx,z:dz};}
  }
  if(best>-Infinity){input=bestInput;interact=false;}
 }
 if(run.airCharges>0&&near.length>=(checkpointRetries?2:3)&&task?.kind!=='strike'&&frames%60===0){const targets=near.filter(e=>distance(e,sim.player)>12);const p=targets[0];if(p&&!run.canStrike(p,false))run.callStrike(p);}
 if(sim.target&&distance(sim.target,sim.player)<8&&(near.filter(e=>distance(e,sim.target!)<4).length>=2||sim.target.kind==='boss'))sim.throwGrenade();
 const progress=`${run.sectorIndex}/${run.taskIndex}/${sim.kills}`;if(progress!==lastProgress){lastProgress=progress;idle=0;}else idle++;
 run.step(1/60,input,interact);attemptTime+=1/60;
 if(idle>60*180){console.log(JSON.stringify({结果:'停滞',区域:run.sector.name,目标:task?.name,位置:sim.player,路径长度:route.length,提示:run.notice,备弹:sim.reserve,同伴:run.companions.map(c=>({...c,路径:findRoute(sim,c,sim.player).slice(0,8)})),敌人:near.map(e=>({x:e.x,z:e.z,hp:e.hp,静默:e.dormant}))}));break;}
 if(frames%1800===0)await new Promise(r=>setTimeout(r,0));
}
areas.push({区域:lastArea,耗时:Math.round(run.elapsed-started),剩余生命:Math.round(run.sim.player.hp)});
const report={导航版本:'距离控制、视线与空袭规避',说明:'正常生命、正常伤害、有限弹药与实际寻路；固定自动驾驶样本，不能替代真人时长与难度验收。',武器:weapon,随机种子:seed,结果:run.finished?'通关':'未通过',分区:run.sectorIndex+1,用时秒:Math.round(run.elapsed),含重试用时秒:Math.round(attemptTime),检查点重试:retries,帧数:frames,重算路线:replans,分区结果:areas};
mkdirSync('.runtime/story',{recursive:true});writeFileSync(`.runtime/story/route-${weapon}-${seed}${process.argv[4]?'-'+process.argv[4].replace(/[^a-z0-9-]/gi,''):''}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!run.finished)process.exitCode=1;
