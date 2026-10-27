import * as T from 'three';
import type { Simulation } from './simulation';

// 地面投影只表达交互范围，不增加看不见的碰撞；掩体判定仍来自关卡配置。
export function createMissionField(scene: T.Scene) {
  const group = new T.Group(); scene.add(group);
  const markers: { root: T.Group; ring: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>; beam: T.Mesh<T.CylinderGeometry, T.MeshBasicMaterial> }[] = [];
  function clear() {
    group.traverse(object => {
      if (object instanceof T.Mesh) { object.geometry.dispose(); (object.material as T.Material).dispose(); }
    });
    group.clear(); markers.length = 0;
  }
  function marker(x: number, z: number, radius: number) {
    const root = new T.Group(); root.position.set(x, 0, z); group.add(root);
    const ring = new T.Mesh(new T.RingGeometry(radius - .12, radius, 64),
      new T.MeshBasicMaterial({ color: '#8fd5df', transparent: true, opacity: .8, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .055; root.add(ring);
    const beam = new T.Mesh(new T.CylinderGeometry(.15, .3, 2.2, 8, 1, true),
      new T.MeshBasicMaterial({ color: '#8fd5df', transparent: true, opacity: .25, side: T.DoubleSide, depthWrite: false }));
    beam.position.y = 1.1; root.add(beam);
    markers.push({ root, ring, beam });
  }
  return {
    configure(sim: Simulation) {
      clear();
      for (const objective of sim.objectives) marker(objective.x, objective.z, objective.radius);
      const extraction = sim.mission.extraction;
      if (extraction) marker(extraction.x, extraction.z, extraction.radius);
    },
    update(sim: Simulation) {
      markers.forEach((view, index) => {
        const objective = sim.objectives[index];
        const active = objective ? sim.objectiveAvailable(index) : sim.extractionReady;
        const done = objective?.completed ?? false;
        const contested = objective && !done && active && sim.objectiveContested(objective);
        const color = done ? '#93be88' : !active ? '#68737b' : contested ? '#f0a368' : objective?.kind === 'cache' ? '#e2be84' : objective ? '#8fd5df' : '#b6efac';
        view.ring.material.color.set(color); view.beam.material.color.set(color);
        view.ring.material.opacity = !active ? .24 : done ? .38 : .7 + Math.sin(sim.time * 3) * .12;
        view.beam.visible = active && !done;
        view.beam.scale.y = .8 + Math.sin(sim.time * 2 + index) * .12;
      });
    },
  };
}
