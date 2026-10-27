import * as T from 'three';
import { StorySession, readCheckpoint, writeCheckpoint, PROGRESS_KEY, type StorySnapshot } from './story';
import { chapters, sectors, members, type MemberId } from './story-data';
import { createModularActor } from './modular-actor';
import { loadModels } from './models';
import { createStoryView, createMutantView, createStrikeView, createThreatView } from './story-view';
import { createStoryAudio } from './story-audio';
import { createCombatEffects } from './combat-effects';
import { createSupplyField } from './supplies';
import { createGrenadeField } from './grenades';
import { createGunshot, loadGunshotSamples } from './gun-audio';
import { createAmmoAudio } from './ammo-audio';
import { createLoadoutPreview } from './loadout-preview';
import { icon, loadoutPanel, upgradePanel, formatTime } from './ui';
import { defaultLoadout, type Loadout, type WeaponId, type AttachmentSlot } from './weapons';
import { presetOutfit, readOutfit, saveOutfit, outfitPresets, outfitPresetLabels, type OutfitPreset } from './outfit';
import { distance, type Vec } from './simulation';
import { storyHudMarkup, createStoryHud } from './story-hud';
import './style.css';
import './story.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
document.title='静默回声 · 格雷文港行动';
app.innerHTML=`<main class="stage story-stage" id="stage" data-screen="menu" data-backdrop="title"><div class="canvas-wrap" id="viewport"></div><img class="title-backdrop" id="title-backdrop" src="${import.meta.env.BASE_URL}images/menu/start-background-v1.png" alt="" fetchpriority="high" draggable="false">${storyHudMarkup}<div id="story-overlay" class="overlay story-overlay" role="dialog" aria-modal="true"></div></main>`;
const $=(id:string)=>document.getElementById(id)!;
const overlay=$('story-overlay'),stage=$('stage'),viewport=$('viewport');
const hud=createStoryHud(document.querySelector<HTMLElement>('.story-hud')!);
let saved:StorySnapshot|undefined,saveMessage='',furthest=0;
try{const result=readCheckpoint(localStorage);saved=result.snapshot;saveMessage=['已找到本机检查点','尚无可恢复的战役检查点'].includes(result.message)?'':result.message;furthest=Number(localStorage.getItem(PROGRESS_KEY))||0;}catch{saveMessage='本机存储不可用，本次会话仍可游玩';}
let loadout:Loadout=defaultLoadout('rifle'),session=new StorySession(loadout);
type Mode='menu'|'chapters'|'settings'|'help'|'new-confirm'|'playing'|'pause'|'equipment'|'journal'|'strike'|'upgrade'|'lost'|'ending'|'loading-error';
let mode:Mode='menu',returnMode:Mode='menu',ready=false,replay=false,loading='正在准备行动资源…',viewDistance=22,muted=false;
let menuSelection='continue-story';
let actor:Awaited<ReturnType<typeof createModularActor>>|undefined;
const companionActors=new Map<MemberId,ReturnType<Awaited<ReturnType<typeof createModularActor>>['createPreview']>>();
let sceneView:ReturnType<typeof createStoryView>|undefined;
let grenadeField:Awaited<ReturnType<typeof createGrenadeField>>|undefined;
let preview:ReturnType<typeof createLoadoutPreview>|undefined;
let gunshot:ReturnType<typeof createGunshot>|undefined,ammoAudio:ReturnType<typeof createAmmoAudio>|undefined;
const audio=createStoryAudio(),keys=new Set<string>();
let strikePoint:Vec|undefined,rememberedRadio='',rememberedSector='',stepsAt=0,lastRevision=0,lastSaved='';
const scene=new T.Scene();scene.background=new T.Color('#253735');
function initializeRenderer(){try{return new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(error){app.innerHTML='<main class="story-overlay"><section class="panel"><h1>无法启动三维画面</h1><p>请在支持 WebGL2 的桌面浏览器中开启图形加速后重新载入。</p></section></main>';throw error;}}
const renderer=initializeRenderer();renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;renderer.outputColorSpace=T.SRGBColorSpace;viewport.append(renderer.domElement);
const camera=new T.PerspectiveCamera(43,1,.1,170);camera.position.set(14,27,session.sim.player.z);camera.lookAt(0,0,session.sim.player.z);
scene.add(new T.HemisphereLight('#cbded9','#354640',2));
const sun=new T.DirectionalLight('#e7e6c7',2.5);sun.position.set(15,34,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:100});sun.shadow.normalBias=.04;scene.add(sun,sun.target);
const effects=createCombatEffects(scene),supplyField=createSupplyField(scene),strikes=createStrikeView(scene),threats=createThreatView(scene);let mutants:ReturnType<typeof createMutantView>|undefined;
function persist(){if(!session.needsSave)return;session.needsSave=false;const snapshot=session.checkpoint();session.needsSave=false;if(replay){lastSaved='章节重玩不会覆盖主线检查点';return;}try{saved=snapshot;furthest=Math.max(furthest,session.sectorIndex);const ok=writeCheckpoint(snapshot,localStorage);lastSaved=ok?'检查点已保存':'写入失败；检查点保留于本次会话';if(ok){saved=snapshot;furthest=Math.max(furthest,session.sectorIndex);}}catch{saved=snapshot;furthest=Math.max(furthest,session.sectorIndex);lastSaved='存储不可用；检查点保留于本次会话';}hud.flash(lastSaved);}
function button(id:string,fn:()=>void){const node=document.getElementById(id);if(node)node.onclick=fn;}
function setMode(value:Mode){
 mode=value;
 const hud=document.querySelector<HTMLElement>('.story-hud')!;
 hud.hidden=mode!=='playing';hud.inert=hud.hidden;
 const titleScreen=['menu','chapters','settings','help','new-confirm'].includes(mode)||(mode==='equipment'&&returnMode==='menu');
 $('title-backdrop').hidden=!titleScreen;stage.dataset.backdrop=titleScreen?'title':'game';
 keys.clear();preview?.dispose();preview=undefined;overlay.hidden=mode==='playing';overlay.inert=overlay.hidden;
 stage.dataset.screen=mode;renderOverlay();
 if(mode==='playing')audio.resume();else audio.suspend();
 if(mode==='pause')wirePauseNavigation();
}
function requestNewGame(){if(saved)setMode('new-confirm');else begin();}
function selectMenuButton(id:string){menuSelection=id;overlay.querySelectorAll<HTMLButtonElement>('.title-choice').forEach(b=>b.classList.toggle('is-selected',b.id===id));}

function begin(resume=false,chapter?:number){if(resume&&saved){session=new StorySession(loadout,saved);replay=false;}else{session=new StorySession(loadout);if(chapter!==undefined){session.startChapter(chapter,loadout);replay=true;}else replay=false;}effects.clear();hud.reset();audio.start();setMode('playing');session.needsSave=true;persist();}
function renderOverlay(){if(mode==='playing')return;
 if(mode==='menu'){
 overlay.innerHTML=`<section class="title-screen" aria-labelledby="game-title"><header class="title-brand"><h1 id="game-title">静默回声</h1><p>SILENT ECHO</p></header><nav class="title-nav" aria-label="主菜单"><button id="continue-story" class="title-choice" ${!ready||!saved?'disabled':''}>继续游戏</button><button id="new-story" class="title-choice" ${!ready?'disabled':''}>开始新游戏</button><button id="chapters" class="title-choice" ${!ready?'disabled':''}>章节选择</button><button id="equipment" class="title-choice" ${!ready?'disabled':''}>装备整备</button><button id="settings" class="title-choice">设置</button></nav><footer class="title-footer"><span>↑ ↓ 选择</span><span>Enter 确认</span><span class="title-status" id="loading-label" role="status">${ready?(saveMessage||''): '资源加载中…'}</span></footer></section>`;
 button('continue-story',()=>begin(true));button('new-story',requestNewGame);button('chapters',()=>setMode('chapters'));button('equipment',()=>{returnMode='menu';setMode('equipment');});button('settings',()=>setMode('settings'));
 const options=Array.from(overlay.querySelectorAll<HTMLButtonElement>('.title-choice:not(:disabled)'));
 selectMenuButton(options.find(b=>b.id===menuSelection)?.id??options[0]?.id??'');
 for(const b of options){b.onfocus=()=>selectMenuButton(b.id);b.onpointerenter=()=>{selectMenuButton(b.id);b.focus({preventScroll:true});};}
 }else if(mode==='chapters'){
 overlay.innerHTML=`<section class="title-subpage chapter-page"><header class="title-subpage-heading"><div><p class="menu-eyebrow">SILENT ECHO</p><h2>章节选择</h2></div><button id="back-menu" class="menu-back">返回</button></header><p class="menu-description">重走已经抵达的路线，主线进度会被保留。</p><div class="chapter-grid">${chapters.map((c,i)=>`<button data-chapter="${i}" ${!ready||c.sectors[0].index>furthest?'disabled':''}><span>${String(i+1).padStart(2,'0')}</span><strong>${c.name}</strong><small>${c.sectors[0].index<=furthest?'重玩章节':'尚未抵达'}</small></button>`).join('')}</div></section>`;
 button('back-menu',()=>setMode('menu'));overlay.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach(b=>b.onclick=()=>begin(false,Number(b.dataset.chapter)));
 }else if(mode==='settings'){
 overlay.innerHTML=`<section class="title-subpage settings-page"><header class="title-subpage-heading"><div><p class="menu-eyebrow">SILENT ECHO</p><h2>设置</h2></div><button id="back-menu" class="menu-back">返回</button></header><div class="settings-list"><button id="mute" aria-pressed="${!muted}"><span>游戏声音</span><strong>${muted?'关闭':'开启'}</strong></button><button id="help"><span>操作说明</span><span>查看</span></button><a href="?mode=classic"><span>经典演练</span><span>进入</span></a></div></section>`;
 button('back-menu',()=>setMode('menu'));button('mute',()=>{muted=!muted;audio.setMuted(muted);renderOverlay();$('mute').focus({preventScroll:true});});button('help',()=>setMode('help'));
 }else if(mode==='help'){
 overlay.innerHTML=`<section class="title-subpage settings-page"><header class="title-subpage-heading"><div><p class="menu-eyebrow">SILENT ECHO</p><h2>操作说明</h2></div><button id="back-settings" class="menu-back">返回</button></header><dl class="controls-list">${[['WASD / 方向键','移动 · 自动索敌射击'],['F','按住交互'],['空格','投掷手雷'],['R','换弹'],['C','标定空袭'],['Q','小队跟随 / 留守'],['J','查看档案'],['滚轮','镜头缩放'],['Esc','暂停 / 返回']].map(([key,label])=>`<div><dt>${key}</dt><dd>${label}</dd></div>`).join('')}</dl></section>`;
 button('back-settings',()=>setMode('settings'));
 }else if(mode==='new-confirm'){
 overlay.innerHTML=`<section class="title-subpage confirm-page"><p class="menu-eyebrow">新的行动</p><h2>重新进入格雷文港？</h2><p class="menu-description">新的战役将替换当前检查点。已解锁章节会保留。</p><div class="button-row"><button class="menu-back" id="cancel-new">返回</button><button class="menu-confirm" id="confirm-new">开始新游戏</button></div></section>`;
 button('cancel-new',()=>setMode('menu'));button('confirm-new',()=>begin());
 }else if(mode==='pause'){
 overlay.innerHTML=`<section class="pause-screen" aria-labelledby="pause-heading"><div class="pause-content"><p class="pause-location">${String(session.sector.chapter+1).padStart(2,'0')} · ${session.chapter.name} / ${session.sector.name}</p><h2 id="pause-heading">已暂停</h2><p class="pause-objective">${session.task?.name??'前往出口'}</p>${/失败|不可用/.test(lastSaved)?'<p class="pause-save-warning" role="alert">检查点暂存于本次会话，刷新可能丢失进度。</p>':''}<nav class="pause-nav" aria-label="暂停菜单"><button class="pause-choice is-selected" id="resume">继续行动</button><button class="pause-choice" id="retry">重试检查点</button><button class="pause-choice" id="equipment">装备整备</button><button class="pause-choice" id="menu">返回主菜单</button></nav></div><p class="pause-help"><kbd>Esc</kbd> 返回游戏</p></section>`;
 button('resume',()=>setMode('playing'));button('retry',()=>{session.restartCheckpoint();effects.clear();hud.reset();setMode('playing');});button('menu',()=>setMode('menu'));button('equipment',()=>{returnMode='pause';setMode('equipment');});
 }else if(mode==='equipment'){
 overlay.innerHTML=`<section class="story-equipment">${loadoutPanel(loadout)}<div class="story-outfits"><span>角色外观</span>${outfitPresets.map(id=>`<button data-outfit="${id}" class="outline">${outfitPresetLabels[id]}</button>`).join('')}<p>${returnMode==='pause'?'行动中仅能调整外观；武器修改将在新战役或章节重玩时使用。':'装备配置用于下一次部署。'}</p></div></section>`;
 button('close-loadout',()=>setMode(returnMode));button('start-equipped',()=>{if(returnMode==='menu')requestNewGame();else setMode('pause');});
 overlay.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(b=>{b.disabled=returnMode==='pause';b.onclick=()=>{loadout={weapon:b.dataset.weapon as WeaponId,attachments:[]};renderOverlay();};});
 overlay.querySelectorAll<HTMLButtonElement>('[data-attachment]').forEach(b=>{b.disabled||=returnMode==='pause';b.onclick=()=>{const slot=b.dataset.attachment as AttachmentSlot;loadout={...loadout,attachments:loadout.attachments.includes(slot)?loadout.attachments.filter(x=>x!==slot):[...loadout.attachments,slot]};renderOverlay();};});
 overlay.querySelectorAll<HTMLButtonElement>('[data-outfit]').forEach(b=>b.onclick=()=>{const o=presetOutfit(b.dataset.outfit as OutfitPreset);saveOutfit(o);actor?.setOutfit(o);});
 if(actor){preview?.dispose();preview=createLoadoutPreview(actor.previewModels!);const mount=$('equipment-preview');preview.mount(mount);}
 }else if(mode==='journal'){
 overlay.innerHTML=`<section class="story-journal"><header><div><div class="kicker">行动档案 / 格雷文港</div><h2>每个信号，都留下了痕迹。</h2></div><button id="close-journal" class="outline">返回行动</button></header><div class="story-journal-columns"><section><h3>现场记录</h3><p>${session.flags.has(`record:${session.sector.id}`)?session.sector.record:'尚未找到当前分区的现场记录。探索侧路，靠近记录箱按 F 收集。'}</p>${sectors.filter(s=>s.id!==session.sector.id&&session.flags.has(`record:${s.id}`)).map(s=>`<p><strong>${s.name}</strong><br>${s.record}</p>`).join('')}<h3>证据链</h3><p>${session.flags.has('evidence-time')?'✓ 已取得早于公开事故的入城记录':'尚未取得原始入城记录'}</p><p>${session.flags.has('evidence-neural')?'✓ 已取得被排除的神经损伤数据':'尚未取得原始医疗数据'}</p><p>${session.flags.has('evidence-extraction')?'✓ 已取得被压下的撤离评估':'尚未取得撤离评估原件'}</p></section><section><h3>无线电记录</h3>${session.transcript.slice().reverse().map(l=>`<p><strong>${l.speaker}</strong><br>${l.text}</p>`).join('')}</section></div></section>`;
 button('close-journal',()=>setMode('playing'));
 }else if(mode==='strike'){
 const p=strikePoint??session.task?.position??session.sim.player;const reason=session.canStrike(p,session.task?.kind==='strike');
 overlay.innerHTML=`<section class="story-tactical"><header><div><div class="kicker">空中支援 / 地面标定</div><h2>确认打击范围</h2><p>点击已探索区域选择坐标。橙色范围为爆炸区，蓝色为友军。</p></div><button id="cancel-strike" class="outline">取消</button></header><svg id="strike-map" viewBox="${session.sim.player.x-32} ${session.sim.player.z-32} 64 64" role="img" aria-label="空袭目标地图">${mapMarkup(true)}<circle cx="${p.x}" cy="${p.z}" r="9" fill="#e99d6430" stroke="#ffb478" stroke-width=".4"/></svg><div class="button-row"><button id="confirm-strike" class="primary" ${reason?'disabled':''}>确认空袭</button><p>${reason||'坐标确认，打击将在三点五秒后到达。'}</p></div><small>任务支援单独预留。自由支援剩余 ${session.airCharges} 次。</small></section>`;
 button('cancel-strike',()=>setMode('playing'));button('confirm-strike',()=>{if(session.callStrike(p))setMode('playing');});const map=$('strike-map') as unknown as SVGSVGElement;map.onclick=e=>{const point=map.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const at=point.matrixTransform(map.getScreenCTM()!.inverse());strikePoint={x:at.x,z:at.y};renderOverlay();};
 }else if(mode==='upgrade'){
 overlay.innerHTML=upgradePanel(session.sim);overlay.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(b=>b.onclick=()=>{session.sim.choose(Number(b.dataset.choice));if(session.sim.state==='playing')setMode('playing');});
 }else if(mode==='lost'){
 overlay.innerHTML=`<section class="panel"><div class="kicker">行动中断</div><h2>信号消失了。</h2><p>从最近的检查点重新尝试。已保存的章节进度保留。</p><div class="button-row"><button id="retry" class="primary">重试检查点</button><button id="menu" class="outline">返回主菜单</button></div></section>`;button('retry',()=>{session.restartCheckpoint();effects.clear();setMode('playing');});button('menu',()=>setMode('menu'));
 }else if(mode==='ending'){
 overlay.innerHTML=`<section class="panel story-ending"><div class="kicker">格雷文港行动 / 已撤离</div><h1>静默之后，<br>有人回答。</h1><p>梅森·里德、格兰特·海斯、诺亚·皮尔斯、伊芙琳·肖，四人撤离。</p><p>城区持续投药已停止。原始样本、认知记录与撤离评估进入独立调查。那些未能离开的人，终于重新进入了真实的记录。</p><blockquote>“肖，这次你能听见我吗？”<br>“能。我们回去。”</blockquote><p class="status">完成16章 · 行动时间 ${formatTime(session.elapsed)} · 击倒 ${session.sim.kills}</p><div class="button-row"><button id="menu" class="primary">返回章节选择</button><button id="ending-journal" class="outline">查看行动记录</button></div></section>`;button('menu',()=>setMode('menu'));button('ending-journal',()=>setMode('journal'));
 }else{overlay.innerHTML=`<section class="panel"><h2>资源未能载入</h2><p>${loading}</p><button id="reload" class="primary">重新载入</button></section>`;button('reload',()=>location.reload());}
}
function mapMarkup(tactical=false){const s=session;let content=`<rect x="-28" y="${-s.sector.extent}" width="56" height="${s.sector.extent*2}" fill="#102325"/>`;for(const cell of s.explored){const [x,z]=cell.split(',').map(Number);content+=`<rect x="${x*6}" y="${z*6}" width="6" height="6" fill="#2e4847"/>`;}
 for(const wall of s.sim.walls){if(wall.w>85||wall.d>85)continue;const visible=s.explored.has(`${Math.floor(wall.x/6)},${Math.floor(wall.z/6)}`);if(visible)content+=`<rect x="${wall.x-wall.w/2}" y="${wall.z-wall.d/2}" width="${wall.w}" height="${wall.d}" fill="#74817a"/>`;}
 if(s.task)content+=`<circle cx="${s.task.position.x}" cy="${s.task.position.z}" r="1.7" fill="#e5c789"/>`;else content+=`<rect x="-3" y="${s.sector.exit.z-1}" width="6" height="2" fill="#c5dbb8"/>`;
 if(tactical)for(const t of s.sector.tasks.slice(s.taskIndex))if(t.kind==='recover')content+=`<circle cx="${t.position.x}" cy="${t.position.z}" r="5" fill="none" stroke="#c18386" stroke-width=".4"/>`;
 for(const c of s.companions)content+=`<circle cx="${c.x}" cy="${c.z}" r="1.3" fill="${c.hp>0?'#88bac9':'#dd8b75'}"/>`;
 return content+`<circle cx="${s.sim.player.x}" cy="${s.sim.player.z}" r="1.5" fill="#eef6df"/>`;
}
function draw(){const s=session,sim=s.sim;hud.update(s,mapMarkup());
 const radio=s.radio[0];if(radio&&rememberedRadio!==radio.id){rememberedRadio=radio.id;audio.cue('radio');}
 if(import.meta.env.DEV){app.dataset.sector=s.sector.id;app.dataset.chapter=String(s.sector.chapter+1);app.dataset.state=mode;app.dataset.task=s.task?.id??'exit';app.dataset.health=String(sim.player.hp);app.dataset.enemies=String(sim.enemies.length);app.dataset.drawCalls=String(renderer.info.render.calls);}
}
function wirePauseNavigation(){overlay.querySelectorAll<HTMLButtonElement>('.pause-choice').forEach(b=>{const select=()=>{overlay.querySelectorAll('.pause-choice').forEach(n=>n.classList.toggle('is-selected',n===b));};b.onfocus=select;b.onpointerenter=()=>{select();b.focus({preventScroll:true});};});}
button('pause-button',()=>setMode(mode==='playing'?'pause':'playing'));button('journal-button',()=>setMode('journal'));button('air-button',()=>openStrike());button('grenade-button',()=>{if(mode==='playing')session.sim.throwGrenade();});button('squad-button',()=>session.command(session.companions.some(c=>c.command==='hold')?'follow':'hold'));
function openStrike(){if(mode!=='playing')return;if(!session.airUnlocked){session.notice='第六章建立军用链路后解锁空袭';return;}strikePoint=session.task?.kind==='strike'?{...session.task.position}:{x:session.sim.player.x,z:session.sim.player.z-16};setMode('strike');}
window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(mode==='playing'&&['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;
 if(e.code==='Escape'){if(mode==='playing')setMode('pause');else if(['pause','journal','strike'].includes(mode))setMode('playing');else if(mode==='equipment')setMode(returnMode);else if(mode==='help')setMode('settings');else if(['chapters','settings','new-confirm'].includes(mode))setMode('menu');return;}
 if(mode==='pause'&&['ArrowUp','ArrowDown','Enter'].includes(e.code)){e.preventDefault();const choices=Array.from(overlay.querySelectorAll<HTMLButtonElement>('.pause-choice'));const index=Math.max(0,choices.findIndex(b=>b.classList.contains('is-selected')));if(e.code==='Enter')choices[index]?.click();else choices[(index+(e.code==='ArrowUp'?-1:1)+choices.length)%choices.length]?.focus({preventScroll:true});return;}
 if(mode==='menu'&&['ArrowUp','ArrowDown','Enter'].includes(e.code)){e.preventDefault();const choices=Array.from(overlay.querySelectorAll<HTMLButtonElement>('.title-choice:not(:disabled)'));if(!choices.length)return;const index=Math.max(0,choices.findIndex(b=>b.id===menuSelection));if(e.code==='Enter')choices[index].click();else choices[(index+(e.code==='ArrowUp'?-1:1)+choices.length)%choices.length].focus({preventScroll:true});return;}
 if(mode==='upgrade'&&/^Digit[123]$/.test(e.code)){session.sim.choose(Number(e.code.slice(-1))-1);if(session.sim.state==='playing')setMode('playing');return;}
 if(mode!=='playing')return;keys.add(e.code);if(e.code==='Space')session.sim.throwGrenade();if(e.code==='KeyR')session.sim.requestReload();if(e.code==='KeyC')openStrike();if(e.code==='KeyJ')setMode('journal');if(e.code==='KeyQ')session.command(session.companions.some(c=>c.command==='hold')?'follow':'hold');});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(mode==='playing')setMode('pause');});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')setMode('pause');});
viewport.addEventListener('wheel',e=>{e.preventDefault();viewDistance=T.MathUtils.clamp(viewDistance+e.deltaY*.012,15,30);},{passive:false});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();loading='图形设备中断。已保存最近检查点，请重新载入。';setMode('loading-error');});
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
function report(text:string){loading=text;if(mode==='menu'&&!ready){const label=document.getElementById('loading-label');if(label)label.textContent='资源加载中…';}}
setMode('menu');
void Promise.all([createModularActor(report),loadModels(report),createGrenadeField(scene),loadGunshotSamples(import.meta.env.BASE_URL)]).then(([a,library,grenades,samples])=>{actor=a;scene.add(actor.root);actor.root.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=false;});mutants=createMutantView(scene,library);actor.setOutfit(readOutfit());sceneView=createStoryView(scene,library);grenadeField=grenades;for(const id of Object.keys(members) as MemberId[]){const model=actor.createPreview();model.setOutfit(presetOutfit('standard'));if(id==='evelyn'){model.root.scale.set(.94,.97,.94);model.root.traverse(o=>{if(o.userData.outfitSlot==='helmet')o.traverse(child=>{if(child instanceof T.Mesh){const m=child.material;if(!Array.isArray(m)){child.material=m.clone();if('color' in child.material)(child.material as T.MeshStandardMaterial).color.lerp(new T.Color('#bfc9bd'),.65);}}});});}model.root.visible=false;model.root.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=false;});scene.add(model.root);companionActors.set(id,model);}const context=audio.start();void context.suspend();gunshot=createGunshot(context,samples);ammoAudio=createAmmoAudio(context);ready=true;menuSelection=saved?'continue-story':'new-story';report('行动资源已就绪');renderOverlay();}).catch(error=>{console.error(error);loading='模型或音频未能载入，请重试。';setMode('loading-error');});
let shadowCenter=Infinity;let last=performance.now(),accumulator=0,hudTime=0,frames=0,perfTime=0;const timings:number[]=[];
function frame(now:number){requestAnimationFrame(frame);const elapsed=Math.min(.1,(now-last)/1000),raw=(now-last)/1000;last=now;
 if(mode==='playing'&&ready){accumulator+=elapsed;while(accumulator>=1/60&&mode==='playing'){const input={x:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),z:Number(keys.has('KeyA')||keys.has('ArrowLeft'))-Number(keys.has('KeyD')||keys.has('ArrowRight'))};session.step(1/60,input,keys.has('KeyF'));effects.step(1/60);for(const effect of session.sim.effects){effects.emit(effect);if(effect.type==='shot')gunshot?.play(distance(effect,session.sim.player)>3,distance(effect,session.sim.player));if(effect.type==='explosion')audio.cue('explosion');}for(const event of session.sim.audioEvents)ammoAudio?.play(event);if(session.sim.player.moving&&session.sim.time>stepsAt){audio.cue('step');stepsAt=session.sim.time+.38;}accumulator-=1/60;if(session.sim.state==='upgrade')setMode('upgrade');else if(session.finished)setMode('ending');else if(session.sim.state==='lost')setMode('lost');persist();}}
 else accumulator=0;
 if(ready&&stage.dataset.backdrop!=='title'){sceneView?.update(session,mode==='playing'?elapsed:0,camera);actor?.update(session.sim,mode==='playing'?elapsed:0);if(actor)actor.root.rotation.z=session.sim.player.hp>0?0:Math.PI/2;for(const [id,model]of companionActors){const live=session.companions.find(x=>x.id===id),c=live??session.stagedCompanions().find(x=>x.id===id);model.root.visible=!!c;if(c){model.setWeaponVisible(!!live); model.update(session.actorPose(c),mode==='playing'?elapsed:0);model.root.rotation.z=c.hp>0?0:Math.PI/2;}}
 if(rememberedSector!==session.sector.id){rememberedSector=session.sector.id;renderer.shadowMap.needsUpdate=true;audio.theme(session.sector.theme);effects.clear();stepsAt=0;}
 mutants?.update(session);strikes.update(session);threats.update(session);supplyField.update(session.sim);grenadeField?.update(session.sim);

 const focus=new T.Vector3(session.sim.player.x,0,session.sim.player.z);camera.position.lerp(focus.clone().add(new T.Vector3(viewDistance*.55,viewDistance*1.2,viewDistance*.2)),1-Math.exp(-elapsed*7));camera.lookAt(focus.clone().add(new T.Vector3(0,.4,0)));const center=Math.round(session.sim.player.z/32)*32;if(center!==shadowCenter){shadowCenter=center;sun.position.set(-18,42,center+14);sun.target.position.set(0,0,center);renderer.shadowMap.needsUpdate=true;}effects.render(camera,session.sim.bullets);
 }
 if(preview&&mode==='equipment')preview.render(loadout,elapsed);
 if(stage.dataset.backdrop!=='title')renderer.render(scene,camera);hudTime+=elapsed;if(hudTime>.1){hudTime=0;draw();}frames++;perfTime+=raw;timings.push(raw*1000);if(timings.length>300)timings.shift();if(perfTime>=2){if(import.meta.env.DEV){const sorted=[...timings].sort((a,b)=>a-b);app.dataset.fps=String(Math.round(frames/perfTime));app.dataset.p95=String(sorted[Math.floor(sorted.length*.95)]??0);app.dataset.geometries=String(renderer.info.memory.geometries);app.dataset.textures=String(renderer.info.memory.textures);}frames=0;perfTime=0;}
 if(lastRevision!==session.revision)renderer.shadowMap.needsUpdate=true;lastRevision=session.revision;
}
requestAnimationFrame(frame);
if(import.meta.env.DEV)Object.assign(window,{storyInspection:{session:()=>session,start:(chapter=0)=>begin(false,chapter),mode:()=>mode,setMode:(value:Mode)=>setMode(value),step:(dt:number,input:Vec,interacting=false)=>session.step(dt,input,interacting),ready:()=>ready,renderer:()=>renderer,save:()=>{session.needsSave=true;persist();}}});
