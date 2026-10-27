import * as T from 'three';
import { Simulation } from './simulation';
import type { Loadout } from './weapons';
import type { assembleModularActor } from './modular-actor';
import type { Outfit } from './outfit';

export type OutfitPose='inspect'|'aim'|'walk'|'reload';
export function createOutfitPreview(container:HTMLElement,actor:ReturnType<typeof assembleModularActor>,loadout:Loadout) {
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.domElement.setAttribute('aria-label','角色换装三维预览，可拖动旋转');container.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color('#182328');scene.add(actor.root);
  scene.add(new T.HemisphereLight(0xe4eee8,0x4e5146,2.4));
  const key=new T.DirectionalLight(0xffefdc,3);key.position.set(2,4,4);scene.add(key);
  const rim=new T.DirectionalLight(0x9ebed0,2);rim.position.set(-3,2,-3);scene.add(rim);
  const floor=new T.Mesh(new T.CircleGeometry(1.05,64),new T.MeshStandardMaterial({color:0x303f40,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
  const camera=new T.OrthographicCamera(-1.5,1.5,1.075,-1.075,.01,30);
  const sim=new Simulation(()=>.5,loadout);sim.player.x=sim.player.z=0;
  let pose:OutfitPose='inspect',yaw=0,distance=3.8,time=0,dragX:number|undefined,disposed=false,frames=0,seconds=0,weaponVisible=true;
  function resize(){const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight),aspect=w/h,span=Math.max(2.15,2.08/aspect);renderer.setSize(w,h,false);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  renderer.domElement.addEventListener('pointerdown',event=>{dragX=event.clientX;renderer.domElement.setPointerCapture(event.pointerId);});
  renderer.domElement.addEventListener('pointermove',event=>{if(dragX!==undefined){yaw-=(event.clientX-dragX)*.012;dragX=event.clientX;}});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,()=>{dragX=undefined;});
  renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();distance=T.MathUtils.clamp(distance+event.deltaY*.003,2.3,5);},{passive:false});
  return {
    setOutfit:(value:Outfit)=>actor.setOutfit(value),
    setPose:(value:OutfitPose)=>{pose=value;time=0;},
    rotate:(delta:number)=>{yaw+=delta;},
    setView:(value:'front'|'back')=>{yaw=value==='front'?0:Math.PI;},
    setWeaponVisible:(value:boolean)=>{weaponVisible=value;},
    render(dt:number){
      if(disposed)return;time+=dt;sim.time=time;sim.player.moving=pose==='walk';
      sim.player.angle=pose==='aim'?Math.sin(time*.35)*.12:0;sim.player.moveAngle=0;
      const cycle=time%3.2;sim.reload=pose==='reload'&&cycle<1.7?1.7-cycle:0;
      if(pose==='inspect')actor.showRestPose();else actor.update(sim,dt);
      actor.setWeaponVisible(weaponVisible&&pose!=='inspect');
      camera.zoom=3.8/distance;camera.updateProjectionMatrix();camera.position.set(Math.sin(yaw)*distance,pose==='inspect'?.94:1.25,Math.cos(yaw)*distance);camera.lookAt(0,.94,0);
      renderer.render(scene,camera);frames++;seconds+=dt;
      container.dataset.parts=JSON.stringify(actor.measureEquipment());container.dataset.triangles=String(renderer.info.render.triangles);
      if(seconds>=1){container.dataset.fps=String(Math.round(frames/seconds));frames=0;seconds=0;}
    },
    dispose(){
      if(disposed)return;disposed=true;observer.disconnect();
      const skeletons=new Set<T.Skeleton>();actor.root.traverse(object=>{if(object instanceof T.SkinnedMesh)skeletons.add(object.skeleton);});skeletons.forEach(skeleton=>skeleton.dispose());
      floor.geometry.dispose();floor.material.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    },
  };
}

