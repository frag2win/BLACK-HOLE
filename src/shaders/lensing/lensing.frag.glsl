uniform sampler2D tDiffuse;
uniform vec2 uBlackHolePos;
uniform float uSchwarzschildR;
uniform float uAspect;
uniform float uLensingStrength;

varying vec2 vUv;

void main() {
    // 1. Get the vector from the black hole to the current pixel
    vec2 delta = vUv - uBlackHolePos;

    // 2. MULTIPLY the X-axis by the aspect ratio BEFORE calculating the distance
    delta.x *= uAspect;

    // 3. Now calculate the true, perfectly circular distance
    float r = length(delta);
    float rs_screen = uSchwarzschildR;

    // Event Horizon (Black Silhouette)
    if (r < rs_screen) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // 4. Calculate deflection strength (using the r^2 falloff as suggested)
    // We also include uLensingStrength for user control.
    float safeR = max(r, 0.001);
    float deflectionStrength = (rs_screen * rs_screen) / (safeR * safeR) * uLensingStrength;

    // 5. Calculate the vector of the deflection
    // We use the aspect-corrected delta to get the correct direction
    vec2 offset = normalize(delta) * deflectionStrength;

    // 6. DIVIDE the X-axis by the aspect ratio to convert back to UV space
    offset.x /= uAspect;

    // 7. Apply the offset to the original UV
    vec2 primaryUV = vUv - offset;

    // Sample the primary image
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
    if (primaryUV.x >= 0.0 && primaryUV.x <= 1.0 && primaryUV.y >= 0.0 && primaryUV.y <= 1.0) {
        col = texture2D(tDiffuse, primaryUV);
    }

    // 8. Secondary Image (Einstein Ring)
    // Mirrors light from behind the black hole
    float einsteinRadius = rs_screen * 1.5;
    if (r < einsteinRadius) {
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 secondaryDelta = normalize(delta) * mirroredR;
        
        // Convert back to UV space
        vec2 secondaryUV = uBlackHolePos - vec2(secondaryDelta.x / uAspect, secondaryDelta.y);
        
        if (secondaryUV.x >= 0.0 && secondaryUV.x <= 1.0 && secondaryUV.y >= 0.0 && secondaryUV.y <= 1.0) {
            vec4 col2 = texture2D(tDiffuse, secondaryUV);
            
            // Brightness threshold to keep background clean
            float brightness = dot(col2.rgb, vec3(0.299, 0.587, 0.114));
            if (brightness > 0.02) {
                col.rgb += col2.rgb;
            }
        }
    }

    gl_FragColor = vec4(col.rgb, 1.0);
}
