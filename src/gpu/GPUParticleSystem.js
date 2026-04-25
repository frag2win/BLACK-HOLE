/**
 * @fileoverview GPU-based particle system using WebGPU compute shaders.
 * 
 * Architecture:
 * - Two storage buffers in ping-pong pattern (bufferA ↔ bufferB)
 * - WGSL compute shader runs Kerr gravity + Leapfrog integration
 * - Double-buffered readback eliminates CPU stall
 * - GPU-side particle respawn (constant visual density)
 * 
 * Phase 4: Performance & Polish
 * - Double-buffered readback (read frame N-1 while frame N computes)
 * - GPU particle respawn (no dead particles)
 * - 500k particles target
 * - Performance timing metrics
 */
import * as THREE from 'three';
import { Config } from '../config.js';

// Particle struct: 32 bytes (8 x f32)
const FLOATS_PER_PARTICLE = 8;
const BYTES_PER_PARTICLE = FLOATS_PER_PARTICLE * 4; // 32 bytes

export class GPUParticleSystem {
  /**
   * Static factory — use this instead of `new GPUParticleSystem()`
   * @param {THREE.Scene} scene
   * @param {GPUDevice} device
   * @param {number} particleCount
   * @returns {Promise<GPUParticleSystem>}
   */
  static async create(scene, device, particleCount) {
    const system = new GPUParticleSystem(scene, device, particleCount);
    await system._initComputePipeline();
    return system;
  }

  constructor(scene, device, particleCount) {
    this.scene = scene;
    this.device = device;
    this.count = particleCount;
    this.frame = 0;
    this.pipelineReady = false;
    
    // Gravitational parameters (sim units: 1 unit = 1 rs)
    this.GM = 0.5;
    this.rs = 1.0;
    this.dt = Config.simulation.timeScale;
    this.simTime = 0.0;
    
    // Kerr parameters
    this.spin = 0.0;
    this.spinAxis = [0.0, 1.0, 0.0];
    this._computeRplus();
    
    // Performance metrics
    this.perfMetrics = {
      computeMs: 0,
      readbackMs: 0,
      updateMs: 0,
    };
    this.fpsFrameCount = 0;
    this.fpsLastTime = performance.now();
    this.activeParticleCount = particleCount;
    
    this._initBuffers();
    this._initRenderGeometry();
  }

  _computeRplus() {
    const half_rs = this.rs / 2.0;
    const a_physical = this.spin * half_rs;
    const discriminant = half_rs * half_rs - a_physical * a_physical;
    this.r_plus = half_rs + Math.sqrt(Math.max(0, discriminant));
  }

  setSpin(a) {
    this.spin = Math.max(0, Math.min(0.998, a));
    this._computeRplus();
  }

  _initBuffers() {
    const data = new Float32Array(this.count * FLOATS_PER_PARTICLE);
    const r_isco = Config.disk.r_isco_sim;
    const r_max = Config.disk.r_max_sim;
    
    for (let i = 0; i < this.count; i++) {
      const offset = i * FLOATS_PER_PARTICLE;
      const t = Math.pow(Math.random(), 3.0);
      const r = r_isco + t * (r_max - r_isco);
      const spiralOffset = Math.sin(r * 1.5) * 1.0;
      const theta = Math.random() * Math.PI * 2 + spiralOffset;
      const yScatter = (Math.random() - 0.5) * 0.1;
      
      data[offset + 0] = r * Math.cos(theta);
      data[offset + 1] = yScatter;
      data[offset + 2] = r * Math.sin(theta);
      data[offset + 3] = 0.0;
      
      const v_orb = Math.sqrt(this.GM / r);
      data[offset + 4] = -v_orb * Math.sin(theta);
      data[offset + 5] = 0.0;
      data[offset + 6] = v_orb * Math.cos(theta);
      data[offset + 7] = 1.0;
    }
    
    const bufferSize = this.count * BYTES_PER_PARTICLE;
    
    this.bufferA = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
    });
    
    this.bufferB = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
    });
    
    this.device.queue.writeBuffer(this.bufferA, 0, data);
    
    // Expanded KerrUniforms: 48 bytes
    // {GM, spin, rs, dt, spin_vec(vec3), r_plus, r_isco, r_max, time, _pad1}
    this.uniformBuffer = this.device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    // --- Double-buffered readback (Phase 4) ---
    // Two staging buffers so we can read frame N-1 while frame N computes
    this._readbackA = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this._readbackB = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    // Track which readback buffer has pending data
    this._readbackPending = null; // Will hold the Promise from mapAsync
    this._readbackCurrent = null; // The buffer we're reading from this frame
    
    this._updateUniforms();
  }

  /**
   * Update KerrUniforms — must match WGSL struct layout (48 bytes).
   *
   * struct KerrUniforms {
   *   GM       : f32,       // offset 0
   *   spin     : f32,       // offset 4
   *   rs       : f32,       // offset 8
   *   dt       : f32,       // offset 12
   *   spin_vec : vec3<f32>, // offset 16 (16-byte aligned)
   *   r_plus   : f32,       // offset 28
   *   r_isco   : f32,       // offset 32
   *   r_max    : f32,       // offset 36
   *   time     : f32,       // offset 40
   *   _pad1    : f32,       // offset 44
   * }; // total = 48 bytes
   */
  _updateUniforms() {
    const uniformData = new Float32Array([
      this.GM,              // 0
      this.spin,            // 4
      this.rs,              // 8
      this.dt,              // 12
      this.spinAxis[0],     // 16
      this.spinAxis[1],     // 20
      this.spinAxis[2],     // 24
      this.r_plus,          // 28
      Config.disk.r_isco_sim, // 32
      Config.disk.r_max_sim,  // 36
      this.simTime,         // 40
      0.0,                  // 44 (padding)
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  async _initComputePipeline() {
    const wgslModule = await import('./compute.wgsl?raw');
    const wgslSource = wgslModule.default;
    
    const shaderModule = this.device.createShaderModule({ code: wgslSource });
    
    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });
    
    this.computePipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'main' },
    });
    
    this.bindGroupAtoB = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufferA } },
        { binding: 1, resource: { buffer: this.bufferB } },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    
    this.bindGroupBtoA = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bufferB } },
        { binding: 1, resource: { buffer: this.bufferA } },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    
    this.pipelineReady = true;
    console.log(`[GPUParticleSystem] Compute pipeline ready. ${this.count.toLocaleString()} particles.`);
  }

  _initRenderGeometry() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    
    for (let i = 0; i < this.count; i++) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.5;
      colors[i * 3 + 2] = 0.1;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /**
   * Phase 4: Double-buffered update loop.
   * 
   * Frame flow:
   *   1. If readback from LAST frame is ready, copy data to Three.js (non-blocking)
   *   2. Submit THIS frame's compute + readback copy (non-blocking)
   *   3. Kick off mapAsync for this frame's readback buffer (returns immediately)
   * 
   * This eliminates the synchronous stall from `await mapAsync`.
   */
  async update(dt) {
    if (!this.pipelineReady) return;
    
    const t0 = performance.now();
    
    // Advance simulation time
    this.simTime += dt;
    this.dt = dt * Config.simulation.timeScale * 20.0;
    this._updateUniforms();
    
    // --- Step 1: Read LAST frame's data if available ---
    const t1 = performance.now();
    if (this._readbackPending) {
      try {
        await this._readbackPending;
        this._applyReadbackData(this._readbackCurrent);
        this._readbackCurrent.unmap();
      } catch (e) {
        // Buffer may have been lost — skip this frame's readback
      }
      this._readbackPending = null;
    }
    const t2 = performance.now();
    
    // --- Step 2: Dispatch compute ---
    const isEvenFrame = (this.frame % 2) === 0;
    const bindGroup = isEvenFrame ? this.bindGroupAtoB : this.bindGroupBtoA;
    const outputBuffer = isEvenFrame ? this.bufferB : this.bufferA;
    const readbackBuffer = isEvenFrame ? this._readbackA : this._readbackB;
    
    const workgroupCount = Math.ceil(this.count / 256);
    const commandEncoder = this.device.createCommandEncoder();
    
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();
    
    // Copy output to readback staging buffer
    commandEncoder.copyBufferToBuffer(
      outputBuffer, 0,
      readbackBuffer, 0,
      this.count * BYTES_PER_PARTICLE
    );
    
    this.device.queue.submit([commandEncoder.finish()]);
    const t3 = performance.now();
    
    // --- Step 3: Kick off readback for NEXT frame (non-blocking) ---
    this._readbackPending = readbackBuffer.mapAsync(GPUMapMode.READ);
    this._readbackCurrent = readbackBuffer;
    
    this.frame++;
    
    // Performance metrics
    this.perfMetrics.readbackMs = t2 - t1;
    this.perfMetrics.computeMs = t3 - t2;
    this.perfMetrics.updateMs = t3 - t0;
    
    // FPS logging
    this.fpsFrameCount++;
    if (this.fpsFrameCount >= 120) {
      const now = performance.now();
      const elapsed = now - this.fpsLastTime;
      const fps = (this.fpsFrameCount / elapsed) * 1000;
      console.log(
        `[GPU] FPS: ${fps.toFixed(1)} | Particles: ${this.activeParticleCount.toLocaleString()}/${this.count.toLocaleString()} | ` +
        `Compute: ${this.perfMetrics.computeMs.toFixed(1)}ms | Readback: ${this.perfMetrics.readbackMs.toFixed(1)}ms`
      );
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }
  }

  /**
   * Apply readback data to Three.js geometry.
   * Optimized: bulk position extraction, minimal color updates.
   */
  _applyReadbackData(readbackBuffer) {
    const mappedData = new Float32Array(readbackBuffer.getMappedRange());
    const posArr = this.points.geometry.getAttribute('position').array;
    const colorArr = this.points.geometry.getAttribute('color').array;
    
    let activeCount = 0;
    const r_isco = Config.disk.r_isco_sim;
    const r_range = Config.disk.r_max_sim - r_isco;
    
    // Only update colors every 4th frame to save CPU
    const updateColors = (this.frame % 4) === 0;
    
    for (let i = 0; i < this.count; i++) {
      const src = i * FLOATS_PER_PARTICLE;
      const dst = i * 3;
      
      // Extract position (always needed for rendering)
      posArr[dst]     = mappedData[src];
      posArr[dst + 1] = mappedData[src + 1];
      posArr[dst + 2] = mappedData[src + 2];
      
      if (mappedData[src + 7] > 0.5) {
        activeCount++;
        
        if (updateColors) {
          const x = mappedData[src];
          const z = mappedData[src + 2];
          const r = Math.sqrt(x * x + z * z);
          const T = Math.pow(r_isco / Math.max(r, r_isco), 0.75);
          colorArr[dst]     = 0.9 + 0.1 * T;
          colorArr[dst + 1] = 0.2 + 0.75 * T;
          colorArr[dst + 2] = 0.05 + 0.95 * T;
        }
      } else if (updateColors) {
        colorArr[dst] = 0;
        colorArr[dst + 1] = 0;
        colorArr[dst + 2] = 0;
      }
    }
    
    this.points.geometry.getAttribute('position').needsUpdate = true;
    if (updateColors) {
      this.points.geometry.getAttribute('color').needsUpdate = true;
    }
    this.activeParticleCount = activeCount;
  }

  dispose() {
    this.bufferA?.destroy();
    this.bufferB?.destroy();
    this.uniformBuffer?.destroy();
    this._readbackA?.destroy();
    this._readbackB?.destroy();
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
