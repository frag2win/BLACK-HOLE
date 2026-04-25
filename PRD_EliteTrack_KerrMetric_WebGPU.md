# PRD: Elite Track — Kerr Metric & WebGPU Engine
**Project:** `frag2win/BLACK-HOLE` — Phase 2 Upgrade  
**Status:** `ACTIVE DEVELOPMENT`  
**Stack (current):** Three.js r168 · GLSL · Vite 5 · lil-gui  
**Stack (target):** WebGPU · WGSL · Three.js (renderer swap) · Vite 5  
**Deployed:** [black-hole-xi.vercel.app](https://black-hole-xi.vercel.app)

---

## 1. Executive Summary

The current simulation is a **Schwarzschild black hole** — non-rotating, spherically symmetric, CPU-integrated, WebGL-rendered. It already produces visually impressive results (see §2 for visual audit). The goal of this phase is a full engine overhaul:

| Dimension | Current (v1) | Target (v2) |
|---|---|---|
| Physics Model | Schwarzschild | Kerr (spinning) |
| Integration | CPU / JS per frame | WebGPU Compute Shader |
| Particle Count | ~50k est. | 1,000,000+ |
| Renderer | WebGL (Three.js default) | WebGPU backend |
| Lensing | Spherically symmetric | Asymmetric Kerr shadow |
| Doppler | None | Relativistic beaming per-particle |
| Target FPS | Variable | Locked 60 FPS |

---

## 2. Repo Audit — Current State Analysis

### 2.1 Stack
```
blackhole-sim/
├── src/
│   ├── core/           # Scene + render loop
│   ├── physics/        # Schwarzschild radius, photon sphere, ISCO
│   ├── rendering/      # Three.js wrappers + post-processing
│   ├── shaders/        # lensing.frag.glsl + disk shaders
│   └── utils/
├── index.html
├── vite.config.js      # vite-plugin-glsl enabled
└── package.json        # three@0.168, gl-matrix, lil-gui
```

### 2.2 Key Dependencies
- `three@^0.168.0` — WebGPU backend available via `THREE.WebGPURenderer` in this version ✅
- `vite-plugin-glsl` — handles `.glsl` imports. WGSL will need either raw string imports or a new plugin.
- `lil-gui` — survives the migration, controls UI untouched.
- `gl-matrix` — used for CPU-side math. Post-migration, most math moves to WGSL; gl-matrix survives for JS-side uniform prep.

### 2.3 Current Physics Implemented (Confirmed from README)
- ✅ Schwarzschild Radius: `rs = 2GM/c²`
- ✅ Photon Sphere: `1.5 * rs`
- ✅ ISCO: `3 * rs`
- ✅ Gravitational lensing via post-processing fragment shader
- ✅ Accretion disk with orbital mechanics

### 2.4 Current Visual Audit (Claude Input — from live recording + screenshots)

Based on multi-angle review of the deployed sim:

**✅ What's working well:**
- Event horizon silhouette is correct and pitch-black
- Disk warping is visible from low angles — the back of the disk bends over the top of the shadow correctly
- Photon ring appears as a tight band around the horizon
- Low-angle view (Image 1) is genuinely close to scientific renders — comparable to early Gargantua references
- The lensed image of the back disk appearing *inside* the photon ring (Image 3) is a real relativistic effect that's correctly implemented

**⚠️ Visual gaps to close in v2:**
1. **No Doppler brightness asymmetry** — both sides of the disk are equally bright. The approaching side should be 3–5× brighter (relativistic beaming). This is the #1 most visible inaccuracy.
2. **Color temperature is inverted** — outer disk glows orange, inner disk should be white-hot (10M+ K). Needs a blue-white → orange-red gradient moving outward.
3. **Top-down view has no spiral structure** — shows concentric rings instead of infalling spiral arms. This is an integration artifact of circular orbits without infall.
4. **Photon ring too thick in some views** — should be razor-sharp, almost 1px wide at render resolution.
5. **No background star lensing** — scattered particles don't deform around the gravity well.
6. **Symmetric Schwarzschild shadow** — will be automatically fixed by Kerr implementation (shadow becomes D-shaped / asymmetric).

---

## 3. Physics Spec — Kerr Metric

### 3.1 New Parameters
A Kerr black hole is defined by mass `M` and angular momentum `J`. The dimensionless spin parameter:
```
a = J / (M * c)     where 0.0 = Schwarzschild, 1.0 = extremal Kerr
```

### 3.2 New Boundaries
```
Outer Event Horizon:    r+ = rs/2 + sqrt((rs/2)² - a²)
Inner Event Horizon:    r- = rs/2 - sqrt((rs/2)² - a²)
Ergosphere (equatorial): r_erg = rs/2 + sqrt((rs/2)² - a²cos²θ)
```
The ergosphere is **not** a sphere — it's a pumpkin/oblate shape that touches the event horizon at the poles.

### 3.3 Lense-Thirring Frame Dragging (Post-Newtonian Approximation)
Full geodesic integration of the Kerr metric per 1M particles per frame is computationally infeasible even on WebGPU. We use a Post-Newtonian (PN) approximation:

```
a_total = a_newton + a_lense_thirring

a_newton = -GM * r / |r|³

a_LT = (2G/c²|r|³) * [ (J⃗ × r̂) - 3(J⃗·r̂)r̂ ] × v⃗
```

In the compute shader, `J⃗` (the spin vector, pointing along the rotation axis) is pre-computed on the CPU and passed as a uniform. Only the cross product and dot product are computed per-particle.

### 3.4 Kerr ISCO
The ISCO shifts with spin (prograde vs retrograde orbits):
```
// Prograde (co-rotating):
r_ISCO_pro = rs * (3 + Z2 - sqrt((3-Z1)(3+Z1+2*Z2)))

// Retrograde:
r_ISCO_retro = rs * (3 + Z2 + sqrt((3-Z1)(3+Z1+2*Z2)))
```
Where Z1, Z2 are functions of `a`. At `a=1`, prograde ISCO shrinks to `r = 0.5 * rs`.

---

## 4. Systems Architecture — WebGPU Migration

### 4.1 Renderer Swap
Three.js r168 ships `THREE.WebGPURenderer`. Migration path:

```js
// BEFORE (src/core/scene.js)
const renderer = new THREE.WebGLRenderer({ antialias: true });

// AFTER
import WebGPURenderer from 'three/addons/renderers/common/WebGPURenderer.js';
const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // async init required
```

Add a WebGL fallback detector — Safari and Firefox have partial WebGPU support as of 2025.

### 4.2 WGSL Data Layout

Strict 16-byte alignment required for all structs. WGSL is unforgiving — misalignment silently corrupts data.

```wgsl
// src/shaders/compute/particle.wgsl

struct Particle {
    position : vec3<f32>,
    _pad0    : f32,          // alignment padding
    velocity : vec3<f32>,
    state    : f32,          // 0.0 = absorbed, 1.0 = active
    // total: 32 bytes — aligned ✅
};

struct KerrUniforms {
    GM       : f32,          // gravitational parameter
    spin     : f32,          // a parameter [0.0, 1.0]
    rs       : f32,          // Schwarzschild radius
    dt       : f32,          // integration timestep
    spin_vec : vec3<f32>,    // angular momentum axis (normalized)
    r_plus   : f32,          // outer event horizon radius
    // total: 48 bytes — aligned ✅
};
```

> ⚠️ **Critical:** The original GLSL particle data used unpadded float arrays. Rewriting as WGSL structs requires explicit padding fields everywhere `vec3` is used.

### 4.3 Ping-Pong Buffer Architecture

```
Frame N:
  bufferA (read) ──► Compute Shader ──► bufferB (write)
                                              │
                                              └──► Render Pass (vertex shader reads bufferB)

Frame N+1:
  bufferB (read) ──► Compute Shader ──► bufferA (write)
                                              │
                                              └──► Render Pass (vertex shader reads bufferA)
```

JavaScript's only job: swap buffer bindings and upload uniform values (spin, dt, GM) once per frame. Zero particle data ever crosses the GPU↔CPU bus.

### 4.4 Compute Shader — Integration Core

```wgsl
@group(0) @binding(0) var<storage, read>       particles_in  : array<Particle>;
@group(0) @binding(1) var<storage, read_write>  particles_out : array<Particle>;
@group(0) @binding(2) var<uniform>              kerr          : KerrUniforms;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let i = id.x;
    var p = particles_in[i];

    if (p.state < 0.5) {          // absorbed — skip
        particles_out[i] = p;
        return;
    }

    let r = length(p.position);

    // Absorption check
    if (r <= kerr.r_plus) {
        p.state = 0.0;
        particles_out[i] = p;
        return;
    }

    // --- Newtonian gravity ---
    let r3 = r * r * r;
    var accel = -kerr.GM * p.position / r3;

    // --- Lense-Thirring frame dragging ---
    let J = kerr.spin_vec * kerr.spin;
    let r_hat = p.position / r;
    let J_dot_r = dot(J, r_hat);
    let lt_factor = 2.0 * kerr.GM / (r3);
    accel += lt_factor * (cross(cross(J, r_hat), p.velocity)
                         - 3.0 * J_dot_r * cross(r_hat, p.velocity));

    // --- RK4 integration ---
    // (or Leapfrog if RK4 exceeds register budget — see §6.2)
    let k1v = accel;
    let k1p = p.velocity;
    // ... full RK4 steps ...

    p.velocity += k1v * kerr.dt;   // simplified — expand to full RK4
    p.position += k1p * kerr.dt;

    particles_out[i] = p;
}
```

---

## 5. Rendering Upgrades

### 5.1 Asymmetric Kerr Lensing (Fragment Shader)

The current `lensing.frag.glsl` applies a radially symmetric deflection. For Kerr, deflection strength is a function of polar angle `θ` and spin `a`:

```glsl
// lensing.frag.glsl — updated section

uniform float u_spin;          // a parameter

// Kerr shadow boundary — analytical approximation
float kerrShadowRadius(float phi) {
    // Shadow is D-shaped: compressed on the approaching side
    float base = u_rs * 2.6;
    float asymmetry = u_spin * 0.3 * cos(phi);
    return base * (1.0 - asymmetry);
}

// Per-fragment deflection becomes angle-dependent
float deflectionStrength = lensStrength / pow(r, 2.0);
deflectionStrength *= (1.0 + u_spin * 0.5 * cos(phi)); // stronger on one side
```

### 5.2 Relativistic Doppler Beaming (Claude Addition — High Priority)

This is the **biggest current visual gap**. The approaching side of the disk should be dramatically brighter. Add to disk vertex/fragment shader:

```glsl
// disk.frag.glsl — new section

uniform vec3 u_diskNormal;    // rotation axis of disk
uniform float u_spin;

// Orbital velocity at radius r (Keplerian approximation)
float v_orb = sqrt(GM / r_world);    // tangential speed

// Project orbital velocity onto view direction
vec3 orb_dir = normalize(cross(u_diskNormal, worldPos));
float beta = dot(orb_dir, normalize(cameraPos - worldPos)) * v_orb / c;

// Relativistic Doppler factor (first order)
float doppler = sqrt((1.0 + beta) / (1.0 - beta));

// Beaming — brightness scales as doppler^4
float beaming = pow(doppler, 4.0);

// Apply to color output
gl_FragColor.rgb *= beaming;
```

**Expected result:** ~3–5× brightness difference between left and right sides of disk. This single change has the most visual impact.

### 5.3 Color Temperature Gradient (Claude Addition)

Current disk is uniformly orange. Fix with a temperature-based gradient:

```glsl
// Temperature at radius r (rough power law)
float T_ratio = pow(r_ISCO / max(r_world, r_ISCO), 0.75);

// Blackbody color: hot inner (blue-white) → cool outer (orange-red)
vec3 hot  = vec3(0.8, 0.9, 1.0);   // blue-white
vec3 warm = vec3(1.0, 0.7, 0.2);   // yellow-orange
vec3 cool = vec3(0.9, 0.3, 0.05);  // deep red

vec3 diskColor = mix(cool, mix(warm, hot, T_ratio), T_ratio);
```

---

## 6. Risk Management

| Risk | Severity | Mitigation |
|---|---|---|
| `f32` precision loss near singularity | High | Clamp `r` to `r_plus + epsilon` before any division. Use `select()` in WGSL for branchless safety. |
| RK4 register pressure → FPS drop | Medium | Profile first. Fallback: Leapfrog integration uses 2 registers vs RK4's 8. Toggle via `#define` equivalent. |
| Ergosphere math per-thread | Medium | Pre-compute `r_plus`, `r_ergosphere(theta)` table on CPU, upload as uniform array. Avoid per-thread sqrt. |
| WGSL struct misalignment | High | Unit-test buffer layouts with a 4-particle debug read-back before scaling to 1M. |
| WebGPU browser support | Medium | Feature-detect on load. Graceful fallback to existing WebGL renderer for unsupported browsers. Show a banner. |
| Ping-pong buffer sync | Low | WebGPU command encoder handles ordering — no manual sync needed if passes are sequenced correctly. |
| Three.js WebGPURenderer API churn | Medium | Pin to `three@0.168.x`. Breaking changes in WebGPU backend are frequent in minor versions. |

---

## 7. Implementation Phases

### Phase 0 — Repo Prep (1–2 days)
- [ ] Add WebGPU renderer detection and fallback
- [ ] Create `src/gpu/` directory for WGSL shaders and buffer management
- [ ] Set up WGSL import pipeline (raw string or `vite-plugin-wgsl`)

### Phase 1 — WebGPU Scaffold with Schwarzschild (3–5 days)
- [ ] Initialize `WebGPURenderer`, request adapter + device
- [ ] Define `Particle` struct and allocate ping-pong buffers for 100k particles
- [ ] Write basic `@compute` shader with **Newtonian gravity only** (no Kerr yet)
- [ ] Wire vertex shader to read directly from compute output buffer
- [ ] Prove 100k particles at 60 FPS before proceeding

### Phase 2 — Kerr Physics (3–4 days)
- [ ] Add `KerrUniforms` struct and CPU-side uniform upload
- [ ] Implement Lense-Thirring acceleration term in compute shader
- [ ] Add ergosphere boundary + absorption logic
- [ ] Expose spin `a` parameter in lil-gui controls
- [ ] Validate visually: disk should show rotation-induced distortion

### Phase 3 — Visual Upgrades (2–3 days)
- [ ] **Doppler beaming** in disk fragment shader (highest visual impact)
- [ ] **Color temperature gradient** in disk fragment shader
- [ ] **Asymmetric lensing** in `lensing.frag.glsl` / equivalent WGSL pass
- [ ] Sharpen photon ring to sub-pixel width at render resolution

### Phase 4 — Scale to 1M Particles (2–3 days)
- [ ] Profile workgroup sizing (256 threads/group is a starting point)
- [ ] Tune RK4 vs Leapfrog based on profiling
- [ ] Enable particle respawning (absorbed → respawn at outer disk edge)
- [ ] Add spiral infall velocity component for realistic top-down view

### Phase 5 — Polish (ongoing)
- [ ] Background star field with gravitational lensing displacement
- [ ] Bloom pass tuning for photon ring intensity
- [ ] Mobile/Safari fallback testing

---

## 8. Presentation Slide Deck Notes (Elite Track)

Mapped to your slide structure:

**Slide 1 — Title:** Use Image 1 from the visual audit (low-angle view) as the hero render. It's the strongest angle.

**Slide 2 — Executive Summary:** The three callouts (`0 CPU`, `1M+ Particles`, `60 FPS`) are accurate targets. Consider adding a fourth: `a=0.998` (near-extremal spin, the Thorne limit for astrophysical black holes).

**Slide 3 — Kerr Geometry:** The Schwarzschild → Kerr diagram should show the ergosphere is larger than the event horizon at the equator and equal at the poles. A cross-section diagram (r vs θ) is cleaner than a 3D render here.

**Slide 4 — Lense-Thirring:** The equation callout is correct. Add a visual note that the LT force is proportional to `1/r³` — it drops off fast, so it's only significant in the inner disk where it matters most.

**Slide 5 — Systems Arch:** The WGSL struct shown needs the padding field: `_pad0: f32` after `position`. Present the corrected version.

**Slide 6 — Compute Pipeline:** The flowchart is accurate. Add a note: "JavaScript uploads 48 bytes of uniforms per frame. Everything else stays in VRAM."

**Slide 7 — Kerr Lensing:** Add a before/after: current symmetric shadow circle vs target D-shaped Kerr shadow. This is the most visually striking change to demo.

**Slide 8 — Risk Management:** The table in this PRD (§6) can be used directly.

---

## 9. Key Metrics & Success Criteria

| Metric | Target | Measurement |
|---|---|---|
| Particle count | ≥ 1,000,000 | GPU buffer size / particle struct size |
| Frame rate | ≥ 60 FPS stable | Chrome DevTools GPU timeline |
| CPU frame time | < 2ms | `performance.now()` around `renderer.render()` |
| Doppler ratio (L:R brightness) | ~3–5× | Pixel luminance sample from left vs right disk |
| Kerr shadow asymmetry | Visible at a > 0.5 | Visual inspection vs analytical Bardeen (1973) plots |
| Browser support | Chrome 113+, Edge 113+ | WebGPU adapter detection |

---

*PRD authored collaboratively. Repo analysis: frag2win/BLACK-HOLE @ main (April 2026). Visual audit conducted from live deployment at black-hole-xi.vercel.app.*
