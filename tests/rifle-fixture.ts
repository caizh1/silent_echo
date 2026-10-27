import { Simulation } from '../src/simulation.ts';
import { defaultLoadout } from '../src/weapons.ts';

// 原有回归继续使用同一把标准步枪，并固定零散布，隔离弹药、碰撞及骨骼检查。
export class RifleSimulation extends Simulation {
  constructor(random: () => number = Math.random) {
    super(random, defaultLoadout('rifle'));
    this.spread = 0;
  }
}
