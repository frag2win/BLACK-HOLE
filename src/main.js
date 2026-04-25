/**
 * @fileoverview Entry point for Black Hole Simulation Phase 1
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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

// Setup basic HTML/CSS if not present via styles
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = '#111';

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

function init() {
  console.log("Initializing Phase 1 - Base System");

  // 1. Initialization
  const sceneManager = new SceneManager(document.getElementById('root'));
  
  // 2. Physics Data
  const blackHole = new BlackHole({ massInSolarMasses: Config.blackHole.massInSolarMasses });
  const unitConverter = new UnitConverter(blackHole.rs);
  
  console.log(`Black Hole initialized with ${blackHole.massInSolarMasses} Solar Masses`);
  console.log(`Schwarzschild Radius (rs) = ${blackHole.rs.toExponential(4)} m`);
  console.log(`Photon Sphere = ${blackHole.r_photon.toExponential(4)} m`);
  console.log(`ISCO = ${blackHole.r_isco.toExponential(4)} m`);

  // 3. Rendering objects
  const blackHoleRenderer = new BlackHoleRenderer(sceneManager.scene);
  const accretionDisk = new AccretionDiskRenderer(sceneManager.scene, blackHole, unitConverter);
  
  const lensingRenderer = new LensingRenderer(sceneManager, blackHole);

  // Debug Helpers
  const axesHelper = new THREE.AxesHelper( 50 );
  sceneManager.scene.add( axesHelper );
  const gridHelper = new THREE.GridHelper( 50, 50, 0x888888, 0x444444 );
  sceneManager.scene.add( gridHelper );
  
  // Controls & Stats
  const stats = new Stats();
  document.body.appendChild(stats.dom);
  
  const controls = new OrbitControls(sceneManager.camera, sceneManager.renderer.domElement);
  controls.minDistance = 1.05; // Cannot go past just outside the singularity (1 sim unit)
  controls.maxDistance = 100;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Handle window resize for composer
  window.addEventListener('resize', () => {
    lensingRenderer.onWindowResize();
  });

  // 4. Update Loop
  const renderLoop = new RenderLoop(
    (dt) => {
      // Physics / animation updates
      blackHoleRenderer.update(dt);
      accretionDisk.update(dt);
      lensingRenderer.update(dt);
      
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
