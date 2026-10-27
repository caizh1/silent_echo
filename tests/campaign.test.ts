import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missions, missionById, missionUnlocked, parseProgress, recordMissionCompletion, PROGRESS_KEY } from '../src/campaign.ts';
import { Simulation, distance, type Vec } from '../src/simulation.ts';
import { defaultLoadout } from '../src/weapons.ts';
import { enemySpecs } from '../src/enemies.ts';
import { createMissionField } from '../src/mission-field.ts';
import { createFires } from '../src/fire.ts';
import * as T from 'three';

const still = { x: 0, z: 0 };
function fresh(id = 'relay') {
  let seed = 42;
  const sim = new Simulation(() => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }, defaultLoadout('rifle'), missionById(id));
  sim.start(); sim.spawn = sim.fire = 9999;
  return sim;
}
function advance(sim: Simulation, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) sim.step(1 / 60, still); }
function reachable(sim: Simulation, radius: number) {
  const start = sim.mission.spawn, queue = [start], reached = new Set([`${start.x},${start.z}`]);
  assert.equal(sim.blocked(start, radius), false);
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = { x: queue[i].x + dx, z: queue[i].z + dz }, key = `${p.x},${p.z}`;
      if (!reached.has(key) && !sim.blocked(p, radius)) { reached.add(key); queue.push(p); }
    }
  }
  return reached;
}

test('四张地图的出生、任务、撤离和补给可达，首领体型可走通任务路线', () => {
  for (const mission of missions) {
    const sim = fresh(mission.id);
    for (const radius of [.38, .75, 1.25]) {
      const reached = reachable(sim, radius);
      for (const target of [...mission.objectives, ...(mission.extraction ? [mission.extraction] : [])]) {
        assert.ok(reached.has(`${target.x},${target.z}`), `${mission.name}：半径 ${radius} 无法到达 ${target.x},${target.z}`);
      }
      if (radius === .38) assert.ok(mission.supplies.filter(p => !sim.blocked(p, .65) && reached.has(`${p.x},${p.z}`)).length >= 5);
    }
    assert.equal(sim.walls.length, mission.scenery.length);
  }
});

test('并存关卡不共享墙体：移动、索敌与子弹都使用当前关卡', () => {
  const convoy = fresh('convoy'), relay = fresh('relay');
  assert.equal(convoy.blocked(still), true); assert.equal(relay.blocked(still), false);
  const a = { x: -4, z: 0 }, b = { x: 4, z: 0 };
  assert.equal(convoy.visible(a, b), false); assert.equal(relay.visible(a, b), true);
  const p = { ...a }; convoy.move(p, 8, 0); assert.ok(p.x < -1.5);
  for (const sim of [convoy, relay]) {
    Object.assign(sim.player, a);
    const enemy = sim.addEnemy('shooter', b); enemy.attack = 9999;
    sim.bullets.push({ id: sim.id++, ...a, vx: 1000, vz: 0, life: 1, damage: 10, hostile: false });
    sim.step(1 / 60, still);
    assert.equal(enemy.hp, sim === convoy ? enemy.maxHp : enemy.maxHp - 10);
  }
});

test('终端争夺暂停修复，离圈与暂停保留进度，奖励只发一次且满弹药不吞物资', () => {
  const sim = fresh(), objective = sim.objectives[0];
  Object.assign(sim.player, { x: objective.x, z: objective.z });
  advance(sim, 3); assert.ok(objective.progress >= 2.99);
  const enemy = sim.addEnemy('shooter', { x: objective.x + 1, z: objective.z }); enemy.attack = 9999;
  const progress = objective.progress; advance(sim, 2); assert.equal(objective.progress, progress);
  sim.enemies = []; sim.togglePause(); advance(sim, 5); assert.equal(objective.progress, progress);
  sim.togglePause(); Object.assign(sim.player, sim.mission.spawn); advance(sim, 1); assert.equal(objective.progress, progress);
  Object.assign(sim.player, { x: objective.x, z: objective.z }); sim.reserve = sim.maxReserve;
  advance(sim, 10); assert.ok(objective.completed); assert.equal(sim.drops.filter(drop => drop.kind === 'ammo').reduce((sum, drop) => sum + drop.value, 0), 36);
  advance(sim, 2); assert.equal(sim.drops.filter(drop => drop.kind === 'ammo').length, 1);
});

test('车队物资在敌人附近仍能回收，医疗和手雷有上限，完成后不重复领取', () => {
  const sim = fresh('convoy'), objective = sim.objectives[0];
  Object.assign(sim.player, { x: objective.x, z: objective.z, hp: 80 }); sim.grenadeCount = 2;
  const enemy = sim.addEnemy('shooter', { x: objective.x + 1, z: objective.z }); enemy.attack = 9999;
  advance(sim, 3.1); assert.ok(objective.completed); assert.equal(sim.player.hp, 100); assert.equal(sim.grenadeCount, 3);
  sim.player.hp = 80; sim.grenadeCount = 1; advance(sim, 2); assert.equal(sim.player.hp, 80); assert.equal(sim.grenadeCount, 1);
});

test('最终关节点必须依次关闭，首领同时受时间与节点门禁约束且仅生成一次', () => {
  const sim = fresh('breach');
  Object.assign(sim.player, sim.objectives[2]); advance(sim, 12); assert.equal(sim.objectives[2].progress, 0);
  sim.time = sim.mission.bossAt; sim.step(1 / 60, still); assert.equal(sim.bossSpawned, false);
  for (const objective of sim.objectives) {
    Object.assign(sim.player, { x: objective.x, z: objective.z }); advance(sim, objective.seconds + .05);
    assert.ok(objective.completed);
  }
  advance(sim, 1); assert.ok(sim.bossSpawned); assert.equal(sim.enemies.filter(e => e.kind === 'boss').length, 1);
  assert.equal(sim.enemies[0].maxHp, enemySpecs.boss.hp * sim.mission.bossHealth);
});

test('通关要求任务、时间、首领及连续撤离全部满足，死亡优先且超时仍补给', () => {
  const sim = fresh(), extraction = sim.mission.extraction!;
  sim.bossSpawned = sim.bossDefeated = true; sim.time = sim.mission.duration;
  Object.assign(sim.player, extraction); advance(sim, 5); assert.equal(sim.state, 'playing');
  sim.objectives.forEach(o => { o.progress = o.seconds; o.completed = true; });
  sim.time = sim.mission.duration - 10; advance(sim, 5); assert.equal(sim.extractionProgress, 0);
  sim.time = sim.mission.duration; sim.bossDefeated = false; advance(sim, 5); assert.equal(sim.extractionProgress, 0);
  sim.bossDefeated = true; advance(sim, 2); assert.ok(sim.extractionProgress > 1.99);
  sim.player.z -= 5; sim.step(1 / 60, still); assert.equal(sim.extractionProgress, 0);
  sim.crates = []; sim.time = 405; sim.step(1 / 60, still); assert.ok(sim.crates.length > 0);
  Object.assign(sim.player, extraction); advance(sim, 4.1); assert.equal(sim.state, 'won');
  const time = sim.time; advance(sim, 1); assert.equal(sim.time, time);
  const dead = fresh(); dead.time = 500; dead.bossSpawned = dead.bossDefeated = true;
  dead.objectives.forEach(o => o.completed = true); Object.assign(dead.player, extraction); dead.player.hp = 0;
  dead.extractionProgress = extraction.seconds; dead.step(1 / 60, still); assert.equal(dead.state, 'lost');
});

test('进度损坏安全回退，旧玩家可直接玩第二关，后续关按完成顺序解锁', () => {
  for (const raw of [null, '损坏数据', 'null', '[]', '{"completed":true}']) assert.deepEqual(parseProgress(raw), []);
  assert.deepEqual(parseProgress('{"completed":["relay","relay","unknown",3]}'), ['relay']);
  assert.equal(missionUnlocked(0, []), true); assert.equal(missionUnlocked(1, []), true);
  assert.equal(missionUnlocked(2, []), false); assert.equal(missionUnlocked(2, ['relay']), true);
  assert.equal(missionUnlocked(3, ['convoy']), false); assert.equal(missionUnlocked(3, ['relay', 'convoy']), true);
  assert.equal(missionUnlocked(-1, []), false); assert.equal(missionUnlocked(9, ['relay', 'convoy']), false);
  const reset = fresh(); assert.ok(reset.objectives.every(objective => !objective.completed && objective.progress === 0));
});

test('真实进度保存路径可重载；存储拒绝、额度耗尽和旧快照不会丢失本次解锁', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const first = recordMissionCompletion('relay', [], () => storage); assert.ok(first.saved);
  assert.ok(missionUnlocked(2, parseProgress(storage.getItem(PROGRESS_KEY))));
  recordMissionCompletion('convoy', first.completed, () => storage);
  recordMissionCompletion('street', [], () => storage);
  assert.ok(missionUnlocked(3, parseProgress(storage.getItem(PROGRESS_KEY))));
  for (const factory of [() => { throw new Error('禁止访问'); }, () => ({ ...storage, setItem: () => { throw new Error('存储额度耗尽'); } })]) {
    const result = recordMissionCompletion('convoy', ['relay'], factory);
    assert.equal(result.saved, false); assert.ok(missionUnlocked(3, result.completed));
  }
});

test('连续换图回收火焰资源，任务标记数量固定且不向场景重复堆叠', () => {
  const scene = new T.Scene(), field = createMissionField(scene);
  for (let i = 0; i < 16; i++) {
    const sim = fresh(missions[i % missions.length].id);
    field.configure(sim); field.update(sim);
    const fires = createFires(scene, sim.mission.scenery); fires.update(1, new T.PerspectiveCamera());
    fires.dispose(); assert.equal(scene.children.length, 1);
    assert.equal(scene.children[0].children.length, sim.objectives.length + Number(!!sim.mission.extraction));
  }
});

test('后续三关在不同出生位置都能生成可达首领，敌人数量不超过绘制容量', () => {
  for (const mission of missions.slice(1)) for (const position of [mission.spawn, ...mission.objectives]) {
    const sim = fresh(mission.id); Object.assign(sim.player, { x: position.x, z: position.z });
    sim.time = mission.bossAt; sim.objectives.forEach(o => o.completed = true);
    advance(sim, 1);
    const boss = sim.enemies.find(e => e.kind === 'boss'); assert.ok(boss, mission.name);
    assert.equal(sim.blocked(boss, enemySpecs.boss.radius), false); assert.ok(distance(boss, sim.player) > 14);
    sim.bossDefeated = false; sim.time = mission.bossAt;
    for (let i = 0; i < mission.maxEnemies + 5; i++) { sim.spawn = 0; sim.step(1 / 60, still); }
    assert.ok(sim.enemies.length <= mission.maxEnemies);
  }
});
