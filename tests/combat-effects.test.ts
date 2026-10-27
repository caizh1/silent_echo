import { RifleSimulation as Simulation } from './rifle-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { walls } from '../src/simulation.ts';
import { muzzlePosition, RIFLE_SPEED, RIFLE_MUZZLE, RIFLE_RANGE } from '../src/ballistics.ts';
import { createCombatEffects, streakMatrix } from '../src/combat-effects.ts';
import { assembleActor } from '../src/actor.ts';
import { loadPoseModel } from './load-model.ts';
const still = { x: 0, z: 0 };
function fresh() { const sim = new Simulation(() => .25);sim.start();sim.spawn = 9999;return sim; }

test('八方向射击从真实模型枪口发出，后坐时双手仍握住武器', async () => {
  const [soldier, rifle] = await Promise.all([loadPoseModel('soldier-walk-v1.glb'), loadPoseModel('assault-rifle-textured-v1.glb')]);
  const actor = assembleActor(soldier, rifle), sim = fresh();
  for (let i = 0; i < 8; i++) {
    sim.player.angle = i * Math.PI / 4;sim.player.moveAngle = sim.player.angle;sim.lastShotAt = sim.time;actor.update(sim, 0);
    const expected = muzzlePosition(sim.player, sim.player.angle), actual = actor.muzzlePosition();
    assert.ok(actual.distanceTo(new T.Vector3(expected.x, expected.y, expected.z)) < .00001);
    sim.time += 1 / 60;actor.update(sim, 1 / 60);
    assert.ok(actor.muzzlePosition().distanceTo(actual) > .01);
    const pose = actor.measurePose();assert.ok(pose.rightGripError < .03 && pose.leftGripError < .03);
    sim.time += .4;actor.update(sim, 1 / 60);assert.ok(actor.muzzlePosition().distanceTo(actual) < .00001);
  }
});

test('高速弹道、枪口与命中处于同一条直线，单帧命中不能丢失轨迹', () => {
  const sim = fresh(), target = sim.addEnemy('shooter', { x: 0, z: 7 });target.attack = 999;
  sim.step(1 / 60, still);
  const shot = sim.effects.find(e => e.type === 'shot')!, flight = sim.effects.find(e => e.type === 'flight')!, hit = sim.effects.find(e => e.type === 'hit')!;
  assert.equal(shot.z, 5 + RIFLE_MUZZLE.z);assert.equal(shot.y, RIFLE_MUZZLE.y);assert.equal(flight.z, shot.z);
  assert.equal(flight.end!.z, hit.z);assert.equal(hit.surface, 'body');assert.equal(sim.bullets.length, 0);
  assert.equal(target.hp, target.maxHp - sim.damage);assert.ok(hit.z > shot.z && hit.z < target.z);
  assert.ok(RIFLE_SPEED > 150);
});

test('枪管伸进近处目标时仍能命中，不生成反向曳光', () => {
  const sim = fresh(), target = sim.addEnemy('shooter', { x: 0, z: 5.6 });target.attack = 999;
  sim.step(1 / 60, still);
  assert.equal(target.hp, target.maxHp - sim.damage);assert.equal(sim.effects.some(e => e.type === 'flight'), false);
});

test('枪管跨过掩体的首帧扫描不会穿墙，墙面反馈附带外法线', () => {
  const sim = fresh(), wall = walls.find(w => w.x === 6 && w.z === 3)!;
  const edge = wall.x - wall.w / 2;sim.fire = 999;
  const target = sim.addEnemy('shooter', { x: edge + 2, z: 3 });target.attack = 999;
  sim.bullets.push({ id: 999, x: edge + .2, z: 3, vx: RIFLE_SPEED, vz: 0, life: .08, damage: 50, hostile: false, barrelStart: { x: edge - .5, z: 3 } });
  sim.step(1 / 60, still);
  const hit = sim.effects.find(e => e.type === 'hit')!;
  assert.equal(hit.surface, 'wall');assert.deepEqual(hit.normal, { x: -1, z: 0 });assert.equal(target.hp, target.maxHp);
  assert.ok(hit.x < edge);assert.equal(sim.effects.some(e => e.type === 'flight'), false);
});

test('子弹寿命到期的最后一帧不超出射程', () => {
  const sim = fresh();sim.fire = 999;
  sim.bullets.push({ id: 999, x: 0, z: 5, vx: 0, vz: RIFLE_SPEED, life: .001, damage: 22, hostile: false });
  sim.step(1 / 60, still);const flight = sim.effects.find(e => e.type === 'flight')!;
  assert.ok(Math.abs(flight.end!.z - 5 - RIFLE_SPEED * .001) < .00001);assert.equal(sim.bullets.length, 0);
  assert.equal(RIFLE_RANGE, 19);
});

test('曳光矩阵端点准确，视线平行弹道时矩阵仍有限', () => {
  const start = new T.Vector3(1, 1.31, 2), end = new T.Vector3(1, 1.31, 6);
  for (const camera of [new T.Vector3(10, 15, 8), new T.Vector3(1, 1.31, 10)]) {
    const matrix = streakMatrix(start, end, .04, camera);
    assert.ok(matrix.elements.every(Number.isFinite));
    assert.ok(new T.Vector3(0, -.5, 0).applyMatrix4(matrix).distanceTo(start) < .00001);
    assert.ok(new T.Vector3(0, .5, 0).applyMatrix4(matrix).distanceTo(end) < .00001);
  }
});

test('特效资源有界、时间停止时不变、重试清空所有余焰与弹壳', () => {
  const scene = new T.Scene(), effects = createCombatEffects(scene, () => .4), camera = new T.PerspectiveCamera();camera.position.set(10, 15, 5);
  const objects = scene.children.length;
  for (let i = 0; i < 500; i++) effects.emit({ x: 0, y: 1.31, z: 5, type: 'shot', direction: { x: 0, z: -1 } });
  effects.render(camera, []);const before = JSON.stringify(effects.stats());effects.render(camera, []);
  assert.equal(JSON.stringify(effects.stats()), before);assert.ok(effects.stats().particles <= 352);assert.equal(effects.stats().casings, 64);
  assert.equal(scene.children.length, objects);
  effects.step(3);effects.render(camera, []);assert.equal(effects.stats().particles, 0);assert.equal(effects.stats().casings, 0);
  effects.emit({ x: 0, y: 1.31, z: 5, type: 'shot' });effects.clear();effects.render(camera, []);
  assert.deepEqual(effects.stats(), { particles: 0, casings: 0, shots: 0, hits: 0 });
  for (const object of scene.children) { if (object instanceof T.InstancedMesh) assert.equal(object.count, 0);if (object instanceof T.PointLight) assert.equal(object.intensity, 0); }
});
