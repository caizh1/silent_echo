import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Simulation } from '../src/simulation.ts';
import { CORPSE_LIFETIME, CORPSE_LIMIT, snapshotDeath, collapseSeconds } from '../src/enemy-motion.ts';
import { createDeathRig, poseDeathRig, livingEnemyVertex, createEnemyDeathField } from '../src/enemy-death.ts';
import { enemySpecs, type EnemyKind } from '../src/enemies.ts';
import { loadPoseModel } from './load-model.ts';
import type { ModelLibrary } from '../src/models.ts';

const kinds = Object.keys(enemySpecs) as EnemyKind[];
function fresh() { const sim = new Simulation(() => .9); sim.start(); sim.spawn = sim.fire = 9999; sim.bossSpawned = true; return sim; }
function advance(sim: Simulation, seconds: number) { for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) { sim.step(1 / 60, { x: 0, z: 0 }); if (sim.state === 'upgrade') sim.choose(0); } }
async function prototype(kind: EnemyKind) {
  const gltf = await loadPoseModel(`game/${enemySpecs[kind].asset}-v1.glb`); gltf.scene.updateMatrixWorld(true);
  let mesh!: T.Mesh; gltf.scene.traverse(object => { if (object instanceof T.Mesh) mesh = object; });
  return new T.Mesh(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), new T.MeshStandardMaterial());
}

test('五类敌人死亡保留快照，只结算一次奖励，暂停冻结且到期清理', () => {
  const sim = fresh();
  for (const kind of kinds) { const enemy = sim.addEnemy(kind, { x: 0, z: -8 }); enemy.hp = 0; enemy.windup = .001; enemy.aim = { ...sim.player }; }
  sim.step(1 / 60, { x: 0, z: 0 });
  assert.equal(sim.enemies.length, 0); assert.equal(sim.fallenEnemies.length, 5); assert.equal(sim.kills, 5);
  assert.equal(sim.bullets.length, 0); assert.equal(sim.target, undefined); assert.equal(sim.player.hp, 100);
  const previous = JSON.stringify(sim.fallenEnemies); sim.togglePause(); advance(sim, 2);
  assert.equal(JSON.stringify(sim.fallenEnemies), previous); assert.equal(sim.kills, 5);
  sim.togglePause(); advance(sim, CORPSE_LIFETIME + .1); assert.equal(sim.fallenEnemies.length, 0); assert.equal(sim.kills, 5);
});

test('子弹和手雷的致命受击方向进入尸体快照', () => {
  const sim = fresh(), enemy = sim.addEnemy('shooter', { x: 0, z: 0 }); enemy.attack = 9999; enemy.hp = 1;
  sim.bullets.push({ id: sim.id++, x: 0, z: -1, vx: 0, vz: 60, damage: 100, hostile: false, life: 1 });
  sim.step(1 / 60, { x: 0, z: 0 }); assert.deepEqual(sim.fallenEnemies[0].impact, { x: 0, z: 1 });
  const blast = fresh(), target = blast.addEnemy('runner', { x: 0, z: 0 }); target.hp = 1; target.attack = 9999;
  blast.grenades.push({ id: blast.id++, x: 0, y: .1, z: -1, vx: 0, vy: 0, vz: 0, age: 1, remaining: .001 });
  blast.step(1 / 60, { x: 0, z: 0 }); assert.equal(blast.fallenEnemies.length, 1); assert.ok(blast.fallenEnemies[0].impact.z > .99);
});

test('批量击杀有数量上限，尸体不占用存活敌人名额', () => {
  const sim = fresh();
  for (let index = 0; index < CORPSE_LIMIT + 8; index++) { const enemy = sim.addEnemy('shooter', { x: 0, z: -8 }); enemy.hp = 0; }
  sim.step(1 / 60, { x: 0, z: 0 }); assert.equal(sim.fallenEnemies.length, CORPSE_LIMIT); assert.equal(sim.kills, CORPSE_LIMIT + 8);
  assert.equal(sim.enemies.length, 0);
});

for (const kind of kinds) test(`${enemySpecs[kind].name}真实网格连续交接、关节独立弯曲、稳定贴地`, async () => {
  const sim = fresh(), enemy = sim.addEnemy(kind, { x: 0, z: 0 }); enemy.moving = true; enemy.hitDirection = { x: .6, z: -.8 };
  const death = snapshotDeath(enemy, sim.player, .37), mesh = await prototype(kind), rig = createDeathRig(mesh, death);
  poseDeathRig(rig, 0);
  const source = mesh.geometry.getAttribute('position'), vertices = rig.mesh.geometry.getAttribute('position'), actual = new T.Vector3();
  for (let index = 0; index < source.count; index += 29) {
    const expected = livingEnemyVertex(new T.Vector3().fromBufferAttribute(source, index), death);
    rig.mesh.applyBoneTransform(index, actual.fromBufferAttribute(vertices, index));
    assert.ok(actual.distanceTo(expected) < .00001, `交接位移过大：${actual.distanceTo(expected)}`);
  }
  const duration = collapseSeconds(kind);
  for (const progress of [.12, .3, .5, .72, .85, 1, 1.5]) {
    poseDeathRig(rig, duration * progress);
    let floor = Infinity;
    for (let index = 0; index < vertices.count; index++) { rig.mesh.applyBoneTransform(index, actual.fromBufferAttribute(vertices, index)); floor = Math.min(floor, actual.y + rig.mesh.position.y); }
    assert.ok(floor > -.035 && floor < .075, `落地表面异常：进度 ${progress}，最低点 ${floor}`);
  }
  assert.ok(rig.joints.leftKnee.bone.rotation.x > .3); assert.ok(Math.abs(rig.joints.leftKnee.bone.rotation.x - rig.joints.rightKnee.bone.rotation.x) > .05);
  assert.ok(rig.joints.head.bone.quaternion.angleTo(rig.joints.spine.bone.quaternion) > .1);
  const settled = rig.joints.pelvis.bone.matrixWorld.clone(); poseDeathRig(rig, 8.2); assert.ok(settled.equals(rig.joints.pelvis.bone.matrixWorld));
  assert.ok(rig.opacity.value > 0 && rig.opacity.value < 1); rig.dispose(); mesh.geometry.dispose(); (mesh.material as T.Material).dispose();
});

test('切换模拟和尸体到期会释放独立网格与材质', async () => {
  const mesh = await prototype('runner'), library = { get: () => mesh } as unknown as ModelLibrary;
  const scene = new T.Scene(), field = createEnemyDeathField(scene, library), sim = fresh();
  const enemy = sim.addEnemy('runner', { x: 0, z: 0 }); enemy.hp = 0; sim.step(1 / 60, { x: 0, z: 0 }); field.update(sim);
  const corpse = scene.children[0] as T.SkinnedMesh; let disposed = 0;
  corpse.geometry.addEventListener('dispose', () => disposed++); (corpse.material as T.Material).addEventListener('dispose', () => disposed++);
  assert.equal(field.stats().count, 1); field.update(fresh()); assert.equal(field.stats().count, 0); assert.equal(scene.children.length, 0); assert.equal(disposed, 2);
  field.dispose(); mesh.geometry.dispose(); (mesh.material as T.Material).dispose();
});

test('最后一击进入结算仍播完倒地并清理，暂停时姿态和脱手武器保持冻结', async () => {
  const mesh = await prototype('runner'), library = { get: () => mesh } as unknown as ModelLibrary;
  const scene = new T.Scene(), field = createEnemyDeathField(scene, library), sim = fresh();
  sim.addEnemy('runner', { x: 0, z: 0 }).hp = 0; sim.step(1 / 60, { x: 0, z: 0 }); field.update(sim);
  const corpse = scene.getObjectByName(`fallen-enemy-${sim.fallenEnemies[0].id}`) as T.SkinnedMesh;
  const weapon = scene.getObjectByName(`fallen-weapon-${sim.fallenEnemies[0].id}`)!;
  const initial = corpse.skeleton.bones[0].matrixWorld.clone(), gunPosition = weapon.position.clone();
  sim.state = 'paused'; field.update(sim, 4); assert.ok(initial.equals(corpse.skeleton.bones[0].matrixWorld)); assert.ok(weapon.position.equals(gunPosition));
  sim.state = 'won'; field.update(sim, 2); assert.equal(field.stats().falling, 0); assert.ok(!initial.equals(corpse.skeleton.bones[0].matrixWorld)); assert.ok(weapon.position.y < gunPosition.y);
  field.update(sim, CORPSE_LIFETIME); assert.equal(scene.children.length, 0); field.update(sim, .1); assert.equal(scene.children.length, 0);
  field.dispose(); mesh.geometry.dispose(); (mesh.material as T.Material).dispose();
});

test('持枪变形不会再把静止靴子当成手臂抬起', () => {
  const sim = fresh(), enemy = sim.addEnemy('shooter', { x: 0, z: 0 }); enemy.moving = false;
  const death = snapshotDeath(enemy, sim.player, 0), foot = new T.Vector3(.35, .08, .12);
  assert.ok(livingEnemyVertex(foot.clone(), death).distanceTo(foot) < 1e-10);
});
