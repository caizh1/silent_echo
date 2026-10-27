import { RifleSimulation as Simulation } from './rifle-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walls, blocked, move, visible, DURATION } from '../src/simulation.ts';
import { scenery } from '../src/level.ts';
import { enemySpecs, type EnemyKind } from '../src/enemies.ts';
import { modelData } from '../src/model-data.ts';

const still={x:0,z:0};
function fresh(){const sim=new Simulation(()=>.25);sim.start();sim.spawn=9999;sim.fire=9999;return sim;}
function advance(sim:Simulation,seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++)sim.step(1/60,still);}

test('十项模型均有运行副本、有效几何、内嵌贴图和统一地面高度',()=>{
  for(const [id,entry] of Object.entries(modelData)){
    const raw=readFileSync(new URL('../public'+entry.url,import.meta.url));
    assert.equal(raw.toString('ascii',0,4),'glTF');assert.equal(raw.readUInt32LE(8),raw.length);
    const gltf=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString());
    assert.equal(gltf.meshes.length,1);assert.equal(gltf.meshes[0].primitives.length,1);
    const primitive=gltf.meshes[0].primitives[0];
    assert.equal(gltf.accessors[primitive.indices].count/3,entry.triangles);
    if(id!=='enemy-weapon')assert.equal(gltf.images.length,3);
    assert.ok(entry.size.every(value=>value>0));
    assert.ok(gltf.accessors[primitive.attributes.POSITION].min[1]>=-.001);
  }
});

test('所有地图物件均有阻挡，初始出生点与各入口保持可行走',()=>{
  assert.equal(scenery.length,walls.length);assert.equal(blocked({x:0,z:5}),false);
  for(const wall of walls){assert.ok(blocked(wall));assert.equal(visible({x:wall.x-wall.w/2-2,z:wall.z},{x:wall.x+wall.w/2+2,z:wall.z}),false);}
  for(const prop of scenery.filter(p=>p.burning)){
    const wall=walls[scenery.indexOf(prop)],p={x:prop.x-wall.w/2-1,z:prop.z};move(p,wall.w+2,0);
    assert.ok(p.x<wall.x-wall.w/2-.38);assert.equal(blocked(p),false);
  }
});

test('射手有蓄力预警，弹道瞄准预警时的位置',()=>{
  const s=fresh();const e=s.addEnemy('shooter',{x:0,z:10});e.attack=0;
  s.step(1/60,still);assert.ok(e.windup!>0);assert.equal(s.bullets.length,0);
  s.player.x=-4;advance(s,.56);assert.ok(s.bullets.some(b=>b.hostile));assert.ok(s.bullets.every(b=>Math.abs(b.vx)<.001));
});

test('喷射者发射三枚散射弹，掩体仍阻挡其攻击',()=>{
  const s=fresh();const e=s.addEnemy('spitter',{x:0,z:11});e.attack=0;advance(s,1.05);
  assert.equal(s.bullets.filter(b=>b.hostile).length,3);assert.ok(s.bullets.some(b=>b.vx<0)&&s.bullets.some(b=>b.vx>0));
  const hidden=fresh();hidden.player.z=3;const other=hidden.addEnemy('spitter',{x:9,z:3});other.attack=0;advance(hidden,.5);assert.equal(other.windup,0);
});

test('扑击预警可以躲开，冲刺不能穿过车辆',()=>{
  const s=fresh();const e=s.addEnemy('pouncer',{x:0,z:10});e.attack=0;s.step(1/60,still);s.player.x=-4;advance(s,1.6);assert.equal(s.player.hp,100);
  const obstacle=scenery.find(p=>p.asset==='burned-police-car')!,wall=walls[scenery.indexOf(obstacle)];
  const charger=fresh();const beast=charger.addEnemy('pouncer',{x:wall.x-wall.w/2-1,z:wall.z});beast.charge=1;beast.aim={x:1,z:0};advance(charger,.8);
  assert.equal(blocked(beast,enemySpecs.pouncer.radius),false);assert.ok(beast.x<wall.x-wall.w/2);
});

test('首领预警区内受伤，躲出预警区不受伤',()=>{
  for(const dodge of [false,true]){
    const s=fresh();const boss=s.addEnemy('boss',{x:0,z:9});boss.attack=0;s.step(1/60,still);
    assert.ok(boss.windup!>0);if(dodge)s.player.x=-4;advance(s,1.25);assert.equal(s.player.hp,dodge?100:70);
  }
});

test('首领只出现一次，存活时不会错误通关，击败后可以结束',()=>{
  const s=fresh();s.player.hp=10000;s.time=120;s.step(1/60,still);assert.equal(s.enemies.filter(e=>e.kind==='boss').length,1);
  advance(s,.1);assert.equal(s.enemies.filter(e=>e.kind==='boss').length,1);s.time=DURATION;s.step(1/60,still);assert.equal(s.state,'playing');
  const boss=s.enemies.find(e=>e.kind==='boss')!;boss.hp=0;s.step(1/60,still);assert.equal(s.bossDefeated,true);assert.equal(s.state,'won');
});

test('暂停冻结五类敌人的蓄力与冲刺状态',()=>{
  const s=fresh();(['runner','shooter','pouncer','spitter','boss'] as EnemyKind[]).forEach((kind,index)=>{const e=s.addEnemy(kind,{x:index-2,z:10});e.windup=.8;e.aim={x:0,z:5};});
  s.togglePause();const before=JSON.stringify(s.enemies);advance(s,3);assert.equal(JSON.stringify(s.enemies),before);
});

test('首领在地图各侧均能刷出，位置保持足够体型间距',()=>{
  for(const player of [{x:0,z:5},{x:0,z:-20},{x:20,z:0},{x:-20,z:0}]){
    let seed=42;const s=new Simulation(()=>{seed=seed*16807%2147483647;return (seed-1)/2147483646;});
    s.start();s.spawn=9999;s.fire=9999;s.player={...s.player,...player,hp:10000};s.time=120;
    advance(s,1);const boss=s.enemies.find(e=>e.kind==='boss');assert.ok(boss);assert.equal(blocked(boss,enemySpecs.boss.radius),false);
  }
});
