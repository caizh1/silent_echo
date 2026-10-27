import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Simulation } from './simulation';
import { GRENADE } from './weapons';

// 预分配三枚外观，共享几何和材质；重复投掷、暂停与重开均不新增图形资源。
export function assembleGrenadeField(scene: T.Scene, source: T.Object3D) {
  const pool = Array.from({ length: GRENADE.maximum }, () => {
    const object = source.clone(true); object.visible = false;
    object.traverse(node => { if (node instanceof T.Mesh) node.castShadow = true; });
    scene.add(object); return object;
  });
  return {
    update(sim: Simulation) {
      pool.forEach((object, index) => {
        const grenade = sim.grenades[index]; object.visible = !!grenade;
        if (!grenade) return;
        object.position.set(grenade.x, grenade.y, grenade.z);
        object.rotation.set(grenade.age * 5, grenade.age * 3, grenade.age * 2);
      });
    },
    stats() { return { capacity: pool.length, visible: pool.filter(object => object.visible).length }; },
  };
}
export async function createGrenadeField(scene: T.Scene) {
  const model = await new GLTFLoader().loadAsync('/models/weapons/grenade-v1.glb');
  return assembleGrenadeField(scene, model.scene);
}
