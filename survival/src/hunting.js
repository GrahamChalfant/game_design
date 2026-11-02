// Bow hunting (issue #23): every number to tune is here at the top. Pure logic only (no
// three.js), so it can be simulated outside the game: see sim/hunting-sim.mjs.

// --- Stones ---
export const STONE_AREA_PER_STONE = 400; // about 1 stone per this many square meters
export const STONE_CLUSTER_SIZE = [2, 4]; // stones lie in little groups of 2 to 4
export const STONE_CLUSTER_SPREAD = 1.4; // meters between stones in a group
export const STONE_STACK = 20;

// --- Bow and arrows ---
export const BOW_DURABILITY = 30; // shots before the bow breaks
export const ARROWS_PER_CRAFT = 3;
export const ARROW_SPEED = 30; // meters per second
export const ARROW_RANGE = 25; // meters an arrow flies before dropping (it's lost: no recovery in v1)
export const ARROW_HIT_PADDING = 0.15; // added to an animal's radius, so near misses still count
export const BOW_COOLDOWN = 0.8; // seconds between shots

// --- Animals ---
// Distance at which an animal notices the player and bolts, standing up / crouching.
export const FLEE_DISTANCE = {
  rabbit: { standing: 6, crouching: 3 },
  deer: { standing: 12, crouching: 5 },
};
export const HITS_TO_KILL = { rabbit: 1, deer: 1 }; // one arrow kills: a deer won't wait for a second
// What each animal gives when you take it from a trap or butcher it.
export const ANIMAL_DROPS = {
  rabbit: { rawMeat: 2, hide: 1, gut: 1 },
  deer: { rawMeat: 6, hide: 2, gut: 2 },
};
export const BUTCHER_TIME = { rabbit: 1, deer: 4 }; // seconds of holding E at a shot animal

export function fleeDistance(kind, sneaking) {
  const d = FLEE_DISTANCE[kind];
  return sneaking ? d.crouching : d.standing;
}

// Applies one arrow hit; returns true if the animal is now dead.
export function hitAnimal(animal) {
  animal.hits = (animal.hits ?? 0) + 1;
  return animal.hits >= HITS_TO_KILL[animal.kind];
}

// The first living animal an arrow moving from (x0, z0) to (x1, z1) passes through, or null.
// animals: [{ kind, position: { x, z }, radius, dead }].
export function arrowHitTest(x0, z0, x1, z1, animals) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz || 1e-9;
  let best = null;
  let bestT = Infinity;
  for (const animal of animals) {
    if (animal.dead) continue;
    const { x, z } = animal.position;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / len2));
    const distance = Math.hypot(x0 + dx * t - x, z0 + dz * t - z);
    if (distance <= animal.radius + ARROW_HIT_PADDING && t < bestT) {
      best = animal;
      bestT = t;
    }
  }
  return best;
}

// Where stones lie: groups of 2–4 near rocks and the lake shore, never deep in the forest.
// `isGoodCentre(x, z)` says whether a group can sit there; `random` is a seeded generator.
export function stoneSpots(random, worldSize, isGoodCentre, isFree = () => true) {
  const target = Math.round((worldSize * worldSize) / STONE_AREA_PER_STONE);
  const half = worldSize / 2 - 3;
  const spots = [];
  for (let tries = 0; spots.length < target && tries < target * 200; tries++) {
    const cx = random.range(-half, half);
    const cz = random.range(-half, half);
    if (!isGoodCentre(cx, cz)) continue;
    const size = Math.min(target - spots.length, Math.floor(random.range(STONE_CLUSTER_SIZE[0], STONE_CLUSTER_SIZE[1] + 1)));
    for (let i = 0; i < size; i++) {
      const angle = (i / size) * Math.PI * 2 + random.range(0, 1);
      const x = cx + Math.cos(angle) * STONE_CLUSTER_SPREAD * (i === 0 ? 0 : 1);
      const z = cz + Math.sin(angle) * STONE_CLUSTER_SPREAD * (i === 0 ? 0 : 1);
      if (isFree(x, z)) spots.push({ x, z });
    }
  }
  return spots;
}
