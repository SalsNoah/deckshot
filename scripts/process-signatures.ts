/**
 * Process signature assets: black → transparent, trim, light neon (readable).
 * Usage: npx tsx scripts/process-signatures.ts
 */
import { copyFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'public', 'signatures');
const BACKUP_DIR = join(ROOT, 'scripts', '.cache', 'signatures-src');

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Turn black canvas into alpha; keep only bright pen strokes (minimal haze). */
function keyBlackToAlpha(data: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const luma = Math.max(data[o]!, data[o + 1]!, data[o + 2]!);
    // Drop the soft baked glow from generation — it crushes letterforms when layered.
    let a = 0;
    if (luma >= 170) a = 255;
    else if (luma >= 120) a = Math.round(((luma - 120) / 50) * 255);
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = a;
  }
  return out;
}

/** Crisp pen only — no baked bloom (CSS can add a tiny edge later). */
async function neonFromAlpha(rgba: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function processOne(file: string): Promise<void> {
  const srcPath = join(SRC_DIR, file);
  await mkdir(BACKUP_DIR, { recursive: true });
  const bak = join(BACKUP_DIR, file);
  if (!(await exists(bak))) await copyFile(srcPath, bak);

  const inputPath = (await exists(bak)) ? bak : srcPath;
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const keyed = keyBlackToAlpha(data, info.width, info.height);

  // Thin the pen body slightly so counters stay open at card size.
  const thinned = await sharp(keyed, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .blur(0.6)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const thinnedRgba = keyBlackToAlpha(thinned.data, thinned.info.width, thinned.info.height);

  const trimmed = await sharp(thinnedRgba, {
    raw: { width: thinned.info.width, height: thinned.info.height, channels: 4 },
  })
    .trim({ threshold: 12 })
    .extend({ top: 8, bottom: 8, left: 12, right: 12, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const neon = await neonFromAlpha(trimmed.data, trimmed.info.width, trimmed.info.height);
  const outTmp = `${srcPath}.tmp.png`;
  await sharp(neon)
    .resize({ width: 720, height: 360, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(outTmp);
  try {
    await unlink(srcPath);
  } catch {
    // ignore
  }
  await rename(outTmp, srcPath);
  console.log(`ok ${file}`);
}

async function main() {
  const files = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.png') && !f.endsWith('.tmp.png')).sort();
  if (!files.length) throw new Error(`no signatures in ${SRC_DIR}`);
  console.log(`processing ${files.length} signatures (readable neon)…`);
  for (const f of files) await processOne(f);
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
