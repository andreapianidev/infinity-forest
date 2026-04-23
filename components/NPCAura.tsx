'use client';
import { MutableRefObject, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NPCKind } from '@/lib/npc';
import { NPCAnimState } from '@/lib/npcAnim';

interface AuraCfg {
  count: number;
  color: string;
  size: number;
  radius: number;
  rise: number;
  swirl: number;
  yBase: number;
  opacity: number;
}

const AURA: Record<NPCKind, AuraCfg> = {
  wanderer:    { count: 10, color: '#c4a878', size: 0.05, radius: 0.6, rise: 0.15, swirl: 0.4, yBase: 0.1, opacity: 0.35 },
  herbalist:   { count: 14, color: '#9ed66a', size: 0.07, radius: 0.55, rise: 0.25, swirl: 0.6, yBase: 0.2, opacity: 0.7 },
  ranger:      { count: 6,  color: '#8fc26a', size: 0.04, radius: 0.5, rise: 0.1, swirl: 0.3, yBase: 0.1, opacity: 0.25 },
  lakeSeeker:  { count: 16, color: '#9ec8e8', size: 0.05, radius: 0.4, rise: 0.45, swirl: 0.15, yBase: 0.05, opacity: 0.75 },
  poet:        { count: 12, color: '#e0c8f8', size: 0.06, radius: 0.65, rise: 0.2, swirl: 0.8, yBase: 0.4, opacity: 0.55 },
  hunter:      { count: 5,  color: '#a88e68', size: 0.04, radius: 0.45, rise: 0.08, swirl: 0.25, yBase: 0.1, opacity: 0.28 },
  hermit:      { count: 18, color: '#ffd28a', size: 0.045, radius: 0.6, rise: 0.55, swirl: 0.5, yBase: 0.5, opacity: 0.9 },
  storyteller: { count: 14, color: '#ffe0a0', size: 0.055, radius: 0.7, rise: 0.3, swirl: 0.7, yBase: 0.3, opacity: 0.65 },
};

/**
 * Tiny particle cloud rendered as additive-blended Points. Each kind has a
 * distinct palette & motion so archetypes are recognizable even from afar.
 * Aura strength scales with animRef.presence so idle NPCs are subtle and
 * reacting NPCs bloom when the player approaches.
 */
export function NPCAura({ kind, animRef }: { kind: NPCKind; animRef: MutableRefObject<NPCAnimState> }) {
  const cfg = AURA[kind];
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  const { geometry, seeds } = useMemo(() => {
    const positions = new Float32Array(cfg.count * 3);
    const seeds: { ang: number; r: number; off: number; dur: number }[] = [];
    for (let i = 0; i < cfg.count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = cfg.radius * (0.3 + Math.random() * 0.7);
      seeds.push({ ang, r, off: Math.random() * 10, dur: 1.4 + Math.random() * 2.5 });
      positions[i * 3] = Math.cos(ang) * r;
      positions[i * 3 + 1] = cfg.yBase;
      positions[i * 3 + 2] = Math.sin(ang) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: g, seeds };
  }, [cfg]);

  useFrame((state) => {
    if (!pointsRef.current || !matRef.current) return;
    const t = state.clock.elapsedTime;
    const a = animRef.current;
    const pos = (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < cfg.count; i++) {
      const s = seeds[i];
      const cycle = ((t + s.off) % s.dur) / s.dur; // 0..1
      const ang = s.ang + t * cfg.swirl * 0.3;
      const rScale = 1 + Math.sin(cycle * Math.PI) * 0.25;
      pos[i * 3] = Math.cos(ang) * s.r * rScale;
      pos[i * 3 + 1] = cfg.yBase + cycle * cfg.rise * (1 + a.presence * 0.8);
      pos[i * 3 + 2] = Math.sin(ang) * s.r * rScale;
    }
    (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // Presence-driven opacity & size bloom.
    matRef.current.opacity = cfg.opacity * (0.35 + 0.65 * Math.min(1, a.presence + 0.1));
    matRef.current.size = cfg.size * (1 + a.presence * 0.5);
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        color={cfg.color}
        size={cfg.size}
        transparent
        opacity={cfg.opacity}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
