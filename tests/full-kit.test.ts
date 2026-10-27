import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { assembleActor } from '../src/actor.ts';
import { applyOutfit, outfitSlots, presetOutfit, normalizeOutfit } from '../src/outfit.ts';
import { weaponIds, defaultLoadout, type WeaponId } from '../src/weapons.ts';
import { Simulation } from '../src/simulation.ts';
import { loadPoseModel } from './load-model.ts';

async function fixture(){
 const [soldier,...guns]=await Promise.all([loadPoseModel('game/modular-soldier-v5.glb'),...weaponIds.map(id=>loadPoseModel(`weapons/${id}-v1.glb`))]);
 const gear:T.Object3D[]=[];soldier.scene.traverse(object=>{if(object.userData.outfitSlot)gear.push(object);});
 const parents=gear.map(object=>object.parent!);gear.forEach(object=>object.removeFromParent());
 const library=Object.fromEntries(weaponIds.map((id,index)=>[id,guns[index]])) as Record<WeaponId,GLTF>;
 const actor=assembleActor(soldier,library.rifle,library,{reloadInset:.09,smgSupportInset:.08});gear.forEach((object,index)=>parents[index].add(object));
 const sim=new Simulation(()=>.5);actor.update(sim,0);return {soldier,gear,actor,sim};
}
function meshBounds(root:T.Object3D){
 const box=new T.Box3();root.updateMatrixWorld(true);
 root.traverse(object=>{if(object instanceof T.SkinnedMesh)for(let i=0;i<object.geometry.getAttribute('position').count;i++)box.expandByPoint(object.getVertexPosition(i,new T.Vector3()).applyMatrix4(object.matrixWorld));});
 return box;
}
test('全装包含十五类真实装备，逐类可拆，短胸甲下腹有完整衣服',async()=>{
 const {soldier,gear}=await fixture();assert.deepEqual(new Set(gear.map(object=>object.userData.outfitSlot)),new Set([...outfitSlots,'armor']));
 const full=presetOutfit('heavy');assert.ok(outfitSlots.every(slot=>full[slot]));assert.equal(full.armor,3);
 applyOutfit(soldier.scene,full);
 assert.deepEqual(new Set(gear.filter(object=>object.visible&&object.userData.outfitSlot==='armor').map(object=>object.userData.armorTier)),new Set([3]));
 const abdomen=soldier.scene.getObjectByName('base-abdomen')!;assert.ok(abdomen&&abdomen.visible&&!abdomen.userData.coveredBy);
 for(const slot of outfitSlots){applyOutfit(soldier.scene,{...full,[slot]:false});assert.ok(gear.filter(object=>object.userData.outfitSlot===slot).every(object=>!object.visible));assert.ok(abdomen.visible);}
 applyOutfit(soldier.scene,presetOutfit('bare'));assert.ok(gear.every(object=>!object.visible));
 let meshes=0;for(const part of gear)part.traverse(object=>{if(object instanceof T.SkinnedMesh){meshes++;const weights=object.geometry.getAttribute('skinWeight');for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<.0001);}});
 assert.ok(meshes>=30);
});
test('全装装备展示保留真实身高，护膝朝前，展示与动作反复切换不累积变形',async context=>{
 const {soldier,actor,sim,gear}=await fixture();applyOutfit(soldier.scene,presetOutfit('heavy'));actor.showRestPose();
 const body:T.Object3D[]=[];soldier.scene.traverse(object=>{if(object.name.startsWith('base-'))body.push(object);});
 const box=new T.Box3();for(const object of body)box.union(meshBounds(object));const height=box.max.y-box.min.y;
 assert.ok(height>1.75&&height<1.9,`静止身高 ${height}`);
 for(const side of ['left','right']){
  const knee=gear.find(object=>object.userData.sourceAsset==='reference-knee-'+side)!;const bound=meshBounds(knee),calf=soldier.scene.getObjectByName((side==='left'?'L':'R')+'_Calf')!.getWorldPosition(new T.Vector3());
  assert.ok(bound.getCenter(new T.Vector3()).z>calf.z+.02,'护膝必须位于腿前侧');
 }
 for(let i=0;i<24;i++){sim.player.angle=i*.23;sim.player.moveAngle=-i*.17;sim.player.moving=i%2===0;actor.update(sim,1/60);assert.ok(actor.measurePose().rightGripError<.001);actor.showRestPose();}
 actor.update(sim,0);assert.ok(actor.measurePose().rightGripError<.001);
 context.diagnostic(`装备展示基础人体身高 ${height.toFixed(4)} 米`);
});
test('全装实际骨架覆盖三武器、配件、行走与换弹，新增网格同步平移',async context=>{
 const {soldier,actor,sim,gear}=await fixture();applyOutfit(soldier.scene,presetOutfit('heavy'));
 const samples:T.SkinnedMesh[]=[];for(const object of gear)object.traverse(child=>{if(child instanceof T.SkinnedMesh)samples.push(child);});
 const helmet=samples.find(object=>object.name.includes('helmet'))!,head=soldier.scene.getObjectByName('Head')!;
 let right=0,left=0,drift=0;let reference:T.Vector3|undefined;
 for(const weapon of weaponIds)for(const upgraded of [false,true]){
  sim.configureLoadout({...defaultLoadout(weapon),attachments:upgraded?['optic','stock','magazine','grip']:[]});
  for(let aim=0;aim<8;aim++)for(let frame=0;frame<60;frame++){
   sim.player.moving=true;sim.player.angle=aim*Math.PI/4;sim.player.moveAngle=(aim+Math.floor(frame/8))*Math.PI/4;sim.reload=frame<30?0:1.7*(60-frame)/30;
   actor.update(sim,1/60);actor.root.updateMatrixWorld(true);
   const local=head.worldToLocal(helmet.getVertexPosition(0,new T.Vector3()).applyMatrix4(helmet.matrixWorld));if(!reference)reference=local.clone();drift=Math.max(drift,local.distanceTo(reference));
   const pose=actor.measurePose();right=Math.max(right,pose.rightGripError);left=Math.max(left,pose.leftGripError);
   for(const mesh of samples)assert.ok(mesh.getVertexPosition(0,new T.Vector3()).applyMatrix4(mesh.matrixWorld).toArray().every(Number.isFinite));
  }
 }
 assert.ok(drift<.001&&right<.04&&left<.04,`漂移 ${drift}，握点 ${right}/${left}`);
 const before=samples.map(mesh=>mesh.getVertexPosition(0,new T.Vector3()).applyMatrix4(mesh.matrixWorld));sim.player.x+=3;sim.player.z-=2;actor.update(sim,0);actor.root.updateMatrixWorld(true);
 samples.forEach((mesh,index)=>assert.ok(mesh.getVertexPosition(0,new T.Vector3()).applyMatrix4(mesh.matrixWorld).sub(before[index]).distanceTo(new T.Vector3(3,0,-2))<.001));
 context.diagnostic(`二千八百八十帧：头部漂移 ${drift.toFixed(6)} 米；握点最大 ${right.toFixed(4)}/${left.toFixed(4)} 米`);
});
test('新旧穿戴记录兼容，透明镜片有真实材质且贴图内嵌',()=>{
 const old={legacy:false,armor:2,helmet:true,goggles:true,headset:true,backpack:true,gloves:true,boots:true,kneepads:true};
 const normalized=normalizeOutfit(old);assert.equal(normalized.armor,2);assert.equal(normalized.belt,false);assert.ok(normalized.helmet);
 const file=readFileSync(new URL('../public/models/game/modular-soldier-v5.glb',import.meta.url));const json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
 assert.ok(json.materials.some((material:any)=>material.name==='烟灰透明聚碳酸酯镜片'&&material.alphaMode==='BLEND'));
 assert.ok(json.images.every((image:any)=>!image.uri&&Number.isInteger(image.bufferView)));
 assert.equal(json.animations.length,1);assert.equal(json.animations[0].channels.length,123);
});
