/**
 * Character cut-out masks for operator portraits (BiRefNet-lite via onnxruntime).
 * Masks are cached in `scripts/.cache/masks/<id>-<hash>.png` (0 = background, 255 = character),
 * keyed by the still's content so a redrawn portrait never reuses the old silhouette.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const MASK_DIR = join(CACHE_DIR, 'masks');
const MODEL_FILE = 'BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx';
const MODEL_PATH = join(CACHE_DIR, MODEL_FILE);
const MODEL_URL = `https://github.com/danielgatis/rembg/releases/download/v0.0.0/${MODEL_FILE}`;
const NET = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session: ort.InferenceSession | null = null;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (!(await exists(MODEL_PATH))) {
    await mkdir(CACHE_DIR, { recursive: true });
    console.log(`downloading ${MODEL_URL}`);
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model download failed: ${res.status}`);
    await writeFile(MODEL_PATH, Buffer.from(await res.arrayBuffer()));
  }
  session = await ort.InferenceSession.create(MODEL_PATH);
  return session;
}

async function segment(srcPath: string): Promise<Buffer> {
  const { data } = await sharp(srcPath)
    .resize(NET, NET, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let max = 1;
  for (let i = 0; i < data.length; i++) if (data[i]! > max) max = data[i]!;
  const plane = NET * NET;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (data[i * 3 + c]! / max - MEAN[c]!) / STD[c]!;
  }
  const s = await getSession();
  const out = await s.run({ [s.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, NET, NET]) });
  const logits = out[s.outputNames[0]!]!.data as Float32Array;
  const pred = new Float32Array(plane);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < plane; i++) {
    const v = 1 / (1 + Math.exp(-logits[i]!));
    pred[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const mask = Buffer.alloc(plane);
  const span = hi - lo || 1;
  for (let i = 0; i < plane; i++) mask[i] = Math.round(((pred[i]! - lo) / span) * 255);
  return mask;
}

/** Character alpha (0–1) at `size`×`size`, cropped like the portrait (`cover`, top). */
export async function portraitMask(id: string, srcPath: string, size: number): Promise<Float32Array> {
  const hash = createHash('sha1').update(await readFile(srcPath)).digest('hex').slice(0, 12);
  const name = `${id}-${hash}.png`;
  const cached = join(MASK_DIR, name);
  if (!(await exists(cached))) {
    await mkdir(MASK_DIR, { recursive: true });
    for (const f of await readdir(MASK_DIR)) {
      if (f !== name && (f === `${id}.png` || new RegExp(`^${id}-[0-9a-f]{12}\\.png$`).test(f))) {
        await unlink(join(MASK_DIR, f));
      }
    }
    const meta = await sharp(srcPath).metadata();
    const raw = await segment(srcPath);
    await sharp(raw, { raw: { width: NET, height: NET, channels: 1 } })
      .resize(meta.width ?? NET, meta.height ?? NET, { fit: 'fill' })
      .png()
      .toFile(cached);
  }
  const { data } = await sharp(cached)
    .resize(size, size, { fit: 'cover', position: 'top' })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const a = new Float32Array(size * size);
  for (let i = 0; i < a.length; i++) a[i] = data[i]! / 255;
  return a;
}
