// random.js — a small seeded random source (mulberry32) plus the handful of
// helpers every other module reaches for. Seeding matters: the city, the
// traffic and the screenshot scenes must come out the same every run, so
// nothing in the game uses Math.random for world-building.

/** Create a generator from a 32-bit seed. Each call returns a float in [0, 1). */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max], both ends included. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of a non-empty array. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation from a to b by t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points. */
export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
