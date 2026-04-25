/**
 * @fileoverview WGSL Compute Shader — Kerr Metric (Phase 2)
 * 
 * Particle struct: 32 bytes, 16-byte aligned
 * Integration: Leapfrog (symplectic, energy-conserving)
 * Physics: Newtonian gravity + Lense-Thirring frame dragging
 * Absorption: r <= r_plus (Kerr outer event horizon)
 */

struct Particle {
    position : vec3<f32>,
    _pad0    : f32,
    velocity : vec3<f32>,
    state    : f32,       // 0.0 = absorbed, 1.0 = active
};

struct KerrUniforms {
    GM       : f32,       // Gravitational parameter in sim units
    spin     : f32,       // Dimensionless spin parameter a [0.0, 1.0]
    rs       : f32,       // Schwarzschild radius in sim units (= 1.0)
    dt       : f32,       // Integration timestep
    spin_vec : vec3<f32>, // Spin axis (normalized), usually (0, 1, 0)
    r_plus   : f32,       // Outer event horizon radius
};

@group(0) @binding(0) var<storage, read>       particles_in  : array<Particle>;
@group(0) @binding(1) var<storage, read_write>  particles_out : array<Particle>;
@group(0) @binding(2) var<uniform>              kerr          : KerrUniforms;

// Compute total acceleration including frame dragging
fn computeAcceleration(pos : vec3<f32>, vel : vec3<f32>) -> vec3<f32> {
    let r = length(pos);
    let safe_r = max(r, kerr.r_plus + 0.01);
    let r3 = safe_r * safe_r * safe_r;
    
    // --- Newtonian gravity ---
    // a = -GM * position / |position|^3
    var accel = -kerr.GM * pos / r3;
    
    // --- Lense-Thirring frame dragging (Post-Newtonian) ---
    // Only significant when spin > 0
    if (kerr.spin > 0.001) {
        let J = kerr.spin_vec * kerr.spin;
        let r_hat = pos / safe_r;
        let J_dot_r = dot(J, r_hat);
        
        // Frame-dragging factor: 2GM / (c² r³)
        // In geometric units where c=1: 2GM / r³
        let lt_factor = 2.0 * kerr.GM / r3;
        
        // a_LT = lt * [ (J × r̂) × v - 3(J·r̂)(r̂ × v) ]
        let J_cross_rhat = cross(J, r_hat);
        let rhat_cross_v = cross(r_hat, vel);
        
        accel += lt_factor * (cross(J_cross_rhat, vel) - 3.0 * J_dot_r * rhat_cross_v);
    }
    
    return accel;
}

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
    
    // Absorption check: particle crossed Kerr outer event horizon
    if (r <= kerr.r_plus) {
        p.state = 0.0;
        p.velocity = vec3<f32>(0.0, 0.0, 0.0);
        particles_out[i] = p;
        return;
    }
    
    // Compute acceleration at current position
    let accel = computeAcceleration(p.position, p.velocity);
    
    // --- Leapfrog integration (kick-drift-kick) ---
    // Half-kick: update velocity by half-step
    let half_dt = kerr.dt * 0.5;
    let v_half = p.velocity + accel * half_dt;
    
    // Drift: update position by full step
    p.position = p.position + v_half * kerr.dt;
    
    // Recompute acceleration at new position with half-step velocity
    let accel_new = computeAcceleration(p.position, v_half);
    
    // Second half-kick
    p.velocity = v_half + accel_new * half_dt;
    
    // Keep particles near the disk plane (suppress vertical drift)
    let max_y = 0.5;
    p.position.y = clamp(p.position.y, -max_y, max_y);
    p.velocity.y *= 0.99; // Gentle vertical damping
    
    particles_out[i] = p;
}
