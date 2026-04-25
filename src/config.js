/**
 * @fileoverview Global simulation configuration and constants
 */
export const Config = {
  blackHole: {
    massInSolarMasses: 10,
  },
  simulation: {
    maxDeltaTime: 0.1,
    timeScale: 0.0005,
  },
  disk: {
    particleCount: 100000,
    r_isco_sim: 3.0,
    r_max_sim: 10.0
  },
  rendering: {
    fov: 60,
    near: 0.1,
    far: 10000,
  }
};
