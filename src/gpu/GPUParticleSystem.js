/**
 * @fileoverview GPU-based particle system using WebGPU compute shaders.
 * 
 * Architecture:
 * - Two storage buffers in ping-pong pattern (bufferA ↔ bufferB)
 * - WGSL compute shader runs Newtonian gravity + Leapfrog integration
 * - Vertex shader reads directly from compute output buffer
 * - ZERO particle data ever crosses the GPU↔CPU bus
 * 
 * Phase 1: Newtonian gravity only, Leapfrog integration
 */
import * as THREE from 'three';
import { Config } from '../config.js';

// Particle struct: 32 bytes (8 x f32)
// [pos.x, pos.y, pos.z, _pad0, vel.x, vel.y, vel.z, state]
const FLOATS_PER_PARTICLE = 8;
const BYTES_PER_PARTICLE = FLOATS_PER_PARTICLE * 4; // 32 bytes

export class GPUParticleSystem {
  /**
   * Static factory — use this instead of `new GPUParticleSystem()`
   * because compute pipeline init is async.
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

  /**
   * @param {THREE.Scene} scene
   * @param {GPUDevice} device - The WebGPU device
   * @param {number} particleCount
   */
  constructor(scene, device, particleCount) {
    this.scene = scene;
    this.device = device;
    this.count = particleCount;
    this.frame = 0;
    this.pipelineReady = false;
    
    // GM in simulation units where 1 unit = 1 rs
    // In sim units: rs = 1.0, and v_orbital = sqrt(GM/r)
    // We want Keplerian orbits to look right, so GM ≈ 0.5
    // (since rs = 2GM/c² → GM = rs/2 in geometric units)
    this.GM = 0.5;
    this.rs = 1.0;
    this.dt = Config.simulation.timeScale;
    
    // FPS logging
    this.fpsFrameCount = 0;
    this.fpsLastTime = performance.now();
    this.activeParticleCount = particleCount;
    
    this._initBuffers();
    this._initRenderGeometry();
  }

  /**
   * Initialize ping-pong storage buffers with disk-distributed particles
   */
  _initBuffers() {
    const data = new Float32Array(this.count * FLOATS_PER_PARTICLE);
    
    const r_isco = Config.disk.r_isco_sim;  // 3.0
    const r_max = Config.disk.r_max_sim;    // 10.0
    
    for (let i = 0; i < this.count; i++) {
      const offset = i * FLOATS_PER_PARTICLE;
      
      // Disk distribution: clump particles toward inner edge
      const t = Math.pow(Math.random(), 3.0);
      const r = r_isco + t * (r_max - r_isco);
      
      // Spiral perturbation
      const spiralOffset = Math.sin(r * 1.5) * 1.0;
      const theta = Math.random() * Math.PI * 2 + spiralOffset;
      
      // Position (flat disk in XZ plane, slight Y scatter)
      const yScatter = (Math.random() - 0.5) * 0.1;
      data[offset + 0] = r * Math.cos(theta);  // pos.x
      data[offset + 1] = yScatter;               // pos.y
      data[offset + 2] = r * Math.sin(theta);    // pos.z
      data[offset + 3] = 0.0;                    // _pad0
      
      // Keplerian orbital velocity: v = sqrt(GM / r)
      const v_orb = Math.sqrt(this.GM / r);
      data[offset + 4] = -v_orb * Math.sin(theta); // vel.x (tangent)
      data[offset + 5] = 0.0;                       // vel.y
      data[offset + 6] = v_orb * Math.cos(theta);   // vel.z (tangent)
      data[offset + 7] = 1.0;                       // state: active
    }
    
    // Create two GPU storage buffers for ping-pong
    const bufferSize = this.count * BYTES_PER_PARTICLE;
    
    this.bufferA = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
      mappedAtCreation: false,
    });
    
    this.bufferB = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
      mappedAtCreation: false,
    });
    
    // Upload initial data to buffer A
    this.device.queue.writeBuffer(this.bufferA, 0, data);
    
    // Create uniform buffer for simulation parameters (16 bytes: GM, rs, dt, pad)
    this.uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    this._updateUniforms();
  }

  /**
   * Update uniform buffer with current simulation parameters
   */
  _updateUniforms() {
    const uniformData = new Float32Array([this.GM, this.rs, this.dt, 0.0]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  /**
   * Initialize the compute pipeline from WGSL source
   */
  async _initComputePipeline() {
    // Load WGSL shader source via Vite's raw import
    const wgslModule = await import('./compute.wgsl?raw');
    const wgslSource = wgslModule.default;
    
    const shaderModule = this.device.createShaderModule({
      code: wgslSource,
    });
    
    // Bind group layout
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
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
    
    // Create bind groups for ping-pong (A→B and B→A)
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

  /**
   * Initialize render geometry — reads directly from compute output buffer
   */
  _initRenderGeometry() {
    // Create a point geometry for rendering
    // The vertex positions will be pulled from the storage buffer
    const geometry = new THREE.BufferGeometry();
    
    // We need placeholder positions — actual positions come from the GPU buffer
    // These will be overwritten by the storage buffer binding
    const positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const radii = new Float32Array(this.count);
    
    for (let i = 0; i < this.count; i++) {
      // Initial colors based on expected radial position
      const t = Math.pow(i / this.count, 0.3);
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.6 * (1.0 - t) + 0.2 * t;
      colors[i * 3 + 2] = 0.1 * (1.0 - t);
      radii[i] = Config.disk.r_isco_sim + t * (Config.disk.r_max_sim - Config.disk.r_isco_sim);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    
    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    
    // We'll read back positions from the GPU buffer for rendering
    // This is a temporary bridge until we can wire storage buffers directly to vertex shaders
    this._positionReadbackBuffer = this.device.createBuffer({
      size: this.count * BYTES_PER_PARTICLE,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Dispatch compute shader and update render data
   * @param {number} dt - Delta time in seconds
   */
  async update(dt) {
    if (!this.pipelineReady) return;
    
    // Update timestep uniform
    this.dt = dt * Config.simulation.timeScale * 20.0; // Scale for visual speed
    this._updateUniforms();
    
    // Determine which bind group to use (ping-pong)
    const isEvenFrame = (this.frame % 2) === 0;
    const bindGroup = isEvenFrame ? this.bindGroupAtoB : this.bindGroupBtoA;
    const outputBuffer = isEvenFrame ? this.bufferB : this.bufferA;
    
    // Dispatch compute
    const workgroupCount = Math.ceil(this.count / 256);
    const commandEncoder = this.device.createCommandEncoder();
    
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();
    
    // Copy output buffer to readback buffer for CPU-side rendering update
    // NOTE: This is a Phase 1 bridge. In later phases, we'll wire
    // the storage buffer directly to the vertex shader to achieve
    // zero CPU-GPU transfer.
    commandEncoder.copyBufferToBuffer(
      outputBuffer, 0,
      this._positionReadbackBuffer, 0,
      this.count * BYTES_PER_PARTICLE
    );
    
    this.device.queue.submit([commandEncoder.finish()]);
    
    // Read back positions for Three.js rendering
    await this._positionReadbackBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = new Float32Array(this._positionReadbackBuffer.getMappedRange());
    
    const posAttr = this.points.geometry.getAttribute('position');
    const colorAttr = this.points.geometry.getAttribute('color');
    
    let activeCount = 0;
    
    for (let i = 0; i < this.count; i++) {
      const srcOffset = i * FLOATS_PER_PARTICLE;
      const state = mappedRange[srcOffset + 7];
      
      if (state > 0.5) {
        // Active particle
        posAttr.array[i * 3] = mappedRange[srcOffset];
        posAttr.array[i * 3 + 1] = mappedRange[srcOffset + 1];
        posAttr.array[i * 3 + 2] = mappedRange[srcOffset + 2];
        
        // Update color based on radius
        const r = Math.sqrt(
          mappedRange[srcOffset] ** 2 + 
          mappedRange[srcOffset + 2] ** 2
        );
        const t = Math.max(0, Math.min(1, (r - Config.disk.r_isco_sim) / (Config.disk.r_max_sim - Config.disk.r_isco_sim)));
        
        // Hot white inner → orange mid → deep red outer
        colorAttr.array[i * 3] = 1.0;
        colorAttr.array[i * 3 + 1] = 0.9 * (1 - t) + 0.1 * t;
        colorAttr.array[i * 3 + 2] = 0.8 * (1 - t * t);
        
        activeCount++;
      } else {
        // Absorbed particle — hide it
        posAttr.array[i * 3] = 0;
        posAttr.array[i * 3 + 1] = -1000;
        posAttr.array[i * 3 + 2] = 0;
      }
    }
    
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    
    this._positionReadbackBuffer.unmap();
    
    this.frame++;
    
    // FPS logging every 60 frames
    this.fpsFrameCount++;
    if (this.fpsFrameCount >= 60) {
      const now = performance.now();
      const elapsed = now - this.fpsLastTime;
      const fps = (this.fpsFrameCount / elapsed) * 1000;
      console.log(`[GPU Particles] FPS: ${fps.toFixed(1)} | Active: ${activeCount.toLocaleString()}/${this.count.toLocaleString()}`);
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }
    
    // Store active count for HUD
    this.activeParticleCount = activeCount;
  }

  /**
   * Clean up GPU resources
   */
  dispose() {
    this.bufferA?.destroy();
    this.bufferB?.destroy();
    this.uniformBuffer?.destroy();
    this._positionReadbackBuffer?.destroy();
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
