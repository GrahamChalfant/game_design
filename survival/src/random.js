// Seeded random numbers, so the same seed always builds the same map
// (needed for a daily challenge where everyone gets the same world).
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

// Smooth 2D noise (values roughly -1..1) for natural-looking patches.
export function createNoise(seed) {
  const random = createRandom(seed);
  const size = 256;
  // (In a typed array, each corner looked up once, wrapped round with & 255 (the same cell as
  // the remainder, for whole numbers either side of 0): it's called millions of times laying the
  // map out, and every value comes out exactly as before.)
  const values = Float64Array.from({ length: size * size }, () => random.next() * 2 - 1);
  const smooth = (t) => t * t * (3 - 2 * t);

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = smooth(x - x0);
    const sy = smooth(y - y0);
    const i0 = x0 & 255;
    const i1 = (x0 + 1) & 255;
    const row0 = (y0 & 255) * size;
    const row1 = ((y0 + 1) & 255) * size;
    const a = values[row0 + i0];
    const c = values[row1 + i0];
    const top = a + (values[row0 + i1] - a) * sx;
    const bottom = c + (values[row1 + i1] - c) * sx;
    return top + (bottom - top) * sy;
  };
}
