/**
 * Shared animation state for NPC models. Parent (NPCs.tsx) updates a mutable
 * ref per-instance each frame; NPCModel reads from it inside its own useFrame
 * to drive walk/gesture/idle without causing React re-renders.
 */
export interface NPCAnimState {
  /** Continuous walk phase in radians (increments when moving). */
  phase: number;
  /** 0..1 weight of the walk cycle (0 = idle, 1 = full stride). */
  moving: number;
  /** Current gesture amplitude 0..1 (raises hand, tilts head, etc). */
  gesture: number;
  /** Integer id of the active idle gesture (0..3). */
  gestureId: number;
  /** 0..1 closeness of the player (1 when in dialog range). Drives aura/halo. */
  presence: number;
  /** Global time in seconds (for unsynced anims like aura). */
  time: number;
}

export function createAnimState(): NPCAnimState {
  return { phase: Math.random() * Math.PI * 2, moving: 0, gesture: 0, gestureId: 0, presence: 0, time: 0 };
}

/** Deterministic wander anchor offset inside a chunk. */
export function pickWanderTarget(
  anchorX: number,
  anchorZ: number,
  radius = 7,
): [number, number] {
  const a = Math.random() * Math.PI * 2;
  const r = radius * (0.3 + Math.random() * 0.7);
  return [anchorX + Math.cos(a) * r, anchorZ + Math.sin(a) * r];
}
