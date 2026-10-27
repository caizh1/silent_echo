import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { assembleActor } from '../src/actor.ts';
import { RifleSimulation as Simulation } from './rifle-fixture.ts';
import { loadPoseModel } from './load-model.ts';

async function fresh() {
  const [soldier, rifle] = await Promise.all([loadPoseModel('soldier-walk-v1.glb'), loadPoseModel('assault-rifle-textured-v1.glb')]);
  const actor = assembleActor(soldier, rifle), sim = new Simulation();
  actor.update(sim, 0); actor.root.updateMatrixWorld(true);
  return { actor, sim, hip: soldier.scene.getObjectByName('Hip')!, waist: soldier.scene.getObjectByName('Waist')! };
}
const relativeHip = (actor: ReturnType<typeof assembleActor>, hip: T.Object3D) => actor.root.worldToLocal(hip.getWorldPosition(new T.Vector3()));

test('真实行走动画在原地播放，身体不能走离角色和武器的共同坐标', async () => {
  const { actor, sim, hip } = await fresh();
  const origin = relativeHip(actor, hip).clone(); sim.player.moving = true;
  let maximum = 0;
  for (let i = 0; i < 240; i++) {
    actor.update(sim, 1 / 60); actor.root.updateMatrixWorld(true);
    const p = relativeHip(actor, hip); maximum = Math.max(maximum, Math.hypot(p.x - origin.x, p.z - origin.z));
  }
  assert.ok(maximum < .01, `身体相对武器漂移 ${maximum.toFixed(3)} 米`);
});

test('停止移动后连续瞄准不能逐帧叠加腰部旋转', async () => {
  const { actor, sim, waist } = await fresh();
  sim.player.angle = .7; sim.player.moveAngle = 0; actor.update(sim, 1 / 60);
  const first = waist.getWorldQuaternion(new T.Quaternion());
  for (let i = 0; i < 120; i++) actor.update(sim, 1 / 60);
  const error = first.angleTo(waist.getWorldQuaternion(new T.Quaternion()));
  assert.ok(error < .001, `腰部重复瞄准旋转误差 ${error.toFixed(3)} 弧度`);
});

test('八方向移动、全向瞄准与换弹时身体和双手始终跟随武器', async context => {
  const { actor, sim } = await fresh(); let right = 0, left = 0, drift = 0;
  sim.player.moving = true;
  for(let move=0;move<8;move++)for(let aim=0;aim<8;aim++)for(let frame=0;frame<90;frame++){
    sim.player.moveAngle=move*Math.PI/4;sim.player.angle=aim*Math.PI/4;
    sim.player.x=Math.sin(sim.player.moveAngle)*frame*.03;sim.player.z=Math.cos(sim.player.moveAngle)*frame*.03;
    sim.reload=frame<45?0:1.7*(90-frame)/45;actor.update(sim,1/60);
    const pose=actor.measurePose();
    right=Math.max(right,pose.rightGripError);left=Math.max(left,pose.leftGripError);
    drift=Math.max(drift,Math.hypot(pose.bodyPosition[0]-sim.player.x,pose.bodyPosition[2]-sim.player.z));
    assert.ok(pose.weaponPosition.every(Number.isFinite));
  }
  assert.ok(drift<.001,`身体移动误差 ${drift.toFixed(3)} 米`);
  assert.ok(right<.03&&left<.03,`双手离握点：右 ${right.toFixed(3)} 米，左 ${left.toFixed(3)} 米`);
  context.diagnostic(`最大身体误差 ${drift.toFixed(6)} 米；右手 ${right.toFixed(6)} 米；左手 ${left.toFixed(6)} 米`);
});

test('实际蒙皮顶点与武器同步平移，不会只有骨骼坐标跟随', async () => {
  const { actor, sim } = await fresh();
  const torso=actor.root.getObjectByName('tripo_part_1') as T.SkinnedMesh;
  assert.ok(torso?.isSkinnedMesh);sim.player.moving=true;
  for(let frame=0;frame<120;frame++){
    actor.update(sim,1/60);actor.root.updateMatrixWorld(true);
    const vertex=torso.getVertexPosition(0,new T.Vector3()).applyMatrix4(torso.matrixWorld);
    const gun=actor.root.getObjectByName('weapon-body')!.getWorldPosition(new T.Vector3());
    sim.player.x+=.17;sim.player.z-=.13;actor.update(sim,0);actor.root.updateMatrixWorld(true);
    const moved=torso.getVertexPosition(0,new T.Vector3()).applyMatrix4(torso.matrixWorld);
    const movedGun=actor.root.getObjectByName('weapon-body')!.getWorldPosition(new T.Vector3());
    const expected=new T.Vector3(.17,0,-.13);
    assert.ok(moved.sub(vertex).distanceTo(expected)<.0001);
    assert.ok(movedGun.sub(gun).distanceTo(expected)<.0001);
  }
});
