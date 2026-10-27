import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { loadPoseModel } from './load-model.ts';

function glb(version:number){
 const bytes=readFileSync(new URL(`../public/models/game/modular-soldier-v${version}.glb`,import.meta.url));
 const jsonLength=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=bytes.subarray(28+jsonLength);
 function accessor(index:number){
  const a=data.accessors[index],v=data.bufferViews[a.bufferView],size=({5120:1,5121:1,5122:2,5123:2,5125:4,5126:4} as Record<number,number>)[a.componentType]*({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16} as Record<string,number>)[a.type];
  const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size;
  return {type:a.type,componentType:a.componentType,count:a.count,normalized:!!a.normalized,bytes:Buffer.concat(Array.from({length:a.count},(_,i)=>binary.subarray(start+i*stride,start+i*stride+size)))};
 }
 function image(index:number){const texture=data.textures[index],source=data.images[texture.source],v=data.bufferViews[source.bufferView];return createHash('sha256').update(binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).digest('hex');}
 return {data,accessor,image};
}
test('第五版保留第四版所有基础人体和非头部装备的实际几何、贴图与绑定',()=>{
 const old=glb(4),next=glb(5);let checked=0;
 for(const source of old.data.nodes){
  if(source.mesh===undefined||['helmet','goggles','headset'].includes(source.extras?.outfitSlot))continue;
  const target=next.data.nodes.find((n:any)=>n.name===source.name);assert.ok(target,'保留原有网格 '+source.name);
  const before=old.data.meshes[source.mesh],after=next.data.meshes[target.mesh];assert.equal(before.primitives.length,after.primitives.length);
  before.primitives.forEach((primitive:any,index:number)=>{
   const newer=after.primitives[index];assert.deepEqual(Object.keys(newer.attributes).sort(),Object.keys(primitive.attributes).sort());
   for(const key of Object.keys(primitive.attributes))assert.deepEqual(next.accessor(newer.attributes[key]),old.accessor(primitive.attributes[key]),source.name+' '+key);
   assert.deepEqual(next.accessor(newer.indices),old.accessor(primitive.indices),source.name+' 拓扑');
   const oldMat=old.data.materials[primitive.material],newMat=next.data.materials[newer.material];assert.equal(oldMat.name,newMat.name);
   for(const field of ['baseColorTexture','metallicRoughnessTexture']){
    const a=oldMat.pbrMetallicRoughness?.[field],b=newMat.pbrMetallicRoughness?.[field];if(a)assert.equal(old.image(a.index),next.image(b.index),source.name+' '+field);
   }
   if(oldMat.normalTexture)assert.equal(old.image(oldMat.normalTexture.index),next.image(newMat.normalTexture.index));
  });
  assert.deepEqual(next.accessor(next.data.skins[target.skin].inverseBindMatrices),old.accessor(old.data.skins[source.skin].inverseBindMatrices));checked++;
 }
 assert.ok(checked>=40);assert.equal(next.data.animations.length,1);
 old.data.animations[0].samplers.forEach((sampler:any,index:number)=>{
  const newer=next.data.animations[0].samplers[index];for(const key of ['input','output'])assert.deepEqual(next.accessor(newer[key]),old.accessor(sampler[key]));
 });
});
test('头部三类装备独立拆装，镜片单独透明，全部顶点刚性跟随同一头骨',async()=>{
 const {data}=glb(5);assert.equal(data.nodes.some((n:any)=>n.name==='Icosphere'),false);
 const lens=data.materials.find((m:any)=>m.name==='烟灰透明聚碳酸酯镜片');assert.ok(lens&&lens.alphaMode==='BLEND');assert.ok(lens.pbrMetallicRoughness.baseColorFactor[3]>.2&&lens.pbrMetallicRoughness.baseColorFactor[3]<.5);
 const model=await loadPoseModel('game/modular-soldier-v5.glb');const gear:T.SkinnedMesh[]=[];
 model.scene.traverse(o=>{if(o instanceof T.SkinnedMesh&&o.userData.sourceAsset==='headgear-fitted-v5')gear.push(o);});
 assert.equal(gear.length,4);assert.deepEqual(new Set(gear.map(o=>o.userData.outfitSlot)),new Set(['helmet','goggles','headset']));
 for(const o of gear){
  const weights=o.geometry.getAttribute('skinWeight'),joints=o.geometry.getAttribute('skinIndex');
  for(let i=0;i<weights.count;i++)for(let j=0;j<4;j++)if(weights.getComponent(i,j)>0){assert.equal(o.skeleton.bones[joints.getComponent(i,j)].name,'Head');assert.equal(weights.getComponent(i,j),1);}
 }
});
