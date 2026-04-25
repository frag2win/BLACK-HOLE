/**
 * @fileoverview Visual representation of the black hole
 */
import * as THREE from 'three';

export class BlackHoleRenderer {
  /**
   * @param {THREE.Scene} scene - The scene to add the black hole to
   */
  constructor(scene) {
    this.scene = scene;
    this.mesh = this.createBlackHoleMesh();
    this.photonRing = this.createPhotonRing();
    
    this.scene.add(this.mesh);
    this.scene.add(this.photonRing);
  }

  /**
   * Creates the perfect absorber event horizon
   * @returns {THREE.Mesh}
   */
  createBlackHoleMesh() {
    // Event horizon is at 1.0 simulation units
    const geometry = new THREE.SphereGeometry(1.0, 64, 64);
    
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          // Perfect absorber
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Creates a basic visualization for the photon sphere
   * @returns {THREE.Mesh}
   */
  createPhotonRing() {
    // Photon sphere is at 1.5 rs
    const geometry = new THREE.RingGeometry(1.45, 1.55, 64);
    
    // Rotate to lie flat on the equatorial plane
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    return new THREE.Mesh(geometry, material);
  }

  update(dt) {
    // Phase 1 placeholder for per-frame updates
  }
}
