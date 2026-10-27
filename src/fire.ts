import * as T from 'three';
import { scenery, type Scenery } from './level';
import { modelData } from './model-data';

export function createFires(scene: T.Scene, props: readonly Scenery[] = scenery) {
  const sources = props.filter(prop => prop.burning).map(prop => {
    const depth = modelData[prop.asset].size[2], localZ = depth * (prop.asset === 'burned-armored-van' ? -.28 : .3);
    return new T.Vector3(prop.x + Math.sin(prop.yaw) * localZ, .65, prop.z + Math.cos(prop.yaw) * localZ);
  });
  const time = { value: 0 }, material = (smoke: boolean) => new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide,
    blending: smoke ? T.NormalBlending : T.AdditiveBlending,
    uniforms: { fireTime: time },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float fireTime; varying vec2 vUv;
      float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=vUv; float edge=1.0-length((p-0.5)*2.0);
        ${smoke ? `float a=smoothstep(0.0,0.7,edge)*0.12;gl_FragColor=vec4(vec3(0.13,0.15,0.15),a);` : `
        float n=noise(floor(vec2(p.x*12.0,p.y*18.0-fireTime*13.0)));
        float shape=1.0-abs(p.x-0.5)*(2.0+p.y*3.0);
        float a=smoothstep(0.05,0.5,shape+n*0.22)*(1.0-smoothstep(0.35,1.0,p.y));
        vec3 c=mix(vec3(1.0,0.12,0.01),vec3(1.0,0.85,0.25),1.0-p.y);
        gl_FragColor=vec4(c,a*0.65);`} }
    `,
  });
  const flame = new T.InstancedMesh(new T.PlaneGeometry(1, 1), material(false), sources.length * 14);
  const smoke = new T.InstancedMesh(new T.PlaneGeometry(1, 1), material(true), sources.length * 12);
  flame.frustumCulled = smoke.frustumCulled = false; flame.renderOrder = 2; smoke.renderOrder = 3; scene.add(flame, smoke);
  const lights = sources.map(position => { const light = new T.PointLight(0xff742b, 7, 5, 2); light.position.copy(position).add(new T.Vector3(0, 1, 0)); scene.add(light); return light; });
  const dummy = new T.Object3D();
  return { update(seconds: number, camera: T.Camera) {
    time.value = seconds;
    sources.forEach((source, sourceIndex) => {
      for (let i = 0; i < 14; i++) {
        const phase = (seconds * .65 + i * .137) % 1;
        dummy.position.copy(source).add(new T.Vector3(Math.sin(i * 7.3) * .35 + Math.sin(seconds + i) * phase * .2, phase * 1.5, Math.cos(i * 3.7) * .35));
        dummy.quaternion.copy(camera.quaternion); dummy.scale.set(.7 * (1 - phase * .65), 1.2 * (1 - phase * .4), 1); dummy.updateMatrix(); flame.setMatrixAt(sourceIndex * 14 + i, dummy.matrix);
      }
      for (let i = 0; i < 12; i++) {
        const phase = (seconds * .18 + i * .173) % 1;
        dummy.position.copy(source).add(new T.Vector3(phase * .8 + Math.sin(i * 5.4) * .3, 1.1 + phase * 3, Math.cos(i * 4.8) * .35));
        dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(.5 + phase * 1.5); dummy.updateMatrix(); smoke.setMatrixAt(sourceIndex * 12 + i, dummy.matrix);
      }
      lights[sourceIndex].intensity = 6 + Math.sin(seconds * 11 + sourceIndex) * 1.5;
    });
    flame.instanceMatrix.needsUpdate = smoke.instanceMatrix.needsUpdate = true;
  }, dispose() {
    for (const mesh of [flame, smoke]) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
    for (const light of lights) { scene.remove(light); light.dispose(); }
  } };
}
