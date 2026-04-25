/**
 * @fileoverview Leapfrog (Symplectic) Integrator for orbital stability
 */

/**
 * Performs a single Leapfrog step
 * @param {import('three').Vector3} pos 
 * @param {import('three').Vector3} vel 
 * @param {Function} computeAcceleration - returns import('three').Vector3
 * @param {number} dt 
 * @returns {{position: import('three').Vector3, velocity: import('three').Vector3}}
 */
export function leapfrogStep(pos, vel, computeAcceleration, dt) {
  const acc = computeAcceleration(pos, vel);
  
  // Half-step velocity
  const velHalf = vel.clone().addScaledVector(acc, dt / 2);
  
  // Full-step position
  const newPos = pos.clone().addScaledVector(velHalf, dt);
  
  // Recompute acceleration at new position
  const newAcc = computeAcceleration(newPos, velHalf);
  
  // Full-step velocity
  const newVel = velHalf.addScaledVector(newAcc, dt / 2);
  
  return { position: newPos, velocity: newVel };
}
