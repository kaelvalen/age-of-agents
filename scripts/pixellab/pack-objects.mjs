#!/usr/bin/env node
/**
 * Packer map-objectów PixelLab (budynki/dekoracje) → sprite'y Pixi (1 klatka "main").
 * Przycina każdy PNG do widocznego bounding-boxa (usuwa przezroczysty padding),
 * dzięki czemu kotwica w stopie (0.5,1) trafia w podstawę obiektu.
 *
 * Wejście:  downloads/objects/<subdir>/<id>.png
 * Wyjście:  packages/client/public/assets/<theme>/<subdir>/<id>.{png,json} + index.json
 * Użycie:   node scripts/pixellab/pack-objects.mjs <theme> <subdir>   (subdir: buildings|decorations)
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const theme = process.argv[2] ?? 'fantasy';
const subdir = process.argv[3] ?? 'buildings';
const inDir = join(root, `downloads/objects/${subdir}`);
const outDir = join(root, `packages/client/public/assets/${theme}/${subdir}`);

/**
 * Usuwa jednolite tło połączone z brzegiem (flood-fill). PixelLab zwraca obiekty
 * z nieprzezroczystym tłem-kluczem — wycinamy je od krawędzi, zostawiając ten sam
 * kolor WEWNĄTRZ obiektu (np. kamień), bo outline obiektu zatrzymuje wypełnienie.
 */
function removeBackground(png, tol = 36) {
  const { width: W, height: H, data } = png;
  const br = data[0], bg = data[1], bb = data[2];
  const near = (p) => Math.abs(data[p * 4] - br) <= tol && Math.abs(data[p * 4 + 1] - bg) <= tol && Math.abs(data[p * 4 + 2] - bb) <= tol;
  const visited = new Uint8Array(W * H);
  const stack = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (near(p)) stack.push(p);
  };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    const x = p % W, y = (p / W) | 0;
    seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1);
  }
  return png;
}

function trim(png) {
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0, any = false;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3] > 8) {
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (!any) return png;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new PNG({ width: w, height: h, fill: true });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * png.width + (minX + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  return out;
}

mkdirSync(outDir, { recursive: true });
const ids = [];
for (const f of readdirSync(inDir).filter((f) => f.endsWith('.png'))) {
  const id = f.replace(/\.png$/, '');
  const trimmed = trim(removeBackground(PNG.sync.read(readFileSync(join(inDir, f)))));
  writeFileSync(join(outDir, `${id}.png`), PNG.sync.write(trimmed));
  writeFileSync(
    join(outDir, `${id}.json`),
    JSON.stringify({
      frames: { main: { frame: { x: 0, y: 0, w: trimmed.width, h: trimmed.height }, sourceSize: { w: trimmed.width, h: trimmed.height }, spriteSourceSize: { x: 0, y: 0, w: trimmed.width, h: trimmed.height } } },
      meta: { image: `${id}.png`, format: 'RGBA8888', size: { w: trimmed.width, h: trimmed.height }, scale: '1' },
    }, null, 2),
  );
  ids.push(id);
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ ids }, null, 2));
console.log(`${subdir}: ${ids.length} obiektów →`, ids.join(', '));
