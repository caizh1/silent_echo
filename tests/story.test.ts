import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chapters,sectors} from '../src/story-data.ts';
import {StorySession,findRoute,encodeSnapshot,decodeSnapshot,validSnapshot,writeCheckpoint,readCheckpoint,STORY_KEY,BACKUP_KEY} from '../src/story.ts';
import {defaultLoadout} from '../src/weapons.ts';

const still={x:0,z:0};
test('战役包含十六章四十区，事件标识唯一，目标时长为三小时',()=>{
 assert.equal(chapters.length,16);assert.equal(sectors.length,40);assert.equal(chapters.reduce((n,c)=>n+c.minutes,0),180);
 const ids=sectors.flatMap(s=>[s.id,...s.tasks.map(t=>t.id)]);assert.equal(new Set(ids).size,ids.length);
 assert.equal(sectors.filter(s=>s.tasks.some(t=>t.kind==='boss')).length,3);
 assert.ok(sectors.every((s,i)=>s.index===i&&s.tasks.length===6&&s.record.length>20));
});
test('四十个分区依次开门后，主角、军医可到达每个目标与出口',()=>{
 const run=new StorySession();
 for(const sector of sectors){run.startChapter(sector.chapter,defaultLoadout());while(run.sectorIndex<sector.index){run.taskIndex=run.sector.tasks.length;run.nextSector();}
  for(let i=0;i<sector.tasks.length;i++){const goal=sector.tasks[i];assert.ok(findRoute(run.sim,run.sim.player,goal.position).length,`${sector.name}/${goal.name}`);Object.assign(run.sim.player,goal.position);run.taskIndex=i+1;(run as any).rebuildWalls();}
  assert.ok(findRoute(run.sim,run.sim.player,sector.exit).length,`${sector.name}出口`);
 }
});
test('无遭遇分区不按全局时间刷怪、生成首领或无限发补给',()=>{
 const run=new StorySession();const crates=run.sim.crates.length;for(let i=0;i<3600;i++)run.step(.05,still);
 assert.equal(run.sim.enemies.length,0);assert.equal(run.sim.crates.length,crates);assert.equal(run.sim.state,'playing');assert.equal(run.taskIndex,0);
});
test('交互遵守距离、前置门禁和暂停，完成后不重复执行',()=>{
 const run=new StorySession();run.interact(50);assert.equal(run.taskIndex,0);run.taskIndex=1;(run as any).rebuildWalls();const task=run.task!;Object.assign(run.sim.player,task.position);run.sim.state='paused';run.interact(50);assert.equal(run.taskIndex,1);run.sim.state='playing';run.interact(5);assert.equal(run.taskIndex,2);assert.ok(run.completed.has(task.id));const n=run.transcript.length;run.interact(3);assert.equal(run.taskIndex,2);assert.equal(run.transcript.length,n);
});
test('检查点完整保存三种武器、资源、已读剧情与地图状态，损坏时恢复备份',()=>{
 for(const weapon of ['pistol','smg','rifle'] as const){const run=new StorySession(defaultLoadout(weapon));run.sim.ammo=3;run.sim.reserve=37;run.sim.grenadeCount=1;run.flags.add('evidence-time');const snapshot=run.checkpoint();assert.ok(validSnapshot(snapshot));const restored=decodeSnapshot(encodeSnapshot(snapshot));assert.ok(restored);const next=new StorySession(defaultLoadout(),restored);assert.equal(next.sim.weapon,weapon);assert.equal(next.sim.ammo,3);assert.equal(next.sim.reserve,37);assert.equal(next.sim.grenadeCount,1);assert.ok(next.flags.has('evidence-time'));assert.deepEqual(next.explored,run.explored);
 const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};assert.ok(writeCheckpoint(snapshot,storage));assert.ok(writeCheckpoint(snapshot,storage));data.set(STORY_KEY,'损坏记录');assert.ok(data.has(BACKUP_KEY));assert.ok(readCheckpoint(storage).snapshot);assert.equal(writeCheckpoint(snapshot,{getItem(){throw Error('拒绝');},setItem(){throw Error('拒绝');}}),false);}
});
test('军医加入、分开、再次加入和小队同行状态可恢复',()=>{
 const run=new StorySession();run.startChapter(3,defaultLoadout());assert.deepEqual(run.companions.map(c=>c.id),['evelyn']);run.startChapter(6,defaultLoadout());assert.equal(run.companions.length,0);run.startChapter(9,defaultLoadout());assert.deepEqual(run.companions.map(c=>c.id),['hayes','pierce']);run.startChapter(11,defaultLoadout());assert.equal(run.companions.length,3);run.command('hold');const saved=run.checkpoint();const next=new StorySession(defaultLoadout(),saved);assert.ok(next.companions.every(c=>c.command==='hold'));assert.equal(new Set(next.companions.map(c=>c.id)).size,3);
});
test('空袭必须解锁、侦察和避开友军；任务支援独立于自由次数',()=>{
 const run=new StorySession();assert.match(run.canStrike({x:0,z:0}),/尚未/);run.startChapter(8,defaultLoadout());run.taskIndex=run.sector.tasks.length;run.nextSector();run.sim.enemies=[];run.taskIndex=run.sector.tasks.findIndex(t=>t.kind==='strike');(run as any).rebuildWalls();const task=run.task!;run.airCharges=0;Object.assign(run.sim.player,{x:task.position.x,z:task.position.z+15});run.companions.forEach(c=>Object.assign(c,{x:run.sim.player.x,z:run.sim.player.z+2}));run.explored.add(`${Math.floor(task.position.x/6)},${Math.floor(task.position.z/6)}`);assert.equal(run.canStrike(task.position,true),'');assert.ok(run.callStrike(task.position));assert.equal(run.airCharges,0);const taskId=task.id;for(let i=0;i<90;i++)run.step(.05,still);assert.ok(run.completed.has(taskId));assert.equal(run.strikes.length,0);const restored=new StorySession(defaultLoadout(),run.checkpoint());assert.equal(restored.strikes.length,0);
});
test('主角倒地后同伴能够救援，全队倒地才失败',()=>{
 const run=new StorySession();run.join('evelyn');run.sim.enemies=[];run.sim.player.hp=0;Object.assign(run.companions[0],{x:run.sim.player.x+1,z:run.sim.player.z});for(let i=0;i<110;i++)run.step(.05,still);assert.ok(run.sim.player.hp>0);assert.equal(run.sim.state,'playing');run.sim.player.hp=0;run.companions[0].hp=0;run.step(.05,still);assert.equal(run.sim.state,'lost');
});
test('同伴不会隔墙射击，也不会读取或改变主角弹药池',()=>{
 const run=new StorySession();run.join('hayes');run.sim.ammo=0;run.sim.reserve=0;const c=run.companions[0];const enemy=run.sim.addEnemy('runner',{x:c.x,z:c.z-10});enemy.mutation='wanderer';enemy.modifiers={speed:0};for(let i=0;i<30;i++)run.step(.05,still);assert.ok(c.ammo<24);assert.equal(run.sim.ammo,0);assert.equal(run.sim.reserve,0);
});

test('同伴贴近建筑边缘后仍可重新寻路，不因半径差异困住',()=>{
 const run=new StorySession();run.startChapter(9,defaultLoadout());run.taskIndex=run.sector.tasks.length;(run as any).rebuildWalls();run.sim.enemies=[];
 Object.assign(run.sim.player,{x:.7612834,z:-143.449033});const c=run.companions[1];Object.assign(c,{x:18.14036308437679,z:-128.1853423956142});
 assert.ok(findRoute(run.sim,c,run.sim.player,.34).length);for(let i=0;i<600;i++)run.step(1/60,still);assert.ok(Math.hypot(c.x-run.sim.player.x,c.z-run.sim.player.z)<7);
});

test('跨分区保持医疗剩余冷却且自动补给优先照顾缺弹队友',()=>{
 const run=new StorySession();run.startChapter(11,defaultLoadout());const medic=run.companions.find(c=>c.id==='evelyn')!;medic.healAt=110;run.sim.time=100;
 run.taskIndex=run.sector.tasks.length;run.nextSector();assert.equal(medic.healAt,10);
 run.sim.enemies=[];run.sim.reserve=240;run.companions.forEach(c=>{c.reserve=0;});Object.assign(run.sim.player,run.sim.crates[0]);run.step(1/60,still);
 assert.ok(run.companions.every(c=>c.reserve>0));assert.equal(run.sim.reserve,240);
});

test('团灭不能用无法恢复的死亡状态覆盖检查点',()=>{
 const run=new StorySession();const previous=run.checkpoint();run.sim.player.hp=0;run.sim.state='lost';assert.deepEqual(run.checkpoint(),previous);assert.equal(run.lastCheckpoint?.sim.player!==undefined,true);run.restartCheckpoint();assert.ok(run.sim.player.hp>0);
});

test('畸形存档和未知模型不能进入恢复流程',()=>{
 const run=new StorySession();for(const mutate of [(v:any)=>{v.sim.loadout={};},(v:any)=>{v.sim.player.angle='无效';},(v:any)=>{v.sim.enemies=[{x:0,z:0,hp:1,id:9,kind:'unknown'}];},(v:any)=>{v.companions=[{id:'stranger'}];}]){const data=JSON.parse(JSON.stringify(run.checkpoint()));mutate(data);assert.equal(validSnapshot(data),false);assert.equal(decodeSnapshot(encodeSnapshot(data)),undefined);}
});

test('医疗补给不会因弹药已取走而消失，领取后不能重复回血',()=>{
 const run=new StorySession();const crate=run.sim.crates[0];Object.assign(run.sim.player,crate);run.sim.reserve=0;run.step(1/60,still);assert.equal(crate.rounds,0);assert.equal(crate.aidUsed,undefined);
 run.sim.player.hp=50;run.step(1/60,still);assert.equal(run.sim.player.hp,68);run.sim.player.hp=50;run.step(1/60,still);assert.equal(run.sim.player.hp,50);
});

test('危险战斗中的存档请求延后，脱离威胁后自动更新稳定检查点',()=>{
 const run=new StorySession();const previous=run.checkpoint();run.sim.player.hp=70;const enemy=run.sim.addEnemy('runner',{x:run.sim.player.x+2,z:run.sim.player.z});enemy.modifiers={speed:0};
 assert.deepEqual(run.checkpoint(),previous);run.sim.enemies=[];run.step(1/60,still);assert.equal((run.lastCheckpoint!.sim.player as {hp:number}).hp,70);
});

test('主角倒地时不能触发全员登机结局',()=>{
 const run=new StorySession();run.startChapter(15,defaultLoadout());while(run.sector.id!=='extraction-deck'){run.taskIndex=run.sector.tasks.length;run.nextSector();}run.taskIndex=run.sector.tasks.length-1;(run as any).rebuildWalls();run.sim.enemies=[];
 Object.assign(run.sim.player,run.task!.position);run.sim.player.hp=0;run.companions.forEach(c=>Object.assign(c,run.task!.position));run.step(1/60,still);assert.equal(run.finished,false);assert.equal(run.sim.state,'playing');
});

test('掩体边缘留出弹道宽度，不锁定并耗尽打在墙角上的弹药',()=>{
 const run=new StorySession();run.sim.walls.splice(0,run.sim.walls.length,{x:5,z:1.04,w:1,d:2,h:2});Object.assign(run.sim.player,{x:0,z:0});
 const enemy=run.sim.addEnemy('runner',{x:10,z:0});enemy.modifiers={speed:0};assert.equal(run.sim.visible(run.sim.player,enemy),true);assert.equal(run.sim.hasShot(run.sim.player,enemy),false);
 const ammo=run.sim.ammo;run.sim.step(1/60,still);assert.equal(run.sim.target,undefined);assert.equal(run.sim.ammo,ammo);
});

test('剧情战役的枪口能越过矮设备，弹道与锁定使用相同高度判断',()=>{
 const run=new StorySession();run.sim.walls.splice(0,run.sim.walls.length,{x:5,z:0,w:1,d:2,h:1.1});Object.assign(run.sim.player,{x:0,z:0});const e=run.sim.addEnemy('runner',{x:10,z:0});e.modifiers={speed:0};
 assert.equal(run.sim.hasShot(run.sim.player,e),true);const hp=e.hp;for(let i=0;i<20;i++)run.sim.step(1/60,still);assert.ok(e.hp<hp);
});
