import * as THREE from 'three';
import { CRASH } from './crashTrail.js';
import { Cutaway } from './cutaway.js';
import { createRandom } from './random.js';
import { CABIN, CAVE, CAVE_ROCKS, STAND, barrel, cabin, cave, huntingStand } from './poiModels.js';

// Places to find around the map, so there's something to explore between the woods and
// meadows: abandoned log cabins, caves in the hillsides, and hunters' stands at the edges of
// the woods. Each has something to search (hold E), and cabins and caves are warm shelter,
// where you can sleep at night. Up a hunting stand, animals don't notice you.
//
// How many of each, and how far apart they keep (from each other and anything else here).
export const POIS = {
  cabin: { count: 12, spacing: 110, clearing: 10 },
  cave: { count: 9, spacing: 90, clearing: 8 },
  stand: { count: 26, spacing: 55, clearing: 3 },
};
const CRASH_GAP = 80; // meters from the crash
const LOOKOUT_GAP = 45;
const SHOW_DISTANCE = 150; // things further away than this aren't drawn
const SEARCH_HEIGHT = 1.5; // you need to be about level with something to search it
const ROOF_MARGIN = 0.3;

// What can be found, and how likely each is: [item, [fewest, most], weight].
const LOOT = {
  cabin: [
    ['bandage', [1, 3], 3], ['rope', [1, 3], 3], ['torch', [1, 2], 2], ['cookedMeat', [1, 3], 2],
    ['arrow', [2, 5], 1.5], ['hide', [1, 2], 1], ['wood', [2, 5], 1.5], ['flask', [1, 1], 0.6],
    ['lighter', [1, 1], 0.5], ['knife', [1, 1], 0.6], ['map', [1, 1], 0.25], ['berries', [3, 6], 1],
  ],
  cave: [
    ['bandage', [1, 2], 2], ['rope', [1, 3], 2], ['torch', [1, 3], 3], ['hide', [1, 3], 2],
    ['arrow', [2, 4], 1], ['flask', [1, 1], 0.7], ['lighter', [1, 1], 0.6], ['cookedMeat', [1, 2], 1],
  ],
  stand: [
    ['arrow', [3, 6], 4], ['cookedMeat', [1, 2], 2], ['rope', [1, 2], 1.5], ['bandage', [1, 2], 1],
    ['bow', [1, 1], 0.5], ['torch', [1, 1], 1],
  ],
};
// How many different things each container holds: [fewest, most]. A stand's ammo box is
// sometimes empty.
const ROLLS = { cupboard: [2, 3], chest: [1, 3], stash: [2, 3], ammo: [0, 2] };

// ---------------------------------------------------------------------------------------
// Choosing where they go (before trees and rocks, so those keep clear).

// Returns [{ kind, x, z, heading, base, seed }]. `base` is the height of the cabin's floor,
// the cave's middle or the stand's foot.
export function choosePois(random, terrain, worldSize, lookout) {
  const half = worldSize / 2 - 20;
  const chosen = [];
  const roomFor = (kind, x, z) =>
    Math.hypot(x - CRASH.x, z - CRASH.z) > CRASH_GAP &&
    Math.hypot(x - lookout.x, z - lookout.z) > LOOKOUT_GAP &&
    chosen.every((p) => Math.hypot(p.x - x, p.z - z) > (POIS[kind].spacing + POIS[p.kind].spacing) / 2);
  const heightsAround = (x, z, r) =>
    [[0, 0], [r, r], [r, -r], [-r, r], [-r, -r], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => terrain.heightAt(x + dx, z + dz));
  const flatness = (x, z, r) => {
    const h = heightsAround(x, z, r);
    return Math.max(...h) - Math.min(...h);
  };
  const SUITS = {
    // Cabins on flat, dry ground below the mountains, often by water or the woods.
    cabin: (x, z) =>
      terrain.mountainAt(x, z) < 0.25 && terrain.isDry(x, z, 6, 1) && flatness(x, z, 3.3) < 0.6 &&
      (terrain.nearWater(x, z, 40) || terrain.forest(x, z) > -0.1 || random.next() < 0.3),
    // Caves dug into a slope on rocky ground or up the mountains.
    cave: (x, z) => {
      const rocky = terrain.mountainAt(x, z) > 0.04 || terrain.groundAt(x, z).kind === 'rock';
      return rocky && terrain.mountainAt(x, z) < 0.5 && terrain.isDry(x, z, 6, 1) && slope(terrain, x, z) > 0.12 && slope(terrain, x, z) < 0.38;
    },
    // Stands at the edges of the woods, where the deer come out to graze.
    stand: (x, z) => {
      const forest = terrain.forest(x, z);
      return forest > -0.25 && forest < 0.3 && terrain.mountainAt(x, z) < 0.15 && terrain.isDry(x, z, 3, 1) && flatness(x, z, 1.5) < 0.8;
    },
  };
  for (const kind of Object.keys(POIS)) {
    const { count } = POIS[kind];
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 400; tries++) {
      const x = random.range(-half, half);
      const z = random.range(-half, half);
      if (!roomFor(kind, x, z) || !SUITS[kind](x, z)) continue;
      let heading = random.range(0, Math.PI * 2);
      let base;
      if (kind === 'cabin') {
        base = Math.max(...heightsAround(x, z, 3.0)) + 0.25; // the floor stands clear of the ground
      } else if (kind === 'cave') {
        // The mouth faces downhill; the back is dug into the slope.
        const { dx, dz } = gradient(terrain, x, z);
        heading = Math.atan2(-dx, -dz);
        base = terrain.heightAt(x, z);
      } else {
        base = Math.min(...heightsAround(x, z, 1.1)) - 0.05;
      }
      chosen.push({ kind, x, z, heading, base, seed: Math.floor(random.next() * 1e9) });
      placed++;
    }
  }
  return chosen;
}

function gradient(terrain, x, z) {
  const e = 2;
  return {
    dx: (terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z)) / (2 * e),
    dz: (terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e),
  };
}

function slope(terrain, x, z) {
  const { dx, dz } = gradient(terrain, x, z);
  return Math.hypot(dx, dz);
}

// The place's own space to world (x, z), and back.
export function fromPoi(poi, x, z) {
  const c = Math.cos(poi.heading);
  const s = Math.sin(poi.heading);
  return { x: poi.x + x * c + z * s, z: poi.z - x * s + z * c };
}

export function toPoi(poi, x, z) {
  const dx = x - poi.x;
  const dz = z - poi.z;
  const c = Math.cos(poi.heading);
  const s = Math.sin(poi.heading);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

// How much ground each keeps clear of trees and rocks.
export function poiClearing(poi) {
  return { x: poi.x, z: poi.z, radius: POIS[poi.kind].clearing };
}

// ---------------------------------------------------------------------------------------
// What the player can't walk through (in world space), and what they can stand on.

// Rows of small circles along a line from a to b (in the place's own space).
function wallLine(poi, [ax, az], [bx, bz], radius, extra = {}) {
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / (radius * 1.8)));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ ...fromPoi(poi, ax + (bx - ax) * t, az + (bz - az) * t), radius, ...extra });
  }
  return out;
}

export function poiObstacles(poi) {
  const at = (x, z, radius, extra = {}) => ({ ...fromPoi(poi, x, z), radius, ...extra });
  if (poi.kind === 'cabin') {
    const { halfWidth: W, halfDepth: D, wall, door } = CABIN;
    const [x0, x1, z0, z1] = [-W - wall, W + wall, -D - wall, D + wall];
    return [
      ...wallLine(poi, [x0, z0], [x1, z0], 0.18),
      ...wallLine(poi, [x0, z0], [x0, z1], 0.18),
      ...wallLine(poi, [x1, z0], [x1, z1], 0.18),
      ...wallLine(poi, [x0, z1], [-door - 0.18, z1], 0.18),
      ...wallLine(poi, [door + 0.18, z1], [x1, z1], 0.18),
      // The bed, the stove, the table, the cupboard and the chest.
      at(-2.15, -1.55, 0.4), at(-1.4, -1.55, 0.4), at(-0.65, -1.55, 0.4),
      at(2.0, -1.55, 0.42), at(1.3, 0.6, 0.55), at(-2.3, 0.55, 0.45), at(-1.75, 1.55, 0.45),
      at(W + wall + 0.7, D - 0.4, 0.35), // the rain barrel outside
    ];
  }
  if (poi.kind === 'cave') {
    const { radius: R, mouth } = CAVE;
    const out = [];
    // Round the chamber's wall, leaving the mouth open; and round the outside of the mound.
    for (const [r, size] of [[R - 0.05, 0.35], [R + 1.0, 0.6]]) {
      const steps = Math.ceil((2 * Math.PI * r) / (size * 1.7));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2; // 0 = the mouth (+z)
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < mouth + 0.05) continue;
        out.push(at(Math.sin(a) * r, Math.cos(a) * r, size));
      }
    }
    // The boulders either side of the mouth.
    for (const side of [-1, 1]) out.push(at(Math.sin(side * mouth) * (R + 0.6), Math.cos(mouth) * (R + 0.6), 0.9));
    for (const [x, z] of CAVE_ROCKS) out.push(at(x, z, 0.3));
    out.push(at(-1.9, -1.7, 0.35)); // the old pack
    return out;
  }
  // A hunting stand: its legs (down on the ground) and its rail (up on the platform).
  const { height: P, half, box } = STAND;
  const up = poi.base + P - 0.5;
  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => at(sx * (half + 0.22), sz * (half + 0.22), 0.15, { below: poi.base + 2.2 }));
  const e = half + 0.05;
  return [
    ...legs,
    ...wallLine(poi, [-e, -e], [e, -e], 0.12, { above: up }),
    ...wallLine(poi, [-e, -e], [-e, e], 0.12, { above: up }),
    ...wallLine(poi, [e, -e], [e, e], 0.12, { above: up }),
    // (The front is open, where the ladder comes up.)
    at(box[0], box[1], 0.28, { above: up }), // the ammo box
  ];
}

// The floors the player can stand on, and whether they're under a roof. See world.structures.
export function poiStructure(poi) {
  const reach = poi.kind === 'cave' ? CAVE.radius + 2 : poi.kind === 'cabin' ? CABIN.halfWidth + 2 : STAND.ladderFoot + 1;
  const near = (x, z) => Math.abs(x - poi.x) < reach && Math.abs(z - poi.z) < reach;
  return {
    poi,
    floorAt(x, z, maxY) {
      if (!near(x, z)) return -Infinity;
      const p = toPoi(poi, x, z);
      let y = -Infinity;
      if (poi.kind === 'cabin') {
        const { halfWidth: W, halfDepth: D, wall, door } = CABIN;
        if (Math.abs(p.x) <= W + wall && Math.abs(p.z) <= D + wall) y = poi.base;
        // The step up to the door.
        else if (Math.abs(p.x) <= door + 0.2 && p.z > D && p.z <= D + wall + 0.85) y = poi.base - 0.25;
      } else if (poi.kind === 'stand') {
        const { height: P, half, ladderFoot, ladderHalf } = STAND;
        if (Math.abs(p.x) <= half && Math.abs(p.z) <= half) y = poi.base + P;
        else if (Math.abs(p.x) <= ladderHalf && p.z > half && p.z <= ladderFoot) {
          // Up the ladder (steep, but you can climb it).
          y = poi.base + (P * (ladderFoot - p.z)) / (ladderFoot - half);
        }
      }
      return y <= maxY ? y : -Infinity;
    },
    roofOver(x, z, feet) {
      if (!near(x, z) || poi.kind === 'stand') return false;
      const p = toPoi(poi, x, z);
      if (poi.kind === 'cabin') {
        return Math.abs(p.x) <= CABIN.halfWidth + ROOF_MARGIN && Math.abs(p.z) <= CABIN.halfDepth + ROOF_MARGIN && feet > poi.base - 0.5;
      }
      return Math.hypot(p.x, p.z) < CAVE.radius - ROOF_MARGIN;
    },
  };
}

// ---------------------------------------------------------------------------------------
// Building them, searching them, and keeping only the nearby ones drawn.

export function buildPois(scene, world) {
  const woodPiles = []; // split logs stacked by the cabins: wood to take (see placeLoose)
  const all = world.pois.map((poi) => {
    const random = createRandom(poi.seed);
    const group = new THREE.Group();
    group.position.set(poi.x, poi.base, poi.z);
    group.rotation.y = poi.heading;
    const containers = [];
    const add = (object, label, lx, lz, y, rolls, table, options = {}) => {
      containers.push({ ...fromPoi(poi, lx, lz), y, label, object, loot: rollLoot(random, LOOT[table], rolls), searched: false, ...options });
    };
    let model;
    if (poi.kind === 'cabin') {
      model = cabin(random);
      add(model.userData.cupboard, 'the cupboard', -2.3, 0.55, poi.base, ROLLS.cupboard, 'cabin', { standing: true });
      add(model.userData.chest, 'the old chest', -1.75, 1.55, poi.base, ROLLS.chest, 'cabin');
      const rain = barrel();
      rain.position.set(CABIN.halfWidth + CABIN.wall + 0.7, groundY(world, poi, 3.45, 1.7), CABIN.halfDepth - 0.4);
      model.add(rain);
      // Split logs stacked by the wall: wood to take.
      woodPiles.push({ ...fromPoi(poi, -CABIN.halfWidth - 1.2, -0.8), count: 4 + Math.floor(random.next() * 5) });
      world.grass.clear(poi.x, poi.z, CABIN.halfWidth + 1.2);
    } else if (poi.kind === 'cave') {
      model = cave(random, (lx, lz) => groundY(world, poi, lx, lz));
      add(model.userData.stash, 'the old pack', -1.9, -1.7, poi.base, ROLLS.stash, 'cave');
      world.grass.clear(poi.x, poi.z, CAVE.radius + 1);
    } else {
      model = huntingStand(random);
      add(model.userData.box, 'the ammo box', ...STAND.box, poi.base + STAND.height, ROLLS.ammo, 'stand');
      world.grass.clear(poi.x, poi.z, 1.4);
    }
    group.add(model);
    group.visible = false;
    scene.add(group);
    // (Containers in a cave sit on its sloping floor.)
    for (const c of containers) if (poi.kind === 'cave') c.y = world.terrain.heightAt(c.x, c.z);
    return { poi, group, containers, cutaway: new Cutaway(group), seen: false };
  });

  const setOpen = (c, open) => {
    c.searched = open;
    c.object.userData.open(open);
  };

  return {
    all,
    // Puts the wood piles by the cabins on the ground (at the start of each game).
    placeLoose(pickups) {
      for (const { x, z, count } of woodPiles) pickups.drop('wood', count, x, z);
    },
    // Shows the ones near the player (or within `range`, e.g. through binoculars), and fades
    // whatever's between the camera and the player. Returns a place you've just come across
    // for the first time (within 15 m), if any.
    update(dt, camera, feet, position, range = SHOW_DISTANCE) {
      let found = null;
      for (const place of all) {
        const distance = Math.hypot(place.poi.x - position.x, place.poi.z - position.z);
        place.group.visible = distance < range;
        if (!place.group.visible) continue;
        place.cutaway.update(dt, camera, feet, position, distance < 12);
        if (!place.seen && distance < 15) {
          place.seen = true;
          found = place.poi;
        }
      }
      return found;
    },
    // Something to search within `reach` of (x, z), about level with your feet, if any.
    near(x, z, reach, feet) {
      let best = null;
      for (const place of all) {
        if (Math.abs(place.poi.x - x) > 8 || Math.abs(place.poi.z - z) > 8) continue;
        for (const c of place.containers) {
          const distance = Math.hypot(c.x - x, c.z - z);
          if (distance < reach && Math.abs(feet - c.y) < SEARCH_HEIGHT) [best, reach] = [c, distance];
        }
      }
      return best;
    },
    search(c) {
      setOpen(c, true);
      return c.loot;
    },
    // The cabin or cave you're inside (warm, and somewhere to sleep), or null.
    shelterAt(x, z, feet) {
      for (const structure of world.structures) {
        if (structure.poi && structure.roofOver(x, z, feet)) return structure.poi;
      }
      return null;
    },
    // True if you're up a hunting stand (where animals don't notice you).
    upAStand(x, z, feet) {
      return world.pois.some((poi) => poi.kind === 'stand' && feet > poi.base + STAND.height - 0.3 &&
        Math.abs(toPoi(poi, x, z).x) <= STAND.half + 0.1 && Math.abs(toPoi(poi, x, z).z) <= STAND.half + 0.1);
    },
    // Closes everything up again and forgets what you've found, for a new game.
    reset() {
      for (const place of all) {
        place.seen = false;
        for (const c of place.containers) setOpen(c, false);
      }
    },
  };
}

// The ground's height at (lx, lz) in the place's own space, relative to its base.
function groundY(world, poi, lx, lz) {
  const p = fromPoi(poi, lx, lz);
  return world.terrain.heightAt(p.x, p.z) - poi.base;
}

// Picks `rolls` ([fewest, most]) different things from `table`.
function rollLoot(random, table, [fewest, most]) {
  const count = fewest + Math.floor(random.next() * (most - fewest + 1));
  const left = [...table];
  const loot = [];
  for (let i = 0; i < count && left.length; i++) {
    const total = left.reduce((sum, [, , weight]) => sum + weight, 0);
    let pick = random.next() * total;
    const index = left.findIndex(([, , weight]) => (pick -= weight) <= 0);
    const [item, [a, b]] = left.splice(Math.max(0, index), 1)[0];
    loot.push([item, a + Math.floor(random.next() * (b - a + 1))]);
  }
  return loot;
}
