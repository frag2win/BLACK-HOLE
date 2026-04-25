/**
 * @fileoverview Accumulates gravitational forces with GR corrections
 */
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

export class GravityEngine {
  /**
   * @param {import('./BlackHole.js').BlackHole} blackHole 
   */
  constructor(blackHole) {
    this.blackHole = blackHole;
  }

  /**
   * Calculates acceleration on a body at a given position/velocity
   * Includes GR perihelion precession approximation
   * All vectors are in SI units (meters, meters/second, meters/second^2)
   * 
   * @param {THREE.Vector3} positionSI
   * @param {THREE.Vector3} velocitySI
   * @returns {THREE.Vector3} Acceleration vector in SI units
   */
  computeAccelerationSI(positionSI, velocitySI) {
    const r = positionSI.length();
    
    // Near singularity protection - particles cross rs are eliminated 
    // downstream, but here we prevent infinity
    if (r <= this.blackHole.rs) {
        return new THREE.Vector3(0, 0, 0);
    }

    const vSq = velocitySI.lengthSq();
    const cSq = Constants.C * Constants.C;
    
    // Newtonian acceleration magnitude (GM / r^2)
    const gNewt = (Constants.G * this.blackHole.M) / (r * r);
    
    // GR correction term approximation for perihelion precession: * (1 + 3v^2 / 2c^2)
    const grFactor = 1.0 + (3.0 * vSq) / (2.0 * cSq);
    
    const magnitude = gNewt * grFactor;

    // Return vector pointing towards singularity origin
    return positionSI.clone().normalize().multiplyScalar(-magnitude);
  }
}
