// Generate PWA icons from public/water-drops.png
// Usage: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');
const src = resolve(root, 'public', 'water-drops.png');
const outDir = resolve(root, 'public', 'icons');

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const tasks = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon-180.png', size: 180 },
];

const run = async () => {
  for (const t of tasks) {
    const dst = resolve(outDir, t.file);
    await sharp(src)
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(dst);
    console.log('Wrote', dst);
  }
  console.log('Done.');
};

run().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
