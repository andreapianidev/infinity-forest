import { createNoise2D } from 'simplex-noise';
import { TerrainType } from './world';

// Deterministic seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * World seed — fresh on **every page load** so each visit spawns a new
 * forest. Nothing is persisted; reload = new world.
 *
 * An explicit `?seed=N` query parameter overrides the random seed so
 * users can share or reproduce a specific world (useful for bug reports
 * or showing a friend the same landscape).
 *
 * On the server (SSR) we fall back to a stable constant to avoid
 * hydration mismatches; the real randomisation kicks in on the client.
 */
function pickSeed(): number {
  if (typeof window === 'undefined') return 1337;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('seed');
    if (q && /^\d+$/.test(q)) return parseInt(q, 10) >>> 0;
  } catch {}
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export const WORLD_SEED = pickSeed();

/** Get saved terrain type from localStorage settings. */
function getSavedTerrainType(): TerrainType {
  if (typeof window === 'undefined') return 'flat';
  try {
    const s = JSON.parse(localStorage.getItem('forest.settings') || '{}');
    const t = s.terrainType;
    if (t && ['flat', 'hilly', 'mountainous', 'volcanic', 'riverlands'].includes(t)) return t as TerrainType;
  } catch {}
  return 'flat';
}

export const TERRAIN_TYPE: TerrainType = getSavedTerrainType();

// Four deterministic noise channels derived from the world seed via
// distinct offsets so they're uncorrelated.
const terrainNoise = createNoise2D(mulberry32(WORLD_SEED));
const detailNoise = createNoise2D(mulberry32(WORLD_SEED ^ 0xdead));
const lakeNoise = createNoise2D(mulberry32(WORLD_SEED ^ 0xbeef));
const forestDensityNoise = createNoise2D(mulberry32(WORLD_SEED ^ 0xfeed));

/** Reload the page — fresh world, fresh seed. */
export function rerollWorldSeed() {
  if (typeof window === 'undefined') return;
  // Strip any ?seed=N param so we don't stay locked on a shared seed.
  const url = new URL(window.location.href);
  url.searchParams.delete('seed');
  window.location.href = url.toString();
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * River channel generator - creates meandering river paths.
 * Uses sine-based curves with noise perturbation for organic flow.
 * 
 * @param x, z - world position
 * @param freqX, freqZ - frequency of the meander curves
 * @param seedOffset - offset for different river systems
 * @param maxDepth - how deep the river carves at center
 * @param width - river width factor
 * @returns depth value (negative = carved, 0 = no river)
 */
function riverChannel(x: number, z: number, freqX: number, freqZ: number, seedOffset: number, maxDepth: number, width: number): number {
  // Base curve with noise perturbation for organic meandering
  const t = performance.now ? performance.now() * 0.0001 : 0; // Time not used but keeps function signature
  const nx = terrainNoise(x * 0.002 + seedOffset, z * 0.002) * 200;
  const nz = terrainNoise(x * 0.002, z * 0.002 + seedOffset) * 200;
  
  // Primary meander curve
  const curve1 = Math.sin((x + nx) * freqX);
  const curve2 = Math.cos((z + nz) * freqZ);
  
  // Secondary wobble for irregularity
  const wobble = terrainNoise(x * 0.01, z * 0.01) * 0.3;
  
  // Distance from ideal curve center (0 = on curve, 1+ = far from curve)
  const distFromCurve = Math.abs(curve1 * curve2 + wobble);
  
  // River cross-section: parabolic depth profile
  // 0 at center = deepest, falls off toward edges
  const riverWidth = 0.15 / width; // narrower = smaller number
  const depthFactor = Math.max(0, 1 - distFromCurve / riverWidth);
  
  if (depthFactor <= 0) return 0; // Not in this river
  
  // Smooth parabolic profile for river bed
  return -maxDepth * depthFactor * depthFactor;
}

/**
 * Small tributary stream noise - fine detail water network.
 * Uses higher frequency noise for small creeks feeding main rivers.
 */
function streamNoise(x: number, z: number): number {
  // High frequency noise for small streams
  const n1 = detailNoise(x * 0.02, z * 0.02);
  const n2 = detailNoise(x * 0.015 + 100, z * 0.025);
  
  // Combine for dendritic pattern
  const combined = (n1 + n2 * 0.5) / 1.5;
  
  // Normalize to 0..1
  return (combined + 1) * 0.5;
}

/**
 * Check if a point is inside a river channel (for riverlands terrain).
 * Returns the river depth if in river, 0 otherwise.
 */
export function getRiverDepth(x: number, z: number): number {
  if (TERRAIN_TYPE !== 'riverlands') return 0;
  
  // Primary river system
  const rv1 = riverChannel(x, z, 0.008, 0.012, 0, 6, 2.5);
  const rv2 = riverChannel(x, z, 0.006, 0.009, 1000, 4, 1.8);
  const rv3 = riverChannel(x, z, 0.010, 0.007, 2000, 3, 1.2);
  
  let depth = Math.min(rv1, rv2, rv3);
  
  // Tributaries
  const stream = streamNoise(x, z);
  if (stream < 0.3) {
    depth = Math.min(depth, -1.5 * (1 - stream / 0.3));
  }
  
  return depth;
}

/**
 * Check if position is in a river (for rendering water surface).
 */
export function isRiver(x: number, z: number): boolean {
  return getRiverDepth(x, z) < -0.5;
}

/**
 * 0..1 lake mask — 1 at lake center, 0 at shore and beyond.
 * Lakes are meant to be sporadic landmarks, not continuous terrain:
 * - Lower frequency (0.0038) → larger, well-separated water bodies.
 * - High smoothstep threshold (0.58→0.78) → only the rare noise peaks
 *   cross into "lake" territory, so most of the map stays dry.
 */
export function lakeMask(x: number, z: number): number {
  const n = lakeNoise(x * 0.0032, z * 0.0032);
  // Very high threshold → only the rarest noise peaks qualify as lakes.
  // Forest is the main theme; water is a sporadic landmark.
  return smoothstep(0.72, 0.88, n);
}

/**
 * 0..1 forest density.
 * Forest is the dominant theme — this returns 1 almost everywhere, dropping
 * toward 0 only inside rare, small "meadow" pockets.
 *
 * Higher frequency (0.012 → wavelength ~520 m) keeps any clearing that does
 * form bounded in size — so the player never walks across huge empty plains.
 * The smoothstep only fires when the noise dips very negative, which is
 * statistically rare.
 */
export function forestDensity(x: number, z: number): number {
  const n = forestDensityNoise(x * 0.03, z * 0.03);
  return Math.max(0.84, Math.min(1, 0.92 + n * 0.08));
}

/**
 * Guaranteed scenic pond carved near the spawn point so the intro camera
 * always showcases water. Centered at (-6, -15) with ~12m radius.
 */
function spawnPondDepth(x: number, z: number): number {
  const d = Math.hypot(x + 6, z + 15);
  // Small laghetto: 1 at center, shore at ~7m, fade out by 9m.
  return smoothstep(9, 3, d);
}

/**
 * Terrain parameters based on selected terrain type.
 */
const TERRAIN_PARAMS: Record<TerrainType, {
  baseline: number;
  baseAmp: number;    // Large features
  baseFreq: number;
  hillsAmp: number;   // Medium features
  hillsFreq: number;
  detailAmp: number;  // Small details
  detailFreq: number;
  lakeThresholdLow: number;
  lakeThresholdHigh: number;
  lakeCarveDepth: number;
  lakeFlatten: number;
  extra?: (x: number, z: number, h: number) => number; // Optional terrain modifier
}> = {
  // Current default: gentle rolling forest
  flat: {
    baseline: 2.6,
    baseAmp: 3.5, baseFreq: 0.012,
    hillsAmp: 1.1, hillsFreq: 0.04,
    detailAmp: 0.25, detailFreq: 0.15,
    lakeThresholdLow: 0.72, lakeThresholdHigh: 0.88,
    lakeCarveDepth: 4.5, lakeFlatten: 0.7,
  },
  // More pronounced hills, moderate elevation changes
  hilly: {
    baseline: 2.8,
    baseAmp: 6.0, baseFreq: 0.009,
    hillsAmp: 2.5, hillsFreq: 0.035,
    detailAmp: 0.4, detailFreq: 0.12,
    lakeThresholdLow: 0.68, lakeThresholdHigh: 0.85,
    lakeCarveDepth: 5.0, lakeFlatten: 0.6,
    extra: (x, z, h) => {
      // Add occasional ridges
      const ridge = Math.abs(terrainNoise(x * 0.008, z * 0.008));
      return ridge > 0.7 ? (ridge - 0.7) * 4 : 0;
    },
  },
  // Tall mountains, dramatic elevation - FEWER LAKES (water flows downhill)
  mountainous: {
    baseline: 3.2,
    baseAmp: 12.0, baseFreq: 0.006,
    hillsAmp: 4.0, hillsFreq: 0.025,
    detailAmp: 0.6, detailFreq: 0.1,
    lakeThresholdLow: 0.78, lakeThresholdHigh: 0.92, // Fewer lakes at high elevation
    lakeCarveDepth: 4.0, lakeFlatten: 0.4,
    extra: (x, z, h) => {
      // Sharp peaks using ridged noise
      const ridged = 1 - Math.abs(terrainNoise(x * 0.005, z * 0.005));
      return Math.pow(ridged, 2) * 8;
    },
  },
  // Dark, rough terrain with jagged features - NO LAKES (volcanic terrain is dry and elevated)
  volcanic: {
    baseline: 2.4,
    baseAmp: 5.5, baseFreq: 0.015,
    hillsAmp: 3.0, hillsFreq: 0.04,
    detailAmp: 0.8, detailFreq: 0.2,
    lakeThresholdLow: 1.0, lakeThresholdHigh: 1.1, // NO LAKES - threshold never reached
    lakeCarveDepth: 0, lakeFlatten: 0,
    extra: (x, z, h) => {
      // Add roughness - no water basins in volcanic terrain
      const rough = detailNoise(x * 0.08, z * 0.08) * 1.5;
      return rough;
    },
  },
  // Flat terrain with many rivers and lakes
  riverlands: {
    baseline: 2.2,
    baseAmp: 2.0, baseFreq: 0.01,
    hillsAmp: 0.8, hillsFreq: 0.03,
    detailAmp: 0.2, detailFreq: 0.15,
    lakeThresholdLow: 0.55, lakeThresholdHigh: 0.75, // Much more water
    lakeCarveDepth: 5.5, lakeFlatten: 0.85,
    extra: (x, z, h) => {
      // Advanced river system: multiple meandering channels
      let riverDepth = 0;
      
      // Primary river system - large winding rivers
      const rv1 = riverChannel(x, z, 0.008, 0.012, 0, 6, 2.5);
      const rv2 = riverChannel(x, z, 0.006, 0.009, 1000, 4, 1.8);
      const rv3 = riverChannel(x, z, 0.010, 0.007, 2000, 3, 1.2);
      
      // Combine rivers - take the deepest carve
      riverDepth = Math.min(rv1, rv2, rv3);
      
      // Small tributary streams
      const stream = streamNoise(x, z);
      if (stream < 0.3) {
        riverDepth = Math.min(riverDepth, -1.5 * (1 - stream / 0.3));
      }
      
      return riverDepth;
    },
  },
};

/**
 * Height of the ground at world position (x,z).
 * Terrain profile varies based on TERRAIN_TYPE setting.
 */
export function heightAt(x: number, z: number): number {
  const p = TERRAIN_PARAMS[TERRAIN_TYPE];
  
  const base = terrainNoise(x * p.baseFreq, z * p.baseFreq) * p.baseAmp;
  const hills = terrainNoise(x * p.hillsFreq, z * p.hillsFreq) * p.hillsAmp;
  const detail = detailNoise(x * p.detailFreq, z * p.detailFreq) * p.detailAmp;
  
  let h = p.baseline + base + hills + detail;
  
  // Apply terrain-specific modifiers
  if (p.extra) {
    h += p.extra(x, z, h);
  }
  
  // Lake mask uses terrain-specific thresholds
  const lm = smoothstep(p.lakeThresholdLow, p.lakeThresholdHigh, lakeNoise(x * 0.0032, z * 0.0032));
  const sp = spawnPondDepth(x, z);
  
  // Flatten hills inside lakes, then carve down
  const carved = h * (1 - lm * p.lakeFlatten) - lm * p.lakeCarveDepth;
  return carved * (1 - sp * 0.9) - sp * 2.6;
}

/** World-space constants shared between terrain mesh and placement sampling. */
export const CHUNK_SIZE = 64;
export const TERRAIN_RES = 40;

/**
 * Height matching EXACTLY what the rendered terrain mesh shows at (x,z).
 *
 * PlaneGeometry splits each cell into two triangles with the diagonal from
 * the lower-left corner (h00) to the upper-right corner (h11). We compute
 * barycentric-linear interpolation inside the correct triangle — NOT bilinear,
 * which would place objects floating where the surface is concave.
 *
 *   z↑   h01 ———— h11
 *        |      / |
 *        |    /   |
 *        |  /     |
 *   z=z0 h00 ———— h10
 *        x=x0     x=x1 → x
 *
 *   T1 (upper-left, fz > fx): h00, h01, h11
 *   T2 (lower-right, fx > fz): h00, h10, h11
 */
export function sampledHeight(x: number, z: number): number {
  const cell = CHUNK_SIZE / TERRAIN_RES;
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  const x0 = gx * cell;
  const z0 = gz * cell;
  const fx = Math.max(0, Math.min(1, (x - x0) / cell));
  const fz = Math.max(0, Math.min(1, (z - z0) / cell));
  const h00 = heightAt(x0, z0);
  const h11 = heightAt(x0 + cell, z0 + cell);
  if (fz >= fx) {
    const h01 = heightAt(x0, z0 + cell);
    return (1 - fz) * h00 + fx * h11 + (fz - fx) * h01;
  } else {
    const h10 = heightAt(x0 + cell, z0);
    return (1 - fx) * h00 + fz * h11 + (fx - fz) * h10;
  }
}

/** Hash (ix,iz,salt) -> [0,1) for deterministic per-cell placement. */
export function hash2(ix: number, iz: number, salt = 0): number {
  const seed = WORLD_SEED | 0;
  let h = Math.imul((ix ^ seed) | 0, 374761393) ^ Math.imul((iz ^ (seed >>> 1)) | 0, 668265263) ^ Math.imul((salt ^ (seed >>> 9)) | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
