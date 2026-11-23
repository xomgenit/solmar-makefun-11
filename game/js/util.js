// SOLMAR shared math + geometry helpers. No state, no DOM: every module
// imports what it needs from here, so the geometry has exactly one spelling.

/** Deterministic PRNG (mulberry32). `makeRng(7)` always yields the same stream. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};
export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `cur` toward `target` by at most `maxStep` radians. */
export function turnToward(cur, target, maxStep) {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/**
 * Push a circle (x, y, r) out of an axis-aligned rect {x, y, w, h}.
 * Returns the corrected {x, y}, or null when the circle does not touch it.
 */
export function pushCircleOutOfRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - nx;
  const dy = y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, y: ny + (dy / d) * r };
  }
  // Centre inside the rect: push out along the shortest exit.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y };
  if (m === right) return { x: rect.x + rect.w + r, y };
  if (m === top) return { x, y: rect.y - r };
  return { x, y: rect.y + rect.h + r };
}

/**
 * Does the segment (x1,y1)-(x2,y2) hit any rect in `rects`? Liang-Barsky slab
 * test: for each axis, p < 0 slabs are ENTERING (raise t0), p > 0 slabs are
 * EXITING (lower t1); a hit needs t0 <= t1 inside [0,1]. Getting the enter /
 * exit direction backwards makes line-of-sight lie, so this is the one
 * function the play-test checks directly.
 */
export function segmentHitsRects(x1, y1, x2, y2, rects) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const r of rects) {
    let t0 = 0;
    let t1 = 1;
    let hit = true;
    // p/q pairs: left, right, top, bottom slabs.
    const slabs = [
      [-dx, x1 - r.x],
      [dx, r.x + r.w - x1],
      [-dy, y1 - r.y],
      [dy, r.y + r.h - y1],
    ];
    for (const [p, q] of slabs) {
      if (p === 0) {
        if (q < 0) {
          hit = false;
          break;
        }
        continue;
      }
      const t = q / p;
      if (p < 0) {
        // Entering slab: the segment can only start being inside after t.
        if (t > t1) {
          hit = false;
          break;
        }
        if (t > t0) t0 = t;
      } else {
        // Exiting slab: the segment stops being inside after t.
        if (t < t0) {
          hit = false;
          break;
        }
        if (t < t1) t1 = t;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** Fisher-Yates shuffle with the given rng (in place). */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
