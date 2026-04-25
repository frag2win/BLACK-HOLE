uniform sampler2D tDiffuse;
uniform vec2 uBlackHolePos;
uniform float uSchwarzschildR;
uniform float uAspect;
uniform float uLensingStrength;

varying vec2 vUv;

void main() {
    // 1. Calculate Aspect-Corrected Distance
    vec2 delta = vUv - uBlackHolePos;
    delta.x *= uAspect;
    
    float r = length(delta);
    float rs_screen = uSchwarzschildR;
    
    // 2. Event Horizon (Black Silhouette)
    // We use a slightly smaller radius for the silhouette to let the lensing 
    // handle the inner-most light bending.
    if (r < rs_screen) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // 3. Primary Gravitational Lensing
    // We use the physically inspired 2rs/b deflection mapped to screen units.
    // Ensure r doesn't hit 0 to avoid division by zero.
    float safeR = max(r, 0.0001);
    float deflection = (rs_screen * rs_screen) / safeR * uLensingStrength;
    
    // Direction of deflection in aspect-corrected space
    vec2 dir = delta / safeR;
    
    // Convert deflection back to UV space by dividing out aspect ratio
    vec2 uvDeflection = vec2(dir.x / uAspect, dir.y) * deflection;
    vec2 primaryUV = vUv - uvDeflection;
    
    // Sample primary image
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
    if (primaryUV.x >= 0.0 && primaryUV.x <= 1.0 && primaryUV.y >= 0.0 && primaryUV.y <= 1.0) {
        col = texture2D(tDiffuse, primaryUV);
    }
    
    // 4. Secondary Image (Einstein Ring)
    // Mirrored light path around the photon sphere (approx. 1.5rs)
    float einsteinRadius = rs_screen * 1.5;
    if (r < einsteinRadius) {
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 secondaryDelta = dir * mirroredR;
        
        // Map back to UV space
        vec2 secondaryUV = uBlackHolePos - vec2(secondaryDelta.x / uAspect, secondaryDelta.y);
        
        if (secondaryUV.x >= 0.0 && secondaryUV.x <= 1.0 && secondaryUV.y >= 0.0 && secondaryUV.y <= 1.0) {
            vec4 col2 = texture2D(tDiffuse, secondaryUV);
            
            // Brightness check to prevent background gray ghosting
            float brightness = dot(col2.rgb, vec3(0.299, 0.587, 0.114));
            if (brightness > 0.02) {
                // Blend with primary image
                col.rgb += col2.rgb;
            }
        }
    }
    
    gl_FragColor = vec4(col.rgb, 1.0);
}
