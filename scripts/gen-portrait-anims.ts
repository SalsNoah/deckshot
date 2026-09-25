/**
 * Bake operator motion loops (animated WebP) from the card stills.
 *
 * Each portrait is cut out (see portrait-mask.ts) and animated in layers:
 * the aura behind the character streams outward, and pulses race along the
 * glowing lines on the body.
 *
 *   npm run portraits:anim            # all operators
 *   npm run portraits:anim ace hawk   # just these
 */
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { portraitMask } from './portrait-mask';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'public', 'portraits');
const OUT_DIR = join(SRC_DIR, 'anim');

const OPERATORS = [
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
  'pup', 'bit', 'lace', 'mochi', 'chirp', 'nibble', 'silk', 'bean',
  'ember', 'frost', 'lock', 'key', 'nova', 'orbit', 'fang', 'claw', 'volt', 'amp',
  'chum', 'dot',
] as const;
type OperatorId = (typeof OPERATORS)[number];

const S = 384;
const N = S * S;
const FRAMES = 48;
const DELAY_MS = 80;
const QUALITY = 76;

const AURA_FLOW_PX = 30;
const AURA_CYCLES = 2;
const FLAME_RISE_PX = 60;
const PULSE_SPACING_PX = 56;
const PULSES_PER_LOOP = 4;

type Tuning = {
  /** Multiplier on how strongly background energy streams. */
  auraFlow?: number;
  /** Also race pulses along glowing lines in the background. */
  bgPulses?: boolean;
};

// Cut-outs for these portraits lose most of the character; animate without layer separation.
const NO_CUTOUT = new Set<OperatorId>(['ghost', 'shard', 'spark']);

const TUNING: Partial<Record<OperatorId, Tuning>> = {
  kingpin: { auraFlow: 0.3, bgPulses: true },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (v: number) => v - Math.floor(v);
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function boxBlur1(src: Float32Array, r: number, stride: number, channels: number): Float32Array {
  const out = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  const w = 2 * r + 1;
  for (let y = 0; y < S; y++) {
    for (let c = 0; c < channels; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[(y * S + Math.min(S - 1, Math.max(0, k))) * stride + c]!;
      for (let x = 0; x < S; x++) {
        tmp[(y * S + x) * stride + c] = acc / w;
        const add = Math.min(S - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        acc += src[(y * S + add) * stride + c]! - src[(y * S + sub) * stride + c]!;
      }
    }
  }
  for (let x = 0; x < S; x++) {
    for (let c = 0; c < channels; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(Math.min(S - 1, Math.max(0, k)) * S + x) * stride + c]!;
      for (let y = 0; y < S; y++) {
        out[(y * S + x) * stride + c] = acc / w;
        const add = Math.min(S - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        acc += tmp[(add * S + x) * stride + c]! - tmp[(sub * S + x) * stride + c]!;
      }
    }
  }
  return out;
}

/** Two box passes ≈ gaussian. */
function blur(src: Float32Array, r: number, channels = 1): Float32Array {
  return boxBlur1(boxBlur1(src, r, channels, channels), r, channels, channels);
}

function sample1(map: Float32Array, x: number, y: number): number {
  const xc = Math.min(S - 1.001, Math.max(0, x));
  const yc = Math.min(S - 1.001, Math.max(0, y));
  const x0 = xc | 0;
  const y0 = yc | 0;
  const fx = xc - x0;
  const fy = yc - y0;
  const i = y0 * S + x0;
  const a = map[i]! + (map[i + 1]! - map[i]!) * fx;
  const b = map[i + S]! + (map[i + S + 1]! - map[i + S]!) * fx;
  return a + (b - a) * fy;
}

function sample3(img: Float32Array, x: number, y: number, out: Float32Array, o: number, k = 1) {
  const xc = Math.min(S - 1.001, Math.max(0, x));
  const yc = Math.min(S - 1.001, Math.max(0, y));
  const x0 = xc | 0;
  const y0 = yc | 0;
  const fx = xc - x0;
  const fy = yc - y0;
  const i = (y0 * S + x0) * 3;
  const j = i + S * 3;
  for (let c = 0; c < 3; c++) {
    const a = img[i + c]! + (img[i + 3 + c]! - img[i + c]!) * fx;
    const b = img[j + c]! + (img[j + 3 + c]! - img[j + c]!) * fx;
    out[o + c] += (a + (b - a) * fy) * k;
  }
}

/** Push-pull fill of pixels whose `known` weight is low. */
function inpaint(img: Float32Array, known: Float32Array): Float32Array {
  type Level = { w: number; h: number; c: Float32Array; k: Float32Array };
  const levels: Level[] = [];
  const c0 = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) for (let ch = 0; ch < 3; ch++) c0[i * 3 + ch] = img[i * 3 + ch]! * known[i]!;
  levels.push({ w: S, h: S, c: c0, k: known.slice() });
  while (levels[levels.length - 1]!.w > 1) {
    const p = levels[levels.length - 1]!;
    const w = Math.ceil(p.w / 2);
    const h = Math.ceil(p.h / 2);
    const c = new Float32Array(w * h * 3);
    const k = new Float32Array(w * h);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const qi = (y >> 1) * w + (x >> 1);
        const pi = y * p.w + x;
        k[qi] += p.k[pi]!;
        for (let ch = 0; ch < 3; ch++) c[qi * 3 + ch] += p.c[pi * 3 + ch]!;
      }
    }
    for (let i = 0; i < w * h; i++) {
      if (k[i]! > 1) {
        for (let ch = 0; ch < 3; ch++) c[i * 3 + ch] /= k[i]!;
        k[i] = 1;
      }
    }
    levels.push({ w, h, c, k });
  }
  let fill = new Float32Array(3);
  {
    const top = levels[levels.length - 1]!;
    for (let ch = 0; ch < 3; ch++) fill[ch] = top.k[0]! > 0 ? top.c[ch]! / top.k[0]! : 0;
  }
  for (let li = levels.length - 2; li >= 0; li--) {
    const L = levels[li]!;
    const up = levels[li + 1]!;
    const next = new Float32Array(L.w * L.h * 3);
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x;
        const ui = Math.min(up.h - 1, y >> 1) * up.w + Math.min(up.w - 1, x >> 1);
        for (let ch = 0; ch < 3; ch++) next[i * 3 + ch] = L.c[i * 3 + ch]! + fill[ui * 3 + ch]! * (1 - L.k[i]!);
      }
    }
    fill = next;
  }
  return fill;
}

/** Smooth value noise in [0,1] with roughly `cell`-px features (deterministic). */
function valueNoise(cellX: number, cellY: number, seed: number): Float32Array {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gw = Math.ceil(S / cellX) + 2;
  const gh = Math.ceil(S / cellY) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(N);
  for (let y = 0; y < S; y++) {
    const gy = y / cellY;
    const y0 = Math.floor(gy);
    const ty = smoothstep(0, 1, gy - y0);
    for (let x = 0; x < S; x++) {
      const gx = x / cellX;
      const x0 = Math.floor(gx);
      const tx = smoothstep(0, 1, gx - x0);
      const a = grid[y0 * gw + x0]!;
      const b = grid[y0 * gw + x0 + 1]!;
      const c = grid[(y0 + 1) * gw + x0]!;
      const d = grid[(y0 + 1) * gw + x0 + 1]!;
      out[y * S + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

type Rig = {
  img: Float32Array;
  alpha: Float32Array;
  bg: Float32Array;
  auraW: Float32Array;
  flowX: Float32Array;
  flowY: Float32Array;
  flicker: Float32Array;
  rim: Float32Array;
  rimColor: [number, number, number];
  rimGain: number;
  flame: Float32Array;
  sparkle: Float32Array;
  sparklePhase: Float32Array;
  line: Float32Array;
  lineDist: Float32Array;
  lineZip: Uint8Array;
  cutout: boolean;
};

async function loadStill(id: string): Promise<Float32Array> {
  const { data } = await sharp(join(SRC_DIR, `${id}.webp`))
    .resize(S, S, { fit: 'cover', position: 'top' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const img = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) img[i] = data[i]! / 255;
  return img;
}

async function buildRig(id: OperatorId): Promise<Rig> {
  const tune = TUNING[id] ?? {};
  const img = await loadStill(id);
  const cutout = !NO_CUTOUT.has(id);
  const rawAlpha = cutout ? await portraitMask(id, join(SRC_DIR, `${id}.webp`), S) : new Float32Array(N);
  const alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) alpha[i] = smoothstep(0.25, 0.75, rawAlpha[i]!);

  const energy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = img[i * 3]!;
    const g = img[i * 3 + 1]!;
    const b = img[i * 3 + 2]!;
    const mx = Math.max(r, g, b);
    const sat = mx < 1e-4 ? 0 : (mx - Math.min(r, g, b)) / mx;
    energy[i] = Math.pow(sat, 1.2) * smoothstep(0.3, 0.85, mx);
  }

  // Background plate: character removed and filled from the surroundings.
  const grown = blur(alpha, 3);
  const known = new Float32Array(N);
  for (let i = 0; i < N; i++) known[i] = 1 - smoothstep(0.05, 0.25, grown[i]!);
  const bg = cutout ? inpaint(img, known) : img.slice();

  let cx = S * 0.5;
  let cy = S * 0.45;
  if (cutout) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = alpha[y * S + x]!;
      sx += x * a;
      sy += y * a;
      sw += a;
    }
    if (sw > 0) {
      cx = sx / sw;
      cy = sy / sw;
    }
  }

  // Aura: saturated bright background energy streams outward and upward.
  const bgEnergy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = bg[i * 3]!;
    const g = bg[i * 3 + 1]!;
    const b = bg[i * 3 + 2]!;
    const mx = Math.max(r, g, b);
    const sat = mx < 1e-4 ? 0 : (mx - Math.min(r, g, b)) / mx;
    bgEnergy[i] = Math.pow(sat, 1.2) * smoothstep(0.25, 0.8, mx);
  }
  const auraBlur = blur(bgEnergy, 6);
  const auraW = new Float32Array(N);
  const auraGain = (tune.auraFlow ?? 1) * (cutout ? 2.6 : 2.0);
  for (let i = 0; i < N; i++) auraW[i] = clamp01(auraBlur[i]! * auraGain);

  const flowX = new Float32Array(N);
  const flowY = new Float32Array(N);
  const flicker = new Float32Array(N);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const rx = x - cx;
      const ry = y - cy;
      const rl = Math.hypot(rx, ry) + 1e-3;
      // Curl of a smooth scalar field gives a swirling, divergence-free drift.
      const e = 0.5;
      const n = (px: number, py: number) =>
        Math.sin(px * 0.021 + 1.3) * Math.cos(py * 0.017 - 0.7) + 0.5 * Math.sin((px + py) * 0.035 + 2.1);
      const cxv = (n(x, y + e) - n(x, y - e)) / (2 * e);
      const cyv = -(n(x + e, y) - n(x - e, y)) / (2 * e);
      const cl = Math.hypot(cxv, cyv) + 1e-3;
      let dx = 0.55 * (rx / rl) + 0.6 * (cxv / cl);
      let dy = 0.55 * (ry / rl) - 0.75 + 0.6 * (cyv / cl);
      const dl = Math.hypot(dx, dy) + 1e-3;
      dx /= dl;
      dy /= dl;
      flowX[i] = dx * AURA_FLOW_PX;
      flowY[i] = dy * AURA_FLOW_PX;
      flicker[i] = fract(0.5 + 0.5 * Math.sin(x * 0.013 + y * 0.009) + 0.3 * Math.cos(y * 0.021 - x * 0.006));
    }
  }

  // Rim aura behind the silhouette, tinted with the character's own neon; stronger on plain backgrounds.
  const rim = new Float32Array(N);
  const rimColor: [number, number, number] = [0, 0, 0];
  let auraMean = 0;
  for (let i = 0; i < N; i++) auraMean += auraW[i]!;
  auraMean /= N;
  const rimGain = 0.55 + 0.55 * (1 - clamp01(auraMean * 5));
  const flame = valueNoise(10, 26, 7);
  if (cutout) {
    const halo = blur(alpha, 14);
    for (let i = 0; i < N; i++) rim[i] = clamp01(halo[i]! * 1.8 - alpha[i]! * 1.2);
    let wsum = 0;
    for (let i = 0; i < N; i++) {
      const w = energy[i]! * (0.3 + alpha[i]!);
      rimColor[0] += img[i * 3]! * w;
      rimColor[1] += img[i * 3 + 1]! * w;
      rimColor[2] += img[i * 3 + 2]! * w;
      wsum += w;
    }
    const mx = Math.max(rimColor[0], rimColor[1], rimColor[2], 1e-6);
    for (let c = 0; c < 3; c++) rimColor[c] = wsum > 0 ? rimColor[c]! / mx : 0;
  }

  // Twinkling background specks (city lights, sparks, embers).
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (bg[i * 3]! + bg[i * 3 + 1]! + bg[i * 3 + 2]!) / 3;
  const lumBlur = blur(lum, 3);
  const sparkle = new Float32Array(N);
  const sparklePhase = new Float32Array(N);
  const phaseNoise = valueNoise(5, 5, 11);
  for (let i = 0; i < N; i++) {
    const peak = smoothstep(0.08, 0.2, lum[i]! - lumBlur[i]!) * smoothstep(0.35, 0.6, lum[i]!);
    sparkle[i] = peak * (1 - alpha[i]!);
    sparklePhase[i] = phaseNoise[i]!;
  }

  // Glowing lines: neon on the body (and background when tuned), with distance along each line.
  // Thin dim lines count too when they stand out from their surroundings.
  const energyBlur = blur(energy, 4);
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const onBody = cutout && !tune.bgPulses ? smoothstep(0.4, 0.7, alpha[i]!) : 1;
    const bright = smoothstep(0.3, 0.65, energy[i]!);
    const thin = smoothstep(0.12, 0.3, energy[i]!) * smoothstep(0.04, 0.12, energy[i]! - energyBlur[i]!);
    line[i] = Math.max(bright, thin) * onBody;
  }
  const lineDist = new Float32Array(N);
  const lineZip = new Uint8Array(N);
  const comp = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const cyCore = cy + S * 0.05;
  for (let start = 0; start < N; start++) {
    if (comp[start] !== -1 || line[start]! < 0.25) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    comp[start] = start;
    let seed = start;
    let best = Infinity;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % S;
      const y = (i / S) | 0;
      const dc = (x - cx) ** 2 + (y - cyCore) ** 2;
      if (dc < best) {
        best = dc;
        seed = i;
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const j = ny * S + nx;
        if (comp[j] === -1 && line[j]! >= 0.25) {
          comp[j] = start;
          queue[tail++] = j;
        }
      }
    }
    const size = tail;
    // Tiny specks (eyes, sparks) only breathe; larger lines get racing pulses.
    const zip = size >= 30 ? 1 : 0;
    for (let q = 0; q < size; q++) lineDist[queue[q]!] = -1;
    head = 0;
    tail = 0;
    queue[tail++] = seed;
    lineDist[seed] = 0;
    while (head < tail) {
      const i = queue[head++]!;
      lineZip[i] = zip;
      const x = i % S;
      const y = (i / S) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const j = ny * S + nx;
        if (comp[j] === start && lineDist[j] === -1) {
          lineDist[j] = lineDist[i]! + (dx && dy ? 1.414 : 1);
          queue[tail++] = j;
        }
      }
    }
  }

  return {
    img, alpha, bg, auraW, flowX, flowY, flicker, rim, rimColor, rimGain, flame, sparkle, sparklePhase,
    line, lineDist, lineZip, cutout,
  };
}

function renderFrame(rig: Rig, p: number): Buffer {
  const TAU = Math.PI * 2;
  const out = new Float32Array(N * 3);

  // Aura: two-phase flow map so the stream loops without a visible reset.
  const tau = p * AURA_CYCLES;
  const t1 = fract(tau);
  const t2 = fract(tau + 0.5);
  const w1 = 1 - Math.abs(2 * t1 - 1);
  const w2 = 1 - w1;
  const rimT1 = fract(p * AURA_CYCLES);
  const rimT2 = fract(p * AURA_CYCLES + 0.5);
  const rw1 = 1 - Math.abs(2 * rimT1 - 1);
  const rw2 = 1 - rw1;
  const rimPulse = 0.85 + 0.15 * Math.sin(TAU * p * 2);
  const flowed = new Float32Array(3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const o = i * 3;
      const aw = rig.auraW[i]!;
      if (aw > 0.01) {
        flowed[0] = flowed[1] = flowed[2] = 0;
        const fx = rig.flowX[i]!;
        const fy = rig.flowY[i]!;
        sample3(rig.bg, x - fx * (t1 - 0.5), y - fy * (t1 - 0.5), flowed, 0, w1);
        sample3(rig.bg, x - fx * (t2 - 0.5), y - fy * (t2 - 0.5), flowed, 0, w2);
        const flick = 1 + 0.2 * aw * Math.sin(TAU * (p * 2 + rig.flicker[i]!));
        for (let c = 0; c < 3; c++) out[o + c] = (rig.bg[o + c]! * (1 - aw) + flowed[c]! * aw) * flick;
      } else {
        out[o] = rig.bg[o]!;
        out[o + 1] = rig.bg[o + 1]!;
        out[o + 2] = rig.bg[o + 2]!;
      }
      const sp = rig.sparkle[i]!;
      if (sp > 0.02) {
        const tw = 1 + 0.9 * sp * Math.sin(TAU * (p * 2 + rig.sparklePhase[i]! * 3));
        for (let c = 0; c < 3; c++) out[o + c] *= tw;
      }
      if (rig.cutout && rig.rim[i]! > 0.005) {
        // Flame tongues rise through the halo.
        const f1 = sample1(rig.flame, x, y + FLAME_RISE_PX * (rimT1 - 0.5));
        const f2 = sample1(rig.flame, x, y + FLAME_RISE_PX * (rimT2 - 0.5));
        const tongue = smoothstep(0.25, 0.85, f1 * rw1 + f2 * rw2);
        const k = rig.rim[i]! * (0.35 + 1.1 * tongue) * rig.rimGain * rimPulse;
        for (let c = 0; c < 3; c++) out[o + c] += rig.rimColor[c]! * k;
      }
    }
  }

  // Lines: racing pulses with a bright head and short tail, plus gentle breathing.
  const base = rig.cutout ? rig.img : out.slice();
  const lit = base.slice();
  const bloom = new Float32Array(N * 3);
  const breath = 1 + 0.12 * Math.sin(TAU * p);
  for (let i = 0; i < N; i++) {
    const ln = rig.line[i]!;
    if (ln < 0.05) continue;
    const o = i * 3;
    let pulse = 0;
    if (rig.lineZip[i]) {
      const v = 1 - fract(rig.lineDist[i]! / PULSE_SPACING_PX - PULSES_PER_LOOP * p);
      pulse = Math.exp(-v * 4.5) * (1 - smoothstep(0.94, 1, v));
    }
    const k = pulse * ln;
    for (let c = 0; c < 3; c++) {
      const col = base[o + c]! * (1 + (breath - 1) * ln);
      const hot = Math.min(1, base[o + c]! * 1.8 + 0.25);
      lit[o + c] = col + (hot - col) * k * 0.9;
      bloom[o + c] = hot * k;
    }
  }
  const glow = blur(bloom, 4, 3);

  if (rig.cutout) {
    for (let i = 0; i < N; i++) {
      const a = rig.alpha[i]!;
      const o = i * 3;
      for (let c = 0; c < 3; c++) out[o + c] = out[o + c]! * (1 - a) + lit[o + c]! * a;
    }
  } else {
    out.set(lit);
  }

  const bytes = Buffer.alloc(N * 3);
  for (let i = 0; i < N * 3; i++) bytes[i] = Math.round(clamp01(out[i]! + glow[i]! * 0.9) * 255);
  return bytes;
}

async function bake(id: OperatorId): Promise<void> {
  const rig = await buildRig(id);
  const pngs: Buffer[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const raw = renderFrame(rig, f / FRAMES);
    pngs.push(await sharp(raw, { raw: { width: S, height: S, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer());
  }
  const out = join(OUT_DIR, `${id}.webp`);
  await sharp(pngs, { join: { animated: true } })
    .webp({ loop: 0, delay: new Array(FRAMES).fill(DELAY_MS), quality: QUALITY, effort: 5 })
    .toFile(out);
  const kb = Math.round((await stat(out)).size / 1024);
  console.log(`ok  ${id}.webp  ${FRAMES} frames  ${((FRAMES * DELAY_MS) / 1000).toFixed(1)}s  ${kb}KB${rig.cutout ? '' : '  (no cutout)'}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const ids = (args.length ? args : OPERATORS) as OperatorId[];
  for (const id of ids) {
    if (!(OPERATORS as readonly string[]).includes(id)) throw new Error(`unknown operator: ${id}`);
    await bake(id);
  }
  console.log(`done: ${ids.length} operator loops`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
