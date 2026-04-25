/**
 * @fileoverview Runge-Kutta 4th Order numerical integrator
 */

/**
 * Perform a single RK4 integration step
 * @param {{position: import('three').Vector3, velocity: import('three').Vector3}} state 
 * @param {Function} computeDerivatives - returns { dPos: import('three').Vector3, dVel: import('three').Vector3 }
 * @param {number} dt 
 * @returns {{position: import('three').Vector3, velocity: import('three').Vector3}} new state
 */
export function rk4Step(state, computeDerivatives, dt) {
  const k1 = computeDerivatives(state);

  const s2 = {
    position: state.position.clone().addScaledVector(k1.dPos, dt / 2),
    velocity: state.velocity.clone().addScaledVector(k1.dVel, dt / 2)
  };
  const k2 = computeDerivatives(s2);

  const s3 = {
    position: state.position.clone().addScaledVector(k2.dPos, dt / 2),
    velocity: state.velocity.clone().addScaledVector(k2.dVel, dt / 2)
  };
  const k3 = computeDerivatives(s3);

  const s4 = {
    position: state.position.clone().addScaledVector(k3.dPos, dt),
    velocity: state.velocity.clone().addScaledVector(k3.dVel, dt)
  };
  const k4 = computeDerivatives(s4);

  return {
    position: state.position.clone()
      .addScaledVector(k1.dPos, dt / 6)
      .addScaledVector(k2.dPos, dt / 3)
      .addScaledVector(k3.dPos, dt / 3)
      .addScaledVector(k4.dPos, dt / 6),
    velocity: state.velocity.clone()
      .addScaledVector(k1.dVel, dt / 6)
      .addScaledVector(k2.dVel, dt / 3)
      .addScaledVector(k3.dVel, dt / 3)
      .addScaledVector(k4.dVel, dt / 6)
  };
}
