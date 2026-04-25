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

    // 5. Photon ring — sharp luminous band at ~1.5 rs
    float photonSphereR = rs_screen * 1.5;
    float photonRingWidth = rs_screen * 0.02; // Near 1px sharpness
    float photonRingDist = abs(r - photonSphereR);
    float photonRing = smoothstep(photonRingWidth, 0.0, photonRingDist);
    // Apply Kerr asymmetry to photon ring brightness too
    photonRing *= (1.0 + uSpin * 0.5 * cos(phi));

    // 6. Calculate deflection strength — Kerr asymmetric
    float safeR = max(r, 0.001);
    float deflectionStrength = ((rs_screen * rs_screen) / (safeR * safeR)) * uLensingStrength * uLensingMultiplier;
    // Stronger deflection on one side when spinning
    deflectionStrength *= (1.0 + uSpin * 0.5 * cos(phi));

    // 7. Calculate deflection vector in aspect-corrected space
    vec2 offset = normalize(delta) * deflectionStrength;

    // 8. Convert back to UV space
    offset.x /= aspect;

    // 9. Apply the offset to the original UV
    vec2 primaryUV = vUv - offset;

    // Sample the primary image
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
    if (primaryUV.x >= 0.0 && primaryUV.x <= 1.0 && primaryUV.y >= 0.0 && primaryUV.y <= 1.0) {
        col = texture2D(tDiffuse, primaryUV);
    }

    // 10. Secondary Image (Einstein Ring)
    float einsteinRadius = rs_screen * 1.5;
    if (r < einsteinRadius) {
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 secondaryDelta = normalize(delta) * mirroredR;
        
        // Convert back to UV space
        vec2 secondaryUV = uBlackHolePos - vec2(secondaryDelta.x / aspect, secondaryDelta.y);
        
        if (secondaryUV.x >= 0.0 && secondaryUV.x <= 1.0 && secondaryUV.y >= 0.0 && secondaryUV.y <= 1.0) {
            vec4 col2 = texture2D(tDiffuse, secondaryUV);
            
            // Brightness threshold to keep background clean
            float brightness = dot(col2.rgb, vec3(0.299, 0.587, 0.114));
            if (brightness > 0.02) {
                col.rgb += col2.rgb;
            }
        }
    }

    // 11. Add photon ring glow
    vec3 photonColor = vec3(1.0, 0.85, 0.6) * photonRing * 2.0;
    col.rgb += photonColor;

    // 12. Apply ACES tonemapping to prevent white-clipping from bloom
    col.rgb = ACESFilm(col.rgb);

    gl_FragColor = vec4(col.rgb, 1.0);
}
