import {writeFileSync} from 'node:fs';
import {chapters,sectors,mutationSpecs} from '../src/story-data.ts';
import {makeWorld} from '../src/story-world-data.ts';
const kinds={inspect:'检查',repair:'修复',recover:'回收',open:'开启',reach:'抵达',defend:'防守',strike:'空袭',boss:'首领',upload:'上传'};
const manifest={说明:'剧情战役的实际配置导出；设计时长不等于已测得的真人时长。',章节数:chapters.length,分区数:sectors.length,设计时长分钟:chapters.reduce((n,c)=>n+c.minutes,0),存档版本:2,
 资产来源:['沿用本项目的士兵、枪械、车辆与废墟模型','八种场景的建筑结构、设备与交互件由代码生成','人体变异体使用既有人体几何的独立副本变形并增加增生组织','没有调用付费模型生成服务'],
 敌人:Object.entries(mutationSpecs).map(([id,s])=>({标识:id,名称:s.name,基础生命:s.hp})),
 章节:chapters.map(c=>({标识:c.id,名称:c.name,设计分钟:c.minutes,简报:c.briefing,分区:c.sectors.map(s=>{const world=makeWorld(s);return{标识:s.id,名称:s.name,下一区域:sectors[s.index+1]?.id??'结局',主题:s.theme,模型零件:world.props.length,碰撞体:world.walls.length,门禁:world.gates.length,节点:s.tasks.map(t=>({标识:t.id,任务:t.name,类型:kinds[t.kind],剧情:t.text,状态变化:t.effect??'无'}))};})}))};
writeFileSync('docs/design/silent-echo-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('已导出十六章事件表、四十区连接和资产清单。');
