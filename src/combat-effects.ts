import * as T from 'three';
import type { Bullet, Effect } from './simulation';

type Particle = {
  position: T.Vector3; velocity: T.Vector3; color: T.Color;
  life: number; age: number; width: number; length: number; growth: number;
  style: number; opacity: number; gravity: number; drag: number; seed: number;
  axis?: T.Vector3; smoke: boolean;
};
type Casing = { position: T.Vector3; velocity: T.Vector3; rotation: T.Euler; spin: T.Vector3; age: number; bounced: boolean };
const CAPACITY = 384, CASE_CAPACITY = 64;

// 条带位于世界坐标，沿实际飞行方向延伸；相机只决定条带朝向。
export function streakMatrix(from: T.Vector3, to: T.Vector3, width: number, camera: T.Vector3, matrix = new T.Matrix4()) {
  const along = to.clone().sub(from), length = along.length();
  if (length < .00001) return matrix.makeScale(0, 0, 0);
  along.divideScalar(length);
  const center = from.clone().add(to).multiplyScalar(.5), view = camera.clone().sub(center).normalize();
  const across = new T.Vector3().crossVectors(along, view);
  if (across.lengthSq() < .000001) across.crossVectors(along, Math.abs(along.y) < .9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0));
  across.normalize();
  matrix.makeBasis(across.multiplyScalar(width), along.multiplyScalar(length), new T.Vector3().crossVectors(across, along).normalize());
  return matrix.setPosition(center);
}

export function createCombatEffects(scene: T.Scene, random: () => number = Math.random) {
  function layer(smoke: boolean) {
    const geometry = new T.PlaneGeometry(1, 1);
    const data = new T.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    geometry.setAttribute('effectData', data);
    const material = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false,
      blending: smoke ? T.NormalBlending : T.AdditiveBlending,
      vertexShader: `attribute vec3 effectData; varying vec2 vUv; varying vec3 vColor; varying vec3 vData;
        void main(){vUv=uv;vColor=instanceColor;vData=effectData;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vUv; varying vec3 vColor; varying vec3 vData;
        void main(){vec2 p=vUv*2.0-1.0;float shape;
          if(vData.y<0.5){shape=exp(-p.x*p.x*22.0)*smoothstep(0.0,0.18,vUv.y)*(1.0-smoothstep(0.82,1.0,vUv.y));}
          else if(vData.y<1.5){float taper=1.0+vUv.y*2.4;float edge=abs(p.x*taper)+vUv.y*.52;
            float ripple=sin(vUv.y*34.0+vData.z*19.0)*sin(vUv.x*23.0+vData.z)*.11;
            shape=(1.0-smoothstep(.18,.95,edge+ripple))*(1.0-smoothstep(.55,1.0,vUv.y));}
          else {float r=length(p);float noise=sin(p.x*12.0+vData.z)*sin(p.y*9.0-vData.z)*.08;
            shape=pow(max(0.0,1.0-r+noise),2.0);}
          float alpha=shape*vData.x;if(alpha<.003)discard;
          vec3 color=vColor;
          ${smoke ? '' : 'color=mix(vColor,vec3(1.0,.94,.76),shape*.48);'}
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new T.InstancedMesh(geometry, material, CAPACITY);
    mesh.setColorAt(0, new T.Color());mesh.count = 0;mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.instanceColor!.setUsage(T.DynamicDrawUsage);
    data.setUsage(T.DynamicDrawUsage);mesh.renderOrder = smoke ? 2 : 1;scene.add(mesh);
    return { mesh, data };
  }
  const glow = layer(false), smoke = layer(true);
  const cases = new T.InstancedMesh(new T.CylinderGeometry(.017, .017, .075, 5), new T.MeshStandardMaterial({ color: 0xb99a54, metalness: .72, roughness: .34 }), CASE_CAPACITY);
  cases.count = 0;cases.frustumCulled = false;cases.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(cases);
  const plasma = new T.InstancedMesh(new T.SphereGeometry(.09, 8, 6), new T.MeshBasicMaterial({ color: 0xb9d37c, toneMapped: false }), 128);
  plasma.count = 0;plasma.frustumCulled = false;scene.add(plasma);
  const lights = Array.from({ length: 3 }, () => { const light = new T.PointLight(0xffbc72, 0, 2.7, 2);scene.add(light);return { light, age: 1 }; });
  const particles: Particle[] = [], casings: Casing[] = [];
  const dummy = new T.Object3D(), matrix = new T.Matrix4(), white = new T.Color(0xffd499), dust = new T.Color(0x777b72);
  let shots = 0, hits = 0;
  const jitter = (scale: number) => (random() - .5) * scale;
  function add(position: T.Vector3, options: Partial<Omit<Particle, 'position'>> = {}) {
    if (particles.length >= CAPACITY - 32) particles.shift();
    particles.push({ position: position.clone(), velocity: new T.Vector3(), color: white, life: .12, age: 0, width: .1, length: .1, growth: 0,
      style: 2, opacity: 1, gravity: 0, drag: 0, seed: random() * 100, smoke: false, ...options });
  }
  function emit(effect: Effect) {
    const position = new T.Vector3(effect.x, effect.y ?? .12, effect.z), direction = new T.Vector3(effect.direction?.x ?? 0, 0, effect.direction?.z ?? 1);
    if (effect.type === 'explosion') {
      add(position, { width: 1.2, length: 1.2, growth: 6, life: .18, opacity: 1, color: new T.Color(0xffc77b) });
      for(let i=0;i<24;i++) {
        const angle=random()*Math.PI*2, speed=2+random()*5;
        add(position,{velocity:new T.Vector3(Math.sin(angle)*speed,1+random()*4,Math.cos(angle)*speed),width:.09,length:.18,life:.25+random()*.4,gravity:8,drag:2,color:new T.Color(0xffa34c)});
      }
      for(let i=0;i<9;i++) add(position,{smoke:true,width:.6,length:.6,growth:2,life:.8+random()*.35,opacity:.3,color:dust,
        velocity:new T.Vector3(jitter(2.2),.8+random(),jitter(2.2)),drag:1});
      const light=lights.reduce((a,b)=>a.age>b.age?a:b);light.light.position.copy(position);light.age=0;
    } else if (effect.type === 'shot') {
      shots++;
      const size = .8 + random() * .4;
      add(position.clone().addScaledVector(direction, .13 * size), { axis: direction, width: .21 * size, length: .46 * size, style: 1, life: .033, color: new T.Color(0xffa548), opacity: .92 });
      add(position, { width: .23, length: .23, life: .023, opacity: .8 });
      for (let i = 0; i < 2; i++) add(position, { smoke: true, width: .12, length: .16, growth: .55, life: .28 + random() * .18,
        opacity: .24, color: dust, velocity: direction.clone().multiplyScalar(.45 + random() * .5).add(new T.Vector3(jitter(.18), .35 + random() * .2, jitter(.18))), drag: 2 });
      const light = lights.reduce((a, b) => a.age > b.age ? a : b);light.light.position.copy(position);light.age = 0;
      if (casings.length >= CASE_CAPACITY) casings.shift();
      const side = new T.Vector3(direction.z, 0, -direction.x);
      casings.push({ position: position.clone().addScaledVector(direction, -.5).addScaledVector(side, .09),
        velocity: side.multiplyScalar(1.3 + random() * .9).addScaledVector(direction, -.35).add(new T.Vector3(0, 1.1 + random() * .7, 0)),
        rotation: new T.Euler(random() * 3, random() * 3, random() * 3), spin: new T.Vector3(jitter(25), jitter(25), jitter(25)), age: 0, bounced: false });
    } else if (effect.type === 'flight' && effect.end && !effect.hostile) {
      const end = new T.Vector3(effect.end.x, position.y, effect.end.z), length = Math.min(1.6, end.distanceTo(position));
      // 尾迹只占最后一小段，不保留从枪口连到目标的整条光线。
      const center = end.clone().addScaledVector(direction, -length / 2);
      add(center, { axis: direction, width: .038, length, life: .038, style: 0, opacity: .82 });
      add(center, { axis: direction, width: .105, length, life: .026, style: 0, opacity: .13, color: new T.Color(0xffaa4d) });
    } else if (effect.type === 'hit') {
      hits++;
      const wall = effect.surface === 'wall', normal = new T.Vector3(effect.normal?.x ?? 0, 0, effect.normal?.z ?? 0);
      if (wall) {
        add(position, { width: .17, length: .17, life: .045, opacity: .8 });
        for (let i = 0; i < 5; i++) add(position, { style: 0, width: .023, length: .12 + random() * .12, life: .09 + random() * .11, gravity: 8,
          velocity: normal.clone().multiplyScalar(1 + random() * 2).add(new T.Vector3(jitter(2.5), .3 + random() * 2, jitter(2.5))), drag: 1.8, color: new T.Color(0xffb66b) });
      }
      for (let i = 0; i < (wall ? 4 : 3); i++) add(position, { smoke: true, width: .08 + random() * .07, length: .14, growth: wall ? .7 : .4,
        life: .18 + random() * .18, opacity: wall ? .36 : .28, color: wall ? dust : new T.Color(0x71634e),
        velocity: normal.clone().multiplyScalar(.3 + random() * .5).add(new T.Vector3(jitter(.4), random() * .7, jitter(.4))), drag: 3 });
    } else if (effect.type === 'kill') {
      for (let i = 0; i < 6; i++) add(position, { smoke: true, color: dust, width: .18, length: .16, growth: .8, life: .35 + random() * .2,
        opacity: .32, velocity: new T.Vector3(jitter(1.8), random() * .8, jitter(1.8)), drag: 3 });
    }
  }
  function step(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1);continue; }
      p.velocity.multiplyScalar(Math.exp(-p.drag * dt));p.velocity.y -= p.gravity * dt;p.position.addScaledVector(p.velocity, dt);
    }
    for (let i = casings.length - 1; i >= 0; i--) {
      const c = casings[i];c.age += dt;
      if (c.age > 2.2) { casings.splice(i, 1);continue; }
      c.velocity.y -= 9.8 * dt;c.position.addScaledVector(c.velocity, dt);
      if (c.position.y < .035) {
        c.position.y = .035;
        if (!c.bounced) { c.velocity.y = Math.abs(c.velocity.y) * .28;c.velocity.x *= .5;c.velocity.z *= .5;c.bounced = true; }
        else { c.velocity.set(0, 0, 0);c.spin.set(0, 0, 0); }
      }
      c.rotation.x += c.spin.x * dt;c.rotation.y += c.spin.y * dt;c.rotation.z += c.spin.z * dt;
    }
    for (const entry of lights) { entry.age += dt;entry.light.intensity = 2.8 * Math.max(0, 1 - entry.age / .045); }
  }
  function render(camera: T.Camera, bullets: Bullet[]) {
    let glowCount = 0, smokeCount = 0, plasmaCount = 0;
    function write(p: Particle) {
      const target = p.smoke ? smoke : glow, index = p.smoke ? smokeCount++ : glowCount++;
      const growth = p.growth * p.age, width = p.width + growth, length = p.length + growth;
      if (p.axis) streakMatrix(p.position.clone().addScaledVector(p.axis, -length / 2), p.position.clone().addScaledVector(p.axis, length / 2), width, camera.position, matrix);
      else if (p.style === 0 && p.velocity.lengthSq() > .001) streakMatrix(p.position.clone().addScaledVector(p.velocity.clone().normalize(), -length / 2), p.position.clone().addScaledVector(p.velocity.clone().normalize(), length / 2), width, camera.position, matrix);
      else { dummy.position.copy(p.position);dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(p.seed);dummy.scale.set(width, length, 1);dummy.updateMatrix();matrix.copy(dummy.matrix); }
      target.mesh.setMatrixAt(index, matrix);target.mesh.setColorAt(index, p.color);
      const remaining = 1 - p.age / p.life;
      target.data.setXYZ(index, p.opacity * remaining * remaining * (p.smoke ? Math.min(1, p.age * 40) : 1), p.style, p.seed);
    }
    for (const p of particles) write(p);
    for (const b of bullets) {
      if (!b.hostile || glowCount >= CAPACITY) continue;
      const speed = Math.hypot(b.vx, b.vz), axis = new T.Vector3(b.vx / speed, 0, b.vz / speed), organic = b.projectile === 'plasma';
      write({ position: new T.Vector3(b.x, b.y??1.22, b.z).addScaledVector(axis, organic ? -.17 : -.15), velocity: new T.Vector3(), color: new T.Color(organic ? 0xb9d37c : 0xff9a70),
        age: 0, life: 1, width: organic ? .12 : .045, length: organic ? .4 : .34, growth: 0, style: 0, opacity: .85, gravity: 0, drag: 0, seed: b.id, smoke: false, axis });
      if (organic && plasmaCount < 128) { dummy.position.set(b.x, b.y??1.22, b.z);dummy.rotation.set(0, 0, 0);dummy.scale.setScalar(1);dummy.updateMatrix();plasma.setMatrixAt(plasmaCount++, dummy.matrix); }
    }
    glow.mesh.count = glowCount;smoke.mesh.count = smokeCount;plasma.count = plasmaCount;
    for (const target of [glow, smoke]) { target.mesh.instanceMatrix.needsUpdate = true;target.mesh.instanceColor!.needsUpdate = true;target.data.needsUpdate = true; }
    for (let i = 0; i < casings.length; i++) { const c = casings[i];dummy.position.copy(c.position);dummy.rotation.copy(c.rotation);dummy.scale.setScalar(Math.min(1, (2.2 - c.age) * 4));dummy.updateMatrix();cases.setMatrixAt(i, dummy.matrix); }
    cases.count = casings.length;cases.instanceMatrix.needsUpdate = true;plasma.instanceMatrix.needsUpdate = true;
  }
  return { emit, step, render,
    clear() { particles.length = casings.length = 0;shots = hits = 0;for (const entry of lights) { entry.age = 1;entry.light.intensity = 0; }for (const mesh of [glow.mesh, smoke.mesh, cases, plasma]) mesh.count = 0; },
    stats() { return { particles: particles.length, casings: casings.length, shots, hits }; },
  };
}
