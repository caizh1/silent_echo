import type { Vec } from './simulation';
import { weaponSpecs, type WeaponId } from './weapons';

// 坐标与实际步枪挂点共用；弹速采用适合俯视战场的压缩尺度。
export const RIFLE_SPEED = 240;
export const RIFLE_RANGE = 19;
export const RIFLE_MUZZLE = { x: 0, y: weaponSpecs.rifle.muzzleHeight, z: weaponSpecs.rifle.muzzle };
export const RIFLE_CENTER = { y: 1.28, z: .33 };
export const ENEMY_MUZZLE = { y: 1.305, z: .83 };

export function muzzlePosition(position: Vec, angle: number, hostile = false, weapon: WeaponId = 'rifle') {
  const forward = hostile ? ENEMY_MUZZLE.z : weaponSpecs[weapon].muzzle;
  return { x: position.x + Math.sin(angle) * forward, y: hostile ? ENEMY_MUZZLE.y : weaponSpecs[weapon].muzzleHeight, z: position.z + Math.cos(angle) * forward };
}

export function rifleRecoil(age: number) {
  const kick = age >= 0 && age < .3 ? (1 - Math.exp(-age * 150)) * Math.exp(-age * 30) : 0;
  return { backward: kick * .065, pitch: -kick * .065 };
}
