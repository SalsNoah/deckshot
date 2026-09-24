/**
 * Bake hair-flow animated GIFs from static operator portraits.
 *
 *   npm run portraits:anim
 *
 * Reads `public/portraits/<id>.webp` and writes looping GIFs to
 * `public/portraits/anim/<id>.gif`. Runtime swaps the still for this GIF.
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

const OUT_W = 288;
const FRAMES = 16;
const DELAY_MS = 70;
const AMP_X = 9;
const AMP_Y = 2.6;
const MAX_COLORS = 192;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hairWeight(nx: number, ny: number): number {
  const top = 1 - smoothstep(0.05, 0.48, ny);
  const side = smoothstep(0.02, 0.18, Math.min(nx, 1 - nx));
  return top * (0.45 + 0.55 * side);
}

function sampleBilinear(
  src: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  out: Uint8Array | Uint8ClampedArray,
  oi: number,
) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const v00 = src[i00 + c]!;
    const v10 = src[i10 + c]!;
    const v01 = src[i01 + c]!;
    const v11 = src[i11 + c]!;
    const v0 = v00 + (v10 - v00) * fx;
    const v1 = v01 + (v11 - v01) * fx;
    out[oi + c] = Math.round(v0 + (v1 - v0) * fy);
  }
}

function warpFrame(src: Uint8Array, w: number, h: number, phase: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ny = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const nx = x / Math.max(1, w - 1);
      const wt = hairWeight(nx, ny);
      const oi = (y * w + x) * 4;
      if (wt < 0.012) {
        out[oi] = src[oi]!;
        out[oi + 1] = src[oi + 1]!;
        out[oi + 2] = src[oi + 2]!;
        out[oi + 3] = src[oi + 3]!;
        continue;
      }
      const strand = Math.sin(nx * 16 + ny * 5) * 0.55 + Math.sin(nx * 28 - ny * 8) * 0.3;
      const wave = Math.sin(phase * Math.PI * 2 + ny * 8 + nx * 2 + strand);
      const wave2 = Math.sin(phase * Math.PI * 2 * 1.35 + ny * 12.5 - nx * 3.5);
      const dx = (wave * AMP_X + wave2 * AMP_X * 0.45) * wt;
      const dy = Math.sin(phase * Math.PI * 2 + nx * 7) * AMP_Y * wt * 0.9;
      const sx = Math.min(w - 1.001, Math.max(0, x - dx));
      const sy = Math.min(h - 1.001, Math.max(0, y - dy));
      sampleBilinear(src, w, h, sx, sy, out, oi);
    }
  }
  return out;
}

async function loadPortrait(id: string): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  const srcPath = join(SRC_DIR, `${id}.webp`);
  try {
    const { data, info } = await sharp(srcPath)
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
  // Shared palette from the still (frame 0) keeps colors stable across the loop.
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
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < FRAMES; i++) {
    frames.push(warpFrame(data, width, height, i / FRAMES));
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
    if (name.endsWith('.webp') || name.endsWith('.gif') || name.startsWith('_')) {
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
  console.log(`done: ${n}/${OPERATORS.length} animated GIFs → ${OUT_DIR}`);
  if (n < OPERATORS.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
