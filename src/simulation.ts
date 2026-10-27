import { walls, wallsFor } from './level';
import { snapshotDeath, CORPSE_LIMIT, CORPSE_LIFETIME, type FallenEnemy } from './enemy-motion';
import { missions, type Mission, type MissionObjective } from './campaign';
import { enemySpecs, type EnemyKind } from './enemies';
import { muzzlePosition, RIFLE_SPEED, RIFLE_MUZZLE } from './ballistics';
import { AMMO, RELOAD_CUES, type AmmoSound } from './ammo';
import { defaultLoadout, loadoutStats, normalizeLoadout, weaponSpecs, GRENADE, type Loadout } from './weapons';
export type Vec = { x: number; z: number };
export type Wall = Vec & { w: number; d: number; h: number };
export type Enemy = Vec & { id: number; hp: number; maxHp: number; kind: EnemyKind; attack: number; windup?: number; aim?: Vec; charge?: number; attackFlash?: number; moving?: boolean; hitDirection?: Vec; mutation?: string; behavior?: 'charge'|'burst'|'slam'; alerted?:boolean; dormant?: boolean; modifiers?: Partial<{ speed:number; damage:number; range:number; cooldown:number; windup:number }>; };
export type Bullet = Vec & { id: number; vx: number; vz: number; life: number; damage: number; hostile: boolean; y?: number; projectile?: 'rifle' | 'plasma'; barrelStart?: Vec };
export type Drop = Vec & { id: number; value: number; kind: 'xp' | 'ammo' };
export type SupplyCrate = Vec & { id: number; rounds: number; medical?:number; grenades?:number; aidUsed?:boolean; openedAt?: number; emptiedAt?: number };
export type Grenade = Vec & { id: number; y: number; vx: number; vy: number; vz: number; remaining: number; age: number };
export type Effect = Vec & { type: 'shot' | 'flight' | 'hit' | 'kill' | 'hurt' | 'explosion'; end?: Vec; y?: number; direction?: Vec; normal?: Vec; surface?: 'wall' | 'body' | 'ground'; hostile?: boolean; projectile?: 'rifle' | 'plasma' };
export { walls } from './level';
export const LIMIT = 23;
export const DURATION = 180;
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
export function segmentBox(a: Vec, b: Vec, wall: Wall, radius = 0): number {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'z'] as const) {
    const extent = (axis === 'x' ? wall.w : wall.d) / 2 + radius;
    const min = wall[axis] - extent, max = wall[axis] + extent, delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) { if (a[axis] < min || a[axis] > max) return Infinity; }
    else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return Infinity;
    }
  }
  return lo;
}
export function segmentCircle(a: Vec, b: Vec, center: Vec, radius: number): number {
  const dx = b.x - a.x, dz = b.z - a.z, ox = a.x - center.x, oz = a.z - center.z;
  const c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dz * dz, bb = 2 * (ox * dx + oz * dz), disc = bb * bb - 4 * aa * c;
  if (aa < 1e-10 || disc < 0) return Infinity;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : Infinity;
}
export const blocked = (p: Vec, radius = .38, obstacles: readonly Wall[] = walls, limit=LIMIT) => Math.abs(p.x) > limit - radius || Math.abs(p.z) > limit - radius || obstacles.some(w => segmentBox(p, p, w, radius) === 0);
export const visible = (a: Vec, b: Vec, obstacles: readonly Wall[] = walls) => !obstacles.some(w => segmentBox(a, b, w) <= 1);
// 手雷与爆炸使用三维墙体，允许越过低掩体，并能正确停在掩体顶面。
function segmentWall3D(a:Vec&{y:number}, b:Vec&{y:number}, wall:Wall, radius=0) {
  let lo=0,hi=1;
  for(const axis of ['x','y','z'] as const){
    const min=axis==='y'?-radius:wall[axis]-(axis==='x'?wall.w:wall.d)/2-radius;
    const max=axis==='y'?wall.h+radius:wall[axis]+(axis==='x'?wall.w:wall.d)/2+radius;
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-8){if(a[axis]<min||a[axis]>max)return Infinity;}
    else{const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return Infinity;}
  }
  return lo;
}
// 候选点位于可行走街道；生成时还要确认玩家流场可达，避免补给落入建筑。
export const supplySpots: Vec[] = [
  { x: 2, z: 0 }, { x: -9, z: 5 }, { x: 10, z: -5 }, { x: 0, z: 17 },
  { x: -10, z: -7 }, { x: 11, z: 2 }, { x: 0, z: -17 }, { x: 10, z: 17 },
];
export function move(p: Vec, dx: number, dz: number, radius = .38, obstacles: readonly Wall[] = walls, limit=LIMIT) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .15));
  for (let i = 0; i < steps; i++) {
    const nx = { x: p.x + dx / steps, z: p.z }; if (!blocked(nx, radius, obstacles,limit)) p.x = nx.x;
    const nz = { x: p.x, z: p.z + dz / steps }; if (!blocked(nz, radius, obstacles,limit)) p.z = nz.z;
  }
}
export class Simulation {
  friendlyTargets: (Vec & {hp:number})[] = [];
  player = { x: 0, z: 5, hp: 100, maxHp: 100, angle: Math.PI, moveAngle: Math.PI, moving: false };
  enemies: Enemy[] = []; fallenEnemies: FallenEnemy[] = []; bullets: Bullet[] = []; drops: Drop[] = []; effects: Effect[] = [];
  crates: SupplyCrate[] = [];
  grenades: Grenade[] = []; grenadeCount: number = GRENADE.initial; grenadesThrown = 0; grenadeCooldown = 0;
  audioEvents: AmmoSound[] = [];
  state: 'ready' | 'playing' | 'paused' | 'upgrade' | 'won' | 'lost' = 'ready';
  time = 0; kills = 0; xp = 0; level = 1; nextXp = 8;
  ammo: number = AMMO.magazine; magazine: number = AMMO.magazine;
  reserve: number = AMMO.initialReserve; readonly maxReserve = AMMO.maxReserve;
  roundsFired = 0; roundsCollected = 0; cratesOpened = 0;
  pickupNotice = { rounds: 0, until: 0 };
  reload = 0; fire = 0; spawn = 1; damage = 22; fireInterval = .15; speed = 4.4; armor = 0;
  target: Enemy | undefined; id = 1; upgrades = 0;
  bossSpawned = false; bossDefeated = false;
  lastShotAt = -Infinity;
  private equipment: Loadout = defaultLoadout();
  spread = 0; range = 19;
  private suppliesStarted = false; private nextSupply: number = AMMO.resupplySeconds;
  private flows = new Map<number, Map<string, number>>(); private flowTimer = 0;
  private walkable = new Map<string,boolean>();
  readonly walls: Wall[];
  objectives: (MissionObjective & { progress: number; completed: boolean })[];
  extractionProgress = 0;
  objectiveNotice = { text: '', until: 0 };
  constructor(private random: () => number = Math.random, loadout: Loadout = defaultLoadout(), readonly mission: Mission = missions[0]) {
    this.walls = [...wallsFor(mission.scenery),...(mission.collisions??[])];
    this.objectives = mission.objectives.map(objective => ({ ...objective, progress: 0, completed: false }));
    Object.assign(this.player, mission.spawn);
    this.configureLoadout(loadout);
  }
  blocked(p: Vec, radius = .38) { return blocked(p, radius, this.walls,this.mission.bounds??LIMIT); }
  visible(a: Vec, b: Vec) { return visible(a, b, this.walls); }
  hasShot(a:Vec,b:Vec,height=1.3){if(!this.mission.scripted)return this.visible(a,b);return !this.walls.some(w=>(!this.mission.scripted||w.h+.04>=height)&&segmentBox(a,b,w,.08)<=1);}
  move(p: Vec, dx: number, dz: number, radius = .38) { move(p, dx, dz, radius, this.walls,this.mission.bounds??LIMIT); }
  invalidateNavigation() { this.walkable.clear();this.flows.clear();this.flowTimer=0; }
  get objectivesComplete() { return this.objectives.every(objective => objective.completed); }
  get extractionReady() { return this.time >= this.mission.duration && this.bossDefeated && this.objectivesComplete; }
  get phaseIndex() { return this.mission.phases.reduce((index, phase, i) => this.time >= phase.at ? i : index, 0); }
  get phase() { return this.mission.phases[this.phaseIndex]; }
  objectiveAvailable(index: number) {
    return !this.mission.orderedObjectives || this.objectives.slice(0, index).every(objective => objective.completed);
  }
  objectiveContested(objective: MissionObjective) {
    return objective.kind === 'relay' && this.enemies.some(enemy => enemy.hp > 0 && distance(enemy, objective) < objective.radius && this.visible(enemy, objective));
  }
  get activeObjective() {
    return this.objectives.filter((objective, index) => !objective.completed && this.objectiveAvailable(index))
      .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
  }
  private updateObjectives(dt: number) {
    this.objectives.forEach((objective, index) => {
      if (objective.completed || !this.objectiveAvailable(index) || distance(this.player, objective) > objective.radius ||
        !this.visible(this.player, objective) || this.objectiveContested(objective)) return;
      objective.progress = Math.min(objective.seconds, objective.progress + dt);
      if (objective.progress < objective.seconds - 1e-8) return;
      objective.progress = objective.seconds; objective.completed = true;
      const rounds = objective.kind === 'cache' ? 72 : 36, taken = this.collectAmmo(rounds);
      if (taken < rounds) this.drops.push({ x: objective.x, z: objective.z, id: this.id++, kind: 'ammo', value: rounds - taken });
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + (objective.kind === 'cache' ? 30 : 15));
      if (objective.kind === 'cache') this.grenadeCount = Math.min(GRENADE.initial, this.grenadeCount + 1);
      this.objectiveNotice = { text: `${objective.name}已完成 · 弹药与医疗已送达`, until: this.time + 4 };
    });
    const extraction = this.mission.extraction;
    if (extraction && this.extractionReady && distance(this.player, extraction) <= extraction.radius && this.visible(this.player, extraction)) {
      this.extractionProgress = Math.min(extraction.seconds, this.extractionProgress + dt);
    } else this.extractionProgress = 0;
  }
  get loadout(): Loadout { return { weapon: this.equipment.weapon, attachments: [...this.equipment.attachments] }; }
  get weapon() { return this.equipment.weapon; }
  get nextFireInterval() { return Math.max(weaponSpecs[this.weapon].minInterval, this.fireInterval * .86); }
  get canUpgradeFireRate() { return this.nextFireInterval < this.fireInterval; }
  configureLoadout(input: Loadout) {
    if (this.state !== 'ready') return false;
    this.equipment = normalizeLoadout(input);
    const stats = loadoutStats(this.equipment);
    this.damage = stats.damage; this.fireInterval = stats.interval; this.magazine = stats.magazine;
    this.ammo = stats.magazine; this.spread = stats.spread; this.range = stats.range;
    return true;
  }
  throwGrenade() {
    if (this.state !== 'playing' || this.grenadeCount <= 0 || this.grenadeCooldown > 0 || this.grenades.length >= GRENADE.maximum) return false;
    const a = this.player.angle;
    const speed=this.target&&this.target.hp>0?Math.min(GRENADE.speed,Math.max(1.5,distance(this.player,this.target)/1.05)):GRENADE.speed;
    // 从角色中心发出并连续扫掠，不能跳过紧贴身前的掩体。
    this.grenades.push({ ...this.player, id: this.id++, y: 1.22, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
      vy: 4.2, remaining: GRENADE.fuse, age: 0 });
    this.grenadeCount--; this.grenadesThrown++; this.grenadeCooldown = GRENADE.cooldown;
    return true;
  }
  private updateGrenades(dt: number) {
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    for (const grenade of this.grenades) {
      const travel = Math.min(dt, grenade.remaining), start = { x: grenade.x, z: grenade.z };
      const end = { x: start.x + grenade.vx * travel, z: start.z + grenade.vz * travel };
      const height = grenade.y + grenade.vy * travel - .5 * GRENADE.gravity * travel * travel;
      let collision = Infinity, obstacle:Wall|undefined;
      for (const wall of this.walls) {
        const t=segmentWall3D({...start,y:grenade.y},{...end,y:height},wall,.1);
        if(t<collision){collision=t;obstacle=wall;}
      }
      let landed=false;
      // 投掷物到达边界后停留，保持在游戏区域内。
      if (collision <= 1) {
        const t = Math.max(0, collision - .001);
        grenade.x = start.x + (end.x - start.x) * t; grenade.z = start.z + (end.z - start.z) * t;
        grenade.vx = grenade.vz = 0;
        const impact=grenade.y+(height-grenade.y)*collision;
        if(obstacle&&grenade.vy<=0&&impact>=obstacle.h+.099){grenade.y=obstacle.h+.1001;grenade.vy=0;landed=true;}
      } else {
        const limit=this.mission.bounds??LIMIT;
        grenade.x = Math.max(-limit + .1, Math.min(limit - .1, end.x));
        grenade.z = Math.max(-limit + .1, Math.min(limit - .1, end.z));
      }
      if(!landed){grenade.y = Math.max(.1, height); grenade.vy -= GRENADE.gravity * travel;}
      if (grenade.y <= .1) { grenade.vx *= Math.exp(-travel * 10); grenade.vz *= Math.exp(-travel * 10); grenade.vy = 0; }
      grenade.remaining = Math.max(0, grenade.remaining - dt); grenade.age += travel;
      if (grenade.remaining === 0) {
        this.effects.push({ ...grenade, type: 'explosion' });
        for (const enemy of this.enemies) {
          const d = distance(grenade, enemy);
          const clear=!this.walls.some(w=>segmentWall3D(grenade,{...enemy,y:1.1},w)<=1);
          if (enemy.hp > 0 && d <= GRENADE.radius && clear) {
            enemy.hp -= GRENADE.damage * (1 - .55 * d / GRENADE.radius);
            enemy.hitDirection = { x: enemy.x - grenade.x, z: enemy.z - grenade.z };
          }
        }
      }
    }
    this.grenades = this.grenades.filter(grenade => grenade.remaining > 0);
  }
  start() { if (this.state === 'ready') this.state = 'playing'; }
  togglePause() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; }
  requestReload() {
    if (this.state !== 'playing' || this.reload > 0 || this.ammo >= this.magazine || this.reserve <= 0) return false;
    this.reload = AMMO.reloadSeconds;
    return true;
  }
  private collectAmmo(rounds: number) {
    const taken = Math.min(rounds, this.maxReserve - this.reserve);
    if (taken <= 0) return 0;
    this.reserve += taken; this.roundsCollected += taken;
    this.pickupNotice = { rounds: (this.pickupNotice.until > this.time ? this.pickupNotice.rounds : 0) + taken, until: this.time + 1.8 };
    // 同一步内吸到多份弹药只响一次，防止音源叠加。
    if (!this.audioEvents.includes('ammo-pickup')) this.audioEvents.push('ammo-pickup');
    return taken;
  }
  private spawnSupply() {
    if (this.crates.filter(c => c.rounds > 0).length >= AMMO.maxCrates) return;
    const flow = this.flows.get(.38);
    const spots = this.mission.supplies.filter(p => !this.blocked(p, .65) && distance(p, this.player) > 3 &&
      flow?.has(`${p.x},${p.z}`) && !this.crates.some(c => distance(c, p) < 2));
    if (!spots.length) return;
    const p = spots[Math.min(spots.length - 1, Math.floor(this.random() * spots.length))];
    this.crates.push({ ...p, id: this.id++, rounds: AMMO.crateRounds });
  }
  choose(choice: number) {
    if (this.state !== 'upgrade') return;
    if (choice === 0) this.damage *= 1.24;
    if (choice === 1) {
      // 达到当前武器上限后保留本次强化，鼠标和数字快捷键都不能空耗选择。
      if (!this.canUpgradeFireRate) return;
      this.fireInterval = this.nextFireInterval;
    }
    if (choice === 2) { this.player.maxHp += 20; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40); this.armor = Math.min(.5, this.armor + .06); }
    this.upgrades++; this.state = 'playing';
  }
  hurt(amount: number) { this.player.hp = Math.max(0, this.player.hp - amount * (1 - this.armor)); this.effects.push({ ...this.player, type: 'hurt' }); }
  private updateFlow() {
    this.flows.clear();
    for (const radius of [.38, .75, 1.25]) {
      const flow = new Map<string, number>(); this.flows.set(radius, flow);
      const origins: Vec[] = [];
      for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)origins.push({x:Math.round(this.player.x)+x,z:Math.round(this.player.z)+z});
      const start = origins.filter(p=>!this.blocked(p,radius)).sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];
      if(!start)continue;
      const queue = [start]; flow.set(`${start.x},${start.z}`, 0);
      for (let i=0;i<queue.length;i++) {
        const p=queue[i], cost=flow.get(`${p.x},${p.z}`)!+1;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const q={x:p.x+dx,z:p.z+dz},key=`${q.x},${q.z}`;
          if(this.mission.scripted&&(Math.abs(q.x-this.player.x)>32||Math.abs(q.z-this.player.z)>38))continue;
          const cacheKey=`${radius}:${key}`;
          let pass=this.walkable.get(cacheKey);
          if(pass===undefined){pass=!this.blocked(q,radius);this.walkable.set(cacheKey,pass);}
          if(!flow.has(key)&&pass){flow.set(key,cost);queue.push(q);}
        }
      }
    }
  }
  addEnemy(kind: EnemyKind, p: Vec) {
    const spec=enemySpecs[kind], hp=kind==='boss'?spec.hp*this.mission.bossHealth:spec.hp+Math.min(this.time,180)*.16;
    const enemy:Enemy={...p,id:this.id++,hp,maxHp:hp,kind,attack:1,windup:0,charge:0,attackFlash:0};
    this.enemies.push(enemy); return enemy;
  }
  private spawnEnemy(kind?: EnemyKind) {
    for(let n=0;n<48;n++) {
      const angle=this.random()*Math.PI*2,p={x:this.player.x+Math.sin(angle)*17,z:this.player.z+Math.cos(angle)*17};
      const pick=kind??(this.mission.id!=='street'?this.phase.enemies[Math.min(this.phase.enemies.length-1,Math.floor(this.random()*this.phase.enemies.length))]:(this.time<25?(this.random()<.45?'shooter':'runner'):this.time<50?(this.random()<.35?'pouncer':this.random()<.5?'shooter':'runner'):['runner','shooter','pouncer','spitter'][Math.floor(this.random()*4)] as EnemyKind));
      const radius=enemySpecs[pick].radius;
      if(this.blocked(p,radius)||this.enemies.some(e=>distance(e,p)<enemySpecs[e.kind].radius+radius))continue;
      const flow=this.flows.get(radius>.9?1.25:radius>.5?.75:.38);
      if(!flow?.has(`${Math.round(p.x)},${Math.round(p.z)}`))continue;
      this.addEnemy(pick,p);return true;
    }
    return false;
  }
  private updateEnemy(e: Enemy,dt:number) {
    if(e.dormant)return;
    const target=[this.player,...this.friendlyTargets].filter(t=>t.hp>0).sort((a,b)=>distance(e,a)-distance(e,b))[0]??this.player;
    const hurt=(amount:number)=>{if(target===this.player)this.hurt(amount);else target.hp=Math.max(0,target.hp-amount);};
    const spec={...enemySpecs[e.kind],...e.modifiers},d=distance(e,target),sight=this.visible(e,target);
    e.attack-=dt;e.attackFlash=Math.max(0,(e.attackFlash??0)-dt);e.moving=false;
    if((e.charge??0)>0&&e.aim) {
      e.charge=Math.max(0,e.charge!-dt);e.moving=true;
      this.move(e,e.aim.x*8*dt,e.aim.z*8*dt,spec.radius);
      if(distance(e,target)<spec.radius+.5&&this.visible(e,target)){hurt(spec.damage);e.charge=0;}
      return;
    }
    if((e.windup??0)>0) {
      e.windup=Math.max(0,e.windup!-dt);
      if(e.windup===0) {
        e.attack=spec.cooldown;e.attackFlash=.22;
        if((e.kind==='pouncer'||e.behavior==='charge')&&e.aim){const len=distance(e,e.aim);e.aim=len>.01?{x:(e.aim.x-e.x)/len,z:(e.aim.z-e.z)/len}:{x:0,z:0};e.charge=.7;}
        else if(e.kind==='boss'&&e.behavior!=='burst'&&e.aim){if(distance(target,e.aim)<3.6&&this.visible(e,target))hurt(spec.damage);this.effects.push({...e.aim,type:'hit'});}
        else if(e.kind==='runner'){if(d<spec.range+.15&&sight)hurt(spec.damage);}
        else if(e.aim) {
          const direction=Math.atan2(e.aim.x-e.x,e.aim.z-e.z);
          for(const spread of e.behavior==='burst'?[-.55,-.35,-.15,.15,.35,.55]:e.kind==='spitter'?[-.14,0,.14]:[0]) {
            const speed=e.kind==='spitter'||e.behavior==='burst'?6.5:10;
            const angle=direction+spread, plasma=e.kind==='spitter'||e.behavior==='burst', origin=plasma?{...e,y:1.2}:muzzlePosition(e,angle,true);
            this.bullets.push({x:origin.x,y:origin.y,z:origin.z,id:this.id++,vx:Math.sin(angle)*speed,vz:Math.cos(angle)*speed,life:2.4,damage:spec.damage,hostile:true,projectile:plasma?'plasma':'rifle',barrelStart:{x:e.x,z:e.z}});
            if(!plasma)this.effects.push({...origin,type:'shot',hostile:true,direction:{x:Math.sin(angle),z:Math.cos(angle)}});
          }
        }
      }
      return;
    }
    if(e.attack<=0&&sight&&d<spec.range&&d>.01){e.aim={x:target.x,z:target.z};e.windup=spec.windup;return;}
    const stopsToShoot=(e.kind==='shooter'||e.kind==='spitter')&&d<spec.range*.72&&sight;
    if(!stopsToShoot&&d>spec.radius+.5) {
      let goal:Vec=target;
      if(!sight||this.walls.some(w=>segmentBox(e,target,w,spec.radius)<=1)) {
        const radius=spec.radius>.9?1.25:spec.radius>.5?.75:.38,flow=this.flows.get(radius);
        const x=Math.round(e.x),z=Math.round(e.z);
        const neighbors=[[0,0],[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>({x:x+dx,z:z+dz}));
        neighbors.sort((a,b)=>(flow?.get(`${a.x},${a.z}`)??Infinity)-(flow?.get(`${b.x},${b.z}`)??Infinity));goal=neighbors[0];
      }
      const gd=distance(e,goal),oldX=e.x,oldZ=e.z;
      if(gd>.05)this.move(e,(goal.x-e.x)/gd*spec.speed*dt,(goal.z-e.z)/gd*spec.speed*dt,spec.radius);
      e.moving=Math.hypot(e.x-oldX,e.z-oldZ)>.0001;
    }
  }
  step(dt: number, input: Vec) {
    this.effects = [];
    this.audioEvents = [];
    if (this.state !== 'playing') return;
    this.time += dt;
    this.fallenEnemies = this.fallenEnemies.filter(enemy => this.time - enemy.fallenAt < CORPSE_LIFETIME);
    const length = Math.hypot(input.x,input.z), scale = length > 1 ? 1/length : 1;
    this.player.moving = length > .01;
    if (this.player.moving) this.player.moveAngle = Math.atan2(input.x,input.z);
    this.move(this.player,input.x*scale*this.speed*dt,input.z*scale*this.speed*dt);
    this.flowTimer -= dt; if (this.flowTimer <= 0 && (!this.mission.scripted||this.enemies.length>0)) { this.updateFlow(); this.flowTimer = this.mission.scripted?1:.4; }
    if (!this.mission.scripted&&!this.suppliesStarted) { for (let i = 0; i < AMMO.initialCrates; i++) this.spawnSupply(); this.suppliesStarted = true; }
    if (!this.mission.scripted&&this.time >= this.nextSupply) { this.spawnSupply(); this.nextSupply += AMMO.resupplySeconds; }
    if(!this.mission.scripted&&this.time>=this.mission.bossAt&&!this.bossSpawned&&(!this.mission.bossRequiresObjectives||this.objectivesComplete)){this.bossSpawned=this.spawnEnemy('boss');}
    this.spawn-=dt;
    if(!this.mission.scripted&&this.spawn<=0){
      if(this.enemies.length<this.mission.maxEnemies-(this.bossSpawned?0:1)&&this.time<this.mission.duration)this.spawnEnemy();
      this.spawn=this.mission.id==='street'?Math.max(.7,1.8-this.time/180):this.phase.interval;
    }
    for(const e of this.enemies)if(e.hp>0)this.updateEnemy(e,dt);
    // 分离半径跟随实际体型，墙体约束始终生效。
    for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++) {
      const a=this.enemies[i],b=this.enemies[j],d=distance(a,b),ra=enemySpecs[a.kind].radius,rb=enemySpecs[b.kind].radius;
      if(d<ra+rb&&d>.001){const push=(ra+rb-d)*.3;this.move(a,(a.x-b.x)/d*push,(a.z-b.z)/d*push,ra);this.move(b,(b.x-a.x)/d*push,(b.z-a.z)/d*push,rb);}
    }
    this.target = this.enemies.filter(e=>e.hp>0&&!e.dormant&&distance(e,this.player)<this.range&&this.hasShot(this.player,e)).sort((a,b)=>distance(a,this.player)-distance(b,this.player))[0];
    if(this.target) this.player.angle = Math.atan2(this.target.x-this.player.x,this.target.z-this.player.z);
    else if(this.player.moving) this.player.angle=this.player.moveAngle;
    this.fire -= dt;
    if(this.reload>0) {
      const elapsed = AMMO.reloadSeconds - this.reload;
      this.reload=Math.max(0,this.reload-dt);
      for (const cue of RELOAD_CUES) if (elapsed < cue.at && AMMO.reloadSeconds - this.reload >= cue.at) this.audioEvents.push(cue.sound);
      if(this.reload===0) { const loaded=Math.min(this.magazine-this.ammo,this.reserve);this.ammo+=loaded;this.reserve-=loaded; }
    }
    if(this.ammo===0)this.requestReload();
    if(this.player.hp>0&&this.target&&this.fire<=0&&this.reload===0&&this.ammo>0) {
      const a=this.player.angle+(this.random()-.5)*2*this.spread,origin=muzzlePosition(this.player,this.player.angle,false,this.weapon);
      this.bullets.push({x:origin.x,y:origin.y,z:origin.z,id:this.id++,vx:Math.sin(a)*RIFLE_SPEED,vz:Math.cos(a)*RIFLE_SPEED,life:this.range/RIFLE_SPEED,damage:this.damage,hostile:false,projectile:'rifle',barrelStart:{x:this.player.x,z:this.player.z}});
      this.lastShotAt=this.time;
      this.effects.push({...origin,type:'shot',hostile:false,direction:{x:Math.sin(a),z:Math.cos(a)}}); this.ammo--;this.roundsFired++;
      // 保留不足一帧的余量，小幅射速加成不会被六十赫兹取整吞掉；空闲后不累积连射债务。
      this.fire=this.fireInterval+Math.max(-dt,this.fire);
      if(this.ammo===0&&!this.requestReload())this.audioEvents.push('empty');
    }
    for(const b of this.bullets) {
      const travel=Math.min(dt,b.life),start=b.barrelStart??{x:b.x,z:b.z},end={x:b.x+b.vx*travel,z:b.z+b.vz*travel};
      delete b.barrelStart;
      let t=Infinity,wall:Wall|undefined;
      for(const w of this.walls){if(this.mission.scripted&&(b.y??1.3)>w.h+.04)continue;const h=segmentBox(start,end,w,.04);if(h<t){t=h;wall=w;}}
      let victim: Enemy | 'player' | undefined;
      let allyVictim: (Vec&{hp:number})|undefined;
      if(b.hostile) {const h=segmentCircle(start,end,this.player,.38);if(h<t){t=h;victim='player';}for(const ally of this.friendlyTargets){if(ally.hp<=0)continue;const hit=segmentCircle(start,end,ally,.38);if(hit<t){t=hit;victim=undefined;allyVictim=ally;}}}
      else for(const e of this.enemies) if(e.hp>0) {const h=segmentCircle(start,end,e,enemySpecs[e.kind].hitRadius);if(h<t){t=h;victim=e;}}
      const stop=t<=1?{x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t}:end;
      const speed=Math.hypot(b.vx,b.vz),direction={x:b.vx/speed,z:b.vz/speed},height=b.y??(b.hostile?1.22:RIFLE_MUZZLE.y);
      // 枪管前的碰撞仍然参与判定，避免贴墙或贴身射击从目标后面出弹。
      if((stop.x-b.x)*b.vx+(stop.z-b.z)*b.vz>0)this.effects.push({x:b.x,z:b.z,end:stop,type:'flight',y:height,hostile:b.hostile,projectile:b.projectile,direction});
      if(t<=1) {
        let normal={x:-direction.x,z:-direction.z};
        if(!victim&&wall){const nx=(stop.x-wall.x)/(wall.w/2+.04),nz=(stop.z-wall.z)/(wall.d/2+.04);normal=Math.abs(nx)>Math.abs(nz)?{x:Math.sign(nx),z:0}:{x:0,z:Math.sign(nz)};}
        b.life=0;this.effects.push({...stop,type:'hit',y:height,surface:victim?'body':'wall',normal,direction,hostile:b.hostile,projectile:b.projectile});
        if(allyVictim)allyVictim.hp=Math.max(0,allyVictim.hp-b.damage);else if(victim==='player')this.hurt(b.damage);else if(victim) { victim.hp-=b.damage;if(b.damage>0)victim.hitDirection={...direction}; }
      }
      b.x=stop.x;b.z=stop.z;b.life-=dt;
    }
    this.bullets=this.bullets.filter(b=>b.life>0);
    this.updateGrenades(dt);
    for(const e of this.enemies) if(e.hp<=0){
      this.kills++;if(e.kind==='boss')this.bossDefeated=true;
      this.drops.push({x:e.x,z:e.z,value:enemySpecs[e.kind].xp,id:this.id++,kind:'xp'});
      if(e.kind==='boss'||this.random()<AMMO.dropChance)this.drops.push({x:e.x,z:e.z,value:e.kind==='boss'?AMMO.bossRounds:AMMO.dropRounds,id:this.id++,kind:'ammo'});
      this.effects.push({...e,type:'kill'});
      this.fallenEnemies.push(snapshotDeath(e, this.player, this.time));
    }
    this.enemies=this.enemies.filter(e=>e.hp>0);
    if(this.fallenEnemies.length>CORPSE_LIMIT)this.fallenEnemies.splice(0,this.fallenEnemies.length-CORPSE_LIMIT);
    if(this.target&&this.target.hp<=0)this.target=undefined;
    this.drops=this.drops.filter(d=>{
      const n=distance(d,this.player),ammo=d.kind==='ammo';
      if(!this.visible(d,this.player)||(ammo&&this.reserve>=this.maxReserve))return true;
      if(n<(ammo?AMMO.pickupRadius:1.1)){if(ammo)d.value-=this.collectAmmo(d.value);else{this.xp+=d.value;return false;}return d.value>0;}
      if(n<3)this.move(d,(this.player.x-d.x)*Math.min(1,dt*5),(this.player.z-d.z)*Math.min(1,dt*5),.12);
      return true;
    });
    for(const crate of this.crates)if(crate.rounds>0&&distance(crate,this.player)<AMMO.pickupRadius&&this.visible(crate,this.player)){
      const taken=this.collectAmmo(crate.rounds);
      if(taken>0){
        if(crate.openedAt===undefined){crate.openedAt=this.time;this.cratesOpened++;this.audioEvents.push('crate-open');}
        crate.rounds-=taken;if(crate.rounds===0)crate.emptiedAt=this.time;
      }
    }
    this.crates=this.crates.filter(c=>c.emptiedAt===undefined||this.time-c.emptiedAt<1);
    if(this.ammo===0)this.requestReload();
    if(this.player.hp>0)this.updateObjectives(dt);
    if(this.player.hp<=0) this.state='lost';
    else if(!this.mission.scripted&&this.extractionReady&&(!this.mission.extraction||this.extractionProgress>=this.mission.extraction.seconds-1e-8))this.state='won';
    else if(this.xp>=this.nextXp&&(!this.mission.scripted||this.upgrades<3)){this.xp-=this.nextXp;this.nextXp+=5;this.level++;this.state='upgrade';}
  }
}
