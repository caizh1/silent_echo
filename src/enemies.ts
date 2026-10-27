export type EnemyKind = 'runner' | 'shooter' | 'pouncer' | 'spitter' | 'boss';
export const enemySpecs = {
  runner: { name: '人类突击兵', asset: 'enemy-flanker', hp: 44, speed: 2.7, radius: .38, hitRadius: .42, range: 1.1, damage: 10, cooldown: 1.1, windup: .4, xp: 2 },
  shooter: { name: '人类步枪兵', asset: 'enemy-rifleman', hp: 64, speed: 1.5, radius: .38, hitRadius: .42, range: 13, damage: 9, cooldown: 2.4, windup: .55, xp: 3 },
  pouncer: { name: '外星扑击兽', asset: 'alien-pouncer', hp: 100, speed: 2.1, radius: .75, hitRadius: .8, range: 7, damage: 17, cooldown: 3.2, windup: .8, xp: 5 },
  spitter: { name: '外星喷射者', asset: 'alien-spitter', hp: 125, speed: 1.15, radius: .68, hitRadius: .75, range: 12, damage: 10, cooldown: 3.6, windup: 1, xp: 6 },
  boss: { name: '裂城巨兽', asset: 'alien-boss', hp: 1650, speed: 1.15, radius: 1.25, hitRadius: 1.55, range: 4.2, damage: 30, cooldown: 3.4, windup: 1.2, xp: 30 },
} as const;
