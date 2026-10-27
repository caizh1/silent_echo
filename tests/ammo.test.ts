import { RifleSimulation as Simulation } from './rifle-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { blocked, distance, walls, supplySpots, visible } from '../src/simulation.ts';
import { AMMO, RELOAD_CUES } from '../src/ammo.ts';
import { createSupplyField } from '../src/supplies.ts';
import { assembleActor } from '../src/actor.ts';
import { loadPoseModel } from './load-model.ts';
import { createAmmoAudio } from '../src/ammo-audio.ts';

const still={x:0,z:0};
function fresh(random=()=>.99){const s=new Simulation(random);s.start();s.spawn=9999;return s;}
function advance(s:Simulation,seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++)s.step(1/60,still);}

test('开局弹药有限，最后一发后彻底停火，不会负弹药或无限换弹',()=>{
  const s=fresh(),target=s.addEnemy('shooter',{x:0,z:10});target.hp=target.maxHp=100000;target.attack=9999;
  advance(s,42);
  assert.equal(s.roundsFired,AMMO.magazine+AMMO.initialReserve);
  assert.equal(s.ammo,0);assert.equal(s.reserve,0);assert.equal(s.reload,0);
  assert.equal(s.requestReload(),false);advance(s,5);assert.equal(s.roundsFired,144);
});

test('提前换弹保留匣内余弹，只扣实际装填数量；备弹不足只装剩余数量',()=>{
  for(const reserve of [5,120]){
    const s=fresh();s.ammo=9;s.reserve=reserve;
    assert.equal(s.requestReload(),true);assert.equal(s.requestReload(),false);
    assert.equal(s.reserve,reserve);advance(s,.8);assert.equal(s.ammo,9);
    advance(s,1);assert.equal(s.ammo,Math.min(24,9+reserve));
    assert.equal(s.ammo+s.reserve,9+reserve);
  }
  const full=fresh();assert.equal(full.requestReload(),false);full.ammo=12;full.togglePause();assert.equal(full.requestReload(),false);
});

test('移动不打断换弹，声音节点各触发一次，暂停与强化不推进动作',()=>{
  const s=fresh();s.ammo=0;s.requestReload();let sounds:string[]=[];
  for(let i=0;i<24;i++){s.step(1/60,{x:-1,z:0});sounds.push(...s.audioEvents);}
  assert.ok(s.player.x<0);const remaining=s.reload;
  s.togglePause();advance(s,1);assert.equal(s.reload,remaining);assert.deepEqual(s.audioEvents,[]);
  s.togglePause();s.state='upgrade';advance(s,1);assert.equal(s.reload,remaining);s.choose(0);
  for(let i=0;i<85;i++){s.step(1/60,still);sounds.push(...s.audioEvents);}
  assert.deepEqual(sounds,RELOAD_CUES.map(c=>c.sound));assert.equal(s.ammo,24);assert.equal(s.reserve,96);
});

test('无弹药拾到弹药后自动换弹，恢复射击且经验不受弹药拾取影响',()=>{
  const s=fresh();s.ammo=s.reserve=0;const e=s.addEnemy('shooter',{x:0,z:10});e.attack=9999;
  advance(s,.1);assert.equal(s.roundsFired,0);
  s.drops.push({id:s.id++,x:s.player.x,z:s.player.z,value:12,kind:'ammo'});s.step(1/60,still);
  assert.equal(s.reserve,12);assert.equal(s.reload,AMMO.reloadSeconds);assert.equal(s.xp,0);
  assert.ok(s.audioEvents.includes('ammo-pickup'));advance(s,1.8);assert.ok(s.roundsFired>0);
  assert.equal(s.ammo+s.reserve+s.roundsFired,12);
});

test('普通敌人按概率掉弹，首领必掉，经验和弹药独立发放且死亡只结算一次',()=>{
  for(const [roll,expected]of [[.1,1],[.8,0]]){
    const s=fresh(()=>roll);const enemy=s.addEnemy('runner',{x:0,z:12});enemy.hp=0;s.step(1/60,still);
    assert.equal(s.drops.filter(d=>d.kind==='ammo').length,expected);
    assert.equal(s.drops.filter(d=>d.kind==='xp').length,1);assert.equal(s.kills,1);
    const count=s.drops.length;s.step(1/60,still);assert.equal(s.drops.length,count);assert.equal(s.kills,1);
  }
  const boss=fresh();boss.bossSpawned=true;boss.addEnemy('boss',{x:0,z:12}).hp=0;boss.step(1/60,still);
  assert.equal(boss.drops.find(d=>d.kind==='ammo')?.value,AMMO.bossRounds);
});

test('满备弹不吞掉拾取物，部分拾取保留剩余；补给箱只开一次',()=>{
  const s=fresh();s.reserve=s.maxReserve;
  s.crates.push({id:s.id++,...s.player,rounds:72});
  s.drops.push({id:s.id++,...s.player,value:12,kind:'ammo'});s.step(1/60,still);
  assert.equal(s.drops.length,1);assert.equal(s.crates[0].rounds,72);assert.equal(s.cratesOpened,0);
  s.reserve-=5;s.step(1/60,still);assert.equal(s.reserve,240);assert.equal(s.drops[0].value,7);
  s.drops=[];s.reserve-=20;s.step(1/60,still);
  assert.equal(s.crates[0].rounds,52);assert.equal(s.cratesOpened,1);assert.ok(s.audioEvents.includes('crate-open'));
  s.reserve-=52;s.step(1/60,still);assert.equal(s.crates[0].rounds,0);assert.equal(s.cratesOpened,1);
  assert.ok(!s.audioEvents.includes('crate-open'));advance(s,1.1);assert.equal(s.crates.some(c=>c.rounds===0),false);
});

test('隔墙不吸取弹药或打开补给箱',()=>{
  const s=fresh(),wall=walls.find(w=>w.x===6&&w.z===3)!;
  s.player.x=wall.x-wall.w/2-.39;s.player.z=wall.z;
  const across={x:wall.x+wall.w/2+.15,z:wall.z};
  assert.equal(visible(s.player,across),false);
  s.drops.push({id:s.id++,...across,value:12,kind:'ammo'});s.crates.push({id:s.id++,...across,rounds:72});
  const reserve=s.reserve;advance(s,.5);assert.equal(s.reserve,reserve);assert.equal(s.drops[0].x,across.x);assert.equal(s.cratesOpened,0);
});

test('补给候选点在开放街道，开局数量有界；四十五秒刷新且满额不堆叠',()=>{
  for(const spot of supplySpots)assert.equal(blocked(spot,.65),false);
  const s=fresh();s.step(1/60,still);assert.equal(s.crates.length,AMMO.initialCrates);
  const ids=s.crates.map(c=>c.id);s.time=45;s.step(1/60,still);assert.deepEqual(s.crates.map(c=>c.id),ids);
  s.crates[0].rounds=0;s.crates[0].emptiedAt=s.time-2;s.time=90;s.step(1/60,still);
  assert.equal(s.crates.filter(c=>c.rounds>0).length,3);assert.ok(s.crates.some(c=>!ids.includes(c.id)));
  for(const crate of s.crates)assert.equal(blocked(crate,.65),false);
});

test('弹药与箱体表现暂停不变，拾取和重开清除场景对象，几何与材质共用',()=>{
  const scene=new T.Scene(),field=createSupplyField(scene),s=fresh();s.step(1/60,still);
  s.drops.push({id:s.id++,x:0,z:10,value:12,kind:'ammo'});field.update(s);
  scene.updateMatrixWorld(true);const initial=scene.children.map(o=>o.matrixWorld.clone());s.togglePause();advance(s,3);field.update(s);scene.updateMatrixWorld(true);
  assert.ok(scene.children.every((o,i)=>o.matrixWorld.equals(initial[i])));
  const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  scene.traverse(o=>{if(o instanceof T.Mesh){geometry.add(o.geometry);materials.add(o.material as T.Material);}});
  assert.ok(geometry.size<=3&&materials.size<=5);
  field.update(new Simulation());assert.equal(scene.children.length,0);assert.deepEqual(field.stats(),{drops:0,crates:0});
});

test('实际步枪弹匣有取出行程，左手跟随动作，结束和重开后恢复枪口',async()=>{
  const [soldier,rifle]=await Promise.all([loadPoseModel('soldier-walk-v1.glb'),loadPoseModel('assault-rifle-textured-v1.glb')]);
  const actor=assembleActor(soldier,rifle),s=fresh();s.player.angle=s.player.moveAngle=0;actor.update(s,0);
  const initialMuzzle=actor.muzzlePosition(),initialMagazine=actor.measurePose().magazinePosition;
  s.ammo=3;s.requestReload();s.reload=1.1;actor.update(s,1/60);
  const pose=actor.measurePose();assert.ok(Math.hypot(...pose.magazinePosition.map((v,i)=>v-initialMagazine[i]))>.1);
  assert.ok(pose.rightGripError<.03&&pose.leftGripError<.03);
  s.reload=0;actor.update(s,0);assert.ok(actor.muzzlePosition().distanceTo(initialMuzzle)<.00001);
  s.reload=1.1;actor.update(s,0);const reset=fresh();reset.player.angle=reset.player.moveAngle=0;actor.update(reset,0);
  assert.ok(actor.muzzlePosition().distanceTo(initialMuzzle)<.00001);
});

test('换弹与补给音源都有限时结束，暂停清除未播放节点，非运行状态不创建音源',()=>{
  const sources:{stopAt?:number;onended?:()=>void;disconnected:boolean}[]=[],nodes:{disconnected:boolean}[]=[];
  const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>{const n={disconnected:false,connect(){},disconnect(){n.disconnected=true;}};nodes.push(n);return n;};
  const source=()=>{
    const n={...node(),frequency:parameter(),start(){},stop(at?:number){n.stopAt=at??10;},stopAt:undefined as number|undefined,onended:undefined as (()=>void)|undefined};
    // 覆盖对象复制后的断开标志，模拟真实节点的独立生命周期。
    n.disconnect=()=>{n.disconnected=true;};sources.push(n);return n;
  };
  const context={state:'running',sampleRate:48000,currentTime:10,destination:{},
    createBuffer:(_channels:number,length:number)=>({getChannelData:()=>new Float32Array(length)}),
    createBufferSource:source,createOscillator:source,
    createGain:()=>({...node(),gain:parameter()}),createBiquadFilter:()=>({...node(),frequency:parameter(),Q:parameter()}),
  };
  const sounds=createAmmoAudio(context as unknown as AudioContext);
  for(const event of ['magazine-out','magazine-in','bolt','ammo-pickup','crate-open','empty'] as const)sounds.play(event);
  assert.ok(sounds.activeVoices>0&&sounds.activeVoices<=12);
  assert.ok(sources.every(s=>s.stopAt!==undefined&&s.stopAt>10&&s.stopAt<=10.2));
  sources[0].onended?.();assert.equal(sources[0].disconnected,true);
  sounds.stop();assert.equal(sounds.activeVoices,0);assert.ok(sources.every(s=>s.disconnected));
  context.state='suspended';const count=sources.length;sounds.play('bolt');assert.equal(sources.length,count);
});
