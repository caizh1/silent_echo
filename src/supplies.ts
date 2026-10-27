import * as T from 'three';
import type { Simulation } from './simulation';

// 所有拾取物共用几何和材质；移除拾取物时不重复创建或销毁显卡资源。
export function createSupplyField(scene: T.Scene) {
  const box=new T.BoxGeometry(1,1,1),ring=new T.RingGeometry(.57,.61,40),crystal=new T.OctahedronGeometry(.23);
  const olive=new T.MeshStandardMaterial({color:0x485142,roughness:.76,metalness:.25});
  const dark=new T.MeshStandardMaterial({color:0x242d29,roughness:.65,metalness:.35});
  const brass=new T.MeshStandardMaterial({color:0xd6ac57,roughness:.4,metalness:.6,emissive:0xb57c20,emissiveIntensity:.35});
  const amber=new T.MeshBasicMaterial({color:0xf0c36c,transparent:true,opacity:.8,side:T.DoubleSide,toneMapped:false});
  const green=new T.MeshStandardMaterial({color:0x4dffab,emissive:0x20cf80,emissiveIntensity:1.2});
  const drops=new Map<number,T.Object3D>(),crates=new Map<number,{root:T.Group;lid:T.Group;marker:T.Mesh}>();
  function block(parent:T.Object3D,material:T.Material,size:number[],position:number[]) {
    const mesh=new T.Mesh(box,material);mesh.scale.set(...size as [number,number,number]);mesh.position.set(...position as [number,number,number]);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  function bulletMarks(parent:T.Object3D,y:number,scale=1) {
    for(const x of [-.14,0,.14])block(parent,brass,[.055*scale,.016,.22*scale],[x*scale,y,0]);
  }
  function createCrate() {
    const root=new T.Group();root.name='ammo-supply';
    block(root,dark,[1.02,.12,.68],[0,.08,0]);block(root,olive,[.94,.42,.62],[0,.32,0]);
    for(const x of [-.34,.34])block(root,brass,[.06,.48,.66],[x,.34,0]);
    const lid=new T.Group();lid.position.set(0,.55,-.33);root.add(lid);
    block(lid,olive,[1.02,.1,.68],[0,0,.33]);
    const marks=new T.Group();marks.position.z=.33;lid.add(marks);bulletMarks(marks,.06);
    block(root,dark,[.24,.1,.04],[0,.42,.34]);
    const marker=new T.Mesh(ring,amber);marker.rotation.x=-Math.PI/2;marker.position.y=.025;root.add(marker);
    scene.add(root);return {root,lid,marker};
  }
  let owner:Simulation|undefined;
  return {
    update(sim:Simulation) {
      if(owner!==sim){for(const object of drops.values())scene.remove(object);for(const view of crates.values())scene.remove(view.root);drops.clear();crates.clear();owner=sim;}
      const dropIds=new Set(sim.drops.map(d=>d.id)),crateIds=new Set(sim.crates.map(c=>c.id));
      for(const[id,object]of drops)if(!dropIds.has(id)){scene.remove(object);drops.delete(id);}
      for(const[id,crate]of crates)if(!crateIds.has(id)){scene.remove(crate.root);crates.delete(id);}
      for(const drop of sim.drops){
        let object=drops.get(drop.id);
        if(!object){
          if(drop.kind==='xp')object=new T.Mesh(crystal,green);
          else{
            object=new T.Group();object.name='ammo-pickup';
            block(object,dark,[.44,.22,.3],[0,0,0]);
            for(const x of [-.12,0,.12])block(object,brass,[.065,.13,.27],[x,.13,0]);
          }
          drops.set(drop.id,object);scene.add(object);
        }
        object.position.set(drop.x,.3+Math.sin(sim.time*3+drop.id)*.07,drop.z);object.rotation.y=sim.time*.8;
      }
      for(const crate of sim.crates){
        let view=crates.get(crate.id);if(!view){view=createCrate();crates.set(crate.id,view);}
        view.root.position.set(crate.x,0,crate.z);view.root.rotation.y=.2;
        const opened=crate.openedAt===undefined?0:Math.min(1,(sim.time-crate.openedAt)/.4);
        view.lid.rotation.x=-opened*1.9;
        view.marker.visible=crate.rounds>0||(!crate.aidUsed&&((crate.medical??0)>0||(crate.grenades??0)>0));
        view.marker.scale.setScalar(1+Math.sin(sim.time*2.5)*.06);
        view.root.scale.setScalar(crate.emptiedAt===undefined?1:Math.max(0,1-Math.max(0,sim.time-crate.emptiedAt-.65)/.35));
      }
    },
    stats:()=>({drops:drops.size,crates:crates.size}),
  };
}
