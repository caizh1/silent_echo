import * as T from 'three';
import type { EnemyKind } from './enemies';
import { CORPSE_FADE, CORPSE_LIFETIME, collapseSeconds, enemyBob, type FallenEnemy } from './enemy-motion';
import type { ModelLibrary } from './models';
import { enemySpecs } from './enemies';
import type { Simulation } from './simulation';

const smooth = (a: number, b: number, value: number) => T.MathUtils.smoothstep(value, a, b);
const human = (kind: EnemyKind) => kind === 'runner' || kind === 'shooter';
const point = new T.Vector3(), axis = new T.Vector3(), rotation = new T.Quaternion();

// 与存活实例的顶点着色器一致，切换为独立骨架时保留最后一帧的步态与持枪姿态。
export function livingEnemyVertex(vertex: T.Vector3, enemy: FallenEnemy) {
  const { x, y, z } = vertex, time = enemy.fallenAt;
  const gait = Math.sin(time * (human(enemy.kind) ? 8.5 : 6) + enemy.id * 1.37 + (x < 0 ? Math.PI : 0));
  if (human(enemy.kind)) {
    const pitch = gait * .38 * Number(!!enemy.moving) * (1 - smooth(.72, .94, y));
    vertex.y = .9 + Math.cos(pitch) * (y - .9) - Math.sin(pitch) * z;
    vertex.z = Math.sin(pitch) * (y - .9) + Math.cos(pitch) * z;
    const arm = smooth(.23, .38, Math.abs(x)) * smooth(.83, .98, y) * (1 - smooth(1.38, 1.52, y)), raise = -1.08 * arm;
    const handY = vertex.y - 1.4, handZ = vertex.z;
    vertex.y = 1.4 + Math.cos(raise) * handY - Math.sin(raise) * handZ;
    vertex.z = Math.sin(raise) * handY + Math.cos(raise) * handZ;
    vertex.x *= 1 - arm * .5;
  } else {
    const stride = (1 - smooth(.45, 1.05, y)) * Number(!!enemy.moving);
    vertex.z += gait * .18 * stride;
    vertex.y += Math.abs(gait) * .08 * stride;
    vertex.y *= 1 - Number((enemy.windup ?? 0) > 0) * .035;
  }
  return vertex;
}

type JointName = 'pelvis' | 'spine' | 'head' | 'leftArm' | 'leftElbow' | 'rightArm' | 'rightElbow' | 'leftHip' | 'leftKnee' | 'rightHip' | 'rightKnee';
type Joint = { bone: T.Bone; position: T.Vector3 };
type DeathRig = ReturnType<typeof createDeathRig>;

// 给原静态网格建立轻量骨架，膝、髋、脊柱、肩、肘、颈各自变形，避免整块模型翻转。
export function createDeathRig(prototype: T.Mesh, enemy: FallenEnemy, weaponPrototype?: T.Mesh) {
  const geometry = prototype.geometry.clone(), source = prototype.geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new T.Vector3()), height = size.y, width = size.x;
  const joints = {} as Record<JointName, Joint>, bones: T.Bone[] = [];
  function joint(name: JointName, parent: JointName | undefined, x: number, y: number, z = 0) {
    const absolute = livingEnemyVertex(new T.Vector3(x, y * height, z), enemy);
    const bone = new T.Bone(); bone.name = `death-${name}`; bone.position.copy(absolute);
    if (parent) { bone.position.sub(joints[parent].position); joints[parent].bone.add(bone); }
    joints[name] = { bone, position: absolute }; bones.push(bone);
  }
  joint('pelvis', undefined, 0, .5);
  joint('spine', 'pelvis', 0, .63);
  joint('head', 'spine', 0, .84);
  for (const [side, sign] of [['left', 1], ['right', -1]] as const) {
    joint(`${side}Arm`, 'spine', sign * width * .25, .77);
    joint(`${side}Elbow`, `${side}Arm`, sign * width * .4, .61);
    joint(`${side}Hip`, 'pelvis', sign * width * .17, .5);
    joint(`${side}Knee`, `${side}Hip`, sign * width * .17, .26);
  }
  const indices = new Uint16Array(source.count * 4), weights = new Float32Array(source.count * 4);
  const boneIndex = (name: JointName) => bones.indexOf(joints[name].bone);
  const position = geometry.getAttribute('position');
  const contact = new Set<number>(), cells = new Map<string, number[]>();
  for (let index = 0; index < source.count; index++) {
    point.fromBufferAttribute(source, index);
    const normalizedY = point.y / height, side = point.x >= 0 ? 'left' : 'right';
    // 扑击兽的腹甲低垂到膝部高度，中央躯干不能误分配给左右小腿。
    const leg = (1 - smooth(.43, .55, normalizedY)) * (human(enemy.kind) ? 1 : smooth(width * .1, width * .2, Math.abs(point.x)));
    const arm = smooth(width * .2, width * .34, Math.abs(point.x)) * smooth(.43, .57, normalizedY) * (1 - smooth(.77, .86, normalizedY));
    const head = smooth(.79, .87, normalizedY), spine = smooth(.51, .66, normalizedY);
    const knee = 1 - smooth(.22, .32, normalizedY), elbow = 1 - smooth(.58, .68, normalizedY);
    const torso = (1 - leg) * (1 - arm);
    const candidates: [JointName, number][] = [
      [`${side}Knee`, leg * knee], [`${side}Hip`, leg * (1 - knee)],
      [`${side}Elbow`, (1 - leg) * arm * elbow], [`${side}Arm`, (1 - leg) * arm * (1 - elbow)],
      ['head', torso * head], ['spine', torso * (1 - head) * spine], ['pelvis', torso * (1 - head) * (1 - spine)],
    ];
    candidates.sort((a, b) => b[1] - a[1]);
    const total = candidates.slice(0, 4).reduce((sum, entry) => sum + entry[1], 0);
    for (let slot = 0; slot < 4; slot++) { indices[index * 4 + slot] = boneIndex(candidates[slot][0]); weights[index * 4 + slot] = candidates[slot][1] / total; }
    // 每个空间小格保留六向表面极值，侧倒时手掌、护甲边缘也能承接地面。
    const key = `${Math.floor(point.x / width * 8)},${Math.floor(normalizedY * 12)},${Math.floor(point.z / Math.max(size.z, .1) * 8)}`;
    const cell = cells.get(key);
    if (!cell) cells.set(key, Array(6).fill(index));
    else for (let dimension = 0; dimension < 3; dimension++) {
      if (point.getComponent(dimension) < source.getComponent(cell[dimension * 2], dimension)) cell[dimension * 2] = index;
      if (point.getComponent(dimension) > source.getComponent(cell[dimension * 2 + 1], dimension)) cell[dimension * 2 + 1] = index;
    }
    livingEnemyVertex(point, enemy); position.setXYZ(index, point.x, point.y, point.z);
  }
  for (const cell of cells.values()) for (const index of cell) contact.add(index);
  position.needsUpdate = true;
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  geometry.computeVertexNormals();
  const material = (prototype.material as T.MeshStandardMaterial).clone(), opacity = { value: 1 };
  // 屏幕空间抖动淡出保留不透明深度与阴影，不出现透明排序和突然缩小。
  const fade = (shader: T.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.corpseOpacity = opacity;
    shader.fragmentShader = `uniform float corpseOpacity;\n${shader.fragmentShader}`.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) >= corpseOpacity) discard;');
  };
  material.onBeforeCompile = fade;
  const mesh = new T.SkinnedMesh(geometry, material), skeleton = new T.Skeleton(bones);
  mesh.name = `fallen-enemy-${enemy.id}`; mesh.add(joints.pelvis.bone); mesh.bind(skeleton);
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); depth.onBeforeCompile = fade; mesh.customDepthMaterial = depth;
  mesh.position.set(enemy.x, enemyBob(enemy, enemy.fallenAt), enemy.z); mesh.rotation.y = enemy.angle;
  const weaponMaterial = weaponPrototype && (weaponPrototype.material as T.MeshStandardMaterial).clone();
  if (weaponMaterial) weaponMaterial.onBeforeCompile = fade;
  const weapon = weaponPrototype && new T.Mesh(weaponPrototype.geometry, weaponMaterial);
  if (weapon) { weapon.name = `fallen-weapon-${enemy.id}`; weapon.castShadow = weapon.receiveShadow = true; weapon.customDepthMaterial = depth; weapon.scale.setScalar(.9); }
  return { mesh, weapon, joints, height, width, contact: [...contact], opacity, enemy, lastAge: -1,
    dispose() { mesh.removeFromParent(); weapon?.removeFromParent(); weaponMaterial?.dispose(); geometry.dispose(); material.dispose(); depth.dispose(); skeleton.dispose(); } };
}

export function poseDeathRig(rig: DeathRig, age: number) {
  const { enemy, joints, height, mesh } = rig, duration = collapseSeconds(enemy.kind), time = Math.max(0, age) / duration;
  rig.opacity.value = 1 - smooth(CORPSE_LIFETIME - CORPSE_FADE, CORPSE_LIFETIME, age);
  if (age === rig.lastAge || (rig.lastAge >= duration && age >= duration)) return;
  rig.lastAge = age;
  const stagger = smooth(0, .15, time), buckle = smooth(.07, .43, time), fall = smooth(.22, .72, time), settle = smooth(.7, 1, time);
  const variation = Math.sin(enemy.id * 2.399), sign = variation >= 0 ? 1 : -1;
  const cos = Math.cos(enemy.angle), sin = Math.sin(enemy.angle);
  // 世界受击方向转回角色坐标，轻微左右偏转使肩部先落地。
  const dx = cos * enemy.impact.x - sin * enemy.impact.z, dz = sin * enemy.impact.x + cos * enemy.impact.z;
  const twist = variation * .23, localX = dx * Math.cos(twist) - dz * Math.sin(twist), localZ = dx * Math.sin(twist) + dz * Math.cos(twist);
  axis.set(localZ, 0, -localX).normalize();
  const tilt = .1 * stagger + 1.23 * fall + .08 * settle;
  joints.pelvis.bone.quaternion.setFromAxisAngle(axis, tilt);
  rotation.setFromEuler(new T.Euler(.06 * buckle, variation * .16 * fall, sign * .12 * fall)); joints.pelvis.bone.quaternion.multiply(rotation);
  // 屈膝先于躯干倒地；双腿不同时锁死，落地后也保留松弛弯曲。
  joints.leftHip.bone.rotation.set(-.6 * buckle + .38 * fall, -.12 * fall, .13 * buckle);
  joints.rightHip.bone.rotation.set(-.42 * buckle + .16 * fall, .16 * fall, -.18 * buckle);
  joints.leftKnee.bone.rotation.set(1.05 * buckle - .57 * settle, 0, .07 * fall);
  joints.rightKnee.bone.rotation.set(.77 * buckle - .2 * settle, 0, -.06 * fall);
  joints.spine.bone.rotation.set(.24 * stagger - .18 * settle, variation * .16 * fall, sign * .14 * buckle);
  // 手臂从持枪姿态松开，左右延迟不同；颈部落后于躯干并在接触后停稳。
  const leftLoose = smooth(.08, .73, time), rightLoose = smooth(.14, .81, time);
  const rebound = time > .7 ? Math.sin((time - .7) * 24) * Math.exp(-(time - .7) * 12) * (1 - settle) : 0;
  // 人类要先松开抬起的持枪手臂；外星人的前肢原本下垂，只向两侧松散展开。
  const armRelease = human(enemy.kind) ? 1 : .12, elbowRelease = human(enemy.kind) ? 1 : .35, spread = human(enemy.kind) ? 1 : 2;
  joints.leftArm.bone.rotation.set(.95 * leftLoose * armRelease, -.18 * fall, .18 * leftLoose * spread + .08 * rebound);
  joints.rightArm.bone.rotation.set(1.05 * rightLoose * armRelease, .12 * fall, -.27 * rightLoose * spread - .1 * rebound);
  joints.leftElbow.bone.rotation.set(-.55 * leftLoose * elbowRelease + .12 * rebound, -.1 * fall, .12 * fall);
  joints.rightElbow.bone.rotation.set(-.72 * rightLoose * elbowRelease - .16 * rebound, .18 * fall, -.08 * fall);
  joints.head.bone.rotation.set(-.2 * smooth(.3, .9, time) + .08 * rebound, variation * .2 * fall, sign * .18 * settle);
  const pelvis = joints.pelvis;
  // 保留骨架局部原点，重心沿来弹方向短距离滑移。
  const travel = height * .24 * fall;
  pelvis.bone.position.copy(pelvis.position).add(new T.Vector3(localX * travel, -height * .19 * buckle, localZ * travel));
  mesh.updateMatrixWorld(true); mesh.skeleton.update();
  let floor = Infinity;
  const positions = mesh.geometry.getAttribute('position');
  for (const index of rig.contact) { mesh.applyBoneTransform(index, point.fromBufferAttribute(positions, index)); floor = Math.min(floor, point.y); }
  const contact = smooth(0, .1, time), bob = enemyBob(enemy, enemy.fallenAt);
  mesh.position.y = T.MathUtils.lerp(bob, .018 - floor, contact) + Math.max(0, rebound) * height * .014;
  mesh.updateMatrixWorld(true); mesh.skeleton.update();
  if (rig.weapon) {
    const gun = rig.weapon, released = Math.max(0, age - .1), spin = smooth(0, .55, released);
    const slide = 1 - Math.exp(-released * 4), offset = new T.Vector3(sign * .2 * slide, 0, .42).applyAxisAngle(new T.Vector3(0, 1, 0), enemy.angle);
    gun.position.set(enemy.x + offset.x + enemy.impact.x * .4 * slide, 1.12 + bob - .5 * released - 4.9 * released * released, enemy.z + offset.z + enemy.impact.z * .4 * slide);
    gun.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), enemy.angle).multiply(rotation.setFromEuler(new T.Euler(.12 * spin, sign * .45 * spin, sign * Math.PI / 2 * spin)));
    gun.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(gun);
    if (bounds.min.y < .02) gun.position.y += .02 - bounds.min.y;
    gun.updateMatrixWorld(true);
  }
}

export function createEnemyDeathField(scene: T.Scene, library: ModelLibrary) {
  const corpses = new Map<number, DeathRig>(); let current: Simulation | undefined, terminalElapsed = 0;
  const clear = () => { for (const corpse of corpses.values()) corpse.dispose(); corpses.clear(); };
  return {
    update(sim: Simulation, elapsed = 0) {
      if (current !== sim) { clear(); current = sim; terminalElapsed = 0; }
      // 最后一击触发结算后仍完成倒地；暂停和强化界面保持冻结。
      if (sim.state === 'won' || sim.state === 'lost') terminalElapsed += Math.max(0, elapsed);
      const time = sim.time + terminalElapsed;
      const active = sim.fallenEnemies.filter(enemy => time - enemy.fallenAt < CORPSE_LIFETIME);
      const ids = new Set(active.map(enemy => enemy.id));
      for (const [id, corpse] of corpses) if (!ids.has(id)) { corpse.dispose(); corpses.delete(id); }
      for (const enemy of active) {
        let corpse = corpses.get(enemy.id);
        if (!corpse) {
          corpse = createDeathRig(library.get(enemySpecs[enemy.kind].asset), enemy, human(enemy.kind) ? library.get('enemy-weapon') : undefined);
          corpses.set(enemy.id, corpse); scene.add(corpse.mesh); if (corpse.weapon) scene.add(corpse.weapon);
        }
        poseDeathRig(corpse, time - enemy.fallenAt);
      }
    },
    stats: () => ({ count: corpses.size, falling: [...corpses.values()].filter(corpse => corpse.lastAge < collapseSeconds(corpse.enemy.kind)).length }),
    dispose: clear,
  };
}
