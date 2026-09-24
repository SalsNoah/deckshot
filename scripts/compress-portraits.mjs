import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const tmp = 'public/portraits_tmp';
const outDir = 'public/portraits';

for (const f of fs.readdirSync(tmp).filter((x) => x.endsWith('.png'))) {
  const id = f.replace('.png', '');
  const out = path.join(outDir, `${id}.webp`);
  await sharp(path.join(tmp, f)).webp({ quality: 78 }).toFile(out);
  console.log(`${id}.webp ${Math.round(fs.statSync(out).size / 1024)}KB`);
}

for (const f of fs.readdirSync(outDir).filter((x) => x.endsWith('.png'))) {
  fs.unlinkSync(path.join(outDir, f));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('done');
