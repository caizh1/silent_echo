import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { assembleActor } from '../src/actor.ts';
import { loadPoseModel } from './load-model.ts';
import { RifleSimulation as Simulation } from './rifle-fixture.ts';
import { applyOutfit, presetOutfit, outfitPresets } from '../src/outfit.ts';
import { weaponIds, defaultLoadout, type WeaponId } from '../src/weapons.ts';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assembleModularActor } from '../src/modular-actor.ts';

async function fresh(){
 const [soldier,...guns]=await Promise.all([loadPoseModel('game/modular-soldier-v3.glb'),...weaponIds.map(id=>loadPoseModel(`weapons/${id}-v1.glb`))]);
 const library=Object.fromEntries(weaponIds.map((id,index)=>[id,guns[index]])) as Record<WeaponId,GLTF>;
 const gear:T.Object3D[]=[];soldier.scene.traverse(o=>{if(o.userData.outfitSlot)gear.push(o);});
 const parents=gear.map(o=>o.parent!);gear.forEach(o=>o.removeFromParent());
 const actor=assembleActor(soldier,library.rifle,library,{reloadInset:.09,smgSupportInset:.08});gear.forEach((o,i)=>parents[i].add(o));
 const sim=new Simulation();actor.update(sim,0);
 return {soldier,actor,sim,gear};
}
test('实际换装资产包含全部十件来源与十三个左右及分档网格',async()=>{
 const {soldier,gear}=await fresh();assert.equal(gear.length,13);
 assert.equal(new Set(gear.map(o=>o.userData.sourceAsset)).size,10);
 for(const object of gear){assert.ok(object instanceof T.SkinnedMesh);const skin=object as T.SkinnedMesh;assert.ok(skin.skeleton.bones.length>=41);const weights=skin.geometry.getAttribute('skinWeight');
  for(let i=0;i<weights.count;i++){const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);assert.ok(Math.abs(sum-1)<.0001);}
 }
 for(const preset of outfitPresets){const outfit=presetOutfit(preset);applyOutfit(soldier.scene,outfit);assert.equal(gear.filter(o=>o.userData.outfitSlot==='armor'&&o.visible).length,outfit.armor?1:0);}
});
test('真实蒙皮装备随头骨、行走、转向和换弹运动，位置不会留在初始坐标',async context=>{
 const {actor,sim,gear}=await fresh();const helmet=gear.find(o=>o.userData.sourceAsset==='tactical-helmet') as T.SkinnedMesh;
 const head=helmet.skeleton.bones.find(b=>b.name==='Head')!;sim.player.moving=true;
 let maximum=0,right=0,left=0,worst='';let reference:T.Vector3|undefined;
 for(const weapon of weaponIds)for(const upgraded of [false,true]){
 sim.configureLoadout({...defaultLoadout(weapon),attachments:upgraded?['optic','magazine','stock','grip']:[]});
 for(let aim=0;aim<8;aim++)for(let frame=0;frame<60;frame++){
  sim.player.angle=aim*Math.PI/4;sim.player.moveAngle=(aim+2)*Math.PI/4;sim.reload=frame<30?0:1.7*(60-frame)/30;
  actor.update(sim,1/60);actor.root.updateMatrixWorld(true);
  const point=helmet.getVertexPosition(0,new T.Vector3()).applyMatrix4(helmet.matrixWorld);
  const local=head.worldToLocal(point.clone());if(!reference)reference=local.clone();maximum=Math.max(maximum,local.distanceTo(reference));
  const before=point.clone();sim.player.x+=.12;sim.player.z-=.09;actor.update(sim,0);actor.root.updateMatrixWorld(true);
  const after=helmet.getVertexPosition(0,new T.Vector3()).applyMatrix4(helmet.matrixWorld);
  assert.ok(after.sub(before).distanceTo(new T.Vector3(.12,0,-.09))<.001);
  const pose=actor.measurePose();right=Math.max(right,pose.rightGripError);if(pose.leftGripError>left){
   left=pose.leftGripError;
   const point=(name:string)=>actor.root.getObjectByName(name)!.getWorldPosition(new T.Vector3());
   const shoulder=point('L_Upperarm'),elbow=point('L_Forearm'),wrist=point('L_Hand'),target=point('ik-left-target');
   worst=`${weapon}、升级 ${upgraded}、方向 ${aim}、帧 ${frame}、换弹 ${sim.reload}；距离 ${shoulder.distanceTo(target)}；上臂 ${shoulder.distanceTo(elbow)}；前臂 ${elbow.distanceTo(wrist)}；肩 ${actor.root.worldToLocal(shoulder).toArray()}；目标 ${actor.root.worldToLocal(target).toArray()}`;
  }
  for(const mesh of gear as T.SkinnedMesh[])assert.ok(mesh.getVertexPosition(0,new T.Vector3()).applyMatrix4(mesh.matrixWorld).toArray().every(Number.isFinite));
 }
 }
 assert.ok(maximum<.001,`头部装备偏移 ${maximum}`);assert.ok(right<.04&&left<.04,`握点误差 ${right} / ${left}；${worst}`);
 context.diagnostic(`头部装备局部误差 ${maximum.toFixed(6)} 米；右握点 ${right.toFixed(4)} 米；左握点 ${left.toFixed(4)} 米`);
});
test('独立预览克隆与实战角色保持相同身高和握点，刷新绑定矩阵后不缩成半身',async()=>{
 const original=await loadPoseModel('game/modular-soldier-v3.glb');
 const template={...original,scene:clone(original.scene) as T.Group};
 const heights:number[]=[];
 for(const source of [original,template,{...template,scene:clone(template.scene) as T.Group}]){
  const gear:T.Object3D[]=[];source.scene.traverse(o=>{if(o.userData.outfitSlot)gear.push(o);});
  gear.forEach(o=>o.removeFromParent());
  const guns=await Promise.all(weaponIds.map(id=>loadPoseModel(`weapons/${id}-v1.glb`)));
  const library=Object.fromEntries(weaponIds.map((id,index)=>[id,guns[index]])) as Record<WeaponId,GLTF>;
  const actor=assembleActor(source,library.rifle,library);actor.update(new Simulation(),0);actor.root.updateMatrixWorld(true);
  const box=new T.Box3();source.scene.traverse(o=>{if(o instanceof T.SkinnedMesh)for(let i=0;i<o.geometry.getAttribute('position').count;i++)box.expandByPoint(o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld));});
  heights.push(box.max.y-box.min.y);assert.ok(actor.measurePose().rightGripError<.001);
 }
 assert.ok(heights.every(value=>value>1.75&&value<1.9));assert.ok(Math.max(...heights)-Math.min(...heights)<.0001);
});
test('暂停中切换原主角或素装时立即沿用世界位置和握点',async()=>{
 const [legacy,modern,...guns]=await Promise.all([loadPoseModel('soldier-walk-v1.glb'),loadPoseModel('game/modular-soldier-v3.glb'),...weaponIds.map(id=>loadPoseModel(`weapons/${id}-v1.glb`))]);
 const library=()=>Object.fromEntries(weaponIds.map((id,index)=>[id,{...guns[index],scene:clone(guns[index].scene) as T.Group}])) as Record<WeaponId,GLTF>;
 const actor=assembleModularActor(legacy,modern,library(),library()),sim=new Simulation();
 sim.player.x=4;sim.player.z=-6;sim.player.angle=.8;actor.update(sim,0);sim.state='paused';
 for(const preset of ['legacy','bare','standard'] as const){
  actor.setOutfit(presetOutfit(preset));const pose=actor.measurePose();
  assert.ok(Math.abs(pose.bodyPosition[0]-4)<.001&&Math.abs(pose.bodyPosition[2]+6)<.001);
  assert.ok(pose.rightGripError<.001);
 }
});

