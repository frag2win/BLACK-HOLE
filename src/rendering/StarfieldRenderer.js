import * as THREE from 'three';

export class StarfieldRenderer {
  constructor(scene) {
    this.scene = scene;
    this.stars = this.createStarfield();
    this.scene.add(this.stars);
  }

  createStarfield() {
    const starCount = 5000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      // Use spherical distribution for uniform coverage
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 500 + Math.random() * 100; // Far away

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Star colors (mostly white/blue, some red)
      const starType = Math.random();
      if (starType > 0.8) {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0; // Blue-ish
      } else if (starType > 0.7) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 0.7; // Red-ish
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0; // White
      }

      sizes[i] = Math.random() * 2.0 + 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    });

    return new THREE.Points(geometry, material);
  }

  update(dt) {
    // Stars can rotate slowly for cinematic effect
    this.stars.rotation.y += dt * 0.005;
  }
}
