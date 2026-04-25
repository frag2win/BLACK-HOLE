/**
 * Lensing fragment shader — Phase 3 Visual Upgrade
 * 
 * Enhancements:
 * - Asymmetric Kerr shadow (D-shaped with spin)
 * - Sharp photon ring (near 1px)
 * - ACES filmic tonemapping
 */
uniform sampler2D tDiffuse;
uniform vec2 uBlackHolePos;
uniform float uSchwarzschildR;
uniform vec2 uResolution;
uniform float uLensingStrength;
uniform float uLensingMultiplier;
uniform float uSpin;    // Kerr spin parameter a [0.0, 1.0]

varying vec2 vUv;

// ACES Filmic Tonemapping — prevents bloom white-clipping
vec3 ACESFilm(vec3 x) {
    return clamp(
        (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
        0.0, 1.0
    );
}

void main() {
    float aspect = uResolution.x / uResolution.y;
    
    // 1. Get the vector from the black hole to the current pixel
    vec2 delta = vUv - uBlackHolePos;

    // 2. Correct for aspect ratio before distance calculations
    delta.x *= aspect;

    // 3. Calculate the true circular distance and polar angle
    float r = length(delta);
    float phi = atan(delta.y, delta.x); // Polar angle for Kerr asymmetry
    float rs_screen = uSchwarzschildR;

    // 4. Kerr shadow boundary — asymmetric (D-shaped)
    // The shadow is compressed on the approaching (prograde) side
    float shadowR = rs_screen * (1.0 - uSpin * 0.3 * cos(phi));
    
    // Event Horizon (Black Silhouette)
    if (r < shadowR) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // 5. Photon ring — razor-thin luminous band at ~1.5 rs
    float photonSphereR = rs_screen * 1.5;
    float photonRingWidth = rs_screen * 0.008; // Razor thin
    float photonRingDist = abs(r - photonSphereR);
    float photonRing = smoothstep(photonRingWidth, 0.0, photonRingDist);
    // Inner-edge brightness peak: brighter closest to event horizon
    float innerFalloff = 1.0 / (1.0 + 8.0 * max(0.0, r - photonSphereR) / rs_screen);
    photonRing *= innerFalloff;
    // Apply Kerr asymmetry to photon ring brightness too
    photonRing *= (1.0 + uSpin * 0.5 * cos(phi));

    // 6. Calculate deflection strength — Kerr asymmetric
    float safeR = max(r, 0.001);
    float deflectionStrength = ((rs_screen * rs_screen) / (safeR * safeR)) * uLensingStrength * uLensingMultiplier;
    // Stronger deflection on one side when spinning
    deflectionStrength *= (1.0 + uSpin * 0.5 * cos(phi));

    // 7. Calculate deflection vector in aspect-corrected space
    vec2 offset = normalize(delta) * deflectionStrength;

    // 7b. Cap maximum deflection to prevent extreme UV warping
    float maxDeflect = 0.15;
    float offsetLen = length(offset);
    if (offsetLen > maxDeflect) {
        offset *= maxDeflect / offsetLen;
    }

    // 8. Convert back to UV space
    offset.x /= aspect;

    // 9. Apply the offset — bounds-check instead of clamping
    vec2 primaryUV = vUv - offset;

    // Sample the primary image — BLACK if out of bounds (no clamping!)
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
    if (primaryUV.x > 0.0 && primaryUV.x < 1.0 && primaryUV.y > 0.0 && primaryUV.y < 1.0) {
        col = texture2D(tDiffuse, primaryUV);
    }

    // 10. Secondary Image (Einstein Ring)
    float einsteinRadius = rs_screen * 1.5;
    if (r < einsteinRadius) {
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 secondaryDelta = normalize(delta) * mirroredR;
        
        vec2 secondaryUV = uBlackHolePos - vec2(secondaryDelta.x / aspect, secondaryDelta.y);
        
        // Only sample if in bounds — never clamp
        if (secondaryUV.x > 0.0 && secondaryUV.x < 1.0 && secondaryUV.y > 0.0 && secondaryUV.y < 1.0) {
            vec4 col2 = texture2D(tDiffuse, secondaryUV);
            
            float brightness = dot(col2.rgb, vec3(0.299, 0.587, 0.114));
            if (brightness > 0.02) {
                col.rgb += col2.rgb;
            }
        }
    }

    // 11. Add photon ring glow — warm gold to match thermal palette
    vec3 photonColor = vec3(1.0, 0.75, 0.3) * photonRing * 1.8;
    col.rgb += photonColor;

    // 12. Apply ACES tonemapping to prevent white-clipping from bloom
    col.rgb = ACESFilm(col.rgb);

    gl_FragColor = vec4(col.rgb, 1.0);
}
