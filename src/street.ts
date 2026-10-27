import * as T from 'three';
import { scenery, type Scenery } from './level';

// 所有高度只作浅表装饰，行走、弹道和模型碰撞仍以原有零高度地面为准。
export async function createStreet(renderer: T.WebGLRenderer) {
  const loader = new T.TextureLoader();
  const [asphalt, concrete] = await Promise.all([
    loader.loadAsync('/textures/street/asphalt-weathered-v1.png'),
    loader.loadAsync('/textures/street/sidewalk-concrete-v1.png'),
  ]);
  const group = new T.Group();group.name = '街道路面';
  let seed = 173;
  const random = () => { seed = seed * 16807 % 2147483647;return (seed - 1) / 2147483646; };
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const texture of [asphalt, concrete]) {
    texture.colorSpace = T.SRGBColorSpace;texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = anisotropy;
  }
  // 基础色与微凹凸分开指定色彩空间；微凹凸只是近似，不冒充扫描高度图。
  function surface(texture: T.Texture, size: number, color: string, bumpScale: number) {
    const bump = texture.clone();bump.colorSpace = T.NoColorSpace;bump.needsUpdate = true;
    const material = new T.MeshStandardMaterial({ map: texture, bumpMap: bump, bumpScale, color, roughness: .96 });
    material.userData.metersPerTile = size;return material;
  }
  const road = surface(asphalt, 4, '#c4c6c7', .018);
  const sidewalk = surface(concrete, 3.2, '#b7b7af', .012);
  const apron = surface(asphalt, 4, '#90938d', .012);
  const gutter = surface(concrete, 3.2, '#6c6b60', .008);
  function plane(width: number, depth: number, x: number, y: number, z: number, material: T.MeshStandardMaterial) {
    const geometry = new T.PlaneGeometry(width, depth);geometry.rotateX(-Math.PI / 2);
    const uv = geometry.getAttribute('uv'), tile = material.userData.metersPerTile as number;
    // 世界坐标纹理密度保持一致，缩放道路或缩放相机都不会拉伸颗粒。
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / tile + x / tile, uv.getY(i) * depth / tile - z / tile);
    const mesh = new T.Mesh(geometry, material);mesh.position.set(x, y, z);mesh.receiveShadow = true;group.add(mesh);return mesh;
  }
  plane(90, 90, 0, -.045, 0, apron);
  plane(16.3, 48, 0, -.018, 0, road);
  for (const side of [-1, 1]) {
    plane(.38, 48, side * 8.12, -.014, 0, gutter);
    plane(3.2, 48, side * 10.05, -.004, 0, sidewalk);
  }
  // 大尺度的积尘和轮迹打散四米贴图的重复感，不把阴影烘焙进基础色。
  road.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 streetPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nstreetPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 streetPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float broad = sin(streetPosition.x * .63 + sin(streetPosition.z * .39)) * sin(streetPosition.z * .71 + .8);
      float dust = smoothstep(6.9, 8.13, abs(streetPosition.x));
      float tracks = pow(.5 + .5 * cos((streetPosition.x - .95) * 3.14159265 / 1.85), 20.0);
      diffuseColor.rgb *= .96 + .09 * broad - .07 * tracks;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.24 + vec3(.014,.011,.006), dust * .6);
    `);
  };
  road.customProgramCacheKey = () => 'street-asphalt-v1';

  const dummy = new T.Object3D();
  function instances(geometry: T.BufferGeometry, material: T.Material, count: number) {
    const mesh = new T.InstancedMesh(geometry, material, count);mesh.receiveShadow = true;group.add(mesh);return mesh;
  }
  function put(mesh: T.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tint?: T.Color) {
    dummy.position.set(x, y, z);dummy.rotation.set(0, yaw, 0);dummy.scale.set(sx, sy, sz);dummy.updateMatrix();mesh.setMatrixAt(index, dummy.matrix);
    if (tint) mesh.setColorAt(index, tint);
  }
  const curb = instances(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ map: concrete, color: '#a19e91', roughness: .97 }), 80);
  let at = 0;
  for (const side of [-1, 1]) for (let z = -23.4; z < 24; z += 1.2) {
    const c = .82 + random() * .18;
    put(curb, at++, side * 8.32, .018, z, .25, .1, 1.18, 0, new T.Color(c, c * .985, c * .94));
  }
  curb.castShadow = true;

  // 小尺寸确定性遮罩仅控制油漆剥落和装饰边缘，不替代生成的路面图片。
  function mask(kind: 'paint' | 'patch' | 'soot') {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / (size - 1) * 2 - 1, v = y / (size - 1) * 2 - 1, n = random();let value: number;
      if (kind === 'paint') {
        const wear = Math.sin(x * .27 + Math.sin(y * .09) * 4) * Math.sin(y * .23 + x * .11);
        value = Math.abs(u) > .86 + n * .12 || wear > .53 || n < .09 ? 0 : .68 + n * .32;
      } else if (kind === 'patch') {
        const edge = Math.max(Math.abs(u), Math.abs(v)) + Math.sin(u * 18 + v * 12) * .045 + n * .05;
        value = 1 - T.MathUtils.smoothstep(edge, .74, .99);
      } else {
        const r = Math.hypot(u * (1 + .09 * Math.sin(v * 10)), v);
        value = Math.max(0, 1 - r) ** 1.8 * (.7 + n * .3);
      }
      const byte = Math.round(T.MathUtils.clamp(value, 0, 1) * 255), offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = byte;data[offset + 3] = 255;
    }
    const texture = new T.DataTexture(data, size, size);texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearMipmapLinearFilter;texture.generateMipmaps = true;texture.needsUpdate = true;return texture;
  }
  const flat = new T.PlaneGeometry(1, 1);flat.rotateX(-Math.PI / 2);
  const paint = instances(flat, new T.MeshStandardMaterial({ color: '#ffffff', alphaMap: mask('paint'), alphaTest: .35,
    transparent: true, opacity: .63, roughness: .98, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 128);
  at = 0;
  for (let z = -22.8; z < 24; z += 2.4) for (const x of [-7.65, -.13, .13, 7.65]) {
    const central = Math.abs(x) < 1, tint = new T.Color(central ? '#b9a46e' : '#bebcb0').multiplyScalar(.85 + random() * .15);
    put(paint, at++, x, -.010, z, central ? .105 : .12, 1, 2.38, 0, tint);
  }
  for (let z = -21; z < 24; z += 4) for (const x of [-3.8, 3.8]) put(paint, at++, x, -.010, z, .12, 1, 2.2, 0, new T.Color('#b8b6a9'));
  paint.count = at;

  const patchMaterial = new T.MeshStandardMaterial({ map: asphalt, alphaMap: mask('patch'), alphaTest: .35, color: '#b4b7b9',
    roughness: .94, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const patches = instances(flat, patchMaterial, 7);
  const repairs = [[-5.8,-16,1.6,2.8], [2.4,-7,1.1,2], [-2.2,1,1.8,2.6], [5.6,16,1.7,3.2], [-6,11,1.2,1.9], [2.5,20,2.2,1.4], [6,-20,1.4,1.8]];
  repairs.forEach(([x,z,w,d], i) => put(patches, i, x, -.013, z, w, 1, d, (random() - .5) * .24));
  const burning = scenery.filter(prop => prop.burning);
  const soot = instances(flat, new T.MeshStandardMaterial({ color: '#171615', alphaMap: mask('soot'), transparent: true, opacity: .85,
    roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 16);
  soot.count = burning.length;
  burning.forEach((prop, i) => put(soot, i, prop.x, -.009, prop.z, 5.5, 1, 4.3, prop.yaw));
  group.userData.setScenery = (props: readonly Scenery[]) => {
    const sources = props.filter(prop => prop.burning);
    soot.count = Math.min(sources.length, 16);
    sources.slice(0, 16).forEach((prop, i) => put(soot, i, prop.x, -.009, prop.z, 5.5, 1, 4.3, prop.yaw));
    soot.instanceMatrix.needsUpdate = true;
    soot.computeBoundingSphere();
  };

  const dark = new T.MeshStandardMaterial({ color: '#22282a', roughness: .96 });
  const iron = new T.MeshStandardMaterial({ color: '#55554c', metalness: .55, roughness: .83 });
  const drains = instances(new T.BoxGeometry(1, 1, 1), dark, 8), bars = instances(new T.BoxGeometry(1, 1, 1), iron, 96);
  at = 0;let bar = 0;
  for (const side of [-1, 1]) for (const z of [-18, -4, 10, 21]) {
    const x = side * 8.04;put(drains, at++, x, -.001, z, .29, .014, .75);
    for (let i = 0; i < 10; i++) put(bars, bar++, x, .009, z - .33 + i * .073, .28, .012, .022);
    for (const dx of [-.15, .15]) put(bars, bar++, x + dx, .009, z, .027, .012, .8);
  }
  // 碎屑集中在道路边缘；实例化让增加细节不再增加上百次独立绘制。
  const rubble = instances(new T.DodecahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: '#99958a', roughness: 1, flatShading: true }), 210);
  for (let i = 0; i < 210; i++) {
    const side = random() > .5 ? 1 : -1;
    const x = i < 160 ? side * (7.7 + random() * 3.7) : (random() - .5) * 40;
    const z = (random() - .5) * 46, size = .025 + random() ** 2 * .14;
    const tint = .6 + random() * .4;
    put(rubble, i, x, .008, z, size, size * .32, size * (.7 + random()), random() * Math.PI, new T.Color(tint, tint * .97, tint * .91));
  }
  // 使用粉笔般的窄线保留既有关卡边界提示。
  const boundary = new T.MeshStandardMaterial({ color: '#858b72', roughness: 1, transparent: true, opacity: .45 });
  for (const x of [-21.5, 21.5]) {
    const mesh = new T.Mesh(new T.BoxGeometry(.055, .006, 46), boundary);mesh.position.set(x, .014, 0);group.add(mesh);
  }
  for (const z of [-22.5, 22.5]) {
    const mesh = new T.Mesh(new T.BoxGeometry(43, .006, .055), boundary);mesh.position.set(0, .014, z);group.add(mesh);
  }
  return group;
}
