uniform sampler2D tDiffuse;
uniform vec2 uBlackHolePos;
uniform float uSchwarzschildR;
uniform float uAspect;
uniform float uLensingStrength;

varying vec2 vUv;

void main() {
    vec2 delta = vUv - uBlackHolePos;
    delta.x *= uAspect;
    
    float r = length(delta);
    
    if (r < 0.0001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    float rs_screen = uSchwarzschildR;
    
    // 2rs/b deflection approximation mapped to screen space
    float deflectionStrength = (rs_screen * rs_screen / r) * uLensingStrength;
    
    vec2 deflectionDir = delta / r; // normalized
    deflectionDir.x /= uAspect; // un-aspect for adding back to uv
    
    vec2 deflectedUV = vUv - deflectionDir * deflectionStrength;
    
    float einsteinRadius = rs_screen * 1.5;
    
    if (r < einsteinRadius) {
        // Simple mirroring for secondary image inside Einstein ring
        float mirroredR = einsteinRadius * 2.0 - r;
        vec2 mirroredDelta = (delta / r) * mirroredR;
        mirroredDelta.x /= uAspect;
        deflectedUV = uBlackHolePos + mirroredDelta;
    }
    
    vec4 result = texture2D(tDiffuse, clamp(deflectedUV, 0.0, 1.0));
    gl_FragColor = result;
}
