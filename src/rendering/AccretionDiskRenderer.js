/**
 * @fileoverview Wrapper to integrate accretion disk into rendering loop
 */
import { DiskParticleSystem } from '../particles/DiskParticleSystem.js';

export class AccretionDiskRenderer {
  /**
   * @param {THREE.Scene} scene 
   * @param {import('../physics/BlackHole.js').BlackHole} blackHole 
   * @param {import('../utils/UnitConverter.js').UnitConverter} unitConverter 
   */
  constructor(scene, blackHole, unitConverter) {
    this.particleSystem = new DiskParticleSystem(scene, blackHole, unitConverter);
  }

  update(dt) {
    this.particleSystem.update(dt);
  }
}
