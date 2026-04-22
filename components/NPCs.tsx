'use client';
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_SIZE, hash2, sampledHeight, TERRAIN_TYPE } from '@/lib/noise';
import { WATER_LEVEL } from '@/lib/world';
import { NPCKind, kindForChunk, useNPC, getTerrainAdaptedProfile } from '@/lib/npc';
import { PlayerState } from './Player';
import { VIEW_RADIUS } from './Forest';
import { NPCModel } from './NPCModel';

interface NPCInstance {
  id: string;
  kind: NPCKind;
  cx: number;
  cz: number;
  x: number;
  z: number;
  y: number;
  rot: number;
}

/**
 * Deterministic rare spawn: at most one NPC per chunk, skipping the origin
 * area. Spawn rate tuned for occasional encounters - common enough to meet
 * someone within a couple minutes of walking, rare enough to feel special.
 * 
 * Terrain affects spawn rates and NPC types:
 * - riverlands: more lakeSeekers near water
 * - mountainous: hermit/ranger more common at altitude
 * - volcanic: wanderer/storyteller more resilient
 * - hilly: herbalist/hunter favor rolling terrain
 */
const SPAWN_CHANCE = 0.20; // ~20% of chunks host someone
const SPAWN_EXCLUSION = 25; // meters from world origin

/** Terrain-specific spawn chance modifiers and preferred NPC types. */
const TERRAIN_SPAWN_MODS: Record<string, { chance: number; favored: NPCKind[] }> = {
  flat: { chance: 1.0, favored: ['herbalist', 'poet', 'storyteller'] },
  hilly: { chance: 1.05, favored: ['hunter', 'herbalist', 'ranger'] },
  mountainous: { chance: 0.9, favored: ['hermit', 'ranger', 'wanderer'] },
  volcanic: { chance: 0.85, favored: ['wanderer', 'storyteller', 'hunter'] },
  riverlands: { chance: 1.15, favored: ['lakeSeeker', 'herbalist', 'poet'] },
};

function npcsForChunk(cx: number, cz: number): NPCInstance[] {
  const mods = TERRAIN_SPAWN_MODS[TERRAIN_TYPE];
  const spawnChance = SPAWN_CHANCE * mods.chance;
  
  const chance = hash2(cx, cz, 9181);
  if (chance > spawnChance) return [];
  
  const jx = hash2(cx, cz, 9182);
  const jz = hash2(cx, cz, 9183);
  const x = cx * CHUNK_SIZE + (0.2 + jx * 0.6) * CHUNK_SIZE;
  const z = cz * CHUNK_SIZE + (0.2 + jz * 0.6) * CHUNK_SIZE;
  if (Math.hypot(x, z) < SPAWN_EXCLUSION) return [];
  const y = sampledHeight(x, z);
  
  // Terrain-specific height constraints
  if (TERRAIN_TYPE === 'mountainous' && y < 2) return []; // High altitude NPCs only
  if (TERRAIN_TYPE === 'riverlands' && y > 4) return []; // Near water only
  if (y < WATER_LEVEL + 0.4 || y > 12) return []; // Relaxed upper bound for mountains
  
  // Terrain-aware kind selection - bias toward favored types
  let kind = kindForChunk(cx, cz);
  const favored = mods.favored;
  const favoredRoll = hash2(cx, cz, 9185);
  if (favoredRoll < 0.4 && favored) {
    // 40% chance to pick from favored types for this terrain
    kind = favored[Math.floor(hash2(cx, cz, 9186) * favored.length)];
  }
  
  const rot = hash2(cx, cz, 9184) * Math.PI * 2;
  return [{ id: `npc:${cx},${cz}`, kind, cx, cz, x, z, y, rot }];
}

const NEARBY_RADIUS = 3.4;

export function NPCs({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const [center, setCenter] = useState<[number, number]>([0, 0]);
  const groupRef = useRef<THREE.Group>(null);
  const devGroupRef = useRef<THREE.Group>(null);

  // Rebuild NPC list only when chunk center changes.
  const npcs = useMemo(() => {
    const [cx, cz] = center;
    const out: NPCInstance[] = [];
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        const list = npcsForChunk(cx + dx, cz + dz);
        for (let i = 0; i < list.length; i++) out.push(list[i]);
      }
    }
    return out;
  }, [center]);

  const setNearby = useNPC((s) => s.setNearby);
  const dialogOpenFor = useNPC((s) => s.dialogOpenFor);
  const devNPC = useNPC((s) => s.devNPC);
  const updateDevNPC = useNPC((s) => s.updateDevNPC);
  const devNPCInitialized = useRef(false);

  useFrame((state) => {
    const dt = state.clock.getDelta();
    const pp = playerRef.current.position;
    const cx = Math.floor(pp.x / CHUNK_SIZE);
    const cz = Math.floor(pp.z / CHUNK_SIZE);
    if (cx !== center[0] || cz !== center[1]) setCenter([cx, cz]);

    // Initialize devNPC position on first spawn (spawn 8-15m away from player)
    // Check both the ref AND the actual position to handle component remounts
    const needsInit = devNPC && (devNPC.x === 0 && devNPC.z === 0) && !devNPCInitialized.current;
    if (needsInit) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = 8 + Math.random() * 7; // 8-15 meters away
      const spawnX = pp.x + Math.sin(spawnAngle) * spawnDist;
      const spawnZ = pp.z + Math.cos(spawnAngle) * spawnDist;
      updateDevNPC((n) => ({
        ...n,
        x: spawnX,
        z: spawnZ,
        targetX: pp.x,
        targetZ: pp.z,
      }));
      devNPCInitialized.current = true;
    }

    // Reset initialization flag when devNPC is cleared
    if (!devNPC && devNPCInitialized.current) {
      devNPCInitialized.current = false;
    }

    // nearest NPC within range
    let closest: NPCInstance | null = null;
    let closestDist = NEARBY_RADIUS;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      const d = Math.hypot(pp.x - n.x, pp.z - n.z);
      if (d < closestDist) {
        closestDist = d;
        closest = n;
      }
    }
    setNearby(
      closest
        ? {
            id: closest.id,
            kind: closest.kind,
            x: closest.x,
            z: closest.z,
            cx: closest.cx,
            cz: closest.cz,
          }
        : null,
    );

    // bob/rotate visuals for regular NPCs
    const t = state.clock.elapsedTime;
    const group = groupRef.current;
    if (group) {
      for (let i = 0; i < npcs.length; i++) {
        const child = group.children[i] as THREE.Group | undefined;
        if (!child) continue;
        const n = npcs[i];
        child.position.y = n.y + Math.sin(t * 1.1 + i) * 0.04;
        // Face the player softly when idle
        const lookX = pp.x - n.x;
        const lookZ = pp.z - n.z;
        const targetRot = Math.atan2(lookX, lookZ);
        child.rotation.y += (targetRot - child.rotation.y) * 0.02;
        child.visible = true;
      }
    }

    // Handle dev NPC - it walks toward the player
    if (devNPC && devGroupRef.current) {
      const dx = pp.x - devNPC.x;
      const dz = pp.z - devNPC.z;
      const dist = Math.hypot(dx, dz);

      // Always update position to ensure visibility (even at spawn)
      const ny = sampledHeight(devNPC.x, devNPC.z);
      devGroupRef.current.position.set(devNPC.x, ny, devNPC.z);

      if (dist > 0.5) {
        // Move toward player
        const moveDist = Math.min(devNPC.speed * dt, dist);
        const nx = devNPC.x + (dx / dist) * moveDist;
        const nz = devNPC.z + (dz / dist) * moveDist;
        const nny = sampledHeight(nx, nz);
        // Single update for both position and target
        updateDevNPC((n) => ({ ...n, x: nx, z: nz, targetX: pp.x, targetZ: pp.z }));
        devGroupRef.current.position.set(nx, nny, nz);
        // Face player
        devGroupRef.current.rotation.y = Math.atan2(dx, dz);
      } else {
        // Arrived - update target and set as nearby for interaction
        updateDevNPC((n) => ({ ...n, targetX: pp.x, targetZ: pp.z }));
        setNearby({
          id: devNPC.id,
          kind: devNPC.kind,
          x: devNPC.x,
          z: devNPC.z,
          cx: 0,
          cz: 0,
        });
      }

      // Bob animation
      devGroupRef.current.position.y = sampledHeight(devNPC.x, devNPC.z) + Math.sin(t * 2) * 0.03;
    }

    void dialogOpenFor;
  });

  return (
    <>
      <group ref={groupRef}>
        {npcs.map((n) => (
          <group key={n.id} position={[n.x, n.y, n.z]} rotation={[0, n.rot, 0]}>
            <NPCModel kind={n.kind} />
          </group>
        ))}
      </group>
      {/* Dev mode spawned NPC that walks toward player */}
      {devNPC && (
        <group ref={devGroupRef} position={[devNPC.x, sampledHeight(devNPC.x, devNPC.z), devNPC.z]}>
          <NPCModel kind={devNPC.kind} />
        </group>
      )}
    </>
  );
}
