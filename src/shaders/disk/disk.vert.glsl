/**
 * Accretion disk particle vertex shader
 */
attribute vec3 instanceVelocity;

varying vec2 vUv;
varying float vRadius;
varying float vDoppler;

void main() {
    vUv = uv;
    
    // instanceMatrix is automatically injected by Three.js ShaderMaterial 
    // when applied to an InstancedMesh.
    // Extract translation vector (particle center)
    // The instance space center is the translation part of instanceMatrix
    vec3 center = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    
    // For thermal color in fragment
    vRadius = length(center.xz);
    
    // Calculate Doppler shift
    // viewMatrix[2].xyz is the camera's backward vector in world space, so camera forward is -viewMatrix[2].xyz.
    // Actually, cameraForward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vec3 cameraForward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    
    // The velocity is in simulation units (rs/time). We can normalize it or scale it.
    // Let's dot it with cameraForward. Positive means moving towards camera (blueshift).
    float velMag = length(instanceVelocity);
    if (velMag > 0.0001) {
        vec3 velNormalized = instanceVelocity / velMag;
        vDoppler = dot(velNormalized, cameraForward);
    } else {
        vDoppler = 0.0;
    }
    
    // Get the instance center in view space
    vec4 mvCenter = viewMatrix * modelMatrix * vec4(center, 1.0);

    // Billboarding: Keep particle geometry facing the camera 
    // by applying base positions directly in view space.
    // This makes the plane align with the screen.
    vec4 mvPosition = mvCenter + vec4(position, 0.0);
    
    gl_Position = projectionMatrix * mvPosition;
}
