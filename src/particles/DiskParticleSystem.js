/**
 * @fileoverview Manages GPU particle system and instanced mesh for the disk
 */
import * as THREE from 'three';
import { DiskParticleSpawner } from './DiskParticleSpawner.js';
import { Config } from '../config.js';
import vertexShader from '../shaders/disk/disk.vert.glsl';
import fragmentShader from '../shaders/disk/disk.frag.glsl';
import { GravityEngine } from '../physics/GravityEngine.js';
import { OrbitalMechanics } from '../physics/OrbitalMechanics.js';

export class DiskParticleSystem {
  constructor(scene, blackHole, unitConverter) {
    this.scene = scene;
    this.count = Config.disk.particleCount;
    
    // 1. Initialize Gravity Engine & Orbital Mechanics
    this.gravityEngine = new GravityEngine(blackHole);
    this.orbitalMechanics = new OrbitalMechanics(this.gravityEngine, unitConverter);

    // 2. Spawn particle data and add them to orbital mechanics
    const spawner = new DiskParticleSpawner(blackHole, unitConverter);
    const spawnedParticles = spawner.spawn(this.count);
    
    for (const p of spawnedParticles) {
      this.orbitalMechanics.addParticle(p.position, p.velocity);
    }

    // 3. Setup rendering geometry & material
    this.geometry = new THREE.PlaneGeometry(0.12, 0.12);
    
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uIsco: { value: Config.disk.r_isco_sim },
        uMaxRadius: { value: Config.disk.r_max_sim }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // 4. Create InstancedMesh
    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
    this.instancedMesh.frustumCulled = false; // Prevent culling when near edges
    
    // Add velocity attribute for Doppler shift
    this.velocityArray = new Float32Array(this.count * 3);
    this.velocityAttribute = new THREE.InstancedBufferAttribute(this.velocityArray, 3);
    this.instancedMesh.geometry.setAttribute('instanceVelocity', this.velocityAttribute);

    // Dummy object used for matrix calculations
    this.dummy = new THREE.Object3D();
    
    // Matrix to zero-out scaling for dead particles
    this.zeroMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0,0,0));
    
    this.scene.add(this.instancedMesh);
  }

  /**
   * Updates particle positions via numerical integration
   * @param {number} dt 
   */
  update(dt) {
    // We pass the unscaled dt to orbital mechanics which scales it internally
    // Use leapfrog by default for perf with 10k particles, or RK4 for pure accuracy.
    this.orbitalMechanics.update(dt, false); // false = Leapfrog
    
    for (let i = 0; i < this.count; i++) {
      const p = this.orbitalMechanics.particles[i];
      if (p.alive) {
          this.dummy.position.copy(p.position);
          this.dummy.updateMatrix();
          this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

          this.velocityArray[i * 3 + 0] = p.velocity.x;
          this.velocityArray[i * 3 + 1] = p.velocity.y;
          this.velocityArray[i * 3 + 2] = p.velocity.z;
      } else {
          this.instancedMesh.setMatrixAt(i, this.zeroMatrix);
          
          this.velocityArray[i * 3 + 0] = 0;
          this.velocityArray[i * 3 + 1] = 0;
          this.velocityArray[i * 3 + 2] = 0;
      }
    }
    
    this.velocityAttribute.needsUpdate = true;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
