'use client';
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_SIZE, hash2, sampledHeight, TERRAIN_TYPE } from '@/lib/noise';
import { WATER_LEVEL } from '@/lib/world';
import { NPCKind, kindForChunk, useNPC, getTerrainAdaptedProfile } from '@/lib/npc';
import { NPCAnimState, createAnimState } from '@/lib/npcAnim';
import { PlayerState } from './Player';
import { VIEW_RADIUS } from './Forest';
import { NPCModel } from './NPCModel';
import { NPCNameplate } from './NPCNameplate';
import { NPCAura } from './NPCAura';

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
const WANDER_RADIUS = 8; // meters around anchor
const WANDER_SPEED = 0.55; // m/s

/** Runtime state kept across React renders, keyed by NPC id. */
interface NPCRuntime {
  animRef: React.MutableRefObject<NPCAnimState>;
  // live position (may drift around anchor during wander)
  x: number;
  z: number;
  rotY: number;
  // wander bookkeeping
  targetX: number;
  targetZ: number;
  pauseUntil: number; // elapsedTime threshold
  // cached profile bits for nameplate (to avoid recompute)
  name: string;
  tagline: string;
  accent: string;
  headY: number;
}

const HEAD_Y_BY_KIND: Record<NPCKind, number> = {
  wanderer: 1.95,
  herbalist: 1.78,
  ranger: 2.1,
  lakeSeeker: 2.0,
  poet: 2.18,
  hunter: 2.1,
  hermit: 1.7,
  storyteller: 2.08,
};

/** Animated per-NPC wrapper so it can own its own group/animRef. */
function NPCEntity({
  instance,
  runtime,
}: {
  instance: NPCInstance;
  runtime: NPCRuntime;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    const y = sampledHeight(runtime.x, runtime.z);
    // Tiny idle bob only when not moving.
    const bob = runtime.animRef.current.moving < 0.1
      ? Math.sin(runtime.animRef.current.time * 1.1) * 0.03
      : 0;
    groupRef.current.position.set(runtime.x, y + bob, runtime.z);
    groupRef.current.rotation.y = runtime.rotY;
  });
  return (
    <group ref={groupRef}>
      <NPCModel kind={instance.kind} animRef={runtime.animRef} />
      <NPCAura kind={instance.kind} animRef={runtime.animRef} />
      <NPCNameplate
        name={runtime.name}
        tagline={runtime.tagline}
        accent={runtime.accent}
        height={runtime.headY + 0.35}
      />
    </group>
  );
}

export function NPCs({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const [center, setCenter] = useState<[number, number]>([0, 0]);
  const devGroupRef = useRef<THREE.Group>(null);
  const devAnimRef = useRef<NPCAnimState>(createAnimState());

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

  // Persistent runtime map keyed by id, survives re-renders.
  const runtime = useRef<Map<string, NPCRuntime>>(new Map());
  // Ensure every current NPC has a runtime entry; drop stale ones.
  const liveIds = new Set(npcs.map((n) => n.id));
  for (const [id] of runtime.current) {
    if (!liveIds.has(id)) runtime.current.delete(id);
  }
  for (const n of npcs) {
    if (!runtime.current.has(n.id)) {
      const profile = getTerrainAdaptedProfile(n.kind);
      runtime.current.set(n.id, {
        animRef: { current: createAnimState() },
        x: n.x,
        z: n.z,
        rotY: n.rot,
        targetX: n.x,
        targetZ: n.z,
        pauseUntil: 0,
        name: profile.name,
        tagline: profile.tagline,
        accent: profile.accent,
        headY: HEAD_Y_BY_KIND[n.kind] ?? 1.9,
      });
    }
  }

  const setNearby = useNPC((s) => s.setNearby);
  const dialogOpenFor = useNPC((s) => s.dialogOpenFor);
  const devNPC = useNPC((s) => s.devNPC);
  const updateDevNPC = useNPC((s) => s.updateDevNPC);
  const devNPCInitialized = useRef(false);

  useFrame((state) => {
    const dt = Math.min(0.08, state.clock.getDelta());
    const t = state.clock.elapsedTime;
    const pp = playerRef.current.position;
    const cx = Math.floor(pp.x / CHUNK_SIZE);
    const cz = Math.floor(pp.z / CHUNK_SIZE);
    if (cx !== center[0] || cz !== center[1]) setCenter([cx, cz]);

    // Initialize devNPC position on first spawn
    const needsInit = devNPC && devNPC.x === 0 && devNPC.z === 0 && !devNPCInitialized.current;
    if (needsInit) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = 8 + Math.random() * 7;
      const spawnX = pp.x + Math.sin(spawnAngle) * spawnDist;
      const spawnZ = pp.z + Math.cos(spawnAngle) * spawnDist;
      updateDevNPC((n) => ({ ...n, x: spawnX, z: spawnZ, targetX: pp.x, targetZ: pp.z }));
      devNPCInitialized.current = true;
    }
    if (!devNPC && devNPCInitialized.current) devNPCInitialized.current = false;

    // Per-NPC update: wander + animation + pick closest for dialog
    let closest: NPCInstance | null = null;
    let closestDist = NEARBY_RADIUS;
    for (const n of npcs) {
      const r = runtime.current.get(n.id);
      if (!r) continue;
      const dxPlayer = pp.x - r.x;
      const dzPlayer = pp.z - r.z;
      const distPlayer = Math.hypot(dxPlayer, dzPlayer);
      if (distPlayer < closestDist) {
        closestDist = distPlayer;
        closest = n;
      }

      // Presence: 0 far, 1 very close
      const presence = THREE.MathUtils.clamp(1 - distPlayer / 8, 0, 1);
      r.animRef.current.presence = presence;
      r.animRef.current.time = t;

      // If player is very close, freeze wander and turn to face player.
      if (distPlayer < 4.5) {
        r.animRef.current.moving = Math.max(0, r.animRef.current.moving - dt * 2.2);
        const targetRot = Math.atan2(dxPlayer, dzPlayer);
        // Shortest-angle lerp
        const diff = Math.atan2(
          Math.sin(targetRot - r.rotY),
          Math.cos(targetRot - r.rotY),
        );
        r.rotY += diff * Math.min(1, dt * 4);
        r.pauseUntil = t + 1.2; // pause wander a bit after player leaves
        // idle gesture: occasional slow head look
        r.animRef.current.gesture += (0.3 - r.animRef.current.gesture) * dt * 1.5;
      } else if (t < r.pauseUntil) {
        // paused
        r.animRef.current.moving = Math.max(0, r.animRef.current.moving - dt * 2);
        r.animRef.current.gesture *= Math.max(0, 1 - dt * 1.2);
      } else {
        // Wander toward target
        const dxT = r.targetX - r.x;
        const dzT = r.targetZ - r.z;
        const dT = Math.hypot(dxT, dzT);
        if (dT < 0.4) {
          // arrived — pick new target within WANDER_RADIUS of anchor (n.x/n.z)
          const a = Math.random() * Math.PI * 2;
          const rad = 2 + Math.random() * WANDER_RADIUS;
          r.targetX = n.x + Math.cos(a) * rad;
          r.targetZ = n.z + Math.sin(a) * rad;
          r.pauseUntil = t + 2.5 + Math.random() * 5;
          r.animRef.current.gestureId = Math.floor(Math.random() * 4);
          r.animRef.current.moving = 0;
        } else {
          // move
          const step = WANDER_SPEED * dt;
          const nx = r.x + (dxT / dT) * step;
          const nz = r.z + (dzT / dT) * step;
          r.x = nx;
          r.z = nz;
          // face movement direction
          const targetRot = Math.atan2(dxT, dzT);
          const diff = Math.atan2(
            Math.sin(targetRot - r.rotY),
            Math.cos(targetRot - r.rotY),
          );
          r.rotY += diff * Math.min(1, dt * 3);
          r.animRef.current.moving = Math.min(1, r.animRef.current.moving + dt * 2.5);
        }
      }
      // Advance walk phase scaled by moving
      r.animRef.current.phase += dt * (5.5 * r.animRef.current.moving + 0.3);
    }

    setNearby(
      closest
        ? {
            id: closest.id,
            kind: closest.kind,
            x: runtime.current.get(closest.id)!.x,
            z: runtime.current.get(closest.id)!.z,
            cx: closest.cx,
            cz: closest.cz,
          }
        : null,
    );

    // Handle dev NPC - walks toward the player
    if (devNPC && devGroupRef.current) {
      const dx = pp.x - devNPC.x;
      const dz = pp.z - devNPC.z;
      const dist = Math.hypot(dx, dz);
      const ny = sampledHeight(devNPC.x, devNPC.z);
      devGroupRef.current.position.set(devNPC.x, ny, devNPC.z);
      if (dist > 0.5) {
        const moveDist = Math.min(devNPC.speed * dt, dist);
        const nx = devNPC.x + (dx / dist) * moveDist;
        const nz = devNPC.z + (dz / dist) * moveDist;
        const nny = sampledHeight(nx, nz);
        updateDevNPC((n) => ({ ...n, x: nx, z: nz, targetX: pp.x, targetZ: pp.z }));
        devGroupRef.current.position.set(nx, nny, nz);
        devGroupRef.current.rotation.y = Math.atan2(dx, dz);
        devAnimRef.current.moving = Math.min(1, devAnimRef.current.moving + dt * 2.5);
      } else {
        updateDevNPC((n) => ({ ...n, targetX: pp.x, targetZ: pp.z }));
        setNearby({ id: devNPC.id, kind: devNPC.kind, x: devNPC.x, z: devNPC.z, cx: 0, cz: 0 });
        devAnimRef.current.moving = Math.max(0, devAnimRef.current.moving - dt * 2.2);
      }
      devAnimRef.current.phase += dt * (5.5 * devAnimRef.current.moving + 0.3);
      devAnimRef.current.time = t;
      devAnimRef.current.presence = 1;
    }

    void dialogOpenFor;
  });

  return (
    <>
      {npcs.map((n) => {
        const r = runtime.current.get(n.id);
        if (!r) return null;
        return <NPCEntity key={n.id} instance={n} runtime={r} />;
      })}
      {devNPC && (
        <group ref={devGroupRef} position={[devNPC.x, sampledHeight(devNPC.x, devNPC.z), devNPC.z]}>
          <NPCModel kind={devNPC.kind} animRef={devAnimRef} />
          <NPCAura kind={devNPC.kind} animRef={devAnimRef} />
        </group>
      )}
    </>
  );
}
