'use client';
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampledHeight } from '@/lib/noise';
import { world, WATER_LEVEL } from '@/lib/world';

export interface PlayerState {
  position: THREE.Vector3;
  velocityY: number;
  onGround: boolean;
}

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 6;
const SPRINT_SPEED = 11;
const GRAVITY = 22;
const JUMP_V = 8;

// ── Swim constants ─────────────────────────────────────────────────────
// Player considered in water when terrain under them is below this line.
const WATER_ENTRY = WATER_LEVEL - 0.15;
// Eye height above water surface while swimming (head half-out of water).
const SWIM_EYE_OFFSET = 0.35;
// Movement multiplier while swimming — sluggish strokes.
const SWIM_SPEED_MUL = 0.45;
// Smoothed buoyancy descent so wading into a pond feels gradual, not snapped.
const BUOY_FOLLOW = 6;

export function Player({ playerRef }: { playerRef: React.MutableRefObject<PlayerState> }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05);
    const k = keys.current;
    const state = playerRef.current;

    // Camera-relative movement directions (horizontal).
    camera.getWorldDirection(forward.current);
    forward.current.y = 0; forward.current.normalize();
    right.current.set(forward.current.z, 0, -forward.current.x);

    move.current.set(0, 0, 0);
    if (k['KeyW'] || k['ArrowUp']) move.current.add(forward.current);
    if (k['KeyS'] || k['ArrowDown']) move.current.sub(forward.current);
    if (k['KeyD'] || k['ArrowRight']) move.current.sub(right.current);
    if (k['KeyA'] || k['ArrowLeft']) move.current.add(right.current);

    // Probe terrain once per frame — reused for swim detection and gravity.
    const terrainY = sampledHeight(state.position.x, state.position.z);
    const inWater = terrainY < WATER_ENTRY;
    world.inWater = inWater;

    const baseSpeed = k['ShiftLeft'] || k['ShiftRight'] ? SPRINT_SPEED : WALK_SPEED;
    const speed = baseSpeed * (inWater ? SWIM_SPEED_MUL : 1);
    if (move.current.lengthSq() > 0) move.current.normalize().multiplyScalar(speed * dt);

    state.position.x += move.current.x;
    state.position.z += move.current.z;
    // Publish horizontal speed (units/s) for calm meter.
    const dxyz = Math.sqrt(move.current.x * move.current.x + move.current.z * move.current.z);
    world.playerSpeed = dt > 0 ? dxyz / dt : 0;

    if (inWater) {
      // Float on the surface: head stays a bit above the water line.
      // Smooth transition from "walking down a slope" to "floating".
      const targetY = WATER_LEVEL + SWIM_EYE_OFFSET;
      const follow = 1 - Math.exp(-BUOY_FOLLOW * dt);
      state.position.y += (targetY - state.position.y) * follow;
      state.velocityY = 0;
      state.onGround = false;
      // Space while swimming = small dolphin kick upward (feels responsive).
      if (k['Space']) state.position.y += 0.08;
    } else {
      // Gravity + ground collision with terrain.
      const groundY = terrainY + EYE_HEIGHT;
      state.velocityY -= GRAVITY * dt;
      state.position.y += state.velocityY * dt;

      if (state.position.y <= groundY) {
        state.position.y = groundY;
        state.velocityY = 0;
        state.onGround = true;
        if (k['Space']) state.velocityY = JUMP_V;
      } else {
        state.onGround = false;
      }
    }

    // Only drive the camera once the user has taken control (pointer locked).
    // Before that, IntroCamera in Forest.tsx keeps a scenic menu view.
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      camera.position.copy(state.position);
    }
  });

  return null;
}
