import { RifleSimulation as Simulation } from './rifle-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { move, segmentBox, segmentCircle, visible, blocked, walls, DURATION, distance, type Vec } from '../src/simulation.ts';
const still={x:0,z:0};
function fresh(){const s=new Simulation(()=>.25);s.start();s.spawn=999;return s;}
function enemy(s:Simulation,x:number,z:number,hp=1000){s.enemies.push({id:s.id++,x,z,hp,maxHp:hp,kind:'shooter',attack:999});return s.enemies.at(-1)!;}

test('轴向与斜向移动速度相同',()=>{const a=fresh(),b=fresh();a.step(.1,{x:1,z:0});b.step(.1,{x:1,z:1});assert.ok(Math.abs(Math.hypot(a.player.x,a.player.z-5)-Math.hypot(b.player.x,b.player.z-5))<1e-9);});
test('高速移动不能穿越掩体或地图边界',()=>{const p={x:0,z:3};move(p,30,0);const wall=walls.find(w=>w.x===6&&w.z===3)!;assert.ok(p.x<wall.x-wall.w/2-.38);assert.equal(blocked(p),false);move(p,0,-60);assert.ok(p.z>=-22.62);});
test('线段与墙、目标相交位置精确并识别内部起点',()=>{const w={x:0,z:0,w:2,d:2,h:1};assert.equal(segmentBox({x:-3,z:0},{x:3,z:0},w),1/3);assert.equal(segmentCircle({x:-3,z:0},{x:3,z:0},{x:0,z:0},1),1/3);assert.equal(segmentCircle(still,{x:2,z:0},still,1),0);assert.equal(segmentBox({x:3,z:2},{x:-3,z:2},w),Infinity);});
test('玩家不锁定墙后或已经死亡的目标',()=>{const s=fresh();s.player.z=3;const hidden=enemy(s,9,3);const dead=enemy(s,1,3,0);s.step(1/60,still);assert.equal(s.target,undefined);assert.equal(s.ammo,24);assert.equal(visible(s.player,hidden),false);assert.equal(s.enemies.includes(dead),false);});
test('子弹连续碰撞击中近处敌人且不穿透',()=>{const s=fresh();const near=enemy(s,0,7,20);const far=enemy(s,0,9,20);s.fire=999;s.bullets.push({id:999,x:0,z:5,vx:0,vz:1000,damage:50,life:1,hostile:false});s.step(1/60,still);assert.equal(s.enemies.includes(near),false);assert.equal(far.hp,20);assert.equal(s.kills,1);assert.equal(s.bullets.length,0);});
test('墙先于敌人命中，敌方子弹也被墙阻挡',()=>{const s=fresh();s.player.z=3;const e=enemy(s,9,3);s.fire=999;s.bullets.push({id:998,x:0,z:3,vx:1000,vz:0,damage:50,life:1,hostile:false},{id:999,x:9,z:3,vx:-1000,vz:0,damage:50,life:1,hostile:true});s.step(1/60,still);assert.equal(e.hp,1000);assert.equal(s.player.hp,100);assert.equal(s.bullets.length,0);});
test('弹匣清空自动换弹且换弹期间不射击',()=>{const s=fresh();enemy(s,0,8);s.ammo=1;s.step(1/60,still);assert.equal(s.ammo,0);assert.ok(s.reload>0);for(let i=0;i<60;i++)s.step(1/60,still);assert.equal(s.ammo,0);for(let i=0;i<50;i++)s.step(1/60,still);assert.ok(s.ammo>0);});
test('暂停冻结时间、敌人、子弹和换弹',()=>{const s=fresh();enemy(s,0,8);s.step(1/60,still);s.togglePause();const before=JSON.stringify(s);for(let i=0;i<600;i++)s.step(1/60,{x:1,z:0});const after=JSON.stringify(s);assert.equal(after, before.replace(/"effects":\[.*?\],/, '"effects":[],'));s.togglePause();s.step(1/60,still);assert.ok(s.time>1/60);});
test('拾取升级暂停且一份强化不能重复选择',()=>{const s=fresh();s.drops.push({id:998,...s.player,value:8,kind:'xp'});s.step(1/60,still);assert.equal(s.state,'upgrade');const hp=s.player.hp;s.choose(2);s.choose(2);assert.equal(s.player.maxHp,120);assert.equal(s.player.hp,hp+20);assert.equal(s.upgrades,1);assert.equal(s.state,'playing');});
test('失败与胜利结算后状态不可继续推进',()=>{const a=fresh();a.player.hp=0;a.step(1/60,still);assert.equal(a.state,'lost');const time=a.time;a.step(3,still);assert.equal(a.time,time);const b=fresh();b.bossSpawned=b.bossDefeated=true;b.time=DURATION-1/120;b.step(1/60,still);assert.equal(b.state,'won');b.togglePause();assert.equal(b.state,'won');});
// 固定导航只用于验收：弹药不足寻找补给，其余时间收集经验；不额外注入子弹或伤害。
function supplyRoute(sim:Simulation,goal:Vec):Vec[]{
  const key=(p:Vec)=>`${p.x},${p.z}`;
  const locate=(p:Vec)=>{
    const candidates:Vec[]=[];
    for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
      const q={x:Math.round(p.x)+x,z:Math.round(p.z)+z};
      if(!blocked(q,.45)&&visible(q,p))candidates.push(q);
    }
    return candidates.sort((a,b)=>distance(a,p)-distance(b,p))[0];
  };
  const start=locate(sim.player),end=locate(goal);if(!start||!end)return [];
  const queue=[start],previous=new Map<string,Vec|null>([[key(start),null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    if(key(p)===key(end)){const path:Vec[]=[];let q:Vec|null=p;while(q){path.unshift(q);q=previous.get(key(q))!;}return path;}
    for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const q={x:p.x+dx,z:p.z+dz};
      if(!previous.has(key(q))&&!blocked(q,.45)){previous.set(key(q),p);queue.push(q);}
    }
  }
  return [];
}
test('三分钟有限弹药固定基准：寻补给、收经验与强化后通关，弹药守恒且数量有界',context=>{
 let seed=12;const s=new Simulation(()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;});s.start();
 // 此样本验证长局状态完整性，额外生命避免把战斗平衡混入状态机测试。
 s.player.hp=s.player.maxHp=10000;let maxEnemies=0,path:Vec[]=[];
 for(let i=0;i<12600&&s.state!=='won';i++){
   if(s.state==='upgrade')s.choose(0);
   if(i%30===0){
     const supplies=[...s.crates.filter(c=>c.rounds>0),...s.drops.filter(d=>d.kind==='ammo')].sort((a,b)=>distance(a,s.player)-distance(b,s.player));
     const xp=s.drops.filter(d=>d.kind==='xp').sort((a,b)=>distance(a,s.player)-distance(b,s.player));
     const goal=(s.reserve<48?supplies[0]:undefined)??xp[0]??s.enemies.find(e=>e.kind==='boss')??s.enemies[0];
     if(goal)path=supplyRoute(s,goal);
   }
   while(path.length&&distance(s.player,path[0])<.15)path.shift();
   const next=path[0],d=next?distance(s.player,next):0;
   s.step(1/60,d>0?{x:(next.x-s.player.x)/d,z:(next.z-s.player.z)/d}:still);
   maxEnemies=Math.max(maxEnemies,s.enemies.length);assert.ok(!blocked(s.player));assert.ok(s.bullets.length<150);
   assert.ok(s.ammo>=0&&s.ammo<=s.magazine&&s.reserve>=0&&s.reserve<=s.maxReserve);
   assert.equal(s.ammo+s.reserve+s.roundsFired,144+s.roundsCollected);
   if(!s.bossDefeated)assert.notEqual(s.state,'won');
 }
 assert.equal(s.state,'won');assert.ok(s.kills>20);assert.ok(maxEnemies<=28);assert.ok(s.upgrades>0);assert.ok(s.cratesOpened>0);
 context.diagnostic(`生存 ${s.time.toFixed(1)} 秒，击倒 ${s.kills}，射出 ${s.roundsFired} 发，拾取 ${s.roundsCollected} 发，打开 ${s.cratesOpened} 箱，余弹 ${s.ammo+s.reserve} 发`);
});
