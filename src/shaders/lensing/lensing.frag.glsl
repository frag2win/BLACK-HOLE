uniform sampler2D tDiffuse;
uniform vec2 uBlackHolePos;
uniform float uSchwarzschildR;
uniform float uAspect;
uniform float uLensingStrength;

varying vec2 vUv;

void main() {
    vec2 uv = vUv;
    vec2 delta = uv - uBlackHolePos;
    delta.x *= uAspect;
    
    float r = length(delta);
    float rs_screen = uSchwarzschildR;
    
    // Event Horizon (black silhouette)
    if (r < rs_screen) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    vec2 deflectionDir = delta / r;
    
    // Gravitational Lensing effect
    // Deflection angle formula ~ 2rs / b mapped to screen space.
    float deflectionAmount = (rs_screen * rs_screen) / r * uLensingStrength;
    
    // PRIMARY IMAGE: Light bending outward
    vec2 delta1 = delta - deflectionDir * deflectionAmount;
    vec2 deflectedUV = uBlackHolePos + vec2(delta1.x / uAspect, delta1.y);
    
    vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
    
    // Only sample if within screen bounds to prevent edge smear
    if (deflectedUV.x >= 0.0 && deflectedUV.x <= 1.0 && deflectedUV.y >= 0.0 && deflectedUV.y <= 1.0) {
        col = texture2D(tDiffuse, deflectedUV);
    }
    
    // SECONDARY IMAGE: Einstein Ring (Light wrapping completely around)
    float einsteinRadius = rs_screen * 1.5;
    if (r < einsteinRadius) {
        // Mirror ray around photon sphere
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 delta2 = deflectionDir * mirroredR;
        vec2 deflectedUV2 = uBlackHolePos - vec2(delta2.x / uAspect, delta2.y);
        
        if (deflectedUV2.x >= 0.0 && deflectedUV2.x <= 1.0 && deflectedUV2.y >= 0.0 && deflectedUV2.y <= 1.0) {
            vec4 col2 = texture2D(tDiffuse, deflectedUV2);
            // Additive blending for the secondary ring image
            col.rgb += col2.rgb;
        }
    }
    
    gl_FragColor = vec4(col.rgb, 1.0);
}
