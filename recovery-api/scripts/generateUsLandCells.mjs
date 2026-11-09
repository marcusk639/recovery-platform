// Regenerates src/lib/meetings/usLandCells.json from Census state boundaries.
// Run only when the cell sizes change:
//   curl -o /tmp/states-10m.json https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json
//   node scripts/generateUsLandCells.mjs /tmp/states-10m.json src/lib/meetings/usLandCells.json
import { readFileSync, writeFileSync } from 'node:fs';

const [atlasPath, outPath] = process.argv.slice(2);
const topo = JSON.parse(readFileSync(atlasPath, 'utf8'));
const { scale, translate } = topo.transform;

const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});
const ring = (indexes) => {
  const points = [];
  for (const i of indexes) {
    const arc = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
};

const polygons = [];
for (const geometry of topo.objects.states.geometries) {
  const parts = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
  for (const part of parts) {
    const rings = part.map(ring);
    const xs = rings[0].map((p) => p[0]);
    const ys = rings[0].map((p) => p[1]);
    polygons.push({
      rings,
      w: Math.min(...xs),
      e: Math.max(...xs),
      s: Math.min(...ys),
      n: Math.max(...ys),
    });
  }
}
const inRing = (r, x, y) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (x, y) =>
  polygons.some(
    (p) =>
      x >= p.w &&
      x <= p.e &&
      y >= p.s &&
      y <= p.n &&
      inRing(p.rings[0], x, y) &&
      !p.rings.slice(1).some((hole) => inRing(hole, x, y)),
  );

// Alaska is huge and sparse, so its cells are coarser. Lat/lng are in whole steps of
// 0.25 so rows stay exact.
const isCoarse = (lat, lng) => lat >= 51 || lng > 170;
const STEP = 0.25;
const COARSE_LAT = 0.5;
const COARSE_LNG = 1;
const SAMPLES = 6;

const rows = new Map();
const addCell = (s, w, latStep, lngStep) => {
  const key = `${s}|${latStep}|${lngStep}`;
  if (!rows.has(key)) rows.set(key, new Set());
  rows.get(key).add(w);
};
const cellOf = (lat, lng) => {
  if (isCoarse(lat, lng)) {
    return [Math.floor(lat / COARSE_LAT) * COARSE_LAT, Math.floor(lng / COARSE_LNG) * COARSE_LNG, COARSE_LAT, COARSE_LNG];
  }
  return [Math.floor(lat / STEP) * STEP, Math.floor(lng / STEP) * STEP, STEP, STEP];
};

for (const p of polygons) {
  // Boundary vertices catch islands and coast too thin for the sample grid to hit.
  for (const r of p.rings) for (const [x, y] of r) addCell(...cellOf(y, x));
  for (let lat = Math.floor(p.s / STEP) * STEP; lat < p.n; lat += STEP) {
    for (let lng = Math.floor(p.w / STEP) * STEP; lng < p.e; lng += STEP) {
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const y = lat + ((i + 0.5) / SAMPLES) * STEP;
          const x = lng + ((j + 0.5) / SAMPLES) * STEP;
          if (onLand(x, y)) addCell(...cellOf(y, x));
        }
      }
    }
  }
}

// Stored as run-length rows: "south|latStep|lngStep|west:count,west:count".
const lines = [...rows.entries()]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([key, wests]) => {
    const lngStep = Number(key.split('|')[2]);
    const sorted = [...wests].sort((a, b) => a - b);
    const runs = [];
    for (const w of sorted) {
      const last = runs[runs.length - 1];
      if (last && Math.abs(last[0] + last[1] * lngStep - w) < 1e-9) last[1]++;
      else runs.push([w, 1]);
    }
    return `${key}|${runs.map(([w, n]) => `${w}:${n}`).join(',')}`;
  });
writeFileSync(outPath, `${JSON.stringify(lines)}\n`);
const total = [...rows.values()].reduce((sum, s) => sum + s.size, 0);
console.log(`${total} cells in ${lines.length} rows, ${JSON.stringify(lines).length} bytes`);
