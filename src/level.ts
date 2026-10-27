import { modelData } from './model-data';

export type SceneryAsset = 'ruined-storefront' | 'road-barricade' | 'burned-sedan' | 'burned-armored-van' | 'burned-police-car';
export type Scenery = { asset: SceneryAsset; x: number; z: number; yaw: number; burning?: boolean };
// 场景和模拟共用同一份摆放与尺寸，避免视觉模型和碰撞体各自维护。
export const scenery: Scenery[] = [
  { asset: 'ruined-storefront', x: -13, z: -16, yaw: 0 },
  { asset: 'ruined-storefront', x: 13, z: -17, yaw: Math.PI },
  { asset: 'ruined-storefront', x: -14, z: 12, yaw: Math.PI / 2 },
  { asset: 'ruined-storefront', x: 14, z: 12, yaw: -Math.PI / 2 },
  { asset: 'road-barricade', x: -4, z: -6, yaw: 0 },
  { asset: 'road-barricade', x: 6, z: 3, yaw: Math.PI / 2 },
  { asset: 'road-barricade', x: -3, z: 13, yaw: 0 },
  { asset: 'road-barricade', x: 7, z: -13, yaw: 0 },
  { asset: 'burned-police-car', x: -3, z: -11, yaw: Math.PI / 2, burning: true },
  { asset: 'burned-sedan', x: 5, z: 9, yaw: 0, burning: true },
  { asset: 'burned-armored-van', x: -5, z: 0, yaw: 0, burning: true },
];
export const wallsFor = (props: readonly Scenery[]) => props.map(prop => {
  const [width, height, depth] = modelData[prop.asset].size;
  const quarterTurn = Math.abs(Math.sin(prop.yaw)) > .5;
  return { x: prop.x, z: prop.z, w: quarterTurn ? depth : width, d: quarterTurn ? width : depth, h: height };
});
export const walls = wallsFor(scenery);
