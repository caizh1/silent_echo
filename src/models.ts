import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelData } from './model-data';
import { enemySpecs, type EnemyKind } from './enemies';
import type { Simulation } from './simulation';
import { enemyBob, enemyFacing } from './enemy-motion';
import { createEnemyDeathField } from './enemy-death';

type Asset = keyof typeof modelData;
export async function loadModels(report: (message: string) => void) {
  const loader = new GLTFLoader(), models = new Map<Asset, T.Mesh>();
  let finished = 0;
  await Promise.all((Object.keys(modelData) as Asset[]).map(async id => {
    const gltf = await loader.loadAsync(modelData[id].url);
    gltf.scene.updateMatrixWorld(true);
    const meshes: T.Mesh[] = [];
    gltf.scene.traverse(object => { if (object instanceof T.Mesh) meshes.push(object); });
    if (meshes.length !== 1 || Array.isArray(meshes[0].material)) throw new Error(`模型结构不符合游戏副本要求：${id}`);
    const mesh = meshes[0];
    const material = mesh.material as T.MeshStandardMaterial;
    material.roughness = Math.max(.7, material.roughness);
    const prototype = new T.Mesh(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material);
    models.set(id, prototype);
    report(`正在准备街区与敌人 · ${++finished} / ${Object.keys(modelData).length}`);
  }));
  return {
    create(id: Asset, ownMaterial = false) {
      const prototype = models.get(id)!;
      const mesh = new T.Mesh(prototype.geometry, ownMaterial ? (prototype.material as T.Material).clone() : prototype.material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      return mesh;
    },
    get(id: Asset) { return models.get(id)!; },
  };
}
export type ModelLibrary = Awaited<ReturnType<typeof loadModels>>;

export function createEnemyField(scene: T.Scene, library: ModelLibrary) {
  const deaths = createEnemyDeathField(scene, library);
  const capacity = 64, clock = { value: 0 }, dummy = new T.Object3D();
  const fields = new Map<EnemyKind, { mesh: T.InstancedMesh; motion: T.InstancedBufferAttribute }>();
  for (const kind of Object.keys(enemySpecs) as EnemyKind[]) {
    const prototype = library.get(enemySpecs[kind].asset);
    const geometry = prototype.geometry.clone();
    const motion = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geometry.setAttribute('instanceMotion', motion);
    const human = kind === 'runner' || kind === 'shooter';
    const material = (prototype.material as T.MeshStandardMaterial).clone();
    const animate = (shader: T.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.walkTime = clock;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nuniform float walkTime;\nattribute vec4 instanceMotion;`);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float gait = sin(walkTime * ${human ? '8.5' : '6.0'} + instanceMotion.x + (position.x < 0.0 ? 3.14159 : 0.0));
        ${human ? `
        float leg = 1.0 - smoothstep(0.72, 0.94, position.y);
        float pitch = gait * 0.38 * instanceMotion.y * leg;
        vec2 limb = vec2(transformed.y - 0.9, transformed.z);
        transformed.y = 0.9 + cos(pitch) * limb.x - sin(pitch) * limb.y;
        transformed.z = sin(pitch) * limb.x + cos(pitch) * limb.y;
        float arm = smoothstep(0.23, 0.38, abs(position.x)) * smoothstep(0.83, 0.98, position.y) * (1.0 - smoothstep(1.38, 1.52, position.y));
        float raise = -1.08 * arm;
        vec2 hand = vec2(transformed.y - 1.4, transformed.z);
        transformed.y = 1.4 + cos(raise) * hand.x - sin(raise) * hand.y;
        transformed.z = sin(raise) * hand.x + cos(raise) * hand.y;
        transformed.x *= 1.0 - arm * 0.5;
        ` : `
        float stride = (1.0 - smoothstep(0.45, 1.05, position.y)) * instanceMotion.y;
        transformed.z += gait * 0.18 * stride;
        transformed.y += abs(gait) * 0.08 * stride;
        transformed.y *= 1.0 - instanceMotion.w * 0.035;
        `}
      `);
    };
    material.onBeforeCompile = animate;
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); depth.onBeforeCompile = animate;
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh); fields.set(kind, { mesh, motion });
  }
  const gun = library.get('enemy-weapon');
  const guns = new T.InstancedMesh(gun.geometry, gun.material, capacity); guns.count = 0; guns.castShadow = true; guns.frustumCulled = false; scene.add(guns);
  const bars = new T.InstancedMesh(new T.PlaneGeometry(.85, .075), new T.MeshBasicMaterial({ color: 0xffa377, depthTest: false }), capacity);
  bars.count = 0; bars.frustumCulled = false; bars.renderOrder = 4; scene.add(bars);
  const warnings = new T.InstancedMesh(new T.RingGeometry(.85, 1, 40), new T.MeshBasicMaterial({ color: 0xff793f, transparent: true, opacity: .65, side: T.DoubleSide, depthWrite: false }), capacity);
  warnings.count = 0; warnings.frustumCulled = false; scene.add(warnings);
  const yAxis = new T.Vector3(0, 1, 0), orientation = new T.Quaternion();
  return {
    update(sim: Simulation, camera: T.Camera, elapsed = 0) {
      clock.value = sim.time;
      const counts = new Map<EnemyKind, number>(); let gunCount = 0, warningCount = 0, barCount = 0;
      for (const e of sim.enemies) {
        const field = fields.get(e.kind)!, index = counts.get(e.kind) ?? 0;
        if (index >= capacity) continue;
        counts.set(e.kind, index + 1);
        const angle = enemyFacing(e, sim.player);
        const bob = enemyBob(e, sim.time);
        dummy.position.set(e.x, bob, e.z); dummy.rotation.set(0, angle, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
        field.mesh.setMatrixAt(index, dummy.matrix);
        field.motion.setXYZW(index, e.id * 1.37, Number(!!e.moving), e.attackFlash ?? 0, (e.windup ?? 0) > 0 ? 1 : 0);
        if ((e.kind === 'shooter' || e.kind === 'runner') && gunCount < capacity) {
          orientation.setFromAxisAngle(yAxis, angle);
          dummy.position.copy(new T.Vector3(0, 1.12 + bob, .42).applyQuaternion(orientation)).add(new T.Vector3(e.x, 0, e.z));
          const size = modelData['enemy-weapon'].size;
          dummy.rotation.set(0, angle + (size[0] > size[2] ? Math.PI / 2 : 0), 0); dummy.scale.setScalar(.9); dummy.updateMatrix(); guns.setMatrixAt(gunCount++, dummy.matrix);
        }
        if (barCount < capacity) {
          dummy.position.set(e.x, modelData[enemySpecs[e.kind].asset].size[1] + .28, e.z);
          dummy.quaternion.copy(camera.quaternion); dummy.scale.set(Math.max(.01, e.hp / e.maxHp) * (e.kind === 'boss' ? 3 : 1), 1, 1); dummy.updateMatrix(); bars.setMatrixAt(barCount++, dummy.matrix);
        }
        if ((e.windup ?? 0) > 0 && e.aim && warningCount < capacity) {
          const radius = e.kind === 'boss' ? 3.6 : e.kind === 'pouncer' ? 1.1 : .65;
          dummy.position.set(e.aim.x, .045, e.aim.z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.setScalar(radius); dummy.updateMatrix(); warnings.setMatrixAt(warningCount++, dummy.matrix);
        }
      }
      for (const [kind, field] of fields) { field.mesh.count = counts.get(kind) ?? 0; field.mesh.instanceMatrix.needsUpdate = true; field.motion.needsUpdate = true; }
      guns.count = gunCount; bars.count = barCount; warnings.count = warningCount;
      for (const mesh of [guns, bars, warnings]) mesh.instanceMatrix.needsUpdate = true;
      deaths.update(sim, elapsed);
    },
    deathStats: deaths.stats,
  };
}
