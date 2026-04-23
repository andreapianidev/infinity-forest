'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Player, PlayerState } from './Player';
import { Chunk, WIND_MATERIALS } from './Chunk';
import { Animals } from './Animals';
import { HUD } from './HUD';
import { NPCs } from './NPCs';
import { NPCDialog } from './NPCDialog';
import { Weather } from './Weather';
import { Soundscape } from './Audio';
import { useGame, PlantKind, plantAvailable } from '@/lib/store';
import {
  world,
  WATER_LEVEL,
  updateSunAndPalette,
  updateLocalMoisture,
  stepWeather,
  stepCalm,
  useHUDWorld,
  useSettings,
  currentLocalHour,
  phaseOf,
  getRealSeason,
  calculateTemperature,
  getMoonPhase,
} from '@/lib/world';

import { CHUNK_SIZE, lakeMask, sampledHeight, heightAt, WORLD_SEED } from '@/lib/noise';
// 5×5 = 25 chunks loaded around the player (≈320m × 320m). This is the
// sweet spot for perf: denser per-chunk generation fills the forest visually
// while instanced draw-call count stays bounded. Fog masks the far edge.
export const VIEW_RADIUS = 2;

/** Convert camera direction to compass facing */
function getFacingFromCamera(camera: THREE.Camera): string {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const angle = Math.atan2(dir.x, dir.z); // angle from -Z (north)
  const deg = (angle * 180 / Math.PI + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return 'N';
  if (deg >= 22.5 && deg < 67.5) return 'NE';
  if (deg >= 67.5 && deg < 112.5) return 'E';
  if (deg >= 112.5 && deg < 157.5) return 'SE';
  if (deg >= 157.5 && deg < 202.5) return 'S';
  if (deg >= 202.5 && deg < 247.5) return 'SW';
  if (deg >= 247.5 && deg < 292.5) return 'W';
  return 'NW';
}

/** Drives time, weather, calm and pushes palette to scene each frame. */
function WorldTick({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const { scene, gl, camera } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const sunTarget = useRef<THREE.Object3D>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const hudSet = useHUDWorld((s) => s.set);
  const hudTimer = useRef(0);
  const [showStars, setShowStars] = useState(false);
  const lastPos = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl]);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.1);
    const { realtimeClock, manualHour, seasonMode } = useSettings.getState();
    world.hour = realtimeClock ? currentLocalHour() : manualHour;
    world.phase = phaseOf(world.hour);
    // Season sync: auto = from real date, or manual selection
    world.season = seasonMode === 'auto' ? getRealSeason() : seasonMode;
    const pp = playerRef.current.position;
    
    // Track distance traveled
    if (lastPos.current) {
      const dx = pp.x - lastPos.current.x;
      const dz = pp.z - lastPos.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      world.distanceTraveled += dist;
    }
    if (!lastPos.current) lastPos.current = new THREE.Vector3();
    lastPos.current.copy(pp);
    
    updateLocalMoisture(pp.x, pp.z, dt);
    stepWeather(dt);
    stepCalm(dt);
    world.windPhase += dt * world.windStrength;
    updateSunAndPalette();

    // Apply to scene
    scene.background = world.skyColor;
    if (!scene.fog) scene.fog = new THREE.Fog(world.fogColor, world.fogNear, world.fogFar);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(world.fogColor);
    fog.near = world.fogNear;
    fog.far = world.fogFar;
    gl.toneMappingExposure = world.exposure;

    // Shared wind/time uniforms — one update per frame for every foliage material.
    for (let i = 0; i < WIND_MATERIALS.length; i++) {
      const sh = (WIND_MATERIALS[i].userData as any).shader;
      if (sh) {
        sh.uniforms.uTime.value = state.clock.elapsedTime;
        sh.uniforms.uWind.value = world.windStrength;
      }
    }

    // Lightning flash boost - temporarily increase light intensity
    const flashBoost = world.lightningFlash * 2.5; // Up to 2.5x brightness during flash
    const flashColor = new THREE.Color().setHex(0xe8f0ff); // Cool white-blue flash

    if (sun.current && sunTarget.current) {
      // Keep shadow frustum centered on the player.
      const pp = playerRef.current.position;
      sunTarget.current.position.set(pp.x, 0, pp.z);
      sun.current.position.copy(world.sunDir).multiplyScalar(120).add(sunTarget.current.position);
      sun.current.target = sunTarget.current;
      // Mix in flash color during lightning
      const baseColor = world.lightColor.clone();
      if (flashBoost > 0.1) baseColor.lerp(flashColor, world.lightningFlash * 0.6);
      sun.current.color.copy(baseColor);
      sun.current.intensity = world.lightIntensity * (1 + flashBoost * 0.4);
    }
    if (hemi.current) {
      const baseAmb = world.ambientColor.clone();
      if (flashBoost > 0.1) baseAmb.lerp(flashColor, world.lightningFlash * 0.5);
      hemi.current.color.copy(baseAmb);
      hemi.current.groundColor.copy(world.ambientGround);
      hemi.current.intensity = world.ambientIntensity * (1 + flashBoost * 0.8);
    }
    if (moon.current) {
      // Strong cool fill during night hours so the player can actually see.
      const night = world.hour > 20 || world.hour < 6 ? 1 : 0;
      moon.current.intensity = 0.6 * night * (1 + flashBoost * 0.3);
      moon.current.color.setHex(0xb8c8ff);
      moon.current.position.set(-world.sunDir.x, Math.max(0.5, -world.sunDir.y + 0.4), -world.sunDir.z).multiplyScalar(100);
    }

    // Sky flash effect during lightning
    if (world.lightningFlash > 0.05) {
      const flashSky = world.skyColor.clone().lerp(new THREE.Color(0xc8d8e8), world.lightningFlash * 0.5);
      scene.background = flashSky;
    } else {
      scene.background = world.skyColor;
    }

    // Throttled HUD + reactive flags (5 Hz)
    hudTimer.current += dt;
    if (hudTimer.current > 0.2) {
      hudTimer.current = 0;
      const pp = playerRef.current.position;
      const altitude = heightAt(pp.x, pp.z);
      const temp = calculateTemperature(altitude, world.season, world.hour, world.weather);
      const moonPhase = getMoonPhase();
      const sessionTime = Math.floor((Date.now() - world.sessionStartTime) / 1000);
      
      // Calculate facing direction from camera rotation
      const facing = getFacingFromCamera(camera);
      
      hudSet({ 
        hour: world.hour, phase: world.phase, season: world.season, weather: world.weather, 
        calm: world.calm, rainT: world.rainT, fogT: world.fogT, postRainT: world.postRainT, 
        stormT: world.stormT, snowT: world.snowT, lightningFlash: world.lightningFlash, altitude,
        // Exploration
        distanceTraveled: world.distanceTraveled, playerSpeed: world.playerSpeed, facing,
        posX: pp.x, posZ: pp.z,
        // Progress
        sessionTime,
        plantsCollected: useGame.getState().sessionPlants,
        // Environmental
        temperature: temp, moonPhase
      });
      const nowShowStars = world.hour > 20 || world.hour < 6;
      if (nowShowStars !== showStars) setShowStars(nowShowStars);
    }
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={0.1} />
      <hemisphereLight ref={hemi} args={[world.ambientColor, world.ambientGround, world.ambientIntensity]} />
      <object3D ref={sunTarget} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={world.lightIntensity}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0005}
      />
      <directionalLight ref={moon} color="#9ab0e0" intensity={0} />
      {showStars && <Stars radius={260} depth={80} count={9000} factor={5} saturation={0.4} fade speed={0.4} />}
    </>
  );
}

/**
 * Occasional shooting stars during night hours (21:00–05:00).
 * A pool of 1 active streak is scheduled with a random cooldown of
 * ~15–70 s between appearances. Each streak lerps between two random
 * high-altitude points, stretches along its velocity, and fades in/out.
 */
function ShootingStars({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const st = useRef({
    active: false,
    t0: 0,
    dur: 1.4,
    nextIn: 8 + Math.random() * 20,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
  });
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );
  // Cylinder default length-axis is Y; rotate so scale.z controls streak length.
  const geom = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.08, 0.02, 1, 6);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);

  useFrame((state, dt) => {
    const hour = world.hour;
    const isNight = hour > 20.5 || hour < 5;
    const s = st.current;
    const m = meshRef.current;
    if (!m) return;

    if (!isNight) {
      material.opacity = 0;
      m.visible = false;
      return;
    }
    m.visible = true;

    if (!s.active) {
      s.nextIn -= dt;
      material.opacity = 0;
      if (s.nextIn <= 0) {
        const pp = playerRef.current.position;
        // Random entry azimuth; exit azimuth within ±30° for a shallow arc.
        const az1 = Math.random() * Math.PI * 2;
        const delta = (0.3 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1);
        const az2 = az1 + delta;
        const R = 200;
        s.from.set(pp.x + Math.cos(az1) * R, 70 + Math.random() * 40, pp.z + Math.sin(az1) * R);
        s.to.set(pp.x + Math.cos(az2) * R, 30 + Math.random() * 30, pp.z + Math.sin(az2) * R);
        s.dur = 0.9 + Math.random() * 0.9;
        s.t0 = state.clock.elapsedTime;
        s.active = true;
      }
      return;
    }

    const tNorm = (state.clock.elapsedTime - s.t0) / s.dur;
    if (tNorm >= 1) {
      s.active = false;
      s.nextIn = 15 + Math.random() * 55;
      material.opacity = 0;
      return;
    }
    m.position.lerpVectors(s.from, s.to, tNorm);
    m.lookAt(s.to);
    const fade = Math.sin(tNorm * Math.PI); // 0→1→0
    material.opacity = fade * 0.95;
    const len = 6 + fade * 16;
    m.scale.set(0.35, 0.35, len);
  });

  return <mesh ref={meshRef} geometry={geom} material={material} renderOrder={3} />;
}

/**
 * A small cluster of lake fireflies. When a lake is detected within 70m of
 * the player, up to 5 fireflies hover just above its water at night with a
 * gentle drift. When no water is nearby or it's daytime, they fade out.
 * Cheap: one sampling pass every ~2 s + simple sin-drift per frame.
 */
function LakeFireflies({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const COUNT = 5;
  const group = useRef<THREE.Group>(null);
  const items = useRef(
    Array.from({ length: COUNT }, (_, i) => ({
      anchor: new THREE.Vector3(0, -999, 0), // y < -100 flags "no anchor"
      offset: new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * 4,
      ),
      phase: i * 1.3 + Math.random() * 2,
      visible: 0,
    })),
  );
  const searchTimer = useRef(0);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const hour = world.hour;
    const isNight = hour > 19.5 || hour < 5.5;

    searchTimer.current -= dt;
    if (searchTimer.current <= 0 && isNight) {
      searchTimer.current = 1.5 + Math.random() * 1.5;
      const pp = playerRef.current.position;
      for (let k = 0; k < 10; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 15 + Math.random() * 55;
        const cx = pp.x + Math.cos(ang) * r;
        const cz = pp.z + Math.sin(ang) * r;
        if (lakeMask(cx, cz) > 0.4) {
          for (let i = 0; i < COUNT; i++) {
            items.current[i].anchor.set(
              cx + (Math.random() - 0.5) * 5,
              // Hover ~1–2 m ABOVE the water so they read as flying
              // above the surface, not floating in it.
              WATER_LEVEL + 1.2 + Math.random() * 0.8,
              cz + (Math.random() - 0.5) * 5,
            );
          }
          break;
        }
      }
    }

    if (!group.current) return;
    for (let i = 0; i < COUNT; i++) {
      const it = items.current[i];
      const child = group.current.children[i] as THREE.Group | undefined;
      if (!child) continue;
      const hasAnchor = it.anchor.y > -100;
      const targetVis = hasAnchor && isNight ? 1 : 0;
      it.visible += (targetVis - it.visible) * Math.min(1, dt * 1.5);
      child.visible = it.visible > 0.02;
      if (!hasAnchor) continue;
      const p = it.phase + t * 0.35;
      child.position.set(
        it.anchor.x + Math.sin(p) * 1.4 + it.offset.x * 0.4,
        it.anchor.y + Math.sin(t * 2 + i) * 0.25,
        it.anchor.z + Math.cos(p * 0.7) * 1.2 + it.offset.z * 0.4,
      );
      child.scale.setScalar(Math.max(0.001, it.visible));
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <group key={i}>
          <mesh>
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshStandardMaterial
              color="#fff4a8"
              emissive="#d8ff80"
              emissiveIntensity={4}
              toneMapped={false}
            />
          </mesh>
          <pointLight color="#c8ff80" intensity={1.2} distance={5} decay={2} />
        </group>
      ))}
    </group>
  );
}

/**
 * Storm clouds - dark, low-hanging clouds that appear during rain and storm.
 * These create visible cloud cover above the scene, making the sky feel more
 * realistic and ominous during bad weather.
 */
function StormClouds({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const groupRef = useRef<THREE.Group>(null);

  // Generate cloud positions once
  const clouds = useMemo(() => {
    const positions: { x: number; z: number; scale: number; opacity: number }[] = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 60 + Math.random() * 80; // 60-140m from center
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 8 + Math.random() * 12; // 8-20m wide clouds
      const opacity = 0.6 + Math.random() * 0.3;
      positions.push({ x, z, scale, opacity });
    }
    return positions;
  }, []);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    // Follow player
    const pp = playerRef.current.position;
    group.position.x = pp.x;
    group.position.z = pp.z;

    // Height based on weather - lower during storm
    const baseHeight = 45 - world.stormT * 15; // 30-45m high
    const rainIntensity = Math.max(world.rainT, world.stormT);

    // Animate clouds - slow drift
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const cloud = clouds[i];
      if (!cloud || !mesh) return;

      // Drift animation
      const driftX = Math.sin(t * 0.1 + i) * 3;
      const driftZ = Math.cos(t * 0.08 + i) * 2;
      mesh.position.x = cloud.x + driftX;
      mesh.position.z = cloud.z + driftZ;
      mesh.position.y = baseHeight + Math.sin(t * 0.2 + i * 0.5) * 3;

      // Scale breathing
      const breathe = 1 + Math.sin(t * 0.15 + i) * 0.1;
      mesh.scale.setScalar(cloud.scale * breathe);

      // Fade in/out based on rain intensity
      const material = mesh.material as THREE.MeshBasicMaterial;
      const targetOpacity = rainIntensity > 0.3 ? cloud.opacity * rainIntensity : 0;
      material.opacity += (targetOpacity - material.opacity) * 0.05;
      mesh.visible = material.opacity > 0.01;
    });
  });

  // Dark storm cloud color - charcoal gray
  const cloudColor = useMemo(() => new THREE.Color('#4a4a55'), []);

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <mesh key={i} position={[cloud.x, 40, cloud.z]}>
          {/* Fluffy cloud made of merged spheres */}
          <group>
            <mesh>
              <sphereGeometry args={[1, 8, 6]} />
              <meshBasicMaterial
                color={cloudColor}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
            {/* Additional puffs for fluffiness */}
            <mesh position={[0.4, 0.2, 0]}>
              <sphereGeometry args={[0.7, 7, 5]} />
              <meshBasicMaterial
                color={cloudColor}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[-0.3, -0.1, 0.2]}>
              <sphereGeometry args={[0.6, 7, 5]} />
              <meshBasicMaterial
                color={cloudColor}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0.1, 0.15, -0.3]}>
              <sphereGeometry args={[0.5, 6, 4]} />
              <meshBasicMaterial
                color={cloudColor}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          </group>
        </mesh>
      ))}
    </group>
  );
}

/**
 * Enhanced water: MeshStandardMaterial (so three handles fog/lights/shadows)
 * with onBeforeCompile injection that adds:
 *  - Subtle vertex wave displacement
 *  - Animated noise-based normal perturbation → shimmering surface
 *  - Fresnel-driven sky tint on the base color
 *  - Specular sparkle from the sun
 * Follows the player so the 500m plane stays centered.
 */
function InfiniteWater({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniformsRef = useRef<{
    uTime: { value: number };
    uSkyColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
  }>({
    uTime: { value: 0 },
    uSkyColor: { value: new THREE.Color('#74b5de') },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4) },
    uSunColor: { value: new THREE.Color('#ffe7b0') },
  });

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#1a4654',
      roughness: 0.18,
      metalness: 0.3,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniformsRef.current.uTime;
      shader.uniforms.uSkyColor = uniformsRef.current.uSkyColor;
      shader.uniforms.uSunDir = uniformsRef.current.uSunDir;
      shader.uniforms.uSunColor = uniformsRef.current.uSunColor;

      // ── VERTEX: gentle waves ────────────────────────────────────────
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           varying vec3 vWorldXZ;`
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
           float w1 = sin(position.x * 0.14 + uTime * 0.85) * cos(position.y * 0.11 + uTime * 0.53);
           float w2 = sin(position.x * 0.07 - uTime * 0.62 + 1.3) * sin(position.y * 0.19 + uTime * 0.41);
           transformed.z += (w1 * 0.08 + w2 * 0.04);
           vec4 _wp = modelMatrix * vec4(transformed, 1.0);
           vWorldXZ = _wp.xyz;`
        );

      // ── FRAGMENT: ripple normal + fresnel sky + sun sparkle ─────────
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec3 uSkyColor;
           uniform vec3 uSunDir;
           uniform vec3 uSunColor;
           varying vec3 vWorldXZ;

           float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
           float wNoise(vec2 p){
             vec2 i = floor(p), f = fract(p);
             float a = wHash(i),              b = wHash(i + vec2(1.0, 0.0));
             float c = wHash(i + vec2(0.0,1.0)), d = wHash(i + vec2(1.0,1.0));
             vec2 u = f * f * (3.0 - 2.0 * f);
             return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
           }
           vec2 wNoiseGrad(vec2 p){
             float e = 0.15;
             float n  = wNoise(p);
             float nx = wNoise(p + vec2(e, 0.0));
             float ny = wNoise(p + vec2(0.0, e));
             return vec2(nx - n, ny - n) / e;
           }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
           {
             vec2 p1 = vWorldXZ.xz * 0.35 + vec2(uTime * 0.18, uTime * 0.08);
             vec2 p2 = vWorldXZ.xz * 0.9  + vec2(-uTime * 0.13, uTime * 0.22);
             vec2 g1 = wNoiseGrad(p1);
             vec2 g2 = wNoiseGrad(p2) * 0.55;
             vec3 perturb = normalize(vec3(-(g1.x + g2.x), 3.0, -(g1.y + g2.y)));
             normal = normalize(mix(normal, perturb, 0.55));
           }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           {
             vec3 vDir = normalize(cameraPosition - vWorldXZ);
             float cosI = clamp(dot(vDir, normal), 0.0, 1.0);
             float fres = pow(1.0 - cosI, 4.0);
             // Sky reflection tint
             diffuseColor.rgb = mix(diffuseColor.rgb, uSkyColor * 0.95, fres * 0.55);
             // Blinn-Phong sun sparkle
             vec3 H = normalize(uSunDir + vDir);
             float spec = pow(max(dot(normal, H), 0.0), 80.0);
             totalEmissiveRadiance += uSunColor * spec * 1.4;
             // Diffuse sparkle (softer, broader)
             float sparkle = pow(max(dot(normal, uSunDir), 0.0), 24.0);
             totalEmissiveRadiance += uSunColor * sparkle * 0.2;
           }`
        );
    };
    return m;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const p = playerRef.current.position;
    meshRef.current.position.x = p.x;
    meshRef.current.position.z = p.z;

    const u = uniformsRef.current;
    u.uTime.value = state.clock.elapsedTime;
    u.uSkyColor.value.copy(world.skyColor);
    u.uSunDir.value.copy(world.sunDir).normalize();
    u.uSunColor.value.copy(world.lightColor).multiplyScalar(Math.max(0.3, world.lightIntensity * 0.6));
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, WATER_LEVEL, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      material={material}
      receiveShadow
    >
      <planeGeometry args={[500, 500, 96, 96]} />
    </mesh>
  );
}

/**
 * Scenic camera for the very first menu view only.
 * Once the player has entered the forest at least once, pressing F / Esc
 * again freezes the camera in place so the menu overlays whatever they
 * were just looking at — no jump back to the intro shot.
 */
function IntroCamera({ locked }: { locked: boolean }) {
  const { camera } = useThree();
  const hasEntered = useRef(false);
  useEffect(() => {
    if (locked) {
      hasEntered.current = true;
      return;
    }
    // First menu view only.
    if (!hasEntered.current) {
      camera.position.set(6, 9, 14);
      camera.lookAt(-6, 1.5, -16);
      camera.updateProjectionMatrix();
    }
  }, [camera, locked]);
  const t0 = useRef(0);
  useFrame((state) => {
    // Only animate the scenic pan on the very first menu view.
    if (locked || hasEntered.current) return;
    const t = state.clock.elapsedTime;
    if (!t0.current) t0.current = t;
    const phase = (t - t0.current) * 0.08;
    camera.position.x = Math.sin(phase) * 8 + 4;
    camera.position.y = 9 + Math.sin(phase * 0.7) * 0.6;
    camera.position.z = Math.cos(phase) * 12 + 6;
    camera.lookAt(-4, 1.5, -12);
  });
  return null;
}

function ChunkManager({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const [center, setCenter] = useState<[number, number]>([0, 0]);

  useFrame(() => {
    const p = playerRef.current.position;
    const cx = Math.floor(p.x / CHUNK_SIZE);
    const cz = Math.floor(p.z / CHUNK_SIZE);
    if (cx !== center[0] || cz !== center[1]) setCenter([cx, cz]);
  });

  const chunks = useMemo(() => {
    const arr: { key: string; cx: number; cz: number }[] = [];
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        const cx = center[0] + dx;
        const cz = center[1] + dz;
        arr.push({ key: `${cx},${cz}`, cx, cz });
      }
    }
    return arr;
  }, [center]);

  return (
    <>
      {chunks.map((c) => (
        <Chunk key={c.key} cx={c.cx} cz={c.cz} playerRef={playerRef} />
      ))}
    </>
  );
}

function Interaction({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const collect = useGame((s) => s.collect);
  const nearbyId = useGame((s) => s.nearbyPlantId);
  const nearbyKind = useGame((s) => s.nearbyPlantKind);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Give NPC dialogue priority: if the E key is also being used for an NPC,
      // the NPCDialog handler will have opened the panel and closed pointer lock
      // already, but we still skip the plant collect to avoid double-trigger.
      if (e.code === 'KeyE' && nearbyId && nearbyKind) {
        const locked = typeof document !== 'undefined' && !!document.pointerLockElement;
        if (locked) collect(nearbyId, nearbyKind);
      }
      if (e.code === 'KeyF' && typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nearbyId, nearbyKind, collect, playerRef]);
  return null;
}

export default function Forest() {
  const playerRef = useRef<PlayerState>({
    position: new THREE.Vector3(0, 5, 0),
    velocityY: 0,
    onGround: false,
  });
  const [locked, setLocked] = useState(false);

  return (
    <>
      <Canvas
        shadows="soft"
        camera={{ fov: 72, near: 0.1, far: 500, position: [0, 5, 0] }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      >
        <WorldTick playerRef={playerRef} />
        <IntroCamera locked={locked} />
        <InfiniteWater playerRef={playerRef} />
        <ShootingStars playerRef={playerRef} />
        <LakeFireflies playerRef={playerRef} />
        <StormClouds playerRef={playerRef} />
        <NPCs playerRef={playerRef} />
        <ChunkManager playerRef={playerRef} />
        <Animals playerRef={playerRef} />
        <Weather playerRef={playerRef} />
        <Player playerRef={playerRef} />
        <Interaction playerRef={playerRef} />
        <PointerLockControls
          selector=".enter-forest"
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
      </Canvas>
      <Soundscape locked={locked} />
      <HUD locked={locked} />
      <NPCDialog playerRef={playerRef} />
    </>
  );
}
