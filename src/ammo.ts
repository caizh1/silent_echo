// 弹药、补给与换弹共用配置；动画、声音和模拟读取同一条时间轴。
export const AMMO = {
  magazine: 24,
  initialReserve: 120,
  maxReserve: 240,
  reloadSeconds: 1.7,
  dropChance: .4,
  dropRounds: 12,
  bossRounds: 48,
  crateRounds: 72,
  initialCrates: 3,
  maxCrates: 3,
  resupplySeconds: 45,
  pickupRadius: 1.35,
} as const;

export const RELOAD_CUES = [
  { at: .18, sound: 'magazine-out', label: '取出弹匣' },
  { at: .92, sound: 'magazine-in', label: '插入弹匣' },
  { at: 1.4, sound: 'bolt', label: '拉动枪机' },
] as const;
export type AmmoSound = typeof RELOAD_CUES[number]['sound'] | 'ammo-pickup' | 'crate-open' | 'empty';

export function reloadLabel(remaining: number) {
  const elapsed = AMMO.reloadSeconds - remaining;
  return elapsed < .65 ? '取出弹匣' : elapsed < 1.22 ? '插入弹匣' : '上膛';
}

const smooth = (start: number, end: number, time: number) => {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
};
export function reloadPose(remaining: number) {
  if (remaining <= 0) return { lower: 0, tilt: 0, cant: 0, magazine: 0, hand: 0, bolt: 0 };
  const t = AMMO.reloadSeconds - remaining;
  const hold = smooth(0, .18, t) * (1 - smooth(1.48, AMMO.reloadSeconds, t));
  return {
    lower: -.07 * hold, tilt: -.16 * hold, cant: .28 * hold,
    magazine: smooth(.18, .48, t) * (1 - smooth(.65, .92, t)),
    hand: smooth(0, .18, t) * (1 - smooth(1, 1.24, t)),
    bolt: smooth(1.24, 1.4, t) * (1 - smooth(1.4, 1.55, t)),
  };
}
