import type { Object3D } from 'three';

export const outfitSlots = ['helmet','goggles','headset','neckguard','shoulders','backpack','belt','thighpouches','elbows','forearms','gloves','kneepads','shinguards','boots'] as const;
export type OutfitSlot = typeof outfitSlots[number];
export type Outfit = { legacy: boolean; armor: 0|1|2|3 } & Record<OutfitSlot, boolean>;
export const outfitLabels: Record<OutfitSlot,string> = {helmet:'战术头盔',goggles:'战术目镜',headset:'通信耳机',neckguard:'战术护领',shoulders:'肩甲与臂带',backpack:'战术背包',belt:'腰带与腰侧包',thighpouches:'双侧大腿挂包',elbows:'战术护肘',forearms:'前臂护具',gloves:'战术手套',kneepads:'战术护膝',shinguards:'小腿护甲',boots:'战术靴'};
export const outfitGroups:{label:string;slots:readonly OutfitSlot[]}[]=[
  {label:'头部与颈部',slots:['helmet','goggles','headset','neckguard']},
  {label:'躯干与携行',slots:['shoulders','backpack','belt','thighpouches']},
  {label:'四肢防护',slots:['elbows','forearms','gloves','kneepads','shinguards','boots']},
];
export const outfitPresets = ['bare','light','standard','heavy','legacy'] as const;
export type OutfitPreset = typeof outfitPresets[number];
export const outfitPresetLabels: Record<OutfitPreset,string> = {bare:'素装',light:'轻装',standard:'中装',heavy:'全副武装',legacy:'原主角'};
export function presetOutfit(preset: OutfitPreset = 'bare'): Outfit {
  const complete=preset==='heavy',full=preset==='standard'||complete;
  return {legacy:preset==='legacy',armor:preset==='light'?1:preset==='standard'?2:preset==='heavy'?3:0,
    helmet:full,goggles:preset==='light'||full,headset:full,backpack:full,
    gloves:preset==='light'||full,boots:preset==='light'||full,kneepads:full,
    neckguard:complete,shoulders:complete,belt:complete,thighpouches:complete,elbows:complete,forearms:complete,shinguards:complete};
}
export function normalizeOutfit(value: unknown): Outfit {
  if (!value || typeof value!=='object' || Array.isArray(value)) return presetOutfit();
  const input=value as Record<string,unknown>, fallback=presetOutfit();
  const result:Outfit={...fallback,legacy:input.legacy===true,armor:[0,1,2,3].includes(input.armor as number)?input.armor as Outfit['armor']:fallback.armor};
  for(const slot of outfitSlots)result[slot]=typeof input[slot]==='boolean'?input[slot] as boolean:fallback[slot];
  return result;
}
const storageKey='broken-frontier-outfit-v2';
export function readOutfit():Outfit {
  try {const text=localStorage.getItem(storageKey);return text?normalizeOutfit(JSON.parse(text)):presetOutfit();} catch {return presetOutfit();}
}
export function saveOutfit(outfit:Outfit) { try {localStorage.setItem(storageKey,JSON.stringify(normalizeOutfit(outfit)));return true;} catch{return false;} }
export function applyOutfit(model:Object3D,outfit:Outfit) {
  const value=normalizeOutfit(outfit);
  model.traverse(object=>{
    const slot=object.userData.outfitSlot as OutfitSlot|'armor'|undefined;
    if(slot) object.visible=slot==='armor'?Number(object.userData.armorTier)===value.armor:value[slot];
    const covered=object.userData.coveredBy as OutfitSlot|'armor'|undefined;
    if(covered) object.visible=covered==='armor'?value.armor===0:!value[covered];
  });
  return value;
}
export function outfitSummary(value:Outfit) {
  if(value.legacy)return '原主角对照';
  const count=outfitSlots.filter(slot=>value[slot]).length+(value.armor?1:0);
  return count===0?'素装基础士兵':`防弹衣 ${['无','I','II','III'][value.armor]} · ${count} 类装备`;
}

