'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  name: string;
  tagline: string;
  accent: string;
  height: number; // world Y anchor (head top)
}

/**
 * Floating pill with NPC name. Implemented as a CanvasTexture sprite so it
 * keeps a consistent pixel size regardless of distance and always faces the
 * camera. Fades in between 5 and 18 meters; pops bigger when very close.
 */
export function NPCNameplate({ name, tagline, accent, height }: Props) {
  const sprite = useRef<THREE.Sprite>(null);
  const mat = useRef<THREE.SpriteMaterial>(null);
  const camera = useThree((s) => s.camera);

  const { texture, aspect } = useMemo(() => {
    const w = 512;
    const h = 128;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    // Pill background
    const r = 36;
    ctx.beginPath();
    ctx.moveTo(r, 4);
    ctx.arcTo(w - 4, 4, w - 4, h - 4, r);
    ctx.arcTo(w - 4, h - 4, 4, h - 4, r);
    ctx.arcTo(4, h - 4, 4, 4, r);
    ctx.arcTo(4, 4, w - 4, 4, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,22,16,0.78)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.stroke();
    // Name
    ctx.fillStyle = accent;
    ctx.font = '700 46px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2, h * 0.38);
    // Tagline
    ctx.fillStyle = 'rgba(232,240,224,0.78)';
    ctx.font = '400 italic 26px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(tagline, w / 2, h * 0.74);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return { texture: tex, aspect: w / h };
  }, [name, tagline, accent]);

  useFrame(() => {
    if (!sprite.current || !mat.current) return;
    // Compute distance from camera to this sprite in world space.
    const world = sprite.current.getWorldPosition(new THREE.Vector3());
    const d = camera.position.distanceTo(world);
    // Fade in from 14m, fully visible <= 6m, hide >18m, pop a bit when close.
    let alpha = 0;
    if (d < 6) alpha = 1;
    else if (d < 14) alpha = 1 - (d - 6) / 8;
    else if (d < 18) alpha = Math.max(0, 1 - (d - 14) / 4) * 0.4;
    mat.current.opacity = alpha;
    // Scale keeps text readable at distance.
    const s = THREE.MathUtils.clamp(0.7 + d * 0.035, 0.8, 1.55);
    sprite.current.scale.set(s * aspect * 0.28, s * 0.28, 1);
  });

  return (
    <sprite ref={sprite} position={[0, height, 0]}>
      <spriteMaterial
        ref={mat}
        map={texture}
        transparent
        depthWrite={false}
        depthTest={false}
      />
    </sprite>
  );
}
