/**
 * Analyze each operator portrait and bake a subtle looping GIF.
 * Prefers small “きらり” moments (lens glints, metal sheen, eye/FX pulse)
 * over warping the whole figure — e.g. glasses just catch a light.
 *
 *   npm run portraits:anim
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GIFEncoder, quantize, applyPalette } from 'gifenc/dist/gifenc.esm.js';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'public', 'portraits');
const OUT_DIR = join(SRC_DIR, 'anim');

const OPERATORS = [
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
] as const;

const OUT_W = 320;
const FRAMES = 20;
const DELAY_MS = 90;
const MAX_COLORS = 256;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

type Analysis = {
  /** Specular / glass / metal — traveling glint. */
  glint: Float32Array;
  /** Soft glow (eyes, armor channels, FX) — gentle pulse. */
  glow: Float32Array;
  /** Preferred glint sweep direction (unit-ish). */
  dirX: number;
  dirY: number;
  glintMass: number;
  glowMass: number;
  label: string;
};

function analyze(src: Uint8Array, w: number, h: number): Analysis {
  const n = w * h;
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const edge = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = src[o]! / 255;
    const g = src[o + 1]! / 255;
    const b = src[o + 2]! / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = mx < 1e-6 ? 0 : (mx - mn) / mx;
  }

  let eMax = 1e-6;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1]! + lum[i - w + 1]! -
        2 * lum[i - 1]! + 2 * lum[i + 1]! -
        lum[i + w - 1]! + lum[i + w + 1]!;
      const gy =
        -lum[i - w - 1]! - 2 * lum[i - w]! - lum[i - w + 1]! +
        lum[i + w - 1]! + 2 * lum[i + w]! + lum[i + w + 1]!;
      edge[i] = Math.hypot(gx, gy);
      if (edge[i]! > eMax) eMax = edge[i]!;
    }
  }

  // Local mean luminance for “hotter than neighbors” specular detect.
  const mean3 = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) s += lum[(y + dy) * w + (x + dx)]!;
      }
      mean3[y * w + x] = s / 9;
    }
  }

  const glint = new Float32Array(n);
  const glow = new Float32Array(n);
  let glintMass = 0;
  let glowMass = 0;
  let momX = 0;
  let momY = 0;
  let momW = 0;

  for (let y = 0; y < h; y++) {
    const ny = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const nx = x / Math.max(1, w - 1);
      const i = y * w + x;
      const L = lum[i]!;
      const s = sat[i]!;
      const eN = edge[i]! / eMax;
      const localMean = mean3[i] || L;
      const hot = clamp01((L - localMean) * 6 + (L - 0.55) * 1.4);

      // Specular / glass: bright local hotspots (lens, flare, metal catch).
      // Prefer mid-frame (eyes / gear), allow small saturated spikes too.
      const faceBand = smoothstep(0.12, 0.28, ny) * (1 - smoothstep(0.55, 0.78, ny));
      const gearBand = smoothstep(0.15, 0.4, ny) * (1 - smoothstep(0.7, 0.95, ny));
      let gn = hot * (0.35 + 0.65 * Math.max(faceBand, gearBand * 0.85));
      // Elongated lens-flare streaks: bright + strong horizontal edge.
      const flare = clamp01(L - 0.45) * smoothstep(0.2, 0.65, eN) * (1 - s * 0.25);
      gn = Math.max(gn, flare * 0.9);
      // Tiny bright desaturated sparkles (glass reflections are often near-white).
      if (L > 0.72 && s < 0.35) gn = Math.max(gn, (L - 0.65) * 2.2);
      // Colored lenses / neon eyes (scope glass, goggles) — sat + luminous = glint host.
      if (L > 0.25 && s > 0.35) {
        gn = Math.max(gn, s * smoothstep(0.22, 0.65, L) * (0.5 + 0.5 * Math.max(faceBand, gearBand)));
      }
      gn = clamp01(gn);

      // Soft glow: saturated luminous paint (eyes, neon trim, energy).
      let gl = s * smoothstep(0.32, 0.82, L);
      gl *= 0.4 + 0.6 * (1 - smoothstep(0.6, 0.95, eN));
      gl = clamp01(gl * 1.35);

      // Don't double-count: strong glint owns the pixel for sheen.
      if (gn > 0.35) gl *= 0.45;

      glint[i] = gn;
      glow[i] = gl;
      glintMass += gn;
      glowMass += gl;
      const wgt = gn * 2 + gl;
      momX += (nx - 0.5) * wgt;
      momY += (ny - 0.4) * wgt;
      momW += wgt;
    }
  }

  blurInPlace(glint, w, h, 1);
  blurInPlace(glow, w, h, 2);
  normalizePeak(glint, 1);
  normalizePeak(glow, 0.92);

  // If almost no specular found, promote brightest glow into glint carriers
  // so every portrait still gets at least a small きらり.
  const inv = 1 / n;
  glintMass *= inv;
  glowMass *= inv;
  if (glintMass < 0.004) {
    for (let i = 0; i < n; i++) {
      const promote = glow[i]! * glow[i]!;
      glint[i] = Math.max(glint[i]!, promote);
    }
    blurInPlace(glint, w, h, 1);
    normalizePeak(glint, 1);
    glintMass = 0;
    for (let i = 0; i < n; i++) glintMass += glint[i]!;
    glintMass /= n;
  }

  const invM = momW > 1e-6 ? 1 / momW : 0;
  let dirX = momX * invM;
  let dirY = momY * invM;
  // Default sweep: slight diagonal (classic lens catch).
  if (Math.hypot(dirX, dirY) < 0.05) {
    dirX = 0.85;
    dirY = -0.35;
  } else {
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len;
    dirY /= len;
    // Prefer a horizontal-ish glint across lenses.
    dirX = dirX * 0.4 + 0.6 * Math.sign(dirX || 1);
    dirY = dirY * 0.55;
    const len2 = Math.hypot(dirX, dirY) || 1;
    dirX /= len2;
    dirY /= len2;
  }

  let label = 'glow';
  if (glintMass >= glowMass * 0.55) label = 'glint';
  else if (glowMass > glintMass * 1.4) label = 'pulse';
  else label = 'glint+pulse';

  return { glint, glow, dirX, dirY, glintMass, glowMass, label };
}

function blurInPlace(map: Float32Array, w: number, h: number, radius: number) {
  const tmp = new Float32Array(map.length);
  const r = radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let c = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx));
        sum += map[y * w + xx]!;
        c++;
      }
      tmp[y * w + x] = sum / c;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let c = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        sum += tmp[yy * w + x]!;
        c++;
      }
      map[y * w + x] = sum / c;
    }
  }
}

function normalizePeak(map: Float32Array, peak: number) {
  let m = 1e-6;
  for (let i = 0; i < map.length; i++) if (map[i]! > m) m = map[i]!;
  const s = peak / m;
  for (let i = 0; i < map.length; i++) map[i]! *= s;
}

/**
 * Traveling specular band: a soft stripe sweeps across glint regions once per loop.
 * Rest of the portrait stays pixel-identical to the still.
 */
function renderFrame(
  src: Uint8Array,
  w: number,
  h: number,
  phase: number,
  a: Analysis,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  // Sweep center moves 0→1 along the preferred axis; ease for a clean catch.
  const sweep = phase;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);

  const glintPeak = 0.7 + Math.min(0.45, a.glintMass * 60);
  const glowAmp = 0.07 + Math.min(0.12, a.glowMass * 2.8);

  for (let y = 0; y < h; y++) {
    const ny = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const nx = x / Math.max(1, w - 1);
      const i = y * w + x;
      const gn = a.glint[i]!;
      const gl = a.glow[i]!;
      if (gn < 0.04 && gl < 0.04) continue;

      const oi = i * 4;
      let r = out[oi]!;
      let g = out[oi + 1]!;
      let b = out[oi + 2]!;

      if (gn > 0.04) {
        // Project pixel onto sweep axis; thin band = sharp きらり.
        const proj = (nx - 0.5) * a.dirX + (ny - 0.4) * a.dirY + 0.5;
        const dist = Math.abs(proj - sweep);
        // Wrap so the loop is seamless (band can cross the edge).
        const d = Math.min(dist, 1 - dist);
        const band = Math.exp(-((d * d) / (2 * 0.028 * 0.028)));
        const sheen = gn * band * glintPeak;
        // Push toward white (specular), keep a hint of original hue.
        r = Math.min(255, Math.round(r + (255 - r) * sheen));
        g = Math.min(255, Math.round(g + (255 - g) * sheen));
        b = Math.min(255, Math.round(b + (255 - b) * sheen * 0.92));
      }

      if (gl > 0.05) {
        const boost = 1 + glowAmp * gl * (pulse * 2 - 1);
        r = Math.min(255, Math.round(r * boost));
        g = Math.min(255, Math.round(g * boost));
        b = Math.min(255, Math.round(b * boost));
      }

      out[oi] = r;
      out[oi + 1] = g;
      out[oi + 2] = b;
    }
  }
  return out;
}

async function loadPortrait(id: string): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(join(SRC_DIR, `${id}.webp`))
      .resize(OUT_W, OUT_W, { fit: 'cover', position: 'top' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

async function writeGif(id: string, frames: Uint8ClampedArray[], width: number, height: number) {
  // Quantize from the still (frame 0) so non-animated pixels stay faithful.
  const palette = quantize(frames[0]!, MAX_COLORS, { format: 'rgb565' });
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const index = applyPalette(frames[i]!, palette, 'rgb565');
    gif.writeFrame(index, width, height, {
      palette: i === 0 ? palette : undefined,
      delay: DELAY_MS,
      repeat: 0,
      dispose: 1,
    });
  }
  gif.finish();
  await writeFile(join(OUT_DIR, `${id}.gif`), gif.bytes());
}

async function bakeOne(id: string): Promise<boolean> {
  const loaded = await loadPortrait(id);
  if (!loaded) {
    console.warn(`skip ${id}: source missing`);
    return false;
  }
  const { data, width, height } = loaded;
  const analysis = analyze(data, width, height);
  console.log(
    `  analyze ${id}: glint=${analysis.glintMass.toFixed(4)} glow=${analysis.glowMass.toFixed(3)} ` +
      `dir=(${analysis.dirX.toFixed(2)},${analysis.dirY.toFixed(2)}) → ${analysis.label}`,
  );

  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < FRAMES; i++) {
    frames.push(renderFrame(data, width, height, i / FRAMES, analysis));
  }
  await writeGif(id, frames, width, height);
  const meta = await sharp(join(OUT_DIR, `${id}.gif`), { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  console.log(`ok  ${id}.gif  pages=${pages}  ${meta.width}x${meta.pageHeight ?? meta.height}`);
  return pages > 1;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const name of await readdir(OUT_DIR)) {
    if (name.endsWith('.webp') || name.endsWith('.gif') || name.endsWith('.png') || name.startsWith('_')) {
      await rm(join(OUT_DIR, name), { force: true });
    }
  }
  const existing = new Set(await readdir(SRC_DIR));
  let n = 0;
  for (const id of OPERATORS) {
    if (!existing.has(`${id}.webp`)) {
      console.warn(`skip ${id}: no static portrait`);
      continue;
    }
    if (await bakeOne(id)) n++;
  }
  console.log(`done: ${n}/${OPERATORS.length} glint GIFs → ${OUT_DIR}`);
  if (n < OPERATORS.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
