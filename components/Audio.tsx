'use client';
import { useEffect, useRef } from 'react';
import { world, useSettings } from '@/lib/world';

/**
 * Procedural audio engine with two buses:
 *  - Ambience: wind, rain, birds (day), crickets (night), owl (night)
 *  - Music:    slow relaxing pad on pentatonic chord progression
 *
 * WebAudio context is created lazily on the first pointer-lock (user gesture),
 * then persists for the session. Gains react live to useSettings.
 */
export function Soundscape({ locked }: { locked: boolean }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodes = useRef<any>({});
  const started = useRef(false);
  const mixerTimer = useRef<number | null>(null);
  const birdsTimer = useRef<number | null>(null);
  const musicTimer = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Tear down ONLY on unmount. The effect below must not kill the audio
  // graph when `locked` toggles off (pressing F to open the menu).
  useEffect(() => () => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
  }, []);

  // Resume the audio context whenever pointer-lock is (re-)engaged. Browsers
  // auto-suspend AudioContext when the page loses focus / locks-unlocks-locks,
  // so we nudge it back to "running" on every lock transition.
  useEffect(() => {
    if (locked && ctxRef.current && ctxRef.current.state !== 'running') {
      ctxRef.current.resume().catch(() => {});
    }
  }, [locked]);

  // Kick off on first pointer-lock (user gesture). Subsequent lock/unlock
  // cycles reuse the already-running graph.
  useEffect(() => {
    if (!locked || started.current) return;
    started.current = true;

    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx: AudioContext = new AC();
    ctxRef.current = ctx;
    // Chrome/Safari may create the context in 'suspended' state even from a
    // user-gesture-triggered callback; explicitly resume.
    if (ctx.state !== 'running') ctx.resume().catch(() => {});

    // Master
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // Two bus gains
    const ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
    const musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);

    // ── Shared noise buffer ─────────────────────────────────────
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    {
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    // ── Ambience layers ─────────────────────────────────────────
    const windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuf; windSrc.loop = true;
    const windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 500;
    const windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windLP).connect(windGain).connect(ambBus);
    windSrc.start();

    const rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuf; rainSrc.loop = true;
    const rainHP = ctx.createBiquadFilter(); rainHP.type = 'highpass'; rainHP.frequency.value = 800;
    const rainBP = ctx.createBiquadFilter(); rainBP.type = 'bandpass'; rainBP.frequency.value = 2500; rainBP.Q.value = 0.6;
    const rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(rainHP).connect(rainBP).connect(rainGain).connect(ambBus);
    rainSrc.start();

    const crkSrc = ctx.createBufferSource(); crkSrc.buffer = noiseBuf; crkSrc.loop = true;
    const crkBP = ctx.createBiquadFilter(); crkBP.type = 'bandpass'; crkBP.frequency.value = 4200; crkBP.Q.value = 40;
    const crkGain = ctx.createGain(); crkGain.gain.value = 0;
    crkSrc.connect(crkBP).connect(crkGain).connect(ambBus);
    crkSrc.start();

    // ── Water layers: "muffled-underwater" + splashes while swimming ─
    // Low-passed noise gives that soft "submerged" hush. A separate
    // higher-freq bandpassed layer sputters during strokes for splashes.
    const waterSrc = ctx.createBufferSource(); waterSrc.buffer = noiseBuf; waterSrc.loop = true;
    const waterLP = ctx.createBiquadFilter(); waterLP.type = 'lowpass'; waterLP.frequency.value = 380; waterLP.Q.value = 0.7;
    const waterGain = ctx.createGain(); waterGain.gain.value = 0;
    waterSrc.connect(waterLP).connect(waterGain).connect(ambBus);
    waterSrc.start();

    const splashSrc = ctx.createBufferSource(); splashSrc.buffer = noiseBuf; splashSrc.loop = true;
    const splashBP = ctx.createBiquadFilter(); splashBP.type = 'bandpass'; splashBP.frequency.value = 1800; splashBP.Q.value = 1.2;
    const splashGain = ctx.createGain(); splashGain.gain.value = 0;
    splashSrc.connect(splashBP).connect(splashGain).connect(ambBus);
    splashSrc.start();

    // ── Music pad chain ────────────────────────────────────────
    // Low-pass filter + slow chord voices on pentatonic scale.
    const musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 1800; musicLP.Q.value = 0.4;
    const musicPreGain = ctx.createGain(); musicPreGain.gain.value = 0.6;
    musicLP.connect(musicPreGain).connect(musicBus);

    nodes.current = { master, ambBus, musicBus, windGain, windLP, rainGain, crkGain, musicLP, musicPreGain, waterGain, splashGain };

    // ── Thunder (storm) layer ─────────────────────────────────
    // Thunder uses filtered noise with slow envelope, triggered by lightning flashes.
    let lastThunderFlash = 0;
    function playThunder(now: number, intensity: number) {
      // Main rumble - deep filtered noise
      const thunderSrc = ctx.createBufferSource();
      thunderSrc.buffer = noiseBuf;
      const thunderLP = ctx.createBiquadFilter();
      thunderLP.type = 'lowpass';
      thunderLP.frequency.setValueAtTime(200, now);
      thunderLP.frequency.exponentialRampToValueAtTime(60, now + 3);
      const thunderGain = ctx.createGain();
      thunderGain.gain.setValueAtTime(0, now);
      thunderGain.gain.linearRampToValueAtTime(intensity * 0.7, now + 0.1);
      thunderGain.gain.exponentialRampToValueAtTime(0.001, now + 4 + Math.random() * 2);
      thunderSrc.connect(thunderLP).connect(thunderGain).connect(ambBus);
      thunderSrc.start(now);
      thunderSrc.stop(now + 7);

      // Secondary crack - sharper transient
      const crackSrc = ctx.createBufferSource();
      crackSrc.buffer = noiseBuf;
      const crackHP = ctx.createBiquadFilter();
      crackHP.type = 'highpass';
      crackHP.frequency.value = 800;
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0, now + 0.05);
      crackGain.gain.linearRampToValueAtTime(intensity * 0.4, now + 0.08);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      crackSrc.connect(crackHP).connect(crackGain).connect(ambBus);
      crackSrc.start(now + 0.05);
      crackSrc.stop(now + 1);
    }

    // ── Bird chirp scheduler (ambience) ────────────────────────
    function chirp(when: number, f0: number, f1: number, dur: number, vol: number, dest: AudioNode) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, f1), when + dur);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g).connect(dest);
      osc.start(when); osc.stop(when + dur + 0.05);
    }

    const scheduleBirds = () => {
      if (!useSettings.getState().ambienceOn) return;
      const t = ctx.currentTime;
      const h = world.hour;
      const active = (h >= 5.5 && h < 11) ? 1 : (h >= 11 && h < 17) ? 0.5 : (h >= 17 && h < 19.5) ? 0.4 : 0;
      const calm = world.calm;
      const rate = active * (0.4 + calm * 1.4);
      const rain = world.rainT;
      const vol = (0.04 + calm * 0.09) * (1 - rain * 0.9);
      if (active > 0 && Math.random() < rate * 0.5) {
        const f0 = 1800 + Math.random() * 1800;
        chirp(t + 0.01, f0, f0 * 1.6, 0.08, vol, ambBus);
        if (Math.random() < 0.6) chirp(t + 0.16, f0 * 1.1, f0 * 0.9, 0.09, vol * 0.9, ambBus);
      }
      // Night-time wildlife chorus - diverse nocturnal animals
      const isNight = h < 5.2 || h > 20;
      if (isNight && rain < 0.3) {
        const nightIntensity = h > 22 || h < 4 ? 1 : 0.6; // deeper night = more sounds
        const baseVol = 0.06 * nightIntensity * (0.5 + calm * 0.8);

        // Owl hoots - deep, resonant, rhythmic (hoot-hoot pattern)
        if (Math.random() < 0.025 * nightIntensity) {
          const f0 = 280 + Math.random() * 60; // 280-340Hz deep hoot
          const owlDelay = 0.6 + Math.random() * 0.4;
          chirp(t + 0.05, f0, f0 * 0.95, 0.35, baseVol * 1.2, ambBus);
          chirp(t + 0.05 + owlDelay, f0, f0 * 0.95, 0.35, baseVol * 1.2, ambBus);
          if (Math.random() < 0.4) {
            chirp(t + 0.05 + owlDelay * 2, f0 * 0.98, f0 * 0.93, 0.3, baseVol * 1.0, ambBus);
          }
        }

        // Distant wolf howls - haunting, rising-falling
        if (Math.random() < 0.008 * nightIntensity) {
          const wolfGain = ctx.createGain();
          wolfGain.gain.setValueAtTime(0, t);
          wolfGain.gain.linearRampToValueAtTime(baseVol * 0.8, t + 0.5);
          wolfGain.gain.exponentialRampToValueAtTime(0.001, t + 4);
          const wolfOsc = ctx.createOscillator();
          wolfOsc.type = 'sawtooth';
          wolfOsc.frequency.setValueAtTime(180, t);
          wolfOsc.frequency.linearRampToValueAtTime(220, t + 1.5);
          wolfOsc.frequency.linearRampToValueAtTime(180, t + 3);
          const wolfLP = ctx.createBiquadFilter();
          wolfLP.type = 'lowpass';
          wolfLP.frequency.value = 400;
          wolfOsc.connect(wolfLP).connect(wolfGain).connect(ambBus);
          wolfOsc.start(t);
          wolfOsc.stop(t + 4);
        }

        // Frog chorus - low croaks in the distance
        if (Math.random() < 0.04 * nightIntensity) {
          const frogF = 120 + Math.random() * 40; // 120-160Hz
          chirp(t + 0.02, frogF, frogF * 0.9, 0.12, baseVol * 0.9, ambBus);
          if (Math.random() < 0.5) {
            chirp(t + 0.25, frogF * 1.1, frogF, 0.1, baseVol * 0.7, ambBus);
          }
        }

        // Toad calls - higher pitched, short chirps
        if (Math.random() < 0.02 * nightIntensity) {
          chirp(t, 450, 420, 0.06, baseVol * 0.6, ambBus);
          chirp(t + 0.08, 450, 420, 0.06, baseVol * 0.5, ambBus);
        }

        // Badger grunts - very low, brief (rare)
        if (Math.random() < 0.005 * nightIntensity) {
          const gruntGain = ctx.createGain();
          gruntGain.gain.setValueAtTime(baseVol * 0.7, t);
          gruntGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          const gruntOsc = ctx.createOscillator();
          gruntOsc.type = 'sawtooth';
          gruntOsc.frequency.setValueAtTime(90, t);
          gruntOsc.frequency.linearRampToValueAtTime(70, t + 0.15);
          const gruntLP = ctx.createBiquadFilter();
          gruntLP.type = 'lowpass';
          gruntLP.frequency.value = 200;
          gruntOsc.connect(gruntLP).connect(gruntGain).connect(ambBus);
          gruntOsc.start(t);
          gruntOsc.stop(t + 0.2);
        }

        // Nightingale / distant night birds - occasional high pitched calls
        if (Math.random() < 0.015 * nightIntensity) {
          const f0 = 800 + Math.random() * 400;
          chirp(t, f0, f0 * 1.1, 0.08, baseVol * 0.5, ambBus);
          chirp(t + 0.12, f0 * 1.05, f0 * 1.15, 0.06, baseVol * 0.4, ambBus);
          chirp(t + 0.24, f0 * 0.98, f0 * 1.08, 0.08, baseVol * 0.45, ambBus);
        }
      }
      // Deep-calm daytime chorus: when the player has held still long enough,
      // a rare distant "choir" of 3-4 chirps layered together, panning away.
      if (calm >= 0.9 && active > 0 && rain < 0.2 && Math.random() < 0.035) {
        const base = 1400 + Math.random() * 1400;
        const v = 0.06;
        chirp(t + 0.05, base, base * 1.5, 0.1, v, ambBus);
        chirp(t + 0.18, base * 0.88, base * 1.4, 0.11, v * 0.9, ambBus);
        chirp(t + 0.34, base * 1.12, base * 1.7, 0.09, v * 0.85, ambBus);
        if (Math.random() < 0.5) chirp(t + 0.55, base * 0.8, base * 1.3, 0.12, v * 0.75, ambBus);
      }
    };
    birdsTimer.current = window.setInterval(scheduleBirds, 500);

    // ── Music: slow pentatonic pad ─────────────────────────────
    // Chord progression (A minor pentatonic-ish, relaxing). Each entry is a set of MIDI notes.
    const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const CHORDS: number[][] = [
      [57, 60, 64, 67], // Am7 (A C E G)
      [55, 59, 62, 65], // G maj7-ish (G B D F)
      [53, 57, 60, 64], // Fmaj7 (F A C E)
      [52, 55, 59, 62], // Em7 (E G B D)
    ];

    const playChord = (notes: number[], when: number, dur: number, vol: number) => {
      for (let i = 0; i < notes.length; i++) {
        const freq = midiToHz(notes[i]);
        // Two detuned sines per note for chorus
        for (let j = 0; j < 2; j++) {
          const osc = ctx.createOscillator();
          osc.type = j === 0 ? 'sine' : 'triangle';
          const detune = (j === 0 ? -4 : 4) + (i * 1.5);
          osc.frequency.value = freq;
          osc.detune.value = detune;
          const g = ctx.createGain();
          const peak = vol * (j === 0 ? 0.9 : 0.35) / notes.length;
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(peak, when + dur * 0.35);
          g.gain.linearRampToValueAtTime(peak * 0.7, when + dur * 0.7);
          g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
          osc.connect(g).connect(musicLP);
          osc.start(when);
          osc.stop(when + dur + 0.1);
        }
      }
      // Sparkle: occasional high bell tone on melody note
      if (Math.random() < 0.4) {
        const melody = [69, 72, 76, 74][Math.floor(Math.random() * 4)];
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = midiToHz(melody + 12);
        const g = ctx.createGain();
        const start = when + dur * 0.3 + Math.random() * dur * 0.4;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(vol * 0.12, start + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 2.0);
        osc.connect(g).connect(musicLP);
        osc.start(start);
        osc.stop(start + 2.1);
      }
    };

    let chordIdx = 0;
    const CHORD_DUR = 8; // seconds per chord
    const scheduleMusic = () => {
      if (!useSettings.getState().musicOn) return;
      const t = ctx.currentTime;
      playChord(CHORDS[chordIdx % CHORDS.length], t + 0.05, CHORD_DUR + 1, 0.28);
      chordIdx++;
    };
    // Prime one chord immediately, then schedule.
    scheduleMusic();
    musicTimer.current = window.setInterval(scheduleMusic, CHORD_DUR * 1000);

    // ── Live mixer (reads settings + world each 150ms) ─────────
    const tick = () => {
      if (!ctxRef.current) return;
      const now = ctx.currentTime;
      const s = useSettings.getState();
      const calm = world.calm;

      // Deep-calm immersion: at very high calm (>=0.85) we gently warm up
      // both ambience and music so the player feels "inside" the soundscape.
      const deepCalm = Math.max(0, calm - 0.85) / 0.15; // 0..1 in 0.85..1.0
      const ambBoost = 1 + deepCalm * 0.18;
      const musicBoost = 1 + deepCalm * 0.1;

      // Bus gains with smoothing
      ambBus.gain.linearRampToValueAtTime(s.ambienceOn ? s.ambienceVol * ambBoost : 0, now + 0.4);
      musicBus.gain.linearRampToValueAtTime(s.musicOn ? s.musicVol * 0.55 * musicBoost : 0, now + 0.8);

      // Ambience sub-layers (reactive to world)
      const rain = world.rainT;
      const storm = world.stormT;
      const h = world.hour;
      const night = h >= 20 || h < 5;

      // Storm makes wind much stronger and more dramatic
      const isStorm = storm > 0.3;
      const windBase = 0.2 + world.windStrength * 0.15 + rain * 0.15 + (isStorm ? 0.25 : 0);
      windGain.gain.linearRampToValueAtTime(windBase * (0.6 + calm * 0.4) * (isStorm ? 1.4 : 1), now + 0.4);
      windLP.frequency.linearRampToValueAtTime(300 + world.windStrength * 400 + (isStorm ? 200 : 0), now + 0.4);

      // Rain is louder during storms, and has more high-frequency content
      const rainVol = rain * (isStorm ? 0.75 : 0.55);
      rainGain.gain.linearRampToValueAtTime(rainVol, now + 0.25);
      // Storm rain sounds sharper - adjust filter
      if (isStorm) {
        rainHP.frequency.linearRampToValueAtTime(600, now + 0.3);
        rainBP.frequency.linearRampToValueAtTime(2800, now + 0.3);
      } else {
        rainHP.frequency.linearRampToValueAtTime(800, now + 0.3);
        rainBP.frequency.linearRampToValueAtTime(2500, now + 0.3);
      }

      const crkTarget = night ? 0.12 + calm * 0.12 : 0;
      const pulse = 0.5 + 0.5 * Math.sin(now * 18);
      crkGain.gain.linearRampToValueAtTime(crkTarget * pulse, now + 0.15);

      // Water: smooth hush while submerged; splash sputter tracks movement.
      const inWater = world.inWater ? 1 : 0;
      waterGain.gain.linearRampToValueAtTime(inWater * 0.5, now + 0.25);
      // Swim speed is roughly world.playerSpeed while in water (SWIM_SPEED_MUL already applied).
      const swimMove = inWater * Math.min(1, world.playerSpeed / 3);
      const swimPulse = 0.35 + 0.65 * Math.abs(Math.sin(now * 3.2));
      splashGain.gain.linearRampToValueAtTime(swimMove * swimPulse * 0.35, now + 0.12);

      // Thunder trigger - detect rising edge of lightningFlash
      if (world.lightningFlash > 0.5 && lastThunderFlash <= 0.5 && s.ambienceOn) {
        // Random delay 0.1-0.5s for distance effect, then thunder
        const delay = 0.1 + Math.random() * 0.4;
        playThunder(now + delay, Math.min(1, s.ambienceVol * (0.6 + Math.random() * 0.4)));
      }
      lastThunderFlash = world.lightningFlash;

      mixerTimer.current = window.setTimeout(tick, 150) as unknown as number;
    };
    tick();

    cleanupRef.current = () => {
      if (mixerTimer.current) clearTimeout(mixerTimer.current);
      if (birdsTimer.current) clearInterval(birdsTimer.current);
      if (musicTimer.current) clearInterval(musicTimer.current);
      try { ctx.close(); } catch {}
    };
  }, [locked]);

  return null;
}
