import type { EnemyKind } from './enemies';
import type { Enemy, Vec } from './simulation';

// 尸体只保存表现所需快照，不再参与寻敌、攻击、碰撞和奖励结算。
export type FallenEnemy = Enemy & { fallenAt: number; angle: number; impact: Vec };
export const CORPSE_LIMIT = 64;
export const CORPSE_LIFETIME = 9;
export const CORPSE_FADE = 1.5;
export const collapseSeconds = (kind: EnemyKind) => kind === 'boss' ? 1.7 : kind === 'runner' || kind === 'shooter' ? 1.25 : 1.45;

export function enemyFacing(enemy: Enemy, player: Vec) {
  const aiming = (enemy.kind === 'shooter' || enemy.kind === 'spitter') && enemy.aim && ((enemy.windup ?? 0) > 0 || (enemy.attackFlash ?? 0) > 0);
  return (enemy.charge ?? 0) > 0 && enemy.aim ? Math.atan2(enemy.aim.x, enemy.aim.z) : aiming ? Math.atan2(enemy.aim!.x - enemy.x, enemy.aim!.z - enemy.z) : Math.atan2(player.x - enemy.x, player.z - enemy.z);
}
export function enemyBob(enemy: Enemy, time: number) {
  return enemy.moving ? Math.sin(time * 8 + enemy.id) * .025 : Math.sin(time * 2 + enemy.id) * .008;
}
export function snapshotDeath(enemy: Enemy, player: Vec, time: number): FallenEnemy {
  const hit = enemy.hitDirection ?? { x: enemy.x - player.x, z: enemy.z - player.z };
  const length = Math.hypot(hit.x, hit.z);
  return { ...enemy, aim: enemy.aim && { ...enemy.aim }, fallenAt: time, angle: enemyFacing(enemy, player), impact: length > .0001 ? { x: hit.x / length, z: hit.z / length } : { x: 0, z: 1 } };
}
