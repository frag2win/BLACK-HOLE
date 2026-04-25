/**
 * @fileoverview Converts between SI units and Simulation units (where 1 sim unit = 1 rs)
 */
import { Constants } from './Constants.js';

export class UnitConverter {
  /**
   * @param {number} rs_meters - The Schwarzschild radius in meters
   */
  constructor(rs_meters) {
    this.scale = rs_meters; // 1 simulation unit corresponds to rs_meters
  }

  /**
   * Convert meters to simulation units
   * @param {number} meters 
   * @returns {number}
   */
  toSim(meters) {
    return meters / this.scale;
  }

  /**
   * Convert simulation units to meters
   * @param {number} simUnits 
   * @returns {number}
   */
  toMeters(simUnits) {
    return simUnits * this.scale;
  }

  /**
   * Convert velocity in meters/second to simulation units (fraction of c)
   * @param {number} ms 
   * @returns {number}
   */
  toVelocitySim(ms) {
    return ms / Constants.C;
  }

  /**
   * Convert simulation velocity to SI velocity
   * @param {number} vSim 
   * @returns {number}
   */
  toVelocitySI(vSim) {
    return vSim * Constants.C;
  }
}
