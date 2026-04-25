export class InfoOverlay {
  constructor(blackHole, config) {
    this.blackHole = blackHole;
    this.config = config;
    this.container = this.createOverlay();
    document.body.appendChild(this.container);
  }

  createOverlay() {
    const div = document.createElement('div');
    div.id = 'info-overlay';
    div.style.position = 'absolute';
    div.style.bottom = '20px';
    div.style.left = '20px';
    div.style.color = '#fff';
    div.style.fontFamily = "'Inter', 'Roboto', sans-serif";
    div.style.fontSize = '14px';
    div.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    div.style.padding = '15px';
    div.style.borderRadius = '8px';
    div.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    div.style.backdropFilter = 'blur(10px)';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '1000';
    div.style.lineHeight = '1.6';
    
    return div;
  }

  update() {
    // Calculate simple time dilation at some reference distance (e.g. 10rs)
    const referenceR = 10.0;
    const timeDilation = 1.0 / Math.sqrt(1.0 - 1.0 / referenceR);
    
    const activeCount = this.activeParticleCount || this.config.disk.particleCount;
    
    this.container.innerHTML = `
      <div style="font-weight: bold; color: #ffaa00; margin-bottom: 5px; font-size: 16px;">DATA HUD</div>
      <div><b>Mass:</b> ${this.blackHole.massInSolarMasses} M<sub>☉</sub></div>
      <div><b>Schwarzschild Radius (r<sub>s</sub>):</b> ${this.blackHole.rs.toExponential(2)} m</div>
      <div><b>Photon Sphere:</b> 1.5 r<sub>s</sub></div>
      <div><b>Time Dilation (@10r<sub>s</sub>):</b> ${timeDilation.toFixed(3)}x</div>
      <div style="margin-top: 10px; opacity: 0.7; font-size: 12px;">
        <b>Active Particles:</b> ${activeCount.toLocaleString()} / ${this.config.disk.particleCount.toLocaleString()}
      </div>
    `;
  }
}
