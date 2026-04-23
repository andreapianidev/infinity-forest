'use client';
import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '@/lib/world';
import { TERRAIN_TYPE } from '@/lib/noise';
import { PlayerState } from './Player';

const MAX_PARTICLES = 2000;
const RADIUS = 32;
const HEIGHT = 25;
const MIST_COUNT = 18;

// Wind state - shared globally for all weather effects
export interface WindState {
  x: number;
  z: number;
  strength: number;
  direction: number; // radians
}

export const globalWind: WindState = {
  x: 0,
  z: 0,
  strength: 0.3,
  direction: 0,
};

export function Weather({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const mistRef = useRef<THREE.Group>(null);

  const { positions, velocities } = useMemo(() => {
    const p = new Float32Array(MAX_PARTICLES * 3);
    const v = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      p[i * 3] = (Math.random() - 0.5) * RADIUS * 2;
      p[i * 3 + 1] = Math.random() * HEIGHT;
      p[i * 3 + 2] = (Math.random() - 0.5) * RADIUS * 2;
      v[i] = 12 + Math.random() * 10;
    }
    return { positions: p, velocities: v };
  }, []);

  const mist = useMemo(
    () =>
      Array.from({ length: MIST_COUNT }, (_, i) => ({
        radius: 8 + Math.random() * 26,
        angle: (i / MIST_COUNT) * Math.PI * 2,
        height: 1.5 + Math.random() * 3.2,
        scale: 7 + Math.random() * 7,
        drift: 0.08 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  // Separate snow positions for snow effect
  const { snowPositions, snowVelocities } = useMemo(() => {
    const p = new Float32Array(MAX_PARTICLES * 3);
    const v = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      p[i * 3] = (Math.random() - 0.5) * RADIUS * 2;
      p[i * 3 + 1] = Math.random() * HEIGHT;
      p[i * 3 + 2] = (Math.random() - 0.5) * RADIUS * 2;
      v[i] = 2 + Math.random() * 3; // Much slower than rain
    }
    return { snowPositions: p, snowVelocities: v };
  }, []);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  const snowGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    return g;
  }, [snowPositions]);

  const snowRef = useRef<THREE.Points>(null);
  const snowMatRef = useRef<THREE.PointsMaterial>(null);

  // Wind evolution over time
  const windTime = useRef(0);
  
  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
    const now = state.clock.elapsedTime;
    windTime.current += dt;
    
    const rain = world.rainT;
    const snow = world.snowT;
    const fog = world.fogT;
    const localMoisture = world.localMoisture;
    const pp = playerRef.current.position;
    
    // Update global wind - evolves over time for dynamic weather
    globalWind.direction += (Math.random() - 0.5) * dt * 0.1; // Slow direction change
    globalWind.strength = 0.2 + rain * 0.4 + snow * 0.3; // Stronger wind during precipitation
    globalWind.x = Math.cos(globalWind.direction) * globalWind.strength;
    globalWind.z = Math.sin(globalWind.direction) * globalWind.strength;
    
    // Rain rendering with wind and ground collision
    if (ref.current && matRef.current) {
      ref.current.visible = rain > 0.01 && snow < 0.1;
      if (rain > 0.01 && snow < 0.1) {
        matRef.current.opacity = Math.min(0.75, 0.15 + rain * 0.65);
        const count = Math.floor(MAX_PARTICLES * rain);
        const attr = ref.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        
        // Rain falls fast, pushed by wind
        const windForce = globalWind.strength * 2;
        const windDriftX = globalWind.x * dt * 3;
        const windDriftZ = globalWind.z * dt * 3;
        
        for (let i = 0; i < count; i++) {
          // Fall speed varies by droplet size
          const fallSpeed = velocities[i] * (1 + windForce * 0.3);
          arr[i * 3 + 1] -= fallSpeed * dt;
          
          // Wind affects rain trajectory
          arr[i * 3] += windDriftX + (Math.random() - 0.5) * 0.1;
          arr[i * 3 + 2] += windDriftZ + (Math.random() - 0.5) * 0.1;
          
          // Ground collision - respawn when hitting ground
          if (arr[i * 3 + 1] < -2) {
            arr[i * 3] = pp.x + (Math.random() - 0.5) * RADIUS * 2;
            arr[i * 3 + 1] = pp.y + HEIGHT * (0.5 + Math.random() * 0.5);
            arr[i * 3 + 2] = pp.z + (Math.random() - 0.5) * RADIUS * 2;
          }
        }
        
        // Wrap around player for infinite rain effect
        for (let i = 0; i < count; i++) {
          const dx = arr[i * 3] - pp.x;
          const dz = arr[i * 3 + 2] - pp.z;
          if (Math.abs(dx) > RADIUS) arr[i * 3] -= Math.sign(dx) * RADIUS * 2;
          if (Math.abs(dz) > RADIUS) arr[i * 3 + 2] -= Math.sign(dz) * RADIUS * 2;
        }
        attr.needsUpdate = true;
      }
    }
    
    // Enhanced Snow rendering with turbulence and sparkle
    if (snowRef.current && snowMatRef.current) {
      snowRef.current.visible = snow > 0.01;
      if (snow > 0.01) {
        const terrainMultiplier = TERRAIN_TYPE === 'mountainous' ? 1.3 : TERRAIN_TYPE === 'hilly' ? 1.1 : 1.0;
        snowMatRef.current.opacity = Math.min(0.95, 0.25 + snow * 0.55 * terrainMultiplier);
        // Larger flakes during heavy snow + wind effect on size
        snowMatRef.current.size = 0.1 + snow * 0.1 + globalWind.strength * 0.05;
        
        const count = Math.floor(MAX_PARTICLES * snow * terrainMultiplier);
        const attr = snowRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        
        // Snow physics: slow fall, turbulence, wind drift
        const turbulenceScale = 0.3 + globalWind.strength * 0.5;
        const windX = globalWind.x * 1.5;
        const windZ = globalWind.z * 1.5;
        
        for (let i = 0; i < count; i++) {
          const t = now + i * 0.1; // Phase offset per flake
          
          // Very slow fall with variation
          const fallSpeed = snowVelocities[i] * (0.3 + Math.random() * 0.2);
          arr[i * 3 + 1] -= fallSpeed * dt;
          
          // Turbulence - swirling motion simulating air currents
          const turbX = Math.sin(t * 0.5) * Math.cos(t * 0.3) * turbulenceScale;
          const turbZ = Math.cos(t * 0.4) * Math.sin(t * 0.6) * turbulenceScale;
          const turbY = Math.sin(t * 0.8) * 0.1; // Slight vertical bob
          
          // Wind + turbulence
          arr[i * 3] += (windX + turbX) * dt;
          arr[i * 3 + 2] += (windZ + turbZ) * dt;
          arr[i * 3 + 1] += turbY * dt;
          
          // Ground collision
          if (arr[i * 3 + 1] < -1) {
            arr[i * 3] = pp.x + (Math.random() - 0.5) * RADIUS * 2;
            arr[i * 3 + 1] = pp.y + HEIGHT * (0.5 + Math.random() * 0.5);
            arr[i * 3 + 2] = pp.z + (Math.random() - 0.5) * RADIUS * 2;
          }
        }
        
        // Wrap around player
        for (let i = 0; i < count; i++) {
          const dx = arr[i * 3] - pp.x;
          const dz = arr[i * 3 + 2] - pp.z;
          if (Math.abs(dx) > RADIUS) arr[i * 3] -= Math.sign(dx) * RADIUS * 2;
          if (Math.abs(dz) > RADIUS) arr[i * 3 + 2] -= Math.sign(dz) * RADIUS * 2;
        }
        attr.needsUpdate = true;
      }
    }

    // Enhanced Volumetric Fog with depth variation
    if (mistRef.current) {
      mistRef.current.visible = fog > 0.01;
      for (let i = 0; i < mist.length; i++) {
        const child = mistRef.current.children[i] as THREE.Mesh | undefined;
        if (!child) continue;
        const item = mist[i];
        
        // Fog moves with wind
        const windOffsetX = globalWind.x * 2 * windTime.current;
        const windOffsetZ = globalWind.z * 2 * windTime.current;
        
        const a = item.angle + item.phase + now * 0.00003 + dt * item.drift;
        const wetness = 0.45 + localMoisture * 0.95;
        
        // Volumetric fog - denser near ground, varies with distance
        const distFromCenter = item.radius / 26; // 0-1
        const heightFactor = 1 - distFromCenter * 0.3; // Lower fog further out
        
        child.position.set(
          pp.x + Math.cos(a) * item.radius * (1.05 - localMoisture * 0.22) + windOffsetX * 0.1,
          pp.y - 1.5 + item.height * heightFactor * (0.85 + (1 - localMoisture) * 0.3) + Math.sin(a * 1.7) * 0.35,
          pp.z + Math.sin(a) * item.radius * (0.82 - localMoisture * 0.08) + windOffsetZ * 0.1,
        );
        child.quaternion.copy((child.parent as THREE.Object3D).quaternion);
        child.lookAt(pp.x, child.position.y, pp.z);
        
        // Scale varies with moisture and wind
        const windScale = 1 + globalWind.strength * 0.2;
        child.scale.set(item.scale * wetness * windScale, item.scale * (0.32 + localMoisture * 0.22) * windScale, 1);
        
        const material = child.material as THREE.MeshBasicMaterial;
        // Fog color shifts with weather - bluish in rain, gray in fog, warm in clear
        const fogOpacity = 0.04 + fog * (0.12 + localMoisture * 0.15);
        material.opacity = Math.min(0.35, fogOpacity);
      }
    }
  });

  return (
    <>
      {/* Rain particles - stretched for streak effect in wind */}
      <points ref={ref} geometry={geom} frustumCulled={false}>
        <pointsMaterial
          ref={matRef}
          color="#b0c8e0"
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      
      {/* Snow particles - soft glowing flakes */}
      <points ref={snowRef} geometry={snowGeom} frustumCulled={false}>
        <pointsMaterial
          ref={snowMatRef}
          color="#ffffff"
          size={0.14}
          sizeAttenuation
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      
      {/* Fog mist - volumetric with soft edges */}
      <group ref={mistRef}>
        {mist.map((item, i) => (
          <mesh key={i} frustumCulled={false} position={[0, item.height, 0]}>
            <planeGeometry args={[1, 1, 1, 1]} />
            <meshBasicMaterial 
              color="#d8e2e6" 
              transparent 
              opacity={0.12} 
              depthWrite={false} 
              side={THREE.DoubleSide}
              blending={THREE.MultiplyBlending}
            />
          </mesh>
        ))}
      </group>
      
      {/* Ground splash effects when raining */}
      <RainSplashes playerRef={playerRef} />
    </>
  );
}

// Rain splash effect component - creates small splashes on ground
function RainSplashes({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const splashRef = useRef<THREE.Points>(null);
  const MAX_SPLASHES = 60;
  
  const { splashPositions, splashAges } = useMemo(() => {
    const positions = new Float32Array(MAX_SPLASHES * 3);
    const ages = new Float32Array(MAX_SPLASHES);
    for (let i = 0; i < MAX_SPLASHES; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100; // Hidden initially
      positions[i * 3 + 2] = 0;
      ages[i] = 0;
    }
    return { splashPositions: positions, splashAges: ages };
  }, []);
  
  const splashGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
    return g;
  }, [splashPositions]);
  
  const splashMatRef = useRef<THREE.PointsMaterial>(null);
  
  useFrame((_, dt) => {
    const rain = world.rainT;
    const snow = world.snowT;
    
    if (splashRef.current && splashMatRef.current) {
      splashRef.current.visible = rain > 0.3 && snow < 0.1;
      if (rain > 0.3 && snow < 0.1) {
        splashMatRef.current.opacity = Math.min(0.6, rain * 0.8);
        const attr = splashRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const pp = playerRef.current.position;
        
        // Age splashes and spawn new ones
        for (let i = 0; i < MAX_SPLASHES; i++) {
          splashAges[i] -= dt * 2; // Fade out speed
          
          // Respawn if old enough and chance based on rain intensity
          if (splashAges[i] <= 0 && Math.random() < rain * 0.1) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 15; // Within 15m radius
            splashAges[i] = 1.0; // Full life
            arr[i * 3] = pp.x + Math.cos(angle) * radius;
            arr[i * 3 + 1] = -0.1; // Just above ground
            arr[i * 3 + 2] = pp.z + Math.sin(angle) * radius;
          }
          
          // Hide if dead
          if (splashAges[i] <= 0) {
            arr[i * 3 + 1] = -100;
          }
        }
        attr.needsUpdate = true;
      }
    }
  });
  
  return (
    <points ref={splashRef} geometry={splashGeom} frustumCulled={false}>
      <pointsMaterial
        ref={splashMatRef}
        color="#c0d4e8"
        size={0.25}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
