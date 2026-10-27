import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyWeaponAppearance } from './actor';
import { weaponIds, type Loadout, type WeaponId } from './weapons';

export function createLoadoutPreview(models: Record<WeaponId, T.Object3D>) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.domElement.setAttribute('aria-label','当前枪械与已安装配件的三维旋转预览');
  const scene=new T.Scene();scene.background=new T.Color('#142020');
  // 金属材质需要环境反射，才能清楚呈现原图模型的接缝与表面层次。
  const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);
  scene.environment=environment.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xe0eee4,0x465141,2.3));
  const light=new T.DirectionalLight(0xffe5b9,3);light.position.set(2,3,2);scene.add(light);
  const camera=new T.OrthographicCamera(-1,1,1,-1,.01,10),pivot=new T.Group(),turntable=new T.Group();scene.add(turntable);turntable.add(pivot);
  const copies=Object.fromEntries(weaponIds.map(id=>{const copy=models[id].clone(true);copy.visible=false;pivot.add(copy);return[id,copy];})) as Record<WeaponId,T.Object3D>;
  let container:HTMLElement|undefined,key='',angle=.4,width=0,height=0;
  let corners:T.Vector3[]=[];
  return {
    mount(target:HTMLElement) { container=target;target.appendChild(renderer.domElement); },
    render(loadout:Loadout,dt:number) {
      if(!container?.isConnected||container.clientWidth===0||container.clientHeight===0)return;
      const next=JSON.stringify(loadout);
      if(next!==key){
        key=next;
        for(const id of weaponIds)copies[id].visible=id===loadout.weapon;
        const active=copies[loadout.weapon];applyWeaponAppearance(active,loadout);
        turntable.rotation.y=0;turntable.updateMatrixWorld(true);
        const bounds=new T.Box3();active.traverseVisible(node=>{if(node instanceof T.Mesh)bounds.union(new T.Box3().setFromObject(node));});
        const center=bounds.getCenter(new T.Vector3());pivot.position.sub(center);
        bounds.translate(center.clone().negate());corners=[];
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new T.Vector3(x,y,z));
        angle=.4;
      }
      const w=container.clientWidth,h=container.clientHeight;
      if(width!==w||height!==h){renderer.setSize(w,h,false);width=w;height=h;}
      const aspect=w/h;
      angle+=dt*.35;turntable.rotation.y=Math.sin(angle)*.32;
      const view=new T.Vector3(1,.36,.55).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),view).normalize(),up=new T.Vector3().crossVectors(view,right);
      const points=corners.map(point=>point.clone().applyAxisAngle(new T.Vector3(0,1,0),turntable.rotation.y));
      const horizontal=Math.max(...points.map(point=>Math.abs(point.dot(right)))),vertical=Math.max(...points.map(point=>Math.abs(point.dot(up))));
      const extent=Math.max(horizontal/aspect,vertical)*1.12;
      camera.left=-extent*aspect;camera.right=extent*aspect;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();
      camera.position.copy(view).multiplyScalar(3);camera.lookAt(0,0,0);
      renderer.render(scene,camera);
    },
    dispose() { environment.dispose();renderer.dispose(); },
  };
}
