import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assembleActor, type ActorPose } from './actor';
import { weaponIds, type WeaponId } from './weapons';
import { applyOutfit, normalizeOutfit, readOutfit, type Outfit } from './outfit';
import type { Simulation } from './simulation';

// 原角色、素装角色与武器各自持有场景节点，纹理和几何可共享，避免切换时重绑骨架。
export async function createModularActor(report:(text:string)=>void) {
  const loader=new GLTFLoader();
  const [legacy,modern,...guns]=await Promise.all([
    loader.loadAsync('/models/soldier-walk-v1.glb'),loader.loadAsync('/models/game/modular-soldier-v5.glb'),
    ...weaponIds.map(id=>loader.loadAsync(`/models/weapons/${id}-v1.glb`)),
  ]);
  report('正在校准角色与可穿戴装备');
  const templates=[legacy,modern].map(value=>({...value,scene:clone(value.scene) as T.Group}));
  const library=()=>Object.fromEntries(weaponIds.map((id,index)=>[id,{...guns[index],scene:clone(guns[index].scene) as T.Group}])) as Record<WeaponId,GLTF>;
  return {...assembleModularActor(legacy,modern,library(),library()),
    createPreview:()=>assembleModularActor({...templates[0],scene:clone(templates[0].scene) as T.Group},{...templates[1],scene:clone(templates[1].scene) as T.Group},library(),library())};
}
export function assembleModularActor(legacy:GLTF,modern:GLTF,legacyGuns:Record<WeaponId,GLTF>,modernGuns:Record<WeaponId,GLTF>) {
  // 装备不参与基础人体的身高和中心计算，否则背包和头盔会改变人物尺度。
  const equipment:{object:T.Object3D;parent:T.Object3D}[]=[];
  modern.scene.traverse(object=>{if(object.userData.outfitSlot&&object.parent)equipment.push({object,parent:object.parent});});
  if(!equipment.length)throw new Error('角色缺少可穿戴装备');
  equipment.forEach(entry=>entry.parent.remove(entry.object));
  const oldActor=assembleActor(legacy,legacyGuns.rifle,legacyGuns,{smgSupportInset:.08});
  const newActor=assembleActor(modern,modernGuns.rifle,modernGuns,{reloadInset:.09,smgSupportInset:.08});
  equipment.forEach(entry=>{entry.parent.add(entry.object);entry.object.traverse(object=>{if(object instanceof T.Mesh){const materials=Array.isArray(object.material)?object.material:[object.material];object.castShadow=!materials.every(material=>material.transparent);object.receiveShadow=true;object.frustumCulled=false;}});});
  const root=new T.Group();root.name='modular-player-root';root.add(oldActor.root,newActor.root);
  let outfit=readOutfit(), active=newActor,lastSimulation:ActorPose|undefined;
  function setOutfit(value:Outfit) {
    outfit=normalizeOutfit(value);applyOutfit(modern.scene,outfit);
    oldActor.root.visible=outfit.legacy;newActor.root.visible=!outfit.legacy;active=outfit.legacy?oldActor:newActor;
    // 暂停时切换角色也要立即复制当前位置与持枪姿态，不能等下一帧战斗恢复。
    if(lastSimulation)active.update(lastSimulation,0);
  }
  setOutfit(outfit);
  return {root,setOutfit,getOutfit:()=>({...outfit}),previewModels:oldActor.previewModels,
    muzzlePosition:()=>active.muzzlePosition(),measurePose:()=>active.measurePose(),
    update(sim:ActorPose,dt:number){lastSimulation=sim;active.update(sim,dt);},
    showRestPose(){active.showRestPose();},
    setWeaponVisible(value:boolean){for(const actor of [oldActor,newActor]){const pivot=actor.root.getObjectByName('weapon-pivot');if(pivot)pivot.visible=value;}},
    measureEquipment(){
      const parts:{name:string;slot:string;tier:number;visible:boolean;skinned:boolean}[]=[];
      modern.scene.traverse(object=>{if(object.userData.outfitSlot){let skinned=false;object.traverse(child=>{if(child instanceof T.SkinnedMesh)skinned=true;});parts.push({name:object.name,slot:object.userData.outfitSlot,tier:Number(object.userData.armorTier||0),visible:object.visible&&!outfit.legacy,skinned});}});
      return {outfit:{...outfit},parts};
    },
  };
}

