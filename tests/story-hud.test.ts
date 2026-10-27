import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StorySession} from '../src/story.ts';
import {getHudInteraction} from '../src/story-hud.ts';
import {defaultLoadout} from '../src/weapons.ts';
import {sectors, type TaskKind} from '../src/story-data.ts';

function taskSession(kind:TaskKind){const sector=sectors.find(s=>s.tasks.some(t=>t.kind===kind))!;const s=new StorySession();s.startChapter(sector.chapter,defaultLoadout());while(s.sectorIndex<sector.index){s.taskIndex=s.sector.tasks.length;s.nextSector();}s.taskIndex=s.sector.tasks.findIndex(t=>t.kind===kind);s.sim.walls.splice(0);return s;}
test('远处不显示重复交互说明，实际操作范围内显示按键与进度',()=>{
 const s=taskSession('repair'),t=s.task!;Object.assign(s.sim.player,{x:t.position.x+8,z:t.position.z});assert.equal(getHudInteraction(s),undefined);
 Object.assign(s.sim.player,t.position);s.holdTime=t.seconds/2;const prompt=getHudInteraction(s);assert.equal(prompt?.key,'F');assert.equal(prompt?.progress,.5);
});
test('隔墙设备不能给出可操作提示',()=>{
 const s=taskSession('repair'),t=s.task!;Object.assign(s.sim.player,{x:t.position.x+2,z:t.position.z});s.sim.walls.push({x:t.position.x+1,z:t.position.z,w:.2,d:4,h:4});
 assert.equal(getHudInteraction(s)?.text,'绕到设备正面');assert.equal(getHudInteraction(s)?.key,'');
});
test('记录与救援按实际优先级显示，倒地不会继续提示操作设备',()=>{
 const s=new StorySession();s.startChapter(11,defaultLoadout());s.sim.walls.splice(0);Object.assign(s.sim.player,s.recordPosition);Object.assign(s.companions[0],{...s.sim.player,hp:0,revive:2});
 assert.equal(getHudInteraction(s)?.text,'收集现场记录');s.flags.add(`record:${s.sector.id}`);assert.match(getHudInteraction(s)?.text??'',/救援/);assert.equal(getHudInteraction(s)?.progress,.5);
 s.sim.player.hp=0;assert.equal(getHudInteraction(s)?.text,'等待队友救援');
});
test('防守显示剩余时间，预留任务空袭不因自由次数耗尽而丢失入口',()=>{
 const s=taskSession('defend');s.defendAt=10;s.sim.time=11;assert.match(getHudInteraction(s)?.text??'',/守住设备/);assert.ok((getHudInteraction(s)?.progress??0)>0);
 const air=taskSession('strike');air.airCharges=0;assert.equal(getHudInteraction(air)?.key,'C');
});
test('出口附近明确区分等待掉队和救援倒地，不能给出错误的进入提示',()=>{
 const s=new StorySession();s.startChapter(11,defaultLoadout());s.sim.walls.splice(0);s.flags.add(`record:${s.sector.id}`);s.taskIndex=s.sector.tasks.length;Object.assign(s.sim.player,s.sector.exit);s.companions.forEach(c=>Object.assign(c,{x:s.sim.player.x+15,z:s.sim.player.z}));
 assert.equal(getHudInteraction(s)?.key,'Q');s.companions[0].hp=0;assert.equal(getHudInteraction(s)?.text,'先救起倒地队友');assert.equal(getHudInteraction(s)?.key,'');
});
