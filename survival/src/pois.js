import * as THREE from 'three';
import { CRASH } from './crashTrail.js';
import { Cutaway } from './cutaway.js';
import { createRandom } from './random.js';
import { loadModel } from './models.js';
import { CABIN, CAMP, LEAN_TO, STAND, TRUCK, barrel, cabin, campsite, huntingStand, leanTo, rustedTruck } from './poiModels.js';
import { ENTRANCE, buildUnderground, caveEntrance, entranceRocks } from './caves.js';
import {
  DEN, DOCK as DOCK_SPOT, FARM, LAKE, LAKE_CABIN, OBSERVATORY as OBSERVATORY_SPOT, RAVINE, RAVINE_CROSSING, SHELTER, STAND as STAND_SPOT, ravineAt, trailAt,
} from './layout.js';
import { BRIDGE, LANDMARKS, OBSERVATORY, buildLandmark, isLandmark, landmarkFloor, landmarkObstacles, landmarkRoofed } from './landmarks.js';

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
  camp: { count: 18, spacing: 60, clearing: 4.5 }, // abandoned campsites
  leanto: { count: 10, spacing: 80, clearing: 5 }, // trappers' lean-tos
  truck: { count: 0, spacing: 20, clearing: 4 }, // (left on the fire road: see roads.js)
  ...LANDMARKS, // (the observatory, the bridge, the hut, the dock, the barn and the den: see landmarks.js)
};
const CRASH_GAP = 80; // meters from the crash
const LOOKOUT_GAP = 45;
const SHOW_DISTANCE = 150; // things further away than this aren't drawn
const SEARCH_HEIGHT = 1.5; // you need to be about level with something to search it
const ROOF_MARGIN = 0.3;

const AXE_CHANCE = 0.25; // the chance a cabin has an axe (see the cabin's chest)
// What can be found, and how likely each is: [item, [fewest, most], weight].
const LOOT = {
  // The astronomer's cupboard up at the observatory: supplies for a long stay in the cold.
  observatory: [
    ['bandage', [1, 3], 2], ['matches', [3, 8], 2], ['cookedMeat', [1, 2], 1.5], ['torch', [1, 2], 1.5],
    ['rope', [1, 2], 1], ['flare', [1, 1], 0.8], ['map', [1, 1], 0.4],
  ],
  // The emergency box in the blizzard shelter.
  hut: [['bandage', [1, 2], 2], ['matches', [3, 6], 2], ['cookedMeat', [1, 2], 2], ['torch', [1, 1], 1], ['flare', [1, 1], 0.6]],
  cabin: [
    ['bandage', [1, 3], 3], ['rope', [1, 3], 3], ['torch', [1, 2], 2], ['cookedMeat', [1, 3], 2],
    ['arrow', [2, 5], 1.5], ['hide', [1, 2], 1], ['wood', [2, 5], 1.5], ['flask', [1, 1], 0.6],
    ['lighter', [1, 1], 0.5], ['matches', [3, 8], 1.5], ['knife', [1, 1], 0.6], ['map', [1, 1], 0.25], ['berries', [3, 6], 1],
  ],
  cave: [
    ['bandage', [1, 2], 2], ['rope', [1, 3], 2], ['torch', [1, 3], 3], ['hide', [1, 3], 2],
    ['arrow', [2, 4], 1], ['flask', [1, 1], 0.7], ['lighter', [1, 1], 0.6], ['matches', [2, 6], 1], ['cookedMeat', [1, 2], 1],
  ],
  // A miner's chest deep in a cave: the best finds on the map.
  deepCave: [
    ['bow', [1, 1], 1.2], ['knife', [1, 1], 1.2], ['lighter', [1, 1], 1], ['flask', [1, 1], 1],
    ['bandage', [2, 4], 2], ['arrow', [4, 8], 1.5], ['torch', [2, 3], 1.5], ['map', [1, 1], 0.5], ['hide', [2, 4], 1],
  ],
  camp: [
    ['cookedMeat', [1, 2], 2], ['berries', [3, 6], 2], ['rope', [1, 2], 2], ['bandage', [1, 2], 1.5],
    ['torch', [1, 2], 1.5], ['arrow', [1, 3], 1], ['flask', [1, 1], 0.4], ['lighter', [1, 1], 0.3], ['matches', [2, 6], 1.5],
  ],
  trapper: [
    ['trap', [1, 2], 3], ['rope', [2, 3], 2], ['hide', [2, 3], 2], ['knife', [1, 1], 1], ['cookedMeat', [1, 3], 1.5], ['gut', [1, 2], 1],
  ],
  truck: [
    ['bandage', [2, 3], 2], ['flare', [1, 1], 1], ['lighter', [1, 1], 1], ['matches', [3, 8], 1], ['map', [1, 1], 0.8], ['torch', [1, 2], 1], ['rope', [1, 2], 1],
  ],
  stand: [
    ['arrow', [3, 6], 4], ['cookedMeat', [1, 2], 2], ['rope', [1, 2], 1.5], ['bandage', [1, 2], 1],
    ['bow', [1, 1], 0.5], ['torch', [1, 1], 1], ['matches', [2, 5], 1],
  ],
};
// How many different things each container holds: [fewest, most]. A stand's ammo box is
// sometimes empty.
const ROLLS = { observatory: [2, 4], hut: [2, 3], cupboard: [2, 3], chest: [1, 3], stash: [2, 3], ammo: [0, 2], deepCave: [2, 4], camp: [0, 2], trapper: [2, 3], truck: [1, 3] };

// ---------------------------------------------------------------------------------------
// Choosing where they go (before trees and rocks, so those keep clear).

// The places on the map, by hand (see layout.js), south to north. Returns
// [{ kind, x, z, heading, base, seed }]: `base` is the height of the cabin's floor, the cave's
// middle or the stand's foot.
const PLACES = [
  // The coast: a trapper's lean-to in the woods west of the crash, a campsite by the shore.
  { kind: 'leanto', x: -290, z: -150, heading: 0.9 },
  { kind: 'camp', x: 230, z: 30, heading: -0.6 },
  // The foothills: the hunting stand, a hunters' camp, a cave in the mountains' foot, another
  // lean-to.
  { kind: 'stand', ...STAND_SPOT },
  { kind: 'camp', x: 130, z: -810, heading: 1.2 },
  { kind: 'cave', x: -640, z: -1230 },
  { kind: 'leanto', x: 520, z: -990, heading: 2.2 },
  { kind: 'den', ...DEN },
  // The mountains: the broken footbridge over the ravine, the blizzard shelter above it, and the
  // observatory by the saddle.
  { kind: 'bridge', x: RAVINE_CROSSING.x, z: RAVINE_CROSSING.z },
  { kind: 'hut', ...SHELTER },
  { kind: 'observatory', ...OBSERVATORY_SPOT },
  // The lakeshore cabin, set back from the water where the trail comes down, and its dock.
  { kind: 'cabin', x: LAKE_CABIN.x, z: LAKE.south(LAKE_CABIN.x) + 30, heading: LAKE_CABIN.heading },
  { kind: 'dock', x: DOCK_SPOT.x, z: LAKE.south(DOCK_SPOT.x) + 2, heading: Math.PI },
  // The farm: the farmhouse and the houses round it, and the barn with the pickup in it.
  { kind: 'cabin', ...FARM.house },
  ...FARM.houses.map((h) => ({ kind: 'cabin', ...h })),
  { kind: 'barn', ...FARM.barn },
  { kind: 'truck', x: FARM.barn.x + 0.4, z: FARM.barn.z, heading: FARM.barn.heading, pickup: true },
];

export function placePois(terrain) {
  const heightsAround = (x, z, r) =>
    [[0, 0], [r, r], [r, -r], [-r, r], [-r, -r], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => terrain.heightAt(x + dx, z + dz));
  return PLACES.map(({ kind, x, z, heading = 0, pickup }, i) => {
    let base;
    let rim;
    if (kind === 'bridge') {
      // Over the ravine where it actually cuts the trail (it wanders): find where the trail's
      // bed drops away into it on either side, put the bridge midway, and its rope barriers at
      // the rims. Its ends rest on the trail's bed either side.
      const along = RAVINE_CROSSING.along;
      const bedAt = (s) => { const p = trailAt(along + s); return terrain.heightAt(p.x, p.z); };
      const inRavine = (s) => { const p = trailAt(along + s); return ravineAt(p.x, p.z).distance < RAVINE.halfWidth + 1.8; };
      let [from, to] = [Infinity, -Infinity];
      for (let s = -15; s <= 15; s += 0.25) {
        if (inRavine(s)) [from, to] = [Math.min(from, s), Math.max(to, s)];
      }
      const middle = Number.isFinite(from) ? (from + to) / 2 : 0;
      const centre = trailAt(along + middle);
      ({ x, z, heading } = centre);
      rim = Number.isFinite(from) ? (to - from) / 2 + 0.8 : BRIDGE.rim;
      base = (bedAt(middle - rim - 1) + bedAt(middle + rim + 1)) / 2;
    } else if (kind === 'dock') {
      base = Math.max(LAKE.level + 0.6, terrain.heightAt(x, z) + 0.08); // (the deck a little above the water)
    } else if (kind === 'den') {
      const { dx, dz } = gradient(terrain, x, z);
      heading = Math.atan2(-dx, -dz);
      base = terrain.heightAt(x, z);
    } else if (kind === 'cabin') {
      base = Math.max(...heightsAround(x, z, 3.0)) + 0.25; // the floor stands clear of the ground
    } else if (kind === 'cave') {
      // The mouth faces downhill; the back is dug into the slope.
      const { dx, dz } = gradient(terrain, x, z);
      heading = Math.atan2(-dx, -dz);
      base = terrain.heightAt(x, z);
    } else if (kind === 'stand') {
      base = Math.min(...heightsAround(x, z, 1.1)) - 0.05;
    } else {
      base = terrain.heightAt(x, z);
    }
    return { kind, x, z, heading, base, seed: 1000 + i * 7919, pickup, rim };
  });
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
  if (isLandmark(poi.kind)) return landmarkObstacles(poi, at, (a, b, radius, extra) => wallLine(poi, a, b, radius, extra));
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
    // The rocks round the hole, and the slab leaning over its back. (Underground, the cave has
    // its own walls: see caves.js.)
    return [...entranceRocks().map(([x, z, size]) => at(x, z, size * 0.9)), at(0, -1.6, 1.1)];
  }
  if (poi.kind === 'camp') {
    return [at(0, 0, 0.6), at(-1.4, 0.3, 0.45), at(-1.2, -2.0, 0.9), at(...CAMP.pack, 0.35)];
  }
  if (poi.kind === 'leanto') {
    const { half, depth, crate, rack, block } = LEAN_TO;
    return [
      at(-half, depth / 2, 0.15), at(half, depth / 2, 0.15),
      ...wallLine(poi, [-half, -depth / 2 - 0.3], [half, -depth / 2 - 0.3], 0.25), // the roof comes down to the ground at the back
      ...wallLine(poi, [-half, depth / 2], [-half, -depth / 2 - 0.3], 0.15),
      ...wallLine(poi, [half, depth / 2], [half, -depth / 2 - 0.3], 0.15),
      at(...crate, 0.4), at(rack[0], rack[1] - 0.7, 0.12), at(rack[0], rack[1] + 0.7, 0.12), at(...block, 0.3),
    ];
  }
  if (poi.kind === 'truck') {
    const [hx, hz] = TRUCK.half;
    return wallLine(poi, [0, -hz], [0, hz], hx);
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
  const reach = poi.kind === 'cabin' ? CABIN.halfWidth + 2 : isLandmark(poi.kind) ? LANDMARKS[poi.kind].reach : STAND.ladderFoot + 1;
  const near = (x, z) => Math.abs(x - poi.x) < reach && Math.abs(z - poi.z) < reach;
  return {
    poi,
    floorAt(x, z, maxY) {
      if (!near(x, z)) return -Infinity;
      const p = toPoi(poi, x, z);
      let y = -Infinity;
      if (isLandmark(poi.kind)) {
        const floor = landmarkFloor(poi, p);
        if (floor !== null) y = poi.base + floor;
      } else if (poi.kind === 'cabin') {
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
      if (!near(x, z)) return false;
      if (isLandmark(poi.kind)) return landmarkRoofed(poi, toPoi(poi, x, z)) && feet > poi.base - 0.5;
      if (poi.kind !== 'cabin') return false;
      const p = toPoi(poi, x, z);
      return Math.abs(p.x) <= CABIN.halfWidth + ROOF_MARGIN && Math.abs(p.z) <= CABIN.halfDepth + ROOF_MARGIN && feet > poi.base - 0.5;
    },
  };
}

// ---------------------------------------------------------------------------------------
// Building them, searching them, and keeping only the nearby ones drawn.

// The Blender models (see blender/places.py) that replace each kind's stand-in once loaded.
// The things you search, and anything else marked `userData.keep`, stay as they are.
const MODELS = {
  cabin: 'cabin', stand: 'hunting-stand', leanto: 'lean-to', camp: 'campsite', truck: 'truck',
  ...Object.fromEntries(Object.entries(LANDMARKS).filter(([, l]) => l.model).map(([kind, l]) => [kind, l.model])),
};
const loading = new Map();
function useModel(place, model) {
  const name = MODELS[place.poi.kind];
  if (!name) return;
  if (!loading.has(name)) loading.set(name, loadModel(name));
  loading.get(name).then((glb) => {
    if (!glb) return;
    for (const c of place.containers) if (c.object.isObject3D) c.object.userData.keep = true;
    for (const child of [...model.children]) if (!child.userData.keep) model.remove(child);
    const copy = glb.clone();
    copy.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = child.receiveShadow = true;
      // A stand without a canopy.
      if (/roof/.test(child.name) && place.poi.kind === 'stand' && !model.userData.canopy) child.visible = false;
    });
    model.add(copy);
    if (place.poi.kind === 'cabin') model.add(roofBoards());
    place.cutaway.refresh();
  });
}

// Boards under a cabin's shingles. From inside (in the close-up views) the gaps between the
// rows of shingles would show slivers of sky; with these the ceiling is solid. Their name has
// "roof" in it, so they fade with the roof from above.
function roofBoards() {
  const { halfWidth: W, halfDepth: D, wall, peak, eave } = CABIN;
  const run = D + wall + 0.5;
  const rise = peak - eave;
  const group = new THREE.Group();
  // (Facing down, they only get the dim light bounced up off the ground, so they're lighter than
  // the logs and glow a little, or the ceiling reads as a black hole.)
  const material = new THREE.MeshLambertMaterial({ color: 0x7a5a40, emissive: 0x2a1c12, side: THREE.DoubleSide });
  for (const side of [1, -1]) {
    const boards = new THREE.Mesh(new THREE.PlaneGeometry(2 * (W + wall + 0.45), Math.hypot(run, rise)), material);
    boards.name = 'cabin-roof-boards';
    boards.rotation.x = -Math.PI / 2 + side * Math.atan2(rise, run);
    boards.position.set(0, (peak + eave) / 2 - 0.04, (side * run) / 2);
    group.add(boards);
  }
  return group;
}

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
    let underground = null;
    if (poi.kind === 'cabin') {
      model = cabin(random);
      add(model.userData.cupboard, 'the cupboard', -2.3, 0.55, poi.base, ROLLS.cupboard, 'cabin', { standing: true });
      add(model.userData.chest, 'the old chest', -1.75, 1.55, poi.base, ROLLS.chest, 'cabin');
      // One cabin in four has an axe in its chest: the only way to get one.
      if (createRandom(poi.seed + 7).next() < AXE_CHANCE) containers.at(-1).loot.push(['axe', 1]);
      const rain = barrel();
      rain.userData.keep = true;
      rain.position.set(CABIN.halfWidth + CABIN.wall + 0.7, groundY(world, poi, 3.45, 1.7), CABIN.halfDepth - 0.4);
      model.add(rain);
      // Split logs stacked by the wall: wood to take.
      woodPiles.push({ ...fromPoi(poi, -CABIN.halfWidth - 1.2, -0.8), count: 4 + Math.floor(random.next() * 5) });
      world.grass.clear(poi.x, poi.z, CABIN.halfWidth + 1.2);
    } else if (poi.kind === 'cave') {
      model = caveEntrance(random, (lx, lz) => groundY(world, poi, lx, lz));
      underground = buildUnderground(scene, poi, random, (x, z) => fromPoi(poi, x, z), (x, z) => toPoi(poi, x, z));
      for (const c of underground.containers) {
        containers.push({ ...c, loot: rollLoot(random, LOOT[c.table], c.table === 'deepCave' ? ROLLS.deepCave : ROLLS.stash), searched: false });
      }
      world.grass.clear(poi.x, poi.z, ENTRANCE.ring + 1);
    } else if (poi.kind === 'camp') {
      model = campsite(random, (lx, lz) => groundY(world, poi, lx, lz));
      // Some campers left their pack behind; others took it with them.
      const packAt = fromPoi(poi, ...CAMP.pack);
      if (random.next() < 0.7) add(model.userData.pack, 'the abandoned pack', ...CAMP.pack, world.terrain.heightAt(packAt.x, packAt.z), ROLLS.camp, 'camp');
      else model.userData.pack.visible = false;
      world.grass.clear(poi.x, poi.z, 2.5);
    } else if (poi.kind === 'leanto') {
      model = leanTo(random, (lx, lz) => groundY(world, poi, lx, lz));
      add(model.userData.crate, "the trapper's crate", ...LEAN_TO.crate, poi.base, ROLLS.trapper, 'trapper');
      world.grass.clear(poi.x, poi.z, 2.5);
    } else if (isLandmark(poi.kind)) {
      model = buildLandmark(poi, random, (object, label, lx, lz, y, table, options) => add(object, label, lx, lz, y, ROLLS[table], table, options), (lx, lz) => groundY(world, poi, lx, lz));
      world.grass.clear(poi.x, poi.z, LANDMARKS[poi.kind].clearing * 0.8);
    } else if (poi.kind === 'truck') {
      model = rustedTruck(random);
      add(model.userData.glovebox, 'the glovebox', ...TRUCK.door, poi.base, ROLLS.truck, 'truck', { standing: true });
    } else {
      model = huntingStand(random);
      add(model.userData.box, 'the ammo box', ...STAND.box, poi.base + STAND.height, ROLLS.ammo, 'stand');
      world.grass.clear(poi.x, poi.z, 1.4);
    }
    group.add(model);
    group.visible = false;
    scene.add(group);
    const place = { poi, group, containers, underground, cutaway: new Cutaway(group), seen: false };
    useModel(place, model);
    return place;
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
    // `cave` is the cave you're down in, if any: only it is drawn then.
    update(dt, camera, feet, position, range = SHOW_DISTANCE, cave = null) {
      let found = null;
      for (const place of all) {
        if (place.underground) {
          place.underground.group.visible = place.underground === cave;
          if (place.underground === cave) cave.update(dt, camera, feet, position);
        }
        if (cave) {
          place.group.visible = false;
          continue;
        }
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
        if (Math.abs(place.poi.x - x) > 25 || Math.abs(place.poi.z - z) > 25) continue; // (caves reach a way)
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
    shelterAt(x, z, feet, cave = null) {
      if (cave) return cave.poi;
      // Under a lean-to's roof.
      for (const poi of world.pois) {
        if (poi.kind !== 'leanto' || Math.abs(poi.x - x) > 4 || Math.abs(poi.z - z) > 4) continue;
        const p = toPoi(poi, x, z);
        if (Math.abs(p.x) < LEAN_TO.half && p.z < LEAN_TO.depth / 2 && p.z > -LEAN_TO.depth / 2 - 0.3) return poi;
      }
      for (const structure of world.structures) {
        if (structure.poi && structure.roofOver(x, z, feet)) return structure.poi;
      }
      return null;
    },
    // The cave whose way in you're stepping into at (x, z), if any.
    caveEntranceAt(x, z) {
      for (const place of all) {
        if (!place.underground) continue;
        if (Math.hypot(place.poi.x - x, place.poi.z - z) < ENTRANCE.trigger) return place.underground;
      }
      return null;
    },
    // Just outside a cave's way in, facing out: where you come back up.
    outside(cave) {
      return { ...fromPoi(cave.poi, 0, ENTRANCE.ring + 0.8), facing: cave.poi.heading };
    },
    // The observatory's telescope, if it's within reach of (x, z) about level with your feet:
    // { x, z, look } (look: which way it points, a unit vector on the ground).
    telescopeNear(x, z, feet) {
      for (const poi of world.pois) {
        if (poi.kind !== 'observatory') continue;
        const at = fromPoi(poi, ...OBSERVATORY.telescope);
        if (Math.hypot(at.x - x, at.z - z) > 1.6 || Math.abs(feet - (poi.base + OBSERVATORY.terrace.height)) > SEARCH_HEIGHT) continue;
        return { x: at.x, z: at.z, look: { x: Math.sin(poi.heading), z: Math.cos(poi.heading) } };
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
