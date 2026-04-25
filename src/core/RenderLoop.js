/**
 * @fileoverview Manages the RequestAnimationFrame loop and delta time
 */
import { Config } from '../config.js';

export class RenderLoop {
  /**
   * @param {Function} updateCallback - Function to call on each frame with deltaTime
   * @param {Function} renderCallback - Function to call to render the scene
   */
  constructor(updateCallback, renderCallback) {
    this.updateCallback = updateCallback;
    this.renderCallback = renderCallback;
    
    this.lastTime = performance.now();
    this.isRunning = false;
    this.animationFrameId = null;
    
    this.loop = this.loop.bind(this);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  async loop(currentTime) {
    if (!this.isRunning) return;

    // Calculate delta time in seconds
    let dt = (currentTime - this.lastTime) / 1000.0;
    this.lastTime = currentTime;

    // Clamp delta time to avoid huge physical jumps
    if (dt > Config.simulation.maxDeltaTime) {
      dt = Config.simulation.maxDeltaTime;
    }

    await this.updateCallback(dt);
    this.renderCallback();

    this.animationFrameId = requestAnimationFrame(this.loop);
  }
}
