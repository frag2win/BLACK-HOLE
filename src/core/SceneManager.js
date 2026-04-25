/**
 * @fileoverview Manages the Three.js scene, renderer, and camera.
 * 
 * Phase 1 WebGPU Migration:
 * - Tries WebGPU renderer first (requires async init)
 * - Graceful fallback to WebGL renderer
 * - Exposes `isWebGPU` flag and `gpuDevice` for compute shaders
 */
import * as THREE from 'three';
import { Config } from '../config.js';

export class SceneManager {
  /**
   * @param {HTMLElement} container - The DOM element to attach the renderer to
   */
  constructor(container) {
    this.container = container;
    this.isWebGPU = false;
    this.gpuDevice = null;

    // Create Scene
    this.scene = new THREE.Scene();

    // Create Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(
      Config.rendering.fov,
      aspect,
      Config.rendering.near,
      Config.rendering.far
    );
    this.camera.position.set(0, 1.5, 12); // Low-angle cinematic view
    this.camera.lookAt(0, 0, 0);

    // Renderer will be set up asynchronously via init()
    this.renderer = null;
  }

  /**
   * Async initialization — attempts WebGPU, falls back to WebGL
   * @returns {Promise<SceneManager>}
   */
  async init() {
    // Attempt WebGPU
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice({
            requiredLimits: {
              maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
              maxBufferSize: adapter.limits.maxBufferSize,
            }
          });

          this.gpuDevice = device;
          this.isWebGPU = true;

          // Use standard WebGL renderer for Three.js rendering
          // (compute runs on raw WebGPU device, rendering stays WebGL)
          this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });

          console.log('%c[SceneManager] WebGPU device acquired ✅ — Compute shaders enabled',
            'color: #00ff88; font-weight: bold');
          console.log(`[SceneManager] Max storage buffer: ${(device.limits.maxStorageBufferBindingSize / 1024 / 1024).toFixed(0)} MB`);
          console.log(`[SceneManager] Max buffer size: ${(device.limits.maxBufferSize / 1024 / 1024).toFixed(0)} MB`);
        } else {
          throw new Error('No WebGPU adapter available');
        }
      } catch (e) {
        console.warn('[SceneManager] WebGPU init failed, falling back to WebGL:', e.message);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this._showWebGPUError();
      }
    } else {
      console.warn('[SceneManager] WebGPU not supported in this browser. Using WebGL.');
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      this._showWebGPUError();
    }

    // Configure renderer (works for both WebGL and WebGPU)
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 1);

    // Ensure the canvas fully covers the screen
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100vw';
    this.renderer.domElement.style.height = '100vh';

    this.container.appendChild(this.renderer.domElement);

    // Handle Resize
    window.addEventListener('resize', this.onWindowResize.bind(this));

    return this;
  }

  /**
   * Show a visible on-screen error banner if WebGPU is not available
   */
  _showWebGPUError() {
    const banner = document.createElement('div');
    banner.id = 'webgpu-error-banner';
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.padding = '8px 16px';
    banner.style.backgroundColor = 'rgba(255, 100, 0, 0.9)';
    banner.style.color = '#fff';
    banner.style.fontFamily = "'Inter', monospace";
    banner.style.fontSize = '14px';
    banner.style.textAlign = 'center';
    banner.style.zIndex = '10000';
    banner.style.backdropFilter = 'blur(10px)';
    banner.innerHTML = '⚠️ <b>WebGPU not available</b> — Running in WebGL fallback mode. GPU compute disabled. Use Chrome 113+ for full experience.';
    document.body.appendChild(banner);
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  /**
   * Main render call
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Add object to scene
   * @param {THREE.Object3D} object 
   */
  add(object) {
    this.scene.add(object);
  }
}
