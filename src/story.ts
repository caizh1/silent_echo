import { Simulation, distance, segmentBox, type Vec, type Enemy } from './simulation';
import { defaultLoadout, normalizeLoadout, loadoutStats, type Loadout } from './weapons';
import { sectors, chapters, members, mutationSpecs, type MemberId, type Mutation, type SectorSpec } from './story-data';
import { makeWorld, type SectorWorld } from './story-world-data';
import type { ActorPose } from './actor';

export type Companion=Vec&{id:MemberId;hp:number;maxHp:number;ammo:number;reserve:number;reload:number;fire:number;angle:number;moveAngle:number;moving:boolean;lastShotAt:number;healAt:number;revive:number;command:'follow'|'hold';hold:Vec};
export type RadioLine={id:string;speaker:string;text:string;remaining:number};
export type Strike=Vec&{due:number;mission:boolean};
const simKeys=['state','player','time','kills','xp','level','nextXp','ammo','magazine','reserve','roundsFired','roundsCollected','cratesOpened','reload','fire','damage','fireInterval','speed','armor','upgrades','id','lastShotAt','enemies','bullets','crates','drops','grenades','grenadeCount','grenadesThrown','grenadeCooldown'] as const;
export type StorySnapshot={version:2;sector:number;task:number;rng:number;flags:string[];completed:string[];triggered:string[];explored:string[];radio:RadioLine[];transcript:RadioLine[];companions:Companion[];sim:Record<string,unknown>;holdTime:number;defendAt:number;strikes:Strike[];airCharges:number;airReady:number;elapsed:number;finished:boolean};
export const STORY_KEY='silent-echo-checkpoint-v1', BACKUP_KEY='silent-echo-checkpoint-backup-v1', PROGRESS_KEY='silent-echo-progress-v1';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
function safeObject(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
export function validSnapshot(v:unknown):v is StorySnapshot{
 if(!safeObject(v)||v.version!==2||!Number.isInteger(v.sector)||Number(v.sector)<0||Number(v.sector)>=sectors.length)return false;
 const sector=sectors[Number(v.sector)];
 if(!Number.isInteger(v.task)||Number(v.task)<0||Number(v.task)>sector.tasks.length||!finite(v.rng)||!finite(v.elapsed)||!safeObject(v.sim)||!safeObject(v.sim.player))return false;
 for(const field of ['flags','completed','triggered','explored'])if(!Array.isArray(v[field])||!(v[field] as unknown[]).every(x=>typeof x==='string'))return false;
 for(const field of ['radio','transcript','companions','strikes'])if(!Array.isArray(v[field]))return false;
 for(const field of simKeys){if(!(field in v.sim))return false;const val=v.sim[field];if(typeof val==='number'&&!finite(val))return false;}
 for(const field of ['x','z','hp','maxHp','angle','moveAngle'])if(!finite(v.sim.player[field]))return false;
 if(Math.abs(Number(v.sim.player.x))>27.6||Math.abs(Number(v.sim.player.z))>sector.extent||Number(v.sim.player.maxHp)<1||Number(v.sim.player.hp)<0)return false;
 if(!safeObject(v.sim.loadout)||!['pistol','smg','rifle'].includes(String(v.sim.loadout.weapon))||!Array.isArray(v.sim.loadout.attachments)||!v.sim.loadout.attachments.every(x=>typeof x==='string'))return false;
 for(const field of ['time','kills','xp','level','ammo','magazine','reserve','roundsFired','reload','fire','damage','fireInterval','speed','armor','upgrades','id'])if(!finite(v.sim[field]))return false;
 if(!['playing','paused','upgrade','won','lost','ready'].includes(String(v.sim.state)))return false;
 if(Number(v.sim.ammo)<0||Number(v.sim.reserve)<0||Number(v.sim.reserve)>240||Number(v.sim.ammo)>Number(v.sim.magazine))return false;
 for(const field of ['enemies','bullets','crates','drops','grenades']){if(!Array.isArray(v.sim[field]))return false;for(const item of v.sim[field] as unknown[]){if(!safeObject(item)||!finite(item.x)||!finite(item.z))return false;}}
 for(const [field,numbers]of [['enemies',['hp','maxHp','attack','id']],['bullets',['vx','vz','life','damage','id']],['crates',['rounds','id']],['drops',['value','id']],['grenades',['vx','vy','vz','y','remaining','age','id']]] as const){for(const item of v.sim[field] as Record<string,unknown>[]){if(numbers.some(k=>!finite(item[k])))return false;if(item.aim&&(!safeObject(item.aim)||!finite(item.aim.x)||!finite(item.aim.z)))return false;}}
 for(const crate of v.sim.crates as Record<string,unknown>[])for(const key of ['medical','grenades'])if(crate[key]!==undefined&&!finite(crate[key]))return false;
 if((v.sim.enemies as unknown[]).length>48||(v.sim.bullets as unknown[]).length>512||(v.sim.crates as unknown[]).length>64||(v.sim.drops as unknown[]).length>2048||(v.sim.grenades as unknown[]).length>3)return false;
 for(const enemy of v.sim.enemies as Record<string,unknown>[]){if(!['runner','shooter','pouncer','spitter','boss'].includes(String(enemy.kind))||!finite(enemy.hp)||!finite(enemy.id))return false;if(enemy.mutation&&!(String(enemy.mutation) in mutationSpecs))return false;if(enemy.modifiers&&(!safeObject(enemy.modifiers)||Object.values(enemy.modifiers).some(x=>!finite(x))))return false;}
 const ids=new Set<string>();for(const item of v.companions as unknown[]){if(!safeObject(item)||!(String(item.id) in members)||ids.has(String(item.id)))return false;ids.add(String(item.id));for(const field of ['x','z','hp','maxHp','ammo','reserve','reload','fire','angle','moveAngle','healAt','revive'])if(!finite(item[field]))return false;if(!safeObject(item.hold)||!finite(item.hold.x)||!finite(item.hold.z))return false;}
 for(const item of [...v.radio as unknown[],...v.transcript as unknown[]])if(!safeObject(item)||typeof item.id!=='string'||typeof item.text!=='string'||typeof item.speaker!=='string'||!finite(item.remaining))return false;
 for(const item of v.strikes as unknown[])if(!safeObject(item)||!finite(item.x)||!finite(item.z)||!finite(item.due)||typeof item.mission!=='boolean')return false;
 return finite(v.airCharges)&&finite(v.airReady)&&finite(v.holdTime)&&finite(v.defendAt)&&typeof v.finished==='boolean';
}
function checksum(text:string){let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return n>>>0;}
export function encodeSnapshot(snapshot:StorySnapshot){const payload=JSON.stringify(snapshot);return JSON.stringify({payload,checksum:checksum(payload)});}
export function decodeSnapshot(raw:string|null):StorySnapshot|undefined{try{const box=JSON.parse(raw??'null');if(!box||typeof box.payload!=='string'||box.checksum!==checksum(box.payload))return;const value=JSON.parse(box.payload);return validSnapshot(value)?value:undefined;}catch{return;}}
export function readCheckpoint(storage:Pick<Storage,'getItem'>):{snapshot?:StorySnapshot;message:string}{try{const current=decodeSnapshot(storage.getItem(STORY_KEY));if(current)return{snapshot:current,message:'已找到本机检查点'};const backup=decodeSnapshot(storage.getItem(BACKUP_KEY));return backup?{snapshot:backup,message:'主检查点不可用，已恢复上一份检查点'}:{message:'尚无可恢复的战役检查点'};}catch{return{message:'本机存储不可用，本次战役仍可继续'};}}
export function writeCheckpoint(snapshot:StorySnapshot,storage:Pick<Storage,'getItem'|'setItem'>){if(!validSnapshot(snapshot))return false;try{const existing=storage.getItem(STORY_KEY);if(decodeSnapshot(existing))storage.setItem(BACKUP_KEY,existing!);storage.setItem(STORY_KEY,encodeSnapshot(snapshot));const progress=Number(storage.getItem(PROGRESS_KEY))||0;storage.setItem(PROGRESS_KEY,String(Math.max(progress,snapshot.sector)));return true;}catch{return false;}}

// 四方向格网由当前分区的实际碰撞生成，给同伴和验收脚本共同使用。
const navigationCache=new WeakMap<Simulation,{walls:number;values:Map<string,boolean>}>();
export function findRoute(sim:Simulation,start:Vec,goal:Vec,radius=.38):Vec[]{
 if(!sim.blocked(start,radius)&&!sim.blocked(goal,radius)&&!sim.walls.some(w=>segmentBox(start,goal,w,radius)<=1))return[{...goal}];
 const cell=.5,limit=Math.ceil((sim.mission.bounds??23)/cell),stride=limit*2+1;
 let cache=navigationCache.get(sim);if(!cache||cache.walls!==sim.walls.length){cache={walls:sim.walls.length,values:new Map()};navigationCache.set(sim,cache);}
 const key=(x:number,z:number)=>(x+limit)*stride+z+limit;
 const pass=(x:number,z:number)=>{if(Math.abs(x)>limit||Math.abs(z)>limit)return false;const k=`${radius}:${x}:${z}`;let v=cache!.values.get(k);if(v===undefined){v=!sim.blocked({x:x*cell,z:z*cell},radius);cache!.values.set(k,v);}return v;};
 const candidates=(p:Vec)=>{const out:{x:number;z:number}[]=[];const bx=Math.round(p.x/cell),bz=Math.round(p.z/cell);for(let x=bx-3;x<=bx+3;x++)for(let z=bz-3;z<=bz+3;z++)if(pass(x,z)&&!sim.walls.some(w=>segmentBox(p,{x:x*cell,z:z*cell},w,radius)<=1))out.push({x,z});return out.sort((a,b)=>distance({x:a.x*cell,z:a.z*cell},p)-distance({x:b.x*cell,z:b.z*cell},p)).slice(0,6);};
 const starts=candidates(start),ends=candidates(goal);if(!starts.length||!ends.length)return[];
 const endKeys=new Set(ends.map(p=>key(p.x,p.z))),end=ends[0];
 type Node={x:number;z:number;score:number};const heap:Node[]=[];
 const push=(n:Node)=>{heap.push(n);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].score<=n.score)break;heap[i]=heap[p];i=p;}heap[i]=n;};
 const pop=()=>{const n=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].score<heap[j].score)j++;if(heap[j].score>=last.score)break;heap[i]=heap[j];i=j;}heap[i]=last;}return n;};
 const cost=new Map<number,number>(),prev=new Map<number,{x:number;z:number}|null>(),closed=new Set<number>();
 for(const p of starts){cost.set(key(p.x,p.z),0);prev.set(key(p.x,p.z),null);push({...p,score:Math.hypot(p.x-end.x,p.z-end.z)});}
 while(heap.length){const p=pop(),pk=key(p.x,p.z);if(closed.has(pk))continue;closed.add(pk);if(endKeys.has(pk)){const path:Vec[]=[{...goal}];let q:{x:number;z:number}|null=p;while(q){path.unshift({x:q.x*cell,z:q.z*cell});q=prev.get(key(q.x,q.z))??null;}return path;}
 for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=p.x+dx,z=p.z+dz,k=key(x,z);if(closed.has(k)||!pass(x,z)||(dx&&dz&&(!pass(p.x+dx,p.z)||!pass(p.x,p.z+dz))))continue;const g=(cost.get(pk)??0)+Math.hypot(dx,dz);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);prev.set(k,p);push({x,z,score:g+Math.hypot(x-end.x,z-end.z)});}}
 return[];
}

export class StorySession{
 sim!:Simulation;world!:SectorWorld;sectorIndex=0;taskIndex=0;rng=17;flags=new Set<string>();completed=new Set<string>();triggered=new Set<string>();explored=new Set<string>();companions:Companion[]=[];
 radio:RadioLine[]=[];transcript:RadioLine[]=[];holdTime=0;defendAt=-1;strikes:Strike[]=[];airCharges=0;airReady=0;elapsed=0;finished=false;needsSave=false;notice='';revision=0;blast?:Vec&{until:number};lastCheckpoint?:StorySnapshot;
 private routes=new Map<string,{until:number;goal:Vec;points:Vec[]}>();private dangerTime=0;private pendingCheckpoint=false;
 constructor(loadout:Loadout=defaultLoadout('rifle'),snapshot?:StorySnapshot){
  if(snapshot&&validSnapshot(snapshot)){this.restore(snapshot);return;}
  this.loadSector(0,loadout);this.lastCheckpoint=this.snapshot();
 }
 get sector(){return sectors[this.sectorIndex];}get chapter(){return chapters[this.sector.chapter];}get task(){return this.sector.tasks[this.taskIndex];}
 get recordPosition(){return {x:-11,z:this.sector.tasks[2].position.z+12};}
 get airUnlocked(){return this.flags.has('unlock-airstrike');}
 private random=()=>{this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;};
 say(text:string,id=`radio-${this.sector.id}-${this.transcript.length}`){if(!text.trim()||this.transcript.some(l=>l.id.startsWith(`${id}/`)))return;for(const [i,line]of text.split('\n').entries()){const at=line.indexOf('：');const msg={id:`${id}/${i}`,speaker:at>=0?line.slice(0,at):'行动记录',text:at>=0?line.slice(at+1):line,remaining:Math.max(5,Math.min(11,line.length*.16))};this.radio.push(msg);this.transcript.push({...msg});}if(this.transcript.length>1024)this.transcript.splice(0,this.transcript.length-1024);}
 private loadSector(index:number,loadout:Loadout,carry?:Record<string,unknown>){
  const oldChapter=this.sector?.chapter;this.sectorIndex=index;this.taskIndex=0;this.holdTime=0;this.defendAt=-1;this.triggered.clear();this.explored.clear();this.strikes=[];this.routes.clear();
  const s=this.sector;this.world=makeWorld(s);
  this.sim=new Simulation(this.random,loadout,{id:s.id,name:s.name,subtitle:this.chapter.name,briefing:this.chapter.briefing,tactic:'沿任务线推进，利用掩体，注意无线电与同伴。',scripted:true,bounds:s.extent-.5,collisions:this.world.walls,scenery:[],supplies:[],duration:0,bossAt:1e9,bossHealth:1,maxEnemies:48,spawn:{x:0,z:s.extent-7},objectives:[],phases:[{at:0,name:this.chapter.name,interval:9999,enemies:['runner']}],sky:'#172426',fog:'#23383b',light:'#dce4cc',accent:'#9bc3b0'});
  if(carry){const sameChapter=oldChapter===s.chapter;const fields=['ammo','reserve','grenadeCount','roundsFired','roundsCollected','cratesOpened','kills'];if(sameChapter)fields.push('damage','fireInterval','armor','upgrades','xp','nextXp','level');for(const k of fields)if(k in carry)(this.sim as unknown as Record<string,unknown>)[k]=copy(carry[k]);const player=carry.player as typeof this.sim.player;if(sameChapter)this.sim.player.maxHp=player.maxHp;this.sim.player.hp=Math.min(player.hp,this.sim.player.maxHp);}
  this.sim.crates=this.world.supply.map(p=>({...p,id:this.sim.id++}));
  this.companions.forEach((member,i)=>{member.x=-2+i*2;member.z=s.extent-6;member.hold={x:member.x,z:member.z};member.command='follow';member.moving=false;member.revive=0;member.healAt=Math.max(0,member.healAt-Number(carry?.time??0));member.lastShotAt=-100;});
  if(carry)this.airReady=Math.max(0,this.airReady-Number(carry.time??0));
  if(oldChapter!==s.chapter){this.airCharges=this.airUnlocked?2:0;this.airReady=0;}
  this.rebuildWalls();this.seedEncounters();this.sim.start();this.say(s.arrival,`arrival-${s.id}`);this.needsSave=true;this.revision++;this.updateExploration();
 }
 private seedEncounters(){for(let i=0;i<this.sector.tasks.length;i++){const task=this.sector.tasks[i];if(!task.threat||task.kind==='boss')continue;this.spawnGroup(i,task.threat,true);}}
 private supplyEncounter(){
  const task=this.task;if(!task||this.triggered.has(`${task.id}:supplied`))return;this.triggered.add(`${task.id}:supplied`);
  const options=[{x:task.position.x-3,z:task.position.z+3},{x:task.position.x+3,z:task.position.z+3},{x:0,z:task.position.z+4}];
  const spot=options.find(p=>!this.sim.blocked(p,.8)&&this.sim.visible(p,task.position));if(spot)this.sim.crates.push({...spot,id:this.sim.id++,rounds:240,medical:18,grenades:1});
 }
 private spawnGroup(stage:number,count:number,dormant=false){const withMedic=this.sector.chapter>=3&&this.sector.chapter<=5;count=Math.min(count,this.sector.chapter<9?(withMedic?6:4):10);let armoredCount=0,callerCount=0;const task=this.sector.tasks[stage],roster:Mutation[]=this.sector.chapter<2?['wanderer','runner']:this.sector.chapter<5?['wanderer','runner','pouncer']:['wanderer','runner','pouncer','spitter','armored','caller'];
  for(let i=0;i<count&&this.sim.enemies.length<(this.sector.tasks.some(t=>t.kind==='boss')?47:48);i++){
   for(let attempt=0;attempt<30;attempt++){const angle=this.random()*Math.PI*2,radius=6+this.random()*10,entry=this.world.gates[Math.max(0,stage-1)]?.wall,p=!dormant&&entry?{x:entry.x+(this.random()-.5)*5,z:entry.z+2+this.random()*2}:{x:task.position.x+Math.sin(angle)*radius,z:task.position.z+Math.cos(angle)*radius};let mutation=roster[Math.floor(this.random()*roster.length)];if(mutation==='armored'&&armoredCount>=1)mutation='runner';if(mutation==='caller'&&callerCount>=1)mutation='wanderer';const spec=mutationSpecs[mutation];if(Math.abs(p.x)>26||this.sim.blocked(p,.8)||this.sim.enemies.some(e=>distance(e,p)<1.4)||distance(p,this.sim.player)<9)continue;const enemy=this.sim.addEnemy(spec.kind,p);enemy.hp=enemy.maxHp=spec.hp*(1+this.sector.chapter*.018);enemy.mutation=mutation;enemy.modifiers={speed:spec.speed,damage:spec.damage};enemy.dormant=dormant;if(mutation==='armored')armoredCount++;if(mutation==='caller')callerCount++;(enemy as Enemy&{group:number}).group=stage;break;}
  }
 }
 private rebuildWalls(){this.sim.walls.splice(0,this.sim.walls.length,...this.world.walls,...this.world.gates.filter(g=>this.taskIndex<=g.after).map(g=>({...g.wall})));this.sim.invalidateNavigation();this.routes.clear();}
 snapshot():StorySnapshot{const sim:Record<string,unknown>={loadout:this.sim.loadout};for(const k of simKeys)sim[k]=typeof this.sim[k]==='number'&&!Number.isFinite(this.sim[k])?-10000:copy(this.sim[k]);return{version:2,sector:this.sectorIndex,task:this.taskIndex,rng:this.rng,flags:[...this.flags],completed:[...this.completed],triggered:[...this.triggered],explored:[...this.explored],radio:copy(this.radio),transcript:copy(this.transcript),companions:copy(this.companions),sim,holdTime:this.holdTime,defendAt:this.defendAt,strikes:copy(this.strikes),airCharges:this.airCharges,airReady:this.airReady,elapsed:this.elapsed,finished:this.finished};}
 restore(s:StorySnapshot){if(!validSnapshot(s))throw new Error('战役检查点无效');this.companions=[];this.flags=new Set(s.flags);this.loadSector(s.sector,normalizeLoadout(((s.sim as Record<string,unknown>).loadout??defaultLoadout('rifle')) as Loadout));for(const k of simKeys)(this.sim as unknown as Record<string,unknown>)[k]=copy(s.sim[k]);this.sectorIndex=s.sector;this.taskIndex=s.task;this.rng=s.rng;this.completed=new Set(s.completed);this.triggered=new Set(s.triggered);this.explored=new Set(s.explored);this.radio=copy(s.radio);this.transcript=copy(s.transcript);this.companions=copy(s.companions);this.holdTime=s.holdTime;this.defendAt=s.defendAt;this.strikes=copy(s.strikes);this.airCharges=s.airCharges;this.airReady=s.airReady;this.elapsed=s.elapsed;this.finished=s.finished;this.sim.state=s.finished?'won':s.sim.state==='upgrade'?'upgrade':'playing';this.rebuildWalls();this.lastCheckpoint=copy(s);this.needsSave=false;this.revision++;this.pendingCheckpoint=false;}
 checkpoint(){const unsafe=this.sim.player.hp<=0||this.companions.some(c=>c.hp<=0)||this.sim.enemies.some(e=>!e.dormant&&e.hp>0&&distance(e,this.sim.player)<8&&this.sim.visible(e,this.sim.player))||this.sim.bullets.some(b=>b.hostile&&distance(b,this.sim.player)<6)||this.strikes.some(s=>distance(s,this.sim.player)<12);if(unsafe&&this.lastCheckpoint&&!this.finished){this.pendingCheckpoint=true;this.needsSave=false;return this.lastCheckpoint;}this.pendingCheckpoint=false;if(this.sim.player.hp<=0&&this.companions.every(c=>c.hp<=0)&&this.lastCheckpoint){this.needsSave=false;return this.lastCheckpoint;}const s=this.snapshot();s.sim.loadout=this.sim.loadout;this.lastCheckpoint=copy(s);this.needsSave=true;return s;}
 restartCheckpoint(){if(this.lastCheckpoint)this.restore(this.lastCheckpoint);}
 startChapter(chapter:number,loadout:Loadout){if(chapter<0||chapter>=chapters.length)return;this.radio=[];this.transcript=[];this.flags=new Set(chapter>=5?['unlock-airstrike']:[]);this.completed.clear();this.companions=[];this.finished=false;this.loadSector(chapters[chapter].sectors[0].index,loadout);if(chapter>=3&&chapter<6)this.join('evelyn');if(chapter>=9){this.join('hayes');this.join('pierce');}if(chapter>=11)this.join('evelyn');if(chapter>=8)this.flags.add('evidence-time');if(chapter>=11)this.flags.add('evidence-neural');if(chapter>=14){this.flags.add('evidence-extraction');this.flags.add('orders-revoked');}this.airCharges=this.airUnlocked?2:0;this.checkpoint();}
 setLoadout(value:Loadout){this.sim.state='ready';this.sim.configureLoadout(value);this.sim.state='playing';this.checkpoint();}
 join(id:MemberId){if(this.companions.some(m=>m.id===id))return;this.companions.push({id,x:this.sim.player.x+1+this.companions.length,z:this.sim.player.z+1,hp:100,maxHp:100,ammo:24,reserve:120,reload:0,fire:0,angle:0,moveAngle:0,moving:false,lastShotAt:-100,healAt:0,revive:0,command:'follow',hold:{...this.sim.player}});}
 private finishTask(){const task=this.task;if(!task||this.completed.has(task.id))return;this.completed.add(task.id);if(task.effect){this.flags.add(task.effect);if(task.effect==='join-evelyn')this.join('evelyn');if(task.effect==='leave-evelyn')this.companions=this.companions.filter(m=>m.id!=='evelyn');if(task.effect==='join-squad'){this.join('hayes');this.join('pierce');}if(task.effect==='unlock-airstrike')this.airCharges=2;}
  this.say(task.text,task.id);this.taskIndex++;this.holdTime=0;this.defendAt=-1;this.rebuildWalls();this.notice=`${task.name}已完成`;this.revision++;
  if(task.effect==='ending'){this.finished=true;this.sim.state='won';}
  this.checkpoint();
 }
 private updateExploration(){for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){const p={x:Math.floor(this.sim.player.x/6)+x,z:Math.floor(this.sim.player.z/6)+z};if(Math.hypot(x,z)<=2.3)this.explored.add(`${p.x},${p.z}`);}}
 command(mode:'follow'|'hold'){for(const c of this.companions){c.command=mode;c.hold={x:c.x,z:c.z};}this.notice=mode==='hold'?'小队守住当前位置':'小队跟随';}
 private moveMember(c:Companion,goal:Vec,dt:number){let next=goal;if(this.sim.walls.some(w=>segmentBox(c,goal,w,.34)<=1)){let route=this.routes.get(c.id);if(!route||route.until<this.sim.time||distance(route.goal,goal)>4){route={until:this.sim.time+1.2,goal:{...goal},points:findRoute(this.sim,c,goal,.34)};this.routes.set(c.id,route);}while(route.points.length&&distance(c,route.points[0])<.08)route.points.shift();if(!route.points.length)return;next=route.points[0];}const d=distance(c,next);if(d>.01){const dx=(next.x-c.x)/d,dz=(next.z-c.z)/d;c.moveAngle=Math.atan2(dx,dz);const speed=distance(c,this.sim.player)>12?5.4:4.5;const travel=Math.min(d,speed*dt);this.sim.move(c,dx*travel,dz*travel,.34);c.moving=true;}}
 private shareSupplies(){
  const sim=this.sim;
  for(const crate of sim.crates){const near=[sim.player,...this.companions.filter(c=>c.hp>0)].some(p=>distance(p,crate)<1.6&&sim.visible(p,crate));if(!near)continue;if(!crate.aidUsed&&distance(sim.player,crate)<2){const patient=[sim.player,...this.companions].filter(p=>p.hp>0&&distance(p,crate)<4).sort((a,b)=>a.hp-b.hp)[0];if((patient&&patient.hp<patient.maxHp)||sim.grenadeCount<3){if(patient)patient.hp=Math.min(patient.maxHp,patient.hp+(crate.medical??0));sim.grenadeCount=Math.min(3,sim.grenadeCount+(crate.grenades??0));crate.aidUsed=true;}}if(crate.rounds<=0){if(crate.aidUsed||(!(crate.medical??0)&&!(crate.grenades??0)))crate.emptiedAt??=sim.time;else delete crate.emptiedAt;continue;}
   const targets=[{reserve:()=>sim.reserve,maximum:240,add:(n:number)=>{sim.reserve+=n;sim.roundsCollected+=n;}},...this.companions.filter(c=>c.hp>0).map(c=>({reserve:()=>c.reserve,maximum:120,add:(n:number)=>{c.reserve+=n;}}))];let total=0;
   while(crate.rounds>0){const target=targets.filter(t=>t.reserve()<t.maximum).sort((a,b)=>a.reserve()/a.maximum-b.reserve()/b.maximum)[0];if(!target)break;const n=Math.min(12,crate.rounds,target.maximum-target.reserve());target.add(n);crate.rounds-=n;total+=n;}
   if(total){if(crate.openedAt===undefined){crate.openedAt=sim.time;sim.cratesOpened++;}if(crate.rounds===0&&(crate.aidUsed||(!(crate.medical??0)&&!(crate.grenades??0))))crate.emptiedAt=sim.time;else delete crate.emptiedAt;this.notice=this.companions.length?'小队已自动分配补给':'已补充备用弹药';}
  }
 }
 private updateCompanions(dt:number){const sim=this.sim;
  this.companions.forEach((c,i)=>{c.moving=false;if(c.hp<=0)return;
   const down=[...(sim.player.hp<=0?[sim.player]:[]),...this.companions.filter(m=>m.hp<=0)].sort((a,b)=>distance(c,a)-distance(c,b))[0];
   let goal:Vec=c.command==='hold'?c.hold:{x:sim.player.x+Math.sin(i*2.1+1)*2.5,z:sim.player.z+Math.cos(i*2.1+1)*2.5};
   if(sim.blocked(goal,.45))goal=sim.player;
   if(down){goal=down;if(distance(c,down)<2&&sim.visible(c,down)){c.revive+=dt;if(c.revive>=4){down.hp=40;c.revive=0;for(const e of sim.enemies)e.attack=Math.max(e.attack,2);this.say(`${members[c.id].name}：起来，我们还没到出口。`,`revive-${this.sector.id}-${Math.floor(sim.time)}`);}}else c.revive=0;}
   const threat=sim.enemies.find(e=>!e.dormant&&e.windup&&e.aim&&distance(c,e.aim)<(e.kind==='boss'?5:2));
   const incoming=this.strikes.find(s=>distance(c,s)<10);
   if(threat||incoming){const p=incoming??threat!,d=Math.max(.1,distance(c,p));const dodge={x:c.x+(c.x-p.x)/d*5,z:c.z+(c.z-p.z)/d*5};if(!sim.blocked(dodge,.45))goal=dodge;}
   this.moveMember(c,goal,dt);
   for(const other of this.companions){if(other===c)continue;const d=distance(c,other);if(d>.001&&d<.8)sim.move(c,(c.x-other.x)/d*.03,(c.z-other.z)/d*.03,.34);}
   c.fire=Math.max(0,c.fire-dt);if(c.reload>0){c.reload=Math.max(0,c.reload-dt);if(c.reload===0){const n=Math.min(24-c.ammo,c.reserve);c.ammo+=n;c.reserve-=n;}}
   const enemy=sim.enemies.filter(e=>!e.dormant&&e.hp>0&&distance(c,e)<17&&sim.hasShot(c,e)).sort((a,b)=>distance(c,a)-distance(c,b))[0];
   if(enemy){c.angle=Math.atan2(enemy.x-c.x,enemy.z-c.z);if(c.fire===0&&c.ammo>0&&c.reload===0){c.ammo--;c.fire=c.id==='evelyn'?.7:.32;c.lastShotAt=sim.time;const len=distance(c,enemy);sim.bullets.push({id:sim.id++,x:c.x,z:c.z,y:1.2,vx:(enemy.x-c.x)/len*90,vz:(enemy.z-c.z)/len*90,life:17/90,damage:c.id==='evelyn'?16:11,hostile:false});sim.effects.push({type:'shot',x:c.x,z:c.z,y:1.2,direction:{x:(enemy.x-c.x)/len,z:(enemy.z-c.z)/len}});}}
   else if(c.moving)c.angle=c.moveAngle;
   if(c.ammo===0&&c.reserve>0&&c.reload===0)c.reload=1.7;
   if(c.id==='evelyn'&&sim.time>=c.healAt){const patient=[sim.player,...this.companions].filter(p=>p.hp>0&&p.hp<65&&distance(c,p)<4).sort((a,b)=>a.hp-b.hp)[0];if(patient){patient.hp=Math.min(100,patient.hp+30);c.healAt=sim.time+28;this.notice='伊芙琳已进行紧急治疗';}}
  });
  for(const crate of sim.crates)if(crate.rounds>0&&sim.reserve>=180){for(const c of this.companions)if(c.hp>0&&distance(c,crate)<3&&sim.visible(c,crate)){const n=Math.min(crate.rounds,120-c.reserve);c.reserve+=n;crate.rounds-=n;if(crate.rounds===0)crate.emptiedAt=sim.time;}}
 }
 stagedCompanions():Companion[]{
  const ids:MemberId[]=[];if(['hospital-ward','gate-control','archive-yard'].includes(this.sector.id)&&!this.companions.some(c=>c.id==='evelyn'))ids.push('evelyn');if(this.sector.id==='north-bridge'&&!this.companions.some(c=>c.id==='hayes'))ids.push('hayes','pierce');
  const stage=this.sector.tasks.find(t=>t.effect==='join-evelyn'||t.effect==='join-squad'||t.effect==='leave-evelyn')??this.sector.tasks[2];
  return ids.map((id,i)=>({id,x:stage.position.x+2+i,z:stage.position.z+2,hp:100,maxHp:100,ammo:24,reserve:120,reload:0,fire:0,angle:0,moveAngle:0,moving:false,lastShotAt:-100,healAt:0,revive:0,command:'hold',hold:{...stage.position}}));
 }
 actorPose(c:Companion):ActorPose{return{player:{...c},loadout:defaultLoadout(c.id==='evelyn'?'pistol':c.id==='pierce'?'smg':'rifle'),weapon:c.id==='evelyn'?'pistol':c.id==='pierce'?'smg':'rifle',reload:c.reload,time:this.sim.time,lastShotAt:c.lastShotAt};}
 canStrike(point:Vec,mission=false){if(Math.abs(point.x)>27||Math.abs(point.z)>this.sector.extent-1)return '目标不在当前行动区域';if(!this.airUnlocked)return'尚未建立空中支援链路';if(!['street','port','industry','station'].includes(this.sector.theme))return'室内不能标定空袭';if(this.strikes.length)return'上一次打击尚未结束';if(!mission&&(this.airCharges<=0||this.sim.time<this.airReady))return'自由支援次数不足或正在冷却';if(this.sim.blocked(point,0)||distance(point,this.sim.player)>38)return'目标超出可标定范围';if(!this.explored.has(`${Math.floor(point.x/6)},${Math.floor(point.z/6)}`))return'目标区域尚未侦察';if([this.sim.player,...this.companions.filter(c=>c.hp>0)].some(p=>distance(p,point)<10))return'打击范围内有友军，请先拉开距离';if(this.sector.tasks.slice(this.taskIndex).some(t=>t.kind==='recover'&&distance(t.position,point)<11))return'该范围有必须保全的样本或设备';if(mission&&(!this.task||this.task.kind!=='strike'||distance(point,this.task.position)>3))return'任务打击需要准确标定指定区域';return'';}
 callStrike(point:Vec){const mission=this.task?.kind==='strike';const reason=this.canStrike(point,mission);if(reason){this.notice=reason;return false;}this.strikes.push({...point,due:this.sim.time+3.5,mission});if(!mission){this.airCharges--;this.airReady=this.sim.time+60;}this.say('总部：打击确认，立即离开预警范围。');this.revision++;return true;}
 private updateStrikes(){const arrivals=this.strikes.filter(s=>s.due<=this.sim.time);this.strikes=this.strikes.filter(s=>s.due>this.sim.time);for(const strike of arrivals){for(const e of this.sim.enemies){const d=distance(e,strike);if(d<9)e.hp-=e.kind==='boss'?700:800;}for(const p of [this.sim.player,...this.companions])if(distance(p,strike)<9)p.hp=Math.max(0,p.hp-75);this.sim.effects.push({type:'explosion',...strike});this.blast={...strike,until:this.sim.time+2};if(strike.mission&&this.task?.kind==='strike')this.finishTask();}this.strikes=this.strikes.filter(s=>s.due>this.sim.time);}
 get interactionHint(){if(!this.flags.has(`record:${this.sector.id}`)&&distance(this.sim.player,this.recordPosition)<3)return '按 F 收集现场记录';const down=this.companions.find(c=>c.hp<=0&&distance(c,this.sim.player)<2.5);if(down)return`按住 F 救援${members[down.id].name}`;if(this.task&&distance(this.sim.player,this.task.position)<3&&!this.sim.visible(this.sim.player,this.task.position))return '移到设备正面再进行操作';if(!this.task)return this.companions.some(c=>c.hp<=0)?'先救起倒地队友，再前往出口':distance(this.sim.player,this.sector.exit)<4?'按 F 前往下一分区':'前往北侧出口';if(this.task.kind==='strike')return'按 C 标定任务空袭，友军与目标保持十米距离';if(this.task.kind==='boss')return'击败增生体，注意它的攻击预警';if(this.task.kind==='defend')return this.defendAt>=0?'守住设备并清除来袭变异者':'靠近目标并按 F 启动设备';return`按住 F ${this.task.name}`;}
 interact(dt:number){if(this.sim.state!=='playing'||this.sim.player.hp<=0)return;if(!this.flags.has(`record:${this.sector.id}`)&&distance(this.sim.player,this.recordPosition)<3&&this.sim.visible(this.sim.player,this.recordPosition)){this.flags.add(`record:${this.sector.id}`);this.notice='现场记录已加入档案，按 J 阅读';this.revision++;this.checkpoint();return;}const down=this.companions.find(c=>c.hp<=0&&distance(c,this.sim.player)<2.5&&this.sim.visible(c,this.sim.player));if(down){down.revive+=dt;if(down.revive>=4){down.hp=40;down.revive=0;this.notice='队友已恢复行动';}return;}
  if(!this.task){if(distance(this.sim.player,this.sector.exit)<4){if(this.companions.some(c=>c.hp<=0||distance(c,this.sim.player)>12)){this.notice='等待全队靠近出口；可按 Q 恢复跟随';return;}this.nextSector();}return;}
  const task=this.task;if(distance(this.sim.player,task.position)>3||!this.sim.visible(this.sim.player,task.position)){this.holdTime=0;return;}if(['strike','boss','reach'].includes(task.kind))return;
  if(task.kind==='defend'){if(this.defendAt<0){this.defendAt=this.sim.time;this.supplyEncounter();this.triggered.add(`${task.id}:defend`);this.notice='设备已启动，保持在附近并清除威胁';}return;}
  if(this.sim.enemies.some(e=>!e.dormant&&e.hp>0&&distance(e,task.position)<5&&this.sim.visible(e,task.position))){this.notice='附近存在威胁，先清出操作空间';return;}
  this.holdTime+=dt;if(this.holdTime>=task.seconds)this.finishTask();
 }
 nextSector(){if(this.task||this.finished)return false;if(this.sectorIndex===sectors.length-1){this.finished=true;this.sim.state='won';this.checkpoint();return true;}const carry=this.snapshot().sim;this.loadSector(this.sectorIndex+1,this.sim.loadout,carry);this.checkpoint();return true;}
 step(dt:number,input:Vec,interacting=false){if(this.sim.state!=='playing')return;dt=Math.min(dt,.05);this.elapsed+=dt;this.dangerTime+=dt;this.sim.friendlyTargets=this.companions;
  const task=this.task;
  for(const e of this.sim.enemies){if(e.mutation==='portBoss'&&e.hp<e.maxHp*.5)e.behavior='charge';if(e.mutation==='caller'&&!e.dormant&&!e.alerted){e.alerted=true;let awakened=0;for(const other of this.sim.enemies)if(other.dormant&&awakened<3&&distance(e,other)<26&&this.sim.visible(e,other)){other.dormant=false;awakened++;};this.notice='呼号者正在惊动附近变异者';}}
  for(const e of this.sim.enemies)if(e.dormant&&distance(e,this.sim.player)<14&&this.sim.visible(e,this.sim.player))e.dormant=false;
  if(task&&distance(this.sim.player,task.position)<19&&!this.triggered.has(task.id)){
   this.triggered.add(task.id);
   for(const e of this.sim.enemies)if((e as Enemy&{group:number}).group===this.taskIndex)e.dormant=false;
   if(task.kind==='boss'){this.supplyEncounter();const mutation:Mutation=this.sector.chapter===5?'railBoss':this.sector.chapter===12?'labBoss':'portBoss';const spec=mutationSpecs[mutation];let p={...task.position};if(this.sim.blocked(p,1.25))p={x:0,z:task.position.z};const e=this.sim.addEnemy('boss',p);e.hp=e.maxHp=spec.hp;e.mutation=mutation;e.behavior=mutation==='railBoss'?'charge':mutation==='labBoss'?'burst':'slam';e.modifiers={speed:spec.speed,damage:spec.damage,range:mutation==='labBoss'?15:mutation==='railBoss'?11:5,windup:1.25,cooldown:3.5};}
  }
  if(task?.kind==='defend'&&this.defendAt>=0){for(const wave of [1,2])if(this.sim.time-this.defendAt>=wave*8&&!this.triggered.has(`${task.id}:wave-${wave}`)){this.triggered.add(`${task.id}:wave-${wave}`);this.spawnGroup(this.taskIndex,4+wave*2);}}
  this.shareSupplies();this.sim.step(dt,this.sim.player.hp>0?input:{x:0,z:0});this.updateCompanions(dt);this.updateStrikes();this.updateExploration();
  if((this.sim.state as string)==='lost'&&(this.sim.player.hp>0||this.companions.some(c=>c.hp>0)))this.sim.state='playing';
  if(this.radio.length){this.radio[0].remaining-=dt;if(this.radio[0].remaining<=0)this.radio.shift();}
  if(this.task===task&&task&&this.sim.player.hp>0){if(task.kind==='reach'&&distance(this.sim.player,task.position)<3){if(task.effect!=='ending'||(this.companions.length===3&&this.companions.every(c=>c.hp>0&&distance(c,this.sim.player)<12)))this.finishTask();else this.notice='等待全队到达登机点，先救援倒地队员';}else if(task.kind==='boss'&&this.triggered.has(task.id)&&!this.sim.enemies.some(e=>e.kind==='boss'&&e.hp>0))this.finishTask();else if(task.kind==='defend'&&this.defendAt>=0&&this.sim.time-this.defendAt>=task.seconds&&!this.sim.enemies.some(e=>!e.dormant&&e.hp>0))this.finishTask();}
  if(interacting)this.interact(dt);else this.holdTime=0;if(this.pendingCheckpoint)this.checkpoint();
  if(this.sim.player.hp<=0&&!this.companions.some(c=>c.hp>0))this.sim.state='lost';
 }
}
