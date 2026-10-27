import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Simulation } from './simulation';
export type ActorPose = Pick<Simulation, 'player'|'loadout'|'weapon'|'reload'|'time'|'lastShotAt'>;
import { RIFLE_CENTER, RIFLE_MUZZLE, rifleRecoil } from './ballistics';
import { reloadPose } from './ammo';
import { weaponIds, weaponSpecs, type WeaponId, type Loadout } from './weapons';
const yAxis=new T.Vector3(0,1,0);
export function applyWeaponAppearance(active:T.Object3D,loadout:Loadout) {
  const has=(slot:string)=>loadout.attachments.some(value=>value===slot);
  for(const [name,enabled] of [['optic',has('optic')],['grip',has('grip')],['stock-standard',!has('stock')],['stock-upgraded',has('stock')],['magazine-standard',!has('magazine')],['magazine-extended',has('magazine')]] as const){
    const object=active.getObjectByName(name);if(object)object.visible=enabled;
  }
}
export async function createActor(report: (text:string)=>void) {
  const loader=new GLTFLoader();
  const [soldier, ...guns]=await Promise.all([
    loader.loadAsync('/models/soldier-walk-v1.glb'),...weaponIds.map(id=>loader.loadAsync(`/models/weapons/${id}-v1.glb`))
  ]);
  const library=Object.fromEntries(weaponIds.map((id,index)=>[id,guns[index]])) as Record<WeaponId,GLTF>;
  report('正在校准骨骼与武器');
  return assembleActor(soldier,library.rifle,library);
}
// 分离资源加载和姿态更新，真实模型可在无图形界面的回归测试中复现。
export function assembleActor(soldier:GLTF,rifle:GLTF,library?:Record<WeaponId,GLTF>,poseOptions:{reloadInset?:number;smgSupportInset?:number}={}) {
  const root=new T.Group(), body=new T.Group(), locomotion=new T.Group(), weaponPivot=new T.Group();root.add(body,weaponPivot);
  const model=soldier.scene;body.add(locomotion);locomotion.add(model);
  root.name='player-root';weaponPivot.name='weapon-pivot';
  const mixer=new T.AnimationMixer(model), clip=soldier.animations[0];
  const action=mixer.clipAction(clip);action.play();mixer.update(0);
  // 克隆预览角色后先刷新骨骼与蒙皮范围，避免用旧世界矩阵算出错误身高。
  model.updateMatrixWorld(true);
  // 保存文件绑定空间下的局部静止姿态；非骨骼父节点的缩放也必须扣除。
  const restMatrices=new Map<T.Bone,T.Matrix4>();
  model.traverse(object=>{if(object instanceof T.SkinnedMesh)object.skeleton.bones.forEach((bone,index)=>{if(!restMatrices.has(bone))restMatrices.set(bone,object.skeleton.boneInverses[index].clone().invert());});});
  const restPose=[...restMatrices].map(([bone,world])=>{
    const parent=restMatrices.get(bone.parent as T.Bone)||bone.parent!.matrixWorld;
    const local=parent.clone().invert().multiply(world),position=new T.Vector3(),quaternion=new T.Quaternion(),scale=new T.Vector3();
    local.decompose(position,quaternion,scale);return {bone,position,quaternion,scale};
  });
  model.traverse(object=>{if(object instanceof T.SkinnedMesh)object.computeBoundingBox();});
  const box=new T.Box3().setFromObject(model), size=box.getSize(new T.Vector3()), center=box.getCenter(new T.Vector3());
  const scale=1.82/size.y;
  model.scale.setScalar(scale); model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
  body.rotation.y=-Math.PI/2;
  model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  const gun=rifle.scene;let gunScale=1;
  // 整备场景使用同一处较靠后的冲锋枪支撑位置，握把实物与握点一起移动。
  if(library&&poseOptions.smgSupportInset)for(const name of ['left-grip','grip-hand','grip']){
    const part=library.smg.scene.getObjectByName(name);if(part)part.position.z-=poseOptions.smgSupportInset;
  }
  if(!library){const gb=new T.Box3().setFromObject(gun),gs=gb.getSize(new T.Vector3()),gc=gb.getCenter(new T.Vector3());
    gunScale=.95/Math.max(gs.x,gs.y,gs.z);gun.scale.setScalar(gunScale);gun.position.copy(gc).multiplyScalar(-gunScale);}
  const gunCenter=new T.Group();
  if(library)for(const id of weaponIds){library[id].scene.visible=false;gunCenter.add(library[id].scene);}else gunCenter.add(gun);
  weaponPivot.add(gunCenter);gunCenter.position.set(0,RIFLE_CENTER.y,RIFLE_CENTER.z);
  gunCenter.name='weapon-body';
  // 当前步枪的独立弹匣网格，保留其原贴图，沿插槽方向取出与插回。
  let magazine=gun.getObjectByName(library?'magazine-standard':'tripo_part_0')!;
  let magazinePosition=magazine.position.clone(),magazineRotation=magazine.rotation.clone();
  magazine.userData.role='弹匣';
  const rightGrip=new T.Object3D(),leftGrip=new T.Object3D();
  rightGrip.name='ik-right-target';leftGrip.name='ik-left-target';
  rightGrip.position.set(0,-.09,-.2);leftGrip.position.set(0,-.06,.02);
  const supportGrip=leftGrip.position.clone();
  const magazinePoses=new Map<T.Object3D,{position:T.Vector3;rotation:T.Euler}>();
  if(library)for(const id of weaponIds)for(const name of ['magazine-standard','magazine-extended']){
    const object=library[id].scene.getObjectByName(name)!;
    magazinePoses.set(object,{position:object.position.clone(),rotation:object.rotation.clone()});
  }
  gunCenter.add(rightGrip,leftGrip);
  gunCenter.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  const muzzle=new T.Object3D();muzzle.name='rifle-muzzle';
  muzzle.position.set(RIFLE_MUZZLE.x,RIFLE_MUZZLE.y-RIFLE_CENTER.y,RIFLE_MUZZLE.z-RIFLE_CENTER.z);gunCenter.add(muzzle);
  const ring=new T.Mesh(new T.RingGeometry(.48,.51,48),new T.MeshBasicMaterial({color:0xb9cc86,transparent:true,opacity:.7,side:T.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.025;root.add(ring);
  const getBone=(name:string)=>model.getObjectByName(name)!;
  const hip=getBone('Hip');
  let resting=false;
  // 动画混合器可能跳过数值未变化的属性；先恢复原动画姿态，避免手动瞄准累积。
  const controlled=['Waist','R_Upperarm','R_Forearm','L_Upperarm','L_Forearm'].map(name=>({bone:getBone(name),pose:getBone(name).quaternion.clone()}));
  function aimBone(bone:T.Object3D,child:T.Object3D,target:T.Vector3) {
    root.updateMatrixWorld(true);
    const p=bone.getWorldPosition(new T.Vector3()),c=child.getWorldPosition(new T.Vector3());
    const delta=new T.Quaternion().setFromUnitVectors(c.sub(p).normalize(),target.clone().sub(p).normalize());
    const world=bone.getWorldQuaternion(new T.Quaternion()).premultiply(delta);
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
    root.updateMatrixWorld(true);
  }
  function arm(side:string,handTarget:T.Vector3,elbowTarget:T.Vector3) {
    const upper=getBone(`${side}_Upperarm`),fore=getBone(`${side}_Forearm`),hand=getBone(`${side}_Hand`);
    // 两段骨骼用几何解约束，保持肢体长度，末端与武器握点对齐。
    root.updateMatrixWorld(true);
    const shoulder=upper.getWorldPosition(new T.Vector3()),elbow=fore.getWorldPosition(new T.Vector3()),wrist=hand.getWorldPosition(new T.Vector3());
    const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),axis=handTarget.clone().sub(shoulder);
    const d=Math.min(a+b-.001,Math.max(Math.abs(a-b)+.001,axis.length()));axis.normalize();
    const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
    const bend=elbowTarget.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const joint=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
    aimBone(upper,fore,joint);aimBone(fore,hand,handTarget);
  }
  return { root, previewModels:library?{pistol:library.pistol.scene,smg:library.smg.scene,rifle:library.rifle.scene}:undefined,
    showRestPose(){
      if(!resting){for(const item of restPose){item.bone.position.copy(item.position);item.bone.quaternion.copy(item.quaternion);item.bone.scale.copy(item.scale);}resting=true;}
      body.rotation.y=-Math.PI/2;locomotion.position.set(0,0,0);root.updateMatrixWorld(true);
      const displacement=body.worldToLocal(hip.getWorldPosition(new T.Vector3()));
      locomotion.position.set(-displacement.x,0,-displacement.z);root.updateMatrixWorld(true);
    },
    muzzlePosition() { root.updateMatrixWorld(true);return muzzle.getWorldPosition(new T.Vector3()); },
    measurePose() {
      root.updateMatrixWorld(true);
      const bodyPosition=hip.getWorldPosition(new T.Vector3()),weaponPosition=gunCenter.getWorldPosition(new T.Vector3());
      return {bodyPosition:bodyPosition.toArray(),weaponPosition:weaponPosition.toArray(),
        magazinePosition:magazine.getWorldPosition(new T.Vector3()).toArray(),
        rightGripError:getBone('R_Hand').getWorldPosition(new T.Vector3()).distanceTo(rightGrip.getWorldPosition(new T.Vector3())),
        leftGripError:getBone('L_Hand').getWorldPosition(new T.Vector3()).distanceTo(leftGrip.getWorldPosition(new T.Vector3()))};
    },
    update(sim:ActorPose,dt:number) {
    if(resting){action.stop();action.reset().play();mixer.setTime(0);for(const item of controlled)item.pose.copy(item.bone.quaternion);resting=false;}
    if(library){
      const loadout=sim.loadout,active=library[loadout.weapon].scene;
      for(const id of weaponIds)library[id].scene.visible=id===loadout.weapon;
      const has=(slot:string)=>loadout.attachments.some(value=>value===slot);
      applyWeaponAppearance(active,loadout);
      magazine=active.getObjectByName(has('magazine')?'magazine-extended':'magazine-standard')!;
      const initial=magazinePoses.get(magazine)!;magazinePosition=initial.position;magazineRotation=initial.rotation;
      rightGrip.position.copy(active.getObjectByName('right-grip')!.position);
      supportGrip.copy(active.getObjectByName(has('grip')?'grip-hand':'left-grip')!.position);
      muzzle.position.copy(active.getObjectByName('muzzle')!.position);
    }
    root.position.set(sim.player.x,0,sim.player.z);
    const moving=sim.player.moving;
    for(const item of controlled)item.bone.quaternion.copy(item.pose);
    if(moving)mixer.update(dt*1.6);else mixer.setTime(0);
    for(const item of controlled)item.pose.copy(item.bone.quaternion);
    body.rotation.y=sim.player.moveAngle-Math.PI/2;
    // 行走位移实际在 Hip；在父坐标中消除其水平平移，保留垂直步态。
    locomotion.position.set(0,0,0);
    root.updateMatrixWorld(true);
    const displacement=body.worldToLocal(hip.getWorldPosition(new T.Vector3()));
    locomotion.position.set(-displacement.x,0,-displacement.z);
    root.updateMatrixWorld(true);
    const waist=getBone('Waist');
    const turn=Math.atan2(Math.sin(sim.player.angle-sim.player.moveAngle),Math.cos(sim.player.angle-sim.player.moveAngle));
    const world=waist.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromAxisAngle(yAxis,turn));
    waist.quaternion.copy(waist.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
    weaponPivot.rotation.y=sim.player.angle;
    const pose=reloadPose(sim.reload);
    const recoil=rifleRecoil(sim.time-sim.lastShotAt);
    // 短臂基础角色换弹时把枪收近胸前；不开火期间平滑调整，射击枪口坐标保持一致。
    const reloadInset=(poseOptions.reloadInset||0)*(-pose.lower/.07);
    const holdOffset=library?weaponSpecs[sim.weapon].holdOffset:0;
    gunCenter.position.set(0,RIFLE_CENTER.y+pose.lower,RIFLE_CENTER.z+holdOffset-recoil.backward-(library&&sim.weapon==='smg'?pose.hand*.14:0)-reloadInset);
    gunCenter.rotation.set(recoil.pitch+pose.tilt,0,pose.cant);
    magazine.position.copy(magazinePosition);magazine.rotation.copy(magazineRotation);
    magazine.position.y-=pose.magazine*.15/gunScale;
    magazine.position.z-=pose.magazine*.03/gunScale;
    magazine.rotation.x-=pose.magazine*.2;
    root.updateMatrixWorld(true);
    const magazineTarget=magazine.getWorldPosition(new T.Vector3());
    if(library){
      const box=new T.Box3().setFromObject(magazine),center=box.getCenter(new T.Vector3());
      magazineTarget.set(center.x,box.max.y-.025,center.z);
    }
    const magazineHand=gunCenter.worldToLocal(magazineTarget).add(new T.Vector3(.045,0,0));
    leftGrip.position.copy(supportGrip).lerp(magazineHand,pose.hand);
    leftGrip.position.lerp(new T.Vector3(.055,.025,-.14-pose.bolt*.045),pose.bolt);
    root.updateMatrixWorld(true);
    const worldTarget=(v:T.Vector3)=>weaponPivot.localToWorld(v);
    arm('R',rightGrip.getWorldPosition(new T.Vector3()),worldTarget(new T.Vector3(-.5,.95,.02)));
    arm('L',leftGrip.getWorldPosition(new T.Vector3()),worldTarget(new T.Vector3(.4,1.05,.22)));
  }};
}
