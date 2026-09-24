/**
 * Assemble operator motion GIFs from AI-generated frame sequences.
 *
 * Frames: `public/portraits/anim-src/<id>/01.png` …
 * Optional: `_master.png` + lock region keeps anatomy stable (e.g. Scout's hand).
 * Crossfade interpolation between keyframes for smoother loops.
 *
 *   npm run portraits:anim
 */
import { mkdir, readdir, rm, writeFile, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { GIFEncoder, quantize, applyPalette } from 'gifenc/dist/gifenc.esm.js';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'public', 'portraits', 'anim-src');
const OUT_DIR = join(ROOT, 'public', 'portraits', 'anim');

const OPERATORS = [
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
] as const;

const OUT_W = 320;
const DELAY_MS = 50;
const MAX_COLORS = 256;
/** Insert this many blended in-betweens between each keyframe pair. */
const INTERP = 3;

/** Soft-lock a region to `_master.png` so AI frames can't grow extra limbs. */
const REGION_LOCK: Partial<Record<string, { x0: number; y0: number; x1: number; y1: number }>> = {
  // Goggles + single right hand/arm (viewer's left) — keep AI from growing limbs.
  scout: { x0: 0.0, y0: 0.1, x1: 0.55, y1: 0.68 },
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

async function loadRgba(path: string): Promise<Uint8ClampedArray> {
  const { data } = await sharp(path)
    .resize(OUT_W, OUT_W, { fit: 'cover', position: 'top' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8ClampedArray(data);
}

function blend(a: Uint8ClampedArray, b: Uint8ClampedArray, t: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  const u = 1 - t;
  for (let i = 0; i < a.length; i++) {
    out[i] = Math.round(a[i]! * u + b[i]! * t);
  }
  return out;
}

/** Soft elliptical restore of master pixels inside the lock region. */
function applyRegionLock(
  frame: Uint8ClampedArray,
  master: Uint8ClampedArray,
  region: { x0: number; y0: number; x1: number; y1: number },
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(frame);
  const cx = (region.x0 + region.x1) / 2;
  const cy = (region.y0 + region.y1) / 2;
  const rx = Math.max(0.01, (region.x1 - region.x0) / 2);
  const ry = Math.max(0.01, (region.y1 - region.y0) / 2);
  for (let y = 0; y < OUT_W; y++) {
    const ny = y / (OUT_W - 1);
    for (let x = 0; x < OUT_W; x++) {
      const nx = x / (OUT_W - 1);
      const ex = (nx - cx) / rx;
      const ey = (ny - cy) / ry;
      const r = Math.sqrt(ex * ex + ey * ey);
      // Strong lock: almost fully master inside, soft fade only at the rim.
      const w = 1 - smoothstep(0.72, 1.08, r);
      if (w < 0.01) continue;
      const i = (y * OUT_W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const fi = frame[i + c]!;
        const mi = master[i + c]!;
        out[i + c] = Math.round(fi * (1 - w) + mi * w);
      }
    }
  }
  return out;
}

async function loadKeyframes(id: string): Promise<Uint8ClampedArray[] | null> {
  const dir = join(SRC_DIR, id);
  try {
    const st = await stat(dir);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  const files = (await readdir(dir))
    .filter((f) => /^\d+/i.test(f) && /\.(png|webp|jpe?g)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length < 2) return null;

  let frames: Uint8ClampedArray[] = [];
  for (const f of files) {
    frames.push(await loadRgba(join(dir, f)));
  }

  const masterPath = join(dir, '_master.png');
  const lock = REGION_LOCK[id];
  try {
    await access(masterPath);
    if (lock) {
      const master = await loadRgba(masterPath);
      // Bookend with master for a stable loop identity.
      frames = [master, ...frames.map((f) => applyRegionLock(f, master, lock)), master];
      console.log(`  lock  ${id}: region + master bookends`);
    }
  } catch {
    // no master lock
  }

  return frames;
}

function interpolate(keys: Uint8ClampedArray[]): Uint8ClampedArray[] {
  if (INTERP <= 0 || keys.length < 2) return keys;
  const out: Uint8ClampedArray[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    out.push(a);
    for (let s = 1; s <= INTERP; s++) {
      out.push(blend(a, b, s / (INTERP + 1)));
    }
  }
  out.push(keys[keys.length - 1]!);
  return out;
}

async function writeGif(id: string, frames: Uint8ClampedArray[]) {
  const palette = quantize(frames[0]!, MAX_COLORS, { format: 'rgb565' });
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const index = applyPalette(frames[i]!, palette, 'rgb565');
    gif.writeFrame(index, OUT_W, OUT_W, {
      palette: i === 0 ? palette : undefined,
      delay: DELAY_MS,
      repeat: 0,
      dispose: 1,
    });
  }
  gif.finish();
  await writeFile(join(OUT_DIR, `${id}.gif`), gif.bytes());
}

function glowPulseFrame(master: Uint8ClampedArray, phase: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(master);
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const glintX = phase; // 0→1 sweep
  for (let y = 0; y < OUT_W; y++) {
    const ny = y / (OUT_W - 1);
    for (let x = 0; x < OUT_W; x++) {
      const nx = x / (OUT_W - 1);
      const i = (y * OUT_W + x) * 4;
      const r = master[i]!;
      const g = master[i + 1]!;
      const b = master[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max < 1 ? 0 : (max - min) / max;
      const isGreenGlow = g > 90 && g > r * 1.15 && g > b * 1.1 && sat > 0.25;
      if (!isGreenGlow) continue;

      // Soft brightness pulse on neon greens (eyes, circuits, lenses).
      let boost = 1 + 0.18 * (pulse * 2 - 1) * sat;

      // Traveling specular band across goggle region (upper-left).
      if (nx < 0.5 && ny > 0.15 && ny < 0.55) {
        const proj = nx * 0.85 + ny * 0.15;
        const d = Math.min(Math.abs(proj - glintX), Math.abs(proj - glintX + 1), Math.abs(proj - glintX - 1));
        const band = Math.exp(-(d * d) / (2 * 0.03 * 0.03));
        const sheen = band * 0.55 * (g / 255);
        out[i] = Math.min(255, Math.round(r + (255 - r) * sheen));
        out[i + 1] = Math.min(255, Math.round(g + (255 - g) * sheen));
        out[i + 2] = Math.min(255, Math.round(b + (255 - b) * sheen * 0.9));
        continue;
      }

      out[i] = Math.min(255, Math.round(r * boost));
      out[i + 1] = Math.min(255, Math.round(g * boost));
      out[i + 2] = Math.min(255, Math.round(b * boost));
    }
  }
  return out;
}

async function bakeScoutLocked(): Promise<boolean> {
  const dir = join(SRC_DIR, 'scout');
  const masterPath = join(dir, '_master.png');
  try {
    await access(masterPath);
  } catch {
    console.warn('skip scout: need _master.png');
    return false;
  }
  const master = await loadRgba(masterPath);
  const FRAMES = 24;
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < FRAMES; i++) {
    frames.push(glowPulseFrame(master, i / FRAMES));
  }
  await writeGif('scout', frames);
  console.log(`ok  scout.gif  locked-master glow loop frames=${FRAMES}`);
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let n = 0;
  let missing = 0;
  for (const id of OPERATORS) {
    if (id === 'scout') {
      await rm(join(OUT_DIR, 'scout.gif'), { force: true });
      if (await bakeScoutLocked()) n++;
      else missing++;
      continue;
    }
    const keys = await loadKeyframes(id);
    if (!keys) {
      missing++;
      console.warn(`skip ${id}: no anim-src frames`);
      continue;
    }
    await rm(join(OUT_DIR, `${id}.gif`), { force: true });
    const frames = interpolate(keys);
    await writeGif(id, frames);
    const meta = await sharp(join(OUT_DIR, `${id}.gif`), { animated: true }).metadata();
    console.log(`ok  ${id}.gif  keys=${keys.length} frames=${frames.length} pages=${meta.pages ?? 1}`);
    n++;
  }
  console.log(`done: ${n} GIFs (${missing} operators still need anim-src)`);
  if (n === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
