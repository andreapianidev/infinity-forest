'use client';
import { useRef, useMemo, useEffect, useState } from 'react';
import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '@/lib/world';

/**
 * Post-processing stack for Infinite Forest.
 * 
 * Effects enabled:
 * - Bloom: for fireflies, lightning, emissive plants
 * - DepthOfField: cinematic focus (subtle, performance-conscious)
 * - Vignette: subtle darkening at edges for immersion
 * 
 * All effects react to world state (time, weather, player state).
 */
export function Effects() {
  const { camera } = useThree();
  const [bloomIntensity, setBloomIntensity] = useState(0.35);
  const sunRef = useRef<THREE.Vector3>(new THREE.Vector3(0.5, 0.8, 0.5));
  
  // Track sun direction for effects that need it
  useEffect(() => {
    const updateSun = () => {
      sunRef.current.copy(world.sunDir).normalize();
    };
    // Update roughly every frame via interval (60fps is overkill for sun dir)
    const id = setInterval(updateSun, 100);
    return () => clearInterval(id);
  }, []);

  // Dynamic bloom intensity updated every frame for lightning response
  useFrame(() => {
    // Base intensity
    let intensity = 0.35;
    // Dramatic boost during lightning
    intensity += world.lightningFlash * 2.0;
    // Slightly higher at dawn/dusk for that golden glow
    const hour = world.hour;
    if ((hour >= 5 && hour < 7) || (hour >= 17 && hour < 19)) {
      intensity += 0.15;
    }
    setBloomIntensity(intensity);
  });

  // Mipmap blur for smoother bloom
  const bloomMipmapBlur = true;

  return (
    <EffectComposer multisampling={4}>
      {/* Bloom for emissive elements: fireflies, moonbloom, lightning */}
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.3}
        mipmapBlur={bloomMipmapBlur}
        radius={0.5}
      />
      
      {/* Subtle vignette for cinematic framing */}
      <Vignette
        eskil={false}
        offset={0.35}
        darkness={0.45}
      />
      
      {/* Depth of Field - subtle, focused ~8m ahead */}
      <DepthOfField
        focusDistance={0.025} // ~8m at standard camera settings
        focalLength={0.05}
        bokehScale={6}
        height={480}
      />
      
    </EffectComposer>
  );
}

/**
 * Lens flare effect component.
 * Renders a custom lens flare when looking toward the sun/moon.
 */
export function LensFlare() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const uniforms = useMemo(() => ({
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.5) },
    uSunColor: { value: new THREE.Color('#fff0c8') },
    uIntensity: { value: 0.0 },
    uTime: { value: 0 },
  }), []);
  
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;
  
  const fragmentShader = `
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uIntensity;
    uniform float uTime;
    varying vec2 vUv;
    
    // Simplex noise for organic flare variation
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
    
    void main() {
      // Calculate sun position in screen space
      // This is a simplified approach - assumes sun is always visible direction
      vec2 sunScreen = uSunDir.xz * 0.5 + 0.5;
      vec2 toSun = sunScreen - vUv;
      float dist = length(toSun);
      
      // Main glow around sun position
      float glow = exp(-dist * 8.0) * uIntensity;
      
      // Ghosts (inverse flare artifacts)
      float ghost1 = exp(-length(vUv - (1.0 - sunScreen) * 0.7) * 20.0) * 0.3 * uIntensity;
      float ghost2 = exp(-length(vUv - (1.0 - sunScreen) * 0.5) * 25.0) * 0.2 * uIntensity;
      float ghost3 = exp(-length(vUv - (1.0 - sunScreen) * 0.3) * 30.0) * 0.15 * uIntensity;
      
      // Radial streaks
      float angle = atan(toSun.y, toSun.x);
      float streaks = sin(angle * 8.0 + uTime * 0.5) * 0.5 + 0.5;
      streaks *= exp(-dist * 4.0) * 0.1 * uIntensity;
      
      // Noise variation
      float n = snoise(vUv * 3.0 + uTime * 0.1) * 0.1 + 0.9;
      
      vec3 color = uSunColor * (glow + ghost1 + ghost2 + ghost3 + streaks) * n;
      
      gl_FragColor = vec4(color, max(glow, max(ghost1, max(ghost2, ghost3))));
    }
  `;
  
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [uniforms, vertexShader, fragmentShader]);
  
  useEffect(() => {
    materialRef.current = material;
  }, [material]);
  
  return (
    <mesh ref={meshRef} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default Effects;
