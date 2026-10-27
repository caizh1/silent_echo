import { icon, weaponSymbol } from './ui';
import { members, mutationSpecs } from './story-data';
import type { StorySession } from './story';
import { distance } from './simulation';
import { weaponSpecs } from './weapons';

export const storyHudMarkup = `<section class="hud story-hud" aria-label="行动状态" hidden>
 <header class="story-top">
  <div class="story-mission"><p class="hud-location"><span id="chapter-label"></span><span aria-hidden="true"> / </span><span id="sector-label"></span></p><div class="hud-objective">${icon('objective')}<strong id="task-label"></strong><span id="task-distance"></span></div></div>
  <nav class="hud-utility" aria-label="行动工具"><button id="journal-button" class="hud-tool" aria-label="行动档案" title="行动档案（J）" aria-keyshortcuts="J">${icon('supply')}<kbd>J</kbd></button><button id="air-button" class="hud-tool" aria-label="空中支援" aria-keyshortcuts="C">${icon('target')}<kbd>C</kbd><span id="air-count" hidden></span></button><button id="pause-button" class="hud-tool" aria-label="暂停" title="暂停（Esc）" aria-keyshortcuts="Escape">${icon('pause')}<kbd>Esc</kbd></button></nav>
 </header>
 <div class="story-middle"><div class="story-boss" id="boss-panel" hidden></div><p class="hud-feedback" id="notice" role="status" hidden></p><div class="hud-interaction" id="interaction-panel" hidden><div><kbd id="interaction-key">F</kbd><span id="task-hint"></span></div><div class="meter" id="interaction-meter" hidden><span id="task-progress"></span></div></div></div>
 <footer class="story-bottom">
  <div class="story-player"><svg id="mini-map" viewBox="-25 -25 50 50" role="img" aria-label="已探索区域的战术地图"></svg><div class="hud-health"><div>${icon('health')}<strong id="player-hp">100</strong></div><div class="meter" id="health-meter" role="meter" aria-label="生命" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="player-bar"></span></div></div></div>
  <div class="story-radio" id="radio-panel" aria-live="polite" hidden><span id="radio-speaker"></span><p id="radio-text"></p></div>
  <div class="hud-combat"><div id="squad-panel" class="story-squad" aria-label="小队状态" hidden></div><div class="hud-weapon" id="weapon-readout" role="group"><span class="hud-weapon-symbol" id="weapon-symbol" aria-hidden="true"></span><div class="hud-ammo"><strong id="ammo-current">24</strong><span aria-hidden="true">/</span><span id="ammo-reserve">120</span></div></div><div class="hud-weapon-state"><span id="weapon-name"></span><span id="reload-label" role="status"></span></div><div class="story-actions"><button id="grenade-button" class="hud-tool" aria-label="投掷手雷" title="投掷手雷（空格）" aria-keyshortcuts="Space">${icon('grenade')}<span id="grenade-count">3</span><kbd>空格</kbd></button><button id="squad-button" class="hud-tool" aria-label="切换小队指令" aria-keyshortcuts="Q" hidden>${icon('shield')}<span id="squad-command">跟随</span><kbd>Q</kbd></button></div></div>
 </footer>
</section>`;

export type InteractionReadout = { key: string; text: string; progress?: number };
// 与实际交互保持相同的距离、视线和优先级，远处不反复显示按键说明。
export function getHudInteraction(s: StorySession): InteractionReadout | undefined {
 const p=s.sim.player;
 if(p.hp<=0)return {key:'',text:'等待队友救援'};
 if(!s.flags.has(`record:${s.sector.id}`)&&distance(p,s.recordPosition)<3&&s.sim.visible(p,s.recordPosition))return {key:'F',text:'收集现场记录'};
 const down=s.companions.find(c=>c.hp<=0&&distance(c,p)<2.5&&s.sim.visible(c,p));
 if(down)return {key:'F',text:`按住救援${shortName(down.id)}`,progress:down.revive/4};
 const task=s.task;
 if(!task){if(distance(p,s.sector.exit)>=4)return;if(s.companions.some(c=>c.hp<=0))return {key:'',text:'先救起倒地队友'};return s.companions.some(c=>distance(c,p)>12)?{key:'Q',text:'等待队友靠近出口'}:{key:'F',text:'进入下一分区'};}
 if(task.kind==='strike')return {key:'C',text:'标定任务空袭'};
 if(task.kind==='defend'&&s.defendAt>=0)return {key:'',text:`守住设备 · ${Math.max(0,Math.ceil(task.seconds-s.sim.time+s.defendAt))} s`,progress:(s.sim.time-s.defendAt)/task.seconds};
 if(['boss','reach'].includes(task.kind)||distance(p,task.position)>3)return;
 if(!s.sim.visible(p,task.position))return {key:'',text:'绕到设备正面'};
 return {key:'F',text:task.kind==='defend'?'启动设备':`按住${task.name}`,progress:task.kind==='defend'?undefined:s.holdTime/task.seconds};
}
const shortName=(id:keyof typeof members)=>({hayes:'海斯',pierce:'皮尔斯',evelyn:'肖'})[id];
const clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));

export function createStoryHud(root: HTMLElement) {
 const get=(id:string)=>root.querySelector<HTMLElement>(`#${id}`)!;
 const set=(id:string,text:string)=>{const node=get(id);if(node.textContent!==text)node.textContent=text;};
 let previousNotice='',noticeUntil=0,noticeText='',previousWeapon='',previousSquad='';
 function flash(text:string,now=performance.now()){noticeText=text;noticeUntil=now+3500;}
 function reset(){previousNotice='';noticeUntil=0;noticeText='';}
 function update(s:StorySession,map:string,now=performance.now()) {
  const sim=s.sim;
  set('chapter-label',`${String(s.sector.chapter+1).padStart(2,'0')} · ${s.chapter.name}`);set('sector-label',s.sector.name);
  set('task-label',s.task?.name??'前往出口');set('task-distance',`${Math.ceil(distance(sim.player,s.task?.position??s.sector.exit))} m`);
  const prompt=getHudInteraction(s);get('interaction-panel').hidden=!prompt;
  if(prompt){set('task-hint',prompt.text);set('interaction-key',prompt.key);get('interaction-key').hidden=!prompt.key;get('interaction-meter').hidden=prompt.progress===undefined;get('task-progress').style.width=`${clamp(prompt.progress??0)*100}%`;}
  set('player-hp',String(Math.ceil(sim.player.hp)));get('player-bar').style.width=`${clamp(sim.player.hp/sim.player.maxHp)*100}%`;
  get('health-meter').setAttribute('aria-valuemax',String(sim.player.maxHp));get('health-meter').setAttribute('aria-valuenow',String(Math.ceil(sim.player.hp)));
  root.classList.toggle('health-critical',sim.player.hp/sim.player.maxHp<=.3);
  set('ammo-current',String(sim.ammo));set('ammo-reserve',String(sim.reserve));set('weapon-name',weaponSpecs[sim.weapon].name);get('weapon-readout').setAttribute('aria-label',`${weaponSpecs[sim.weapon].name}，弹匣 ${sim.ammo}，备弹 ${sim.reserve}`);get('weapon-readout').title=weaponSpecs[sim.weapon].name;
  set('reload-label',sim.reload>0?`换弹 ${sim.reload.toFixed(1)}`:sim.ammo===0&&sim.reserve===0?'弹药耗尽':'');
  get('ammo-current').classList.toggle('ammo-critical',sim.ammo<=Math.ceil(sim.magazine*.2));
  if(previousWeapon!==sim.weapon){previousWeapon=sim.weapon;get('weapon-symbol').innerHTML=weaponSymbol(sim.weapon);}
  set('grenade-count',String(sim.grenadeCount));(get('grenade-button') as HTMLButtonElement).disabled=sim.grenadeCount<=0;
  const air=get('air-button') as HTMLButtonElement;air.disabled=!s.airUnlocked;
  air.title=s.airUnlocked?`空中支援（C） · 自由支援 ${s.airCharges} 次${s.task?.kind==='strike'?' · 任务支援已预留':''}`:'第六章建立链路后解锁空中支援';
  get('air-count').hidden=!s.airUnlocked;set('air-count',s.task?.kind==='strike'?'任务':String(s.airCharges));
  const hold=s.companions.some(c=>c.command==='hold');get('squad-button').hidden=!s.companions.length;set('squad-command',hold?'留守':'跟随');get('squad-button').title=hold?'切换为跟随（Q）':'切换为留守（Q）';
  get('squad-panel').hidden=!s.companions.length;
  const squad=s.companions.map(c=>`${c.id}:${Math.ceil(c.hp)}:${c.command}`).join('|');
  if(squad!==previousSquad){previousSquad=squad;get('squad-panel').innerHTML=s.companions.map(c=>`<div class="story-member ${c.hp<=0?'member-down':''}" aria-label="${members[c.id].name}，${c.hp<=0?'倒地，等待救援':`生命 ${Math.ceil(c.hp)}`}" title="${members[c.id].role} · ${members[c.id].name}"><span>${shortName(c.id)}</span><div class="meter"><span style="width:${clamp(c.hp/c.maxHp)*100}%"></span></div>${c.hp<=0?'<small>倒地</small>':''}</div>`).join('');}
  const radio=s.radio[0];get('radio-panel').hidden=!radio;set('radio-speaker',radio?.speaker??'');set('radio-text',radio?.text??'');
  if(s.notice&&s.notice!==previousNotice)flash(s.notice,now);previousNotice=s.notice;
  get('notice').hidden=!noticeText||now>=noticeUntil;set('notice',noticeText);
  get('mini-map').setAttribute('viewBox',`${sim.player.x-25} ${sim.player.z-25} 50 50`);get('mini-map').innerHTML=map;
  const boss=sim.enemies.find(e=>e.kind==='boss'&&e.hp>0);get('boss-panel').hidden=!boss;
  if(boss)get('boss-panel').innerHTML=`<strong>${mutationSpecs[boss.mutation as keyof typeof mutationSpecs]?.name??'增生体'}</strong><div class="meter"><span style="width:${clamp(boss.hp/boss.maxHp)*100}%"></span></div>`;
 }
 return {update,flash,reset};
}
