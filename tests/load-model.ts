import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 保留实际网格、骨架与动画，仅去掉无需用于姿态检查的纹理请求。
export async function loadPoseModel(path: string) {
  const raw = readFileSync(new URL('../public/models/' + path, import.meta.url));
  const jsonLength = raw.readUInt32LE(12);
  const data = JSON.parse(raw.subarray(20, 20 + jsonLength).toString());
  delete data.images; delete data.textures; delete data.materials;
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const json = Buffer.from(JSON.stringify(data));
  const padded = Math.ceil(json.length / 4) * 4, binary = raw.subarray(20 + jsonLength);
  const buffer = Buffer.alloc(20 + padded + binary.length, 0x20);
  buffer.write('glTF', 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(padded, 12); buffer.writeUInt32LE(0x4e4f534a, 16); json.copy(buffer, 20); binary.copy(buffer, 20 + padded);
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
}
