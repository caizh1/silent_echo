import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { Simulation, walls, visible } from '../src/simulation.ts';
import { defaultLoadout, loadoutStats, normalizeLoadout, weaponIds, weaponSpecs, GRENADE, type WeaponId, type AttachmentSlot } from '../src/weapons.ts';
import { assembleActor } from '../src/actor.ts';
import { assembleGrenadeField } from '../src/grenades.ts';
import { loadPoseModel } from './load-model.ts';
import { muzzlePosition } from '../src/ballistics.ts';
import { loadoutPanel, upgradePanel } from '../src/ui.ts';

const still = { x: 0, z: 0 };
function fresh() { const sim = new Simulation(() => .5); sim.start(); sim.spawn = sim.fire = 999; return sim; }
function advance(sim: Simulation, seconds: number) { for(let i=0;i<Math.ceil(seconds*60);i++)sim.step(1/60,still); }

test('默认手枪与三种兼容配置：属性生效，非法和重复配件确定性过滤', () => {
  const sim = new Simulation();assert.equal(sim.weapon,'pistol');assert.equal(sim.ammo,12);assert.equal(sim.grenadeCount,3);
  for(const weapon of weaponIds){
    const base=loadoutStats(defaultLoadout(weapon)), equipped=loadoutStats({weapon,attachments:['optic','magazine','stock','grip']});
    assert.equal(equipped.magazine,base.magazine*1.5);assert.ok(equipped.interval<base.interval);assert.ok(equipped.spread<base.spread);
    assert.equal(equipped.damage,base.damage);
  }
  assert.deepEqual(normalizeLoadout({weapon:'pistol',attachments:['grip','stock','stock','optic']}),{weapon:'pistol',attachments:['optic','stock']});
  assert.ok(!loadoutPanel(defaultLoadout()).includes('undefined'));
  assert.equal((loadoutPanel(defaultLoadout()).match(/data-weapon=/g)||[]).length,3);
});

test('战前配置按选择填装；开战、暂停和升级期间不能改装或凭空增弹', () => {
  const sim=new Simulation();assert.ok(sim.configureLoadout({weapon:'smg',attachments:['magazine','stock']}));
  assert.equal(sim.magazine,36);assert.equal(sim.ammo,36);
  const external=sim.loadout;external.attachments.length=0;assert.equal(sim.loadout.attachments.length,2);
  sim.start();sim.ammo=4;sim.reserve=17;
  for(const state of ['playing','paused','upgrade','lost','won'] as const){
    sim.state=state;assert.equal(sim.configureLoadout({weapon:'rifle',attachments:[]}),false);assert.equal(sim.ammo+sim.reserve,21);assert.equal(sim.weapon,'smg');
  }
});

test('固定射击样本：瞄具减少真实弹道散布并提高命中率', context => {
  const rates:number[]=[];
  for(const equipped of [false,true]){
    let seed=7;const sim=new Simulation(()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;},{weapon:'pistol',attachments:equipped?['optic']:[]});
    sim.start();sim.spawn=999;sim.ammo=2000;sim.reserve=0;
    const enemy=sim.addEnemy('shooter',{x:0,z:13});enemy.hp=enemy.maxHp=100000;enemy.attack=999;
    let hits=0;
    // 固定充足弹药和射击调度，只测实际弹道命中，不作为正常难度或经济验收。
    for(let i=0;i<1200;i++){sim.fire=0;sim.step(1/60,still);hits+=sim.effects.filter(e=>e.type==='hit'&&e.surface==='body').length;}
    rates.push(hits/sim.roundsFired);
  }
  assert.ok(rates[1]>rates[0]+.15);context.diagnostic(`无瞄具 ${(rates[0]*100).toFixed(1)}%，安装瞄具 ${(rates[1]*100).toFixed(1)}%，各一千二百发固定样本`);
});

test('扩容弹匣换弹只扣实际装填量，三种枪弹药守恒', () => {
  for(const weapon of weaponIds){
    const sim=new Simulation(()=>.5,{weapon,attachments:['magazine']});sim.start();sim.spawn=sim.fire=999;sim.ammo=3;sim.reserve=7;
    assert.ok(sim.requestReload());advance(sim,1.8);assert.equal(sim.ammo,10);assert.equal(sim.reserve,0);
    assert.equal(sim.ammo+sim.reserve+sim.roundsFired,10);
  }
});

test('固定六十赫兹下的小幅射速加成真实生效，长时间空闲后不会补发积压子弹', () => {
  for(const weapon of weaponIds)for(const attachments of [[],['stock'],...(weapon==='pistol'?[]:[['grip']])] as AttachmentSlot[][]){
    const sim=new Simulation(()=>.5,{weapon,attachments});sim.start();sim.spawn=999;sim.ammo=10000;
    advance(sim,8);
    const enemy=sim.addEnemy('shooter',{x:0,z:11});enemy.hp=enemy.maxHp=100000;enemy.attack=999;
    advance(sim,30);
    assert.ok(Math.abs(sim.roundsFired-30/loadoutStats({weapon,attachments}).interval)<1.5,`${weapon}配置${attachments}实际发射${sim.roundsFired}发`);
  }
});

test('真实连续开火保持手枪、冲锋枪、步枪三档射速，在不同帧率下与配置一致', context => {
  for (const fps of [30, 60, 120]) {
    const counts = weaponIds.map(weapon => {
      const sim = new Simulation(() => .5, defaultLoadout(weapon));
      sim.start(); sim.spawn = 999; sim.ammo = 1000;
      const target = sim.addEnemy('shooter', { x: 0, z: 11 }); target.hp = target.maxHp = 100000; target.attack = 999;
      for (let i = 0; i < fps * 6; i++) sim.step(1 / fps, still);
      assert.ok(Math.abs(sim.roundsFired - 6 / sim.fireInterval) <= 1, `${weapon}在${fps}帧下的真实射速偏离配置`);
      return sim.roundsFired;
    });
    assert.ok(counts[1] >= counts[0] * 2.5, '冲锋枪连射必须明显快于手枪');
    assert.ok(counts[2] >= counts[1] * 1.5, '突击步枪连射必须明显快于冲锋枪');
    context.diagnostic(`${fps}帧下持续六秒：手枪${counts[0]}发、冲锋枪${counts[1]}发、步枪${counts[2]}发`);
  }
});

test('全部四十种配件组合反复强化仍保留武器档次，上限不会空耗强化或被快捷键绕过', () => {
  for (const [index, weapon] of weaponIds.entries()) {
    const slots = weaponSpecs[weapon].slots;
    for (let mask = 0; mask < 2 ** slots.length; mask++) {
      const attachments = slots.filter((_, bit) => mask & (1 << bit));
      const sim = new Simulation(() => .5, { weapon, attachments });
      sim.start();
      let choices = 0;
      while (sim.canUpgradeFireRate) {
        assert.ok(choices++ < 10, '射速强化必须在有限次数内达到上限');
        const before = sim.fireInterval;
        sim.state = 'upgrade'; sim.choose(1);
        assert.ok(sim.fireInterval < before); assert.equal(sim.state, 'playing');
      }
      assert.equal(sim.fireInterval, weaponSpecs[weapon].minInterval);
      if (index < weaponIds.length - 1) assert.ok(sim.fireInterval > loadoutStats(defaultLoadout(weaponIds[index + 1])).interval);
      const upgrades = sim.upgrades, capped = sim.fireInterval;
      sim.state = 'upgrade';
      assert.match(upgradePanel(sim), /data-choice="1" disabled/);
      sim.choose(1); sim.choose(1);
      assert.equal(sim.upgrades, upgrades); assert.equal(sim.state, 'upgrade'); assert.equal(sim.fireInterval, capped);
      sim.choose(0);
      assert.equal(sim.upgrades, upgrades + 1); assert.equal(sim.state, 'playing');
    }
  }
});

test('装备页显示三档基础射速，强化页按实际剩余额度显示并在重开时恢复', () => {
  const sim = new Simulation();
  const html = loadoutPanel(sim.loadout);
  for (const rpm of [100, 300, 500]) assert.match(html, new RegExp(`class="weapon-rate">${rpm}<`));
  sim.start();
  for (let i = 0; i < 2; i++) { sim.state = 'upgrade'; sim.choose(1); }
  assert.match(upgradePanel(sim), /−10<span>%/);
  sim.state = 'upgrade'; sim.choose(1);
  const restarted = new Simulation(() => .5, sim.loadout);
  assert.equal(restarted.fireInterval, .6); assert.equal(restarted.canUpgradeFireRate, true);
  assert.doesNotMatch(upgradePanel(restarted), /data-choice="1" disabled/);
});

test('手雷数量、冷却和暂停正确；按住或快速连发不会越过数量限制', () => {
  const sim=fresh();assert.ok(sim.throwGrenade());assert.equal(sim.throwGrenade(),false);assert.equal(sim.grenadeCount,2);
  const snapshot=JSON.stringify(sim.grenades),cooldown=sim.grenadeCooldown;
  sim.togglePause();assert.equal(sim.throwGrenade(),false);advance(sim,2);assert.equal(JSON.stringify(sim.grenades),snapshot);assert.equal(sim.grenadeCooldown,cooldown);
  sim.togglePause();advance(sim,.7);assert.ok(sim.throwGrenade());advance(sim,.7);assert.ok(sim.throwGrenade());advance(sim,2);
  assert.equal(sim.throwGrenade(),false);assert.equal(sim.grenadeCount,0);assert.equal(sim.grenadesThrown,GRENADE.initial);assert.equal(sim.grenades.length,0);
  for(const state of ['ready','paused','upgrade','lost','won'] as const){sim.state=state;sim.grenadeCount=3;assert.equal(sim.throwGrenade(),false);}
});

test('范围爆炸只结算一次，墙体遮挡，范围外目标不受伤', () => {
  const sim=fresh();const near=sim.addEnemy('shooter',{x:1,z:5});near.hp=near.maxHp=100;near.attack=999;
  const far=sim.addEnemy('shooter',{x:-5,z:5});far.attack=999;
  assert.ok(sim.throwGrenade());const grenade=sim.grenades[0];grenade.vx=grenade.vz=0;grenade.remaining=.001;
  sim.step(1/60,still);assert.equal(sim.kills,1);assert.equal(sim.enemies.includes(near),false);assert.equal(far.hp,far.maxHp);assert.equal(sim.grenades.length,0);
  sim.step(1/60,still);assert.equal(sim.kills,1);assert.equal(sim.effects.some(e=>e.type==='explosion'),false);
  const cover=fresh(),wall=walls.find(w=>w.x===6&&w.z===3)!;
  cover.player.x=wall.x-wall.w/2-.5;cover.player.z=3;
  const protectedEnemy=cover.addEnemy('shooter',{x:wall.x+wall.w/2+.3,z:3});protectedEnemy.attack=999;
  assert.equal(visible(cover.player,protectedEnemy),false);cover.throwGrenade();Object.assign(cover.grenades[0],{vx:0,vz:0,remaining:.001});
  cover.step(1/60,still);assert.equal(protectedEnemy.hp,protectedEnemy.maxHp);
});

test('手雷连续碰撞不穿越高墙，结算冻结剩余投掷物，重开清理外观', async () => {
  const sim=fresh(),wall=walls.find(w=>w.h>3)!;
  sim.player.x=wall.x-wall.w/2-.5;sim.player.z=wall.z;sim.player.angle=Math.PI/2;sim.throwGrenade();
  sim.grenades[0].vx=1000;sim.step(1/60,still);
  assert.ok(sim.grenades[0].x<wall.x-wall.w/2);assert.equal(sim.grenades[0].vx,0);
  const scene=new T.Scene(),model=await loadPoseModel('weapons/grenade-v1.glb'),field=assembleGrenadeField(scene,model.scene);
  field.update(sim);assert.equal(field.stats().visible,1);assert.equal(scene.children.length,3);
  const before=JSON.stringify(sim.grenades);sim.state='lost';advance(sim,3);field.update(sim);assert.equal(JSON.stringify(sim.grenades),before);
  field.update(new Simulation());assert.equal(field.stats().visible,0);assert.equal(scene.children.length,3);
});

test('低掩体顶面正确承接手雷，不会落入墙内；近处目标采用短距离投掷', () => {
  const sim=fresh(),wall=walls.find(w=>w.h<2)!;
  sim.throwGrenade();Object.assign(sim.grenades[0],{x:wall.x,z:wall.z,y:wall.h+.3,vx:0,vz:0,vy:-1,remaining:2});
  advance(sim,.4);assert.ok(Math.abs(sim.grenades[0].y-(wall.h+.1))<.001);
  assert.equal(sim.grenades[0].vy,0);
  const near=fresh();near.target=near.addEnemy('shooter',{x:0,z:7});near.throwGrenade();
  assert.ok(Math.hypot(near.grenades[0].vx,near.grenades[0].vz)<3);
});

test('实际三种模型含完整槽位和有效材质，无外链纹理，互斥件不会重复显示', async () => {
  const models=Object.fromEntries(await Promise.all(weaponIds.map(async id=>[id,await loadPoseModel(`weapons/${id}-v1.glb`)]))) as Record<WeaponId,Awaited<ReturnType<typeof loadPoseModel>>>;
  const soldier=await loadPoseModel('soldier-walk-v1.glb'),actor=assembleActor(soldier,models.rifle,models);
  let right=0,left=0;
  for(const weapon of weaponIds){
    const raw=readFileSync(new URL(`../public/models/weapons/${weapon}-v1.glb`,import.meta.url));
    const json=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString());
    assert.ok(json.materials.length>0);assert.ok((json.images??[]).every((image:{bufferView?:number;uri?:string})=>image.bufferView!==undefined&&!image.uri));
    if(weapon==='pistol'||weapon==='smg'){
      assert.ok(json.images.length>=3,'原图武器必须保留颜色、物理材质与法线贴图');
      assert.ok(json.materials.some((material:{normalTexture?:unknown;pbrMetallicRoughness?:{baseColorTexture?:unknown;metallicRoughnessTexture?:unknown}})=>
        material.normalTexture&&material.pbrMetallicRoughness?.baseColorTexture&&material.pbrMetallicRoughness?.metallicRoughnessTexture),'原图武器不能退回纯色低模材质');
    }
    for(let mask=0;mask<2**weaponSpecs[weapon].slots.length;mask++){
      const attachments=weaponSpecs[weapon].slots.filter((_slot,index)=>mask&(1<<index)) as AttachmentSlot[];
      const equipped=attachments.includes('magazine');
      const sim=new Simulation(()=>.5,{weapon,attachments});
      for(let moving=0;moving<8;moving++)for(let direction=0;direction<8;direction++)for(const reload of [0,1.1,.5]){
        sim.player.moving=true;sim.player.angle=direction*Math.PI/4;sim.player.moveAngle=moving*Math.PI/4;sim.reload=reload;actor.update(sim,1/60);
        const pose=actor.measurePose();right=Math.max(right,pose.rightGripError);left=Math.max(left,pose.leftGripError);
        assert.ok(pose.weaponPosition.every(Number.isFinite));
        if(reload===0){const expected=muzzlePosition(sim.player,sim.player.angle,false,weapon);assert.ok(actor.muzzlePosition().distanceTo(new T.Vector3(expected.x,expected.y,expected.z))<.00001);}
      }
      const active=models[weapon].scene;
      const body=active.getObjectByName('weapon-body-mesh')!.clone(true);body.updateMatrixWorld(true);
      const bodyBounds=new T.Box3().setFromObject(body),frontHeights:number[]=[];
      body.traverse(node=>{if(node instanceof T.Mesh){const positions=node.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){
        const point=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);if(point.z>bodyBounds.max.z-.012)frontHeights.push(point.y);
      }}});
      const marker=active.getObjectByName('muzzle')!.position;
      assert.ok(marker.y>=Math.min(...frontHeights)-.003&&marker.y<=Math.max(...frontHeights)+.003,`${weapon}枪口必须位于真实枪管前端高度范围内`);
      assert.ok(marker.z>=bodyBounds.max.z&&marker.z-bodyBounds.max.z<.06);
      assert.equal(active.getObjectByName('magazine-standard')!.visible,!equipped);assert.equal(active.getObjectByName('magazine-extended')!.visible,equipped);
      assert.equal(active.getObjectByName('optic')!.visible,attachments.includes('optic'));
      if(weapon!=='pistol')assert.equal(active.getObjectByName('stock-standard')!.visible,!attachments.includes('stock'));
      assert.equal(active.getObjectByName('stock-upgraded')!.visible,attachments.includes('stock'));
    }
  }
  assert.ok(right<.03&&left<.03,`真实双手误差：右 ${right}，左 ${left}`);
});
