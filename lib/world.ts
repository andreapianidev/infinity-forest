import * as THREE from 'three';
import { create } from 'zustand';
import { lakeMask, sampledHeight, TERRAIN_TYPE } from './noise';

export type Phase = 'night' | 'dawn' | 'morning' | 'day' | 'evening' | 'dusk';
export type Weather = 'clear' | 'rain' | 'fog' | 'postRain' | 'thunderstorm' | 'snow';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const WATER_LEVEL = -0.2;

/** Shared mutable world state (read/written every frame; do not subscribe). */
export const world = {
  hour: 12,
  phase: 'day' as Phase,
  season: 'spring' as Season,
  weather: 'clear' as Weather,
  rainT: 0,
  fogT: 0,
  postRainT: 0,
  calm: 0.2,
  playerSpeed: 0,
  inWater: false,
  sunDir: new THREE.Vector3(0.3, 0.9, 0.2),
  fogColor: new THREE.Color('#cfe3d4'),
  fogNear: 50,
  fogFar: 180,
  skyColor: new THREE.Color('#a8c8e0'),
  lightColor: new THREE.Color('#fff4e0'),
  lightIntensity: 1.0,
  ambientIntensity: 0.5,
  ambientColor: new THREE.Color('#d8ecc8'),
  ambientGround: new THREE.Color('#3a4a28'),
  exposure: 1.0,
  windPhase: 0,
  windStrength: 1.0,
  localMoisture: 0,
  _rainElapsed: 0,
  _rainDur: 0,
  _fogElapsed: 0,
  _fogDur: 0,
  _nextWeatherIn: 140 + Math.random() * 260,
  // Thunderstorm state
  stormT: 0,
  _stormElapsed: 0,
  _stormDur: 0,
  lightningFlash: 0, // 0..1 intensity of current flash
  _nextLightningIn: 0,
  // Snow state
  snowT: 0,
  _snowElapsed: 0,
  _snowDur: 0,
};

export function phaseOf(hour: number): Phase {
  if (hour < 5) return 'night';
  if (hour < 7) return 'dawn';
  if (hour < 10) return 'morning';
  if (hour < 17) return 'day';
  if (hour < 19) return 'evening';
  if (hour < 21) return 'dusk';
  return 'night';
}

/** Determine season from month (0-11) */
export function seasonFromMonth(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring'; // Mar-May
  if (month >= 5 && month <= 7) return 'summer'; // Jun-Aug
  if (month >= 8 && month <= 10) return 'autumn'; // Sep-Nov
  return 'winter'; // Dec-Feb
}

/** Get current real world season based on local date */
export function getRealSeason(): Season {
  const now = new Date();
  return seasonFromMonth(now.getMonth());
}

const C = (hex: string) => new THREE.Color(hex);
const lerpC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);

interface Palette {
  sky: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  ambI: number;
  ambTop: THREE.Color;
  ambGround: THREE.Color;
  exposure: number;
}

/** Palette keyframes at specific hours. */
const KEYS: { h: number; p: Palette }[] = [
  // Deep night — brighter than moonless reality so the player can see.
  { h: 0,  p: { sky: C('#152040'), fog: C('#1a2440'), sun: C('#a0b8e8'), sunI: 0.28, ambI: 0.5,  ambTop: C('#6a80b8'), ambGround: C('#1a2438'), exposure: 1.25 } },
  // Pre-dawn — deep blue turning warm.
  { h: 5,  p: { sky: C('#3a3868'), fog: C('#4a4860'), sun: C('#d890a0'), sunI: 0.5,  ambI: 0.55, ambTop: C('#8888b0'), ambGround: C('#2a2c38'), exposure: 1.15 } },
  // Sunrise — peach sky with pink horizon.
  { h: 6.5,p: { sky: C('#f8b882'), fog: C('#f2c6a6'), sun: C('#ff9a58'), sunI: 1.05, ambI: 0.58, ambTop: C('#ffd4b0'), ambGround: C('#4a3a28'), exposure: 1.1 } },
  // Full morning — warm blue sky.
  { h: 9,  p: { sky: C('#9fcde6'), fog: C('#d6e4d8'), sun: C('#fff0d0'), sunI: 1.35, ambI: 0.62, ambTop: C('#e8f0dc'), ambGround: C('#3a4a28'), exposure: 1.0 } },
  // Midday — bright, slightly desaturated.
  { h: 13, p: { sky: C('#74b5de'), fog: C('#d4e6d8'), sun: C('#ffffff'), sunI: 1.4,  ambI: 0.65, ambTop: C('#e8f0e0'), ambGround: C('#3a4a28'), exposure: 1.0 } },
  // Late afternoon — golden warmth starting.
  { h: 17, p: { sky: C('#b8ceda'), fog: C('#d8d8c4'), sun: C('#ffd490'), sunI: 1.2,  ambI: 0.58, ambTop: C('#e8e0c4'), ambGround: C('#3a3a22'), exposure: 1.05 } },
  // Sunset — saturated orange-pink.
  { h: 18.5,p:{ sky: C('#ff9a5a'), fog: C('#ffae78'), sun: C('#ff5a2a'), sunI: 1.1,  ambI: 0.55, ambTop: C('#ffc088'), ambGround: C('#4a2820'), exposure: 1.25 } },
  // Twilight — violet/purple afterglow.
  { h: 19.5,p:{ sky: C('#c26290'), fog: C('#8a4868'), sun: C('#e06090'), sunI: 0.7,  ambI: 0.5,  ambTop: C('#b880a0'), ambGround: C('#3a1e30'), exposure: 1.2 } },
  // Dusk deep — indigo.
  { h: 20.5,p:{ sky: C('#4a4480'), fog: C('#3a3858'), sun: C('#8090d8'), sunI: 0.45, ambI: 0.48, ambTop: C('#7078a8'), ambGround: C('#1a1a30'), exposure: 1.2 } },
  // Night — moonlit, navy blue (not black).
  { h: 22, p: { sky: C('#1e2a52'), fog: C('#1e2a48'), sun: C('#a0b8e8'), sunI: 0.32, ambI: 0.52, ambTop: C('#6a80b8'), ambGround: C('#1a2438'), exposure: 1.25 } },
  { h: 24, p: { sky: C('#152040'), fog: C('#1a2440'), sun: C('#a0b8e8'), sunI: 0.28, ambI: 0.5,  ambTop: C('#6a80b8'), ambGround: C('#1a2438'), exposure: 1.25 } },
];

function palAt(hour: number): Palette {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = (hour - a.h) / Math.max(0.0001, b.h - a.h);
  return {
    sky: lerpC(a.p.sky, b.p.sky, t),
    fog: lerpC(a.p.fog, b.p.fog, t),
    sun: lerpC(a.p.sun, b.p.sun, t),
    sunI: a.p.sunI + (b.p.sunI - a.p.sunI) * t,
    ambI: a.p.ambI + (b.p.ambI - a.p.ambI) * t,
    ambTop: lerpC(a.p.ambTop, b.p.ambTop, t),
    ambGround: lerpC(a.p.ambGround, b.p.ambGround, t),
    exposure: a.p.exposure + (b.p.exposure - a.p.exposure) * t,
  };
}

/** User's latitude for location-aware time calculation */
let userLatitude = 45; // Default to mid-latitude (Northern Italy)
let hasGeolocation = false;

/** Try to get user's location for accurate sunset times */
export function requestGeolocation(): void {
  if (typeof navigator === 'undefined') return;
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLatitude = pos.coords.latitude;
      hasGeolocation = true;
      console.log(`Location acquired: lat=${userLatitude.toFixed(2)}, sunset will be location-accurate`);
    },
    (err) => {
      console.log('Geolocation denied or failed, using default latitude 45°');
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

/** Calculate sunset hour (0-23) based on latitude and day of year.
 *  At latitude 45°: ~20:30 in summer, ~16:30 in winter
 *  At latitude 60°: ~22:00 in summer, ~15:00 in winter
 *  At latitude 30°: ~19:30 in summer, ~17:30 in winter
 */
function calculateSunsetHour(latitude: number, dayOfYear: number): number {
  // Normalize latitude (absolute for both hemispheres)
  const lat = Math.abs(latitude);

  // Daylight variation amplitude increases with latitude
  // At equator (0°): 0 variation, at poles (90°): extreme variation
  const maxVariation = (lat / 90) * 4.5; // Up to 4.5h variation at poles

  // Peak summer day ~172 (June 21), peak winter ~355 (Dec 21)
  const daysSinceSummerSolstice = (dayOfYear - 172 + 365) % 365;
  const yearProgress = (daysSinceSummerSolstice / 365) * Math.PI * 2;

  // Sunset is later in summer (positive offset), earlier in winter (negative)
  const seasonalOffset = Math.cos(yearProgress) * maxVariation;

  // Base sunset at 18:00 (6pm), adjusted by latitude and season
  return 18 + seasonalOffset;
}

/** Real local hour with fractional minutes, adjusted for location sunset. */
export function currentLocalHour(): number {
  const d = new Date();
  const baseHour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

  if (!hasGeolocation) {
    return baseHour; // No location data, use standard local time
  }

  // Calculate sunset offset based on user's actual latitude
  const startOfYear = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  const sunsetHour = calculateSunsetHour(userLatitude, dayOfYear);

  // Adjust current hour so sunset aligns with ~19:00-20:00 game time
  // This compresses/stretches the day so evening phase matches actual local sunset
  const midDay = 12;
  const offsetFromMidday = baseHour - midDay;
  const localDayLength = (sunsetHour - 6) * 2; // From 6am sunrise to sunset
  const standardDayLength = 24;
  const timeScale = localDayLength / standardDayLength;

  // Scale time from midday
  const adjustedHour = midDay + offsetFromMidday * timeScale;

  // Normalize to 0-24 range
  return (adjustedHour + 24) % 24;
}

/** Get current sunset time for display (in local time hours) */
export function getLocalSunsetTime(): { hour: number; hasLocation: boolean } {
  const d = new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  return {
    hour: calculateSunsetHour(userLatitude, dayOfYear),
    hasLocation: hasGeolocation
  };
}

export function updateSunAndPalette() {
  const h = world.hour;
  const p = palAt(h);
  // Sun arc: elevation peaks at 13, negative at night
  const elT = (h - 6) / 12; // 0 dawn .. 1 dusk
  const el = Math.sin(Math.max(0, Math.min(1, elT)) * Math.PI);
  const signedEl = (h >= 6 && h <= 18) ? el : -Math.sin((h < 6 ? (6 - h) : (h - 18)) / 6 * Math.PI) * 0.4;
  const az = ((h - 6) / 24) * Math.PI * 2;
  world.sunDir.set(Math.cos(az), signedEl * 0.9 + 0.1, Math.sin(az)).normalize();

  world.skyColor.copy(p.sky);
  world.fogColor.copy(p.fog);
  world.lightColor.copy(p.sun);
  world.lightIntensity = p.sunI;
  world.ambientIntensity = p.ambI;
  world.ambientColor.copy(p.ambTop);
  world.ambientGround.copy(p.ambGround);

  // Apply seasonal tints to colors
  const season = world.season;
  const seasonStrength = 0.25; // How strong the seasonal tint is
  if (season === 'spring') {
    // Spring: fresh greens and soft pastels
    world.skyColor.lerp(C('#c8e8d8'), seasonStrength * 0.5);
    world.fogColor.lerp(C('#d8f0e0'), seasonStrength * 0.6);
    world.ambientColor.lerp(C('#d0f0d8'), seasonStrength * 0.4);
    world.ambientGround.lerp(C('#5a7a4a'), seasonStrength * 0.3);
  } else if (season === 'summer') {
    // Summer: warm yellows, intense greens
    world.skyColor.lerp(C('#7ab8e0'), seasonStrength * 0.3);
    world.fogColor.lerp(C('#e8f5d0'), seasonStrength * 0.4);
    world.lightColor.lerp(C('#fff8e0'), seasonStrength * 0.3); // Warmer sun
    world.ambientColor.lerp(C('#f0f8d8'), seasonStrength * 0.5);
    world.ambientGround.lerp(C('#6a9a3a'), seasonStrength * 0.4);
    world.lightIntensity *= 1.08; // Brighter in summer
  } else if (season === 'autumn') {
    // Autumn: warm oranges, golds, muted greens
    world.skyColor.lerp(C('#d8a878'), seasonStrength * 0.5);
    world.fogColor.lerp(C('#e0c8a0'), seasonStrength * 0.6);
    world.lightColor.lerp(C('#ffd4a0'), seasonStrength * 0.4); // Golden hour feel
    world.ambientColor.lerp(C('#f0d8b0'), seasonStrength * 0.5);
    world.ambientGround.lerp(C('#8a6a3a'), seasonStrength * 0.5); // Brownish grass
    world.lightIntensity *= 0.95; // Slightly dimmer
  } else if (season === 'winter') {
    // Winter: cool blues, grays, muted tones
    world.skyColor.lerp(C('#a8c0d0'), seasonStrength * 0.6);
    world.fogColor.lerp(C('#d0d8e0'), seasonStrength * 0.7);
    world.lightColor.lerp(C('#e0f0ff'), seasonStrength * 0.3); // Cooler sun
    world.ambientColor.lerp(C('#d8e8f0'), seasonStrength * 0.5);
    world.ambientGround.lerp(C('#4a5a6a'), seasonStrength * 0.6); // Gray-brown grass
    world.lightIntensity *= 0.85; // Dimmer in winter
  }
  world.exposure = p.exposure;

  // Rain tints toward gray - more dramatic for heavy rain
  if (world.rainT > 0) {
    const rainGray = world.weather === 'thunderstorm' ? C('#3a3a42') : C('#5a6270');
    const fogGray = world.weather === 'thunderstorm' ? C('#4a4a52') : C('#6a7280');
    world.skyColor.lerp(rainGray, world.rainT * (world.weather === 'thunderstorm' ? 0.85 : 0.6));
    world.fogColor.lerp(fogGray, world.rainT * (world.weather === 'thunderstorm' ? 0.75 : 0.5));
    world.lightIntensity *= 1 - world.rainT * (world.weather === 'thunderstorm' ? 0.7 : 0.5);
    world.ambientIntensity *= 1 - world.rainT * 0.35;
  }

  // Storm makes sky even darker and ominous - charcoal with purple/blue tint
  if (world.stormT > 0) {
    const stormDark = C('#2a2a35'); // Dark charcoal
    const stormFog = C('#3a3a45'); // Dark purple-gray fog
    world.skyColor.lerp(stormDark, world.stormT * 0.9);
    world.fogColor.lerp(stormFog, world.stormT * 0.85);
    world.fogColor.lerp(new THREE.Color(0.15, 0.15, 0.2), world.stormT * 0.4); // Purple tint
    world.lightIntensity *= 1 - world.stormT * 0.4;
    world.ambientIntensity *= 1 - world.stormT * 0.3;
    // Reduce view distance during storm
    world.fogNear = 20 - world.stormT * 10;
    world.fogFar = 140 - world.stormT * 50;
  } else {
    // Reset fog distances gradually
    world.fogNear += (50 - world.fogNear) * 0.02;
    world.fogFar += (180 - world.fogFar) * 0.02;
  }

  // Fog mode - thick, realistic mist that reduces visibility dramatically
  if (world.fogT > 0) {
    // Fog color: cool gray-white (not too bright)
    const fogGray = C('#c8d0d8'); // Cool gray mist
    const fogDense = C('#a8b0b8'); // Darker dense fog core
    // Sky becomes overcast gray during fog
    world.skyColor.lerp(C('#b8c0c8'), world.fogT * 0.7);
    // Fog color transitions from light to dense
    world.fogColor.lerp(fogGray, world.fogT * 0.9);
    world.fogColor.lerp(fogDense, world.fogT * 0.4);
    // Light becomes diffuse and cool
    world.lightColor.lerp(C('#d8e0e8'), world.fogT * 0.5);
    world.lightIntensity *= 1 - world.fogT * 0.45;
    // Ambient light increases but stays cool
    world.ambientIntensity *= 1 + world.fogT * 0.15;
    // Reduce contrast
    world.exposure *= 1 - world.fogT * 0.08;
  }

  // Snow mode - bright, diffuse, winter atmosphere
  if (world.snowT > 0) {
    // Snow brings bright white-gray sky
    const snowSky = C('#d8e0e8'); // Bright overcast
    const snowFog = C('#e8eef2'); // White mist
    world.skyColor.lerp(snowSky, world.snowT * 0.8);
    world.fogColor.lerp(snowFog, world.snowT * 0.85);
    // Diffuse cool light
    world.lightColor.lerp(C('#f0f4f8'), world.snowT * 0.6);
    world.lightIntensity *= 1 - world.snowT * 0.2; // Slightly dimmer
    world.ambientIntensity *= 1 + world.snowT * 0.25; // More ambient from snow reflection
    // Snow reduces visibility like fog but brighter
    world.fogNear = Math.max(6, world.fogNear - world.snowT * 4);
    world.fogFar = Math.max(40, world.fogFar - world.snowT * 30);
    // Terrain affects snow visibility - mountains get more
    if (TERRAIN_TYPE === 'mountainous') {
      world.fogFar = Math.max(30, world.fogFar - world.snowT * 20); // Blizzards in mountains
    }
  }

  // Enhanced fog strength calculation for more dramatic visibility reduction
  const fogStrength = THREE.MathUtils.clamp(world.fogT * (0.7 + world.localMoisture * 0.9), 0, 1);
  // Deep-calm bonus: gentle extra view distance and a touch of extra exposure
  // once the player has held still long enough — gives a noticeable "the world
  // opens up" moment without being flashy.
  const deepCalm = Math.max(0, world.calm - 0.85) / 0.15; // 0..1 when calm in 0.85..1
  // Fog dramatically reduces visibility - closer fogNear, much closer fogFar when fog is dense
  const fogNearBase = world.fogT > 0.5 ? 8 : 15; // Very close fog start in dense fog
  const fogFarBase = world.fogT > 0.7 ? 60 : (world.fogT > 0.4 ? 90 : 140); // Limited visibility
  world.fogNear = Math.max(4, fogNearBase - fogStrength * 8 + deepCalm * 6);
  world.fogFar = Math.max(25, fogFarBase - fogStrength * 60 + deepCalm * 30 + world.calm * 20);
  world.windStrength = Math.max(0.28, 0.6 + world.rainT * 1.4 - fogStrength * 0.22);
  world.exposure *= 1 + deepCalm * 0.05;
}

export function updateLocalMoisture(x: number, z: number, dt: number) {
  const lake = THREE.MathUtils.clamp(lakeMask(x, z), 0, 1);
  const lowland = THREE.MathUtils.clamp((1.4 - sampledHeight(x, z)) / 4.2, 0, 1);
  const wetAfterRain = world.postRainT > 0 ? THREE.MathUtils.clamp(world.postRainT / 220, 0, 0.35) : 0;
  const target = THREE.MathUtils.clamp(Math.max(lake, lowland * 0.75) + wetAfterRain, 0, 1);
  world.localMoisture += (target - world.localMoisture) * Math.min(1, dt * 0.7);
}

function scheduleNextWeather(minDelay = 0) {
  const dryPenalty = (1 - world.localMoisture) * 70;
  world._nextWeatherIn = minDelay + 95 + Math.random() * 180 + dryPenalty;
}

function startRain() {
  world.weather = 'rain';
  world._rainElapsed = 0;
  world._rainDur = 45 + Math.random() * 90;
}

function startFog(seedIntensity = 0) {
  world.weather = 'fog';
  world._fogElapsed = seedIntensity * 10;
  world._fogDur = 55 + Math.random() * 110;
  world.fogT = Math.max(world.fogT, seedIntensity);
}

function startStorm() {
  world.weather = 'thunderstorm';
  world._stormElapsed = 0;
  world._stormDur = 90 + Math.random() * 120; // 1.5-3.5 minutes
  world._nextLightningIn = 2 + Math.random() * 6;
}

function startSnow() {
  world.weather = 'snow';
  world._snowElapsed = 0;
  world._snowDur = 80 + Math.random() * 100; // 1.3-3 minutes
}

/** Terrain and season aware weather picker. */
function pickNextWeather(): 'rain' | 'fog' | 'thunderstorm' | 'snow' {
  const h = world.hour;
  const dawn = h >= 4.5 && h < 8 ? 1 : 0;
  const night = h >= 20 || h < 6 ? 1 : 0;
  const midday = h >= 11 && h < 16 ? 1 : 0;
  const evening = h >= 16 && h < 20 ? 1 : 0;
  const wet = THREE.MathUtils.clamp(world.localMoisture + (world.postRainT > 0 ? 0.3 : 0), 0, 1.35);
  
  // Season and terrain affect weather probabilities
  const isWinter = world.season === 'winter';
  const isSummer = world.season === 'summer';
  const terrain = TERRAIN_TYPE;
  
  // Terrain modifiers
  const terrainSnowBoost = terrain === 'mountainous' ? 0.25 : terrain === 'hilly' ? 0.1 : 0;
  const terrainStormBoost = terrain === 'mountainous' ? 0.15 : terrain === 'flat' ? 0.05 : 0;
  const terrainFogBoost = terrain === 'riverlands' ? 0.2 : terrain === 'flat' ? 0.1 : 0;
  
  // Season modifiers
  const snowWeight = isWinter ? 0.35 + terrainSnowBoost : (isSummer ? 0 : 0.02);
  const rainSeasonMod = isSummer ? 0.15 : isWinter ? -0.2 : 0;
  const stormSeasonMod = isSummer ? 0.1 : isWinter ? -0.1 : 0;
  
  const fogWeight = Math.max(0.08, 0.18 + dawn * 0.5 + night * 0.28 + wet * 0.55 + terrainFogBoost - midday * 0.3 - world.windStrength * 0.08);
  const rainWeight = Math.max(0.12, 0.34 + evening * 0.16 + (midday ? 0.12 : 0) + rainSeasonMod + (1 - Math.min(wet, 1)) * 0.08 - dawn * 0.06 - (world.postRainT > 0 ? 0.18 : 0));
  const stormWeight = Math.max(0.05, rainWeight * 0.35 + evening * 0.25 + midday * 0.15 + terrainStormBoost + stormSeasonMod - dawn * 0.08);
  
  const total = fogWeight + rainWeight + stormWeight + snowWeight;
  const r = Math.random() * total;
  
  if (r < fogWeight) return 'fog';
  if (r < fogWeight + rainWeight) return 'rain';
  if (r < fogWeight + rainWeight + stormWeight) return 'thunderstorm';
  return 'snow';
}

function postRainFogChance() {
  const h = world.hour;
  const dawn = h >= 4.5 && h < 8 ? 1 : 0;
  const night = h >= 20 || h < 6 ? 1 : 0;
  return THREE.MathUtils.clamp(0.12 + world.localMoisture * 0.38 + dawn * 0.22 + night * 0.14, 0.08, 0.72);
}

/**
 * Advance weather state machine.
 * Respects the user's `weatherMode` setting:
 *   - 'auto'  : random scheduler for rain and fog
 *   - 'clear' : forces clear sky; any ongoing weather ramps down
 *   - 'rain'  : forces a steady rainstorm (no auto-end)
 *   - 'fog'   : forces a dense mist event (no auto-end)
 */
export function stepWeather(dt: number) {
  if (world.postRainT > 0) world.postRainT = Math.max(0, world.postRainT - dt);
  const mode = useSettings.getState().weatherMode;

  if (mode === 'clear') {
    world.rainT = Math.max(0, world.rainT - dt * 0.25);
    world.fogT = Math.max(0, world.fogT - dt * 0.22);
    world.stormT = Math.max(0, world.stormT - dt * 0.3);
    world.lightningFlash = Math.max(0, world.lightningFlash - dt * 4);
    if (world.rainT <= 0.01 && world.fogT <= 0.01 && world.stormT <= 0.01) {
      world.weather = 'clear';
      world.rainT = 0;
      world.fogT = 0;
      world.stormT = 0;
      world.lightningFlash = 0;
    }
    world._nextWeatherIn = 1e9;
    return;
  }

  if (mode === 'rain') {
    world.weather = 'rain';
    world.rainT = Math.min(1, world.rainT + dt * 0.25);
    world.fogT = Math.max(0, world.fogT - dt * 0.25);
    world.postRainT = 0;
    return;
  }

  if (mode === 'fog') {
    world.weather = 'fog';
    world.fogT = Math.min(1, world.fogT + dt * 0.22);
    world.rainT = Math.max(0, world.rainT - dt * 0.3);
    world.stormT = Math.max(0, world.stormT - dt * 0.35);
    world.postRainT = 0;
    return;
  }

  if (mode === 'thunderstorm') {
    world.weather = 'thunderstorm';
    world.stormT = Math.min(1, world.stormT + dt * 0.2);
    world.rainT = Math.max(world.rainT, world.stormT * 0.95);
    world.snowT = Math.max(0, world.snowT - dt * 0.4);
    world.fogT = Math.max(0, world.fogT - dt * 0.25);
    world.postRainT = 0;
    return;
  }

  if (mode === 'snow') {
    world.weather = 'snow';
    world.snowT = Math.min(1, world.snowT + dt * 0.18);
    world.rainT = Math.max(0, world.rainT - dt * 0.4);
    world.stormT = Math.max(0, world.stormT - dt * 0.35);
    world.fogT = Math.max(0, world.fogT - dt * 0.3);
    world.postRainT = 0;
    return;
  }

  if (world._nextWeatherIn > 1e8) scheduleNextWeather();

  if (world.weather === 'clear') {
    world._nextWeatherIn -= dt;
    if (world._nextWeatherIn <= 0) {
      const next = pickNextWeather();
      if (next === 'fog') startFog();
      else if (next === 'snow') startSnow();
      else startRain();
    }
  } else if (world.weather === 'rain') {
    world._rainElapsed += dt;
    const e = world._rainElapsed, d = world._rainDur;
    const ramp = Math.min(e / 6, 1);
    const tail = e > d ? Math.max(0, 1 - (e - d) / 8) : 1;
    world.rainT = Math.min(ramp, tail);
    world.fogT = Math.max(0, world.fogT - dt * 0.4);
    if (e > d + 8) {
      world.weather = 'postRain';
      world.rainT = 0;
      world.postRainT = 150 + Math.random() * 90;
      scheduleNextWeather(80 + Math.random() * 70);
    }
  } else if (world.weather === 'fog') {
    world._fogElapsed += dt;
    const e = world._fogElapsed, d = world._fogDur;
    const ramp = Math.min(e / 10, 1);
    const tail = e > d ? Math.max(0, 1 - (e - d) / 12) : 1;
    world.fogT = Math.min(ramp, tail);
    world.rainT = Math.max(0, world.rainT - dt * 0.35);
    if (e > d + 12) {
      world.weather = 'clear';
      world.fogT = 0;
      scheduleNextWeather(45 + Math.random() * 60);
    }
  } else if (world.weather === 'postRain') {
    if (world.postRainT <= 0.01) {
      if (Math.random() < postRainFogChance()) startFog(0.35);
      else {
        world.weather = 'clear';
        scheduleNextWeather(35 + Math.random() * 60);
      }
    }
  } else if (world.weather === 'snow') {
    world._snowElapsed += dt;
    const e = world._snowElapsed, d = world._snowDur;
    const ramp = Math.min(e / 10, 1);
    const tail = e > d ? Math.max(0, 1 - (e - d) / 10) : 1;
    world.snowT = Math.min(ramp, tail);
    world.rainT = Math.max(0, world.rainT - dt * 0.4);
    world.stormT = Math.max(0, world.stormT - dt * 0.35);
    world.fogT = Math.max(0, world.fogT - dt * 0.25);
    // Snow brings gentle wind, quieter atmosphere
    world.windStrength = Math.max(0.2, world.windStrength * 0.98);
    if (e > d + 10) {
      world.weather = 'clear';
      world.snowT = 0;
      scheduleNextWeather(60 + Math.random() * 80);
    }
  } else if (world.weather === 'thunderstorm') {
    world._stormElapsed += dt;
    const e = world._stormElapsed, d = world._stormDur;
    const ramp = Math.min(e / 8, 1);
    const tail = e > d ? Math.max(0, 1 - (e - d) / 12) : 1;
    world.stormT = Math.min(ramp, tail);
    world.rainT = Math.max(world.rainT, world.stormT * 1.0); // full intensity rain
    world.snowT = Math.max(0, world.snowT - dt * 0.4);
    world.fogT = Math.max(0, world.fogT - dt * 0.4);
    // Storm brings very strong wind gusts
    world.windStrength = Math.max(world.windStrength, 1.0 + world.stormT * 0.8);
    // Darken the sky during storms - dramatic effect
    if (world.stormT > 0.5) {
      world.skyColor.lerp(new THREE.Color('#3a4a5a'), 0.15 * dt);
      world.ambientIntensity = Math.max(0.3, world.ambientIntensity - dt * 0.1);
    }

    // Lightning logic - much more frequent than before (2-6 seconds)
    world._nextLightningIn -= dt;
    if (world._nextLightningIn <= 0 && world.stormT > 0.2) {
      // Flash with higher intensity during storms!
      world.lightningFlash = 0.9 + Math.random() * 0.1;
      // Double flash effect sometimes (rapid succession)
      if (Math.random() < 0.25) {
        world.lightningFlash = 1.0; // immediate bright flash
      }
      // Next flash in 2-6 seconds - frequent during storm
      world._nextLightningIn = 2 + Math.random() * 4;
    }
    // Decay flash
    world.lightningFlash = Math.max(0, world.lightningFlash - dt * 3);

    if (e > d + 12) {
      world.weather = 'postRain';
      world.stormT = 0;
      world.lightningFlash = 0;
      world.postRainT = 120 + Math.random() * 90;
      scheduleNextWeather(100 + Math.random() * 120);
    }
  }
}

/**
 * Calm meter: rewards standing still, punishes any movement.
 * - Still (speed ≈ 0)        → target 1, steady build toward full calm
 * - Walking (speed ≈ 6)      → target ~0, moderate decay
 * - Sprinting (speed ≈ 11)   → target 0, fast decay
 * Tuned so that stopping visibly refills the bar within ~3 s.
 */
export function stepCalm(dt: number) {
  const s = world.playerSpeed;
  const target = Math.max(0, Math.min(1, 1 - s / 4.5));
  // Faster transitions overall so the bar feels responsive.
  const k = s < 0.5 ? 0.5 : s > 8 ? 1.1 : 0.7;
  world.calm += (target - world.calm) * Math.min(1, k * dt);
}

/** HUD-facing snapshot store (updated on an interval, not every frame). */
interface HUDWorld {
  hour: number; phase: Phase; season: Season; weather: Weather; calm: number; rainT: number; fogT: number; postRainT: number; stormT: number; snowT: number; lightningFlash: number;
  set: (p: Partial<HUDWorld>) => void;
}
export const useHUDWorld = create<HUDWorld>((set) => ({
  hour: 12, phase: 'day', season: 'spring', weather: 'clear', calm: 0.2, rainT: 0, fogT: 0, postRainT: 0, stormT: 0, snowT: 0, lightningFlash: 0,
  set: (p) => set(p),
}));

export type WeatherMode = 'auto' | 'clear' | 'rain' | 'fog' | 'thunderstorm' | 'snow';

export type SeasonMode = 'auto' | Season;

export type TerrainType = 'flat' | 'hilly' | 'mountainous' | 'volcanic' | 'riverlands';

/** User-adjustable settings persisted to localStorage. */
interface Settings {
  realtimeClock: boolean;
  manualHour: number;
  ambienceOn: boolean;  // natural sounds (wind/rain/birds/crickets)
  ambienceVol: number;  // 0..1
  musicOn: boolean;     // relaxing procedural background music
  musicVol: number;     // 0..1
  weatherMode: WeatherMode; // auto: random; clear/rain: forced
  seasonMode: SeasonMode; // auto: follows real date; or manual selection
  terrainType: TerrainType; // flat, hilly, mountainous, volcanic, riverlands
  devMode: boolean;     // developer mode: extra debug/testing features
  setRealtime: (v: boolean) => void;
  setManualHour: (h: number) => void;
  setAmbienceOn: (v: boolean) => void;
  setAmbienceVol: (v: number) => void;
  setMusicOn: (v: boolean) => void;
  setMusicVol: (v: number) => void;
  setWeatherMode: (m: WeatherMode) => void;
  setSeasonMode: (m: SeasonMode) => void;
  setTerrainType: (t: TerrainType) => void;
  setDevMode: (v: boolean) => void;
}
type PersistShape = Pick<Settings, 'realtimeClock' | 'manualHour' | 'ambienceOn' | 'ambienceVol' | 'musicOn' | 'musicVol' | 'weatherMode' | 'seasonMode' | 'terrainType' | 'devMode'>;
const DEFAULTS: PersistShape = {
  realtimeClock: false, manualHour: 13,
  ambienceOn: true, ambienceVol: 0.7,
  musicOn: false, musicVol: 0.5,
  weatherMode: 'auto',
  seasonMode: 'auto',
  terrainType: 'flat',
  devMode: false,
};
const loadSettings = (): PersistShape => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const s = JSON.parse(localStorage.getItem('forest.settings') || 'null');
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s };
  } catch {}
  return DEFAULTS;
};
const persist = (s: PersistShape) => {
  if (typeof window !== 'undefined') {
    try { localStorage.setItem('forest.settings', JSON.stringify(s)); } catch {}
  }
};
const initial = loadSettings();
const snapshot = (g: Settings): PersistShape => ({
  realtimeClock: g.realtimeClock, manualHour: g.manualHour,
  ambienceOn: g.ambienceOn, ambienceVol: g.ambienceVol,
  musicOn: g.musicOn, musicVol: g.musicVol,
  weatherMode: g.weatherMode,
  seasonMode: g.seasonMode,
  terrainType: g.terrainType,
  devMode: g.devMode,
});
export const useSettings = create<Settings>((set, get) => ({
  ...initial,
  setRealtime: (v) => { set({ realtimeClock: v }); persist(snapshot(get())); },
  setManualHour: (h) => { set({ manualHour: Math.max(0, Math.min(23.99, h)) }); persist(snapshot(get())); },
  setAmbienceOn: (v) => { set({ ambienceOn: v }); persist(snapshot(get())); },
  setAmbienceVol: (v) => { set({ ambienceVol: Math.max(0, Math.min(1, v)) }); persist(snapshot(get())); },
  setMusicOn: (v) => { set({ musicOn: v }); persist(snapshot(get())); },
  setMusicVol: (v) => { set({ musicVol: Math.max(0, Math.min(1, v)) }); persist(snapshot(get())); },
  setWeatherMode: (m) => { set({ weatherMode: m }); persist(snapshot(get())); },
  setSeasonMode: (m) => { set({ seasonMode: m }); persist(snapshot(get())); },
  setTerrainType: (t) => { set({ terrainType: t }); persist(snapshot(get())); },
  setDevMode: (v) => { set({ devMode: v }); persist(snapshot(get())); },
}));

export function nearWater(x: number, z: number): boolean {
  return sampledHeight(x, z) < WATER_LEVEL + 0.5;
}
export function submerged(x: number, z: number): boolean {
  return sampledHeight(x, z) < WATER_LEVEL;
}
