import { modelData } from './model-data';
import type { Wall } from './simulation';
import type { SectorSpec } from './story-data';
export type Prop={id:string;shape:'box'|'cylinder'|'sphere';x:number;y:number;z:number;w:number;h:number;d:number;color:string;material?:'metal'|'glass'|'light'|'concrete'|'wood';solid?:boolean;label?:string;asset?:'burned-sedan'|'burned-police-car'|'road-barricade'};
export type Gate={id:string;after:number;wall:Wall};
export type SectorWorld={props:Prop[];walls:Wall[];gates:Gate[];supply:{x:number;z:number;rounds:number;medical?:number;grenades?:number}[]};
export function makeWorld(s:SectorSpec):SectorWorld{
 const props:Prop[]=[],walls:Wall[]=[],gates:Gate[]=[];
 const extent=s.extent;
 const inside=['hospital','mall','lab','underground'].includes(s.theme);
 function box(id:string,x:number,z:number,w:number,h:number,d:number,color:string,solid=true,material:Prop['material']='concrete',y=h/2){
  props.push({id,shape:'box',x,y,z,w,h,d,color,solid,material});if(solid)walls.push({x,z,w,h,d});
 }
 const wallColor=s.theme==='hospital'?'#778e88':s.theme==='lab'?'#637b82':s.theme==='mall'?'#756b60':'#545a59';
 for(const x of [-28,28])box(`boundary-x-${x}`,x,0,.8,inside?5.2:3.5,extent*2,wallColor);
 box('boundary-north',0,-extent,56,5,.8,wallColor);box('boundary-south',0,extent,56,5,.8,wallColor);
 const gateZ=s.tasks.slice(0,-1).map((t,i)=>(t.position.z+s.tasks[i+1].position.z)/2);
 gateZ.forEach((z,i)=>{const offset=((i+s.index)%3-1)*3;
  if(inside){box(`partition-l-${i}`,offset/2-18,z,20+offset,3.4,.65,wallColor);box(`partition-r-${i}`,offset/2+18,z,20-offset,3.4,.65,wallColor);}
  else{box(`fence-l-${i}`,offset/2-18,z,20+offset,1.35,.6,'#626a69');box(`fence-r-${i}`,offset/2+18,z,20-offset,1.35,.6,'#626a69');}
  gates.push({id:`gate-${i}`,after:i,wall:{x:offset,z,w:15.6,d:.65,h:3.6}});
 });
 if(inside){
  for(let i=0;i<s.tasks.length-1;i++){
   const a=s.tasks[i].position.z,b=s.tasks[i+1].position.z,mid=(a+b)/2;
   for(const x of [-8,8])box(`corridor-wall-${i}-${x}`,x,mid,.45,3.1,Math.abs(a-b)-9,wallColor);
  }
 }
 // 每个街区有不同的侧翼通路、入口方向与掩体，所有物件和碰撞使用同一份数据。
 for(let n=0;n<Math.ceil(extent*2/14);n++){
  const z=extent-10-n*14,x=(n%2?1:-1)*(24+(s.index%3));
  if(inside){
   box(`room-${n}`,x,z,2,4.5,8,wallColor);
   box(`cabinet-${n}`,x+(x>0?-4:4),z+2,2.5,1.6,1.2,s.theme==='hospital'?'#b2beb3':'#535b59',true,'metal');
  }else{
   box(`building-${n}`,x,z,11,7+(n+s.index)%4*1.5,9,['#5f635e','#6a6b62','#777369'][n%3]);
   for(let j=0;j<3;j++)box(`window-${n}-${j}`,x+(x>0?-5.55:5.55),z-2+j*2,.05,1.2,1.1,'#59777a',false,'glass',4.3);
  }
 }
 const positions=s.tasks.flatMap((t,i)=>[{x:i%2?8:-8,z:t.position.z+8},{x:i%2?-8:8,z:t.position.z-8}]);
 positions.forEach((p,i)=>{
  const variant=(i+s.index)%3;
  box(`cover-${i}`,p.x,p.z,variant===0?4.5:2.8,variant===1?1.7:1.1,variant===0?1.2:2.2,inside?'#78817a':'#78796c',true,variant===2?'wood':'metal');
 });
 s.tasks.forEach((task,i)=>{
  const {x,z}=task.position;
  if(['reach','boss','strike'].includes(task.kind))return;
  const recovery=task.kind==='recover';
  box(`console-${i}`,x,z-1.8,recovery?1.5:2,1.15,1,'#495d59',true,'metal');
  box(`screen-${i}`,x,z-1.77,1.2,.38,.06,'#83b4a6',false,'light',1.38);
  props.push({id:`label-${i}`,shape:'box',x,y:2.2,z:z-1.8,w:3,h:1,d:.05,color:'#c7d3c7',solid:false,label:task.name});
 });
 // 主通道旁的主题装置与真实碰撞一致，避免只在远处堆放装饰。
 s.tasks.forEach((task,i)=>{const side=i%2?1:-1,x=side*12,z=task.position.z+10;
  if(s.theme==='street'){
   const asset=i%2?'burned-police-car':'burned-sedan',size=modelData[asset].size;
   props.push({id:`vehicle-${i}`,shape:'box',asset,x,y:0,z,w:size[0],h:size[1],d:size[2],color:'#697a70',solid:true});walls.push({x,z,w:size[0],h:size[1],d:size[2]});
  }else if(s.theme==='hospital'){
   box(`bed-central-${i}`,x,z,2.2,.65,3.8,'#adbbb0',true,'metal');box(`mattress-central-${i}`,x,z,2,.2,3.5,'#c7ccb7',false,'concrete',.85);
  }else if(s.theme==='port'){
   box(`container-central-${i}`,side*15,z,6,4,7,i%2?'#5b7178':'#817e65',true,'metal');
  }else if(s.theme==='station'){
   box(`bench-${i}`,x,z,1.8,.45,4,'#6c776e',true,'metal');box(`bench-back-${i}`,x+side*.65,z,.2,1,4,'#859087',true,'metal');
  }else if(s.theme==='underground'){
   box(`column-${i}`,x,z,1.2,4.5,1.2,'#737d73');box(`overhead-${i}`,0,z,23,.35,.35,'#4b6158',false,'metal',4.5);
  }else if(s.theme==='lab'){
   box(`lab-bench-${i}`,x,z,4,1,2.3,'#a5b6ad',true,'metal');for(const dx of [-1,0,1])props.push({id:`sample-${i}-${dx}`,shape:'cylinder',x:x+dx,y:1.6,z,w:.35,h:1,d:.35,color:'#80ae99',material:'glass'});
  }else if(s.theme==='mall'){
   box(`display-${i}`,x,z,3.5,1.2,2,'#697367',true,'metal');box(`display-glass-${i}`,x,z,3.3,.6,1.9,'#84a8a0',false,'glass',1.5);
  }else{
   box(`pump-base-${i}`,x,z,4,.35,3,'#4b6156',true,'metal');props.push({id:`pump-${i}`,shape:'cylinder',x,y:1.5,z,w:2.5,h:2.6,d:2.5,color:'#769080',material:'metal'});walls.push({x,z,w:2.8,h:2.8,d:2.8});
  }
 });
 // 主题设备使八种空间在结构、轮廓和材质上可以直接辨认。
 if(s.theme==='hospital')for(const x of [-22,22])for(const z of s.tasks.map(t=>t.position.z+8)){
  box(`bed-${x}-${z}`,x,z,2.2,.65,3.8,'#a7b5ac',true,'metal');
  box(`mattress-${x}-${z}`,x,z,2,.2,3.5,'#c2c9b5',false,'concrete',.85);
 }
 if(['industry','underground','lab'].includes(s.theme))for(const x of [-26,26]){
  props.push({id:`pipe-${x}`,shape:'cylinder',x,y:2,z:0,w:1.6,h:extent*2-10,d:1.6,color:'#6a7c77',solid:false,material:'metal'});
  for(const z of s.tasks.map(t=>t.position.z+12)){box(`tank-${x}-${z}`,x+(x>0?-2:2),z,3.8,4,4.5,s.theme==='lab'?'#93a6a1':'#6b7773',true,'metal');}
 }
 if(s.theme==='mall')for(const x of [-24,24])for(const z of s.tasks.map(t=>t.position.z+10)){
  box(`shelf-${x}-${z}`,x,z,5,2.6,4,'#675b4b',true,'wood');
  for(let j=0;j<4;j++)box(`boxes-${x}-${z}-${j}`,x-1.5+j,z,.6,.8,.7,['#a89675','#737e6c'][j%2],false,'wood',1.8);
 }
 if(s.theme==='station')for(const x of [-24,24]){
  box(`train-${x}`,x,0,4,3.6,24,'#737f79',true,'metal');
  for(const z of [-40,40])box(`buffer-${x}-${z}`,x,z,5,1,1.8,'#78765d');
 }
 if(s.theme==='port')for(const x of [-24,24])for(const z of s.tasks.map(t=>t.position.z+10))box(`container-${x}-${z}`,x,z,7,4.8,11,(x+z)%2?'#676b64':'#616f79',true,'metal');
 return {props,walls,gates,supply:s.tasks.filter((_,i)=>i%2===0).map((t,i)=>({x:3,z:t.position.z+8,rounds:144,medical:i===0?18:0,grenades:i===0?1:0}))};
}
