import { scenery, type Scenery } from './level';
import type { EnemyKind } from './enemies';

type Point = { x: number; z: number };
export type MissionObjective = Point & {
  id: string; name: string; kind: 'relay' | 'cache'; seconds: number; radius: number;
};
export type MissionPhase = {
  at: number; name: string; interval: number; enemies: readonly Exclude<EnemyKind, 'boss'>[];
};
export type Mission = {
  scripted?: boolean; bounds?: number;
  collisions?: readonly { x: number; z: number; w: number; d: number; h: number }[];
  id: string; name: string; subtitle: string; briefing: string; tactic: string;
  orderedObjectives?: boolean; bossRequiresObjectives?: boolean;
  duration: number; bossAt: number; bossHealth: number; maxEnemies: number;
  spawn: Point; scenery: readonly Scenery[]; supplies: readonly Point[];
  objectives: readonly MissionObjective[]; extraction?: Point & { radius: number; seconds: number };
  phases: readonly MissionPhase[]; sky: string; fog: string; light: string; accent: string;
};

const edges: Scenery[] = [
  { asset: 'ruined-storefront', x: -15, z: -16, yaw: 0 },
  { asset: 'ruined-storefront', x: 15, z: -16, yaw: Math.PI },
  { asset: 'ruined-storefront', x: -15, z: 15, yaw: Math.PI / 2 },
  { asset: 'ruined-storefront', x: 15, z: 15, yaw: -Math.PI / 2 },
];
const supplies: Point[] = [
  { x: 0, z: 3 }, { x: -10, z: 0 }, { x: 10, z: 0 }, { x: 0, z: -18 },
  { x: 0, z: 18 }, { x: -10, z: -7 }, { x: 10, z: 8 }, { x: -8, z: 8 },
];

export const missions: readonly Mission[] = [
  {
    id: 'street', name: '废城接敌', subtitle: '训练行动 · 生存',
    briefing: '在废城中保持移动，击败裂城巨兽，撑过三分钟。',
    tactic: '熟悉自动射击、换弹、手雷和补给。',
    duration: 180, bossAt: 120, bossHealth: 1, maxEnemies: 28,
    spawn: { x: 0, z: 5 }, scenery,
    supplies: [{ x: 2, z: 0 }, { x: -9, z: 5 }, { x: 10, z: -5 }, { x: 0, z: 17 },
      { x: -10, z: -7 }, { x: 11, z: 2 }, { x: 0, z: -17 }, { x: 10, z: 17 }],
    objectives: [],
    phases: [
      { at: 0, name: '接敌', interval: 1.8, enemies: ['runner', 'shooter'] },
      { at: 50, name: '异星入侵', interval: 1.2, enemies: ['runner', 'shooter', 'pouncer', 'spitter'] },
      { at: 120, name: '巨兽来袭', interval: 1, enemies: ['runner', 'shooter', 'pouncer', 'spitter'] },
    ],
    sky: '#172326', fog: '#233334', light: '#ffedc8', accent: '#c6d58c',
  },
  {
    id: 'relay', name: '断线重连', subtitle: '通信街区 · 双点修复',
    briefing: '进入两座通信终端的蓝色范围，各累计修复十二秒。击败巨兽，四分钟后到撤离区接应。',
    tactic: '敌人进入蓝圈会打断修复；离圈保留进度。先清近敌，再借掩体换弹。',
    duration: 240, bossAt: 150, bossHealth: 1, maxEnemies: 24,
    spawn: { x: 0, z: 17 }, supplies,
    scenery: [...edges,
      { asset: 'road-barricade', x: -4, z: 3, yaw: 0 },
      { asset: 'road-barricade', x: 4, z: -5, yaw: 0 },
      { asset: 'road-barricade', x: -4, z: -13, yaw: Math.PI / 2 },
      { asset: 'burned-police-car', x: 5, z: 10, yaw: 0, burning: true },
      { asset: 'burned-armored-van', x: -5, z: -6, yaw: 0, burning: true },
    ],
    objectives: [
      { id: 'west-relay', name: '西侧终端', kind: 'relay', x: -9, z: 3, seconds: 12, radius: 2.6 },
      { id: 'east-relay', name: '东侧终端', kind: 'relay', x: 9, z: -7, seconds: 12, radius: 2.6 },
    ],
    extraction: { x: 0, z: 19, radius: 3, seconds: 4 },
    phases: [
      { at: 0, name: '抢修信号', interval: 2.4, enemies: ['runner', 'runner', 'shooter'] },
      { at: 75, name: '侧翼来袭', interval: 1.9, enemies: ['runner', 'shooter', 'pouncer'] },
      { at: 150, name: '守住链路', interval: 2.5, enemies: ['runner', 'shooter', 'pouncer'] },
    ],
    sky: '#142833', fog: '#28414a', light: '#d9f0ff', accent: '#8fd5df',
  },
  {
    id: 'convoy', name: '灰烬补给线', subtitle: '车队遗址 · 物资回收',
    briefing: '从三处车队残骸附近回收物资。每处停留三秒，获得弹药、医疗与一枚手雷。击败巨兽，五分钟后撤离。',
    tactic: '回收不受争夺影响。预留一处医疗物资，沿两条侧路绕过交叉火力。',
    duration: 300, bossAt: 210, bossHealth: 1.1, maxEnemies: 28,
    spawn: { x: 0, z: 18 }, supplies,
    scenery: [...edges,
      { asset: 'burned-armored-van', x: 0, z: 0, yaw: 0, burning: true },
      { asset: 'burned-sedan', x: -6, z: 10, yaw: Math.PI / 2, burning: true },
      { asset: 'burned-police-car', x: 6, z: -10, yaw: Math.PI / 2, burning: true },
      { asset: 'road-barricade', x: -5, z: -6, yaw: Math.PI / 2 },
      { asset: 'road-barricade', x: 5, z: 5, yaw: Math.PI / 2 },
    ],
    objectives: [
      { id: 'medical-cache', name: '南段物资', kind: 'cache', x: -6, z: 15, seconds: 3, radius: 2 },
      { id: 'convoy-cache', name: '车队物资', kind: 'cache', x: 4, z: 0, seconds: 3, radius: 2 },
      { id: 'forward-cache', name: '北段物资', kind: 'cache', x: 6, z: -15, seconds: 3, radius: 2 },
    ],
    extraction: { x: 0, z: -19, radius: 3, seconds: 4 },
    phases: [
      { at: 0, name: '搜索车队', interval: 2.3, enemies: ['runner', 'shooter', 'shooter'] },
      { at: 100, name: '交叉火力', interval: 1.8, enemies: ['runner', 'shooter', 'spitter'] },
      { at: 210, name: '打通补给线', interval: 2.4, enemies: ['runner', 'pouncer', 'spitter'] },
    ],
    sky: '#30271c', fog: '#493a2a', light: '#ffd7a5', accent: '#e2be84',
  },
  {
    id: 'breach', name: '最后封锁', subtitle: '隔离区 · 突破撤离',
    briefing: '依次关闭三座封锁节点，每座累计操作十秒。完成全部节点后才能引出巨兽；击败它并在六分钟后撤离。',
    tactic: '只能操作当前节点。按南、西、北的路线推进，扑击预警出现时立即离圈。',
    orderedObjectives: true, bossRequiresObjectives: true,
    duration: 360, bossAt: 240, bossHealth: 1.25, maxEnemies: 30,
    spawn: { x: 0, z: 18 }, supplies,
    scenery: [...edges,
      { asset: 'road-barricade', x: -4, z: 9, yaw: 0 },
      { asset: 'road-barricade', x: 4, z: 0, yaw: 0 },
      { asset: 'road-barricade', x: -4, z: -10, yaw: 0 },
      { asset: 'road-barricade', x: 7, z: -10, yaw: Math.PI / 2 },
      { asset: 'burned-armored-van', x: -7, z: -3, yaw: 0, burning: true },
      { asset: 'burned-police-car', x: 6, z: 9, yaw: 0, burning: true },
    ],
    objectives: [
      { id: 'south-lock', name: '南段节点', kind: 'relay', x: 0, z: 10, seconds: 10, radius: 2.6 },
      { id: 'west-lock', name: '西段节点', kind: 'relay', x: -11, z: -4, seconds: 10, radius: 2.6 },
      { id: 'north-lock', name: '北段节点', kind: 'relay', x: 0, z: -14, seconds: 10, radius: 2.6 },
    ],
    extraction: { x: 0, z: -19, radius: 3, seconds: 5 },
    phases: [
      { at: 0, name: '关闭封锁', interval: 2.2, enemies: ['runner', 'shooter', 'pouncer'] },
      { at: 120, name: '异星反扑', interval: 1.8, enemies: ['runner', 'shooter', 'pouncer', 'spitter'] },
      { at: 240, name: '突破封锁', interval: 2.4, enemies: ['runner', 'pouncer', 'spitter'] },
    ],
    sky: '#211e2e', fog: '#383344', light: '#e7dfff', accent: '#bdb2eb',
  },
];

export const missionById = (id: string) => missions.find(mission => mission.id === id) ?? missions[0];
export const nextMission = (id: string) => missions[missions.findIndex(mission => mission.id === id) + 1];
export const missionUnlocked = (index: number, completed: readonly string[]) =>
  index >= 0 && index < missions.length && (index < 2 || missions.slice(1, index).every(mission => completed.includes(mission.id)));

// 首张后续地图直接开放，旧版玩家无需重打训练；存档不可用时仍保留本次会话进度。
export const PROGRESS_KEY = 'broken-frontier-campaign-v1';
export function parseProgress(raw: string | null): string[] {
  try {
    const data: unknown = JSON.parse(raw ?? 'null');
    if (!data || typeof data !== 'object' || !('completed' in data) || !Array.isArray(data.completed)) return [];
    const completed: unknown[] = data.completed;
    return missions.filter(mission => completed.includes(mission.id)).map(mission => mission.id);
  } catch { return []; }
}

export function recordMissionCompletion(id: string, previous: readonly string[], storage: () => Pick<Storage, 'getItem' | 'setItem'>) {
  let completed = missions.filter(mission => previous.includes(mission.id) || mission.id === id).map(mission => mission.id);
  try {
    const target = storage();
    completed = [...new Set([...parseProgress(target.getItem(PROGRESS_KEY)), ...completed])];
    target.setItem(PROGRESS_KEY, JSON.stringify({ completed }));
    return { completed, saved: true };
  } catch { return { completed, saved: false }; }
}
