'use client';
import { MutableRefObject, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTerrainAdaptedProfile, NPCKind } from '@/lib/npc';
import { TERRAIN_TYPE } from '@/lib/noise';
import { NPCAnimState, createAnimState } from '@/lib/npcAnim';

/**
 * Per-kind visible silhouette. We intentionally compose primitives (cones,
 * spheres, cylinders) so each archetype reads differently from afar:
 *  - wanderer: hooded pilgrim with walking staff
 *  - herbalist: shawl + satchel, low to the ground
 *  - ranger: squared shoulders, tall hat
 *  - lakeSeeker: waterproof cloak, rod over shoulder
 *  - poet: tall and thin, open collar, notebook
 *  - hunter: sturdier, bow shape on back
 *  - hermit: stooped, short, with a lantern
 *  - storyteller: round, wide cape, hand raised
 */
/** Terrain-tinted accent colors for NPC clothing. */
const TERRAIN_TINTS: Record<string, { accentShift: string; skin: string }> = {
  flat: { accentShift: '0%', skin: '#d8c8a4' },
  hilly: { accentShift: '-5%', skin: '#d4c49c' },
  mountainous: { accentShift: '-10%', skin: '#d0c094' }, // Colder, weathered
  volcanic: { accentShift: '0%', skin: '#c8b88c' }, // Ashy
  riverlands: { accentShift: '+5%', skin: '#dcc8a8' }, // Moist
};

interface BuildCfg {
  shoulderY: number;
  hipY: number;
  armLen: number;
  armR: number;
  legLen: number;
  legR: number;
  torsoY: number;
  torsoScale: [number, number, number];
  torsoGeom: 'cyl' | 'box' | 'cone' | 'sphere';
  headY: number;
  headR: number;
  stoop?: number;
  bodyRough: number;
  bodyMetal?: number;
  pants: string;
  boot: string;
}

const BUILDS: Record<NPCKind, BuildCfg> = {
  wanderer:    { shoulderY: 1.28, hipY: 0.82, armLen: 0.55, armR: 0.06, legLen: 0.82, legR: 0.075, torsoY: 1.05, torsoScale: [0.34, 0.5, 0.22], torsoGeom: 'cyl',    headY: 1.58, headR: 0.19, bodyRough: 0.9,  pants: '#4a3a2a', boot: '#2a1e14' },
  herbalist:   { shoulderY: 1.14, hipY: 0.72, armLen: 0.45, armR: 0.05, legLen: 0.72, legR: 0.07,  torsoY: 0.93, torsoScale: [0.42, 0.42, 0.3],  torsoGeom: 'cone',   headY: 1.38, headR: 0.17, bodyRough: 0.95, pants: '#3d2e1e', boot: '#2a1e14' },
  ranger:      { shoulderY: 1.38, hipY: 0.86, armLen: 0.58, armR: 0.07, legLen: 0.86, legR: 0.085, torsoY: 1.15, torsoScale: [0.38, 0.55, 0.24], torsoGeom: 'box',    headY: 1.7,  headR: 0.19, bodyRough: 0.9,  pants: '#2e3a1c', boot: '#1e2410' },
  lakeSeeker:  { shoulderY: 1.3,  hipY: 0.82, armLen: 0.5,  armR: 0.06, legLen: 0.82, legR: 0.075, torsoY: 1.08, torsoScale: [0.34, 0.52, 0.24], torsoGeom: 'cyl',    headY: 1.62, headR: 0.18, bodyRough: 0.7,  bodyMetal: 0.15, pants: '#334a54', boot: '#1e2a30' },
  poet:        { shoulderY: 1.5,  hipY: 0.92, armLen: 0.55, armR: 0.05, legLen: 0.92, legR: 0.065, torsoY: 1.22, torsoScale: [0.28, 0.6, 0.18],  torsoGeom: 'cyl',    headY: 1.8,  headR: 0.18, bodyRough: 0.85, pants: '#3a2e48', boot: '#241c2e' },
  hunter:      { shoulderY: 1.38, hipY: 0.86, armLen: 0.58, armR: 0.08, legLen: 0.86, legR: 0.095, torsoY: 1.15, torsoScale: [0.44, 0.55, 0.28], torsoGeom: 'box',    headY: 1.72, headR: 0.2,  bodyRough: 0.9,  pants: '#3a2814', boot: '#1e140a' },
  hermit:      { shoulderY: 1.02, hipY: 0.62, armLen: 0.4,  armR: 0.05, legLen: 0.62, legR: 0.07,  torsoY: 0.84, torsoScale: [0.4,  0.42, 0.28], torsoGeom: 'sphere', headY: 1.28, headR: 0.17, stoop: 0.18, bodyRough: 0.95, pants: '#5a4428', boot: '#2e1e0e' },
  storyteller: { shoulderY: 1.32, hipY: 0.82, armLen: 0.5,  armR: 0.06, legLen: 0.82, legR: 0.085, torsoY: 1.1,  torsoScale: [0.5,  0.5,  0.4],  torsoGeom: 'sphere', headY: 1.68, headR: 0.2,  bodyRough: 0.9,  pants: '#3e2e38', boot: '#241a20' },
};

function Leg({
  legRef,
  x,
  cfg,
}: {
  legRef: React.MutableRefObject<THREE.Group | null>;
  x: number;
  cfg: BuildCfg;
}) {
  return (
    <group ref={legRef} position={[x, cfg.hipY, 0]}>
      <mesh castShadow position={[0, -cfg.legLen / 2, 0]}>
        <cylinderGeometry args={[cfg.legR * 0.85, cfg.legR, cfg.legLen, 8]} />
        <meshStandardMaterial color={cfg.pants} roughness={0.92} />
      </mesh>
      {/* foot */}
      <mesh castShadow position={[0, -cfg.legLen + cfg.legR * 0.4, 0.04]} scale={[cfg.legR * 1.5, cfg.legR * 0.7, cfg.legR * 2.6]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={cfg.boot} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Arm({
  armRef,
  x,
  flip,
  cfg,
  accent,
  skin,
}: {
  armRef: React.MutableRefObject<THREE.Group | null>;
  x: number;
  flip: 1 | -1;
  cfg: BuildCfg;
  accent: string;
  skin: string;
}) {
  return (
    <group ref={armRef} position={[x, cfg.shoulderY, 0]}>
      <mesh castShadow position={[flip * 0.015, -cfg.armLen / 2, 0]}>
        <cylinderGeometry args={[cfg.armR * 0.85, cfg.armR, cfg.armLen, 8]} />
        <meshStandardMaterial color={accent} roughness={cfg.bodyRough} metalness={cfg.bodyMetal ?? 0} />
      </mesh>
      {/* hand attached to arm end so it swings with it */}
      <mesh castShadow position={[flip * 0.03, -cfg.armLen - cfg.armR * 0.2, 0]}>
        <sphereGeometry args={[cfg.armR * 1.15, 8, 8]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
    </group>
  );
}

function HumanoidBase({
  kind,
  animRef,
  accent,
  skin,
}: {
  kind: NPCKind;
  animRef: React.MutableRefObject<NPCAnimState>;
  accent: string;
  skin: string;
}) {
  const cfg = BUILDS[kind];
  const lArm = useRef<THREE.Group | null>(null);
  const rArm = useRef<THREE.Group | null>(null);
  const lLeg = useRef<THREE.Group | null>(null);
  const rLeg = useRef<THREE.Group | null>(null);
  const torso = useRef<THREE.Group | null>(null);
  const head = useRef<THREE.Group | null>(null);
  const halo = useRef<THREE.Mesh | null>(null);

  useFrame(() => {
    const a = animRef.current;
    const swing = Math.sin(a.phase) * a.moving;
    const armSwing = swing * 0.75;
    const legSwing = swing * 0.6;
    if (lArm.current) lArm.current.rotation.x = armSwing + a.gesture * 0.15;
    if (rArm.current) rArm.current.rotation.x = -armSwing - a.gesture * 0.15;
    if (lLeg.current) lLeg.current.rotation.x = -legSwing;
    if (rLeg.current) rLeg.current.rotation.x = legSwing;
    if (torso.current) {
      const breath = 1 + Math.sin(a.phase * 0.28 + a.time * 0.4) * 0.015;
      torso.current.scale.y = breath;
      torso.current.rotation.x = cfg.stoop ?? 0;
      // subtle side bob while walking
      torso.current.rotation.z = swing * 0.05;
    }
    if (head.current) {
      const lookY = Math.sin(a.time * 0.7 + a.gestureId * 1.3) * 0.25 * (1 - a.moving);
      head.current.rotation.y = lookY;
      head.current.rotation.x = Math.sin(a.time * 0.5) * 0.04;
    }
    if (halo.current) {
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.05 + a.presence * 0.35;
      const s = 1 + a.presence * 0.25 + Math.sin(a.time * 2.0) * 0.03 * a.presence;
      halo.current.scale.set(s, s, s);
    }
  });

  const TorsoMesh = () => {
    const mat = (
      <meshStandardMaterial
        color={accent}
        roughness={cfg.bodyRough}
        metalness={cfg.bodyMetal ?? 0}
      />
    );
    if (cfg.torsoGeom === 'cyl')
      return (
        <mesh castShadow scale={cfg.torsoScale}>
          <cylinderGeometry args={[1, 1, 1, 12]} />
          {mat}
        </mesh>
      );
    if (cfg.torsoGeom === 'box')
      return (
        <mesh castShadow scale={cfg.torsoScale}>
          <boxGeometry args={[1, 1, 1]} />
          {mat}
        </mesh>
      );
    if (cfg.torsoGeom === 'cone')
      return (
        <mesh castShadow scale={cfg.torsoScale}>
          <coneGeometry args={[1, 1, 12]} />
          {mat}
        </mesh>
      );
    return (
      <mesh castShadow scale={cfg.torsoScale}>
        <sphereGeometry args={[1, 14, 12]} />
        {mat}
      </mesh>
    );
  };

  const eyeZ = cfg.headR * 0.88;
  const eyeY = cfg.headR * 0.1;
  const eyeX = cfg.headR * 0.38;
  const eyeR = cfg.headR * 0.11;

  return (
    <>
      <group ref={torso} position={[0, cfg.torsoY, 0]}>
        <TorsoMesh />
      </group>
      <group ref={head} position={[0, cfg.headY, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[cfg.headR, 14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.88} />
        </mesh>
        <mesh position={[-eyeX, eyeY, eyeZ]}>
          <sphereGeometry args={[eyeR, 8, 8]} />
          <meshStandardMaterial color="#16110c" roughness={0.35} />
        </mesh>
        <mesh position={[eyeX, eyeY, eyeZ]}>
          <sphereGeometry args={[eyeR, 8, 8]} />
          <meshStandardMaterial color="#16110c" roughness={0.35} />
        </mesh>
      </group>
      <Arm armRef={lArm} x={-cfg.torsoScale[0] * 0.5 - 0.02} flip={1} cfg={cfg} accent={accent} skin={skin} />
      <Arm armRef={rArm} x={cfg.torsoScale[0] * 0.5 + 0.02} flip={-1} cfg={cfg} accent={accent} skin={skin} />
      <Leg legRef={lLeg} x={-cfg.torsoScale[0] * 0.28} cfg={cfg} />
      <Leg legRef={rLeg} x={cfg.torsoScale[0] * 0.28} cfg={cfg} />
      {/* static dark ground decal */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={-1}>
        <circleGeometry args={[cfg.torsoScale[0] * 1.5, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      {/* presence halo - pulses when player close */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={-1}>
        <ringGeometry args={[cfg.torsoScale[0] * 1.4, cfg.torsoScale[0] * 2.1, 32]} />
        <meshBasicMaterial color={accent} transparent opacity={0.05} depthWrite={false} />
      </mesh>
    </>
  );
}

function Accessories({
  kind,
  accent,
}: {
  kind: NPCKind;
  accent: string;
}) {
  switch (kind) {
    case 'wanderer':
      return (
        <group>
          {/* Hood */}
          <mesh castShadow position={[0, 1.66, -0.04]} scale={[0.24, 0.22, 0.24]}>
            <sphereGeometry args={[1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Staff */}
          <mesh castShadow position={[0.36, 0.95, 0]} rotation={[0, 0, 0.06]}>
            <cylinderGeometry args={[0.025, 0.03, 1.95, 6]} />
            <meshStandardMaterial color="#6b4a2a" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.25} distance={5} decay={2} position={[0, 1.3, 0]} />
        </group>
      );
    case 'herbalist':
      return (
        <group>
          {/* Shawl */}
          <mesh position={[0, 1.28, 0]} scale={[0.46, 0.18, 0.36]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#3a5a28" roughness={0.95} />
          </mesh>
          {/* Satchel strap */}
          <mesh castShadow position={[0.24, 0.98, 0.08]} scale={[0.16, 0.14, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6a4a28" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.22} distance={4.5} decay={2} position={[0, 1.2, 0]} />
        </group>
      );
    case 'ranger':
      return (
        <group>
          {/* Wide-brim hat brim */}
          <mesh castShadow position={[0, 1.86, 0]} scale={[0.38, 0.04, 0.38]}>
            <cylinderGeometry args={[1, 1, 1, 16]} />
            <meshStandardMaterial color="#2e3a1c" roughness={0.9} />
          </mesh>
          {/* Hat crown */}
          <mesh castShadow position={[0, 1.94, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.14, 14]} />
            <meshStandardMaterial color="#2e3a1c" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.2} distance={4.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
    case 'lakeSeeker':
      return (
        <group>
          {/* Fishing rod over shoulder */}
          <mesh castShadow position={[-0.22, 1.35, 0.22]} rotation={[0.6, 0, -0.4]}>
            <cylinderGeometry args={[0.02, 0.025, 2.4, 6]} />
            <meshStandardMaterial color="#4a3a28" roughness={0.85} />
          </mesh>
          <pointLight color={accent} intensity={0.25} distance={5} decay={2} position={[0, 1.3, 0]} />
        </group>
      );
    case 'poet':
      return (
        <group>
          {/* Open collar */}
          <mesh position={[0, 1.48, 0.12]} scale={[0.28, 0.08, 0.08]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#f1e6d0" roughness={0.95} />
          </mesh>
          {/* Notebook tucked under arm */}
          <mesh castShadow position={[0.24, 1.08, 0.12]} scale={[0.12, 0.14, 0.02]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#d8b060" roughness={0.7} />
          </mesh>
          <pointLight color={accent} intensity={0.22} distance={4.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
    case 'hunter':
      return (
        <group>
          {/* Bow on back */}
          <mesh castShadow position={[-0.32, 1.05, -0.14]} rotation={[0, 0, 0.05]}>
            <torusGeometry args={[0.55, 0.03, 6, 20, Math.PI]} />
            <meshStandardMaterial color="#3a2814" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.2} distance={4.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
    case 'hermit':
      return (
        <group>
          {/* Hood */}
          <mesh castShadow position={[0, 1.36, -0.02]} scale={[0.22, 0.2, 0.22]}>
            <sphereGeometry args={[1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Lantern */}
          <mesh castShadow position={[0.38, 0.78, 0.1]} scale={[0.1, 0.14, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6a4a28" roughness={0.8} emissive="#ffa85a" emissiveIntensity={0.4} />
          </mesh>
          <pointLight color="#ffb066" intensity={1.1} distance={5} decay={2} position={[0.38, 0.86, 0.1]} />
        </group>
      );
    case 'storyteller':
      return (
        <group>
          {/* Wide cape shoulders */}
          <mesh position={[0, 1.28, 0]} scale={[0.58, 0.16, 0.48]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={accent} roughness={0.92} />
          </mesh>
          <pointLight color={accent} intensity={0.3} distance={5.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
  }
}

export function NPCModel({
  kind,
  animRef,
}: {
  kind: NPCKind;
  animRef?: React.MutableRefObject<NPCAnimState>;
}) {
  const profile = getTerrainAdaptedProfile(kind);
  const tint = TERRAIN_TINTS[TERRAIN_TYPE];
  const accent = profile.accent;
  const skin = tint?.skin ?? '#d8c8a4';
  const fallback = useRef<NPCAnimState>(createAnimState());
  const ref = animRef ?? fallback;
  return (
    <group>
      <HumanoidBase kind={kind} animRef={ref} accent={accent} skin={skin} />
      <Accessories kind={kind} accent={accent} />
    </group>
  );
}

