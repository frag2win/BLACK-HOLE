/**
 * @fileoverview WGSL Compute Shader — Newtonian Gravity (Phase 1)
 * 
 * Particle struct: 32 bytes, 16-byte aligned
 * Integration: Leapfrog (symplectic, energy-conserving)
 * Absorption: r <= rs triggers state = 0.0
 */

struct Particle {
    position : vec3<f32>,
    _pad0    : f32,
    velocity : vec3<f32>,
    state    : f32,       // 0.0 = absorbed, 1.0 = active
};

struct SimUniforms {
    GM       : f32,       // Gravitational parameter in sim units
    rs       : f32,       // Schwarzschild radius in sim units (= 1.0)
    dt       : f32,       // Integration timestep
    _pad     : f32,       // Alignment padding
};

@group(0) @binding(0) var<storage, read>       particles_in  : array<Particle>;
@group(0) @binding(1) var<storage, read_write>  particles_out : array<Particle>;
@group(0) @binding(2) var<uniform>              sim           : SimUniforms;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let i = id.x;
    let count = arrayLength(&particles_in);
    
    // Bounds check
    if (i >= count) {
        return;
    }
    
    var p = particles_in[i];
    
    // Skip absorbed particles
    if (p.state < 0.5) {
        particles_out[i] = p;
        return;
    }
    
    let r = length(p.position);
    
    // Absorption check: particle crossed event horizon
    if (r <= sim.rs) {
        p.state = 0.0;
        p.velocity = vec3<f32>(0.0, 0.0, 0.0);
        particles_out[i] = p;
        return;
    }
    
    // Clamp r to prevent division by zero near singularity
    let safe_r = max(r, sim.rs + 0.001);
    let r3 = safe_r * safe_r * safe_r;
    
    // --- Newtonian gravity ---
    // a = -GM * position / |position|^3
    let accel = -sim.GM * p.position / r3;
    
    // --- Leapfrog integration (kick-drift-kick) ---
    // Half-kick: update velocity by half-step
    let half_dt = sim.dt * 0.5;
    let v_half = p.velocity + accel * half_dt;
    
    // Drift: update position by full step
    p.position = p.position + v_half * sim.dt;
    
    // Recompute acceleration at new position
    let r_new = length(p.position);
    let safe_r_new = max(r_new, sim.rs + 0.001);
    let r3_new = safe_r_new * safe_r_new * safe_r_new;
    let accel_new = -sim.GM * p.position / r3_new;
    
    // Second half-kick
    p.velocity = v_half + accel_new * half_dt;
    
    // Keep particles in the disk plane (suppress vertical drift from numerical error)
    // Only minor vertical component allowed (from scatter)
    let max_y = 0.5;
    p.position.y = clamp(p.position.y, -max_y, max_y);
    p.velocity.y *= 0.99; // Gentle vertical damping
    
    particles_out[i] = p;
}
