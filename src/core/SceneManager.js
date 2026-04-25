/**
 * @fileoverview Manages the Three.js scene, renderer, and camera
 */
import * as THREE from 'three';
import { Config } from '../config.js';

export class SceneManager {
  /**
   * @param {HTMLElement} container - The DOM element to attach the renderer to
   */
  constructor(container) {
    this.container = container;
    
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
    this.camera.position.set(0, 5, 20); // 20 rs away from singularity
    this.camera.lookAt(0, 0, 0);

    // Create Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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
