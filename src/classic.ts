import * as T from 'three';
import { createModularActor as createActor } from './modular-actor';
import { createOutfitController } from './outfit-panel';
import { Simulation, type Vec } from './simulation';
import { missions, missionById, missionUnlocked, nextMission, parseProgress, recordMissionCompletion, PROGRESS_KEY, type Mission } from './campaign';
import { createMissionField } from './mission-field';
import { loadModels, createEnemyField, type ModelLibrary } from './models';
import { createFires } from './fire';
import { enemySpecs, type EnemyKind } from './enemies';
import { createCombatEffects } from './combat-effects';
import { createGunshot, loadGunshotSamples } from './gun-audio';
import { createAmmoAudio } from './ammo-audio';
import { createSupplyField } from './supplies';
import { createStreet } from './street';
import { shellMarkup, createHud, icon, openingPanel, pausedPanel, helpPanel, loadoutPanel, upgradePanel, resultPanel } from './ui';
import { defaultLoadout, weaponSpecs, attachmentSpecs, type WeaponId, type AttachmentSlot } from './weapons';
import { createGrenadeField } from './grenades';
import { createLoadoutPreview } from './loadout-preview';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=shellMarkup;
const $=(id:string)=>document.getElementById(id)!;
const overlay=$('overlay'),viewport=$('viewport'),stage=$('stage');
const pause=$('pause') as HTMLButtonElement,help=$('help') as HTMLButtonElement;
const drawHud=createHud(app);
const checkMode=import.meta.env.DEV?new URLSearchParams(location.search).get('check'):null;
const checking=checkMode==='stress'||checkMode==='combat'||checkMode==='weapons'||checkMode==='ammo'||checkMode==='campaign';
let completedMissions: string[] = [], campaignStatus = '';
try { completedMissions = parseProgress(localStorage.getItem(PROGRESS_KEY)); } catch { campaignStatus = '本机存储不可用，解锁仅在本次会话保留。'; }
let selectedMission: Mission = checking ? checkMode === 'campaign' ? missions[1] : missions[0] :
  missions.find((mission, index) => index > 0 && missionUnlocked(index, completedMissions) && !completedMissions.includes(mission.id)) ?? missions[missions.length - 1];
let selectedLoadout=defaultLoadout();
let sim=new Simulation(Math.random,selectedLoadout,selectedMission),actor:Awaited<ReturnType<typeof createActor>>|undefined;
let ready=false,previousState='',stored=false,runId=crypto.randomUUID();
let viewDistance=20,helpOpen=false,loadoutOpen=false,resumeAfterHelp=false,graphicsLost=false;
let loadingText='正在部署装备…',loadingFailed=false,recordStatus='正在保存成绩…';
const keys=new Set<string>();
let audio:AudioContext|undefined;
let gunshot:ReturnType<typeof createGunshot>|undefined;
let ammoAudio:ReturnType<typeof createAmmoAudio>|undefined;
let ammoSoundCounts:Record<string,number>={};
let gunshotSamples:AudioBuffer[]=[];
function sound(freq:number,duration:number,volume:number) {
  if(!audio||audio.state!=='running')return;
  const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='triangle';
  oscillator.frequency.setValueAtTime(freq,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(freq*.3,audio.currentTime+duration);
  gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
let renderer:T.WebGLRenderer;
try {renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch {
  $('load-status').textContent='无法启用 WebGL2，请检查 Chrome 图形加速设置后重试。';throw new Error('WebGL2 初始化失败');
}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
viewport.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','三维场景：士兵、城市废墟、燃烧车辆和五类敌人');
const scene=new T.Scene();scene.background=new T.Color('#172326');scene.fog=new T.FogExp2('#233334',.019);
const camera=new T.PerspectiveCamera(40,1,.1,140);camera.position.set(13,24,5);camera.lookAt(0,.3,5);
scene.add(new T.HemisphereLight(0xd6e4df,0x394135,1.7));
const sun=new T.DirectionalLight(0xffedc8,2.5);sun.position.set(-12,24,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:80});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;scene.add(sun,sun.target);
const occluders:{mesh:T.Mesh;box:T.Box3}[]=[];
const occlusionRay=new T.Raycaster(),intersection=new T.Vector3();
let enemyField:ReturnType<typeof createEnemyField>|undefined, fires:ReturnType<typeof createFires>|undefined;
let grenadeField:Awaited<ReturnType<typeof createGrenadeField>>|undefined;
let equipmentPreview:ReturnType<typeof createLoadoutPreview>|undefined;
const combatEffects=createCombatEffects(scene);
const supplyField=createSupplyField(scene);
const missionField=createMissionField(scene);
let modelLibrary: ModelLibrary | undefined, streetGroup: T.Group | undefined;
let worldMission = '';
function configureWorld() {
  missionField.configure(sim);
  stage.style.setProperty('--accent', sim.mission.accent);
  if (!modelLibrary || worldMission === sim.mission.id) return;
  worldMission = sim.mission.id;
  for (const { mesh } of occluders) { scene.remove(mesh); (mesh.material as T.Material).dispose(); }
  occluders.length = 0;
  for (const prop of sim.mission.scenery) {
    const mesh = modelLibrary.create(prop.asset, true);
    mesh.position.set(prop.x, 0, prop.z); mesh.rotation.y = prop.yaw; scene.add(mesh); mesh.updateMatrixWorld(true);
    occluders.push({ mesh, box: new T.Box3().setFromObject(mesh) });
  }
  fires?.dispose(); fires = createFires(scene, sim.mission.scenery);
  streetGroup?.userData.setScenery(sim.mission.scenery);
  scene.background = new T.Color(sim.mission.sky); scene.fog = new T.FogExp2(sim.mission.fog, .019);
  sun.color.set(sim.mission.light);
  app.dataset.mission = sim.mission.id;
}
function completeMission() {
  if (checking || sim.state !== 'won') return;
  const result = recordMissionCompletion(sim.mission.id, completedMissions, () => localStorage);
  completedMissions = result.completed;
  campaignStatus = !result.saved ? '本机存储不可用，本次会话仍可进入下一关。' :
    nextMission(sim.mission.id) ? '下一关已解锁，进度已保存到本机。' : '战役已完成，可在选关中重玩。';
}
function selectMission(id: string) {
  if (!ready || graphicsLost) return;
  const index = missions.findIndex(mission => mission.id === id);
  if (!missionUnlocked(index, completedMissions) && !(checking && checkMode === 'campaign')) return;
  selectedMission = missionById(id); reset(false, true);
}
function syncMeshes(elapsed=0){
  enemyField?.update(sim,camera,elapsed);
  supplyField.update(sim);
  grenadeField?.update(sim);
  missionField.update(sim);
}
let damageTimer=0;
function effects(){for(const e of sim.effects){
  combatEffects.emit(e);
  if(e.type==='shot'){
    const distance=Math.hypot(e.x-sim.player.x,e.z-sim.player.z);
    // 相机始终从正 X 方向观察，画面右侧对应世界负 Z。
    gunshot?.play(e.hostile,distance,(sim.player.z-e.z)/Math.max(4,distance));
  }
  if(e.type==='hurt'){damageTimer=.2;sound(55,.15,.05);}
  if(e.type==='explosion')sound(78,.3,.13);
}for(const event of sim.audioEvents){ammoAudio?.play(event);if(import.meta.env.DEV)ammoSoundCounts[event]=(ammoSoundCounts[event]??0)+1;}}
function showRecordStatus(text:string,recordId=runId) {
  if(recordId!==runId)return;
  recordStatus=text;
  const target=document.getElementById('save-status');if(target)target.textContent=text;
}
async function saveRecord(){
  if(stored)return;stored=true;
  if(checking){showRecordStatus('验收模式不保存成绩。');return;}
  const record={id:runId,time:Date.now(),mission:sim.mission.id,duration:sim.time,kills:sim.kills,level:sim.level,objectives:sim.objectives.filter(objective=>objective.completed).length,won:sim.state==='won'};
  try{
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('broken-frontier',1);request.onupgradeneeded=()=>request.result.createObjectStore('training',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('training','readwrite');tx.objectStore('training').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});
    showRecordStatus('成绩已保存到本机。',record.id);
  }catch{showRecordStatus('成绩未保存，仍可重新部署。',record.id);}
}
function reset(toEquipment=false,toMenu=false){
  if(!ready||graphicsLost)return;
  gunshot?.stop();ammoAudio?.stop();ammoSoundCounts={};
  benchmarkFrames=0;benchmarkSeconds=0;benchmarkSamples.length=0;keys.clear();combatEffects.clear();damageTimer=0;
  helpOpen=false;loadoutOpen=false;resumeAfterHelp=false;sim=new Simulation(Math.random,selectedLoadout,selectedMission);configureWorld();runId=crypto.randomUUID();stored=false;recordStatus='正在保存成绩…';
  prepareInspection();if(toEquipment)loadoutOpen=true;else if(!toMenu)sim.start();actor?.update(sim,0);previousState='';syncMeshes();drawHud(sim);updateOverlay();
}
function startRun(){
  if(!ready||graphicsLost)return;
  if(!audio){audio=new AudioContext();gunshot=createGunshot(audio,gunshotSamples);ammoAudio=createAmmoAudio(audio);}
  void audio.resume();loadoutOpen=false;prepareInspection();sim.start();keys.clear();actor?.update(sim,0);drawHud(sim);updateOverlay();
}
function configureEquipment(weapon?: WeaponId, slot?: AttachmentSlot) {
  if(sim.state!=='ready'||!ready)return;
  const next=sim.loadout;
  if(weapon)next.weapon=weapon;
  if(slot)next.attachments=next.attachments.includes(slot)?next.attachments.filter(value=>value!==slot):[...next.attachments,slot];
  sim.configureLoadout(next);selectedLoadout=sim.loadout;actor?.update(sim,0);drawHud(sim);previousState='';updateOverlay();
  overlay.querySelector<HTMLButtonElement>(slot?`[data-attachment="${slot}"]`:`[data-weapon="${weapon}"]`)?.focus({preventScroll:true});
}
function throwGrenade() { if(sim.throwGrenade()){sound(230,.08,.04);drawHud(sim);} }
function toggleHelp(){
  if(graphicsLost)return;
  keys.clear();
  if(helpOpen){helpOpen=false;if(resumeAfterHelp&&sim.state==='paused')sim.togglePause();resumeAfterHelp=false;}
  else{resumeAfterHelp=sim.state==='playing';if(resumeAfterHelp)sim.togglePause();helpOpen=true;}
  previousState='';updateOverlay();
}
function updateOverlay(){
  const screen=graphicsLost?'graphics-lost':helpOpen?'help':loadoutOpen?'loadout':sim.state;
  if(previousState===screen)return;
  previousState=screen;stage.dataset.screen=screen;
  if(screen!=='playing'){gunshot?.stop();ammoAudio?.stop();}
  pause.disabled=!ready||helpOpen||graphicsLost||['ready','won','lost','upgrade'].includes(sim.state);
  const paused=sim.state==='paused';
  pause.innerHTML=icon(paused?'play':'pause');pause.setAttribute('aria-label',paused?'继续':'暂停');pause.title=paused?'继续（Esc）':'暂停（Esc）';
  help.disabled=graphicsLost;help.setAttribute('aria-expanded',String(helpOpen));
  // 菜单打开时把键盘焦点留在对话框内，战斗时回到画布。
  help.tabIndex=pause.tabIndex=screen==='playing'?0:-1;
  if(screen==='playing'){overlay.classList.add('hidden');viewport.focus({preventScroll:true});return;}
  keys.clear();overlay.classList.remove('hidden');overlay.scrollTop=0;
  if(graphicsLost){
    overlay.setAttribute('aria-label','图形设备断开');
    overlay.innerHTML='<div class="panel"><div class="kicker">行动已暂停</div><h2>图形设备断开</h2><button class="primary" id="reload">重新载入</button></div>';
    $('reload').onclick=()=>location.reload();
  }else if(helpOpen){
    overlay.setAttribute('aria-label','操作帮助');overlay.innerHTML=helpPanel(sim.mission);$('close-help').onclick=toggleHelp;$('help-done').onclick=toggleHelp;
  }else if(loadoutOpen){
    overlay.setAttribute('aria-label','战前装备配置');overlay.innerHTML=loadoutPanel(sim.loadout);
    if(equipmentPreview)equipmentPreview.mount($('equipment-preview'));else $('equipment-preview').textContent='三维预览暂不可用，仍可配置装备。';
    $('close-loadout').onclick=()=>{loadoutOpen=false;previousState='';updateOverlay();};$('start-equipped').onclick=startRun;
    overlay.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(button=>button.onclick=()=>configureEquipment(button.dataset.weapon as WeaponId));
    overlay.querySelectorAll<HTMLButtonElement>('[data-attachment]').forEach(button=>button.onclick=()=>configureEquipment(undefined,button.dataset.attachment as AttachmentSlot));
  }else if(sim.state==='ready'){
    overlay.setAttribute('aria-label','部署行动');
    const label=checking?checkMode==='stress'?'开始压力验收':checkMode==='weapons'?'开始开火验收':checkMode==='ammo'?'开始弹药验收':checkMode==='campaign'?'开始战役验收':'开始敌人验收':'部署行动';
    overlay.innerHTML=openingPanel(ready,loadingFailed,label,sim.mission,completedMissions);$('load-status').textContent=[loadingText,campaignStatus].filter(Boolean).join(' · ');$('load-status').dataset.error=String(loadingFailed);
    $('start').onclick=loadingFailed?()=>location.reload():startRun;
    overlay.querySelectorAll<HTMLButtonElement>('[data-mission]').forEach(button => button.onclick = () => selectMission(button.dataset.mission!));
    $('open-loadout').onclick=()=>{if(ready){loadoutOpen=true;previousState='';updateOverlay();}};
    $('loadout-summary').textContent=`${weaponSpecs[sim.weapon].name} · ${sim.loadout.attachments.map(slot=>attachmentSpecs[slot].name).join(' / ')||'标准配置'} · 手雷 3 枚`;
  }else if(sim.state==='paused'){
    overlay.setAttribute('aria-label','行动暂停');overlay.innerHTML=pausedPanel();
    $('resume').onclick=()=>{sim.togglePause();updateOverlay();};$('restart').onclick=()=>reset();$('change-equipment').onclick=()=>reset(true);
  }else if(sim.state==='upgrade'){
    overlay.setAttribute('aria-label','选择战场强化');overlay.innerHTML=upgradePanel(sim);
    overlay.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.onclick=()=>{sim.choose(Number(button.dataset.choice));drawHud(sim);updateOverlay();});
  }else{
    if(!stored)completeMission();
    overlay.setAttribute('aria-label','行动结果');overlay.innerHTML=resultPanel(sim);
    $('campaign-status').textContent=checking?'验收模式不保存战役进度。':sim.state==='won'?campaignStatus:'已完成的关卡进度保留，可重试本关。';
    const next=document.getElementById('next-mission');if(next)next.onclick=()=>{const mission=nextMission(sim.mission.id);if(mission)selectMission(mission.id);};$('save-status').textContent=recordStatus;
    $('restart').onclick=()=>reset();$('change-equipment').onclick=()=>reset(true);void saveRecord();
  }
  const campaignMenu=document.getElementById('campaign-menu');if(campaignMenu)campaignMenu.onclick=()=>reset(false,true);
  const openHelp=document.getElementById('open-help');if(openHelp)openHelp.onclick=toggleHelp;
  overlay.querySelector<HTMLButtonElement>(screen==='ready'?'#start:not(:disabled)':'button:not(:disabled)')?.focus({preventScroll:true});
}
pause.onclick=()=>{keys.clear();sim.togglePause();updateOverlay();};help.onclick=toggleHelp;
$('reload-weapon').onclick=()=>{sim.requestReload();drawHud(sim);};
$('throw-grenade').onclick=throwGrenade;
window.addEventListener('keydown',e=>{
  if(e.code==='Tab'&&!overlay.classList.contains('hidden')){
    const buttons=Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first=buttons[0],last=buttons.at(-1),focused=document.activeElement;
    if(first&&(!overlay.contains(focused)||(e.shiftKey&&focused===first)||(!e.shiftKey&&focused===last))){e.preventDefault();(e.shiftKey?last:first)?.focus();}
    return;
  }
  if(graphicsLost)return;
  if(e.code==='KeyH'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();toggleHelp();return;}
  if(e.code==='Escape'&&!e.repeat){e.preventDefault();keys.clear();if(helpOpen)toggleHelp();else if(loadoutOpen){loadoutOpen=false;previousState='';updateOverlay();}else{sim.togglePause();updateOverlay();}return;}
  if(helpOpen)return;
  if(sim.state==='upgrade'&&!e.repeat&&/^(Digit|Numpad)[123]$/.test(e.code)){e.preventDefault();sim.choose(Number(e.code.at(-1))-1);drawHud(sim);updateOverlay();return;}
  if(sim.state==='playing'){
    if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey)throwGrenade();return;}
    if(e.code==='KeyR'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();sim.requestReload();drawHud(sim);return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    keys.add(e.code);
  }
});
window.addEventListener('keyup',e=>keys.delete(e.code));
function suspend(){keys.clear();resumeAfterHelp=false;gunshot?.stop();ammoAudio?.stop();if(sim.state==='playing')sim.togglePause();}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();suspend();graphicsLost=true;helpOpen=false;previousState='';updateOverlay();});
viewport.parentElement!.addEventListener('wheel',e=>{if(outfitController.isOpen()||!overlay.classList.contains('hidden'))return;e.preventDefault();viewDistance=T.MathUtils.clamp(viewDistance+e.deltaY*.015,5,24);},{passive:false});
function resize(){const stress=import.meta.env.DEV&&new URLSearchParams(location.search).get('check')==='stress';const w=stress?1920:viewport.clientWidth,h=stress?1080:viewport.clientHeight;if(stress)renderer.setPixelRatio(1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();app.dataset.renderSize=`${renderer.domElement.width}x${renderer.domElement.height}`;}new ResizeObserver(resize).observe(viewport);
function prepareInspection() {
  if(!checking||checkMode==='campaign')return;
  sim.player.hp=sim.player.maxHp=100000;sim.spawn=9999;sim.bossSpawned=true;
  if(checkMode==='stress')sim.damage=0;
  if(checkMode==='weapons'||checkMode==='ammo'){
    sim.damage=0;
    if(checkMode==='ammo'){
      sim.player.hp=sim.player.maxHp=100;
      sim.ammo=3;sim.reserve=0;
      sim.crates.push({id:sim.id++,x:3,z:5,rounds:72});
      sim.drops.push({id:sim.id++,x:-3,z:5,value:12,kind:'ammo'});
    }
    const target=sim.addEnemy('shooter',{x:0,z:-1});target.hp=target.maxHp=100000;target.attack=9999;
    return;
  }
  if(checkMode==='combat'){
    const positions=[{x:0,z:9},{x:2,z:3},{x:-2,z:0},{x:0,z:-4},{x:9,z:-4}];
    (['runner','shooter','pouncer','spitter','boss'] as EnemyKind[]).forEach((kind,index)=>sim.addEnemy(kind,positions[index]));return;
  }
  const kinds:EnemyKind[]=['runner','shooter','pouncer','spitter','boss'];
  let added=0;
  for(let z=-19;z<=20;z+=3.3)for(let x=-19;x<=20;x+=3.3){
    const kind=kinds[added%kinds.length];
    if(added>=(checkMode==='stress'?60:5))return;
    if(Math.hypot(x-sim.player.x,z-sim.player.z)<5||sim.blocked({x,z},enemySpecs[kind].radius))continue;
    sim.addEnemy(kind,{x,z});added++;
  }
}
const outfitController=createOutfitController({stage,overlay,getActor:()=>actor,getSim:()=>sim,ready:()=>ready,unavailable:()=>graphicsLost,synchronize:()=>{keys.clear();previousState='';updateOverlay();}});
function reportLoading(text:string){if(loadingFailed)return;loadingText=text;const target=document.getElementById('load-status');if(target)target.textContent=text;}
void Promise.all([createActor(reportLoading),loadModels(reportLoading),createStreet(renderer),loadGunshotSamples(import.meta.env.BASE_URL),createGrenadeField(scene)]).then(([result,library,street,samples,grenades])=>{
  grenadeField=grenades;
  gunshotSamples=samples;
  scene.add(street);app.dataset.street='imagegen-v1';
  actor=result;scene.add(actor.root);actor.update(sim,0);
  if(actor.previewModels){try{equipmentPreview=createLoadoutPreview(actor.previewModels);}catch(error){console.warn('三维装备预览暂不可用',error);}}
  modelLibrary=library;streetGroup=street;configureWorld();
  enemyField=createEnemyField(scene,library);ready=true;
  app.dataset.assets='ready';app.dataset.models='15';
  loadingText=checking?'验收模式 · 不保存成绩':'装备就绪';previousState='';updateOverlay();
}).catch(error=>{console.error(error);app.dataset.assets='failed';loadingFailed=true;loadingText='资源载入失败，请重试。';previousState='';updateOverlay();});
let last=performance.now(),accumulator=0,perfTime=0,frames=0,hudTime=0;
const samples:number[]=[],benchmarkSamples:number[]=[];let benchmarkFrames=0,benchmarkSeconds=0;
function render(now:number){
  requestAnimationFrame(render);const wallElapsed=(now-last)/1000,elapsed=Math.min(wallElapsed,.1);last=now;
  if(loadoutOpen&&!helpOpen&&!outfitController.isOpen())equipmentPreview?.render(sim.loadout,elapsed);
  if(sim.state==='playing'){
    accumulator+=elapsed;
    while(accumulator>=1/60&&sim.state==='playing'){
      const input:Vec={x:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),z:Number(keys.has('KeyA')||keys.has('ArrowLeft'))-Number(keys.has('KeyD')||keys.has('ArrowRight'))};
      // 相机从正 X 方向高位俯视，屏幕向右对应负 Z，屏幕向上对应负 X。
      sim.step(1/60,input);combatEffects.step(1/60);if(checkMode==='stress')sim.choose(0);actor?.update(sim,1/60);effects();accumulator-=1/60;
    }
  }else accumulator=0;
  syncMeshes(elapsed);
  damageTimer-=elapsed;document.querySelector('.stage')!.classList.toggle('damage',damageTimer>0);
  const focus=new T.Vector3(sim.player.x,0,sim.player.z);
  camera.position.lerp(focus.clone().add(new T.Vector3(viewDistance*.65,viewDistance*1.2,0)),1-Math.exp(-elapsed*7));camera.lookAt(focus.clone().add(new T.Vector3(0,.3,0)));
  sun.position.set(sim.player.x-12,24,sim.player.z+8);sun.target.position.copy(focus);
  updateOverlay();
  hudTime+=elapsed;if(hudTime>.1){hudTime=0;drawHud(sim);}
  const sightTarget=focus.clone().add(new T.Vector3(0,1,0));
  occlusionRay.set(camera.position,sightTarget.clone().sub(camera.position).normalize());occlusionRay.far=camera.position.distanceTo(sightTarget);
  for(const {mesh,box} of occluders){
    const hit=occlusionRay.ray.intersectBox(box,intersection),faded=hit!==null&&camera.position.distanceTo(intersection)<occlusionRay.far;
    const material=mesh.material as T.Material;
    material.transparent=faded;material.opacity=faded?.16:1;material.depthWrite=!faded;
  }
  fires?.update(sim.time,camera);
  combatEffects.render(camera,sim.bullets);
  if(!outfitController.update(elapsed))renderer.render(scene,camera);frames++;perfTime+=wallElapsed;samples.push(wallElapsed*1000);
  if(checkMode==='stress'&&sim.state==='playing'&&sim.time>5){benchmarkFrames++;benchmarkSeconds+=wallElapsed;if(benchmarkSamples.length<36000)benchmarkSamples.push(wallElapsed*1000);}if(samples.length>180)samples.shift();
  if(perfTime>=1){const ordered=[...samples].sort((a,b)=>a-b);
    if(benchmarkFrames){const sorted=[...benchmarkSamples].sort((a,b)=>a-b);app.dataset.benchmarkFps=(benchmarkFrames/benchmarkSeconds).toFixed(2);app.dataset.benchmarkP95=String(sorted[Math.floor(sorted.length*.95)]??0);app.dataset.benchmarkSeconds=benchmarkSeconds.toFixed(2);}
    if(actor)app.dataset.pose=JSON.stringify(actor.measurePose());
    if(import.meta.env.DEV)app.dataset.combatEffects=JSON.stringify(combatEffects.stats());
    if(import.meta.env.DEV)app.dataset.enemyDeaths=JSON.stringify(enemyField?.deathStats());
    if(import.meta.env.DEV)app.dataset.ammunition=JSON.stringify({ammo:sim.ammo,reserve:sim.reserve,reload:sim.reload,fired:sim.roundsFired,collected:sim.roundsCollected,crates:sim.crates.filter(c=>c.rounds>0).length,opened:sim.cratesOpened,views:supplyField.stats(),sounds:ammoSoundCounts,voices:ammoAudio?.activeVoices??0});
    app.dataset.state=sim.state;app.dataset.position=`${sim.player.x.toFixed(2)},${sim.player.z.toFixed(2)}`;app.dataset.time=sim.time.toFixed(2);app.dataset.enemies=String(sim.enemies.length);app.dataset.health=sim.player.hp.toFixed(1);app.dataset.kinds=[...new Set(sim.enemies.map(e=>e.kind))].sort().join(',');app.dataset.drawCalls=String(renderer.info.render.calls);app.dataset.triangles=String(renderer.info.render.triangles);app.dataset.fps=String(Math.round(frames/perfTime));app.dataset.p95=String(ordered[Math.floor(ordered.length*.95)]??0);frames=0;perfTime=0;
  }
}
// 仅开发验收入口允许读取当前模拟；生产构建不包含此入口，也不写验收成绩。
if(import.meta.env.DEV && checkMode==='campaign') {
  Object.assign(window, { campaignInspection: { simulation: () => sim, select: (id: string) => selectMission(id) } });
}
requestAnimationFrame(render);
