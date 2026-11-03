// The map is split into square chunks, and only the ones around the player are drawn, so a
// big map costs about the same to draw as a small one. Everything that streams uses these.

export const CHUNK_SIZE = 32; // meters along each side of a chunk
// How many chunks out from the player's chunk are drawn, in each direction. The camera sees
// about 50 m around the player at its widest zoom, so 3 chunks (at least 96 m) is plenty.
export const DRAW_CHUNKS = 3;

export function chunkOf(x, z) {
  return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
}

export function chunkKey(cx, cz) {
  return (cx + 32768) * 65536 + (cz + 32768);
}

// The chunks within `reach` chunks of the one holding (x, z), nearest first: [{ cx, cz, key }].
export function chunksAround(x, z, reach = DRAW_CHUNKS) {
  const [px, pz] = chunkOf(x, z);
  const chunks = [];
  for (let cx = px - reach; cx <= px + reach; cx++) {
    for (let cz = pz - reach; cz <= pz + reach; cz++) {
      chunks.push({ cx, cz, key: chunkKey(cx, cz), order: Math.max(Math.abs(cx - px), Math.abs(cz - pz)) });
    }
  }
  return chunks.sort((a, b) => a.order - b.order);
}

// A number that's the same every time for this seed and chunk, for seeding its random numbers.
export function chunkSeed(seed, cx, cz) {
  let h = seed ^ Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cz, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}
