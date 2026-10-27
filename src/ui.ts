import { distance, type Simulation } from './simulation';
import { missions, missionUnlocked, nextMission, type Mission } from './campaign';
import { AMMO, reloadLabel } from './ammo';
import { attachmentSlots, attachmentSpecs, weaponIds, weaponSpecs, loadoutStats, GRENADE, type Loadout, type WeaponId } from './weapons';

const paths = {
  objective: '<path d="m12 2 10 10-10 10L2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M12 15v4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6M12 2v3m7 1 2-2"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1"/>',
  health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" fill="currentColor" stroke="none"/>',
  skull: '<path d="M5 13a8 8 0 1 1 14 0v4l-3 1v3H8v-3l-3-1Z"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/><path d="m11 15 1-2 1 2m-3 3v3m4-3v3"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  reload: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  shield: '<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="m8 12 3 3 5-6"/>',
  bullet: '<path d="M8 20V8l4-6 4 6v12ZM8 16h8M8 8h8"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4m-8 12 4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 5v5"/>',
  supply: '<rect x="3" y="6" width="18" height="15" rx="1"/><path d="M3 10h18M8 6V3h8v3M9 13v5m3-5v5m3-5v5"/>',
  grenade: '<path d="m10 6 1-4h5l1 4M8 7h8l3 5v6l-3 4H8l-3-4v-6ZM8 12h8M8 17h8M12 9v11M17 4l4 4v7"/>',
} as const;

export function icon(name: keyof typeof paths, extra = '') {
  return `<span class="icon ${extra}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg></span>`;
}
const weaponSymbols:Record<WeaponId,string>={
  pistol:'M9 6h64V3h6v3h9v10H46l-7 13H24l6-13H9Zm27 10-3 8h4l4-8Z',
  smg:'M4 9h20V5h49v5h20v6H64l-2 14H49l1-13H38l-7 12H20l7-15H4Zm29 0v4h13V9Z',
  rifle:'M3 10h17l6-5h27V3h5v5h24v4h14v4H79l-3 3H56l4 11H49l-5-12h-7l-5 10h-8l5-12H17L5 23H2l4-10H3Zm29-2-7 4h16V8Zm30 4v3h13l3-3Z',
};
export const weaponSymbol=(weapon:WeaponId)=>`<svg viewBox="0 0 100 32" fill="currentColor"><path d="${weaponSymbols[weapon]}"/></svg>`;
const rifle=`<span class="rifle-icon" id="weapon-symbol" aria-hidden="true">${weaponSymbol('pistol')}</span>`;

export function formatTime(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function openingPanel(ready = false, failed = false, label = '部署行动', mission: Mission = missions[1], completed: readonly string[] = []) {
  return `<div class="panel opening-panel"><div class="kicker">${icon('objective')}破城前线 · 连续战役</div>
    <h1>${mission.name}<span class="title-rule"></span></h1><p class="tagline">${mission.subtitle}</p>
    <div class="campaign-picker" aria-label="战役关卡">${missions.map((item, index) => {
      const unlocked = missionUnlocked(index, completed);
      return `<button class="mission-option" data-mission="${item.id}" aria-pressed="${item.id === mission.id}" ${!ready || !unlocked ? 'disabled' : ''}><span class="mission-number">${String(index + 1).padStart(2, '0')}</span><strong>${item.name}</strong><span>${completed.includes(item.id) ? '已完成 · 可重玩' : !unlocked ? `完成「${missions[index - 1].name}」解锁` : index === 0 ? '生存训练' : '可部署'} · ${formatTime(item.duration)}</span></button>`;
    }).join('')}</div>
    <p class="mission-briefing">${mission.briefing}</p><p class="mission-tactic">${mission.tactic}</p>
    <div class="mission-tags"><span>${icon('clock')}${formatTime(mission.duration)}</span><span>${icon('target')}${mission.objectives.length ? `${mission.objectives.length} 处任务目标` : '自动开火'}</span><span>${icon('skull')}${formatTime(mission.bossAt)} 巨兽${mission.bossRequiresObjectives ? '·需完成节点' : '来袭'}</span></div>
    <div class="button-row"><button class="primary" id="start" ${!ready && !failed ? 'disabled' : ''}><span>${failed ? '重试载入' : ready ? label : '部署装备…'}</span>${icon('arrow')}</button><button class="outline" id="open-loadout" ${!ready ? 'disabled' : ''}>${icon('supply')}装备配置</button><button class="quiet" id="open-help">${icon('help')}操作</button></div>
    <p class="loadout-summary" id="loadout-summary"></p>
    <div class="status" id="load-status" role="status">正在部署装备…</div></div>`;
}
export const shellMarkup = `<main class="shell"><section class="stage" id="stage" data-screen="ready" aria-label="废城战场">
  <div class="canvas-wrap" id="viewport" tabindex="-1"></div>
  <div class="hud" aria-label="战斗状态"><div class="hud-top">
    <div class="mission"><div class="mission-mark">${icon('objective')}</div><div class="mission-copy"><strong id="objective">守住街区</strong><div class="phase-track" id="wave" aria-label="阶段一：接敌"><i class="active"></i><span></span><i></i><span></span><i></i></div></div></div>
    <div class="timer hud-plate" title="剩余生存时间"><div class="timer-face">${icon('clock')}<strong id="timer">03:00</strong></div><div class="time-track"><span id="timebar"></span></div></div>
    <div class="hud-controls"><button class="icon-button" id="help" aria-label="操作帮助" title="操作帮助（H）" aria-keyshortcuts="H" aria-expanded="false">${icon('help')}</button><button class="icon-button" id="pause" aria-label="暂停" title="暂停（Esc）" aria-keyshortcuts="Escape" disabled>${icon('pause')}</button></div>
  </div><div class="hud-middle"><div class="mission-guide hud-plate" id="mission-guide" hidden><div class="mission-guide-copy"><span id="mission-name"></span><strong id="mission-goal"></strong><span id="mission-detail"></span><div class="meter"><span id="mission-progress"></span></div><span id="mission-notice" role="status" aria-live="polite"></span></div><svg id="mission-map" viewBox="-24 -24 48 48" role="img" aria-label="战术地图：白色为玩家，编号为目标，撤为撤离区"></svg></div><div class="boss-strip hud-plate" id="boss" hidden><div class="boss-heading">${icon('skull')}<strong>裂城巨兽</strong><span id="boss-health"></span></div><div class="meter boss-meter" id="boss-meter" role="meter" aria-label="巨兽生命" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="bossbar"></span></div></div></div>
  <div class="hud-bottom">
    <div class="vitals hud-plate" id="vitals"><div class="health-row">${icon('health')}<strong id="health">100</strong><span class="stat-limit">/ <span id="max-health">100</span></span></div><div class="meter health-meter" id="health-meter" role="meter" aria-label="生命" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="hpbar"></span></div><div class="experience-row">${icon('objective')}<strong id="level" aria-label="等级一">01</strong><div class="experience-track" id="experience-meter" role="meter" aria-label="升级经验" aria-valuemin="0" aria-valuemax="8" aria-valuenow="0"><span id="xpbar"></span></div></div></div>
    <div class="kill-counter hud-plate" title="击倒目标">${icon('skull')}<strong id="kills" aria-label="击倒零个目标">00</strong></div>
    <div class="gun-card hud-plate" id="weapon"><div class="weapon-heading"><strong id="weapon-name">手枪</strong><span id="weapon-parts">标准配置</span></div><div class="weapon-row">${rifle}<div class="ammo"><strong id="ammo">${AMMO.magazine}</strong><span class="stat-limit">/ <span id="magazine">${AMMO.magazine}</span></span></div><div class="reserve-group" title="备用弹药，上限 240 发">${icon('bullet', 'reserve-icon')}<strong id="reserve">${AMMO.initialReserve}</strong></div></div><div class="ammo-pips" id="ammo-pips" aria-hidden="true">${'<i></i>'.repeat(36)}</div><div class="weapon-state"><span class="weapon-indicator" id="weapon-indicator">${icon('target')}</span><span id="weapon-status">索敌</span><div class="reload-track" id="reload-track" hidden><span id="reloadbar"></span></div><button class="reload-button" id="reload-weapon" title="提前换弹（R）" aria-label="提前换弹" aria-keyshortcuts="R" disabled>${icon('reload')}<span>R</span></button></div><div class="grenade-row"><button class="grenade-button" id="throw-grenade" aria-label="投掷手雷" aria-keyshortcuts="Space" disabled>${icon('grenade')}<span>手雷</span><kbd>空格</kbd></button><strong id="grenade-count">3</strong><span class="grenade-status" id="grenade-status">主动投掷</span></div><div class="supply-note" id="supply-note" hidden>${icon('supply')}<span id="supply-distance"></span></div><div class="pickup-notice" id="pickup-notice" role="status" aria-live="polite" hidden></div></div>
  </div></div>
  <div class="overlay" id="overlay" role="dialog" aria-modal="true" aria-label="行动菜单">${openingPanel()}</div>
</section></main>`;

export function pausedPanel() {
  return `<div class="panel"><div class="kicker">${icon('pause')}行动暂停</div><h2>稍作喘息。</h2><div class="button-row"><button class="primary" id="resume"><span>继续行动</span>${icon('play')}</button><button class="outline" id="restart">重新部署</button></div><button class="quiet menu-help" id="change-equipment">${icon('supply')}更换装备</button><button class="quiet menu-help" id="campaign-menu">${icon('objective')}返回选关</button><button class="quiet menu-help" id="open-help">${icon('help')}操作帮助</button></div>`;
}
export function loadoutPanel(loadout: Loadout) {
  const spec = weaponSpecs[loadout.weapon], stats = loadoutStats(loadout), slots: readonly string[] = spec.slots;
  return `<div class="panel loadout-panel"><div class="panel-heading"><div><div class="kicker">${icon('supply')}战前准备</div><h2>选择你的火力。</h2></div><button class="icon-button" id="close-loadout" aria-label="返回部署菜单">${icon('close')}</button></div>
    <div class="weapon-options" aria-label="主武器">${weaponIds.map(id => `<button class="weapon-option" data-weapon="${id}" aria-pressed="${loadout.weapon === id}"><img src="/models/weapons/${id}-preview.png" alt="${weaponSpecs[id].name}模型预览"><strong>${weaponSpecs[id].name}</strong><b class="weapon-rate">${Math.round(60 / weaponSpecs[id].interval)}<small>发/分</small></b><span>${weaponSpecs[id].description}</span></button>`).join('')}</div>
    <div class="equipment-preview" id="equipment-preview" role="img" aria-label="当前枪械与已安装配件的三维旋转预览"></div>
    <div class="loadout-stats" aria-label="当前配置属性"><span>单发伤害<strong>${stats.damage}</strong></span><span>每分钟射击<strong>${Math.round(60 / stats.interval)}</strong></span><span>弹匣容量<strong>${stats.magazine}</strong></span><span>散布半角<strong>${(stats.spread * 180 / Math.PI).toFixed(1)}°</strong></span></div>
    <div class="attachment-options" aria-label="武器配件">${attachmentSlots.map(slot => `<button class="attachment-option" data-attachment="${slot}" aria-pressed="${loadout.attachments.includes(slot)}" ${slots.includes(slot) ? '' : 'disabled'}><span class="attachment-mark">${icon(slot === 'optic' ? 'target' : slot === 'magazine' ? 'bullet' : slot === 'stock' ? 'reload' : 'shield')}</span><strong>${attachmentSpecs[slot].name}</strong><span>${slots.includes(slot) ? attachmentSpecs[slot].effect : '此手枪不支持前握把'}</span><b>${loadout.attachments.includes(slot) ? '已安装' : slots.includes(slot) ? '安装' : '不兼容'}</b></button>`).join('')}</div>
    <div class="loadout-footer"><p>${icon('grenade')}每次行动携带 ${GRENADE.initial} 枚手雷 · 空格主动投掷</p><button class="primary" id="start-equipped"><span>携装开始行动</span>${icon('arrow')}</button></div></div>`;
}
export function helpPanel(mission: Mission = missions[0]) {
  return `<div class="panel help-panel"><div class="panel-heading"><div><div class="kicker">${icon('help')}操作指引</div><h2>专注走位。</h2></div><button class="icon-button" id="close-help" aria-label="关闭帮助" title="关闭帮助（Esc）">${icon('close')}</button></div>
    <div class="help-rows"><div class="help-row">${icon('move')}<div class="key-group"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>或方向键</span></div><span>移动</span></div><div class="help-row">${icon('reload')}<kbd>R</kbd><span>提前换弹</span></div><div class="help-row">${icon('grenade')}<kbd>空格</kbd><span>投掷手雷 · 每局三枚</span></div><div class="help-row">${icon('mouse')}<span>滚轮</span><span>缩放</span></div><div class="help-row">${icon('pause')}<kbd>Esc</kbd><span>暂停 / 继续</span></div></div>
    <div class="field-tips"><p>${icon('target')}自动索敌、射击；空匣有备弹时自动换弹。</p><p>${icon('bullet')}弹匣容量由战前配置决定，开局备弹 ${AMMO.initialReserve} 发；换弹 ${AMMO.reloadSeconds} 秒，期间可移动。</p><p>${icon('supply')}靠近金色弹药或补给箱自动补充；备弹上限 ${AMMO.maxReserve} 发，装不下的留在原地。</p><p>${icon('objective')}靠近绿色晶体拾取经验，升级三选一。</p><p>${icon('shield')}利用掩体，躲开红色预警。</p><p>${icon('skull')}${mission.briefing}</p><p>${icon('objective')}${mission.tactic}</p></div><button class="primary" id="help-done"><span>明白了</span>${icon('arrow')}</button></div>`;
}
export function upgradePanel(sim: Simulation) {
  const reduction = Math.round((1 - sim.nextFireInterval / sim.fireInterval) * 100);
  return `<div class="panel upgrade-panel"><div class="kicker">${icon('objective')}等级 ${String(sim.level).padStart(2, '0')}</div><h2>战场强化</h2><p class="menu-caption">选择一项，立即生效。</p><div class="cards">
    <button class="card" data-choice="0"><div class="card-top">${icon('bullet')}<kbd>1</kbd></div><strong>强化弹药</strong><b class="upgrade-value">+24<span>%</span></b><span>武器伤害</span></button>
    <button class="card" data-choice="1" ${sim.canUpgradeFireRate ? '' : 'disabled'}><div class="card-top">${icon('reload')}<kbd>2</kbd></div><strong>快速循环</strong><b class="upgrade-value">${sim.canUpgradeFireRate ? `−${reduction}<span>%</span>` : '已满'}</b><span>${sim.canUpgradeFireRate ? '缩短射击间隔' : '已达当前武器射速上限'}<br>${Math.round(60 / sim.fireInterval)} → ${Math.round(60 / sim.nextFireInterval)} 发/分</span></button>
    <button class="card" data-choice="2"><div class="card-top">${icon('shield')}<kbd>3</kbd></div><strong>应急护甲</strong><b class="upgrade-value">+20</b><span>生命上限 · 恢复 40<br>减伤 +6% · 上限 50%</span></button>
  </div></div>`;
}
export function resultPanel(sim: Simulation) {
  const next = nextMission(sim.mission.id);
  return `<div class="panel"><div class="kicker">${icon(sim.state === 'won' ? 'shield' : 'skull')}${sim.mission.name} · ${sim.state === 'won' ? '任务完成' : '信号中断'}</div><h2>${sim.state === 'won' ? next ? '行动完成。' : '封锁已突破。' : '行动结束。'}</h2><div class="result-stats"><div>${icon('skull')}<strong>${sim.kills}</strong><span>击倒</span></div><div>${icon('clock')}<strong>${formatTime(Math.floor(sim.time))}</strong><span>生存</span></div><div>${icon('objective')}<strong>${sim.objectives.length ? `${sim.objectives.filter(objective => objective.completed).length} / ${sim.objectives.length}` : String(sim.level).padStart(2, '0')}</strong><span>${sim.objectives.length ? '任务目标' : '等级'}</span></div></div>
    <div class="button-row">${sim.state === 'won' && next ? `<button class="primary" id="next-mission"><span>下一关 · ${next.name}</span>${icon('arrow')}</button>` : ''}<button class="outline" id="restart">重试本关</button><button class="outline" id="campaign-menu">返回选关</button></div><button class="quiet menu-help" id="change-equipment">${icon('supply')}更换装备</button><p id="save-status" class="status" role="status">正在保存成绩…</p><p id="campaign-status" class="status" role="status"></p></div>`;
}

const mapPosition = (point: { x: number; z: number }) => `cx="${-point.z}" cy="${point.x}"`;
function drawMissionMap(sim: Simulation) {
  return `<rect x="-23" y="-23" width="46" height="46" fill="#0b151b" stroke="#60737c" stroke-width=".3"/>${sim.walls.map(wall => `<rect x="${-wall.z - wall.d / 2}" y="${wall.x - wall.w / 2}" width="${wall.d}" height="${wall.w}" fill="#51606a"/>`).join('')}
    ${sim.objectives.map((objective, index) => `<circle ${mapPosition(objective)} r="2.2" fill="${objective.completed ? '#93be88' : !sim.objectiveAvailable(index) ? '#68737b' : '#8fd5df'}"/><text x="${-objective.z}" y="${objective.x + .9}" text-anchor="middle" font-size="2.8" fill="#11232c">${index + 1}</text>`).join('')}
    ${sim.mission.extraction ? `<text x="${-sim.mission.extraction.z}" y="${sim.mission.extraction.x + 1}" text-anchor="middle" font-size="3.2" fill="${sim.extractionReady ? '#b6efac' : '#8997a0'}">撤</text>` : ''}<circle ${mapPosition(sim.player)} r="1.2" fill="#ffffff" stroke="#13222c" stroke-width=".4"/>`;
}
function goalDirection(sim: Simulation, point: { x: number; z: number }) {
  const dx = point.x - sim.player.x, dz = point.z - sim.player.z;
  return `${Math.abs(dx) > Math.abs(dz) ? dx > 0 ? '下方' : '上方' : dz > 0 ? '左侧' : '右侧'} ${Math.ceil(distance(sim.player, point))} 米`;
}
export function createHud(root: HTMLElement) {
  const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    const ids = ['timer', 'timebar', 'health', 'max-health', 'hpbar', 'health-meter', 'vitals', 'xpbar', 'experience-meter', 'level', 'kills', 'ammo', 'magazine', 'reserve', 'weapon', 'weapon-name', 'weapon-parts', 'weapon-status', 'weapon-indicator', 'reload-track', 'reloadbar', 'reload-weapon', 'grenade-count', 'grenade-status', 'throw-grenade', 'supply-note', 'supply-distance', 'pickup-notice', 'wave', 'objective', 'boss', 'boss-health', 'boss-meter', 'bossbar', 'mission-guide', 'mission-name', 'mission-goal', 'mission-detail', 'mission-progress', 'mission-notice', 'mission-map'] as const;
  const el = Object.fromEntries(ids.map(id => [id, get(id)])) as Record<typeof ids[number], HTMLElement>;
  const pips = Array.from(root.querySelectorAll<HTMLElement>('#ammo-pips i'));
  const phases = Array.from(el.wave.querySelectorAll('i'));
  let lastWeaponState = '';
  let lastWeapon:WeaponId|undefined;
  const percent = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`;
  const setMeter = (element: HTMLElement, value: number, max: number) => {
    element.setAttribute('aria-valuenow', String(value));
    element.setAttribute('aria-valuemax', String(max));
  };
  return (sim: Simulation) => {
    const hp = Math.ceil(sim.player.hp), ratio = sim.player.hp / sim.player.maxHp;
    if(import.meta.env.DEV){root.dataset.weapon=sim.weapon;root.dataset.attachments=sim.loadout.attachments.join(',');root.dataset.grenades=String(sim.grenadeCount);root.dataset.grenadesThrown=String(sim.grenadesThrown);root.dataset.grenadesActive=String(sim.grenades.length);}
    el.timer.textContent = formatTime(sim.mission.duration - sim.time);
    el.timebar.style.width = percent(1 - sim.time / sim.mission.duration);
    el.health.textContent = String(hp);
    el['max-health'].textContent = String(sim.player.maxHp);
    el.hpbar.style.width = percent(ratio);
    el.vitals.classList.toggle('critical', ratio <= .3);
    setMeter(el['health-meter'], hp, sim.player.maxHp);
    el.xpbar.style.width = percent(sim.xp / sim.nextXp);
    setMeter(el['experience-meter'], sim.xp, sim.nextXp);
    el.level.textContent = String(sim.level).padStart(2, '0');
    el.level.setAttribute('aria-label', `等级 ${sim.level}`);
    el.kills.textContent = String(sim.kills).padStart(2, '0');
    el.kills.setAttribute('aria-label', `击倒 ${sim.kills} 个目标`);
    el.ammo.textContent = String(sim.ammo).padStart(2, '0');
    el.magazine.textContent = String(sim.magazine);
    el.reserve.textContent = String(sim.reserve);
    el['weapon-name'].textContent = weaponSpecs[sim.weapon].name;
    if(lastWeapon!==sim.weapon){get('weapon-symbol').innerHTML=weaponSymbol(sim.weapon);lastWeapon=sim.weapon;}
    el['weapon-parts'].textContent = sim.loadout.attachments.map(slot => attachmentSpecs[slot].name).join(' · ') || '标准配置';
    el.weapon.setAttribute('aria-label', `${weaponSpecs[sim.weapon].name}弹药 ${sim.ammo} / ${sim.magazine}，备弹 ${sim.reserve} / ${sim.maxReserve}`);
    el.weapon.classList.toggle('low-ammo',sim.reserve<=AMMO.magazine);
    pips.forEach((pip, index) => { pip.hidden = index >= sim.magazine; pip.classList.toggle('spent', index >= sim.ammo); });
    get('ammo-pips').style.gridTemplateColumns = `repeat(${sim.magazine}, minmax(0, 1fr))`;
    el['grenade-count'].textContent = String(sim.grenadeCount);
    el['grenade-status'].textContent = sim.grenadeCount === 0 ? '已用尽' : sim.grenadeCooldown > 0 ? '准备中' : '主动投掷';
    (el['throw-grenade'] as HTMLButtonElement).disabled = sim.state !== 'playing' || sim.grenadeCount === 0 || sim.grenadeCooldown > 0;
    const weaponState = sim.reload > 0 ? 'reload' : sim.ammo===0 ? 'empty' : sim.target ? 'locked' : 'search';
    el.weapon.dataset.state = weaponState;
    el['weapon-status'].textContent = sim.reload > 0 ? `${reloadLabel(sim.reload)} ${sim.reload.toFixed(1)}秒` : sim.ammo===0 ? '弹药耗尽 · 寻找补给' : sim.reserve===0 ? '备弹耗尽' : sim.ammo<=6 ? '弹匣将空' : sim.target ? '锁定' : '索敌';
    el['reload-track'].hidden = sim.reload <= 0;
    el.reloadbar.style.width = percent(1 - sim.reload / AMMO.reloadSeconds);
    (el['reload-weapon'] as HTMLButtonElement).disabled=sim.state!=='playing'||sim.reload>0||sim.ammo===sim.magazine||sim.reserve===0;
    const nearest=sim.crates.filter(c=>c.rounds>0).sort((a,b)=>distance(a,sim.player)-distance(b,sim.player))[0];
    el['supply-note'].hidden=sim.reserve>AMMO.magazine||!nearest;
    if(nearest){
      const dx=nearest.x-sim.player.x,dz=nearest.z-sim.player.z;
      const direction=Math.abs(dx)>Math.abs(dz)?(dx>0?'下方':'上方'):(dz>0?'左侧':'右侧');
      el['supply-distance'].textContent=`补给箱 · ${direction} ${Math.ceil(distance(nearest,sim.player))}米`;
    }
    const notice=sim.pickupNotice.until>sim.time?`弹药 +${sim.pickupNotice.rounds}`:'';
    if(el['pickup-notice'].textContent!==notice)el['pickup-notice'].textContent=notice;
    el['pickup-notice'].hidden=!notice;
    if (weaponState !== lastWeaponState) {
      el['weapon-indicator'].innerHTML = icon(sim.reload > 0 ? 'reload' : 'target');
      lastWeaponState = weaponState;
    }
    const boss = sim.enemies.find(enemy => enemy.kind === 'boss');
    const phase = sim.phaseIndex;
    phases.forEach((node, index) => { node.classList.toggle('active', index === phase); node.classList.toggle('complete', index < phase); });
    el.wave.setAttribute('aria-label', `阶段 ${phase + 1}：${sim.phase.name}`);
    el.objective.textContent = sim.mission.name;
    el['mission-guide'].hidden = !sim.objectives.length;
    if (sim.objectives.length) {
      const objective = sim.activeObjective, extraction = sim.mission.extraction!;
      const completed = sim.objectives.filter(item => item.completed).length;
      el['mission-name'].textContent = `${sim.phase.name} · 目标 ${completed}/${sim.objectives.length}`;
      el['mission-goal'].textContent = objective ? `${sim.objectives.indexOf(objective) + 1} · ${objective.name}` : !sim.bossDefeated ? '击败裂城巨兽' : '前往撤离区';
      el['mission-detail'].textContent = objective ? sim.objectiveContested(objective) ? '区域被争夺 · 清除圈内敌人' :
        distance(sim.player, objective) <= objective.radius && sim.visible(sim.player, objective) ? `${objective.kind === 'relay' ? '操作中' : '回收中'} · 剩余 ${Math.max(0, objective.seconds - objective.progress).toFixed(1)} 秒` : `${goalDirection(sim, objective)} · 进入光圈` :
        !sim.bossDefeated ? boss ? '躲开预警 · 持续输出' : `巨兽将在 ${formatTime(sim.mission.bossAt - sim.time)} 后出现` :
        !sim.extractionReady ? `撤离区 · ${goalDirection(sim, extraction)} · 等待 ${formatTime(sim.mission.duration - sim.time)}` :
        sim.extractionProgress > 0 ? `撤离中 · 剩余 ${(extraction.seconds - sim.extractionProgress).toFixed(1)} 秒` : `撤离区 · ${goalDirection(sim, extraction)} · 停留 ${extraction.seconds} 秒`;
      el['mission-progress'].style.width = percent(objective ? objective.progress / objective.seconds : sim.extractionProgress / extraction.seconds);
      const notice = sim.objectiveNotice.until > sim.time ? sim.objectiveNotice.text : '';
      if (el['mission-notice'].textContent !== notice) el['mission-notice'].textContent = notice;
      el['mission-map'].innerHTML = drawMissionMap(sim);
    }
    el.boss.hidden = !boss;
    if (boss) {
      el['boss-health'].textContent = `${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;
      el.bossbar.style.width = percent(boss.hp / boss.maxHp);
      setMeter(el['boss-meter'], Math.ceil(boss.hp), Math.ceil(boss.maxHp));
    }
  };
}
