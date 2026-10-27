export const weaponIds = ['pistol', 'smg', 'rifle'] as const;
export type WeaponId = typeof weaponIds[number];
export const attachmentSlots = ['optic', 'magazine', 'stock', 'grip'] as const;
export type AttachmentSlot = typeof attachmentSlots[number];
export type Loadout = { weapon: WeaponId; attachments: AttachmentSlot[] };

// 仅为游戏数值与游戏挂点，不表达现实武器参数。
export const weaponSpecs = {
  // 强化后的低阶武器仍慢于下一档标准武器，避免射速成长抹平装备差异。
  pistol: { name: '手枪', damage: 29, interval: .6, minInterval: .4, magazine: 12, spread: .085, range: 14, length: .38, holdOffset: 0, muzzle: .56, muzzleHeight: 1.331, model: 'pistol-v1.glb', description: '起步装备 · 慢速单发', slots: ['optic', 'magazine', 'stock'] },
  smg: { name: '冲锋枪', damage: 14, interval: .2, minInterval: .15, magazine: 24, spread: .11, range: 16, length: .68, holdOffset: -.1, muzzle: .62, muzzleHeight: 1.332589, model: 'smg-v1.glb', description: '进阶火力 · 中速连射', slots: ['optic', 'magazine', 'stock', 'grip'] },
  rifle: { name: '突击步枪', damage: 22, interval: .12, minInterval: .08, magazine: 24, spread: .065, range: 19, length: .95, holdOffset: 0, muzzle: .83, muzzleHeight: 1.336, model: 'rifle-v1.glb', description: '高阶火力 · 高速连射', slots: ['optic', 'magazine', 'stock', 'grip'] },
} as const;
export const attachmentSpecs: Record<AttachmentSlot, { name: string; effect: string }> = {
  optic: { name: '瞄准镜', effect: '散布 −45% · 提高命中率' },
  magazine: { name: '扩容弹匣', effect: '单次装填量 +50%' },
  stock: { name: '加固枪托', effect: '射速 +15%' },
  grip: { name: '前握把', effect: '散布 −20% · 射速 +8%' },
};
export function defaultLoadout(weapon: WeaponId = 'pistol'): Loadout { return { weapon, attachments: [] }; }
export function normalizeLoadout(input: Loadout): Loadout {
  const weapon = weaponIds.includes(input.weapon) ? input.weapon : 'pistol';
  const supported: readonly string[] = weaponSpecs[weapon].slots;
  return { weapon, attachments: attachmentSlots.filter(slot => input.attachments.includes(slot) && supported.includes(slot)) };
}
export function loadoutStats(input: Loadout) {
  const value = normalizeLoadout(input), spec = weaponSpecs[value.weapon], has = (slot: AttachmentSlot) => value.attachments.includes(slot);
  return {
    damage: spec.damage,
    magazine: Math.round(spec.magazine * (has('magazine') ? 1.5 : 1)),
    interval: spec.interval / ((has('stock') ? 1.15 : 1) * (has('grip') ? 1.08 : 1)),
    spread: spec.spread * (has('optic') ? .55 : 1) * (has('grip') ? .8 : 1),
    range: spec.range,
  };
}
export const GRENADE = { initial: 3, maximum: 3, cooldown: .65, fuse: 1.25, speed: 8, radius: 3.6, damage: 145, gravity: 12 } as const;
