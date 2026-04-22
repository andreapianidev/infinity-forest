'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { lakeMask } from '@/lib/noise';
import { WATER_LEVEL } from '@/lib/world';
import { PlayerState } from './Player';

function SwanModel() {
  return (
    <group>
      {/* Main body - oval shape */}
      <mesh castShadow position={[0, 0.22, 0]} scale={[0.52, 0.36, 0.85]}>
        <sphereGeometry args={[1, 16, 14]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.82} />
      </mesh>

      {/* Neck - curved cylinder */}
      <mesh castShadow position={[0, 0.48, 0.42]} rotation={[-0.75, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.65, 12]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.82} />
      </mesh>
      {/* Upper neck curve */}
      <mesh castShadow position={[0, 0.78, 0.62]} rotation={[-0.35, 0, 0]}>
        <cylinderGeometry args={[0.065, 0.08, 0.35, 10]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.82} />
      </mesh>

      {/* Head - properly sized and positioned sphere */}
      <mesh castShadow position={[0, 0.95, 0.72]} scale={[0.22, 0.24, 0.28]}>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.8} />
      </mesh>

      {/* Beak - orange with black tip */}
      <mesh castShadow position={[0, 0.94, 0.95]} rotation={[0.12, 0, 0]}>
        <coneGeometry args={[0.065, 0.28, 10]} />
        <meshStandardMaterial color="#e88c2a" roughness={0.55} />
      </mesh>
      <mesh castShadow position={[0, 0.96, 1.08]} rotation={[0.12, 0, 0]}>
        <coneGeometry args={[0.04, 0.1, 8]} />
        <meshStandardMaterial color="#3a2818" roughness={0.6} />
      </mesh>

      {/* Eye */}
      <mesh position={[0.09, 0.98, 0.78]} scale={[0.03, 0.03, 0.02]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#2a1a0a" roughness={0.4} />
      </mesh>
      <mesh position={[-0.09, 0.98, 0.78]} scale={[0.03, 0.03, 0.02]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#2a1a0a" roughness={0.4} />
      </mesh>

      {/* Wings - folded */}
      <mesh castShadow position={[0.32, 0.28, -0.05]} rotation={[0.1, 0, -0.55]} scale={[0.44, 0.1, 0.24]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#eef3f7" roughness={0.88} />
      </mesh>
      <mesh castShadow position={[-0.32, 0.28, -0.05]} rotation={[0.1, 0, 0.55]} scale={[0.44, 0.1, 0.24]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#eef3f7" roughness={0.88} />
      </mesh>

      {/* Tail feathers */}
      <mesh castShadow position={[0, 0.18, -0.68]} rotation={[0.15, 0, 0]} scale={[0.16, 0.1, 0.38]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#eef3f7" roughness={0.88} />
      </mesh>
    </group>
  );
}

export function LakeFauna({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const COUNT = 3;
  const root = useRef<THREE.Group>(null);
  // Swan family group - they stay together in a natural formation
  const familyGroup = useRef({
    center: new THREE.Vector3(0, -999, 0),
    target: new THREE.Vector3(0, -999, 0),
    direction: Math.random() * Math.PI * 2,
    speed: 0.06 + Math.random() * 0.04, // Slower, more stately movement
    idleTime: 0,
    isMoving: false,
  });
  // Individual swan offsets within the family formation
  const swans = useRef(
    Array.from({ length: COUNT }, (_, i) => ({
      // Lead swan in front, others follow in V-formation (natural swan behavior)
      offsetX: i === 0 ? 0 : (i === 1 ? -1.5 : 1.2),
      offsetZ: i === 0 ? 0 : (i === 1 ? -2 : -1.8),
      bob: Math.random() * Math.PI * 2 + i,
      angle: (i === 0 ? 0 : (i === 1 ? -0.15 : 0.15)), // Slight angle for following swans
      visible: 0,
    })),
  );
  const searchTimer = useRef(0);
  const stateRef = useRef<'searching' | 'idle' | 'moving'>('searching');

  useFrame((state, dt) => {
    const group = root.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    const family = familyGroup.current;
    const pp = playerRef.current.position;

    // State machine for natural swan behavior
    if (stateRef.current === 'searching') {
      // Look for suitable lake area within 30-70m of player
      let bestX = 0, bestZ = 0, bestScore = -1;
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const radius = 35 + Math.random() * 30;
        const x = pp.x + Math.cos(angle) * radius;
        const z = pp.z + Math.sin(angle) * radius;
        const lakeValue = lakeMask(x, z);
        // Prefer open water areas (lakeMask > 0.5) and slightly deeper water
        const score = lakeValue - Math.abs(lakeValue - 0.7) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestZ = z;
        }
      }
      if (bestScore > 0.5) {
        family.target.set(bestX, WATER_LEVEL + 0.07, bestZ);
        stateRef.current = 'idle';
        family.idleTime = 2 + Math.random() * 4; // Rest for 2-6 seconds
      }
    } else if (stateRef.current === 'idle') {
      family.idleTime -= dt;
      if (family.idleTime <= 0) {
        // Choose new destination nearby for natural grazing/paddling
        const angle = family.direction + (Math.random() - 0.5) * 0.5;
        const dist = 8 + Math.random() * 15;
        const targetX = family.center.x + Math.cos(angle) * dist;
        const targetZ = family.center.z + Math.sin(angle) * dist;
        if (lakeMask(targetX, targetZ) > 0.5) {
          family.target.set(targetX, WATER_LEVEL + 0.07, targetZ);
          stateRef.current = 'moving';
          family.isMoving = true;
        } else {
          // If target invalid, pick new random direction
          family.direction = Math.random() * Math.PI * 2;
          stateRef.current = 'searching';
        }
      }
    } else if (stateRef.current === 'moving') {
      // Move family group toward target
      const dx = family.target.x - family.center.x;
      const dz = family.target.z - family.center.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.5) {
        // Reached destination
        stateRef.current = 'idle';
        family.isMoving = false;
        family.idleTime = 3 + Math.random() * 5;
      } else {
        // Move smoothly toward target
        const moveDist = Math.min(family.speed * dt, dist);
        family.direction = Math.atan2(dx, dz);
        family.center.x += Math.sin(family.direction) * moveDist;
        family.center.z += Math.cos(family.direction) * moveDist;
      }

      // Keep family within lake bounds
      if (lakeMask(family.center.x, family.center.z) < 0.3) {
        // Drifted into shallows, turn back
        family.direction += Math.PI;
        stateRef.current = 'searching';
      }
    }

    // Update visibility and position for each swan
    for (let i = 0; i < COUNT; i++) {
      const swan = swans.current[i];
      const child = group.children[i] as THREE.Group | undefined;
      if (!child) continue;

      const inWater = family.center.y > -100;
      swan.visible += (inWater ? 1 : 0 - swan.visible) * Math.min(1, dt * 1.2);
      child.visible = swan.visible > 0.02;
      if (!child.visible) continue;

      // Calculate individual position within family formation
      const formationAngle = family.direction + swan.angle;
      const offsetX = swan.offsetX * Math.cos(family.direction) - swan.offsetZ * Math.sin(family.direction);
      const offsetZ = swan.offsetX * Math.sin(family.direction) + swan.offsetZ * Math.cos(family.direction);

      const x = family.center.x + offsetX;
      const z = family.center.z + offsetZ;
      const y = family.center.y + Math.sin(t * 1.5 + swan.bob) * 0.04; // Gentle bobbing

      child.position.set(x, y, z);

      // Smooth rotation toward movement direction
      const targetRot = -family.direction + Math.PI * 0.5;
      child.rotation.y += (targetRot - child.rotation.y) * Math.min(1, dt * 2);

      // Slight roll when moving
      const roll = family.isMoving ? Math.sin(t * 3 + i) * 0.05 : 0;
      child.rotation.z = roll;

      // Scale based on visibility
      child.scale.setScalar(0.7 + swan.visible * 0.3);
    }

    // Check if swans should relocate (player moved far away or swans too far)
    const familyDistFromPlayer = Math.hypot(family.center.x - pp.x, family.center.z - pp.z);
    if (familyDistFromPlayer > 90 || (familyDistFromPlayer < 15 && stateRef.current === 'idle')) {
      stateRef.current = 'searching';
    }
  });

  return (
    <group ref={root}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <group key={i}>
          <SwanModel />
        </group>
      ))}
    </group>
  );
}
