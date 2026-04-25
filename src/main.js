/**
 * @fileoverview Entry point for Black Hole Simulation
 * 
 * Phase 1 WebGPU Migration:
 * - Async initialization for WebGPU device
 * - GPU compute particle system (when WebGPU available)
 * - CPU fallback particle system (when WebGPU unavailable)
 * - All existing features preserved: lensing, bloom, starfield, HUD, GUI
 */
import * as THREE from 'three';
import { Config } from './config.js';
import { SceneManager } from './core/SceneManager.js';
import { RenderLoop } from './core/RenderLoop.js';
import { BlackHole } from './physics/BlackHole.js';
import { UnitConverter } from './utils/UnitConverter.js';
import { BlackHoleRenderer } from './rendering/BlackHoleRenderer.js';
import { AccretionDiskRenderer } from './rendering/AccretionDiskRenderer.js';
import { LensingRenderer } from './rendering/LensingRenderer.js';
import { StarfieldRenderer } from './rendering/StarfieldRenderer.js';
import { InfoOverlay } from './ui/InfoOverlay.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import GUI from 'lil-gui';

// Setup basic HTML/CSS if not present via styles
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = '#000';

// Add a visible error overlay to help debug any runtime issues
const errorDiv = document.createElement('div');
errorDiv.style.position = 'absolute';
errorDiv.style.top = '10px';
errorDiv.style.left = '10px';
errorDiv.style.color = 'red';
errorDiv.style.zIndex = '9999';
errorDiv.style.fontFamily = 'monospace';
errorDiv.style.whiteSpace = 'pre-wrap';
errorDiv.style.pointerEvents = 'none';
document.body.appendChild(errorDiv);

const originalError = console.error;
console.error = (...args) => {
  errorDiv.innerText += args.join(' ') + '\n';
  originalError(...args);
};
window.addEventListener('error', (e) => {
  errorDiv.innerText += (e.message || e.toString()) + '\n';
});

async function init() {
  console.log("Initializing Black Hole Simulation — Phase 1 WebGPU");

  // 1. Async Scene Manager Initialization (WebGPU detection)
  const sceneManager = new SceneManager(document.getElementById('root'));
  await sceneManager.init();
  
  // 2. Physics Data
  const blackHole = new BlackHole({ massInSolarMasses: Config.blackHole.massInSolarMasses });
  const unitConverter = new UnitConverter(blackHole.rs);
  
  console.log(`Black Hole initialized with ${blackHole.massInSolarMasses} Solar Masses`);
  console.log(`Schwarzschild Radius (rs) = ${blackHole.rs.toExponential(4)} m`);
  console.log(`Photon Sphere = ${blackHole.r_photon.toExponential(4)} m`);
  console.log(`ISCO = ${blackHole.r_isco.toExponential(4)} m`);

  // 3. Rendering objects
  const blackHoleRenderer = new BlackHoleRenderer(sceneManager.scene);
  const starfield = new StarfieldRenderer(sceneManager.scene);
  
  // 4. Particle system — GPU compute or CPU fallback
  let gpuParticleSystem = null;
  let cpuAccretionDisk = null;
  
  if (sceneManager.isWebGPU && sceneManager.gpuDevice) {
    // WebGPU path — GPU compute particles
    const { GPUParticleSystem } = await import('./gpu/GPUParticleSystem.js');
    gpuParticleSystem = await GPUParticleSystem.create(
      sceneManager.scene,
      sceneManager.gpuDevice,
      Config.disk.particleCount
    );
    console.log('%c[Main] GPU Compute Particle System active ✅', 'color: #00ff88; font-weight: bold');
  } else {
    // WebGL fallback — CPU-integrated particles
    cpuAccretionDisk = new AccretionDiskRenderer(sceneManager.scene, blackHole, unitConverter);
    console.log('[Main] CPU Particle System fallback active');
  }
  
  const lensingRenderer = new LensingRenderer(sceneManager, blackHole);
  const infoOverlay = new InfoOverlay(blackHole, Config);

  // Controls & Stats
  const stats = new Stats();
  document.body.appendChild(stats.dom);
  
  const controls = new OrbitControls(sceneManager.camera, sceneManager.renderer.domElement);
  controls.minDistance = 1.05;
  controls.maxDistance = 100;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  // 5. GUI Controls
  const gui = new GUI();
  const lensingFolder = gui.addFolder('Gravitational Lensing');
  
  const lensingParams = {
    multiplier: lensingRenderer.lensingPass.uniforms.uLensingMultiplier.value,
    strength: lensingRenderer.lensingPass.uniforms.uLensingStrength.value
  };
  
  lensingFolder.add(lensingParams, 'multiplier', 1.0, 10.0, 0.1)
    .name('Lensing Multiplier')
    .onChange((value) => {
      lensingRenderer.lensingPass.uniforms.uLensingMultiplier.value = value;
    });
    
  lensingFolder.add(lensingParams, 'strength', 0.0, 2.0, 0.01)
    .name('Lensing Strength')
    .onChange((value) => {
      lensingRenderer.lensingPass.uniforms.uLensingStrength.value = value;
    });
    
  lensingFolder.open();

  // Renderer info in GUI
  const infoFolder = gui.addFolder('Engine');
  const engineInfo = {
    renderer: sceneManager.isWebGPU ? 'WebGPU Compute' : 'WebGL (CPU)',
    particles: Config.disk.particleCount.toLocaleString(),
  };
  infoFolder.add(engineInfo, 'renderer').name('Backend').disable();
  infoFolder.add(engineInfo, 'particles').name('Particles').disable();

  // Kerr Physics controls (Phase 2)
  if (gpuParticleSystem) {
    const kerrFolder = gui.addFolder('Kerr Physics');
    
    const kerrParams = {
      spin: gpuParticleSystem.spin,
    };
    
    kerrFolder.add(kerrParams, 'spin', 0.0, 0.998, 0.001)
      .name('Spin (a)')
      .onChange((value) => {
        gpuParticleSystem.setSpin(value);
        // Update HUD with new spin info
        infoOverlay.spin = value;
        infoOverlay.r_plus = gpuParticleSystem.r_plus;
      });
      
    kerrFolder.open();
  }

  // Handle window resize for composer
  window.addEventListener('resize', () => {
    lensingRenderer.onWindowResize();
  });

  // 6. Update Loop
  const renderLoop = new RenderLoop(
    async (dt) => {
      // Physics / animation updates
      blackHoleRenderer.update(dt);
      starfield.update(dt);
      
      if (gpuParticleSystem) {
        await gpuParticleSystem.update(dt);
        // Update HUD with GPU particle count
        infoOverlay.activeParticleCount = gpuParticleSystem.activeParticleCount;
      } else if (cpuAccretionDisk) {
        cpuAccretionDisk.update(dt);
      }
      
      lensingRenderer.update(dt);
      infoOverlay.update();
      
      // Controls update
      controls.update();
    },
    (dt) => {
      // Draw step
      lensingRenderer.render(dt);
      stats.update();
    }
  );

  renderLoop.start();
}

// Start simulation when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
