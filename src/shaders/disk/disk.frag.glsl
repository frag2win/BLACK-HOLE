/**
 * Accretion disk particle fragment shader — Phase 3 Visual Upgrade
 *
 * Enhancements:
 * - PRD-spec color temperature gradient (blue-white inner → red outer)
 * - Relativistic Doppler beaming (3-5x asymmetry)
 * - ACES tonemapping per-particle
 */
varying vec2 vUv;
varying float vRadius;
varying float vDoppler;

uniform float uIsco;
uniform float uMaxRadius;

// ACES Filmic Tonemapping
vec3 ACESFilm(vec3 x) {
    return clamp(
        (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
        0.0, 1.0
    );
}

// PRD §5.3 — Color temperature gradient based on radius
// Temperature at radius r follows a rough power law: T ∝ (r_ISCO / r)^0.75
// Hot inner (blue-white) → warm mid (orange-gold) → cool outer (deep red)
vec3 getThermalColor(float r) {
    float T = pow(uIsco / max(r, uIsco), 0.75);
    
    vec3 cool = vec3(0.9, 0.2, 0.05);    // Deep red (outer disk)
    vec3 warm = vec3(1.0, 0.6, 0.1);     // Orange-gold (mid disk)
    vec3 hot  = vec3(0.9, 0.95, 1.0);    // Blue-white (inner disk)
    
    // Double mix: cool → warm → hot based on temperature ratio
    vec3 col = mix(cool, mix(warm, hot, T), T);
    
    return col;
}

void main() {
    // Soft circle mask (particles are rendered as quads)
    float distToCenter = length(vUv - 0.5);
    if (distToCenter > 0.5) {
        discard;
    }
    
    // Non-linear falloff for soft edges
    float alpha = 1.0 - (distToCenter * 2.0);
    alpha = alpha * alpha; 
    
    // Intensity boost for additive blending glow
    vec3 color = getThermalColor(vRadius) * 2.5;

    // Doppler Beaming (relativistic beaming)
    // Moving towards observer = significantly brighter
    // Moving away = significantly dimmer
    // exp(vDoppler * 2.0) gives ~3-5x range
    float beamingFactor = exp(vDoppler * 2.0); 
    color *= beamingFactor;
    
    // Apply ACES tonemapping to prevent white-clipping
    color = ACESFilm(color);
    
    // Pre-multiply by alpha so additive blending doesn't render quad corners
    color *= (alpha * 0.4);

    gl_FragColor = vec4(color, alpha * 0.4);
}
