/**
 * Procedural neon / cyberpunk SE (Web Audio) + looped MP3 BGM.
 */

import { publicAsset } from './ui/assets';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let seBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

export type BgmTrack = 'menu' | 'battle' | 'win' | 'lose' | 'gacha';
export type BgmMode = 'off' | BgmTrack;

let bgmMode: BgmMode = 'off';
const bgmEls: Partial<Record<BgmTrack, HTMLAudioElement>> = {};
let activeTrack: BgmTrack | null = null;
let unlockBound = false;
/** Multiplier applied on top of BGM_VOLUME (e.g. duck during pack open). */
let bgmGain = 1;

const BGM_SRC: Record<BgmTrack, string> = {
  menu: 'audio/menu.mp3',
  battle: 'audio/battle.mp3',
  win: 'audio/win.mp3',
  lose: 'audio/lose.mp3',
  gacha: 'audio/gacha.mp3',
};

const BGM_VOLUME: Record<BgmTrack, number> = {
  menu: 0.45,
  battle: 0.5,
  win: 0.48,
  lose: 0.45,
  gacha: 0.48,
};

const BGM_TRACKS = Object.keys(BGM_SRC) as BgmTrack[];

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    stopBgm();
    if (master) master.gain.value = 0;
  } else {
    if (master) master.gain.value = 1;
    if (bgmMode !== 'off') playBgm(bgmMode);
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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    seBus.connect(comp);
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
  // Resume Web Audio even if SE are currently muted — needed when toggling sound on.
  const wasEnabled = enabled;
  if (!enabled) enabled = true;
  ac();
  if (!wasEnabled) enabled = false;

  ensureBgmElements();
  if (enabled && bgmMode !== 'off') playBgm(bgmMode);
}

/** Bind once: first pointer/key/touch starts BGM after autoplay policy blocks mount play. */
export function bindAudioUnlock() {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const once = () => {
    unlockAudio();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, once, { once: true, capture: true });
  }
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

  /** Opening blast; `tier` 0–3 (common → legend) layers on a bigger chord. */
  packOpen(tier = 0) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.45, 'highpass', 900, 0.34, 7000);
    tone(c, t, 'sine', 120, 0.5, 0.3, 40);
    chirp(c, t + 0.04, 600, 2400, 0.35, 0.16);
    neonSweep(c, t + 0.05, 300, 1400, 0.5, 0.12);
    if (tier >= 2) {
      [523, 659, 784].forEach((f, i) => tone(c, t + 0.08 + i * 0.04, 'triangle', f, 0.7, 0.08));
    }
    if (tier >= 3) {
      tone(c, t, 'sine', 52, 1.3, 0.55, 28);
      [1047, 1319, 1568, 2093].forEach((f, i) => chirp(c, t + 0.2 + i * 0.07, f * 0.8, f, 0.35, 0.1));
      neonSweep(c, t + 0.1, 400, 2200, 1.0, 0.14);
    }
  },

  /** Low "lub-dub" thump for pre-reveal tension. */
  heartbeat() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [0, 0.19].forEach((d, i) => {
      const k = i === 0 ? 1 : 0.7;
      tone(c, t + d, 'sine', 64, 0.2, 0.75 * k, 34, 0.004);
      noise(c, t + d, 0.09, 'lowpass', 240, 0.32 * k, 80);
    });
  },

  /** Crackle + rising arpeggio when the omen light climbs to `tier` (1–3). */
  rankUp(tier: number) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.2, 'highpass', 4200, 0.32);
    tone(c, t, 'sine', 90, 0.45, 0.45, 42);
    const base = [523, 587, 659, 784][Math.min(3, Math.max(0, tier))]!;
    [1, 1.25, 1.5, 2].forEach((m, i) => chirp(c, t + 0.05 + i * 0.055, base * m * 0.8, base * m, 0.2, 0.13));
  },

  /** Rising drone while a legend card is about to crack open. */
  legendCharge() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    neonSweep(c, t, 70, 560, 1.5, 0.16);
    noise(c, t, 1.5, 'bandpass', 200, 0.2, 4600);
    tone(c, t, 'sine', 45, 1.4, 0.32, 95, 0.4);
  },

  /** Glass crack on the legend card back. */
  crack() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.14, 'highpass', 5200, 0.36);
    [2900, 3700, 4600].forEach((f, i) => tone(c, t + i * 0.018, 'triangle', f, 0.1, 0.06, f * 0.55));
    tone(c, t, 'sine', 72, 0.28, 0.45, 38);
  },

  /** Big impact + sustained chord for the legend cut-in. */
  legendBurst() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sine', 48, 1.5, 0.7, 26);
    noise(c, t, 1.2, 'lowpass', 3200, 0.6, 60);
    noise(c, t, 0.9, 'highpass', 6000, 0.22);
    [523, 659, 784, 1047].forEach((f) => tone(c, t + 0.05, 'triangle', f, 1.6, 0.07, undefined, 0.03));
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => chirp(c, t + 0.12 + i * 0.06, f * 0.8, f, 0.3, 0.11));
  },

  /** Glittery chimes for a kira (shiny) pull. */
  kira() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [2093, 2637, 3136, 3951, 3136, 4186].forEach((f, i) => chirp(c, t + i * 0.045, f * 0.9, f, 0.12, 0.08));
    noise(c, t, 0.3, 'highpass', 8000, 0.09);
  },

  /** Digital glitch burst for a motion (animated) rare. */
  motion() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 8; i++) {
      tone(c, t + i * 0.035, 'square', 400 + ((i * 733) % 2000), 0.03, 0.06);
      if (i % 2 === 0) noise(c, t + i * 0.035, 0.03, 'bandpass', 3000 + i * 400, 0.12);
    }
    chirp(c, t + 0.3, 660, 2640, 0.4, 0.14);
    [659, 831, 988, 1319].forEach((f, i) => tone(c, t + 0.34 + i * 0.05, 'triangle', f, 0.6, 0.06));
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

/* ───────── BGM (looped MP3) ───────── */

function makeBgm(src: string, volume: number): HTMLAudioElement {
  const el = new Audio(publicAsset(src));
  el.loop = true;
  el.preload = 'auto';
  el.volume = volume;
  el.setAttribute('playsinline', 'true');
  return el;
}

function ensureBgmElements() {
  for (const track of BGM_TRACKS) {
    if (!bgmEls[track]) bgmEls[track] = makeBgm(BGM_SRC[track], BGM_VOLUME[track]);
  }
}

function stopBgm() {
  for (const el of Object.values(bgmEls)) {
    if (!el) continue;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      // ignore seek errors before metadata
    }
  }
  activeTrack = null;
}

function playBgm(mode: BgmTrack) {
  if (!enabled) return;
  ensureBgmElements();
  const next = bgmEls[mode]!;
  if (activeTrack === mode && !next.paused) return;

  for (const track of BGM_TRACKS) {
    const el = bgmEls[track];
    if (!el || track === mode) continue;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      // ignore
    }
  }

  next.muted = false;
  next.volume = BGM_VOLUME[mode] * bgmGain;
  activeTrack = mode;
  void next.play().catch(() => {
    // Autoplay blocked until unlockAudio / bindAudioUnlock runs on a gesture.
    if (activeTrack === mode) activeTrack = null;
  });
}

export function setBgm(mode: BgmMode) {
  if (bgmMode === mode) {
    if (mode !== 'off' && enabled && (activeTrack !== mode || !!bgmEls[mode]?.paused)) {
      playBgm(mode);
    }
    return;
  }
  bgmMode = mode;
  if (mode === 'off' || !enabled) {
    stopBgm();
    return;
  }
  playBgm(mode);
}

/** Multiply current BGM volume (1 = normal). Used to duck under pack-open SFX. */
export function setBgmGain(scale: number) {
  bgmGain = Math.max(0, Math.min(1, scale));
  if (activeTrack && bgmEls[activeTrack] && bgmMode !== 'off') {
    bgmEls[activeTrack]!.volume = BGM_VOLUME[activeTrack] * bgmGain;
  }
}

export function vibrate(pattern: number | number[]) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}
