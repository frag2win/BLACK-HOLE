/**
 * Accretion disk particle fragment shader
 */
varying vec2 vUv;
varying float vRadius;
varying float vDoppler;

uniform float uIsco;
uniform float uMaxRadius;

// Maps radius to a basic thermal gradient profile
vec3 getThermalColor(float r) {
    // Normalize radius from r_ISCO (bound=0.0) to max disk radius (bound=1.0)
    float t = clamp((r - uIsco) / (uMaxRadius - uIsco), 0.0, 1.0);
    
    // Colors mimicking a blackbody gradient
    vec3 hotWhite = vec3(1.0, 0.95, 0.9);
    vec3 brightOrange = vec3(1.0, 0.6, 0.1);
    vec3 deepRed = vec3(0.5, 0.1, 0.0);
    vec3 darkVoid = vec3(0.0, 0.0, 0.0);
    
    vec3 col = mix(hotWhite, brightOrange, smoothstep(0.0, 0.2, t));
    col = mix(col, deepRed, smoothstep(0.2, 0.6, t));
    col = mix(col, darkVoid, smoothstep(0.6, 1.0, t));
    
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

    // Apply Doppler shift
    // vDoppler > 0 means moving towards (blueshift -> boost intensity, shift color toward white/blue)
    // vDoppler < 0 means moving away (redshift -> reduce intensity, shift color toward red)
    
    float dopplerFactor = 1.0 + vDoppler * 0.8; // Beaming effect
    color *= dopplerFactor;
    
    // Slight hue shift
    if (vDoppler > 0.0) {
        color += vec3(0.1, 0.2, 0.4) * (vDoppler * 0.5);
    } else {
        color += vec3(0.4, 0.1, 0.0) * (-vDoppler * 0.3);
    }

    gl_FragColor = vec4(color, alpha * 0.6);
}
