// Składa pełną scenę offline (teren autotiling + budynki) do PNG — jak silnik.
// Uruchom: npx tsx scripts/preview-scene.ts
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTerrainMap, type TerrainId } from '../packages/client/src/game/terrain-map.ts';
import { cornerMask } from '../packages/client/src/game/autotile.ts';
import { FANTASY } from '../packages/client/src/theme/fantasy.ts';

const T = 32; // px na kafel (proporcje budynek:teren jak w grze)
const tileDir = 'packages/client/public/assets/fantasy/tilemap';
const bldDir = 'packages/client/public/assets/fantasy/buildings';
const PAIRS: { pair: string; upper: TerrainId }[] = [
  { pair: 'water', upper: 'water' }, { pair: 'dirt', upper: 'dirt' }, { pair: 'rock', upper: 'rock' },
];
const atlas = Object.fromEntries(PAIRS.map((p) => [p.pair, PNG.sync.read(readFileSync(join(tileDir, `${p.pair}.png`)))]));

const map = buildTerrainMap(FANTASY);
const { w, h } = FANTASY.grid;
const out = new PNG({ width: w * T, height: h * T, fill: true });

function px(dst: PNG, x: number, y: number, r: number, g: number, b: number, a: number) {
  if (x < 0 || y < 0 || x >= dst.width || y >= dst.height || a === 0) return;
  const i = (y * dst.width + x) * 4;
  // alfa-blend na istniejący piksel
  const ia = a / 255, ib = 1 - ia;
  dst.data[i] = Math.round(dst.data[i] * ib + r * ia);
  dst.data[i + 1] = Math.round(dst.data[i + 1] * ib + g * ia);
  dst.data[i + 2] = Math.round(dst.data[i + 2] * ib + b * ia);
  dst.data[i + 3] = 255;
}
function blitTile(a: PNG, mask: number, dx: number, dy: number) {
  const sx = mask * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const si = (y * a.width + (sx + x)) * 4;
    px(out, dx * T + x - T / 2, dy * T + y - T / 2, a.data[si], a.data[si + 1], a.data[si + 2], a.data[si + 3]);
  }
}
const inB = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < w && gy < h;

// teren: baza + warstwy
for (let dy = 0; dy <= h; dy++) for (let dx = 0; dx <= w; dx++) blitTile(atlas.water, 0, dx, dy);
for (const { pair, upper } of PAIRS) {
  const isUpper = (gx: number, gy: number) => inB(gx, gy) && map[gy][gx] === upper;
  for (let dy = 0; dy <= h; dy++) for (let dx = 0; dx <= w; dx++) {
    const m = cornerMask(dx, dy, isUpper);
    if (m) blitTile(atlas[pair], m, dx, dy);
  }
}

// budynki: sortowane po głębokości (gy+h), kotwica dolny-środek footprintu
const blds = [...FANTASY.buildings].sort((a, b) => (a.gy + a.h) - (b.gy + b.h));
for (const def of blds) {
  const src = PNG.sync.read(readFileSync(join(bldDir, `${def.id}.png`)));
  const scale = (def.w * T) / src.width;
  const dw = Math.round(src.width * scale), dh = Math.round(src.height * scale);
  const footX = (def.gx + def.w / 2) * T, footY = (def.gy + def.h) * T;
  const ox = Math.round(footX - dw / 2), oy = Math.round(footY - dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sxp = Math.floor(x / scale), syp = Math.floor(y / scale);
    const si = (syp * src.width + sxp) * 4;
    px(out, ox + x, oy + y, src.data[si], src.data[si + 1], src.data[si + 2], src.data[si + 3]);
  }
}

mkdirSync('downloads', { recursive: true });
writeFileSync('downloads/scene-preview.png', PNG.sync.write(out));
console.log(`scene-preview.png ${out.width}x${out.height} (${blds.length} budynków)`);
