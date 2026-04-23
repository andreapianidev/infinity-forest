'use client';
import { useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, hash2, forestDensity, sampledHeight, CHUNK_SIZE, TERRAIN_RES, TERRAIN_TYPE, isRiver, getRiverDepth } from '@/lib/noise';
import { PlayerState } from './Player';
import { useGame, PlantKind, plantAvailable } from '@/lib/store';
import { world, WATER_LEVEL, nearWater, Season } from '@/lib/world';

// ─────────── Terrain ───────────

// Seasonal terrain colors - distinct palettes for each season
const SEASONAL_TERRAIN_COLORS: Record<Season, { grassA: string; grassB: string; grassDry: string; dirt: string; sand: string; rock: string }> = {
  spring: { grassA: '#6abf4a', grassB: '#4a8f32', grassDry: '#8ac460', dirt: '#6a5a38', sand: '#d4c890', rock: '#7a7a72' },
  summer: { grassA: '#5a9f30', grassB: '#3a6f20', grassDry: '#a0a840', dirt: '#5a4a28', sand: '#c9b882', rock: '#72726a' },
  autumn: { grassA: '#8a9a3a', grassB: '#6a5a28', grassDry: '#c8a040', dirt: '#5a4a2a', sand: '#c4b078', rock: '#7a726a' },
  winter: { grassA: '#4a5a40', grassB: '#3a4a35', grassDry: '#5a6a50', dirt: '#4a5045', sand: '#b8c0c0', rock: '#6a7068' },
};

function buildTerrainGeometry(cx: number, cz: number, season: Season = 'spring'): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, TERRAIN_RES, TERRAIN_RES);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  
  // Volcanic terrain uses black/ash colors instead of green
  const isVolcanic = TERRAIN_TYPE === 'volcanic';
  const isWinter = season === 'winter';
  const isAutumn = season === 'autumn';
  const isSummer = season === 'summer';
  const isSpring = season === 'spring';
  
  // Get seasonal colors (or volcanic override)
  const seasonal = SEASONAL_TERRAIN_COLORS[isVolcanic ? 'winter' : season];
  const grassA = new THREE.Color(isVolcanic ? '#2a2520' : seasonal.grassA);
  const grassB = new THREE.Color(isVolcanic ? '#1a1815' : seasonal.grassB);
  const grassDry = new THREE.Color(isVolcanic ? '#3a3530' : seasonal.grassDry);
  const dirt = new THREE.Color(isVolcanic ? '#4a4035' : seasonal.dirt);
  const sand = new THREE.Color(isVolcanic ? '#5a5048' : seasonal.sand);
  const rock = new THREE.Color(isVolcanic ? '#3a3530' : seasonal.rock);
  const snow = new THREE.Color('#e8eef0');
  const frozen = new THREE.Color('#c8d8e0'); // Ice/frozen ground color
  
  // Snow accumulation factor (0-1) from world state
  const snowAccum = isWinter ? 0.3 : world.snowAccumulation * 0.7;
  
  const ox = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const oz = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const z = pos.getZ(i) + oz;
    const y = heightAt(x, z);
    pos.setY(i, y);
    const vari = hash2(Math.floor(x * 2), Math.floor(z * 2), 7);
    const dry = hash2(Math.floor(x * 0.5), Math.floor(z * 0.5), 19);
    const c = grassA.clone().lerp(grassB, vari);
    c.lerp(grassDry, dry * 0.2);
    
    // Shore sand (dark ash for volcanic)
    if (y < WATER_LEVEL + 0.6) c.lerp(sand, THREE.MathUtils.clamp((WATER_LEVEL + 0.6 - y) / 0.7, 0, 1));
    
    // Rock on heights (more prominent in volcanic)
    if (y > 3 || isVolcanic) c.lerp(rock, THREE.MathUtils.clamp((y - 3) / (isVolcanic ? 1.5 : 3), 0, isVolcanic ? 0.9 : 1));
    
    // Snow on high peaks - more aggressive in winter
    const snowStart = isWinter ? 3.5 : 5.5;
    if (isWinter && y > snowStart) {
      c.lerp(snow, THREE.MathUtils.clamp((y - snowStart) / (isWinter ? 2.5 : 1.5), 0, 1));
    }
    
    // Snow accumulation on ground in winter or after snowfall
    if (snowAccum > 0 && y > WATER_LEVEL + 1) {
      const accumNoise = hash2(Math.floor(x), Math.floor(z), 43);
      // Snow collects in depressions, less on steep areas (simplified)
      const accumFactor = snowAccum * (0.6 + accumNoise * 0.4);
      c.lerp(snow, accumFactor * 0.7);
    }
    
    // Winter: frozen ground effect on lower areas
    if (isWinter && y < 3 && y > WATER_LEVEL) {
      c.lerp(frozen, 0.25);
    }
    
    // Autumn: more dry grass patches
    if (isAutumn) {
      const autumnDry = hash2(Math.floor(x), Math.floor(z), 67);
      c.lerp(new THREE.Color('#b89840'), autumnDry * 0.4); // Golden-brown patches
    }
    
    // Spring: fresh green boost
    if (isSpring) {
      c.lerp(new THREE.Color('#7acf5a'), 0.15); // Brighter green
    }
    
    // Summer: some parched areas
    if (isSummer) {
      const parched = hash2(Math.floor(x * 0.3), Math.floor(z * 0.3), 71);
      c.lerp(new THREE.Color('#9a8a30'), parched * 0.15); // Dry patches
    }
    
    // Volcanic: add extra ash/cinder variation
    if (isVolcanic) {
      const ash = hash2(Math.floor(x), Math.floor(z), 31);
      c.lerp(new THREE.Color(ash > 0.7 ? '#1a1510' : '#2a2018'), ash * 0.3);
    }
    c.lerp(dirt, vari * 0.15);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
}

// ─────────── River water surface generator ───────────

/** Build river water mesh for riverlands terrain - purely procedural. */
function buildRiverGeometry(cx: number, cz: number): THREE.BufferGeometry | null {
  if (TERRAIN_TYPE !== 'riverlands') return null;
  
  const points: number[] = [];
  const indices: number[] = [];
  
  const step = 2; // Sample every 2 meters
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  
  // Sample grid to find river points
  const gridPoints: { x: number; z: number; y: number }[][] = [];
  
  for (let gz = 0; gz <= CHUNK_SIZE; gz += step) {
    const row: { x: number; z: number; y: number }[] = [];
    for (let gx = 0; gx <= CHUNK_SIZE; gx += step) {
      const wx = ox + gx;
      const wz = oz + gz;
      
      // Check if this point is in a river
      if (isRiver(wx, wz)) {
        const depth = getRiverDepth(wx, wz);
        // Water surface slightly below terrain
        const waterY = Math.max(-1.5, -Math.abs(depth) * 0.8);
        row.push({ x: gx - CHUNK_SIZE / 2, z: gz - CHUNK_SIZE / 2, y: waterY });
      } else {
        row.push({ x: gx - CHUNK_SIZE / 2, z: gz - CHUNK_SIZE / 2, y: NaN }); // Not in river
      }
    }
    gridPoints.push(row);
  }
  
  // Create triangles from valid river points
  const cols = gridPoints[0]?.length ?? 0;
  const rows = gridPoints.length;
  
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const p00 = gridPoints[r][c];
      const p10 = gridPoints[r][c + 1];
      const p01 = gridPoints[r + 1][c];
      const p11 = gridPoints[r + 1][c + 1];
      
      // Check if all points are valid (in river)
      if (!isNaN(p00.y) && !isNaN(p10.y) && !isNaN(p01.y) && !isNaN(p11.y)) {
        const baseIdx = points.length / 3;
        
        // Add vertices
        points.push(p00.x, p00.y, p00.z);
        points.push(p10.x, p10.y, p10.z);
        points.push(p01.x, p01.y, p01.z);
        points.push(p11.x, p11.y, p11.z);
        
        // Two triangles
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
        indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
      }
    }
  }
  
  if (points.length === 0) return null;
  
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ─────────── Wind shader helper ───────────

/** Registry of wind-shader materials so a single top-level tick can update them all. */
export const WIND_MATERIALS: THREE.MeshStandardMaterial[] = [];

function foliageMat(color: string, opts: { roughness?: number; doubleSide?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: 0,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: 1 };
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 iPos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float sway = smoothstep(0.3, 6.0, transformed.y) * 0.4 * uWind;
          transformed.x += sin(uTime*1.2 + iPos.z*0.3 + iPos.x*0.2) * sway;
          transformed.z += cos(uTime*0.9 + iPos.x*0.25) * sway * 0.7;
        #else
          float sway2 = smoothstep(0.3, 6.0, transformed.y) * 0.25 * uWind;
          transformed.x += sin(uTime*1.2 + position.z*0.5) * sway2;
        #endif`,
      );
    (m.userData as any).shader = shader;
  };
  WIND_MATERIALS.push(m);
  return m;
}

/**
 * Bake per-vertex AO/gradient on a tree canopy geometry.
 *  - Vertical gradient: top bright, bottom dark → volume readability
 *  - Outer-radius rim slightly brighter → edges catch light like real canopies
 * Cost: one extra `color` attribute; zero draw-call overhead.
 * Combined at render-time by MeshStandardMaterial's vertexColors with the
 * base color AND per-instance color jitter.
 */
function bakeFoliageAO(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const yMin = bb.min.y;
  const yMax = bb.max.y;
  const yRange = Math.max(0.001, yMax - yMin);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const yn = (y - yMin) / yRange;
    const rad = Math.hypot(x, z);
    const radN = Math.min(1, rad / 2.0);
    // Cubic-ease vertical: keeps underside in shadow, top punchy.
    const vert = 0.5 + 0.5 * (yn * yn * (3 - 2 * yn));
    const rim = 0.9 + 0.12 * radN;
    const v = Math.min(1, vert * rim);
    colors[3 * i] = v;
    colors[3 * i + 1] = v;
    colors[3 * i + 2] = v;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

/**
 * Foliage material dedicated to TREE canopies (not grass/bush/etc).
 * Extends `foliageMat` with:
 *  - vertexColors → reads bakeFoliageAO gradient
 *  - uSunDir / uSunColor uniforms (updated in Forest.tsx WorldTick loop)
 *  - Translucent subsurface backlight when sun is behind the leaf
 *  - Fresnel rim for volume against fog/sky
 *  - Worldspace hue noise to kill uniform green shading
 *  - Subtle per-vertex flutter on top of the sway
 * Compatible with per-instance `instanceColor` jitter (multiplied in).
 */
function treeFoliageMat(color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    vertexColors: true,
    side: THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: 1 };
    shader.uniforms.uSunDir = { value: new THREE.Vector3(0.5, 0.8, 0.5) };
    shader.uniforms.uSunColor = { value: new THREE.Color('#fff0c8') };
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nvarying vec3 vWorldPosFol;\nvarying vec3 vWorldNormalFol;\n' +
      shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 iPosF = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
            float swayF = smoothstep(0.3, 6.0, transformed.y) * 0.4 * uWind;
            transformed.x += sin(uTime*1.2 + iPosF.z*0.3 + iPosF.x*0.2) * swayF;
            transformed.z += cos(uTime*0.9 + iPosF.x*0.25) * swayF * 0.7;
            // leaf flutter — tiny high-frequency wobble
            transformed.y += sin(uTime*2.6 + iPosF.x*0.5 + transformed.x*1.1) * swayF * 0.08;
          #else
            float swayF2 = smoothstep(0.3, 6.0, transformed.y) * 0.25 * uWind;
            transformed.x += sin(uTime*1.2 + position.z*0.5) * swayF2;
          #endif`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vWorldPosFol = worldPosition.xyz;
          vWorldNormalFol = normalize(mat3(modelMatrix) * objectNormal);`,
        );
    shader.fragmentShader =
      'uniform vec3 uSunDir;\nuniform vec3 uSunColor;\nvarying vec3 vWorldPosFol;\nvarying vec3 vWorldNormalFol;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vDirW = normalize(cameraPosition - vWorldPosFol);
          vec3 sunW = normalize(uSunDir);
          // Subsurface: sun behind leaf + viewer roughly aligned with sun direction
          float back = clamp(dot(-vWorldNormalFol, sunW), 0.0, 1.0);
          float wrap = pow(clamp(dot(vDirW, -sunW), 0.0, 1.0), 2.0);
          totalEmissiveRadiance += uSunColor * diffuseColor.rgb * back * wrap * 0.55;
          // Fresnel rim highlight for canopy volume
          float rim = pow(1.0 - clamp(dot(vDirW, vWorldNormalFol), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uSunColor * rim * 0.10;
          // Worldspace hue noise breaks flat green
          vec2 hcell = floor(vWorldPosFol.xz * 0.4);
          float hn = fract(sin(dot(hcell, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= 0.86 + hn * 0.28;
        }`,
      );
    (m.userData as any).shader = shader;
  };
  WIND_MATERIALS.push(m);
  return m;
}

/**
 * Procedural bark material: vertical striations + faint rings via local-space
 * trigonometric noise. Darkens crevices without any texture lookup.
 */
function barkMat(color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vLocalPosBk;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocalPosBk = position;',
      );
    shader.fragmentShader =
      'varying vec3 vLocalPosBk;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ang = atan(vLocalPosBk.z, vLocalPosBk.x);
        float stripe = sin(ang * 22.0 + vLocalPosBk.y * 1.8) * 0.5 + 0.5;
        float ring = sin(vLocalPosBk.y * 5.0) * 0.5 + 0.5;
        float bark = mix(stripe, ring, 0.35);
        diffuseColor.rgb *= (1.0 - bark * 0.38);
        diffuseColor.rgb += vec3(0.04, 0.025, 0.012) * (1.0 - bark) * 0.6;`,
      );
  };
  return m;
}

/**
 * Birch-specific bark: characteristic horizontal dark scars on pale bark,
 * broken by angular noise so scars don't form continuous rings.
 */
function birchBarkMat(color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vLocalPosBk;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocalPosBk = position;',
      );
    shader.fragmentShader =
      'varying vec3 vLocalPosBk;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float band = fract(vLocalPosBk.y * 1.1);
        float scar = smoothstep(0.42, 0.5, band) - smoothstep(0.5, 0.58, band);
        float ang = atan(vLocalPosBk.z, vLocalPosBk.x);
        float n = fract(sin(floor(vLocalPosBk.y * 1.1) * 43.3 + ang * 9.1) * 311.7);
        scar *= step(0.35, n);
        diffuseColor.rgb *= (1.0 - scar * 0.78);`,
      );
  };
  return m;
}

// ─────────── Shared geometries / materials ───────────

// Slightly tapered trunk, a touch thicker at base for better silhouette.
// Base trunk 4.2m to reach foliage of all tree types (was 3.6m, still had gaps for birch/maple)
const trunkGeom = new THREE.CylinderGeometry(0.16, 0.45, 4.2, 10);
trunkGeom.translate(0, 2.1, 0);

// Birch needs even taller trunk (foliage starts at ~3.8m)
const birchTrunkGeom = new THREE.CylinderGeometry(0.14, 0.35, 4.8, 10);
birchTrunkGeom.translate(0, 2.4, 0);

// Maple needs taller trunk (foliage starts at ~3.6m)
const mapleTrunkGeom = new THREE.CylinderGeometry(0.15, 0.4, 4.5, 10);
mapleTrunkGeom.translate(0, 2.25, 0);

/**
 * Layered conifer canopy — 3 cones stacked with decreasing radius,
 * giving a Christmas-tree silhouette instead of a flat cone.
 */
const coniferGeom = (() => {
  const g1 = new THREE.ConeGeometry(2.0, 2.4, 10); g1.translate(0, 3.2, 0);
  const g2 = new THREE.ConeGeometry(1.55, 2.1, 10); g2.translate(0, 4.4, 0);
  const g3 = new THREE.ConeGeometry(1.05, 1.9, 10); g3.translate(0, 5.6, 0);
  const merged = mergeGeometries([g1, g2, g3]);
  return bakeFoliageAO(merged ?? g1);
})();

/**
 * Broadleaf canopy — cluster of 4 overlapping icosahedra at slightly
 * offset positions/sizes for an organic, lumpy crown.
 */
const broadleafGeom = (() => {
  const lobes = [
    { r: 1.7, pos: new THREE.Vector3(0.0, 4.1, 0.0) },
    { r: 1.3, pos: new THREE.Vector3(0.9, 4.5, 0.3) },
    { r: 1.3, pos: new THREE.Vector3(-0.7, 4.5, 0.6) },
    { r: 1.2, pos: new THREE.Vector3(0.2, 5.0, -0.7) },
  ];
  const parts = lobes.map(({ r, pos }) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(pos.x, pos.y, pos.z);
    return g;
  });
  const merged = mergeGeometries(parts);
  return bakeFoliageAO(merged ?? parts[0]);
})();

/**
 * Birch — slender, lighter canopy with drooping shape.
 */
const birchGeom = (() => {
  const lobes = [
    { r: 1.2, pos: new THREE.Vector3(0.0, 4.6, 0.0) },
    { r: 1.0, pos: new THREE.Vector3(0.5, 4.2, 0.2) },
    { r: 1.0, pos: new THREE.Vector3(-0.4, 4.3, 0.4) },
    { r: 0.85, pos: new THREE.Vector3(0.1, 3.8, -0.4) },
  ];
  const parts = lobes.map(({ r, pos }) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(pos.x, pos.y, pos.z);
    return g;
  });
  const merged = mergeGeometries(parts);
  return bakeFoliageAO(merged ?? parts[0]);
})();

/**
 * Oak — massive, very wide canopy with irregular shape.
 */
const oakGeom = (() => {
  const lobes = [
    { r: 2.2, pos: new THREE.Vector3(0.0, 4.0, 0.0) },
    { r: 1.8, pos: new THREE.Vector3(1.4, 4.2, 0.4) },
    { r: 1.9, pos: new THREE.Vector3(-1.2, 3.9, 0.5) },
    { r: 1.6, pos: new THREE.Vector3(0.3, 4.6, -1.0) },
    { r: 1.5, pos: new THREE.Vector3(0.8, 3.7, 1.1) },
    { r: 1.4, pos: new THREE.Vector3(-0.6, 3.8, -0.8) },
  ];
  const parts = lobes.map(({ r, pos }) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(pos.x, pos.y, pos.z);
    return g;
  });
  const merged = mergeGeometries(parts);
  return bakeFoliageAO(merged ?? parts[0]);
})();

/**
 * Maple — rounded, dense canopy, slightly smaller, autumn colors.
 */
const mapleGeom = (() => {
  const lobes = [
    { r: 1.6, pos: new THREE.Vector3(0.0, 4.0, 0.0) },
    { r: 1.3, pos: new THREE.Vector3(0.8, 4.3, 0.2) },
    { r: 1.25, pos: new THREE.Vector3(-0.7, 4.2, 0.5) },
    { r: 1.1, pos: new THREE.Vector3(0.2, 4.7, -0.6) },
  ];
  const parts = lobes.map(({ r, pos }) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(pos.x, pos.y, pos.z);
    return g;
  });
  const merged = mergeGeometries(parts);
  return bakeFoliageAO(merged ?? parts[0]);
})();

const trunkMat = barkMat('#5a3a22');
const birchTrunkMat = birchBarkMat('#d8d0c8'); // white bark with dark scars
const oakTrunkMat = barkMat('#4a3020'); // darker, thicker

// Seasonal foliage colors - each tree type has variants for each season
const SEASONAL_FOLIAGE_COLORS: Record<Season, { conifer: string; broadleaf: string; birch: string; oak: string; maple: string }> = {
  // Spring: bright fresh greens, light birch yellows, fresh oak
  spring: { conifer: '#2d7a3a', broadleaf: '#6aba40', birch: '#a0d070', oak: '#5a8a38', maple: '#d09040' },
  // Summer: deep rich greens
  summer: { conifer: '#1e5a25', broadleaf: '#4a8a28', birch: '#7ab050', oak: '#3d6a28', maple: '#a06020' },
  // Autumn: warm oranges, reds, golden yellows
  autumn: { conifer: '#2d5a35', broadleaf: '#8a6a20', birch: '#d8a030', oak: '#8a5a20', maple: '#e85018' },
  // Winter: muted dark greens, grays (evergreens keep some color)
  winter: { conifer: '#1e3a25', broadleaf: '#3a4a30', birch: '#5a6a50', oak: '#3a4a35', maple: '#4a4035' },
};

// Terrain modifiers - adjust base colors per terrain type
const TERRAIN_FOLIAGE_MODIFIERS: Record<string, { conifer: number; broadleaf: number; birch: number; oak: number; maple: number }> = {
  flat: { conifer: 0, broadleaf: 0, birch: 0, oak: 0, maple: 0 },
  hilly: { conifer: -0.05, broadleaf: -0.03, birch: -0.05, oak: -0.03, maple: -0.05 },
  mountainous: { conifer: -0.08, broadleaf: -0.06, birch: -0.08, oak: -0.05, maple: -0.08 },
  volcanic: { conifer: 0.15, broadleaf: 0.12, birch: 0.15, oak: 0.12, maple: 0.15 }, // Darker/muted
  riverlands: { conifer: 0, broadleaf: 0.02, birch: 0, oak: 0, maple: 0 },
};

/** Get foliage colors for current season and terrain */
function getSeasonalFoliageColors(season: Season = 'spring') {
  const seasonal = SEASONAL_FOLIAGE_COLORS[season];
  const mods = TERRAIN_FOLIAGE_MODIFIERS[TERRAIN_TYPE] ?? TERRAIN_FOLIAGE_MODIFIERS.flat;
  
  // Helper to darken/lighten color
  const adjustColor = (hex: string, amount: number) => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    hsl.l = Math.max(0.05, Math.min(0.95, hsl.l + amount));
    return '#' + new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l).getHexString();
  };
  
  return {
    conifer: adjustColor(seasonal.conifer, mods.conifer),
    broadleaf: adjustColor(seasonal.broadleaf, mods.broadleaf),
    birch: adjustColor(seasonal.birch, mods.birch),
    oak: adjustColor(seasonal.oak, mods.oak),
    maple: adjustColor(seasonal.maple, mods.maple),
  };
}

// Create materials with initial colors
const colors = getSeasonalFoliageColors('spring');
// Tree canopies use the richer tree-specific shader (subsurface, fresnel,
// vertex-AO, hue noise). Bushes/grass/ferns/reeds keep the cheaper foliageMat.
export const coniferMat = treeFoliageMat(colors.conifer);
export const broadleafMat = treeFoliageMat(colors.broadleaf);
export const birchMat = treeFoliageMat(colors.birch);
export const oakMat = treeFoliageMat(colors.oak);
export const mapleMat = treeFoliageMat(colors.maple);

/** Update foliage materials to match current season - call from WorldTick */
export function updateFoliageSeason(season: Season) {
  // Update tree foliage
  const newColors = getSeasonalFoliageColors(season);
  coniferMat.color.set(newColors.conifer);
  broadleafMat.color.set(newColors.broadleaf);
  birchMat.color.set(newColors.birch);
  oakMat.color.set(newColors.oak);
  mapleMat.color.set(newColors.maple);
  
  // Update undergrowth (skip for volcanic terrain - keeps dark ash colors)
  if (TERRAIN_TYPE !== 'volcanic') {
    const undergrowth = SEASONAL_UNDERGROWTH[season];
    grassMat.color.set(undergrowth.grassBase);
    grassMatLight.color.set(undergrowth.grassLight);
    grassMatDark.color.set(undergrowth.grassDark);
    grassMatGolden.color.set(undergrowth.grassGolden);
    bushMat.color.set(undergrowth.bush);
    berryBushMat.color.set(undergrowth.berry);
    fernMat.color.set(undergrowth.fern);
  }
}

// Decor: boulders / logs / stumps / bushes / grass / reeds / berry bushes
const boulderGeom = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = 0.8 + ((Math.sin(i * 1.3) + Math.cos(i * 0.7)) * 0.15);
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * (f * 0.9), p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
})();
const boulderMat = new THREE.MeshStandardMaterial({ color: '#7a7a72', roughness: 0.95, flatShading: true });
const mossyBoulderMat = new THREE.MeshStandardMaterial({ color: '#5a6a44', roughness: 1, flatShading: true });

const logGeom = (() => {
  const g = new THREE.CylinderGeometry(0.28, 0.3, 3.2, 10);
  g.rotateZ(Math.PI / 2);
  return g;
})();
const logMat = new THREE.MeshStandardMaterial({ color: '#4e3a22', roughness: 1 });

const stumpGeom = (() => {
  const g = new THREE.CylinderGeometry(0.45, 0.55, 0.7, 10);
  g.translate(0, 0.35, 0);
  return g;
})();
const stumpMat = new THREE.MeshStandardMaterial({ color: '#6a4a28', roughness: 1 });
const stumpTopMat = new THREE.MeshStandardMaterial({ color: '#a08868', roughness: 1 });

// Seasonal undergrowth colors (grass, bushes, ferns)
const SEASONAL_UNDERGROWTH: Record<Season, { grassBase: string; grassLight: string; grassDark: string; grassGolden: string; bush: string; berry: string; fern: string }> = {
  spring: { grassBase: '#7abf4a', grassLight: '#9adf70', grassDark: '#5a9f30', grassGolden: '#b0c858', bush: '#4a8a3a', berry: '#5a9a42', fern: '#4a9a50' },
  summer: { grassBase: '#5a9f30', grassLight: '#7abf50', grassDark: '#3d7f20', grassGolden: '#a0a848', bush: '#2d5a25', berry: '#3d6a32', fern: '#2d6a35' },
  autumn: { grassBase: '#8a9a3a', grassLight: '#aaba58', grassDark: '#6a7a28', grassGolden: '#c8a030', bush: '#5a4a25', berry: '#6a5a35', fern: '#4a5a30' },
  winter: { grassBase: '#4a5a40', grassLight: '#5a6a50', grassDark: '#3a4a35', grassGolden: '#5a6a48', bush: '#3a4a35', berry: '#4a5a42', fern: '#3a4a40' },
};

const bushGeom = new THREE.IcosahedronGeometry(0.55, 1);
// Initial colors (will be updated by season)
const initialUndergrowth = SEASONAL_UNDERGROWTH['spring'];
const bushMat = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#252018' : initialUndergrowth.bush);
const berryBushMat = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#201815' : initialUndergrowth.berry);

const grassBladeGeom = (() => {
  const g = new THREE.ConeGeometry(0.035, 0.55, 3, 1, true);
  g.translate(0, 0.275, 0);
  return g;
})();
// Grass materials - exported for seasonal updates
export const grassMat = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#3a3028' : initialUndergrowth.grassBase, { doubleSide: true });
export const grassMatLight = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#4a4035' : initialUndergrowth.grassLight, { doubleSide: true });
export const grassMatDark = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#2a2018' : initialUndergrowth.grassDark, { doubleSide: true });
export const grassMatGolden = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#353028' : initialUndergrowth.grassGolden, { doubleSide: true });

// ──────────── Ferns ────────────
// Low spreading fronds for forest floor variety
const fernGeom = (() => {
  // Central point with radiating fronds
  const base = new THREE.SphereGeometry(0.03, 5, 4);
  base.scale(1, 0.5, 1);
  const frond1 = new THREE.ConeGeometry(0.04, 0.25, 3, 1, true);
  frond1.rotateX(Math.PI / 3);
  frond1.translate(0, 0.1, 0.12);
  const frond2 = frond1.clone(); frond2.rotateY(2 * Math.PI / 3);
  const frond3 = frond1.clone(); frond3.rotateY(4 * Math.PI / 3);
  const merged = mergeGeometries([base, frond1, frond2, frond3]);
  return merged ?? base;
})();
export const fernMat = foliageMat(TERRAIN_TYPE === 'volcanic' ? '#252818' : initialUndergrowth.fern, { doubleSide: true });

// ──────────── Wildflowers (decorative carpet) ────────────
// A single merged geometry: tiny stem + flat petal disc. The whole mesh is
// tinted per-instance via `instanceColor`, so 1 draw call per chunk yields
// a colourful meadow layer at minimal cost.
const wildflowerGeom = (() => {
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.18, 4);
  stem.translate(0, 0.09, 0);
  // Flat "petal" disc — low-poly sphere squashed vertically.
  const head = new THREE.SphereGeometry(0.07, 7, 4);
  head.scale(1, 0.32, 1);
  head.translate(0, 0.2, 0);
  // Small golden center
  const center = new THREE.SphereGeometry(0.02, 6, 4);
  center.translate(0, 0.22, 0);
  const merged = mergeGeometries([stem, head, center]);
  return merged ?? stem;
})();
// Base color is white so per-instance tint shows the target hue cleanly.
const wildflowerMat = new THREE.MeshStandardMaterial({
  color: '#ffffff', roughness: 0.9, emissive: '#000000',
});

const WILDFLOWER_PALETTE: THREE.Color[] = [
  new THREE.Color('#f0c850'), // yellow
  new THREE.Color('#f07090'), // pink
  new THREE.Color('#ffffff'), // white
  new THREE.Color('#ff7040'), // orange
  new THREE.Color('#a070e0'), // violet
  new THREE.Color('#e0e850'), // lime-yellow
  new THREE.Color('#c850a0'), // magenta
  new THREE.Color('#5aa0e0'), // bluebell
  new THREE.Color('#d05040'), // red poppy
  new THREE.Color('#80c040'), // green-white
  new THREE.Color('#f080c0'), // deep pink
  new THREE.Color('#60a0f0'), // cornflower
  new THREE.Color('#f0a030'), // marigold
  new THREE.Color('#b870d0'), // lilac
];

// ──────────── Bell Flowers (bluebell type) ────────────
// Hanging bell-shaped flowers that droop from the stem
const bellFlowerGeom = (() => {
  const stem = new THREE.CylinderGeometry(0.01, 0.014, 0.22, 4);
  stem.translate(0, 0.11, 0);
  // Bell shape - inverted cone with rounded bottom
  const bell = new THREE.ConeGeometry(0.06, 0.12, 7, 1, true);
  bell.translate(0, 0.22, 0);
  bell.rotateX(Math.PI); // hang down
  // Small opening at bottom
  const opening = new THREE.CircleGeometry(0.04, 6);
  opening.rotateX(-Math.PI / 2);
  opening.translate(0, 0.16, 0);
  const merged = mergeGeometries([stem, bell, opening]);
  return merged ?? stem;
})();
const bellFlowerMat = new THREE.MeshStandardMaterial({
  color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide,
});

// ──────────── Tall Flowers (daisy/sunflower type) ────────────
// Tall stem with large central disc and radiating petals
const tallFlowerGeom = (() => {
  const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.35, 5);
  stem.translate(0, 0.175, 0);
  // Central disc
  const disc = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, 0.38, 0);
  // Petals as flat boxes radiating
  const petal1 = new THREE.BoxGeometry(0.04, 0.12, 0.01);
  petal1.translate(0, 0.45, 0);
  const petal2 = petal1.clone(); petal2.rotateY(Math.PI / 4);
  const petal3 = petal1.clone(); petal3.rotateY(Math.PI / 2);
  const petal4 = petal1.clone(); petal4.rotateY(3 * Math.PI / 4);
  const merged = mergeGeometries([stem, disc, petal1, petal2, petal3, petal4]);
  return merged ?? stem;
})();
const tallFlowerMat = new THREE.MeshStandardMaterial({
  color: '#fffacd', roughness: 0.8, emissive: '#000000',
});

// ──────────── Lavender / Spike Flowers ────────────
// Thin stem with elongated cluster of tiny flower spheres
const lavenderGeom = (() => {
  const stem = new THREE.CylinderGeometry(0.008, 0.012, 0.28, 4);
  stem.translate(0, 0.14, 0);
  // Spike of tiny spheres
  const spike = new THREE.CapsuleGeometry(0.025, 0.12, 4, 8);
  spike.translate(0, 0.32, 0);
  const merged = mergeGeometries([stem, spike]);
  return merged ?? stem;
})();
const lavenderMat = new THREE.MeshStandardMaterial({
  color: '#d8d8ff', roughness: 0.9,
});

// ──────────── Clover Patches ────────────
// Low ground cover with characteristic three-leaf clusters
const cloverGeom = (() => {
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.08, 4);
  stem.translate(0, 0.04, 0);
  // Three leaves in cluster
  const leaf1 = new THREE.SphereGeometry(0.05, 5, 4);
  leaf1.scale(1, 0.3, 0.6);
  leaf1.translate(0, 0.08, 0.04);
  const leaf2 = leaf1.clone(); leaf2.rotateY(2 * Math.PI / 3);
  const leaf3 = leaf1.clone(); leaf3.rotateY(4 * Math.PI / 3);
  const merged = mergeGeometries([stem, leaf1, leaf2, leaf3]);
  return merged ?? stem;
})();
const cloverMat = new THREE.MeshStandardMaterial({
  color: '#90c060', roughness: 0.95, emissive: '#000000',
});

// ──────────── Pebbles (tiny ground detail) ────────────
const pebbleGeom = (() => {
  const g = new THREE.IcosahedronGeometry(0.12, 0);
  // Slight deformation → irregular look.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = 0.85 + Math.sin(i * 2.3) * 0.15;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.6, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
})();
const pebbleMat = new THREE.MeshStandardMaterial({
  color: '#8a8680', roughness: 1, flatShading: true,
});

// River water material - flowing, slightly translucent
const riverWaterMat = new THREE.MeshStandardMaterial({
  color: '#4a7a9a',
  roughness: 0.3,
  metalness: 0.1,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
});

const reedGeom = (() => {
  const g = new THREE.CylinderGeometry(0.02, 0.04, 1.4, 5);
  g.translate(0, 0.7, 0);
  return g;
})();
const reedMat = foliageMat('#8a9a3a', { doubleSide: true });
const cattailGeom = (() => {
  const g = new THREE.CylinderGeometry(0.07, 0.07, 0.25, 6);
  g.translate(0, 1.35, 0);
  return g;
})();
const cattailMat = new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 1 });

// ─────────── Tree placement ───────────

type TreeKind = 0 | 1 | 2 | 3 | 4;
// 0 = conifer, 1 = broadleaf, 2 = birch, 3 = oak, 4 = maple
interface TreeInstance { x: number; z: number; y: number; scale: number; rot: number; kind: TreeKind; }

/**
 * Tree placement per chunk.
 *
 * Targets a forest density that is:
 *  - Consistently wooded (never bare plains) → safety-net floor.
 *  - Walkable at ground level → ~4-6m between neighbours.
 *  - Gently varying (dense groves ↔ airier glades) not sharp rings.
 *  - Safe around the spawn origin (no tree inside the player).
 */
const MIN_TREES_PER_CHUNK = 24; // walkable density floor
const SPAWN_CLEAR_RADIUS = 8.5; // no trees inside this ring around (0,0)
function treesForChunk(cx: number, cz: number): TreeInstance[] {
  const out: TreeInstance[] = [];
  const N = 11;
  const cell = CHUNK_SIZE / N;
  const fallback: TreeInstance[] = [];

  // Only the chunk containing origin needs the spawn-clearing check.
  const chunkHasOrigin = cx === 0 && cz === 0;

  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const jx = hash2(cx * N + gx, cz * N + gz, 13);
    const jz = hash2(cx * N + gx, cz * N + gz, 17);
    const x = cx * CHUNK_SIZE + (gx + jx) * cell;
    const z = cz * CHUNK_SIZE + (gz + jz) * cell;
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.5) continue;
    if (y > 20) continue;
    // Keep spawn origin clear so the player never materialises inside a
    // tree trunk on first enter.
    if (chunkHasOrigin && Math.hypot(x, z) < SPAWN_CLEAR_RADIUS) continue;

    const scale = 0.9 + hash2(cx * N + gx, cz * N + gz, 23) * 1.4;
    const rot = hash2(cx * N + gx, cz * N + gz, 29) * Math.PI * 2;
    const h = hash2(cx * N + gx, cz * N + gz, 31);
    const yNorm = THREE.MathUtils.clamp((y - 1) / 4, 0, 1);
    // Tree type selection based on height and noise:
    // Low elevations: more broadleaf (1), birch (2), maple (4)
    // Higher elevations: more conifer (0), oak (3)
    let kind: TreeKind;
    if (h < 0.18) {
      kind = 0; // conifer (18%)
    } else if (h < 0.42) {
      kind = 1; // broadleaf (24%)
    } else if (h < 0.58) {
      kind = 2; // birch (16%) - likes mid-elevations
    } else if (h < 0.78) {
      kind = 3; // oak (20%) - large, scattered
    } else {
      kind = 4; // maple (22%) - autumn touch
    }
    // Slight height-based bias: conifers and oaks prefer higher ground
    if (yNorm > 0.6 && h < 0.3) kind = 0; // high ground → conifer
    if (yNorm > 0.5 && h > 0.6 && h < 0.85) kind = 3; // mid-high → oak
    const inst: TreeInstance = { x, z, y, scale, rot, kind };

    // Keep the forest visually continuous: high baseline with only mild local variation.
    const density = 0.16 + forestDensity(x, z) * 0.2;
    const r1 = hash2(cx * N + gx, cz * N + gz, 11);
    if (r1 <= density) {
      out.push(inst);
    } else {
      fallback.push(inst);
    }
  }

  // Safety net: unlucky noise slice → top up from fallback pool.
  if (out.length < MIN_TREES_PER_CHUNK && fallback.length > 0) {
    const need = Math.min(fallback.length, MIN_TREES_PER_CHUNK - out.length);
    const step = fallback.length / need;
    for (let k = 0; k < need; k++) out.push(fallback[Math.floor(k * step)]);
  }
  return out;
}

// ─────────── Decor placement ───────────

interface DecorInstance { x: number; z: number; y: number; scale: number; rot: number; variant: number; }

function boulderPlacements(cx: number, cz: number): DecorInstance[] {
  const out: DecorInstance[] = [];
  const N = 8;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 101);
    if (r > 0.18) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 103);
    const jz = hash2(cx * N + gx, cz * N + gz, 107);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.05) continue;
    const scale = 0.35 + hash2(cx * N + gx, cz * N + gz, 109) * 1.8;
    const rot = hash2(cx * N + gx, cz * N + gz, 113) * Math.PI * 2;
    const variant = hash2(cx * N + gx, cz * N + gz, 117) < 0.3 ? 1 : 0; // 1 = mossy
    out.push({ x, z, y, scale, rot, variant });
  }
  return out;
}

function logPlacements(cx: number, cz: number): DecorInstance[] {
  const out: DecorInstance[] = [];
  const N = 4;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 131);
    if (r > 0.14) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 133);
    const jz = hash2(cx * N + gx, cz * N + gz, 137);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.3) continue;
    if (y > 4.5) continue;
    const scale = 0.8 + hash2(cx * N + gx, cz * N + gz, 139) * 0.6;
    const rot = hash2(cx * N + gx, cz * N + gz, 141) * Math.PI * 2;
    out.push({ x, z, y, scale, rot, variant: 0 });
  }
  return out;
}

function stumpPlacements(cx: number, cz: number): DecorInstance[] {
  const out: DecorInstance[] = [];
  const N = 5;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 151);
    if (r > 0.08) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 153);
    const jz = hash2(cx * N + gx, cz * N + gz, 157);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.25) continue;
    const scale = 0.7 + hash2(cx * N + gx, cz * N + gz, 161) * 0.6;
    const rot = hash2(cx * N + gx, cz * N + gz, 163) * Math.PI * 2;
    out.push({ x, z, y, scale, rot, variant: 0 });
  }
  return out;
}

interface BushInstance extends DecorInstance { hasBerry: boolean; id: string; }
function bushPlacements(cx: number, cz: number): BushInstance[] {
  const out: BushInstance[] = [];
  const N = 7;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 181);
    if (r > 0.16) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 183);
    const jz = hash2(cx * N + gx, cz * N + gz, 187);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.2) continue;
    if (y > 4.5) continue;
    const scale = 0.7 + hash2(cx * N + gx, cz * N + gz, 189) * 0.9;
    const rot = hash2(cx * N + gx, cz * N + gz, 191) * Math.PI * 2;
    const hasBerry = hash2(cx * N + gx, cz * N + gz, 193) < 0.35;
    out.push({ x, z, y, scale, rot, variant: 0, hasBerry, id: `berry:${cx},${cz}:${i}` });
  }
  return out;
}

function grassPlacements(cx: number, cz: number): { x: number; z: number; y: number; scale: number; rot: number }[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number }[] = [];
  const N = 16;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 211);
    if (r > 0.55) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 213);
    const jz = hash2(cx * N + gx, cz * N + gz, 217);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.15) continue;
    if (y > 5) continue;
    const scale = 0.6 + hash2(cx * N + gx, cz * N + gz, 219) * 1.2;
    const rot = hash2(cx * N + gx, cz * N + gz, 221) * Math.PI * 2;
    out.push({ x, z, y, scale, rot });
  }
  return out;
}

/**
 * Wildflower placements — dense decorative carpet.
 * Each item carries a `colorIdx` into WILDFLOWER_PALETTE so meadows read
 * as multi-coloured fields, not monochrome swatches.
 */
function wildflowerPlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number; colorIdx: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number; colorIdx: number }[] = [];
  const N = 18;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 311);
    if (r > 0.35) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 313);
    const jz = hash2(cx * N + gx, cz * N + gz, 317);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.25) continue;
    if (y > 5) continue;
    const scale = 0.7 + hash2(cx * N + gx, cz * N + gz, 319) * 0.9;
    const rot = hash2(cx * N + gx, cz * N + gz, 321) * Math.PI * 2;
    const colorIdx = Math.floor(hash2(cx * N + gx, cz * N + gz, 323) * WILDFLOWER_PALETTE.length);
    out.push({ x, z, y, scale, rot, colorIdx });
  }
  return out;
}

// ─────────── New diverse flower placements ───────────

/** Bell flowers (bluebells) — prefer shadier spots, taller grass areas */
function bellFlowerPlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number; colorIdx: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number; colorIdx: number }[] = [];
  const N = 14;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 411);
    if (r > 0.55) continue; // sparser than wildflowers
    const jx = hash2(cx * N + gx, cz * N + gz, 413);
    const jz = hash2(cx * N + gx, cz * N + gz, 417);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.3) continue;
    if (y > 4) continue; // prefer lower, shadier areas
    const scale = 0.8 + hash2(cx * N + gx, cz * N + gz, 419) * 0.6;
    const rot = hash2(cx * N + gx, cz * N + gz, 421) * Math.PI * 2;
    // Bell flowers: blue, purple, white
    const colorIdx = Math.floor(hash2(cx * N + gx, cz * N + gz, 423) * 4) + 7; // indices 7-10
    out.push({ x, z, y, scale, rot, colorIdx: Math.min(colorIdx, 13) });
  }
  return out;
}

/** Tall flowers (daisies, sunflowers) — stand above the grass */
function tallFlowerPlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number; colorIdx: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number; colorIdx: number }[] = [];
  const N = 12;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 511);
    if (r > 0.45) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 513);
    const jz = hash2(cx * N + gx, cz * N + gz, 517);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.3) continue;
    if (y > 4.5) continue; // open meadow areas
    const scale = 0.9 + hash2(cx * N + gx, cz * N + gz, 519) * 0.7;
    const rot = hash2(cx * N + gx, cz * N + gz, 521) * Math.PI * 2;
    // Tall flowers: yellows, whites, oranges
    const colorIdx = Math.floor(hash2(cx * N + gx, cz * N + gz, 523) * 5);
    out.push({ x, z, y, scale, rot, colorIdx: Math.min(colorIdx, 4) });
  }
  return out;
}

/** Lavender / spike flowers — prefer drier, sunnier spots */
function lavenderPlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number }[] = [];
  const N = 13;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 611);
    if (r > 0.5) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 613);
    const jz = hash2(cx * N + gx, cz * N + gz, 617);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.4) continue;
    if (y > 5) continue;
    const scale = 0.75 + hash2(cx * N + gx, cz * N + gz, 619) * 0.8;
    const rot = hash2(cx * N + gx, cz * N + gz, 621) * Math.PI * 2;
    out.push({ x, z, y, scale, rot });
  }
  return out;
}

/** Clover patches — low ground cover, likes moist areas */
function cloverPlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number }[] = [];
  const N = 20; // dense carpet
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 711);
    if (r > 0.6) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 713);
    const jz = hash2(cx * N + gx, cz * N + gz, 717);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.2) continue;
    if (y > 4) continue;
    const scale = 0.5 + hash2(cx * N + gx, cz * N + gz, 719) * 0.7;
    const rot = hash2(cx * N + gx, cz * N + gz, 721) * Math.PI * 2;
    out.push({ x, z, y, scale, rot });
  }
  return out;
}

/** Ferns — shady forest floor, prefer moist areas near water */
function fernPlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number }[] = [];
  const N = 15;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 811);
    if (r > 0.65) continue; // fairly sparse
    const jx = hash2(cx * N + gx, cz * N + gz, 813);
    const jz = hash2(cx * N + gx, cz * N + gz, 817);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    // Ferns like moisture but not standing water
    if (y < WATER_LEVEL + 0.25) continue;
    if (y > 4.5) continue; // forest floor
    const scale = 0.7 + hash2(cx * N + gx, cz * N + gz, 819) * 1.0;
    const rot = hash2(cx * N + gx, cz * N + gz, 821) * Math.PI * 2;
    out.push({ x, z, y, scale, rot });
  }
  return out;
}

/** Small pebbles scattered on dry ground — tiny visual detail. */
function pebblePlacements(cx: number, cz: number): {
  x: number; z: number; y: number; scale: number; rot: number;
}[] {
  const out: { x: number; z: number; y: number; scale: number; rot: number }[] = [];
  const N = 12;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 331);
    if (r > 0.22) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 333);
    const jz = hash2(cx * N + gx, cz * N + gz, 337);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL + 0.1) continue;
    if (y > 5.5) continue;
    const scale = 0.5 + hash2(cx * N + gx, cz * N + gz, 339) * 1.4;
    const rot = hash2(cx * N + gx, cz * N + gz, 341) * Math.PI * 2;
    out.push({ x, z, y, scale, rot });
  }
  return out;
}

function reedPlacements(cx: number, cz: number): DecorInstance[] {
  const out: DecorInstance[] = [];
  const N = 10;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const jx = hash2(cx * N + gx, cz * N + gz, 241);
    const jz = hash2(cx * N + gx, cz * N + gz, 243);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    // Only at shore: just above water surface
    if (y < WATER_LEVEL - 0.3 || y > WATER_LEVEL + 0.25) continue;
    const r = hash2(cx * N + gx, cz * N + gz, 247);
    if (r > 0.45) continue;
    const scale = 0.7 + hash2(cx * N + gx, cz * N + gz, 249) * 0.8;
    const rot = hash2(cx * N + gx, cz * N + gz, 251) * Math.PI * 2;
    const variant = hash2(cx * N + gx, cz * N + gz, 253) < 0.2 ? 1 : 0; // 1 = cattail
    out.push({ x, z, y: Math.max(y, WATER_LEVEL), scale, rot, variant });
  }
  return out;
}

// ─────────── Plants (collectibles) ───────────

interface PlantInstance { id: string; kind: PlantKind; x: number; z: number; y: number; colorSeed: number; }

const LAND_KINDS: PlantKind[] = ['fern', 'mushroom', 'flower', 'herb', 'moonbloom', 'dewcup'];

function plantsForChunk(cx: number, cz: number): PlantInstance[] {
  const out: PlantInstance[] = [];
  const N = 10;
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gz = Math.floor(i / N);
    const r = hash2(cx * N + gx, cz * N + gz, 41);
    if (r > 0.36) continue;
    const jx = hash2(cx * N + gx, cz * N + gz, 43);
    const jz = hash2(cx * N + gx, cz * N + gz, 47);
    const x = cx * CHUNK_SIZE + (gx + jx) * (CHUNK_SIZE / N);
    const z = cz * CHUNK_SIZE + (gz + jz) * (CHUNK_SIZE / N);
    const y = sampledHeight(x, z);
    if (y < WATER_LEVEL - 1.5) { /* deep water: only waterlily */ }
    const sub = y < WATER_LEVEL;
    const colorSeed = hash2(cx * N + gx, cz * N + gz, 59);
    let kind: PlantKind;
    if (sub) {
      kind = 'waterlily';
    } else {
      const k = hash2(cx * N + gx, cz * N + gz, 53);
      kind = LAND_KINDS[Math.floor(k * LAND_KINDS.length)];
    }
    out.push({ id: `${cx},${cz}:${i}`, kind, x, z, y, colorSeed });
  }
  return out;
}

// ─────────── Nicer plant meshes ───────────

const FLOWER_COLORS = ['#f0c850', '#f07090', '#d050a0', '#ffffff', '#ff7040', '#a070e0'];

function Flower({ seed }: { seed: number }) {
  const color = FLOWER_COLORS[Math.floor(seed * FLOWER_COLORS.length)];
  const petals = 5 + Math.floor(seed * 3);
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.36, 5]} />
        <meshStandardMaterial color="#3a6a28" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0.08, 0.12, 0]} rotation={[0, 0, -0.5]}>
        <sphereGeometry args={[0.1, 6, 4]} />
        <meshStandardMaterial color="#3a6a28" />
      </mesh>
      {/* Petals */}
      {Array.from({ length: petals }).map((_, i) => {
        const a = (i / petals) * Math.PI * 2;
        const px = Math.cos(a) * 0.11;
        const pz = Math.sin(a) * 0.11;
        return (
          <mesh key={i} position={[px, 0.36, pz]} rotation={[-Math.PI / 2.5, 0, -a]} castShadow>
            <sphereGeometry args={[0.08, 6, 4]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {/* Center */}
      <mesh position={[0, 0.37, 0]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#f9e060" emissive="#806030" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function Moonbloom() {
  const petals = 6;
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 5]} />
        <meshStandardMaterial color="#2a3a4a" />
      </mesh>
      {Array.from({ length: petals }).map((_, i) => {
        const a = (i / petals) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.1, 0.42, Math.sin(a) * 0.1]} rotation={[-Math.PI / 3, 0, -a]} castShadow>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color="#e8ecff" emissive="#6a80d0" emissiveIntensity={1.4} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#b0c8ff" emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Fern() {
  return (
    <group>
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.08, 0.28, Math.sin(a) * 0.08]} rotation={[-0.4, -a, 0]} castShadow>
            <coneGeometry args={[0.16, 0.7, 4]} />
            <meshStandardMaterial color="#3d7a2a" roughness={1} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

function Mushroom({ seed }: { seed: number }) {
  const capColor = seed < 0.4 ? '#b83a2a' : seed < 0.7 ? '#c8a055' : '#5a3a28';
  return (
    <group>
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.24, 8]} />
        <meshStandardMaterial color="#efe3c8" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={capColor} roughness={0.8} />
      </mesh>
      {/* Dots on cap */}
      {seed < 0.4 && Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.14, 0.38, Math.sin(a) * 0.14]}>
            <sphereGeometry args={[0.035, 6, 5]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        );
      })}
    </group>
  );
}

function Herb() {
  return (
    <group>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.09, 0.16, Math.sin(a) * 0.09]} rotation={[0.2, -a, 0]} castShadow>
            <sphereGeometry args={[0.12, 6, 5]} />
            <meshStandardMaterial color="#7abf6a" />
          </mesh>
        );
      })}
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color="#a0d090" />
      </mesh>
    </group>
  );
}

function Waterlily() {
  return (
    <group>
      {/* Pad */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.55, 14]} />
        <meshStandardMaterial color="#2d5a3a" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Flower */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.09 + 0.1, 0.1, Math.sin(a) * 0.09 + 0.1]} rotation={[-Math.PI / 2.2, 0, -a]} castShadow>
            <sphereGeometry args={[0.09, 6, 4]} />
            <meshStandardMaterial color="#f7d8e4" emissive="#805060" emissiveIntensity={0.12} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      <mesh position={[0.1, 0.12, 0.1]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#ffec80" emissive="#806030" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Dewcup() {
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.12, 0.07, 0.16, 8, 1, true]} />
        <meshStandardMaterial color="#8aa0a8" side={THREE.DoubleSide} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color="#cfe8ff" transparent opacity={0.75} roughness={0.05} metalness={0.3} emissive="#a0c8ff" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function PlantMesh({ kind, seed }: { kind: PlantKind; seed: number }) {
  switch (kind) {
    case 'flower': return <Flower seed={seed} />;
    case 'moonbloom': return <Moonbloom />;
    case 'fern': return <Fern />;
    case 'mushroom': return <Mushroom seed={seed} />;
    case 'herb': return <Herb />;
    case 'waterlily': return <Waterlily />;
    case 'dewcup': return <Dewcup />;
    case 'berry': return null; // Handled via BerryBush component
  }
}

/**
 * Stateless plant renderer: no useFrame here (the parent Chunk consolidates
 * per-frame updates into a single callback). Exposes its group via ref so
 * the parent can animate position/visibility.
 */
const Plant = forwardRef<THREE.Group, { p: PlantInstance }>(function Plant({ p }, ref) {
  const baseY = p.kind === 'waterlily' ? WATER_LEVEL : p.y;
  return (
    <group ref={ref} position={[p.x, baseY + 0.05, p.z]}>
      <PlantMesh kind={p.kind} seed={p.colorSeed} />
    </group>
  );
});

/** Stateless bush with separate berries group that the parent toggles. */
const Bush = forwardRef<{ root: THREE.Group; berries: THREE.Group }, { b: BushInstance }>(
  function Bush({ b }, ref) {
    const root = useRef<THREE.Group>(null);
    const berries = useRef<THREE.Group>(null);
    useImperativeHandle(ref, () => ({
      get root() { return root.current!; },
      get berries() { return berries.current!; },
    }));
    return (
      <group ref={root} position={[b.x, b.y, b.z]} scale={b.scale} rotation={[0, b.rot, 0]}>
        <mesh castShadow position={[0, 0.45, 0]}><primitive object={bushGeom} /><primitive object={berryBushMat} attach="material" /></mesh>
        <mesh castShadow position={[0.35, 0.35, 0.1]}><sphereGeometry args={[0.38, 10, 8]} /><meshStandardMaterial color={TERRAIN_TYPE === 'volcanic' ? '#252018' : '#3a6a2a'} roughness={1} /></mesh>
        <mesh castShadow position={[-0.3, 0.4, -0.1]}><sphereGeometry args={[0.42, 10, 8]} /><meshStandardMaterial color={TERRAIN_TYPE === 'volcanic' ? '#201815' : '#446a32'} roughness={1} /></mesh>
        <group ref={berries} visible={false}>
          {b.hasBerry && Array.from({ length: 9 }).map((_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const rr = 0.3 + (i % 3) * 0.12;
            return (
              <mesh key={i} position={[Math.cos(a) * rr, 0.35 + (i % 3) * 0.12, Math.sin(a) * rr]}>
                <sphereGeometry args={[0.065, 8, 6]} />
                <meshStandardMaterial color="#a01830" emissive="#501020" emissiveIntensity={0.4} roughness={0.4} />
              </mesh>
            );
          })}
        </group>
      </group>
    );
  },
);

// ─────────── Chunk ───────────

function useInstancedFill(
  ref: React.MutableRefObject<THREE.InstancedMesh | null>,
  items: { x: number; z: number; y: number; scale: number; rot: number }[],
) {
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      p.set(t.x, t.y, t.z);
      e.set(0, t.rot, 0); q.setFromEuler(e);
      s.set(t.scale, t.scale, t.scale);
      m.compose(p, q, s);
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
    ref.current.computeBoundingBox();
    ref.current.frustumCulled = false;
  }, [items, ref]);
}

export function Chunk({ cx, cz, playerRef }: { cx: number; cz: number; playerRef: React.MutableRefObject<PlayerState> }) {
  const geom = useMemo(() => buildTerrainGeometry(cx, cz, world.season), [cx, cz, world.season]);
  const riverGeom = useMemo(() => buildRiverGeometry(cx, cz), [cx, cz]);
  const trees = useMemo(() => treesForChunk(cx, cz), [cx, cz]);
  const coniferTrees = useMemo(() => trees.filter((t) => t.kind === 0), [trees]);
  const broadTrees = useMemo(() => trees.filter((t) => t.kind === 1), [trees]);
  const birchTrees = useMemo(() => trees.filter((t) => t.kind === 2), [trees]);
  const oakTrees = useMemo(() => trees.filter((t) => t.kind === 3), [trees]);
  const mapleTrees = useMemo(() => trees.filter((t) => t.kind === 4), [trees]);
  const boulders = useMemo(() => boulderPlacements(cx, cz), [cx, cz]);
  const mossyBoulders = useMemo(() => boulders.filter((b) => b.variant === 1), [boulders]);
  const bareBoulders = useMemo(() => boulders.filter((b) => b.variant === 0), [boulders]);
  const logs = useMemo(() => logPlacements(cx, cz), [cx, cz]);
  const stumps = useMemo(() => stumpPlacements(cx, cz), [cx, cz]);
  const bushes = useMemo(() => bushPlacements(cx, cz), [cx, cz]);
  const grass = useMemo(() => grassPlacements(cx, cz), [cx, cz]);
  const reeds = useMemo(() => reedPlacements(cx, cz), [cx, cz]);
  const wildflowers = useMemo(() => wildflowerPlacements(cx, cz), [cx, cz]);
  // New diverse vegetation
  const bellFlowers = useMemo(() => bellFlowerPlacements(cx, cz), [cx, cz]);
  const tallFlowers = useMemo(() => tallFlowerPlacements(cx, cz), [cx, cz]);
  const lavenders = useMemo(() => lavenderPlacements(cx, cz), [cx, cz]);
  const clovers = useMemo(() => cloverPlacements(cx, cz), [cx, cz]);
  const ferns = useMemo(() => fernPlacements(cx, cz), [cx, cz]);
  const pebbles = useMemo(() => pebblePlacements(cx, cz), [cx, cz]);
  const plants = useMemo(() => plantsForChunk(cx, cz), [cx, cz]);

  const coniferTrunkRef = useRef<THREE.InstancedMesh>(null);
  const coniferFolRef = useRef<THREE.InstancedMesh>(null);
  const broadTrunkRef = useRef<THREE.InstancedMesh>(null);
  const broadFolRef = useRef<THREE.InstancedMesh>(null);
  const birchTrunkRef = useRef<THREE.InstancedMesh>(null);
  const birchFolRef = useRef<THREE.InstancedMesh>(null);
  const oakTrunkRef = useRef<THREE.InstancedMesh>(null);
  const oakFolRef = useRef<THREE.InstancedMesh>(null);
  const mapleTrunkRef = useRef<THREE.InstancedMesh>(null);
  const mapleFolRef = useRef<THREE.InstancedMesh>(null);
  const boulderRef = useRef<THREE.InstancedMesh>(null);
  const mossyBoulderRef = useRef<THREE.InstancedMesh>(null);
  const logRef = useRef<THREE.InstancedMesh>(null);
  const stumpRef = useRef<THREE.InstancedMesh>(null);
  const stumpTopRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const reedBareRef = useRef<THREE.InstancedMesh>(null);
  const reedCattailRef = useRef<THREE.InstancedMesh>(null);
  const wildflowerRef = useRef<THREE.InstancedMesh>(null);
  // New vegetation refs
  const bellFlowerRef = useRef<THREE.InstancedMesh>(null);
  const tallFlowerRef = useRef<THREE.InstancedMesh>(null);
  const lavenderRef = useRef<THREE.InstancedMesh>(null);
  const cloverRef = useRef<THREE.InstancedMesh>(null);
  const fernRef = useRef<THREE.InstancedMesh>(null);
  const pebbleRef = useRef<THREE.InstancedMesh>(null);

  // Fill all instanced meshes
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pp = new THREE.Vector3();
    const e = new THREE.Euler();
    const fill = (arr: { x: number; z: number; y: number; scale: number; rot: number }[], mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        pp.set(t.x, t.y, t.z);
        e.set(0, t.rot, 0); q.setFromEuler(e);
        s.set(t.scale, t.scale, t.scale);
        m.compose(pp, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.frustumCulled = false;
    };
    const fillPair = (arr: TreeInstance[], trunk: THREE.InstancedMesh | null, fol: THREE.InstancedMesh | null) => {
      fill(arr, trunk); fill(arr, fol);
    };
    fillPair(coniferTrees, coniferTrunkRef.current, coniferFolRef.current);
    fillPair(broadTrees, broadTrunkRef.current, broadFolRef.current);
    fillPair(birchTrees, birchTrunkRef.current, birchFolRef.current);
    fillPair(oakTrees, oakTrunkRef.current, oakFolRef.current);
    fillPair(mapleTrees, mapleTrunkRef.current, mapleFolRef.current);

    // Per-instance color jitter so every tree reads slightly unique
    // (hue ±4°, lightness ±9%). Multiplies with the material base color
    // via instanceColor × vertexColors in the standard shader.
    const jitterColor = new THREE.Color();
    const jitterBase = new THREE.Color(1, 1, 1);
    const applyJitter = (
      arr: TreeInstance[],
      meshes: (THREE.InstancedMesh | null)[],
      hueAmt: number,
      lightAmt: number,
    ) => {
      for (const mesh of meshes) {
        if (!mesh) continue;
        for (let i = 0; i < arr.length; i++) {
          const t = arr[i];
          const h = hash2(Math.floor(t.x * 7.3), Math.floor(t.z * 7.3), 41) - 0.5;
          const l = hash2(Math.floor(t.x * 7.3), Math.floor(t.z * 7.3), 43) - 0.5;
          jitterColor.copy(jitterBase).offsetHSL(h * hueAmt, 0, l * lightAmt);
          mesh.setColorAt(i, jitterColor);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    };
    applyJitter(coniferTrees, [coniferTrunkRef.current, coniferFolRef.current], 0.04, 0.18);
    applyJitter(broadTrees, [broadTrunkRef.current, broadFolRef.current], 0.06, 0.2);
    applyJitter(birchTrees, [birchTrunkRef.current, birchFolRef.current], 0.05, 0.16);
    applyJitter(oakTrees, [oakTrunkRef.current, oakFolRef.current], 0.05, 0.18);
    applyJitter(mapleTrees, [mapleTrunkRef.current, mapleFolRef.current], 0.08, 0.22);
    fill(bareBoulders, boulderRef.current);
    fill(mossyBoulders, mossyBoulderRef.current);
    fill(logs, logRef.current);
    fill(stumps, stumpRef.current);
    fill(stumps, stumpTopRef.current);
    fill(grass, grassRef.current);
    fill(reeds.filter((r) => r.variant === 0), reedBareRef.current);
    fill(reeds.filter((r) => r.variant === 1), reedCattailRef.current);
    fill(wildflowers, wildflowerRef.current);
    fill(bellFlowers, bellFlowerRef.current);
    fill(tallFlowers, tallFlowerRef.current);
    fill(lavenders, lavenderRef.current);
    fill(clovers, cloverRef.current);
    fill(ferns, fernRef.current);
    fill(pebbles, pebbleRef.current);
    // Apply per-instance tint to flowers so each one takes a palette colour.
    if (wildflowerRef.current) {
      for (let i = 0; i < wildflowers.length; i++) {
        const c = WILDFLOWER_PALETTE[wildflowers[i].colorIdx] ?? WILDFLOWER_PALETTE[0];
        wildflowerRef.current.setColorAt(i, c);
      }
      if (wildflowerRef.current.instanceColor) wildflowerRef.current.instanceColor.needsUpdate = true;
    }
    if (bellFlowerRef.current) {
      for (let i = 0; i < bellFlowers.length; i++) {
        const c = WILDFLOWER_PALETTE[bellFlowers[i].colorIdx] ?? WILDFLOWER_PALETTE[7];
        bellFlowerRef.current.setColorAt(i, c);
      }
      if (bellFlowerRef.current.instanceColor) bellFlowerRef.current.instanceColor.needsUpdate = true;
    }
    if (tallFlowerRef.current) {
      for (let i = 0; i < tallFlowers.length; i++) {
        const c = WILDFLOWER_PALETTE[tallFlowers[i].colorIdx] ?? WILDFLOWER_PALETTE[0];
        tallFlowerRef.current.setColorAt(i, c);
      }
      if (tallFlowerRef.current.instanceColor) tallFlowerRef.current.instanceColor.needsUpdate = true;
    }
  }, [coniferTrees, broadTrees, birchTrees, oakTrees, mapleTrees, bareBoulders, mossyBoulders, logs, stumps, grass, reeds, wildflowers, bellFlowers, tallFlowers, lavenders, clovers, ferns, pebbles]);

  // Refs for stateless Plant/Bush components — one useFrame drives them all.
  const plantGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const bushHandleRefs = useRef<({ root: THREE.Group; berries: THREE.Group } | null)[]>([]);
  const terrainMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useFrame(() => {
    const t = performance.now() * 0.001;
    const w = world.windStrength;
    const pp = playerRef.current.position;
    const nearbyId = useGame.getState().nearbyPlantId;
    const collected = useGame.getState().collected;
    const setNearby = useGame.getState().setNearby;

    // Plants — one pass, no proxy array allocations.
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      const g = plantGroupRefs.current[i];
      if (!g) continue;
      if (collected.has(p.id)) { g.visible = false; continue; }
      const avail = plantAvailable(p.kind, world.hour, world.weather, world.postRainT, nearWater(p.x, p.z));
      g.visible = avail;
      if (!avail) { if (nearbyId === p.id) setNearby(null, null); continue; }
      const dx = pp.x - p.x, dz = pp.z - p.z;
      const d2 = dx * dx + dz * dz;
      const isNear = d2 < 2.4 * 2.4;
      if (isNear && nearbyId !== p.id) setNearby(p.id, p.kind);
      else if (!isNear && nearbyId === p.id) setNearby(null, null);
      const baseY = p.kind === 'waterlily' ? WATER_LEVEL : p.y;
      g.position.y = baseY + 0.05 + Math.sin(t * 1.5 + p.x * 0.4) * 0.03;
      g.rotation.z = Math.sin(t * 1.2 + p.x * 0.3) * 0.08 * w;
      g.rotation.x = Math.cos(t * 0.9 + p.z * 0.3) * 0.05 * w;
    }

    // Bushes — toggle berries and handle proximity.
    const berriesAvail = plantAvailable('berry', world.hour, world.weather, world.postRainT, false);
    for (let i = 0; i < bushes.length; i++) {
      const b = bushes[i];
      const h = bushHandleRefs.current[i];
      if (!h || !h.root) continue;
      h.root.rotation.z = Math.sin(t * 0.8 + b.x * 0.2) * 0.04 * w;
      const alreadyCollected = collected.has(b.id);
      const canPick = !alreadyCollected && b.hasBerry && berriesAvail;
      if (h.berries) h.berries.visible = canPick;
      if (!canPick) { if (nearbyId === b.id) setNearby(null, null); continue; }
      const dx = pp.x - b.x, dz = pp.z - b.z;
      const d2 = dx * dx + dz * dz;
      const isNear = d2 < 2.4 * 2.4;
      if (isNear && nearbyId !== b.id) setNearby(b.id, 'berry');
      else if (!isNear && nearbyId === b.id) setNearby(null, null);
    }

    // Update snow accumulation and season uniforms on terrain material
    const terrainMat = terrainMatRef.current;
    if (terrainMat) {
      const shader = (terrainMat.userData as any).shader;
      if (shader) {
        // Use persistent snow accumulation (ground patches) instead of falling snow intensity
        if (shader.uniforms.uSnowAccumulation) shader.uniforms.uSnowAccumulation.value = world.snowAccumulation;
        // Map season to int: 0=spring, 1=summer, 2=autumn, 3=winter
        const seasonMap: Record<string, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };
        if (shader.uniforms.uSeason) shader.uniforms.uSeason.value = seasonMap[world.season] ?? 0;
      }
    }
  });

  const ox = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const oz = cz * CHUNK_SIZE + CHUNK_SIZE / 2;

  const cattails = reeds.filter((r) => r.variant === 1);

  return (
    <group>
      <mesh geometry={geom} position={[ox, 0, oz]} receiveShadow>
        <meshStandardMaterial 
          ref={(mat) => {
            terrainMatRef.current = mat;
            if (mat && !(mat.userData as any).snowSetup) {
              (mat.userData as any).snowSetup = true;
              mat.onBeforeCompile = (shader) => {
                shader.uniforms.uSnowAccumulation = { value: 0 }; // Persistent snow on ground
                shader.uniforms.uSeason = { value: 0 }; // 0=spring, 1=summer, 2=autumn, 3=winter
                (mat.userData as any).shader = shader;
                // Pass world position from vertex to fragment
                shader.vertexShader = `
                  varying vec3 vWorldPosition;
                ` + shader.vertexShader.replace(
                  '#include <worldpos_vertex>',
                  `
                  #include <worldpos_vertex>
                  vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                  `
                );
                shader.fragmentShader = `
                  uniform float uSnowAccumulation;
                  uniform int uSeason;
                  varying vec3 vWorldPosition;
                ` + shader.fragmentShader.replace(
                  '#include <color_fragment>',
                  `
                  #include <color_fragment>
                  // Snow coverage: persistent accumulation that fades after snowfall
                  // Only in winter (season 3), with elevation-based distribution
                  float seasonFactor = (uSeason == 3) ? 1.0 : 0.0;
                  float heightFactor = smoothstep(1.0, 4.5, vWorldPosition.y);
                  // Patchy snow distribution using world position noise
                  float patchNoise = sin(vWorldPosition.x * 0.5) * cos(vWorldPosition.z * 0.3) * 0.5 + 0.5;
                  float patchFactor = smoothstep(0.3, 0.8, patchNoise); // creates patchy coverage
                  float snowCover = uSnowAccumulation * 0.95 * heightFactor * seasonFactor * patchFactor;
                  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 0.98), snowCover);
                  // Add sparkle effect to snow at higher elevations
                  if (uSnowAccumulation > 0.2 && vWorldPosition.y > 2.0 && uSeason == 3) {
                    float sparkle = sin(vViewPosition.x * 20.0) * sin(vViewPosition.z * 20.0) * 0.5 + 0.5;
                    diffuseColor.rgb += vec3(sparkle * uSnowAccumulation * heightFactor * 0.04);
                  }
                  `
                );
              };
            }
          }}
          vertexColors 
          flatShading 
          roughness={1}
        />
      </mesh>

      {/* Rivers - flowing water surfaces for riverlands */}
      {riverGeom && (
        <mesh geometry={riverGeom} position={[ox + CHUNK_SIZE / 2, 0, oz + CHUNK_SIZE / 2]}>
          <primitive object={riverWaterMat} attach="material" />
        </mesh>
      )}

      {/* Trees */}
      {coniferTrees.length > 0 && (
        <>
          <instancedMesh ref={coniferTrunkRef} args={[trunkGeom, trunkMat, coniferTrees.length]} castShadow receiveShadow frustumCulled={false} />
          <instancedMesh ref={coniferFolRef} args={[coniferGeom, coniferMat, coniferTrees.length]} castShadow frustumCulled={false} />
        </>
      )}
      {broadTrees.length > 0 && (
        <>
          <instancedMesh ref={broadTrunkRef} args={[trunkGeom, trunkMat, broadTrees.length]} castShadow receiveShadow frustumCulled={false} />
          <instancedMesh ref={broadFolRef} args={[broadleafGeom, broadleafMat, broadTrees.length]} castShadow frustumCulled={false} />
        </>
      )}

      {/* Birch Trees */}
      {birchTrees.length > 0 && (
        <>
          <instancedMesh ref={birchTrunkRef} args={[birchTrunkGeom, birchTrunkMat, birchTrees.length]} castShadow receiveShadow frustumCulled={false} />
          <instancedMesh ref={birchFolRef} args={[birchGeom, birchMat, birchTrees.length]} castShadow frustumCulled={false} />
        </>
      )}

      {/* Oak Trees */}
      {oakTrees.length > 0 && (
        <>
          <instancedMesh ref={oakTrunkRef} args={[trunkGeom, oakTrunkMat, oakTrees.length]} castShadow receiveShadow frustumCulled={false} />
          <instancedMesh ref={oakFolRef} args={[oakGeom, oakMat, oakTrees.length]} castShadow frustumCulled={false} />
        </>
      )}

      {/* Maple Trees */}
      {mapleTrees.length > 0 && (
        <>
          <instancedMesh ref={mapleTrunkRef} args={[mapleTrunkGeom, trunkMat, mapleTrees.length]} castShadow receiveShadow frustumCulled={false} />
          <instancedMesh ref={mapleFolRef} args={[mapleGeom, mapleMat, mapleTrees.length]} castShadow frustumCulled={false} />
        </>
      )}

      {/* Boulders */}
      {bareBoulders.length > 0 && (
        <instancedMesh ref={boulderRef} args={[boulderGeom, boulderMat, bareBoulders.length]} castShadow receiveShadow />
      )}
      {mossyBoulders.length > 0 && (
        <instancedMesh ref={mossyBoulderRef} args={[boulderGeom, mossyBoulderMat, mossyBoulders.length]} castShadow receiveShadow />
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <instancedMesh ref={logRef} args={[logGeom, logMat, logs.length]} castShadow receiveShadow />
      )}

      {/* Stumps (body + top cap) */}
      {stumps.length > 0 && (
        <>
          <instancedMesh ref={stumpRef} args={[stumpGeom, stumpMat, stumps.length]} castShadow receiveShadow />
          <instancedMesh ref={stumpTopRef} args={[stumpGeom, stumpTopMat, stumps.length]} />
        </>
      )}

      {/* Grass */}
      {grass.length > 0 && (
        <instancedMesh ref={grassRef} args={[grassBladeGeom, grassMat, grass.length]} />
      )}

      {/* Wildflower carpet (non-collectable decor, per-instance coloured). */}
      {wildflowers.length > 0 && (
        <instancedMesh
          ref={wildflowerRef}
          args={[wildflowerGeom, wildflowerMat, wildflowers.length]}
          receiveShadow
        />
      )}

      {/* Bell flowers — hanging bluebell types. */}
      {bellFlowers.length > 0 && (
        <instancedMesh
          ref={bellFlowerRef}
          args={[bellFlowerGeom, bellFlowerMat, bellFlowers.length]}
          receiveShadow
        />
      )}

      {/* Tall flowers — daisy/sunflower types standing above grass. */}
      {tallFlowers.length > 0 && (
        <instancedMesh
          ref={tallFlowerRef}
          args={[tallFlowerGeom, tallFlowerMat, tallFlowers.length]}
          receiveShadow
        />
      )}

      {/* Lavender / spike flower clusters. */}
      {lavenders.length > 0 && (
        <instancedMesh
          ref={lavenderRef}
          args={[lavenderGeom, lavenderMat, lavenders.length]}
          receiveShadow
        />
      )}

      {/* Clover patches — low ground cover. */}
      {clovers.length > 0 && (
        <instancedMesh
          ref={cloverRef}
          args={[cloverGeom, cloverMat, clovers.length]}
          receiveShadow
        />
      )}

      {/* Ferns — shady forest floor coverage. */}
      {ferns.length > 0 && (
        <instancedMesh
          ref={fernRef}
          args={[fernGeom, fernMat, ferns.length]}
          receiveShadow
        />
      )}

      {/* Pebbles — tiny ground stones. */}
      {pebbles.length > 0 && (
        <instancedMesh
          ref={pebbleRef}
          args={[pebbleGeom, pebbleMat, pebbles.length]}
          receiveShadow
        />
      )}

      {/* Reeds / cattails at shores */}
      {reeds.filter((r) => r.variant === 0).length > 0 && (
        <instancedMesh ref={reedBareRef} args={[reedGeom, reedMat, reeds.filter((r) => r.variant === 0).length]} castShadow />
      )}
      {cattails.length > 0 && (
        <>
          <instancedMesh ref={reedCattailRef} args={[reedGeom, reedMat, cattails.length]} castShadow />
          {cattails.map((r, i) => (
            <mesh key={i} position={[r.x, r.y, r.z]} scale={r.scale}>
              <primitive object={cattailGeom} />
              <primitive object={cattailMat} attach="material" />
            </mesh>
          ))}
        </>
      )}

      {/* Bushes */}
      {bushes.map((b, i) => (
        <Bush
          key={b.id}
          b={b}
          ref={(h) => { bushHandleRefs.current[i] = h; }}
        />
      ))}

      {/* Collectible plants */}
      {plants.map((p, i) => (
        <Plant
          key={p.id}
          p={p}
          ref={(g) => { plantGroupRefs.current[i] = g; }}
        />
      ))}
    </group>
  );
}
