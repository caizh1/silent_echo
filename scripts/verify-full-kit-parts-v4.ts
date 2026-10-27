// 核对独立模型的绑定坐标、骨骼和部件边界，与完整模型保持一致。
import { readFileSync,writeFileSync } from 'node:fs';
import * as T from 'three';
import { loadPoseModel } from '../tests/load-model.ts';
const version=Number(process.argv[2]||4);if(![4,5].includes(version))throw new Error('仅支持第四版与第五版');
const prefix=`../../assets/models/derived/full-kit-v${version}/`;
function bounds(root:T.Object3D){
 const box=new T.Box3();root.traverse(object=>{if(object instanceof T.SkinnedMesh)for(let i=0;i<object.geometry.getAttribute('position').count;i++)box.expandByPoint(object.getVertexPosition(i,new T.Vector3()).applyMatrix4(object.matrixWorld));});return box;
}
const full=await loadPoseModel(prefix+`full-kit-soldier-v${version}.glb`);full.scene.updateMatrixWorld(true);
const reportPath=new URL(`../docs/modeling/full-kit-parts-v${version}.json`,import.meta.url);
const report=JSON.parse(readFileSync(reportPath,'utf8'));
let maximum=0,boneMaximum=0;
for(const entry of report.文件){
 const file=entry.文件.split('/').at(-1),model=await loadPoseModel(prefix+file);model.scene.updateMatrixWorld(true);
 if(model.animations.length)throw new Error('静止分件包含意外动作：'+file);
 if(file===`base-soldier-v${version}.glb`){
  const box=bounds(model.scene),height=box.max.y-box.min.y;if(!Number.isFinite(height)||Math.abs(height-1.82)>.005)throw new Error('素装身高错误');
 }else if(file!==`full-kit-soldier-v${version}.glb`&&!file.startsWith('armor-i-')&&!file.startsWith('armor-ii-')){
  const equipment:T.Object3D[]=[];model.scene.traverse(object=>{if(object.userData.outfitSlot)equipment.push(object);});
  for(const object of equipment){
   const reference=full.scene.getObjectByName(object.name);if(!reference)throw new Error('完整模型缺少对应节点：'+object.name);
   const a=bounds(object),b=bounds(reference),error=Math.max(a.min.distanceTo(b.min),a.max.distanceTo(b.max));maximum=Math.max(maximum,error);
   if(!Number.isFinite(error)||error>.0001)throw new Error('分件坐标不一致：'+object.name+' '+error);
  }
 }
 let count=0;model.scene.traverse(object=>{if(object instanceof T.SkinnedMesh){count++;if(object.skeleton.bones.length!==41)throw new Error('骨骼数量不一致：'+file);
  for(const bone of object.skeleton.bones){const reference=full.scene.getObjectByName(bone.name)!;const error=Math.max(...bone.matrixWorld.elements.map((value,index)=>Math.abs(value-reference.matrixWorld.elements[index])));boneMaximum=Math.max(boneMaximum,error);if(!Number.isFinite(error)||error>.0001)throw new Error('分件骨骼坐标不一致：'+file+' '+bone.name);}
 }});
 if(!count)throw new Error('缺少实际蒙皮：'+file);
 entry.独立导入通过=true;
}
report.绑定坐标最大误差米=maximum;report.骨骼矩阵最大元素差异=boneMaximum;report.验收='十九个文件独立导入，四十一骨骼及其矩阵一致；素装身高正确，全装与对应分件边界一致';
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({独立文件数:report.文件.length,最大绑定坐标误差米:maximum,骨骼矩阵最大差异:boneMaximum,验收:'通过'}));
