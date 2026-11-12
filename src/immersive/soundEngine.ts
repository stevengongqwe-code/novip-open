/**
 * NOVIP Procedural Micro-SFX Engine (Active Theory NavAudioShader Homage)
 * - Zero external audio files (.mp3/.wav) -> zero network overhead.
 * - Pure Web Audio API synthesis (OscillatorNode + BiquadFilterNode + GainNode).
 * - Default muted (respects user quiet environment & browser autoplay policy).
 * - Toggled explicitly via the 3-phase wave oscillator button in ImmersionHeroCore.
 */

const SOUND_STORAGE_KEY = 'novip:sound-enabled:v1';

let sharedAudioCtx: AudioContext | null = null;
let lastHoverTickAt = 0;

export function readStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors in restricted webviews
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx) {
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  }
  const AudioCtxCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxCtor) return null;
  try {
    sharedAudioCtx = new AudioCtxCtor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a welcoming harmonic chime when the user toggles audio ON.
 */
export function playAudioToggleOn(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const freqs = [440, 659.25, 880];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.032, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  } catch {
    // ignore audio synthesis errors
  }
}

/**
 * Ultra-subtle spatial tick when hovering interactive cards or controls.
 */
export function playHoverTick(enabled: boolean): void {
  if (!enabled) return;
  const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowPerf - lastHoverTickAt < 75) return;
  lastHoverTickAt = nowPerf;

  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1280, now);
    osc.frequency.exponentialRampToValueAtTime(1720, now + 0.022);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.setValueAtTime(4.0, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.016, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.026);
  } catch {
    // ignore
  }
}

/**
 * Deep harmonic pulse chord when triggering the 3D holographic orb shockwave.
 */
export function playShockwaveChord(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.38);
    filter.connect(ctx.destination);

    const harmonics = [
      { freq: 110, endFreq: 98, type: 'triangle' as OscillatorType, peak: 0.045 },
      { freq: 220, endFreq: 196, type: 'sine' as OscillatorType, peak: 0.028 },
      { freq: 329.63, endFreq: 330, type: 'sine' as OscillatorType, peak: 0.018 },
    ];

    harmonics.forEach((h) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = h.type;
      osc.frequency.setValueAtTime(h.freq, now);
      osc.frequency.exponentialRampToValueAtTime(h.endFreq, now + 0.36);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(h.peak, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  } catch {
    // ignore
  }
}

/**
 * Crisp two-tone chime when switching visual modes (immersive / daylight / minimal).
 */
export function playModeSwitch(
  enabled: boolean,
  mode: 'immersive' | 'daylight' | 'minimal'
): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const pair =
      mode === 'immersive'
        ? [523.25, 783.99]
        : mode === 'daylight'
          ? [587.33, 880]
          : [440, 329.63];

    pair.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.026, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch {
    // ignore
  }
}
