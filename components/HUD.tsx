'use client';
import { useState, useEffect } from 'react';
import { useGame, PLANT_LABELS, PLANT_HINT, PlantKind } from '@/lib/store';
import { useHUDWorld, useSettings, requestGeolocation, getLocalSunsetTime, getRealSeason, Season, SeasonMode, TerrainType, getMoonIcon } from '@/lib/world';
import { WORLD_SEED, rerollWorldSeed } from '@/lib/noise';
import { useNPC, DevNPC, NPCKind, NPC_PROFILES } from '@/lib/npc';

/**
 * Capture the WebGL canvas to a PNG and save it to disk.
 * Tries the modern File System Access API (Chrome/Edge) so the user can
 * pick Desktop as the save location. Falls back to a plain download into
 * the browser's default folder (usually `~/Downloads`) on other browsers.
 *
 * Requires the Canvas to be initialised with `preserveDrawingBuffer: true`,
 * otherwise the drawing buffer is already cleared by the next frame.
 */
async function takeScreenshot(onDone: (filename: string) => void) {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `infinite-forest-${ts}.png`;
  await new Promise<void>((resolve) =>
    canvas.toBlob(async (blob) => {
      if (!blob) return resolve();
      const anyWin = window as unknown as {
        showSaveFilePicker?: (opts: unknown) => Promise<{
          createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>;
        }>;
      };
      if (typeof anyWin.showSaveFilePicker === 'function') {
        try {
          const handle = await anyWin.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          onDone(filename);
          return resolve();
        } catch {
          // User cancelled or API unavailable — fall through to download.
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onDone(filename);
      resolve();
    }, 'image/png'),
  );
}

const PHASE_LABEL: Record<string, string> = {
  night: 'Night', dawn: 'Dawn', morning: 'Morning', day: 'Day', evening: 'Evening', dusk: 'Dusk',
};
const WEATHER_LABEL: Record<string, string> = {
  clear: 'Clear', rain: 'Rain', fog: 'Fog', postRain: 'After rain', thunderstorm: 'Thunderstorm', snow: 'Snow',
};

const TERRAIN_LABEL: Record<TerrainType, string> = {
  flat: 'Flat Forest',
  hilly: 'Hilly',
  mountainous: 'Mountainous',
  volcanic: 'Volcanic',
  riverlands: 'Riverlands',
};

const PRESETS: { label: string; hour: number }[] = [
  { label: 'Dawn', hour: 6.5 },
  { label: 'Day', hour: 13 },
  { label: 'Dusk', hour: 18.5 },
  { label: 'Night', hour: 22 },
];

function fmtTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function fmtSpeed(ms: number): string {
  // Convert m/s to km/h
  const kmh = ms * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

function releaseMouse() {
  if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
}

// Pointer lock is handled by drei's PointerLockControls via the
// `selector=".enter-forest"` prop — clicking the Enter button engages it.

export function HUD({ locked }: { locked: boolean }) {
  const inventory = useGame((s) => s.inventory);
  const nearbyKind = useGame((s) => s.nearbyPlantKind);
  const total = (Object.values(inventory) as number[]).reduce((a: number, b: number) => a + b, 0);

  const hour = useHUDWorld((s) => s.hour);
  const phase = useHUDWorld((s) => s.phase);
  const weather = useHUDWorld((s) => s.weather);
  const calm = useHUDWorld((s) => s.calm);
  const rainT = useHUDWorld((s) => s.rainT);
  const fogT = useHUDWorld((s) => s.fogT);
  const snowT = useHUDWorld((s) => s.snowT);
  const stormT = useHUDWorld((s) => s.stormT);
  const lightningFlash = useHUDWorld((s) => s.lightningFlash);

  const realtimeClock = useSettings((s) => s.realtimeClock);
  const manualHour = useSettings((s) => s.manualHour);
  const setRealtime = useSettings((s) => s.setRealtime);
  const setManualHour = useSettings((s) => s.setManualHour);
  const ambienceOn = useSettings((s) => s.ambienceOn);
  const ambienceVol = useSettings((s) => s.ambienceVol);
  const musicOn = useSettings((s) => s.musicOn);
  const musicVol = useSettings((s) => s.musicVol);
  const setAmbienceOn = useSettings((s) => s.setAmbienceOn);
  const setAmbienceVol = useSettings((s) => s.setAmbienceVol);
  const setMusicOn = useSettings((s) => s.setMusicOn);
  const setMusicVol = useSettings((s) => s.setMusicVol);
  const weatherMode = useSettings((s) => s.weatherMode);
  const setWeatherMode = useSettings((s) => s.setWeatherMode);
  const seasonMode = useSettings((s) => s.seasonMode);
  const setSeasonMode = useSettings((s) => s.setSeasonMode);
  const terrainType = useSettings((s) => s.terrainType);
  const setTerrainType = useSettings((s) => s.setTerrainType);
  const devMode = useSettings((s) => s.devMode);
  const setDevMode = useSettings((s) => s.setDevMode);
  const weatherLevel = weather === 'rain' ? rainT : weather === 'fog' ? fogT : weather === 'snow' ? snowT : 0;
  const altitude = useHUDWorld((s) => s.altitude);
  // Exploration stats
  const distanceTraveled = useHUDWorld((s) => s.distanceTraveled);
  const playerSpeed = useHUDWorld((s) => s.playerSpeed);
  const facing = useHUDWorld((s) => s.facing);
  const posX = useHUDWorld((s) => s.posX);
  const posZ = useHUDWorld((s) => s.posZ);
  // Progress stats
  const sessionTime = useHUDWorld((s) => s.sessionTime);
  const plantsCollected = useHUDWorld((s) => s.plantsCollected);
  // Environmental stats
  const temperature = useHUDWorld((s) => s.temperature);
  const moonPhase = useHUDWorld((s) => s.moonPhase);

  // Get current season (auto from real time or manual)
  const season = useHUDWorld((s) => s.season);
  const effectiveSeason: Season = seasonMode === 'auto' ? getRealSeason() : seasonMode;

  // Dev mode NPC spawning
  const spawnDevNPC = useNPC((s) => s.spawnDevNPC);
  const devNPC = useNPC((s) => s.devNPC);

  const [toast, setToast] = useState<string | null>(null);
  const onScreenshot = () => {
    takeScreenshot((name) => {
      setToast(`Saved ${name}`);
      setTimeout(() => setToast(null), 2000);
    });
  };

  // Keyboard shortcut P — snapshot without pausing the game.
  // Keyboard shortcut F — toggle menu (re-enter game when menu is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' && !e.repeat) onScreenshot();
      // When menu is open (locked=false), pressing F re-enters the game
      if (e.code === 'KeyF' && !e.repeat && !locked) {
        const enterBtn = document.querySelector('.enter-forest') as HTMLButtonElement | null;
        if (enterBtn) enterBtn.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);

  const kinds = Object.keys(inventory) as PlantKind[];

  return (
    <>
      <div className="hud">
        <div className="top-bar">
          <div className="panel inventory">
            <h3>Satchel · {total}</h3>
            <ul>
              {kinds.map((k) => (
                <li key={k}>
                  <span>{PLANT_LABELS[k]}</span>
                  <span>{inventory[k]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel world-info">
            <div className="clock">{fmtTime(hour)} · {PHASE_LABEL[phase] ?? phase}</div>
            <div className="season">{effectiveSeason.charAt(0).toUpperCase() + effectiveSeason.slice(1)}</div>
            <div className="altitude">⛰️ {altitude.toFixed(1)}m</div>
            <div className="temperature">🌡️ {temperature.toFixed(1)}°C</div>
            <div className="moon">{getMoonIcon(moonPhase)} {['New','Waxing','Quarter','Gibbous','Full','Waning','Last','Crescent'][moonPhase]}</div>
            
            {/* Exploration Stats */}
            <div className="exploration-stats" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div>🚶 {fmtDistance(distanceTraveled)} · ⚡ {fmtSpeed(playerSpeed)}</div>
              <div style={{ fontSize: '0.85em', opacity: 0.8 }}>🧭 {facing} · 📍 {Math.round(posX)},{Math.round(posZ)}</div>
            </div>
            
            {/* Progress Stats */}
            <div className="progress-stats" style={{ marginTop: '6px', fontSize: '0.85em', opacity: 0.8 }}>
              ⏱️ {fmtDuration(sessionTime)} · 🌿 {plantsCollected} piante
            </div>
            
            {realtimeClock && (() => {
              const sunset = getLocalSunsetTime();
              return (
                <div className="sunset" style={{ fontSize: '0.75em', opacity: 0.8 }}>
                  Sunset ~{Math.floor(sunset.hour)}:{Math.round((sunset.hour % 1) * 60).toString().padStart(2, '0')}
                  {sunset.hasLocation ? '📍' : ' (default)'}
                </div>
              );
            })()}
            <div className="weather">
              {WEATHER_LABEL[weather] || weather}
              {(weather === 'rain' || weather === 'fog' || weather === 'thunderstorm' || weather === 'snow') && (
                <span className="rain-bar">
                  <span style={{ width: `${Math.round(weatherLevel * 100)}%`, background: weather === 'thunderstorm' ? '#c8a0d8' : weather === 'snow' ? '#e0e8f0' : undefined }} />
                </span>
              )}
              {lightningFlash > 0.1 && <span className="lightning-indicator">⚡</span>}
            </div>
            <div className="calm">
              <span>{calm >= 0.9 ? 'Calma profonda' : 'Calm'}</span>
              <span className="calm-bar"><span style={{ width: `${Math.round(calm * 100)}%` }} /></span>
            </div>
          </div>
        </div>
        <div className="bottom-bar">
          <div className="panel controls">
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump · <kbd>E</kbd> collect · <kbd>P</kbd> screenshot</div>
            <div><strong>Press <kbd>F</kbd> to toggle menu · <kbd>Esc</kbd> to exit</strong></div>
            <div className="hint">Move slowly — calm reveals more wildlife and sound.</div>
          </div>
        </div>
        {locked && (
          <div className="release-hint">Press <kbd>F</kbd> to toggle menu · <kbd>Esc</kbd> to exit</div>
        )}
        {toast && <div className="screenshot-toast">{toast}</div>}
        {locked && <div className="crosshair" />}
        {locked && nearbyKind && (
          <div className="prompt">
            <div className="prompt-title">Press <kbd>E</kbd> to collect <strong>{PLANT_LABELS[nearbyKind]}</strong></div>
            <div className="prompt-hint">{PLANT_HINT[nearbyKind]}</div>
          </div>
        )}
      </div>
      {!locked && (
        <div className="overlay">
          <div className="card">
            <h1>Infinite Forest</h1>
            <p className="lede">A living, procedural wood. Collect plants, watch wildlife, walk softly.</p>

            <section className="settings">
              <div className="section-head">Time</div>
              <div className="field">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={realtimeClock}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setRealtime(enabled);
                      if (enabled) {
                        requestGeolocation(); // Get location for accurate sunset
                      }
                    }}
                  />
                  <span className="t-label">Sync to real time</span>
                  <span className={`pill ${realtimeClock ? 'on' : ''}`}>
                    {realtimeClock ? `${fmtTime(hour)}` : 'off'}
                  </span>
                </label>
              </div>

              {!realtimeClock && (
                <div className="field manual-time">
                  <div className="manual-label">
                    <span>Time of day</span>
                    <strong>{fmtTime(manualHour)} · {PHASE_LABEL[phase] ?? ''}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={23.9}
                    step={0.25}
                    value={manualHour}
                    onChange={(e) => setManualHour(Number(e.target.value))}
                  />
                  <div className="presets">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        className={Math.abs(manualHour - p.hour) < 0.01 ? 'active' : ''}
                        onClick={() => setManualHour(p.hour)}
                      >{p.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="settings">
              <div className="section-head">Weather</div>
              <div className="field">
                <div className="manual-label">
                  <span>Current atmosphere</span>
                  <strong>{WEATHER_LABEL[weather] ?? weather}</strong>
                </div>
                <div className="presets weather-presets">
                  {(['auto', 'clear', 'rain', 'fog', 'snow', 'thunderstorm'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={weatherMode === m ? 'active' : ''}
                      onClick={() => setWeatherMode(m)}
                    >{m === 'auto' ? 'Auto' : m === 'clear' ? 'Clear' : m === 'rain' ? 'Rain' : m === 'fog' ? 'Fog' : m === 'snow' ? '❄️ Snow' : 'Storm'}</button>
                  ))}
                </div>
              </div>
            </section>

            <section className="settings">
              <div className="section-head">Season</div>
              <div className="field">
                <div className="manual-label">
                  <span>Current season</span>
                  <strong>{effectiveSeason.charAt(0).toUpperCase() + effectiveSeason.slice(1)}</strong>
                </div>
                <div className="presets">
                  {(['auto', 'spring', 'summer', 'autumn', 'winter'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={seasonMode === m ? 'active' : ''}
                      onClick={() => setSeasonMode(m)}
                    >{m === 'auto' ? 'Auto' : m.charAt(0).toUpperCase() + m.slice(1)}</button>
                  ))}
                </div>
              </div>
            </section>

            <section className="settings">
              <div className="section-head">Terrain Type</div>
              <div className="field">
                <div className="manual-label">
                  <span>Landscape style</span>
                  <strong>{TERRAIN_LABEL[terrainType]}</strong>
                </div>
                <div className="presets terrain-presets">
                  {(['flat', 'hilly', 'mountainous', 'volcanic', 'riverlands'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={terrainType === t ? 'active' : ''}
                      onClick={() => {
                        if (terrainType !== t) {
                          setTerrainType(t);
                          // Reload to regenerate world with new terrain
                          setTimeout(() => window.location.reload(), 50);
                        }
                      }}
                      title={t === 'flat' ? 'Gentle rolling forest (default)' :
                             t === 'hilly' ? 'More pronounced hills' :
                             t === 'mountainous' ? 'Tall mountains and peaks' :
                             t === 'volcanic' ? 'Dark, rough terrain' :
                             'Flat land with rivers and lakes'}
                    >
                      {t === 'flat' ? '🌲 Flat' :
                       t === 'hilly' ? '⛰️ Hilly' :
                       t === 'mountainous' ? '🏔️ Mountains' :
                       t === 'volcanic' ? '🌋 Volcanic' :
                       '🌊 Riverlands'}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="settings">
              <div className="section-head">World</div>
              <div className="field">
                <div className="manual-label">
                  <span>Seed</span>
                  <strong style={{ fontFamily: 'monospace' }}>{WORLD_SEED}</strong>
                </div>
                <button
                  type="button"
                  className="screenshot-btn"
                  onClick={rerollWorldSeed}
                >
                  🌱 New world
                  <em>Reload with a fresh random seed</em>
                </button>
              </div>
            </section>

            <section className="settings">
              <div className="section-head">Capture</div>
              <div className="field">
                <button
                  type="button"
                  className="screenshot-btn"
                  onClick={onScreenshot}
                >
                  📸 Take screenshot
                  <em>Saved as PNG · hotkey <kbd>P</kbd></em>
                </button>
              </div>
            </section>

            <section className="settings">
              <div className="section-head">Audio</div>
              <div className="field">
                <label className="toggle">
                  <input type="checkbox" checked={ambienceOn} onChange={(e) => setAmbienceOn(e.target.checked)} />
                  <span className="t-label">
                    Ambience sounds
                    <em>wind · birds · rain</em>
                  </span>
                  <span className={`pill ${ambienceOn ? 'on' : ''}`}>{ambienceOn ? 'on' : 'off'}</span>
                </label>
                {ambienceOn && (
                  <div className="vol-row">
                    <span className="vol-label">Volume</span>
                    <input type="range" min={0} max={1} step={0.01} value={ambienceVol} onChange={(e) => setAmbienceVol(Number(e.target.value))} />
                    <span className="vol-num">{Math.round(ambienceVol * 100)}</span>
                  </div>
                )}
              </div>

              <div className="field">
                <label className="toggle">
                  <input type="checkbox" checked={musicOn} onChange={(e) => setMusicOn(e.target.checked)} />
                  <span className="t-label">
                    Background music
                    <em>relaxing pad</em>
                  </span>
                  <span className={`pill ${musicOn ? 'on' : ''}`}>{musicOn ? 'on' : 'off'}</span>
                </label>
                {musicOn && (
                  <div className="vol-row">
                    <span className="vol-label">Volume</span>
                    <input type="range" min={0} max={1} step={0.01} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} />
                    <span className="vol-num">{Math.round(musicVol * 100)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Dev Mode Section - only visible when enabled */}
            <section className="settings">
              <div className="field">
                <label className="toggle">
                  <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
                  <span className="t-label">
                    Dev Mode
                    <em>testing features</em>
                  </span>
                  <span className={`pill ${devMode ? 'on' : ''}`}>{devMode ? 'on' : 'off'}</span>
                </label>
              </div>

              {devMode && (
                <div className="field dev-spawn">
                  <button
                    type="button"
                    className="screenshot-btn"
                    onClick={() => {
                      if (devNPC) return; // Already spawned
                      // Pick random NPC kind
                      const kinds = Object.keys(NPC_PROFILES) as NPCKind[];
                      const kind = kinds[Math.floor(Math.random() * kinds.length)];
                      // Create NPC - actual spawn position will be calculated by NPCs component
                      // using current player position as reference
                      const npc: DevNPC = {
                        id: 'dev-npc-' + Date.now(),
                        kind,
                        x: 0, // placeholder, NPCs will set actual position
                        z: 0,
                        cx: 0,
                        cz: 0,
                        targetX: 0, // 0,0 means "use current player pos as target"
                        targetZ: 0,
                        speed: 2.5, // walking speed
                      };
                      spawnDevNPC(npc);
                    }}
                    disabled={!!devNPC}
                  >
                    {devNPC ? '⏳ NPC approaching...' : '🚶 Spawn NPC'}
                    <em>{devNPC ? 'Wait for them to arrive' : 'Spawns nearby and walks to you'}</em>
                  </button>
                </div>
              )}
            </section>

            <button type="button" className="enter enter-forest">Enter forest</button>
            <p className="footnote">Press <kbd>F</kbd> to toggle menu · Press <kbd>Esc</kbd> to exit</p>
          </div>
        </div>
      )}
    </>
  );
}
