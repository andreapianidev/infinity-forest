'use client';
import { getTerrainAdaptedProfile, NPCKind } from '@/lib/npc';
import { TERRAIN_TYPE } from '@/lib/noise';

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

export function NPCModel({ kind }: { kind: NPCKind }) {
  const profile = getTerrainAdaptedProfile(kind);
  const tint = TERRAIN_TINTS[TERRAIN_TYPE];
  const accent = profile.accent;
  const skin = tint?.skin ?? '#d8c8a4';

  switch (kind) {
    case 'wanderer':
      return (
        <group>
          {/* Body */}
          <mesh castShadow position={[0, 0.9, 0]} scale={[0.34, 0.68, 0.22]}>
            <cylinderGeometry args={[1, 1, 1, 10]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.58, 0]}>
            <sphereGeometry args={[0.19, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Hood */}
          <mesh castShadow position={[0, 1.66, -0.04]} scale={[0.24, 0.22, 0.24]}>
            <sphereGeometry args={[1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Arms */}
          <mesh castShadow position={[-0.22, 1.15, 0]} rotation={[0, 0, 0.2]}>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.22, 1.15, 0]} rotation={[0, 0, -0.2]}>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Hands */}
          <mesh castShadow position={[-0.26, 0.9, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.3, 0.9, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Staff */}
          <mesh castShadow position={[0.32, 0.95, 0.0]} rotation={[0, 0, 0.08]}>
            <cylinderGeometry args={[0.025, 0.03, 1.9, 6]} />
            <meshStandardMaterial color="#6b4a2a" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.25} distance={5} decay={2} position={[0, 1.3, 0]} />
        </group>
      );
    case 'herbalist':
      return (
        <group>
          {/* Body */}
          <mesh castShadow position={[0, 0.8, 0]} scale={[0.42, 0.55, 0.3]}>
            <coneGeometry args={[1, 1, 10]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.38, 0]}>
            <sphereGeometry args={[0.17, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Shawl */}
          <mesh position={[0, 1.25, 0]} scale={[0.46, 0.18, 0.36]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#3a5a28" roughness={0.95} />
          </mesh>
          {/* Arms */}
          <mesh castShadow position={[-0.28, 1.0, 0]} rotation={[0, 0, 0.3]}>
            <cylinderGeometry args={[0.05, 0.04, 0.4, 8]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          <mesh castShadow position={[0.28, 1.0, 0]} rotation={[0, 0, -0.3]}>
            <cylinderGeometry args={[0.05, 0.04, 0.4, 8]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Satchel */}
          <mesh castShadow position={[0.24, 0.95, 0.08]} scale={[0.16, 0.14, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6a4a28" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.22} distance={4.5} decay={2} position={[0, 1.2, 0]} />
        </group>
      );
    case 'ranger':
      return (
        <group>
          {/* Body */}
          <mesh castShadow position={[0, 0.95, 0]} scale={[0.38, 0.78, 0.24]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.7, 0]}>
            <sphereGeometry args={[0.19, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Wide-brim hat */}
          <mesh castShadow position={[0, 1.85, 0]} scale={[0.38, 0.04, 0.38]}>
            <cylinderGeometry args={[1, 1, 1, 16]} />
            <meshStandardMaterial color="#2e3a1c" roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0, 1.92, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.14, 14]} />
            <meshStandardMaterial color="#2e3a1c" roughness={0.9} />
          </mesh>
          {/* Arms - ranger stands alert */}
          <mesh castShadow position={[-0.24, 1.25, 0]} rotation={[0, 0, 0.15]}>
            <cylinderGeometry args={[0.07, 0.06, 0.55, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.24, 1.25, 0]} rotation={[0, 0, -0.15]}>
            <cylinderGeometry args={[0.07, 0.06, 0.55, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Hands */}
          <mesh castShadow position={[-0.28, 0.95, 0]}>
            <sphereGeometry args={[0.065, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.28, 0.95, 0]}>
            <sphereGeometry args={[0.065, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.2} distance={4.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
    case 'lakeSeeker':
      return (
        <group>
          {/* Body */}
          <mesh castShadow position={[0, 0.9, 0]} scale={[0.34, 0.72, 0.24]}>
            <cylinderGeometry args={[1, 1.2, 1, 10]} />
            <meshStandardMaterial color={accent} roughness={0.7} metalness={0.15} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.62, 0]}>
            <sphereGeometry args={[0.18, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Arms - holding fishing rod pose */}
          <mesh castShadow position={[-0.2, 1.18, 0.1]} rotation={[0.3, 0, 0.2]}>
            <cylinderGeometry args={[0.06, 0.05, 0.45, 8]} />
            <meshStandardMaterial color={accent} roughness={0.7} metalness={0.15} />
          </mesh>
          <mesh castShadow position={[0.2, 1.1, -0.05]} rotation={[0, 0, -0.1]}>
            <cylinderGeometry args={[0.06, 0.05, 0.45, 8]} />
            <meshStandardMaterial color={accent} roughness={0.7} metalness={0.15} />
          </mesh>
          {/* Hands */}
          <mesh castShadow position={[-0.15, 0.95, 0.15]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.22, 0.85, -0.05]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Fishing rod */}
          <mesh castShadow position={[-0.2, 1.3, 0.2]} rotation={[0.6, 0, -0.4]}>
            <cylinderGeometry args={[0.02, 0.025, 2.4, 6]} />
            <meshStandardMaterial color="#4a3a28" roughness={0.85} />
          </mesh>
          <pointLight color={accent} intensity={0.25} distance={5} decay={2} position={[0, 1.3, 0]} />
        </group>
      );
    case 'poet':
      return (
        <group>
          {/* Body - tall and thin */}
          <mesh castShadow position={[0, 0.95, 0]} scale={[0.28, 0.9, 0.18]}>
            <cylinderGeometry args={[1, 1, 1, 10]} />
            <meshStandardMaterial color={accent} roughness={0.85} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.8, 0]}>
            <sphereGeometry args={[0.18, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Open collar */}
          <mesh position={[0, 1.46, 0.12]} scale={[0.28, 0.08, 0.08]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color="#f1e6d0" roughness={0.95} />
          </mesh>
          {/* Arms - one holding notebook */}
          <mesh castShadow position={[-0.18, 1.35, 0]} rotation={[0, 0, 0.1]}>
            <cylinderGeometry args={[0.05, 0.04, 0.5, 8]} />
            <meshStandardMaterial color={accent} roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0.18, 1.25, 0.08]} rotation={[0.2, 0, -0.15]}>
            <cylinderGeometry args={[0.05, 0.04, 0.5, 8]} />
            <meshStandardMaterial color={accent} roughness={0.85} />
          </mesh>
          {/* Hands */}
          <mesh castShadow position={[-0.2, 1.1, 0]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.2, 1.0, 0.12]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Notebook */}
          <mesh castShadow position={[0.22, 1.02, 0.1]} scale={[0.12, 0.14, 0.02]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#d8b060" roughness={0.7} />
          </mesh>
          <pointLight color={accent} intensity={0.22} distance={4.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
    case 'hunter':
      return (
        <group>
          {/* Body - sturdy */}
          <mesh castShadow position={[0, 0.95, 0]} scale={[0.44, 0.78, 0.28]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.72, 0]}>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Arms - sturdy build */}
          <mesh castShadow position={[-0.28, 1.22, 0]} rotation={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.08, 0.07, 0.55, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.28, 1.22, 0]} rotation={[0, 0, -0.12]}>
            <cylinderGeometry args={[0.08, 0.07, 0.55, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Hands */}
          <mesh castShadow position={[-0.32, 0.92, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.32, 0.92, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Bow on back */}
          <mesh castShadow position={[-0.32, 0.95, -0.1]} rotation={[0, 0, 0.05]}>
            <torusGeometry args={[0.55, 0.03, 6, 20, Math.PI]} />
            <meshStandardMaterial color="#3a2814" roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.2} distance={4.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
    case 'hermit':
      return (
        <group>
          {/* Body - stooped */}
          <mesh castShadow position={[0, 0.72, 0]} scale={[0.4, 0.55, 0.28]}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.3, 0.05]}>
            <sphereGeometry args={[0.17, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Hood */}
          <mesh castShadow position={[0, 1.38, -0.02]} scale={[0.22, 0.2, 0.22]}>
            <sphereGeometry args={[1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Arms - holding lantern */}
          <mesh castShadow position={[-0.2, 0.95, 0.05]} rotation={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.05, 0.04, 0.35, 8]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          <mesh castShadow position={[0.25, 0.85, 0.1]} rotation={[0.1, 0, -0.3]}>
            <cylinderGeometry args={[0.05, 0.04, 0.35, 8]} />
            <meshStandardMaterial color={accent} roughness={0.95} />
          </mesh>
          {/* Hands */}
          <mesh castShadow position={[-0.28, 0.78, 0.08]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0.32, 0.68, 0.12]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Lantern */}
          <mesh castShadow position={[0.35, 0.72, 0.1]} scale={[0.1, 0.14, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6a4a28" roughness={0.8} />
          </mesh>
          <pointLight color="#ffb066" intensity={0.9} distance={4.5} decay={2} position={[0.35, 0.82, 0.1]} />
        </group>
      );
    case 'storyteller':
      return (
        <group>
          {/* Body - round */}
          <mesh castShadow position={[0, 0.95, 0]} scale={[0.5, 0.7, 0.4]}>
            <sphereGeometry args={[1, 14, 12]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 1.65, 0]}>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Wide cape shoulders */}
          <mesh position={[0, 1.25, 0]} scale={[0.58, 0.16, 0.48]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={accent} roughness={0.92} />
          </mesh>
          {/* Left arm */}
          <mesh castShadow position={[-0.25, 1.15, 0]} rotation={[0, 0, 0.25]}>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[-0.35, 0.88, 0]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          {/* Right arm - raised hand gesturing */}
          <mesh castShadow position={[0.22, 1.25, 0.12]} rotation={[0.3, 0, -0.4]}>
            <cylinderGeometry args={[0.06, 0.05, 0.5, 8]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          {/* Raised hand */}
          <mesh castShadow position={[0.32, 1.5, 0.25]} rotation={[0.3, 0, -0.5]}>
            <cylinderGeometry args={[0.05, 0.05, 0.35, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} />
          </mesh>
          <pointLight color={accent} intensity={0.3} distance={5.5} decay={2} position={[0, 1.4, 0]} />
        </group>
      );
  }
}
