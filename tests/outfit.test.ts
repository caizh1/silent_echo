import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { normalizeOutfit, presetOutfit, applyOutfit, outfitPresets } from '../src/outfit.ts';

test('损坏的穿戴记录回退到有效配置，不允许无效护甲档位',()=>{
  for(const value of [null,[],undefined,'错误记录'])assert.deepEqual(normalizeOutfit(value),presetOutfit());
  const value=normalizeOutfit({armor:99,helmet:false,goggles:'错误值',legacy:true});
  assert.equal(value.armor,0);assert.equal(value.helmet,false);assert.equal(value.goggles,false);assert.equal(value.legacy,true);
});

test('三档护甲互斥，穿戴覆盖区域随装备开关恢复',()=>{
  const model=new Group(),armors=[1,2,3].map(tier=>{const object=new Group();object.userData={outfitSlot:'armor',armorTier:tier};model.add(object);return object;});
  const hand=new Group(),glove=new Group(),shirt=new Group();
  hand.userData.coveredBy='gloves';glove.userData.outfitSlot='gloves';shirt.userData.coveredBy='armor';model.add(hand,glove,shirt);
  for(const preset of outfitPresets){const value=presetOutfit(preset);applyOutfit(model,value);
    assert.equal(armors.filter(a=>a.visible).length,value.armor?1:0);
    assert.equal(hand.visible,!value.gloves);assert.equal(glove.visible,value.gloves);assert.equal(shirt.visible,value.armor===0);
  }
  applyOutfit(model,presetOutfit('bare'));assert.ok(hand.visible&&shirt.visible);assert.equal(glove.visible,false);
});
