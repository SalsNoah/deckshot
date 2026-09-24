/**
 * Bake operator motion loops as animated WebP from AI-generated keyframes.
 *
 * Keyframes: `public/portraits/anim-src/<id>/01.png` … (newly illustrated from the still).
 * Output:    `public/portraits/anim/<id>.webp`
 *
 *   npm run portraits:anim
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'public', 'portraits', 'anim-src');
const OUT_DIR = join(ROOT, 'public', 'portraits', 'anim');

const OPERATORS = [
  'rookie', 'scout', 'jolt', 'bulwark', 'haze', 'wire', 'kingpin', 'blitz', 'breacher', 'ghost',
  'angel', 'banshee', 'hawk', 'reaper', 'vanguard', 'titan', 'ace', 'deadeye',
  'shard', 'anchor', 'mimic', 'widow', 'leech', 'blast', 'martyr', 'phoenix', 'pack', 'lonewolf', 'scav', 'spark',
] as const;
type OperatorId = (typeof OPERATORS)[number];

const OUT_W = 384;
const QUALITY = 78;

/** Slow eased dissolve between keys, with a rest on each key. */
const FADE_MS = 1200;
const FADE_STEP_MS = 100;
const HOLD_MS = 450;
const HOLD_END_MS = 900;

/** Per-pixel change (0–255) below LO snaps to the base key; above HI keeps the key. */
const STILL_LO = 12;
const STILL_HI = 42;

type Plan = { mode: 'keys'; path: string[] } | { mode: 'master-glow' };

// Keys are hand-picked for matching pose and eye state: mismatched keys ghost during slow fades.
const PLANS: Partial<Record<OperatorId, Plan>> = {
  ace: { mode: 'keys', path: ['05', '08', '06', '03'] },
  hawk: { mode: 'keys', path: ['03', '05', '06', '01'] },
  kingpin: { mode: 'keys', path: ['04', '02', '06', '03'] },
  scav: { mode: 'keys', path: ['03', '02', '04', '05'] },
  // Generated variants kept redrawing the hand; animate the clean master only.
  scout: { mode: 'master-glow' },
};

type Frame = { rgb: Uint8ClampedArray; delay: number };

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function easeInOut(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

async function loadRgb(path: string): Promise<Uint8ClampedArray> {
  const { data } = await sharp(path)
    .resize(OUT_W, OUT_W, { fit: 'cover', position: 'top' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8ClampedArray(data);
}

function blend(a: Uint8ClampedArray, b: Uint8ClampedArray, t: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  const u = 1 - t;
  for (let i = 0; i < a.length; i++) out[i] = Math.round(a[i]! * u + b[i]! * t);
  return out;
}

function boxBlur(map: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(map.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dx = -r; dx <= r; dx++) s += map[y * w + Math.min(w - 1, Math.max(0, x + dx))]!;
      tmp[y * w + x] = s / (2 * r + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -r; dy <= r; dy++) s += tmp[Math.min(h - 1, Math.max(0, y + dy)) * w + x]!;
      map[y * w + x] = s / (2 * r + 1);
    }
  }
}

/** Snap regeneration noise back to the base key so only real changes (glints, glow) move. */
function stabilize(key: Uint8ClampedArray, base: Uint8ClampedArray): Uint8ClampedArray {
  const n = OUT_W * OUT_W;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    d[i] = Math.max(
      Math.abs(key[o]! - base[o]!),
      Math.abs(key[o + 1]! - base[o + 1]!),
      Math.abs(key[o + 2]! - base[o + 2]!),
    );
  }
  boxBlur(d, OUT_W, OUT_W, 2);
  const out = new Uint8ClampedArray(key.length);
  for (let i = 0; i < n; i++) {
    const w = smoothstep(STILL_LO, STILL_HI, d[i]!);
    const o = i * 3;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(base[o + c]! + (key[o + c]! - base[o + c]!) * w);
  }
  return out;
}

/** k0 → … → kN → … → k1, then loops back to k0. */
function pingPong(n: number): number[] {
  const fwd = Array.from({ length: n }, (_, i) => i);
  return n < 3 ? fwd : [...fwd, ...fwd.slice(1, -1).reverse()];
}

function keyTimeline(keys: Uint8ClampedArray[]): Frame[] {
  const cycle = pingPong(keys.length);
  const steps = Math.max(2, Math.round(FADE_MS / FADE_STEP_MS));
  const frames: Frame[] = [];
  for (let i = 0; i < cycle.length; i++) {
    const ki = cycle[i]!;
    const a = keys[ki]!;
    const b = keys[cycle[(i + 1) % cycle.length]!]!;
    const isEnd = ki === 0 || ki === keys.length - 1;
    frames.push({ rgb: a, delay: isEnd ? HOLD_END_MS : HOLD_MS });
    for (let s = 1; s < steps; s++) {
      frames.push({ rgb: blend(a, b, easeInOut(s / steps)), delay: FADE_STEP_MS });
    }
  }
  return frames;
}

/** Slow neon breathing plus one lens glint per loop, on an unchanged master. */
function masterGlowTimeline(master: Uint8ClampedArray): Frame[] {
  const FRAMES = 64;
  const DELAY = 100;
  const frames: Frame[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const phase = f / FRAMES;
    const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    // Glint crosses the goggles during the middle of the loop, then rests.
    const g = smoothstep(0.35, 0.65, phase);
    const glintPos = 0.08 + g * 0.36;
    const glintOn = phase > 0.33 && phase < 0.67 ? Math.sin(((phase - 0.33) / 0.34) * Math.PI) : 0;

    const out = new Uint8ClampedArray(master);
    for (let y = 0; y < OUT_W; y++) {
      const ny = y / (OUT_W - 1);
      for (let x = 0; x < OUT_W; x++) {
        const nx = x / (OUT_W - 1);
        const o = (y * OUT_W + x) * 3;
        const r = master[o]!;
        const gr = master[o + 1]!;
        const b = master[o + 2]!;
        const mx = Math.max(r, gr, b);
        const sat = mx < 1 ? 0 : (mx - Math.min(r, gr, b)) / mx;
        if (!(gr > 80 && gr > r * 1.15 && sat > 0.25)) continue;

        let boost = 1 + 0.14 * (pulse * 2 - 1) * sat;
        let sheen = 0;
        if (glintOn > 0 && nx > 0.05 && nx < 0.45 && ny > 0.12 && ny < 0.42) {
          const proj = nx * 0.85 + (ny - 0.12) * 0.3;
          const d = proj - glintPos;
          sheen = Math.exp(-(d * d) / (2 * 0.035 * 0.035)) * 0.6 * glintOn * (gr / 255);
          boost = 1;
        }
        out[o] = Math.min(255, Math.round(r * boost + (255 - r) * sheen));
        out[o + 1] = Math.min(255, Math.round(gr * boost + (255 - gr) * sheen));
        out[o + 2] = Math.min(255, Math.round(b * boost + (255 - b) * sheen * 0.9));
      }
    }
    frames.push({ rgb: out, delay: DELAY });
  }
  return frames;
}

async function numericKeys(dir: string): Promise<string[]> {
  return (await readdir(dir))
    .filter((f) => /^\d+\.(png|webp|jpe?g)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => f.replace(/\.[^.]+$/, ''));
}

async function resolveKeyPath(dir: string, name: string): Promise<string> {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    const p = join(dir, `${name}.${ext}`);
    try {
      await stat(p);
      return p;
    } catch {
      // try next extension
    }
  }
  throw new Error(`missing keyframe ${dir}/${name}`);
}

async function buildFrames(id: OperatorId): Promise<Frame[] | null> {
  const dir = join(SRC_DIR, id);
  try {
    if (!(await stat(dir)).isDirectory()) return null;
  } catch {
    return null;
  }
  const plan = PLANS[id];
  if (plan?.mode === 'master-glow') {
    return masterGlowTimeline(await loadRgb(join(dir, '_master.png')));
  }
  const names = plan?.path ?? (await numericKeys(dir));
  if (names.length < 2) return null;
  const raw = await Promise.all(names.map(async (n) => loadRgb(await resolveKeyPath(dir, n))));
  const base = raw[0]!;
  const keys = [base, ...raw.slice(1).map((k) => stabilize(k, base))];
  return keyTimeline(keys);
}

async function writeAnimatedWebp(id: string, frames: Frame[]): Promise<string> {
  const pngs = await Promise.all(
    frames.map((f) =>
      sharp(Buffer.from(f.rgb.buffer, f.rgb.byteOffset, f.rgb.byteLength), {
        raw: { width: OUT_W, height: OUT_W, channels: 3 },
      })
        .png({ compressionLevel: 1 })
        .toBuffer(),
    ),
  );
  const out = join(OUT_DIR, `${id}.webp`);
  await sharp(pngs, { join: { animated: true } })
    .webp({ loop: 0, delay: frames.map((f) => f.delay), quality: QUALITY, effort: 5 })
    .toFile(out);
  return out;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let n = 0;
  for (const id of OPERATORS) {
    const frames = await buildFrames(id);
    if (!frames) continue;
    const out = await writeAnimatedWebp(id, frames);
    const meta = await sharp(out, { animated: true }).metadata();
    const loopMs = frames.reduce((s, f) => s + f.delay, 0);
    const kb = Math.round((await stat(out)).size / 1024);
    console.log(`ok  ${id}.webp  frames=${meta.pages} loop=${(loopMs / 1000).toFixed(1)}s  ${kb}KB`);
    n++;
  }
  console.log(`done: ${n}/${OPERATORS.length} operators animated`);
  if (n === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
