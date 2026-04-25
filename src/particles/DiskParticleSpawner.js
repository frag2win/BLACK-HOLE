/**
 * @fileoverview Spawns particles for the accretion disk with initial Keplerian velocities
 */
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { Config } from '../config.js';

export class DiskParticleSpawner {
  /**
   * @param {import('../physics/BlackHole.js').BlackHole} blackHole 
   * @param {import('../utils/UnitConverter.js').UnitConverter} unitConverter 
   */
  constructor(blackHole, unitConverter) {
    this.blackHole = blackHole;
    this.unitConverter = unitConverter;
  }

  /**
   * Spawns a count of particles with orbital parameters
   * @param {number} count 
   * @returns {Array<{position: THREE.Vector3, velocity: THREE.Vector3}>}
   */
  spawn(count) {
    const particles = [];
    const r_isco_sim = Config.disk.r_isco_sim;
    const r_max_sim = Config.disk.r_max_sim;
    const M = this.blackHole.M;

    for (let i = 0; i < count; i++) {
      // Clump particles even more aggressively closer to the inner edge (ISCO)
      const t = Math.pow(Math.random(), 3.5);
      const r_sim = r_isco_sim + t * (r_max_sim - r_isco_sim);
      
      // Add a spiral phase shift based on the radius
      const spiralArms = 2;
      const spiralTwist = 1.5;
      const spiralOffset = Math.sin(r_sim * spiralTwist) * (2.0 / spiralArms);
      const theta = (Math.random() * Math.PI * 2) + spiralOffset;
      
      // Calculate true orbital physics in SI units
      const r_m = this.unitConverter.toMeters(r_sim);
      const v_orb_ms = Math.sqrt(Constants.G * M / r_m);
      
      // We need velocity in sim units (rs / s) for the integration engine
      const v_orb_sim = v_orb_ms / this.unitConverter.scale;

      // Perfect flat accretion disk, no vertical warping
      const yDistortion = 0.0;

      const pos = new THREE.Vector3(
        r_sim * Math.cos(theta),
        yDistortion,
        r_sim * Math.sin(theta)
      );

      // Velocity is tangent to the circle
      const vel = new THREE.Vector3(
        -v_orb_sim * Math.sin(theta),
        0,
        v_orb_sim * Math.cos(theta)
      );

      particles.push({
        position: pos,
        velocity: vel
      });
    }
    return particles;
  }
}
