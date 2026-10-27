import { icon } from './ui';
import { outfitGroups, outfitLabels, outfitPresets, outfitPresetLabels, presetOutfit, readOutfit, saveOutfit, outfitSummary, type Outfit, type OutfitSlot, type OutfitPreset } from './outfit';
import { createOutfitPreview, type OutfitPose } from './outfit-preview';
import type { createModularActor } from './modular-actor';
import type { Simulation } from './simulation';
import './outfit.css';

type Actor=Awaited<ReturnType<typeof createModularActor>>;
type Dependencies={stage:HTMLElement;overlay:HTMLElement;getActor:()=>Actor|undefined;getSim:()=>Simulation;ready:()=>boolean;unavailable:()=>boolean;synchronize:()=>void};
export function createOutfitController(deps:Dependencies) {
  const {stage,overlay}=deps;
  const modal=document.createElement('div');modal.className='outfit-overlay';modal.hidden=true;
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','角色换装');
  stage.append(modal);
  const shortcut=document.createElement('button');shortcut.className='icon-button outfit-shortcut';shortcut.id='outfit-shortcut';
  shortcut.innerHTML=icon('shield');shortcut.title='角色换装（E）';shortcut.setAttribute('aria-label','角色换装');shortcut.disabled=true;
  stage.querySelector('.hud-controls')!.prepend(shortcut);
  let outfit=readOutfit(),open=false,resume=false,returnFocus:HTMLElement|null=null;
  let preview:ReturnType<typeof createOutfitPreview>|undefined;
  let pose:OutfitPose='inspect',weaponVisible=true;
  const app=stage.closest<HTMLElement>('#app')!;
  const allowed=()=>deps.ready()&&!deps.unavailable()&&['ready','paused','playing'].includes(deps.getSim().state)&&!['help','upgrade','graphics-lost'].includes(stage.dataset.screen||'');
  function mountMenu(){
    let button=overlay.querySelector<HTMLButtonElement>('#open-outfit-menu');
    if(!button&&['ready','paused'].includes(deps.getSim().state)&&!['help','graphics-lost'].includes(stage.dataset.screen||'')){
      const host=overlay.querySelector('.button-row')||overlay.querySelector('.panel');
      if(host){button=document.createElement('button');button.id='open-outfit-menu';button.className='outline';button.textContent='角色换装';button.onclick=show;host.append(button);}
    }
    if(button)button.disabled=!allowed();
  }
  const observer=new MutationObserver(mountMenu);observer.observe(overlay,{childList:true,subtree:true});mountMenu();
  function updateControls(saved=true){
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-slot]').forEach(button=>{const slot=button.dataset.outfitSlot as OutfitSlot;const selected=!outfit.legacy&&outfit[slot];button.setAttribute('aria-pressed',String(selected));button.querySelector('.outfit-state')!.textContent=selected?'已装备':'未装备';});
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-armor]').forEach(button=>button.setAttribute('aria-pressed',String(!outfit.legacy&&Number(button.dataset.outfitArmor)===outfit.armor)));
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-preset]').forEach(button=>button.setAttribute('aria-pressed',String(JSON.stringify(presetOutfit(button.dataset.outfitPreset as OutfitPreset))===JSON.stringify(outfit))));
    const summary=modal.querySelector<HTMLElement>('#outfit-summary');if(summary)summary.textContent=outfitSummary(outfit);
    const note=modal.querySelector<HTMLElement>('#outfit-note');if(note)note.textContent=saved?'切换会直接应用到本次行动；仅改变角色外观。':'换装已应用，本次浏览器未能保存偏好。';
    app.dataset.outfit=JSON.stringify(outfit);
  }
  function change(next:Outfit){outfit=next;deps.getActor()!.setOutfit(outfit);preview?.setOutfit(outfit);updateControls(saveOutfit(outfit));}
  function show(){
    if(open||!allowed())return;
    returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const sim=deps.getSim();resume=sim.state==='playing';if(resume)sim.togglePause();
    deps.synchronize();open=true;overlay.inert=true;overlay.classList.add('hidden');stage.querySelector<HTMLElement>('.hud')!.inert=true;
    stage.dataset.screen='outfit';modal.hidden=false;
    modal.innerHTML=`<div class="outfit-dialog">
      <header class="outfit-heading"><div><p class="kicker">行动前整备</p><h2>角色换装</h2><p id="outfit-summary"></p></div><button class="icon-button" id="close-outfit" aria-label="关闭角色换装">${icon('close')}</button></header>
      <section class="outfit-controls" aria-label="穿戴选择">
        <div class="outfit-presets" aria-label="整套预设">${outfitPresets.map(id=>`<button data-outfit-preset="${id}" aria-pressed="false">${outfitPresetLabels[id]}</button>`).join('')}</div>
        <h3>防弹衣</h3><div class="outfit-armor" aria-label="防弹衣档位">${['无','I','II','III'].map((label,tier)=>`<button data-outfit-armor="${tier}" aria-label="${tier?'防弹衣 '+label:'不穿防弹衣'}" aria-pressed="false">${label}</button>`).join('')}</div>
        ${outfitGroups.map(group=>`<h3>${group.label}</h3><div class="outfit-slots" aria-label="${group.label}">${group.slots.map(slot=>`<button data-outfit-slot="${slot}" aria-pressed="false"><span>${outfitLabels[slot]}</span><span class="outfit-state"></span></button>`).join('')}</div>`).join('')}
        <p class="outfit-note" id="outfit-note" role="status"></p>
      </section>
      <section class="outfit-visual" aria-label="角色外观与动作检查"><div class="outfit-preview" id="outfit-viewport"></div>
        <div class="outfit-view-controls"><button id="outfit-left" aria-label="向左旋转角色">↶</button><button data-outfit-view="front">正面</button><button data-outfit-view="back">背面</button><button id="outfit-right" aria-label="向右旋转角色">↷</button></div>
        <p class="outfit-gesture">拖动旋转 · 滚轮缩放</p>
        <div class="outfit-poses" aria-label="预览动作"><button data-outfit-pose="inspect" aria-pressed="true">装备展示</button><button data-outfit-pose="aim" aria-pressed="false">持枪站立</button><button data-outfit-pose="walk" aria-pressed="false">行走</button><button data-outfit-pose="reload" aria-pressed="false">换弹</button><button id="outfit-weapon" aria-pressed="true" disabled>显示武器</button></div>
      </section>
    </div>`;
    modal.querySelector<HTMLButtonElement>('#close-outfit')!.onclick=close;
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-preset]').forEach(button=>button.onclick=()=>change(presetOutfit(button.dataset.outfitPreset as OutfitPreset)));
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-slot]').forEach(button=>button.onclick=()=>{const slot=button.dataset.outfitSlot as OutfitSlot;change({...outfit,legacy:false,[slot]:!outfit[slot]});});
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-armor]').forEach(button=>button.onclick=()=>change({...outfit,legacy:false,armor:Number(button.dataset.outfitArmor) as Outfit['armor']}));
    try{preview=createOutfitPreview(modal.querySelector<HTMLElement>('#outfit-viewport')!,deps.getActor()!.createPreview(),sim.loadout);preview.setOutfit(outfit);pose='inspect';weaponVisible=true;}
    catch(error){console.error(error);close();throw error;}
    modal.querySelector<HTMLButtonElement>('#outfit-left')!.onclick=()=>preview?.rotate(-Math.PI/4);
    modal.querySelector<HTMLButtonElement>('#outfit-right')!.onclick=()=>preview?.rotate(Math.PI/4);
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-view]').forEach(button=>button.onclick=()=>preview?.setView(button.dataset.outfitView as 'front'|'back'));
    modal.querySelectorAll<HTMLButtonElement>('[data-outfit-pose]').forEach(button=>button.onclick=()=>{pose=button.dataset.outfitPose as OutfitPose;preview?.setPose(pose);modal.querySelector<HTMLButtonElement>('#outfit-weapon')!.disabled=pose==='inspect';modal.querySelectorAll<HTMLButtonElement>('[data-outfit-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
    modal.querySelector<HTMLButtonElement>('#outfit-weapon')!.onclick=()=>{weaponVisible=!weaponVisible;preview?.setWeaponVisible(weaponVisible);const button=modal.querySelector<HTMLButtonElement>('#outfit-weapon')!;button.setAttribute('aria-pressed',String(weaponVisible));button.textContent=weaponVisible?'显示武器':'武器已隐藏';};
    updateControls();modal.querySelector<HTMLButtonElement>('#close-outfit')!.focus({preventScroll:true});
  }
  function close(){
    if(!open)return;open=false;preview?.dispose();preview=undefined;modal.hidden=true;modal.innerHTML='';
    overlay.inert=false;stage.querySelector<HTMLElement>('.hud')!.inert=false;
    const sim=deps.getSim();if(resume&&sim.state==='paused'&&!deps.unavailable())sim.togglePause();resume=false;
    deps.synchronize();if(sim.state!=='playing')returnFocus?.focus({preventScroll:true});
  }
  shortcut.onclick=show;
  document.addEventListener('keydown',event=>{
    if(!open){if(event.code==='KeyE'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&allowed()){event.preventDefault();event.stopImmediatePropagation();show();}return;}
    event.stopImmediatePropagation();
    if(event.code==='Escape'&&!event.repeat){event.preventDefault();close();return;}
    if(event.code==='Tab'){
      const buttons=Array.from(modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),first=buttons[0],last=buttons.at(-1),focused=document.activeElement;
      if(first&&(!modal.contains(focused)||(event.shiftKey&&focused===first)||(!event.shiftKey&&focused===last))){event.preventDefault();(event.shiftKey?last:first)?.focus();}
    }
  },true);
  return {
    isOpen:()=>open,
    update(dt:number){shortcut.disabled=!allowed()&&!open;if(open){if(deps.unavailable()){close();return false;}stage.dataset.screen='outfit';preview?.render(dt);return true;}return false;},
  };
}

