/**
 * Cuts the rank badge renders (emblem on pure black) into transparent WebPs.
 *
 *   npx tsx scripts/cutout-ranks.ts <sourceDir>
 *
 * Expects `<sourceDir>/rank2-<id>.png` and writes `public/ranks/<id>.webp`.
 */
import { join } from 'node:path';
import sharp from 'sharp';

const IDS = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'legend'];
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'ranks');
const OUT_SIZE = 512;

/** Near-black pixels connected to the border are background. */
const BG_MAX = 6;
/**
 * Dim neon spill around the rim is also dropped (the UI re-creates it behind the badge).
 * Only this far in from the background, so dark armor inside the emblem is never eaten.
 */
const SPILL_MAX = 44;
const SPILL_DEPTH = 10;
/** Width (source px) of the anti-aliased edge band. */
const BAND = 3;
/** Brightness that counts as fully opaque inside the edge band. */
const OPAQUE_AT = 110;

async function cutout(src: string): Promise<Buffer> {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) lum[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);

  const neighbors = (i: number): number[] => {
    const x = i % w;
    const y = (i / w) | 0;
    return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
  };

  // Background = dark pixels connected to the image border.
  const dist = new Uint16Array(n).fill(0xffff);
  const queue = new Int32Array(n);
  let tail = 0;
  const seed = (i: number) => {
    if (dist[i] === 0 || lum[i] > BG_MAX) return;
    dist[i] = 0;
    queue[tail++] = i;
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  for (let head = 0; head < tail; head++) {
    for (const j of neighbors(queue[head])) if (j >= 0) seed(j);
  }

  // Peel the dim spill, at most SPILL_DEPTH px deep.
  const depth = new Uint8Array(n);
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    if (depth[i] >= SPILL_DEPTH) continue;
    for (const j of neighbors(i)) {
      if (j < 0 || dist[j] === 0 || lum[j] > SPILL_MAX) continue;
      dist[j] = 0;
      depth[j] = depth[i] + 1;
      queue[tail++] = j;
    }
  }

  // Distance (capped at BAND) from that background, measured from all of it at once.
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    if (dist[i] >= BAND) continue;
    for (const j of neighbors(i)) {
      if (j < 0 || dist[j] !== 0xffff) continue;
      dist[j] = dist[i] + 1;
      queue[tail++] = j;
    }
  }

  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const d = dist[i];
    let a: number;
    if (d === 0) a = 0;
    else if (d === 0xffff || d >= BAND) a = 1;
    else {
      const byLum = Math.min(1, Math.max(0, (lum[i] - SPILL_MAX) / (OPAQUE_AT - SPILL_MAX)));
      const byDepth = (d - 1) / (BAND - 1);
      a = Math.max(byLum, byDepth);
    }
    // The render is emblem-over-black, i.e. already premultiplied: recover the straight color.
    const k = a > 0 ? 1 / a : 0;
    rgba[i * 4] = Math.min(255, Math.round(data[i * 3] * k));
    rgba[i * 4 + 1] = Math.min(255, Math.round(data[i * 3 + 1] * k));
    rgba[i * 4 + 2] = Math.min(255, Math.round(data[i * 3 + 2] * k));
    rgba[i * 4 + 3] = Math.round(a * 255);
  }

  const trimmed = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 })
    .png()
    .toBuffer();
  const pad = 4;
  return sharp(trimmed)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('usage: tsx scripts/cutout-ranks.ts <sourceDir>');
  process.exit(1);
}
for (const id of IDS) {
  const png = await cutout(join(sourceDir, `rank2-${id}.png`));
  await sharp(png).webp({ quality: 92, alphaQuality: 100, smartSubsample: true }).toFile(join(OUT_DIR, `${id}.webp`));
  console.log(id);
}
