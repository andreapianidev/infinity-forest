'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NPCKind } from '@/lib/npc';
import { NPCModel } from './NPCModel';

interface NPCModelAnimatedProps {
  kind: NPCKind;
  animate?: boolean;
  bobOffset?: number;
  isNearby?: boolean;
}

export function NPCModelAnimated({ 
  kind, 
  animate = true,
  bobOffset = 0,
  isNearby = false 
}: NPCModelAnimatedProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (!groupRef.current || !animate) return;
    
    const t = state.clock.elapsedTime;
    
    // Breathing - subtle scale pulsing
    const breath = 1 + Math.sin(t * 1.5 + bobOffset) * 0.02;
    groupRef.current.scale.set(1, breath, 1);
    
    // Bobbing - gentle floating motion
    const bob = Math.sin(t * 0.8 + bobOffset * 0.5) * 0.03;
    groupRef.current.position.y = bob;
    
    // Glow intensity when nearby
    if (glowRef.current && isNearby) {
      const pulse = 0.5 + Math.sin(t * 3) * 0.3;
      glowRef.current.intensity = pulse;
    }
  });

  return (
    <group ref={groupRef}>
      <NPCModel kind={kind} />
      {/* Ambient glow light when nearby */}
      {isNearby && (
        <pointLight
          ref={glowRef}
          color="#ffd700"
          intensity={0.5}
          distance={8}
          decay={2}
          position={[0, 1.5, 0]}
        />
      )}
    </group>
  );
}
