/**
 * Bake hair-flow loops from static operator portraits.
 *
 *   npm run portraits:anim
 *
 * Reads `public/portraits/<id>.webp`, warps the crown/hair into 12 frames,
 * and writes a vertical frame strip to `public/portraits/anim/<id>.webp`.
 * The UI swaps the still for that strip and plays it with CSS steps().
 */
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'public', 'portraits');
const OUT_DIR = join(SRC_DIR, 'anim');

/** Operators only — gear/tactics are skipped even if present. */
const OPERATORS = [
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
] as const;

const OUT_W = 384;
const FRAMES = 12;
const DELAY_MS = 70;
/** Max horizontal sway in source pixels (at hair tip). */
const AMP_X = 7.5;
/** Max vertical bob in source pixels. */
const AMP_Y = 2.2;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Hair / fringe mask: strong at the top, fades before the torso. */
function hairWeight(nx: number, ny: number): number {
  const top = 1 - smoothstep(0.08, 0.52, ny);
  const side = smoothstep(0.04, 0.22, Math.min(nx, 1 - nx));
  return top * (0.55 + 0.45 * side);
}

function sampleBilinear(
  src: Buffer,
  w: number,
  h: number,
  x: number,
  y: number,
  out: Uint8Array,
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

function warpFrame(
  src: Buffer,
  w: number,
  h: number,
  phase: number,
): Buffer {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ny = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const wt = hairWeight(nx, ny);
      const oi = (y * w + x) * 4;
      if (wt < 0.02) {
        const si = oi;
        out[oi] = src[si]!;
        out[oi + 1] = src[si + 1]!;
        out[oi + 2] = src[si + 2]!;
        out[oi + 3] = src[si + 3]!;
        continue;
      }
      // Layered sine strands — denser near the crown.
      const strand = Math.sin(nx * 18 + ny * 6) * 0.55 + Math.sin(nx * 31 - ny * 9) * 0.25;
      const wave = Math.sin(phase * Math.PI * 2 + ny * 9 + nx * 2.5 + strand);
      const wave2 = Math.sin(phase * Math.PI * 2 * 1.35 + ny * 14 - nx * 4);
      const dx = (wave * AMP_X + wave2 * AMP_X * 0.35) * wt;
      const dy = (Math.sin(phase * Math.PI * 2 + nx * 8) * AMP_Y) * wt * 0.85;
      const sx = Math.min(w - 1.001, Math.max(0, x - dx));
      const sy = Math.min(h - 1.001, Math.max(0, y - dy));
      sampleBilinear(src, w, h, sx, sy, out, oi);
    }
  }
  return out;
}

async function loadPortrait(id: string): Promise<{ data: Buffer; width: number; height: number } | null> {
  const srcPath = join(SRC_DIR, `${id}.webp`);
  try {
    const { data, info } = await sharp(srcPath)
      .resize(OUT_W, OUT_W, { fit: 'cover', position: 'top' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

async function writeStrip(id: string, frames: Buffer[], width: number, height: number) {
  const pages = frames.length;
  const strip = Buffer.concat(frames);
  // Vertical sprite sheet — played with CSS `steps()` at runtime.
  await sharp(strip, {
    raw: { width, height: height * pages, channels: 4 },
  })
    .webp({
      quality: 78,
      alphaQuality: 80,
      effort: 4,
    })
    .toFile(join(OUT_DIR, `${id}.webp`));
}

async function bakeOne(id: string): Promise<boolean> {
  const loaded = await loadPortrait(id);
  if (!loaded) {
    console.warn(`skip ${id}: source missing`);
    return false;
  }
  const { data, width, height } = loaded;
  const frames: Buffer[] = [];
  for (let i = 0; i < FRAMES; i++) {
    const phase = i / FRAMES;
    frames.push(warpFrame(data, width, height, phase));
  }
  await writeStrip(id, frames, width, height);
  console.log(`ok  ${id}.webp (${FRAMES}f @ ${width}x${height})`);
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const existing = new Set(await readdir(SRC_DIR));
  let n = 0;
  for (const id of OPERATORS) {
    if (!existing.has(`${id}.webp`)) {
      console.warn(`skip ${id}: no static portrait`);
      continue;
    }
    if (await bakeOne(id)) n++;
  }
  console.log(`done: ${n}/${OPERATORS.length} animated portraits → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
