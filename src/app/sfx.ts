/**
 * Procedural neon / cyberpunk SE + dark EDM BGM (Web Audio, no assets).
 * Cool mode synths — not realistic gun sim.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let seBus: GainNode | null = null;
let bgmBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

export type BgmMode = 'off' | 'menu' | 'battle';

let bgmMode: BgmMode = 'off';
let bgmTimer: number | null = null;
let bgmNext = 0;
let bgmStep = 0;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    stopBgmLoop();
    if (master) master.gain.value = 0;
  } else if (master) {
    master.gain.value = 1;
    if (bgmMode !== 'off') startBgmLoop();
  }
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1;
    seBus = ctx.createGain();
    seBus.gain.value = 0.52;
    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0.22;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    seBus.connect(comp);
    bgmBus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a user gesture to unlock audio on mobile. */
export function unlockAudio() {
  const c = ac();
  if (c && bgmMode !== 'off' && enabled) startBgmLoop();
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + Math.max(0.004, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function bus(): GainNode {
  return seBus!;
}

function noise(
  c: AudioContext,
  t: number,
  dur: number,
  filterType: BiquadFilterType,
  freq: number,
  peak: number,
  freqEnd?: number,
  dest: GainNode = bus(),
) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.Q.value = filterType === 'bandpass' ? 4 : 1;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
  const g = c.createGain();
  env(g, t, peak, 0.004, dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.06);
}

function tone(
  c: AudioContext,
  t: number,
  type: OscillatorType,
  freq: number,
  dur: number,
  peak: number,
  freqEnd?: number,
  attack = 0.006,
  dest: GainNode = bus(),
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  const g = c.createGain();
  env(g, t, peak, attack, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

/** Soft FM chirp — neon UI / sci-fi ping. */
function chirp(c: AudioContext, t: number, f0: number, f1: number, dur: number, peak: number, dest: GainNode = bus()) {
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modG = c.createGain();
  const g = c.createGain();
  car.type = 'sine';
  mod.type = 'sine';
  car.frequency.setValueAtTime(f0, t);
  car.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  mod.frequency.setValueAtTime(f0 * 2.01, t);
  modG.gain.setValueAtTime(f0 * 0.35, t);
  modG.gain.exponentialRampToValueAtTime(8, t + dur);
  env(g, t, peak, 0.004, dur);
  mod.connect(modG).connect(car.frequency);
  car.connect(g).connect(dest);
  mod.start(t);
  car.start(t);
  mod.stop(t + dur + 0.05);
  car.stop(t + dur + 0.05);
}

/** Metallic filtered saw sweep. */
function neonSweep(c: AudioContext, t: number, f0: number, f1: number, dur: number, peak: number) {
  const o = c.createOscillator();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(f0 * 3, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, f1 * 2), t + dur);
  env(g, t, peak, 0.01, dur);
  o.connect(f).connect(g).connect(bus());
  o.start(t);
  o.stop(t + dur + 0.06);
}

function click(c: AudioContext, t: number, peak = 0.12) {
  noise(c, t, 0.03, 'highpass', 5000, peak);
  tone(c, t, 'square', 2400, 0.025, peak * 0.6, 900);
}

export type ShotKind = 'smg' | 'ar' | 'sg' | 'sr' | 'lmg' | 'knife' | 'pistol' | 'armor';

export const sfx = {
  shot(kind: ShotKind = 'pistol') {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    switch (kind) {
      case 'sr':
        neonSweep(c, t, 1800, 220, 0.22, 0.28);
        noise(c, t, 0.35, 'bandpass', 4200, 0.55, 600);
        tone(c, t, 'sine', 70, 0.4, 0.55, 32);
        chirp(c, t + 0.02, 3200, 880, 0.35, 0.12);
        break;
      case 'sg':
        noise(c, t, 0.22, 'bandpass', 1800, 0.7, 280);
        noise(c, t, 0.18, 'highpass', 6000, 0.25);
        tone(c, t, 'sine', 85, 0.28, 0.5, 40);
        break;
      case 'smg':
      case 'lmg':
        for (let i = 0; i < (kind === 'lmg' ? 4 : 3); i++) {
          const ti = t + i * 0.048;
          noise(c, ti, 0.05, 'bandpass', 2800, 0.38, 900);
          tone(c, ti, 'square', 420 - i * 20, 0.04, 0.14, 120);
          click(c, ti, 0.08);
        }
        break;
      case 'knife':
        chirp(c, t, 2800, 600, 0.1, 0.18);
        noise(c, t, 0.08, 'highpass', 7000, 0.22);
        break;
      default:
        noise(c, t, 0.1, 'bandpass', 2400, 0.48, 500);
        tone(c, t, 'triangle', 180, 0.1, 0.28, 55);
        click(c, t, 0.1);
    }
  },

  headshot() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + 0.02;
    chirp(c, t, 2200, 4400, 0.18, 0.22);
    tone(c, t, 'sine', 1760, 0.35, 0.2);
    tone(c, t + 0.04, 'sine', 2637, 0.28, 0.14);
    tone(c, t + 0.08, 'triangle', 3520, 0.2, 0.08);
    noise(c, t, 0.12, 'highpass', 8000, 0.15);
  },

  hit() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'square', 280, 0.04, 0.1, 140);
    noise(c, t, 0.05, 'bandpass', 1600, 0.18);
  },

  kill() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sine', 110, 0.22, 0.42, 48);
    chirp(c, t + 0.04, 880, 1760, 0.14, 0.16);
    neonSweep(c, t + 0.02, 600, 180, 0.18, 0.12);
  },

  explosion(big = false) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const dur = big ? 1.8 : 0.7;
    noise(c, t, dur, 'lowpass', big ? 2400 : 1600, big ? 0.9 : 0.7, 60);
    noise(c, t, dur * 0.4, 'highpass', 5000, big ? 0.35 : 0.2);
    tone(c, t, 'sine', big ? 55 : 75, dur * 0.85, big ? 0.85 : 0.55, 22);
    if (big) {
      neonSweep(c, t + 0.05, 900, 120, 0.6, 0.2);
      chirp(c, t + 0.1, 600, 80, 0.8, 0.15);
    }
  },

  flash() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.08, 'highpass', 4000, 0.55);
    chirp(c, t, 4000, 8000, 0.15, 0.2);
    tone(c, t + 0.06, 'sine', 3600, 0.9, 0.1, 2800, 0.02);
  },

  smoke() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 1.0, 'bandpass', 700, 0.28, 220);
    tone(c, t, 'sine', 90, 0.6, 0.12, 50);
  },

  fire() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.7, 'bandpass', 1100, 0.4, 400);
    noise(c, t + 0.08, 0.45, 'highpass', 5500, 0.14);
    tone(c, t, 'sawtooth', 140, 0.35, 0.12, 70);
  },

  plant() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) {
      click(c, t + i * 0.1, 0.14);
      tone(c, t + i * 0.1, 'square', 1600 + i * 80, 0.04, 0.1);
    }
  },

  defuse() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    chirp(c, t, 660, 1320, 0.12, 0.2);
    chirp(c, t + 0.12, 990, 1980, 0.2, 0.22);
    tone(c, t + 0.28, 'sine', 2640, 0.25, 0.12);
  },

  siren() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) {
      const ti = t + i * 0.55;
      neonSweep(c, ti, 480, 960, 0.28, 0.16);
      neonSweep(c, ti + 0.28, 960, 480, 0.26, 0.14);
    }
  },

  select() {
    const c = ac();
    if (!c) return;
    chirp(c, c.currentTime, 1400, 2200, 0.05, 0.09);
  },

  place() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    chirp(c, t, 700, 1400, 0.08, 0.16);
    click(c, t + 0.02, 0.08);
  },

  deny() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sawtooth', 220, 0.1, 0.12, 110);
    noise(c, t, 0.1, 'bandpass', 400, 0.15);
  },

  ready() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    chirp(c, t, 880, 1320, 0.07, 0.14);
    chirp(c, t + 0.08, 1320, 1980, 0.12, 0.16);
    click(c, t + 0.08, 0.1);
  },

  deploy() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    neonSweep(c, t, 200, 520, 0.16, 0.22);
    noise(c, t, 0.18, 'lowpass', 1200, 0.28, 400);
    chirp(c, t + 0.06, 400, 1200, 0.12, 0.12);
  },

  turn() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    chirp(c, t, 660, 990, 0.08, 0.14);
    chirp(c, t + 0.14, 660, 990, 0.1, 0.14);
  },

  score() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [880, 1175, 1568].forEach((f, i) => chirp(c, t + i * 0.07, f * 0.7, f, 0.12, 0.14));
  },

  callout() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    neonSweep(c, t, 300, 1800, 0.28, 0.2);
    noise(c, t, 0.3, 'bandpass', 900, 0.22, 3200);
  },

  /** Scope lock-on beeps before a headshot lands. */
  lockOn() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [0, 0.08, 0.16].forEach((d, i) => chirp(c, t + d, 1600 + i * 420, 2400 + i * 520, 0.05, 0.11));
    tone(c, t + 0.26, 'sine', 3520, 0.22, 0.07);
    noise(c, t, 0.4, 'bandpass', 500, 0.08, 2400);
  },

  /** Sting for the simultaneous plan reveal. */
  reveal() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sine', 70, 0.5, 0.35, 40);
    noise(c, t, 0.4, 'bandpass', 500, 0.25, 5200);
    neonSweep(c, t + 0.02, 180, 1400, 0.35, 0.14);
    chirp(c, t + 0.2, 880, 1760, 0.2, 0.12);
  },

  cutin() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.24, 'highpass', 1200, 0.22, 7500);
    chirp(c, t + 0.05, 660, 1980, 0.16, 0.12);
  },

  whoosh() {
    const c = ac();
    if (!c) return;
    noise(c, c.currentTime, 0.3, 'bandpass', 2400, 0.2, 500);
  },

  engage() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sine', 110, 0.55, 0.5, 34);
    noise(c, t, 0.45, 'lowpass', 2200, 0.4, 140);
    neonSweep(c, t, 1800, 240, 0.38, 0.16);
    chirp(c, t + 0.06, 440, 1760, 0.3, 0.12);
    click(c, t + 0.02, 0.12);
  },

  /** Glassy break when a unit is eliminated. */
  shatter() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.16, 'highpass', 5200, 0.26);
    [2600, 3300, 4100].forEach((f, i) => tone(c, t + i * 0.022, 'triangle', f, 0.12, 0.05, f * 0.6));
  },

  packCharge() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    neonSweep(c, t, 90, 420, 0.9, 0.16);
    noise(c, t, 0.9, 'bandpass', 300, 0.16, 2400);
    [0.2, 0.42, 0.6, 0.74].forEach((d) => click(c, t + d, 0.07));
  },

  packOpen() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.45, 'highpass', 900, 0.34, 7000);
    tone(c, t, 'sine', 120, 0.5, 0.3, 40);
    chirp(c, t + 0.04, 600, 2400, 0.35, 0.16);
    neonSweep(c, t + 0.05, 300, 1400, 0.5, 0.12);
  },

  cardDeal() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.12, 'bandpass', 2600, 0.12, 900);
  },

  cardFlip(rarity: 'common' | 'rare' | 'epic' | 'legend') {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.08, 'highpass', 3000, 0.12);
    chirp(c, t, 900, 1500, 0.1, 0.12);
    if (rarity === 'rare') chirp(c, t + 0.06, 1320, 1980, 0.18, 0.14);
    if (rarity === 'epic') {
      neonSweep(c, t, 300, 1200, 0.4, 0.14);
      [784, 1047, 1319].forEach((f, i) => chirp(c, t + 0.08 + i * 0.06, f * 0.8, f, 0.2, 0.12));
    }
    if (rarity === 'legend') {
      tone(c, t, 'sine', 70, 0.8, 0.3, 35);
      noise(c, t, 0.7, 'highpass', 1200, 0.2, 8000);
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
        chirp(c, t + 0.1 + i * 0.07, f * 0.8, f, 0.3, 0.13);
        tone(c, t + 0.1 + i * 0.07, 'triangle', f, 0.4, 0.07);
      });
      neonSweep(c, t + 0.4, 400, 1600, 0.9, 0.12);
    }
  },

  victory() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      chirp(c, t + i * 0.1, f * 0.8, f, 0.2, 0.14);
      tone(c, t + i * 0.1, 'triangle', f, 0.28, 0.1);
    });
    neonSweep(c, t + 0.45, 400, 1200, 0.7, 0.14);
  },

  defeat() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [440, 370, 311, 247].forEach((f, i) => {
      tone(c, t + i * 0.18, 'sawtooth', f, 0.32, 0.12, f * 0.7);
      noise(c, t + i * 0.18, 0.2, 'lowpass', 600, 0.1);
    });
  },
};

/* ───────── BGM (cool mode / dark EDM) ───────── */

/** Menu ~112 BPM, Battle ~132 BPM (quarter-note step). */
const BGM_BEAT = { menu: 0.536, battle: 0.455 } as const;

function stopBgmLoop() {
  if (bgmTimer !== null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

function bgmTone(
  c: AudioContext,
  t: number,
  type: OscillatorType,
  freq: number,
  dur: number,
  peak: number,
  dest: GainNode,
  filterFreq?: number,
  filterEnd?: number,
  q = 2,
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, peak, 0.008, dur);
  if (filterFreq) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(filterFreq, t);
    if (filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(80, filterEnd), t + dur);
    o.connect(f).connect(g).connect(dest);
  } else {
    o.connect(g).connect(dest);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Detuned saw layer — supersaw-ish stab / pad. */
function bgmSawStack(
  c: AudioContext,
  t: number,
  freq: number,
  dur: number,
  peak: number,
  dest: GainNode,
  cutoff: number,
  cutoffEnd?: number,
) {
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = 'lowpass';
  f.Q.value = 5;
  f.frequency.setValueAtTime(cutoff, t);
  if (cutoffEnd) f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoffEnd), t + dur);
  env(g, t, peak, 0.012, dur);
  f.connect(g).connect(dest);
  const detunes = [0, -7, 9];
  for (const cents of detunes) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * Math.pow(2, cents / 1200), t);
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.06);
  }
}

/** Punchy EDM kick — pitch-swept sine + click. */
function edmKick(c: AudioContext, t: number, dest: GainNode, peak = 0.22) {
  tone(c, t, 'sine', 165, 0.22, peak, 42, 0.002, dest);
  tone(c, t, 'sine', 90, 0.08, peak * 0.45, 55, 0.001, dest);
  noise(c, t, 0.035, 'lowpass', 520, peak * 0.28, 90, dest);
}

/** Layered clap / snare. */
function edmClap(c: AudioContext, t: number, dest: GainNode, peak = 0.11) {
  noise(c, t, 0.05, 'bandpass', 1600, peak, undefined, dest);
  noise(c, t + 0.014, 0.055, 'bandpass', 2100, peak * 0.75, undefined, dest);
  noise(c, t + 0.028, 0.1, 'highpass', 2800, peak * 0.45, undefined, dest);
  tone(c, t, 'triangle', 220, 0.04, peak * 0.2, 140, 0.002, dest);
}

function edmHat(c: AudioContext, t: number, dest: GainNode, open: boolean, peak: number) {
  noise(c, t, open ? 0.11 : 0.028, 'highpass', open ? 7500 : 11000, peak, undefined, dest);
}

/** Filtered dual-osc bass (wobble / mode bass). */
function edmBass(
  c: AudioContext,
  t: number,
  freq: number,
  dur: number,
  peak: number,
  dest: GainNode,
  cut0: number,
  cut1: number,
) {
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = 'lowpass';
  f.Q.value = 6.5;
  f.frequency.setValueAtTime(cut0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(90, cut1), t + dur * 0.85);
  env(g, t, peak, 0.006, dur);
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'square';
  o1.frequency.setValueAtTime(freq, t);
  o2.frequency.setValueAtTime(freq * 0.5, t);
  o1.connect(f);
  o2.connect(f);
  f.connect(g).connect(dest);
  o1.start(t);
  o2.start(t);
  o1.stop(t + dur + 0.05);
  o2.stop(t + dur + 0.05);
}

/** Cool neon lounge / dark chill EDM (~112 BPM). */
function scheduleMenu(c: AudioContext, t0: number, step: number) {
  const dest = bgmBus!;
  const beat = BGM_BEAT.menu;
  const t = t0;
  const bar = step % 16;
  const beatInBar = bar % 4;

  // four-on-floor (softer)
  edmKick(c, t, dest, 0.14);
  // sidechain-ish duck via short silence — pad has short attack after kick

  // clap on 2 & 4
  if (beatInBar === 1 || beatInBar === 3) edmClap(c, t, dest, 0.07);

  // 16th hats with swing feel
  const hatPeak = [0.035, 0.018, 0.028, 0.014];
  for (let i = 0; i < 4; i++) {
    const open = i === 2 && beatInBar === 3;
    edmHat(c, t + beat * (i / 4), dest, open, hatPeak[i]! * (open ? 1.2 : 1));
  }

  // chord progression Am – F – G – Em (roots in Hz)
  const roots = [110, 110, 87.31, 87.31, 98, 98, 82.41, 82.41];
  const root = roots[Math.floor(bar / 2) % roots.length]!;
  // pulsing pad
  bgmSawStack(c, t + 0.02, root, beat * 0.95, 0.045, dest, 420 + (bar % 8) * 40, 280);
  bgmTone(c, t + 0.02, 'sine', root * 2, beat * 0.9, 0.04, dest);

  // sparse minor arp (A C E G)
  if (bar % 2 === 0) {
    const arp = [root * 4, root * 4 * (6 / 5), root * 4 * 1.5, root * 4 * (9 / 5)];
    arp.forEach((f, i) => {
      if ((bar + i) % 3 !== 0) return;
      bgmTone(c, t + beat * (i * 0.22), 'triangle', f, 0.16, 0.032, dest, 3200, 1800, 1.5);
    });
  }

  // airy riser every 8 bars
  if (bar === 0) {
    noise(c, t, beat * 3.5, 'highpass', 600, 0.025, 9000, dest);
    chirp(c, t + beat * 2, 880, 1760, beat * 1.5, 0.028, dest);
  }
  // neon ping accents
  if (bar === 7 || bar === 15) {
    chirp(c, t + beat * 0.5, 1320, 2640, 0.28, 0.025, dest);
  }
}

/** Aggressive cyber mode / festival EDM (~132 BPM). */
function scheduleBattle(c: AudioContext, t0: number, step: number) {
  const dest = bgmBus!;
  const beat = BGM_BEAT.battle;
  const t = t0;
  const bar = step % 32;
  const beatInBar = bar % 4;
  const phrase = Math.floor(bar / 8) % 4;

  // driving four-on-floor
  edmKick(c, t, dest, 0.24);

  // clap / snare on 2 & 4
  if (beatInBar === 1 || beatInBar === 3) edmClap(c, t, dest, 0.13);

  // rapid closed hats + open hat on offbeats
  for (let i = 0; i < 4; i++) {
    const open = i === 2;
    edmHat(c, t + beat * (i / 4), dest, open, open ? 0.055 : 0.04 + (i % 2) * 0.012);
  }
  // extra 32nd ghost hats in high-energy phrases
  if (phrase >= 2) {
    edmHat(c, t + beat * 0.125, dest, false, 0.022);
    edmHat(c, t + beat * 0.625, dest, false, 0.02);
  }

  // bass: A minor mode line with filter wobble
  const bassPat = [
    55, 55, 55, 65.41, 55, 73.42, 82.41, 65.41, // Am / F feel
    55, 55, 49, 49, 55, 82.41, 73.42, 65.41,
  ];
  const b = bassPat[bar % bassPat.length]!;
  const wob = bar % 2 === 0 ? [900, 220] : [280, 1100];
  edmBass(c, t, b, beat * 0.88, 0.13, dest, wob[0]!, wob[1]!);
  // sub sine under bass
  tone(c, t, 'sine', b * 0.5, beat * 0.75, 0.1, undefined, 0.004, dest);

  // syncopated supersaw stabs (offbeat)
  if (beatInBar === 1 || beatInBar === 2 || bar % 8 === 5) {
    const stabRoot = b * 2;
    const chord = [1, 1.2, 1.5].map((r) => stabRoot * r);
    chord.forEach((f, i) => {
      bgmSawStack(c, t + 0.04 + i * 0.008, f, 0.14, 0.035, dest, 1400, 600);
    });
  }

  // lead hook — rising minor arp every half phrase
  if (bar % 8 === 0) {
    const lead = [440, 523.25, 659.25, 880, 659.25, 523.25];
    lead.forEach((f, i) => {
      bgmTone(c, t + i * beat * 0.35, 'sawtooth', f, 0.2, 0.045, dest, 2800, 900, 3);
    });
  }
  if (bar % 8 === 4) {
    [587.33, 698.46, 880].forEach((f, i) => {
      bgmTone(c, t + i * 0.1, 'square', f, 0.12, 0.035, dest, 2200, 1200, 2);
    });
  }

  // build / drop noise sweeps
  if (bar === 24) {
    noise(c, t, beat * 7.5, 'bandpass', 400, 0.04, 8000, dest);
    chirp(c, t, 220, 1760, beat * 7, 0.04, dest);
  }
  if (bar === 0) {
    chirp(c, t, 660, 1320, 0.4, 0.04, dest);
    bgmSawStack(c, t, 900, 0.35, 0.05, dest, 2400, 400);
  }
}

function startBgmLoop() {
  stopBgmLoop();
  const c = ac();
  if (!c || !enabled || bgmMode === 'off') return;
  bgmNext = c.currentTime + 0.05;
  bgmStep = 0;
  const beat = bgmMode === 'battle' ? BGM_BEAT.battle : BGM_BEAT.menu;

  const tick = () => {
    if (!enabled || bgmMode === 'off' || !ctx || !bgmBus) return;
    const now = ctx.currentTime;
    while (bgmNext < now + 0.4) {
      if (bgmMode === 'menu') scheduleMenu(ctx, bgmNext, bgmStep);
      else if (bgmMode === 'battle') scheduleBattle(ctx, bgmNext, bgmStep);
      bgmStep++;
      bgmNext += beat;
    }
  };
  tick();
  bgmTimer = window.setInterval(tick, 60);
}

export function setBgm(mode: BgmMode) {
  if (bgmMode === mode) {
    if (mode !== 'off' && enabled && !bgmTimer) startBgmLoop();
    return;
  }
  bgmMode = mode;
  stopBgmLoop();
  if (mode === 'off' || !enabled) return;
  // duck briefly on switch
  if (bgmBus && ctx) {
    const t = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(t);
    bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
    bgmBus.gain.linearRampToValueAtTime(0.01, t + 0.08);
    bgmBus.gain.linearRampToValueAtTime(mode === 'battle' ? 0.22 : 0.2, t + 0.35);
  }
  startBgmLoop();
}

export function vibrate(pattern: number | number[]) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}
