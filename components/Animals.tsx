'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hash2, sampledHeight } from '@/lib/noise';
import { PlayerState } from './Player';
import { world, WATER_LEVEL } from '@/lib/world';

type Kind =
  | 'deer' | 'fox' | 'rabbit' | 'owl'
  | 'firefly' | 'butterfly' | 'bird' | 'swallow' | 'crow'
  | 'squirrel' | 'dragonfly' | 'bat' | 'hawk'
  // New animals
  | 'wildboar' | 'wolf' | 'roedeer' | 'robin' | 'frog'
  | 'badger' | 'hare' | 'chickadee' | 'eagle' | 'woodpecker';

interface Animal {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  kind: Kind;
  size: number;
  nextRetarget: number;
  visible: number;
}

const BASE_SPEEDS: Record<Kind, number> = {
  deer: 2.2, fox: 3.0, rabbit: 3.5, owl: 2.5, firefly: 1.1, butterfly: 1.8, bird: 6.5,
  swallow: 7.5, crow: 5.8, hawk: 4.5,
  squirrel: 4.2, dragonfly: 4.5, bat: 5.5,
  // New animals - tuned speeds
  wildboar: 2.8,      // Fast charge but heavy
  wolf: 3.8,          // Endurance runner
  roedeer: 3.2,       // Quick bursts
  robin: 4.0,         // Darting flight
  frog: 1.5,          // Hopping
  badger: 2.0,        // Lumbering
  hare: 5.5,          // Very fast sprinter
  chickadee: 3.5,     // Quick flitter
  eagle: 3.2,         // Soaring, occasional wingbeats
  woodpecker: 2.5,    // Climbing, short flights
};
const SIZES: Record<Kind, number> = {
  deer: 1.25, fox: 0.75, rabbit: 0.45, owl: 0.38, firefly: 0.1, butterfly: 0.22, bird: 0.22,
  swallow: 0.18, crow: 0.35, hawk: 0.55,
  squirrel: 0.32, dragonfly: 0.18, bat: 0.3,
  // New animals - proportional sizes
  wildboar: 1.0,      // Stocky and heavy
  wolf: 0.95,         // Large canine
  roedeer: 0.85,      // Small deer
  robin: 0.12,        // Tiny songbird
  frog: 0.15,         // Small amphibian
  badger: 0.6,        // Medium, stocky
  hare: 0.55,         // Larger than rabbit, long ears
  chickadee: 0.1,     // Very small
  eagle: 1.4,         // Largest bird - majestic
  woodpecker: 0.2,    // Small, distinctive
};

function inWindow(hour: number, windows: [number, number][]): boolean {
  return windows.some(([a, b]) => (a <= b ? hour >= a && hour < b : hour >= a || hour < b));
}
function activeness(kind: Kind, hour: number, weather: string): number {
  const r = weather === 'rain' ? 0.35 : 1;
  switch (kind) {
    case 'deer': return inWindow(hour, [[5, 9], [17, 20]]) ? r : 0.15 * r;
    case 'rabbit': return inWindow(hour, [[5, 11], [16, 19]]) ? r : 0.1 * r;
    case 'fox': return inWindow(hour, [[19, 24], [0, 6]]) ? r : 0.2 * r;
    case 'owl': return inWindow(hour, [[20, 24], [0, 5]]) ? 1 : 0;
    case 'firefly': return inWindow(hour, [[20, 24], [0, 5]]) ? 1 : 0;
    case 'butterfly': return weather === 'rain' ? 0 : (inWindow(hour, [[8, 18]]) ? 1 : 0);
    case 'bird': return weather === 'rain' ? 0.15 : (inWindow(hour, [[6, 19]]) ? 1 : 0.1);
    // Sky birds - always active during day, flying high
    case 'swallow': return weather === 'rain' || weather === 'thunderstorm' ? 0.1 : (inWindow(hour, [[6, 20]]) ? 1 : 0);
    case 'crow': return weather === 'rain' ? 0.3 : (inWindow(hour, [[5, 21]]) ? 1 : 0.15);
    case 'hawk': return inWindow(hour, [[8, 18]]) ? (weather === 'rain' ? 0.4 : 1) : 0;
    // Squirrels: diurnal forest critters; most active mid-morning.
    case 'squirrel': return weather === 'rain' ? 0.2 : (inWindow(hour, [[7, 18]]) ? r : 0.1 * r);
    // Dragonflies: warm-hour aerial insects.
    case 'dragonfly': return weather === 'rain' ? 0 : (inWindow(hour, [[9, 19]]) ? 1 : 0);
    // Bats: crepuscular + nocturnal flyers.
    case 'bat': return inWindow(hour, [[19, 24], [0, 5]]) ? (weather === 'rain' ? 0.3 : 1) : 0;
    // New animals activeness patterns
    case 'wildboar': return inWindow(hour, [[5, 10], [16, 21]]) ? r * 0.7 : 0.05 * r; // dawn/dusk forager
    case 'wolf': return inWindow(hour, [[19, 24], [0, 7]]) ? r * 0.8 : 0.1 * r; // nocturnal hunter
    case 'roedeer': return inWindow(hour, [[5, 10], [17, 20]]) ? r : 0.2 * r; // crepuscular like deer
    case 'robin': return weather === 'rain' ? 0.2 : (inWindow(hour, [[5, 20]]) ? 0.9 : 0); // diurnal songbird
    case 'frog': return inWindow(hour, [[19, 24], [0, 4]]) ? 0.8 : (inWindow(hour, [[4, 8], [18, 19]]) ? 0.3 : 0); // nocturnal croaker
    case 'badger': return inWindow(hour, [[20, 24], [0, 5]]) ? r * 0.7 : 0.05; // strictly nocturnal
    case 'hare': return inWindow(hour, [[5, 8], [18, 22]]) ? r : 0.15 * r; // crepuscular, very shy
    case 'chickadee': return weather === 'rain' || weather === 'thunderstorm' ? 0.1 : (inWindow(hour, [[6, 19]]) ? 0.95 : 0); // active all day
    case 'eagle': return inWindow(hour, [[7, 19]]) ? (weather === 'rain' ? 0.3 : 1) : 0; // diurnal soaring
    case 'woodpecker': return weather === 'rain' ? 0.1 : (inWindow(hour, [[6, 18]]) ? 0.85 : 0); // drums on trees
  }
}

const NUM_ANIMALS = 110; // Much more diverse wildlife
const ROAM_RADIUS = 110;

/**
 * Pick a roaming target around `center`.
 * When `avoidWater` is true (ground animals), reject candidates whose
 * terrain height is below the water line — up to 8 attempts, then fall
 * back to the last candidate (edge case; animal will be nudged on step).
 */
function pickTargetNear(
  center: THREE.Vector3,
  out: THREE.Vector3,
  seed: number,
  avoidWater: boolean,
) {
  const cx = Math.floor(center.x);
  const cz = Math.floor(center.z);
  for (let i = 0; i < 8; i++) {
    const a = hash2(cx, cz, seed + i * 17) * Math.PI * 2;
    const r = 10 + hash2(cx, cz, seed + i * 17 + 1) * 30;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const h = sampledHeight(x, z);
    if (!avoidWater || h > WATER_LEVEL + 0.3) {
      out.set(x, h, z);
      return;
    }
  }
  // Fallback: caller will still step toward this, but water-check in the
  // movement loop will prevent actually entering the water.
  out.set(center.x, center.y, center.z);
}

/** Ground animals avoid water; flyers can cross it freely. */
function isGroundAnimal(kind: Kind): boolean {
  return kind === 'deer' || kind === 'fox' || kind === 'rabbit' || kind === 'squirrel' ||
         kind === 'wildboar' || kind === 'wolf' || kind === 'roedeer' || kind === 'badger' ||
         kind === 'hare'; // frogs hop near water so they're not strictly ground
}

// ──────────── Sub-models ────────────

function DeerBody({ size }: { size: number }) {
  const body = '#a57548';
  const belly = '#d8b68a';
  return (
    <group>
      {/* Body */}
      <mesh castShadow position={[0, size * 1.0, 0]} scale={[size * 0.55, size * 0.55, size * 1.2]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      {/* Belly */}
      <mesh position={[0, size * 0.78, 0]} scale={[size * 0.45, size * 0.32, size * 1.05]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={belly} roughness={0.95} />
      </mesh>
      {/* Neck */}
      <mesh castShadow position={[0, size * 1.35, size * 0.7]} rotation={[-0.45, 0, 0]}>
        <cylinderGeometry args={[size * 0.17, size * 0.22, size * 0.75, 8]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, size * 1.7, size * 0.95]} scale={[size * 0.25, size * 0.28, size * 0.4]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, size * 1.62, size * 1.2]} scale={[size * 0.13, size * 0.13, size * 0.18]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#3a2818" roughness={1} />
      </mesh>
      {/* Eyes */}
      <mesh position={[size * 0.11, size * 1.78, size * 1.08]}><sphereGeometry args={[size * 0.035, 6, 5]} /><meshStandardMaterial color="#101010" /></mesh>
      <mesh position={[-size * 0.11, size * 1.78, size * 1.08]}><sphereGeometry args={[size * 0.035, 6, 5]} /><meshStandardMaterial color="#101010" /></mesh>
      {/* Ears */}
      <mesh position={[size * 0.16, size * 1.92, size * 0.9]} rotation={[0.3, 0.3, 0.4]} scale={[size * 0.05, size * 0.15, size * 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-size * 0.16, size * 1.92, size * 0.9]} rotation={[0.3, -0.3, -0.4]} scale={[size * 0.05, size * 0.15, size * 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* Antlers */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * size * 0.12, size * 2.0, size * 0.85]}>
          <mesh rotation={[0, 0, s * -0.2]} position={[0, size * 0.2, 0]}>
            <cylinderGeometry args={[size * 0.025, size * 0.03, size * 0.5, 5]} />
            <meshStandardMaterial color="#5a3a22" />
          </mesh>
          <mesh rotation={[0, 0, s * -0.7]} position={[s * size * 0.15, size * 0.3, 0]}>
            <cylinderGeometry args={[size * 0.02, size * 0.025, size * 0.3, 5]} />
            <meshStandardMaterial color="#5a3a22" />
          </mesh>
          <mesh rotation={[0.5, 0, s * -0.3]} position={[0, size * 0.42, -size * 0.1]}>
            <cylinderGeometry args={[size * 0.02, size * 0.025, size * 0.28, 5]} />
            <meshStandardMaterial color="#5a3a22" />
          </mesh>
        </group>
      ))}
      {/* Legs */}
      {[[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]].map(([sx, sz], k) => (
        <mesh key={k} castShadow position={[sx * size, size * 0.45, sz * size]}>
          <cylinderGeometry args={[size * 0.07, size * 0.05, size * 0.9, 6]} />
          <meshStandardMaterial color={body} />
        </mesh>
      ))}
      {/* Tail */}
      <mesh position={[0, size * 1.05, -size * 0.75]} scale={[size * 0.1, size * 0.12, size * 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#f0e8d8" />
      </mesh>
    </group>
  );
}

function FoxBody({ size }: { size: number }) {
  const body = '#d05a28';
  const belly = '#f4e2c8';
  const dark = '#2a1a10';
  return (
    <group>
      <mesh castShadow position={[0, size * 0.85, 0]} scale={[size * 0.45, size * 0.42, size * 1.1]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      <mesh position={[0, size * 0.7, 0]} scale={[size * 0.35, size * 0.25, size * 0.95]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={belly} roughness={0.95} />
      </mesh>
      {/* Head pointed */}
      <mesh castShadow position={[0, size * 1.05, size * 0.85]} scale={[size * 0.3, size * 0.3, size * 0.45]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, size * 1.0, size * 1.2]} scale={[size * 0.1, size * 0.1, size * 0.2]}>
        <coneGeometry args={[1, 2, 8]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[0, size * 1.0, size * 1.35]}><sphereGeometry args={[size * 0.04, 6, 5]} /><meshStandardMaterial color={dark} /></mesh>
      {/* Eyes */}
      <mesh position={[size * 0.1, size * 1.15, size * 1.05]}><sphereGeometry args={[size * 0.03, 6, 5]} /><meshStandardMaterial color={dark} /></mesh>
      <mesh position={[-size * 0.1, size * 1.15, size * 1.05]}><sphereGeometry args={[size * 0.03, 6, 5]} /><meshStandardMaterial color={dark} /></mesh>
      {/* Ears triangular */}
      <mesh position={[size * 0.15, size * 1.35, size * 0.75]} rotation={[0, 0.3, 0.2]}>
        <coneGeometry args={[size * 0.09, size * 0.25, 4]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-size * 0.15, size * 1.35, size * 0.75]} rotation={[0, -0.3, -0.2]}>
        <coneGeometry args={[size * 0.09, size * 0.25, 4]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* Legs */}
      {[[-0.22, 0.5], [0.22, 0.5], [-0.22, -0.5], [0.22, -0.5]].map(([sx, sz], k) => (
        <mesh key={k} castShadow position={[sx * size, size * 0.4, sz * size]}>
          <cylinderGeometry args={[size * 0.06, size * 0.05, size * 0.75, 6]} />
          <meshStandardMaterial color={dark} />
        </mesh>
      ))}
      {/* Bushy tail (3 spheres) */}
      <mesh castShadow position={[0, size * 0.9, -size * 0.8]} scale={[size * 0.18, size * 0.18, size * 0.25]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh castShadow position={[0, size * 0.95, -size * 1.05]} scale={[size * 0.2, size * 0.2, size * 0.22]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[0, size * 1.0, -size * 1.25]} scale={[size * 0.13, size * 0.13, size * 0.15]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function RabbitBody({ size }: { size: number }) {
  const body = '#c8bfa8';
  return (
    <group>
      {/* Round body */}
      <mesh castShadow position={[0, size * 0.75, 0]} scale={[size * 0.55, size * 0.55, size * 0.7]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={body} roughness={0.95} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, size * 1.2, size * 0.35]} scale={[size * 0.35, size * 0.38, size * 0.4]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* Eyes */}
      <mesh position={[size * 0.13, size * 1.22, size * 0.52]}><sphereGeometry args={[size * 0.04, 6, 5]} /><meshStandardMaterial color="#1a0e08" /></mesh>
      <mesh position={[-size * 0.13, size * 1.22, size * 0.52]}><sphereGeometry args={[size * 0.04, 6, 5]} /><meshStandardMaterial color="#1a0e08" /></mesh>
      {/* Pink nose */}
      <mesh position={[0, size * 1.1, size * 0.65]}><sphereGeometry args={[size * 0.04, 6, 5]} /><meshStandardMaterial color="#c87080" /></mesh>
      {/* Long ears */}
      <mesh position={[size * 0.12, size * 1.55, size * 0.3]} rotation={[-0.2, 0, 0.15]} scale={[size * 0.07, size * 0.28, size * 0.08]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-size * 0.12, size * 1.55, size * 0.3]} rotation={[-0.2, 0, -0.15]} scale={[size * 0.07, size * 0.28, size * 0.08]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* Inner ears */}
      <mesh position={[size * 0.12, size * 1.6, size * 0.33]} rotation={[-0.2, 0, 0.15]} scale={[size * 0.04, size * 0.22, size * 0.02]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e8a0a0" />
      </mesh>
      <mesh position={[-size * 0.12, size * 1.6, size * 0.33]} rotation={[-0.2, 0, -0.15]} scale={[size * 0.04, size * 0.22, size * 0.02]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e8a0a0" />
      </mesh>
      {/* Feet */}
      {[[-0.2, 0.3], [0.2, 0.3], [-0.25, -0.3], [0.25, -0.3]].map(([sx, sz], k) => (
        <mesh key={k} castShadow position={[sx * size, size * 0.18, sz * size]} scale={[size * 0.1, size * 0.1, size * 0.2]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color={body} />
        </mesh>
      ))}
      {/* Cotton tail */}
      <mesh position={[0, size * 0.9, -size * 0.5]}>
        <sphereGeometry args={[size * 0.15, 10, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
    </group>
  );
}

function OwlBody({ size }: { size: number }) {
  const body = '#6a5240';
  const face = '#c4a882';
  return (
    <group>
      <mesh castShadow position={[0, 0, 0]} scale={[size * 0.6, size * 0.7, size * 0.55]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={body} roughness={0.95} />
      </mesh>
      {/* Face disc */}
      <mesh position={[0, size * 0.1, size * 0.45]} scale={[size * 0.4, size * 0.4, size * 0.12]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={face} />
      </mesh>
      {/* Eyes big */}
      <mesh position={[size * 0.18, size * 0.15, size * 0.55]}><sphereGeometry args={[size * 0.13, 10, 8]} /><meshStandardMaterial color="#ffea80" emissive="#b08000" emissiveIntensity={0.3} /></mesh>
      <mesh position={[-size * 0.18, size * 0.15, size * 0.55]}><sphereGeometry args={[size * 0.13, 10, 8]} /><meshStandardMaterial color="#ffea80" emissive="#b08000" emissiveIntensity={0.3} /></mesh>
      <mesh position={[size * 0.18, size * 0.15, size * 0.64]}><sphereGeometry args={[size * 0.06, 8, 6]} /><meshStandardMaterial color="#101010" /></mesh>
      <mesh position={[-size * 0.18, size * 0.15, size * 0.64]}><sphereGeometry args={[size * 0.06, 8, 6]} /><meshStandardMaterial color="#101010" /></mesh>
      {/* Beak */}
      <mesh position={[0, -size * 0.05, size * 0.55]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[size * 0.06, size * 0.15, 4]} />
        <meshStandardMaterial color="#f0b050" />
      </mesh>
      {/* Wings (folded) */}
      <mesh position={[size * 0.4, 0, 0]} rotation={[0, 0, -0.2]} scale={[size * 0.15, size * 0.55, size * 0.45]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#4a3828" />
      </mesh>
      <mesh position={[-size * 0.4, 0, 0]} rotation={[0, 0, 0.2]} scale={[size * 0.15, size * 0.55, size * 0.45]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#4a3828" />
      </mesh>
      {/* Ear tufts */}
      <mesh position={[size * 0.18, size * 0.7, 0]} rotation={[0, 0, 0.2]}><coneGeometry args={[size * 0.06, size * 0.2, 4]} /><meshStandardMaterial color={body} /></mesh>
      <mesh position={[-size * 0.18, size * 0.7, 0]} rotation={[0, 0, -0.2]}><coneGeometry args={[size * 0.06, size * 0.2, 4]} /><meshStandardMaterial color={body} /></mesh>
    </group>
  );
}

function Firefly() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color="#f8ffb0" emissive="#e8ff80" emissiveIntensity={3.5} toneMapped={false} />
      </mesh>
      <pointLight color="#d8ff80" intensity={1.8} distance={6} decay={2} />
    </group>
  );
}

/**
 * Small daytime bird — compact body with two triangular wings that flap.
 * BirdWrap below animates the wings each frame.
 */
function BirdBody({ i }: { i: number }) {
  const palette = ['#3a3a3a', '#5a3a24', '#2a4a7a', '#a06030', '#404a5a'];
  const col = palette[i % palette.length];
  const belly = '#d8cfbc';
  return (
    <group>
      {/* Body (elongated ellipsoid) */}
      <mesh scale={[0.12, 0.11, 0.24]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={col} roughness={0.9} />
      </mesh>
      {/* Pale belly patch */}
      <mesh position={[0, -0.04, 0.02]} scale={[0.08, 0.05, 0.18]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={belly} roughness={1} />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0, -0.22]} scale={[0.06, 0.015, 0.1]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col} side={THREE.DoubleSide} />
      </mesh>
      {/* Beak */}
      <mesh position={[0, 0.02, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.018, 0.06, 4]} />
        <meshStandardMaterial color="#f0a040" />
      </mesh>
      {/* Wings — children indices [4] and [5] (used by BirdWrap). */}
      <mesh position={[0.08, 0.03, 0]} scale={[0.22, 0.02, 0.16]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.08, 0.03, 0]} scale={[0.22, 0.02, 0.16]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Squirrel — small ground rodent with bushy tail. Diurnal. */
function SquirrelBody({ size }: { size: number }) {
  const body = '#8f4a22';
  const belly = '#e8caa0';
  return (
    <group>
      {/* Body */}
      <mesh castShadow position={[0, size * 0.35, 0]} scale={[size * 0.4, size * 0.38, size * 0.62]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={body} roughness={0.95} />
      </mesh>
      {/* Belly */}
      <mesh position={[0, size * 0.22, size * 0.05]} scale={[size * 0.28, size * 0.2, size * 0.42]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={belly} roughness={1} />
      </mesh>
      {/* Head */}
      <mesh position={[0, size * 0.7, size * 0.35]} scale={[size * 0.3, size * 0.28, size * 0.32]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={body} roughness={0.95} />
      </mesh>
      {/* Ears */}
      <mesh position={[size * 0.18, size * 0.92, size * 0.32]}><sphereGeometry args={[size * 0.07, 6, 5]} /><meshStandardMaterial color={body} /></mesh>
      <mesh position={[-size * 0.18, size * 0.92, size * 0.32]}><sphereGeometry args={[size * 0.07, 6, 5]} /><meshStandardMaterial color={body} /></mesh>
      {/* Bushy tail arching up */}
      <mesh position={[0, size * 0.7, -size * 0.45]} rotation={[0.3, 0, 0]} scale={[size * 0.28, size * 0.55, size * 0.35]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={body} roughness={1} />
      </mesh>
      {/* Legs (short) */}
      {([[0.2, 0.25], [-0.2, 0.25], [0.2, -0.2], [-0.2, -0.2]] as [number, number][]).map(([x, z], j) => (
        <mesh key={j} position={[x * size, size * 0.1, z * size]}>
          <cylinderGeometry args={[size * 0.06, size * 0.06, size * 0.2, 6]} />
          <meshStandardMaterial color={body} />
        </mesh>
      ))}
    </group>
  );
}

/** Dragonfly — elongated body with 4 transparent wings (flap-animated). */
function DragonflyWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 30 + i) * 0.6;
    // Wings: children indices [2..5]
    for (let k = 0; k < 4; k++) {
      const w = ref.current.children[2 + k] as THREE.Mesh | undefined;
      if (!w) continue;
      const sign = k % 2 === 0 ? 1 : -1;
      w.rotation.z = sign * (0.1 + flap);
    }
  });
  const body = ['#3a8a5a', '#4a6ab0', '#a05a30', '#5a3a8a'][i % 4];
  return (
    <group ref={ref}>
      {/* Body (slender) */}
      <mesh scale={[0.04, 0.04, 0.28]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={body} emissive={body} emissiveIntensity={0.25} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0, 0.18]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color={body} emissive={body} emissiveIntensity={0.3} />
      </mesh>
      {/* 4 wings (front/back × left/right) — indices 2..5 */}
      <mesh position={[0.12, 0.02, 0.05]} scale={[0.2, 0.01, 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e0f0ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.12, 0.02, 0.05]} scale={[0.2, 0.01, 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e0f0ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.1, 0.02, -0.05]} scale={[0.18, 0.01, 0.07]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e0f0ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.1, 0.02, -0.05]} scale={[0.18, 0.01, 0.07]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e0f0ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Bat — dark silhouette with large flapping wings (membrane). */
function BatWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 9 + i) * 1.1;
    const left = ref.current.children[1] as THREE.Mesh | undefined;
    const right = ref.current.children[2] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.2 - flap;
    if (right) right.rotation.z = 0.2 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body */}
      <mesh scale={[0.08, 0.08, 0.14]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={1} />
      </mesh>
      {/* Wings (wide, thin) */}
      <mesh position={[0.15, 0, 0]} scale={[0.32, 0.02, 0.18]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a1a1a" side={THREE.DoubleSide} roughness={1} />
      </mesh>
      <mesh position={[-0.15, 0, 0]} scale={[0.32, 0.02, 0.18]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a1a1a" side={THREE.DoubleSide} roughness={1} />
      </mesh>
    </group>
  );
}

/** Swallow — sleek blue bird with pointed wings, fast flight */
function SwallowWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 15 + i) * 0.7; // faster wingbeat
    const left = ref.current.children[1] as THREE.Mesh | undefined;
    const right = ref.current.children[2] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.15 - flap;
    if (right) right.rotation.z = 0.15 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body — sleek and pointed */}
      <mesh scale={[0.06, 0.05, 0.18]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#4a7ab8" roughness={0.6} />
      </mesh>
      {/* Wings — long and pointed */}
      <mesh position={[0.12, 0.02, 0]} scale={[0.28, 0.015, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a9ad8" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      <mesh position={[-0.12, 0.02, 0]} scale={[0.28, 0.015, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a9ad8" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Crow — black bird with broad wings */
function CrowWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 8 + i) * 0.8; // slower, heavier wingbeat
    const left = ref.current.children[1] as THREE.Mesh | undefined;
    const right = ref.current.children[2] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.2 - flap;
    if (right) right.rotation.z = 0.2 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body — chunky */}
      <mesh scale={[0.1, 0.09, 0.2]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {/* Wings — broad */}
      <mesh position={[0.18, 0.03, 0]} scale={[0.4, 0.025, 0.2]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <mesh position={[-0.18, 0.03, 0]} scale={[0.4, 0.025, 0.2]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Hawk — large soaring bird with broad rounded wings */
function HawkWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 6 + i) * 0.5; // slow, powerful wingbeat
    const left = ref.current.children[1] as THREE.Mesh | undefined;
    const right = ref.current.children[2] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.25 - flap;
    if (right) right.rotation.z = 0.25 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body — robust */}
      <mesh scale={[0.12, 0.1, 0.28]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#8a5a3a" roughness={0.7} />
      </mesh>
      {/* Wings — broad and rounded */}
      <mesh position={[0.22, 0.05, 0]} scale={[0.5, 0.03, 0.28]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a4a2a" side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
      <mesh position={[-0.22, 0.05, 0]} scale={[0.5, 0.03, 0.28]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a4a2a" side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

function BirdWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 12 + i) * 0.9;
    // BirdBody is rendered inside a child <group> so its children live
    // at ref.current.children[0].children. Reach through once.
    const inner = ref.current.children[0] as THREE.Group | undefined;
    if (!inner) return;
    const left = inner.children[4] as THREE.Mesh | undefined;
    const right = inner.children[5] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.1 - flap;
    if (right) right.rotation.z = 0.1 + flap;
  });
  return <group ref={ref}><BirdBody i={i} /></group>;
}

// ──────────── NEW ANIMALS ────────────

/** Wild Boar — stocky, dark brown, visible tusks */
function WildboarBody({ size }: { size: number }) {
  const body = '#3a2820';
  const snout = '#2a2018';
  const tusk = '#e8e0d8';
  return (
    <group scale={size}>
      {/* Body — bulky cylinder */}
      <mesh position={[0, 0.45, 0]} scale={[0.55, 0.5, 0.9]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      {/* Head — large with snout */}
      <mesh position={[0, 0.55, 0.65]} scale={[0.4, 0.42, 0.5]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={body} roughness={0.9} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.45, 1.0]} scale={[0.22, 0.18, 0.25]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={snout} roughness={1} />
      </mesh>
      {/* Tusks — curved */}
      <mesh position={[0.12, 0.4, 0.9]} rotation={[0.3, 0, 0.4]} scale={[0.04, 0.08, 0.15]}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color={tusk} roughness={0.6} />
      </mesh>
      <mesh position={[-0.12, 0.4, 0.9]} rotation={[0.3, 0, -0.4]} scale={[0.04, 0.08, 0.15]}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color={tusk} roughness={0.6} />
      </mesh>
      {/* Short legs */}
      <mesh position={[0.25, 0.18, 0.3]} scale={[0.14, 0.35, 0.14]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-0.25, 0.18, 0.3]} scale={[0.14, 0.35, 0.14]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[0.25, 0.18, -0.3]} scale={[0.14, 0.35, 0.14]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[-0.25, 0.18, -0.3]} scale={[0.14, 0.35, 0.14]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={body} />
      </mesh>
      {/* Small tail */}
      <mesh position={[0, 0.55, -0.85]} scale={[0.06, 0.15, 0.06]}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color={body} />
      </mesh>
    </group>
  );
}

/** Wolf — grey, lean, pointed muzzle, larger than fox */
function WolfBody({ size }: { size: number }) {
  const fur = '#6a6a72';
  const light = '#9a9aa0';
  return (
    <group scale={size}>
      {/* Body — elongated */}
      <mesh position={[0, 0.55, 0]} scale={[0.38, 0.45, 1.1]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={fur} roughness={0.85} />
      </mesh>
      {/* Head — long snout */}
      <mesh position={[0, 0.65, 0.85]} scale={[0.32, 0.35, 0.55]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={fur} roughness={0.85} />
      </mesh>
      {/* Snout tip */}
      <mesh position={[0, 0.6, 1.35]} scale={[0.18, 0.18, 0.22]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={light} roughness={0.9} />
      </mesh>
      {/* Pointed ears */}
      <mesh position={[0.18, 0.95, 0.65]} rotation={[0, 0, 0.3]} scale={[0.1, 0.22, 0.08]}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      <mesh position={[-0.18, 0.95, 0.65]} rotation={[0, 0, -0.3]} scale={[0.1, 0.22, 0.08]}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* Bushy tail */}
      <mesh position={[0, 0.65, -1.0]} scale={[0.18, 0.18, 0.5]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* Legs — longer than fox */}
      {[[0.22, 0.32], [-0.22, 0.32], [0.22, -0.35], [-0.22, -0.35]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.28, z]} scale={[0.12, 0.55, 0.12]}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshStandardMaterial color={fur} />
        </mesh>
      ))}
    </group>
  );
}

/** Roe Deer — small, sandy color, no antlers (like females/young) */
function RoedeerBody({ size }: { size: number }) {
  const coat = '#c8a878';
  const light = '#e8d8b8';
  return (
    <group scale={size}>
      {/* Body — compact */}
      <mesh position={[0, 0.55, 0]} scale={[0.42, 0.48, 0.95]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={coat} roughness={0.8} />
      </mesh>
      {/* White rump patch */}
      <mesh position={[0, 0.6, -0.75]} scale={[0.25, 0.25, 0.1]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={light} />
      </mesh>
      {/* Head — delicate */}
      <mesh position={[0, 0.7, 0.72]} scale={[0.28, 0.32, 0.4]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={coat} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.65, 1.05]} scale={[0.15, 0.15, 0.2]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={light} />
      </mesh>
      {/* Small ears */}
      <mesh position={[0.12, 0.88, 0.6]} rotation={[0, 0, 0.4]} scale={[0.08, 0.18, 0.06]}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={coat} />
      </mesh>
      <mesh position={[-0.12, 0.88, 0.6]} rotation={[0, 0, -0.4]} scale={[0.08, 0.18, 0.06]}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={coat} />
      </mesh>
      {/* Slender legs */}
      {[[0.18, 0.35], [-0.18, 0.35], [0.18, -0.35], [-0.18, -0.35]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.28, z]} scale={[0.08, 0.55, 0.08]}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshStandardMaterial color={coat} />
        </mesh>
      ))}
    </group>
  );
}

/** Robin — small with distinctive red breast */
function RobinWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 14 + i) * 0.8;
    const left = ref.current.children[2] as THREE.Mesh | undefined;
    const right = ref.current.children[3] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.15 - flap;
    if (right) right.rotation.z = 0.15 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body */}
      <mesh scale={[0.14, 0.12, 0.18]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#8a7a6a" />
      </mesh>
      {/* Red breast */}
      <mesh position={[0, 0.02, 0.08]} scale={[0.1, 0.1, 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#c84030" />
      </mesh>
      {/* Wings */}
      <mesh position={[0.12, 0.02, 0]} scale={[0.2, 0.015, 0.14]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a5a4a" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.12, 0.02, 0]} scale={[0.2, 0.015, 0.14]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a5a4a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Frog — green, hunched shape, near water */
function FrogBody({ size }: { size: number }) {
  const green = '#5a9a40';
  const light = '#8aca60';
  return (
    <group scale={size}>
      {/* Body — squat hump */}
      <mesh position={[0, 0.15, 0]} scale={[0.35, 0.28, 0.45]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={green} roughness={0.7} />
      </mesh>
      {/* Light belly */}
      <mesh position={[0, 0.08, 0.05]} scale={[0.25, 0.15, 0.35]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={light} roughness={0.8} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.18, 0.32]} scale={[0.28, 0.22, 0.28]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={green} />
      </mesh>
      {/* Bulging eyes */}
      <mesh position={[0.12, 0.28, 0.35]} scale={[0.06, 0.06, 0.04]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#4a8a30" />
      </mesh>
      <mesh position={[-0.12, 0.28, 0.35]} scale={[0.06, 0.06, 0.04]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#4a8a30" />
      </mesh>
      {/* Back legs — folded */}
      <mesh position={[0.28, 0.1, -0.1]} rotation={[0, 0, -0.5]} scale={[0.12, 0.25, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={green} />
      </mesh>
      <mesh position={[-0.28, 0.1, -0.1]} rotation={[0, 0, 0.5]} scale={[0.12, 0.25, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={green} />
      </mesh>
    </group>
  );
}

/** Badger — stocky, black and white stripes on face */
function BadgerBody({ size }: { size: number }) {
  const grey = '#5a5a5a';
  const white = '#d8d8d8';
  const black = '#2a2a2a';
  return (
    <group scale={size}>
      {/* Body — stout cylinder */}
      <mesh position={[0, 0.42, 0]} scale={[0.48, 0.42, 0.85]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={grey} roughness={0.9} />
      </mesh>
      {/* Head with white stripe */}
      <mesh position={[0, 0.55, 0.68]} scale={[0.35, 0.32, 0.38]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={grey} />
      </mesh>
      {/* White stripe on head */}
      <mesh position={[0, 0.58, 0.82]} scale={[0.12, 0.25, 0.2]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={white} />
      </mesh>
      {/* Black patches around eyes */}
      <mesh position={[0.1, 0.6, 0.85]} scale={[0.08, 0.08, 0.06]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={black} />
      </mesh>
      <mesh position={[-0.1, 0.6, 0.85]} scale={[0.08, 0.08, 0.06]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={black} />
      </mesh>
      {/* Short sturdy legs */}
      {[[0.25, 0.3], [-0.25, 0.3], [0.25, -0.35], [-0.25, -0.35]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} scale={[0.15, 0.4, 0.15]}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshStandardMaterial color={grey} />
        </mesh>
      ))}
    </group>
  );
}

/** Hare — larger than rabbit, very long ears */
function HareBody({ size }: { size: number }) {
  const fur = '#b89878';
  const light = '#d8c8a8';
  return (
    <group scale={size}>
      {/* Body — elongated like rabbit but bigger */}
      <mesh position={[0, 0.38, 0]} scale={[0.38, 0.4, 0.95]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={fur} roughness={0.85} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.48, 0.65]} scale={[0.25, 0.28, 0.32]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* VERY long ears — hare signature */}
      <mesh position={[0.08, 0.78, 0.55]} rotation={[0.3, 0, 0.25]} scale={[0.06, 0.55, 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      <mesh position={[-0.08, 0.78, 0.55]} rotation={[0.3, 0, -0.25]} scale={[0.06, 0.55, 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={fur} />
      </mesh>
      {/* Long legs for leaping */}
      {[[0.15, 0.35], [-0.15, 0.35], [0.15, -0.35], [-0.15, -0.35]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} scale={[0.1, 0.48, 0.1]}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshStandardMaterial color={fur} />
        </mesh>
      ))}
      {/* Short tail */}
      <mesh position={[0, 0.45, -0.72]} scale={[0.08, 0.12, 0.08]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={light} />
      </mesh>
    </group>
  );
}

/** Chickadee — tiny, grey body, black cap, white cheeks */
function ChickadeeWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 16 + i) * 0.9; // very fast wingbeat for small bird
    const left = ref.current.children[3] as THREE.Mesh | undefined;
    const right = ref.current.children[4] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.2 - flap;
    if (right) right.rotation.z = 0.2 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body — round */}
      <mesh scale={[0.1, 0.09, 0.12]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#7a8a9a" />
      </mesh>
      {/* Black cap on head */}
      <mesh position={[0, 0.08, 0.06]} scale={[0.08, 0.04, 0.09]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* White cheeks */}
      <mesh position={[0.05, 0.02, 0.08]} scale={[0.04, 0.05, 0.03]}>
        <sphereGeometry args={[1, 5, 4]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      <mesh position={[-0.05, 0.02, 0.08]} scale={[0.04, 0.05, 0.03]}>
        <sphereGeometry args={[1, 5, 4]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      {/* Wings */}
      <mesh position={[0.1, 0.02, 0]} scale={[0.16, 0.012, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a7a8a" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.1, 0.02, 0]} scale={[0.16, 0.012, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#6a7a8a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Eagle — massive bird of prey, golden/brown */
function EagleWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Slow powerful wingbeats
    const flap = Math.sin(t * 4 + i) * 0.35;
    const left = ref.current.children[1] as THREE.Mesh | undefined;
    const right = ref.current.children[2] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.3 - flap;
    if (right) right.rotation.z = 0.3 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body — powerful */}
      <mesh scale={[0.2, 0.18, 0.35]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#6a5a3a" />
      </mesh>
      {/* Head — white for bald eagle look, or brown */}
      <mesh position={[0, 0.15, 0.28]} scale={[0.14, 0.14, 0.16]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#f0e8d8" />
      </mesh>
      {/* Hooked beak */}
      <mesh position={[0, 0.12, 0.4]} rotation={[0.5, 0, 0]} scale={[0.04, 0.08, 0.06]}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#f0a030" />
      </mesh>
      {/* Massive wings */}
      <mesh position={[0.35, 0.08, 0]} scale={[0.65, 0.035, 0.35]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#5a4a2a" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.35, 0.08, 0]} scale={[0.65, 0.035, 0.35]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#5a4a2a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Woodpecker — red crown, black/white pattern, climbing */
function WoodpeckerWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 10 + i) * 0.6; // quick bursts
    const left = ref.current.children[3] as THREE.Mesh | undefined;
    const right = ref.current.children[4] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.12 - flap;
    if (right) right.rotation.z = 0.12 + flap;
  });
  return (
    <group ref={ref}>
      {/* Body */}
      <mesh scale={[0.14, 0.13, 0.22]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* White patch on back */}
      <mesh position={[0, 0.08, -0.05]} scale={[0.1, 0.08, 0.15]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>
      {/* Red crown — signature woodpecker feature */}
      <mesh position={[0, 0.16, 0.15]} scale={[0.08, 0.06, 0.1]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#c83020" />
      </mesh>
      {/* Strong beak */}
      <mesh position={[0, 0.08, 0.28]} rotation={[0.3, 0, 0]} scale={[0.04, 0.06, 0.1]}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Wings */}
      <mesh position={[0.14, 0.04, 0]} scale={[0.22, 0.018, 0.16]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.14, 0.04, 0]} scale={[0.22, 0.018, 0.16]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Butterfly({ t, i }: { t: number; i: number }) {
  const flap = Math.sin(t * 18 + i) * 0.7 + 0.1;
  const col1 = ['#ffcc30', '#f07070', '#a070e0', '#40b0e0'][i % 4];
  return (
    <group>
      <mesh position={[0, 0, 0]} scale={[0.04, 0.04, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#1a1a18" />
      </mesh>
      <mesh position={[0.1, 0, 0]} rotation={[0, 0, -flap]} scale={[0.18, 0.02, 0.14]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col1} side={THREE.DoubleSide} emissive={col1} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.1, 0, 0]} rotation={[0, 0, flap]} scale={[0.18, 0.02, 0.14]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col1} side={THREE.DoubleSide} emissive={col1} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// ──────────── Animals controller ────────────

export function Animals({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  const animals = useMemo<Animal[]>(() => {
    const mix: Kind[] = [
      // Herds of deer — central mammal of the forest.
      'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer',
      'fox', 'fox', 'fox', 'fox',
      'rabbit', 'rabbit', 'rabbit', 'rabbit', 'rabbit', 'rabbit',
      'squirrel', 'squirrel', 'squirrel', 'squirrel', 'squirrel', 'squirrel',
      'owl', 'owl', 'owl',
      'bat', 'bat', 'bat',
      'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly', 'firefly',
      'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly',
      'dragonfly', 'dragonfly', 'dragonfly', 'dragonfly', 'dragonfly',
      'bird', 'bird', 'bird', 'bird', 'bird', 'bird', 'bird', 'bird',
      // Sky flock - always visible birds flying high
      'swallow', 'swallow', 'swallow', 'swallow', 'swallow', 'swallow', 'swallow', 'swallow',
      'crow', 'crow', 'crow', 'crow', 'crow', 'crow',
      'hawk', 'hawk', 'hawk', 'hawk',
      // New diverse wildlife
      'wildboar', 'wildboar', 'wildboar',              // Stocky forest foragers
      'wolf', 'wolf',                                    // Rare, majestic predators
      'roedeer', 'roedeer', 'roedeer', 'roedeer',       // Small deer, more common
      'robin', 'robin', 'robin', 'robin', 'robin',      // Cheerful songbirds
      'frog', 'frog', 'frog', 'frog', 'frog',           // Near water, night singers
      'badger', 'badger',                                // Nocturnal diggers
      'hare', 'hare', 'hare', 'hare',                   // Fast, shy, long ears
      'chickadee', 'chickadee', 'chickadee', 'chickadee', 'chickadee', // Tiny acrobats
      'eagle', 'eagle',                                  // Rare majestic hunters
      'woodpecker', 'woodpecker', 'woodpecker',          // Tree drummers
    ];
    return Array.from({ length: NUM_ANIMALS }, (_, i) => {
      const kind = mix[i % mix.length];
      const angle = (i / NUM_ANIMALS) * Math.PI * 2;
      let r = 18 + (i % 5) * 7;
      let x = Math.cos(angle) * r;
      let z = Math.sin(angle) * r;
      // Ground animals must spawn on dry land: walk outwards until above water.
      if (isGroundAnimal(kind)) {
        for (let tries = 0; tries < 12 && sampledHeight(x, z) <= WATER_LEVEL + 0.3; tries++) {
          r += 4;
          x = Math.cos(angle) * r;
          z = Math.sin(angle) * r;
        }
      }
      return {
        pos: new THREE.Vector3(x, sampledHeight(x, z), z),
        target: new THREE.Vector3(x, 0, z),
        speed: BASE_SPEEDS[kind],
        kind,
        size: SIZES[kind],
        nextRetarget: 0,
        visible: 0,
      };
    });
  }, []);

  const tmp = useRef(new THREE.Vector3());

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.08);
    const pp = playerRef.current.position;
    const t = state.clock.elapsedTime;
    const calm = world.calm;
    // When calm is high, animals become *more* visible *and* off-hour
    // species start peeking out. The calm bonus (up to +0.35 visibility)
    // lets deer appear at noon, foxes show up briefly during the day, etc.
    const globalVisibility = 0.2 + calm * 0.95;
    const calmBonus = calm > 0.5 ? (calm - 0.5) * 0.7 : 0; // 0 → 0.35

    for (let i = 0; i < animals.length; i++) {
      const a = animals[i];
      const avoidWater = isGroundAnimal(a.kind);
      if (a.pos.distanceToSquared(pp) > ROAM_RADIUS * ROAM_RADIUS * 1.2) {
        let ang = Math.random() * Math.PI * 2;
        let d = ROAM_RADIUS * 0.6;
        let nx = pp.x + Math.cos(ang) * d;
        let nz = pp.z + Math.sin(ang) * d;
        if (avoidWater) {
          for (let tries = 0; tries < 10 && sampledHeight(nx, nz) <= WATER_LEVEL + 0.3; tries++) {
            ang = Math.random() * Math.PI * 2;
            d = ROAM_RADIUS * (0.4 + Math.random() * 0.3);
            nx = pp.x + Math.cos(ang) * d;
            nz = pp.z + Math.sin(ang) * d;
          }
        }
        a.pos.set(nx, 0, nz);
        a.pos.y = sampledHeight(nx, nz);
        a.nextRetarget = 0;
      }

      const rawAct = activeness(a.kind, world.hour, world.weather);
      // Fireflies, squirrels, birds and sky flock are ambient life — they should
      // appear reliably regardless of the player's calm. Sky birds (swallow, crow, hawk)
      // are especially visible as they fly high. Other animals fade in as calm builds.
      const alwaysVisible = a.kind === 'firefly' || a.kind === 'squirrel' || a.kind === 'bird' ||
                            a.kind === 'swallow' || a.kind === 'crow' || a.kind === 'hawk' ||
                            a.kind === 'butterfly' || a.kind === 'dragonfly'; // flying insects always visible
      // Sky birds get extra visibility for high-flying presence
      const isSkyBird = a.kind === 'swallow' || a.kind === 'crow' || a.kind === 'hawk';
      // Base visibility: higher for always-visible animals
      const baseVis = isSkyBird ? 0.75 : (alwaysVisible ? 0.6 : 0.25);
      const calmBonusVis = alwaysVisible ? calm * 0.25 : calm * 0.95; // gentler curve for common animals
      const visFactor = baseVis + calmBonusVis;
      const act = Math.min(1, rawAct + calmBonus);
      const target = act * visFactor;
      a.visible += (target - a.visible) * Math.min(1, dt * 0.8);

      if (t > a.nextRetarget || a.pos.distanceToSquared(a.target) < 1.5) {
        pickTargetNear(a.pos, a.target, Math.floor(t * 10) + i * 7, avoidWater);
        const patience =
          a.kind === 'owl' ? 6 :
          a.kind === 'firefly' ? 2 :
          a.kind === 'butterfly' ? 1.5 :
          a.kind === 'dragonfly' ? 0.8 :  // darty, quick direction changes
          a.kind === 'bat' ? 0.6 :         // very erratic
          a.kind === 'bird' ? 4 :
          a.kind === 'squirrel' ? 1.8 :
          // New animals patience
          a.kind === 'wildboar' ? 2.5 :    // methodical forager
          a.kind === 'wolf' ? 4.5 :        // patient hunter
          a.kind === 'roedeer' ? 2.2 :     // nervous, moves often
          a.kind === 'robin' ? 1.2 :       // quick darting movements
          a.kind === 'frog' ? 3.0 :        // sits still, then hops
          a.kind === 'badger' ? 3.5 :      // slow deliberate
          a.kind === 'hare' ? 1.0 :        // extremely nervous
          a.kind === 'chickadee' ? 0.9 :   // hyperactive tiny bird
          a.kind === 'eagle' ? 7.0 :       // soars for long periods
          a.kind === 'woodpecker' ? 5.0 :  // stays on tree, then flies
          3; // default
        a.nextRetarget = t + patience + Math.random() * 5;
      }

      tmp.current.copy(a.target).sub(a.pos); tmp.current.y = 0;
      const dist = tmp.current.length();
      const speedScale = a.kind === 'firefly' || a.kind === 'butterfly' ? 1 : 0.6 + calm * 0.8;
      const sp = a.speed * speedScale;
      if (dist > 0.01) {
        tmp.current.multiplyScalar((sp * dt) / dist);
        const stepX = a.pos.x + tmp.current.x;
        const stepZ = a.pos.z + tmp.current.z;
        // Block ground animals from stepping into water — force immediate
        // retarget so they turn away from the shore instead of wading in.
        if (avoidWater && sampledHeight(stepX, stepZ) <= WATER_LEVEL + 0.25) {
          a.nextRetarget = 0;
        } else {
          a.pos.x = stepX;
          a.pos.z = stepZ;
        }
      }
      const terrainY = sampledHeight(a.pos.x, a.pos.z);
      if (a.kind === 'owl') a.pos.y = Math.max(terrainY + 6, WATER_LEVEL + 6);
      else if (a.kind === 'firefly') a.pos.y = terrainY + 1.4 + Math.sin(t * 2 + i) * 0.4;
      else if (a.kind === 'butterfly') a.pos.y = terrainY + 1.1 + Math.sin(t * 3 + i) * 0.3;
      // Birds cruise above the canopy, gently undulating. Higher altitude so
      // they are visible against the sky rather than clipping into trees.
      else if (a.kind === 'bird') a.pos.y = Math.max(terrainY + 11, 12) + Math.sin(t * 0.7 + i * 1.3) * 1.2;
      // Sky birds fly very high - always visible silhouettes against the sky
      else if (a.kind === 'swallow') a.pos.y = Math.max(terrainY + 22, 24) + Math.sin(t * 0.9 + i) * 2; // high, fast
      else if (a.kind === 'crow') a.pos.y = Math.max(terrainY + 28, 30) + Math.sin(t * 0.6 + i) * 3; // very high
      else if (a.kind === 'hawk') a.pos.y = Math.max(terrainY + 35, 38) + Math.sin(t * 0.5 + i) * 2.5; // highest, soaring
      // Dragonflies hover at waist height with quick bobbing — insect feel.
      else if (a.kind === 'dragonfly') a.pos.y = terrainY + 1.3 + Math.sin(t * 4 + i) * 0.25;
      // Bats flutter mid-height between canopy and ground, erratic dips.
      else if (a.kind === 'bat') a.pos.y = Math.max(terrainY + 5 + Math.sin(t * 1.5 + i) * 2.2, WATER_LEVEL + 4);
      // New animals heights
      else if (a.kind === 'wildboar') a.pos.y = terrainY + 0.35; // low, rooting
      else if (a.kind === 'wolf') a.pos.y = terrainY + 0.48;
      else if (a.kind === 'roedeer') a.pos.y = terrainY + 0.42;
      else if (a.kind === 'robin') a.pos.y = Math.max(terrainY + 3, 4) + Math.sin(t * 0.8 + i) * 0.5; // low flight
      else if (a.kind === 'frog') a.pos.y = terrainY + 0.12; // very low, ground
      else if (a.kind === 'badger') a.pos.y = terrainY + 0.32;
      else if (a.kind === 'hare') a.pos.y = terrainY + 0.28;
      else if (a.kind === 'chickadee') a.pos.y = Math.max(terrainY + 6, 8) + Math.sin(t * 1.2 + i) * 1; // tree height
      else if (a.kind === 'eagle') a.pos.y = Math.max(terrainY + 45, 48) + Math.sin(t * 0.4 + i) * 3; // extremely high
      else if (a.kind === 'woodpecker') a.pos.y = Math.max(terrainY + 8, 10) + Math.sin(t * 0.6 + i) * 0.8; // trunk height
      else a.pos.y = Math.max(terrainY, WATER_LEVEL + 0.05);

      const g = groupRefs.current[i];
      if (g) {
        g.visible = a.visible > 0.03;
        g.position.copy(a.pos);
        if (dist > 0.01) g.rotation.y = Math.atan2(tmp.current.x, tmp.current.z);
        const bob =
          a.kind === 'rabbit' ? Math.abs(Math.sin(t * 6 + i)) * 0.25 :
          a.kind === 'firefly' ? Math.sin(t * 3 + i) * 0.2 :
          a.kind === 'butterfly' ? Math.sin(t * 8 + i) * 0.15 :
          a.kind === 'owl' ? Math.sin(t * 0.8 + i) * 0.25 :
          a.kind === 'bird' ? Math.sin(t * 6 + i) * 0.08 :
          a.kind === 'swallow' ? Math.sin(t * 10 + i) * 0.25 :           // agile flier
          a.kind === 'crow' ? Math.sin(t * 5 + i) * 0.2 :                // steady glider
          a.kind === 'hawk' ? Math.sin(t * 3 + i) * 0.15 :               // soaring
          a.kind === 'squirrel' ? Math.abs(Math.sin(t * 8 + i)) * 0.12 : // hoppy
          a.kind === 'dragonfly' ? Math.sin(t * 10 + i) * 0.06 :
          a.kind === 'bat' ? Math.sin(t * 5 + i) * 0.3 :                  // swooping
          // New animals bob patterns
          a.kind === 'wildboar' ? Math.sin(t * 2 + i) * 0.03 :           // heavy, minimal bob
          a.kind === 'wolf' ? Math.sin(t * 3 + i) * 0.05 :               // loping gait
          a.kind === 'roedeer' ? Math.sin(t * 4 + i) * 0.06 :            // light prance
          a.kind === 'robin' ? Math.sin(t * 12 + i) * 0.15 :             // quick flutter
          a.kind === 'frog' ? Math.abs(Math.sin(t * 3 + i)) * 0.1 :      // hop
          a.kind === 'badger' ? Math.sin(t * 2.5 + i) * 0.04 :          // lumbering
          a.kind === 'hare' ? Math.abs(Math.sin(t * 7 + i)) * 0.2 :      // bounding
          a.kind === 'chickadee' ? Math.sin(t * 15 + i) * 0.12 :         // hyperactive
          a.kind === 'eagle' ? Math.sin(t * 1.5 + i) * 0.08 :            // majestic slow
          a.kind === 'woodpecker' ? Math.abs(Math.sin(t * 4 + i)) * 0.06 : // climbing hop
          Math.sin(t * 4 + i) * 0.04;
        g.position.y += bob;
        const s = Math.max(0.001, a.visible);
        g.scale.setScalar(s);
      }
    }
  });

  return (
    <>
      {animals.map((a, i) => (
        <group key={i} ref={(el) => { groupRefs.current[i] = el; }} position={a.pos}>
          {a.kind === 'deer' && <DeerBody size={a.size} />}
          {a.kind === 'fox' && <FoxBody size={a.size} />}
          {a.kind === 'rabbit' && <RabbitBody size={a.size} />}
          {a.kind === 'owl' && <OwlBody size={a.size} />}
          {a.kind === 'firefly' && <Firefly />}
          {a.kind === 'butterfly' && <ButterflyWrap i={i} />}
          {a.kind === 'bird' && <BirdWrap i={i} />}
          {a.kind === 'swallow' && <SwallowWrap i={i} />}
          {a.kind === 'crow' && <CrowWrap i={i} />}
          {a.kind === 'hawk' && <HawkWrap i={i} />}
          {a.kind === 'squirrel' && <SquirrelBody size={a.size} />}
          {a.kind === 'dragonfly' && <DragonflyWrap i={i} />}
          {a.kind === 'bat' && <BatWrap i={i} />}
          {/* New animals */}
          {a.kind === 'wildboar' && <WildboarBody size={a.size} />}
          {a.kind === 'wolf' && <WolfBody size={a.size} />}
          {a.kind === 'roedeer' && <RoedeerBody size={a.size} />}
          {a.kind === 'robin' && <RobinWrap i={i} />}
          {a.kind === 'frog' && <FrogBody size={a.size} />}
          {a.kind === 'badger' && <BadgerBody size={a.size} />}
          {a.kind === 'hare' && <HareBody size={a.size} />}
          {a.kind === 'chickadee' && <ChickadeeWrap i={i} />}
          {a.kind === 'eagle' && <EagleWrap i={i} />}
          {a.kind === 'woodpecker' && <WoodpeckerWrap i={i} />}
        </group>
      ))}
    </>
  );
}

function ButterflyWrap({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Replace group children: we render Butterfly with flap animation
    // Easier: manipulate wing scales by animating child scales each frame
    const flap = Math.abs(Math.sin(t * 18 + i));
    const left = ref.current.children[1] as THREE.Mesh | undefined;
    const right = ref.current.children[2] as THREE.Mesh | undefined;
    if (left) left.rotation.z = -0.1 - flap * 1.0;
    if (right) right.rotation.z = 0.1 + flap * 1.0;
  });
  const col1 = ['#ffcc30', '#f07070', '#a070e0', '#40b0e0'][i % 4];
  return (
    <group ref={ref}>
      <mesh scale={[0.04, 0.04, 0.12]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#1a1a18" />
      </mesh>
      <mesh position={[0.1, 0, 0]} scale={[0.18, 0.02, 0.14]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col1} side={THREE.DoubleSide} emissive={col1} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.1, 0, 0]} scale={[0.18, 0.02, 0.14]}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={col1} side={THREE.DoubleSide} emissive={col1} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}
