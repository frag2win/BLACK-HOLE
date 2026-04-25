/**
 * @fileoverview Post-processing manager that applies gravitational lensing
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import lensingVert from '../shaders/lensing/lensing.vert.glsl';
import lensingFrag from '../shaders/lensing/lensing.frag.glsl';
import { Config } from '../config.js';

export class LensingRenderer {
  constructor(sceneManager, blackHole) {
    this.sceneManager = sceneManager;
    this.blackHole = blackHole;
    
    this.composer = new EffectComposer(this.sceneManager.renderer);
    
    const renderPass = new RenderPass(this.sceneManager.scene, this.sceneManager.camera);
    this.composer.addPass(renderPass);
    
    const LensingShader = {
      uniforms: {
        tDiffuse: { value: null },
        uBlackHolePos: { value: new THREE.Vector2(0.5, 0.5) },
        uSchwarzschildR: { value: 0.1 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uLensingStrength: { value: 1.0 },
        uLensingMultiplier: { value: 1.0 }
      },
      vertexShader: lensingVert,
      fragmentShader: lensingFrag
    };
    
    this.lensingPass = new ShaderPass(LensingShader);
    this.composer.addPass(this.lensingPass);
    
    // To calculate screen position
    this.bhWorldPos = new THREE.Vector3(0, 0, 0);
  }

  onWindowResize() {
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.lensingPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  }

  update(dt) {
    // Project Black Hole position to screen coordinates (0 to 1)
    const camera = this.sceneManager.camera;
    this.bhWorldPos.set(0, 0, 0); // Assuming black hole is always at origin
    this.bhWorldPos.project(camera);
    
    const screenX = (this.bhWorldPos.x * 0.5) + 0.5;
    const screenY = (this.bhWorldPos.y * 0.5) + 0.5; // Inverse Y? No, screen uses +Y up here
    
    this.lensingPass.uniforms.uBlackHolePos.value.set(screenX, screenY);
    
    // Calculate apparent size of Schwarzschild radius on screen
    // rs is 1.0 simulation units
    const distToCamera = camera.position.length();
    const fovRad = (camera.fov * Math.PI) / 180;
    
    // The screen height in world coordinates at the distance of the black hole
    const screenWorldHeight = 2.0 * distToCamera * Math.tan(fovRad / 2.0);
    
    // UV space height is 1.0, so the apparent radius is:
    const apparentRadius = 1.0 / screenWorldHeight;
    
    this.lensingPass.uniforms.uSchwarzschildR.value = apparentRadius;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
