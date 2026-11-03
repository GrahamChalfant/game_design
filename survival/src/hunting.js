// Bow hunting (issue #23): every number to tune is here at the top. Pure logic only (no
// three.js), so it can be simulated outside the game: see sim/hunting-sim.mjs.

// --- Stones ---
export const STONE_AREA_PER_STONE = 400; // about 1 stone per this many square meters
export const STONE_CLUSTER_SIZE = [2, 4]; // stones lie in little groups of 2 to 4
export const STONE_CLUSTER_SPREAD = 1.4; // meters between stones in a group
export const STONE_STACK = 20;
export const STONE_RESPAWN_MINUTES = 3 * 24 * 60; // a taken stone is back three in-game days later...
export const STONE_RESPAWN_CLEARANCE = 12; // ...unless you're standing this close to the spot

// Brings stones back to spots that have been empty long enough. Each spot is { x, z } and
// gets an `emptySince` (game minutes). `hasStone(x, z)` says whether a stone lies there now;
// `restock(spot)` puts one back. `now` is game minutes, so sleeping counts as time passing.
export function respawnStones(spots, now, hasStone, restock, player) {
  for (const spot of spots) {
    if (hasStone(spot.x, spot.z)) {
      spot.emptySince = null;
    } else if (spot.emptySince == null) {
      spot.emptySince = now;
    } else if (
      now - spot.emptySince >= STONE_RESPAWN_MINUTES &&
      Math.hypot(spot.x - player.x, spot.z - player.z) > STONE_RESPAWN_CLEARANCE
    ) {
      restock(spot);
      spot.emptySince = null;
    }
  }
}

// --- Bow and arrows ---
export const BOW_DURABILITY = 30; // shots before the bow breaks
export const ARROWS_PER_CRAFT = 3;
// Hold the mouse button to draw the bow, and let go to shoot. The further you draw it, the
// faster and further the arrow flies; it arcs to the spot you aimed at (if it's in range),
// and lands there if it hits nothing. Arrows that miss can be picked up again.
export const BOW_DRAW_TIME = 0.9; // seconds to draw the bow all the way
export const BOW_MIN_DRAW = 0.25; // let go before this much draw and the arrow isn't loosed
export const ARROW_SPEED = [12, 24]; // meters per second, from a light draw to a full one
export const ARROW_RANGE = [8, 30]; // the furthest it flies, from a light draw to a full one
export const ARROW_ARC = 0.05; // how high the arrow arcs, as a share of the distance
export const ARROW_HIT_PADDING = 0.15; // added to an animal's radius, so near misses still count
export const BOW_COOLDOWN = 0.5; // seconds after a shot before you can draw again

// How fast and how far an arrow flies after drawing the bow `draw` (0–1) of the way.
export function arrowFlight(draw) {
  const t = Math.min(1, Math.max(0, (draw - BOW_MIN_DRAW) / (1 - BOW_MIN_DRAW)));
  return {
    speed: ARROW_SPEED[0] + (ARROW_SPEED[1] - ARROW_SPEED[0]) * t,
    range: ARROW_RANGE[0] + (ARROW_RANGE[1] - ARROW_RANGE[0]) * t,
  };
}

// --- Animals ---
// Distance at which an animal notices the player and bolts, standing up / crouching.
export const FLEE_DISTANCE = {
  rabbit: { standing: 6, crouching: 3 },
  deer: { standing: 12, crouching: 5 },
};
export const HITS_TO_KILL = { rabbit: 1, deer: 1, boar: 1 }; // one arrow kills: a deer won't wait for a second
// Knife stabs needed (issue #75/#76). Deer bolt before you can reach them, but count it anyway.
export const KNIFE_HITS_TO_KILL = { rabbit: 1, deer: 2, boar: 3 };
// What each animal gives when you take it from a trap or butcher it.
export const ANIMAL_DROPS = {
  rabbit: { rawMeat: 2, hide: 1, gut: 1 },
  deer: { rawMeat: 6, hide: 2, gut: 2 },
  boar: { rawMeat: 3, hide: 1, gut: 1 }, // less than a deer (#76)
};
export const BUTCHER_TIME = { rabbit: 1, deer: 4, boar: 2.5 }; // seconds of holding E at a shot animal

// --- Stone knife (issue #75) ---
export const KNIFE_DURABILITY = 20; // stabs that land before the knife breaks (misses are free)
export const KNIFE_RANGE = 1.6; // meters from the player's centre to the tip of a stab
export const KNIFE_ARC = Math.PI / 3; // stabs hit anything within ±60° of where you face
export const KNIFE_COOLDOWN = 0.45; // seconds between stabs (hold the button to keep stabbing)

// --- Boar (issue #76) ---
// Boars don't flee: they charge when you get close, standing up / crouching.
export const BOAR_CHARGE_DISTANCE = { standing: 7, crouching: 3.5 };
export const BOAR_WALK_SPEED = 2.5; // m/s while wandering
export const BOAR_CHARGE_SPEED = 4.5; // m/s: a little slower than the player's 5, so you can back off
export const BOAR_CALM_DISTANCE = 14; // gives up the charge once you're this far away
export const BOAR_ATTACK_REACH = 1.1; // meters between centres for a gore to land
export const BOAR_DAMAGE = 12; // health lost per gore
export const BOAR_ATTACK_COOLDOWN = 1.5; // seconds between gores
export const BOAR_COUNT = 3;

export function chargeDistance(sneaking) {
  return sneaking ? BOAR_CHARGE_DISTANCE.crouching : BOAR_CHARGE_DISTANCE.standing;
}

export function fleeDistance(kind, sneaking) {
  const d = FLEE_DISTANCE[kind];
  return sneaking ? d.crouching : d.standing;
}

// Applies one hit ('arrow' or 'knife'); returns true if the animal is now dead.
// Damage is tracked as a fraction, so mixing a stab and an arrow still adds up.
export function hitAnimal(animal, weapon = 'arrow') {
  const needed = (weapon === 'knife' ? KNIFE_HITS_TO_KILL : HITS_TO_KILL)[animal.kind];
  animal.wounds = (animal.wounds ?? 0) + 1 / needed;
  animal.hits = (animal.hits ?? 0) + 1;
  return animal.wounds >= 1 - 1e-9;
}

// The nearest living animal a knife stab from (x, z) facing `facing` reaches, or null.
export function knifeHitTest(x, z, facing, animals) {
  let best = null;
  let bestDistance = Infinity;
  for (const animal of animals) {
    if (animal.dead) continue;
    const dx = animal.position.x - x;
    const dz = animal.position.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance > KNIFE_RANGE + animal.radius) continue;
    const angle = Math.atan2(dx, dz) - facing;
    const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    if (off > KNIFE_ARC && distance > animal.radius) continue; // behind you (unless touching)
    if (distance < bestDistance) [best, bestDistance] = [animal, distance];
  }
  return best;
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
