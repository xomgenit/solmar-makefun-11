// SOLMAR BAY — the city. A seeded procedural grid: WORLD 3600x3600, roads
// every 300px (64px wide), buildings filling the blocks between them, palms,
// a beach + sea + pier on the east edge, and nine named landmarks at fixed
// block centres (300*i+150, never a multiple of 300, so they never sit on a
// road). Landmark positions are fixed by design; the buildings, palms and
// colours are seeded, so ?seed=N rebuilds the same city.

import { makeRng, clamp } from './util.js';

export const WORLD = 3600;
export const ROAD_STEP = 300;
export const ROAD_W = 64;
export const BEACH_X = 3220; // sand starts here
export const SEA_X = 3420; // water starts here
export const PIER = { x: 3420, y: 1752, w: 168, h: 96 }; // walkable pier deck

const ZONES = [
  { name: 'Sunset Row', x0: 0, y0: 0, x1: 1800, y1: 1800 },
  { name: 'Bayfront', x0: 1800, y0: 0, x1: 3600, y1: 1800 },
  { name: 'Harbor District', x0: 0, y0: 1800, x1: 1800, y1: 3600 },
  { name: 'Kingside', x0: 1800, y0: 1800, x1: 3600, y1: 3600 },
];

export const LANDMARKS = [
  { id: 'hideout', name: "Danny's Hideout", cx: 450, cy: 450, w: 150, h: 110, zone: 'Sunset Row', color: '#e8b04b' },
  { id: 'diner', name: 'Sunny Side Diner', cx: 750, cy: 1350, w: 170, h: 110, zone: 'Sunset Row', color: '#f26d6d' },
  { id: 'garage', name: 'Bay City Garage', cx: 1350, cy: 750, w: 190, h: 120, zone: 'Sunset Row', color: '#7fb3d5' },
  { id: 'bank', name: 'Solmar Bay Bank', cx: 1650, cy: 1650, w: 200, h: 130, zone: 'Downtown Solmar', color: '#c9c9c9' },
  { id: 'docks', name: 'Harbor Docks', cx: 450, cy: 2850, w: 180, h: 120, zone: 'Harbor District', color: '#8d9db6' },
  { id: 'pier', name: 'Solmar Pier', cx: 3504, cy: 1800, w: 168, h: 96, zone: 'Solmar Beach', color: '#d9a066', walkable: true },
  { id: 'spa', name: 'Sunset Auto Spa', cx: 2250, cy: 2550, w: 190, h: 120, zone: 'Kingside', color: '#f9a8d4' },
  { id: 'hospital', name: 'Solmar General Hospital', cx: 2550, cy: 1050, w: 220, h: 140, zone: 'Bayfront', color: '#f5f5f5' },
  { id: 'ganghq', name: 'Harbor Kings HQ', cx: 2850, cy: 2850, w: 200, h: 140, zone: 'Kingside', color: '#5b2c6f' },
];

export function zoneAt(x, y) {
  if (x >= SEA_X) return 'Solmar Bay';
  if (x >= BEACH_X) return 'Solmar Beach';
  if (x > 1500 && x < 2100 && y > 1500 && y < 2100) return 'Downtown Solmar';
  for (const z of ZONES) {
    if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return z.name;
  }
  return 'Solmar Bay';
}

/** Is (x, y) on a road band? Roads run every 300px, 64px wide. */
export function onRoad(x, y) {
  const rx = ((x % ROAD_STEP) + ROAD_STEP) % ROAD_STEP;
  const ry = ((y % ROAD_STEP) + ROAD_STEP) % ROAD_STEP;
  return rx < ROAD_W / 2 || rx > ROAD_STEP - ROAD_W / 2 || ry < ROAD_W / 2 || ry > ROAD_STEP - ROAD_W / 2;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const landmarkById = {};
  for (const lm of LANDMARKS) {
    landmarkById[lm.id] = lm;
    if (!lm.walkable) {
      buildings.push({ x: lm.cx - lm.w / 2, y: lm.cy - lm.h / 2, w: lm.w, h: lm.h, landmark: lm.id, color: lm.color, roof: true });
    }
  }
  // Fill each block (between roads) with 1-3 buildings, skipping landmark blocks.
  const landmarkBlocks = new Set(LANDMARKS.filter((l) => !l.walkable).map((l) => `${Math.floor(l.cx / ROAD_STEP)},${Math.floor(l.cy / ROAD_STEP)}`));
  const palette = ['#b7a99a', '#a8b8a0', '#c2b280', '#9aa5b1', '#c9a227', '#8fbcbb', '#d9c7a7', '#b0a090'];
  for (let bi = 0; bi < 12; bi++) {
    for (let bj = 0; bj < 12; bj++) {
      if (landmarkBlocks.has(`${bi},${bj}`)) continue;
      const bx = bi * ROAD_STEP + ROAD_W / 2 + 8;
      const by = bj * ROAD_STEP + ROAD_W / 2 + 8;
      const bw = ROAD_STEP - ROAD_W - 16;
      const bh = ROAD_STEP - ROAD_W - 16;
      if (bx + bw > BEACH_X) continue; // no buildings on the beach
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = 60 + rng() * 110;
        const h = 60 + rng() * 110;
        const x = bx + rng() * Math.max(1, bw - w);
        const y = by + rng() * Math.max(1, bh - h);
        buildings.push({ x, y, w, h, color: palette[Math.floor(rng() * palette.length)], roof: rng() < 0.7 });
      }
      // Palms along the block edges.
      const np = Math.floor(rng() * 3);
      for (let k = 0; k < np; k++) {
        palms.push({ x: bx + rng() * bw, y: by + rng() * bh, r: 8 + rng() * 5 });
      }
    }
  }
  // Beach palms in a row along the sand.
  for (let y = 120; y < WORLD; y += 140) {
    palms.push({ x: BEACH_X + 30 + rng() * 90, y: y + rng() * 60, r: 10 + rng() * 6 });
  }
  return { seed, buildings, palms, landmarkById, landmarks: LANDMARKS };
}

/**
 * Push a circle out of buildings, the sea (except the pier deck) and the world
 * edge. Returns the corrected {x, y}. The pier deck is walkable; the sea is not.
 */
export function collideCircle(city, x, y, r) {
  let px = clamp(x, r, WORLD - r);
  let py = clamp(y, r, WORLD - r);
  const onPier = px >= PIER.x - r && px <= PIER.x + PIER.w + r && py >= PIER.y - r && py <= PIER.y + PIER.h + r;
  if (!onPier && px > SEA_X - r) px = SEA_X - r;
  for (const b of city.buildings) {
    if (px + r < b.x || px - r > b.x + b.w || py + r < b.y || py - r > b.y + b.h) continue;
    const nx = clamp(px, b.x, b.x + b.w);
    const ny = clamp(py, b.y, b.y + b.h);
    const dx = px - nx;
    const dy = py - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      px = nx + (dx / d) * r;
      py = ny + (dy / d) * r;
    } else {
      const left = px - b.x;
      const right = b.x + b.w - px;
      const top = py - b.y;
      const bottom = b.y + b.h - py;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = b.x - r;
      else if (m === right) px = b.x + b.w + r;
      else if (m === top) py = b.y - r;
      else py = b.y + b.h + r;
    }
  }
  return { x: px, y: py };
}

/** Nearest point on the road network (road centrelines are multiples of 300). */
export function nearestRoadPoint(city, x, y) {
  const vx = clamp(Math.round(x / ROAD_STEP) * ROAD_STEP, 0, WORLD);
  const hy = clamp(Math.round(y / ROAD_STEP) * ROAD_STEP, 0, WORLD);
  const dv = Math.abs(x - vx);
  const dh = Math.abs(y - hy);
  if (dv <= dh) return { x: vx, y: clamp(y, 0, WORLD) };
  return { x: clamp(x, 0, WORLD), y: hy };
}
