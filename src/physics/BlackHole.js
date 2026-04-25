/**
 * @fileoverview Black hole physics data computing rs, ISCO, and photon sphere
 */
import { Constants } from '../utils/Constants.js';

export class BlackHole {
  /**
   * @param {Object} params
   * @param {number} params.massInSolarMasses - Black hole mass in solar masses
   */
  constructor({ massInSolarMasses = 10 } = {}) {
    this.massInSolarMasses = massInSolarMasses;
    this.M = massInSolarMasses * Constants.M_SUN; // kg
    
    // Schwarzschild radius in meters (rs = 2GM/c^2)
    this.rs = (2 * Constants.G * this.M) / (Constants.C ** 2);
    
    // Photon sphere and ISCO in meters
    this.r_photon = 1.5 * this.rs;
    this.r_isco = 3.0 * this.rs;
  }

  /**
   * Gravitational time dilation factor at radius r
   * @param {number} r - Radius from singularity in meters
   * @returns {number}
   */
  timeDilationFactor(r) {
    if (r <= this.rs) return 0;
    return Math.sqrt(1 - this.rs / r);
  }

  /**
   * Newtonian gravity acceleration vector
   * @param {import('gl-matrix').vec3|{x:number, y:number, z:number}} position - Position vector in SI units (meters)
   * @returns {{x: number, y: number, z: number}} - Acceleration vector in SI units (m/s^2)
   */
  gravitationalAcceleration(position) {
    const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
    
    // Avoid division by zero at singularity
    if (r === 0) return { x: 0, y: 0, z: 0 };
    
    const magnitude = (Constants.G * this.M) / (r * r);
    const normalizeScale = -magnitude / r;
    
    return {
      x: position.x * normalizeScale,
      y: position.y * normalizeScale,
      z: position.z * normalizeScale
    };
  }
}
