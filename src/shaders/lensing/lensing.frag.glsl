uniform sampler2D tDiffuse;
uniform vec2 uBlackHolePos;
uniform float uSchwarzschildR;
uniform float uAspect;
uniform float uLensingStrength;

varying vec2 vUv;

void main() {
    // 1. Correct for Aspect Ratio
    vec2 delta = vUv - uBlackHolePos;
    delta.x *= uAspect;
    
    float r = length(delta);
    float rs_screen = uSchwarzschildR;
    
    // 2. Event Horizon (Black Silhouette)
    if (r < rs_screen) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // 3. Gravitational Lensing Deflection
    // Approximate deflection angle for Schwarzschild: 4GM/c^2b -> 2rs/b
    // In screen space, we use a simplified (rs^2 / r) curve for visual impact.
    float deflectionAmount = (rs_screen * rs_screen) / r * uLensingStrength;
    
    // Calculate deflection vector
    vec2 deflectionDir = delta / r;
    
    // Apply primary deflection
    vec2 primaryDelta = delta - deflectionDir * deflectionAmount;
    
    // Convert back from aspect-corrected space to UV space
    vec2 primaryUV = uBlackHolePos + vec2(primaryDelta.x / uAspect, primaryDelta.y);
    
    // Sample background (primary image)
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
    if (primaryUV.x >= 0.0 && primaryUV.x <= 1.0 && primaryUV.y >= 0.0 && primaryUV.y <= 1.0) {
        col = texture2D(tDiffuse, primaryUV);
    }
    
    // 4. Secondary Image (Einstein Ring)
    // Light from behind the black hole can wrap around.
    float einsteinRadius = rs_screen * 1.5; // Photon sphere boundary
    if (r < einsteinRadius) {
        // Mirror the ray across the photon sphere
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 secondaryDelta = deflectionDir * mirroredR;
        vec2 secondaryUV = uBlackHolePos - vec2(secondaryDelta.x / uAspect, secondaryDelta.y);
        
        if (secondaryUV.x >= 0.0 && secondaryUV.x <= 1.0 && secondaryUV.y >= 0.0 && secondaryUV.y <= 1.0) {
            vec4 col2 = texture2D(tDiffuse, secondaryUV);
            // Blend secondary image. We use additive blending but capped to avoid over-exposure.
            // Only add if the pixel is actually bright (part of disk) to avoid gray ghosting from background.
            float brightness = dot(col2.rgb, vec3(0.299, 0.587, 0.114));
            if (brightness > 0.01) {
                col.rgb += col2.rgb;
            }
        }
    }
    
    gl_FragColor = vec4(col.rgb, 1.0);
}
