'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '@/lib/world';
import { TERRAIN_TYPE } from '@/lib/noise';
import { PlayerState } from './Player';

const MAX = 1800;
const RADIUS = 28;
const HEIGHT = 22;
const MIST_COUNT = 14;

export function Weather({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const mistRef = useRef<THREE.Group>(null);

  const { positions, velocities } = useMemo(() => {
    const p = new Float32Array(MAX * 3);
    const v = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
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
    const p = new Float32Array(MAX * 3);
    const v = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
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

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05);
    const rain = world.rainT;
    const snow = world.snowT;
    const fog = world.fogT;
    const localMoisture = world.localMoisture;
    const pp = playerRef.current.position;
    
    // Rain rendering
    if (ref.current && matRef.current) {
      ref.current.visible = rain > 0.01 && snow < 0.1; // Hide rain during snow
      if (rain > 0.01 && snow < 0.1) {
        matRef.current.opacity = Math.min(0.7, 0.2 + rain * 0.6);
        const count = Math.floor(MAX * rain);
        const attr = ref.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < count; i++) {
          arr[i * 3 + 1] -= velocities[i] * dt;
          if (arr[i * 3 + 1] < -2) {
            arr[i * 3] = pp.x + (Math.random() - 0.5) * RADIUS * 2;
            arr[i * 3 + 1] = pp.y + HEIGHT * (0.5 + Math.random() * 0.5);
            arr[i * 3 + 2] = pp.z + (Math.random() - 0.5) * RADIUS * 2;
          }
          arr[i * 3] += dt * 1.5;
        }
        for (let i = 0; i < count; i++) {
          const dx = arr[i * 3] - pp.x;
          const dz = arr[i * 3 + 2] - pp.z;
          if (Math.abs(dx) > RADIUS) arr[i * 3] -= Math.sign(dx) * RADIUS * 2;
          if (Math.abs(dz) > RADIUS) arr[i * 3 + 2] -= Math.sign(dz) * RADIUS * 2;
        }
        attr.needsUpdate = true;
      }
    }
    
    // Snow rendering
    if (snowRef.current && snowMatRef.current) {
      snowRef.current.visible = snow > 0.01;
      if (snow > 0.01) {
        // Terrain affects snow density - mountains get more
        const terrainMultiplier = TERRAIN_TYPE === 'mountainous' ? 1.3 : TERRAIN_TYPE === 'hilly' ? 1.1 : 1.0;
        snowMatRef.current.opacity = Math.min(0.9, 0.3 + snow * 0.5 * terrainMultiplier);
        snowMatRef.current.size = 0.12 + snow * 0.08; // Larger flakes during heavy snow
        
        const count = Math.floor(MAX * snow * terrainMultiplier);
        const attr = snowRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        
        // Snow falls slower with more drift
        const windX = Math.sin(performance.now() * 0.0005) * 0.5; // Gentle swaying
        const windZ = Math.cos(performance.now() * 0.0003) * 0.3;
        
        for (let i = 0; i < count; i++) {
          // Slower fall + wind drift
          arr[i * 3 + 1] -= snowVelocities[i] * dt * (0.5 + Math.random() * 0.3);
          arr[i * 3] += (windX + Math.sin(i * 0.1 + performance.now() * 0.001) * 0.3) * dt;
          arr[i * 3 + 2] += (windZ + Math.cos(i * 0.1 + performance.now() * 0.001) * 0.2) * dt;
          
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

    if (mistRef.current) {
      mistRef.current.visible = fog > 0.01;
      for (let i = 0; i < mist.length; i++) {
        const child = mistRef.current.children[i] as THREE.Mesh | undefined;
        if (!child) continue;
        const item = mist[i];
        const a = item.angle + item.phase + performance.now() * 0.00003 + dt * item.drift;
        const wetness = 0.45 + localMoisture * 0.95;
        child.position.set(
          pp.x + Math.cos(a) * item.radius * (1.05 - localMoisture * 0.22),
          pp.y - 1.15 + item.height * (0.85 + (1 - localMoisture) * 0.3) + Math.sin(a * 1.7) * 0.35,
          pp.z + Math.sin(a) * item.radius * (0.82 - localMoisture * 0.08),
        );
        child.quaternion.copy((child.parent as THREE.Object3D).quaternion);
        child.lookAt(pp.x, child.position.y, pp.z);
        child.scale.set(item.scale * wetness, item.scale * (0.32 + localMoisture * 0.22), 1);
        const material = child.material as THREE.MeshBasicMaterial;
        material.opacity = 0.035 + fog * (0.1 + localMoisture * 0.12);
      }
    }
  });

  return (
    <>
      {/* Rain particles */}
      <points ref={ref} geometry={geom} frustumCulled={false}>
        <pointsMaterial
          ref={matRef}
          color="#a8c0d8"
          size={0.08}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>
      
      {/* Snow particles */}
      <points ref={snowRef} geometry={snowGeom} frustumCulled={false}>
        <pointsMaterial
          ref={snowMatRef}
          color="#f0f4f8"
          size={0.12}
          sizeAttenuation
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </points>
      
      {/* Fog mist */}
      <group ref={mistRef}>
        {mist.map((item, i) => (
          <mesh key={i} frustumCulled={false} position={[0, item.height, 0]}>
            <planeGeometry args={[1, 1, 1, 1]} />
            <meshBasicMaterial color="#e7efec" transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </>
  );
}
