/**
 * @fileoverview Manages particles running on the full integration engine
 */
import * as THREE from 'three';
import { rk4Step } from './integrators/RK4.js';
import { leapfrogStep } from './integrators/Leapfrog.js';
import { Config } from '../config.js';

export class OrbitalMechanics {
  /**
   * @param {import('./GravityEngine.js').GravityEngine} gravityEngine 
   * @param {import('../utils/UnitConverter.js').UnitConverter} unitConverter 
   */
  constructor(gravityEngine, unitConverter) {
    this.gravityEngine = gravityEngine;
    this.unitConverter = unitConverter;
    
    // Abstract particles with full state simulation
    // state: { position: Vector3, velocity: Vector3, alive: boolean, phaseOffset: number }
    // All vectors here are in simulation units
    this.particles = [];

    // Pre-allocate temporaries for optimization
    this._posSI = new THREE.Vector3();
    this._velSI = new THREE.Vector3();
  }

  addParticle(position, velocity, phaseOffset = 0) {
    this.particles.push({
      position: position.clone(),
      velocity: velocity.clone(),
      alive: true,
      phaseOffset: phaseOffset
    });
  }

  /**
   * Updates all particles using numerical integration
   * @param {number} dt Delta time in seconds 
   * @param {boolean} useRK4 true for RK4, false for Leapfrog
   */
  update(dt, useRK4 = false) { // Defaulting to leapfrog for bulk particles for performance
    const timeStep = dt * Config.simulation.timeScale;

    // Reuse closure for performance during array loop
    const computeAcc = (pos, vel) => {
        this._posSI.copy(pos).multiplyScalar(this.unitConverter.scale);
        this._velSI.copy(vel).multiplyScalar(this.unitConverter.scale);
        const accSI = this.gravityEngine.computeAccelerationSI(this._posSI, this._velSI);
        return accSI.divideScalar(this.unitConverter.scale);
    };

    const computeDerivs = (state) => {
        return {
            dPos: state.velocity.clone(),
            dVel: computeAcc(state.position, state.velocity)
        };
    };

    for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive) continue;

        let newState;
        if (useRK4) {
            newState = rk4Step(p, computeDerivs, timeStep);
        } else {
            newState = leapfrogStep(p.position, p.velocity, computeAcc, timeStep);
        }

        p.position.copy(newState.position);
        p.velocity.copy(newState.velocity);

        // Sub-ISCO Accretion Force: Matter inside 3rs cannot hold a stable orbit and rapidly spirals in.
        // We simulate this by stripping orbital angular momentum (velocity).
        if (p.position.lengthSq() < 9.0) { // 3.0^2
            p.velocity.multiplyScalar(0.95);
        }

        // Particle death condition: crosses Event Horizon (1 simulation unit)
        if (p.position.lengthSq() <= 1.0) {
            // Respawn at outer edge of the disk
            const r_max_sim = Config.disk.r_max_sim;
            const theta = Math.random() * Math.PI * 2;
            
            p.position.set(
                r_max_sim * Math.cos(theta),
                0, // Perfect flat plane
                r_max_sim * Math.sin(theta)
            );
            
            // Calculate true keplerian velocity for respawn
            this._posSI.copy(p.position).multiplyScalar(this.unitConverter.scale);
            const r_m = this._posSI.length();
            const M = this.gravityEngine.blackHole.M;
            const Constants = { G: 6.674e-11 }; // From utils Constants
            const v_orb_ms = Math.sqrt(Constants.G * M / r_m);
            const v_orb_sim = v_orb_ms / this.unitConverter.scale;
            
            p.velocity.set(
                -v_orb_sim * Math.sin(theta),
                0,
                v_orb_sim * Math.cos(theta)
            );
        }
    }
  }
}
