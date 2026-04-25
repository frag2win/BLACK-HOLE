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
    
    // Colors mimicking a physically-inspired blackbody gradient
    vec3 hotWhite = vec3(1.5, 1.4, 1.2);    // Intensely hot inner edge
    vec3 brightYellow = vec3(1.0, 0.9, 0.4); // Transition zone
    vec3 brightOrange = vec3(1.0, 0.4, 0.05); // Standard disk glow
    vec3 deepRed = vec3(0.4, 0.02, 0.0);      // Cool outer edge
    
    vec3 col = mix(hotWhite, brightYellow, smoothstep(0.0, 0.1, t));
    col = mix(col, brightOrange, smoothstep(0.1, 0.4, t));
    col = mix(col, deepRed, smoothstep(0.4, 0.9, t));
    col = mix(col, vec3(0.0), smoothstep(0.9, 1.0, t));
    
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
    // We boost the factor to a 3-5x range as suggested.
    float beamingFactor = exp(vDoppler * 2.0); 
    color *= beamingFactor;
    
    // Pre-multiply by alpha so additive blending doesn't render quad corners
    color *= (alpha * 0.4);

    gl_FragColor = vec4(color, alpha * 0.4);
}
