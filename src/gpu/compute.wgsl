/**
 * @fileoverview WGSL Compute Shader — Kerr Metric + Respawn (Phase 4)
 * 
 * Particle struct: 32 bytes, 16-byte aligned
 * Integration: Leapfrog (symplectic, energy-conserving)
 * Physics: Newtonian gravity + Lense-Thirring frame dragging
 * Absorption: r <= r_plus (Kerr outer event horizon)
 * Respawn: Absorbed or escaped particles recycle to outer disk edge
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
    r_isco   : f32,       // ISCO radius (inner disk edge)
    r_max    : f32,       // Max disk radius (outer edge)
    time     : f32,       // Running simulation time (for PRNG seed)
    _pad1    : f32,       // Alignment to 48 bytes
};

@group(0) @binding(0) var<storage, read>       particles_in  : array<Particle>;
@group(0) @binding(1) var<storage, read_write>  particles_out : array<Particle>;
@group(0) @binding(2) var<uniform>              kerr          : KerrUniforms;

// --- GPU-side pseudo-random number generator ---
// PCG hash for deterministic, high-quality randomness
fn pcg_hash(input : u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand_f32(seed : u32) -> f32 {
    return f32(pcg_hash(seed)) / 4294967295.0;
}

// Respawn an absorbed/escaped particle to the outer disk
fn respawnParticle(id : u32) -> Particle {
    var p : Particle;
    
    // Use particle index + time as RNG seed for uniqueness
    let timeBits = bitcast<u32>(kerr.time);
    let s0 = pcg_hash(id * 1973u + timeBits);
    let s1 = pcg_hash(s0);
    let s2 = pcg_hash(s1);
    let s3 = pcg_hash(s2);
    
    // Spawn at outer half of disk (mid → max radius)
    let t = rand_f32(s0);
    let r_mid = kerr.r_isco + (kerr.r_max - kerr.r_isco) * 0.5;
    let r = r_mid + t * (kerr.r_max - r_mid);
    
    let theta = rand_f32(s1) * 6.28318530718;
    let y_scatter = (rand_f32(s2) - 0.5) * 0.08;
    
    p.position = vec3<f32>(r * cos(theta), y_scatter, r * sin(theta));
    p._pad0 = 0.0;
    
    // Keplerian orbital velocity
    let v_orb = sqrt(kerr.GM / r);
    p.velocity = vec3<f32>(-v_orb * sin(theta), 0.0, v_orb * cos(theta));
    p.state = 1.0;
    
    return p;
}

// Compute total acceleration including frame dragging
fn computeAcceleration(pos : vec3<f32>, vel : vec3<f32>) -> vec3<f32> {
    let r = length(pos);
    let safe_r = max(r, kerr.r_plus + 0.01);
    let r3 = safe_r * safe_r * safe_r;
    
    // --- Newtonian gravity ---
    var accel = -kerr.GM * pos / r3;
    
    // --- Lense-Thirring frame dragging (Post-Newtonian) ---
    if (kerr.spin > 0.001) {
        let J = kerr.spin_vec * kerr.spin;
        let r_hat = pos / safe_r;
        let J_dot_r = dot(J, r_hat);
        
        let lt_factor = 2.0 * kerr.GM / r3;
        
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
    
    if (i >= count) {
        return;
    }
    
    var p = particles_in[i];
    
    // Respawn absorbed particles instead of keeping them dead
    if (p.state < 0.5) {
        particles_out[i] = respawnParticle(i);
        return;
    }
    
    let r = length(p.position);
    
    // Absorption: particle crossed Kerr outer event horizon
    if (r <= kerr.r_plus) {
        // Mark for respawn next frame
        particles_out[i] = respawnParticle(i);
        return;
    }
    
    // Escape: particle flew too far out
    if (r > kerr.r_max * 2.0) {
        particles_out[i] = respawnParticle(i);
        return;
    }
    
    // Compute acceleration at current position
    let accel = computeAcceleration(p.position, p.velocity);
    
    // --- Leapfrog integration (kick-drift-kick) ---
    let half_dt = kerr.dt * 0.5;
    let v_half = p.velocity + accel * half_dt;
    
    p.position = p.position + v_half * kerr.dt;
    
    let accel_new = computeAcceleration(p.position, v_half);
    
    p.velocity = v_half + accel_new * half_dt;
    
    // Keep particles near the disk plane
    let max_y = 0.5;
    p.position.y = clamp(p.position.y, -max_y, max_y);
    p.velocity.y *= 0.99;
    
    particles_out[i] = p;
}
