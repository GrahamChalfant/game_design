import * as THREE from 'three';
import { createNoise } from './random.js';

const { smoothstep, clamp } = THREE.MathUtils;

// The map, shaped by hand: the same every game. North is −z (up the screen), and the journey
// runs south to north:
//
//   the crash on the south coast (the fisherman's shack at the river mouth; the county road just
//   north, west over the river to the homestead and Bald Knob's old lookout, east to the fire
//   tower on its hill) → the foothills (deer, wolves, the hunting stand, the hunter's cabin under
//   the Bluff, the burnt cabin; the jeep track north to the trailhead and the waterfall) → the
//   mountains, a wall right across the map with one way over
//   (a trail with a ravine to cross and a blizzard shelter) → the observatory near the top →
//   down to the big lake (the lakeshore cabin and its dock) → across it, the abandoned farm and
//   the road north, off the edge of the map.
//
// The mountains and the lake are the only hard barriers; everything else blends into the next.
// Everything here is in meters, with the crash at (0, 0).

// The fixed seed for the land's small-scale detail (hummocks, the woods' edges, where each tree
// stands): fixed, so the map is the same every time.
export const MAP_SEED = 691551;
const noise = createNoise(MAP_SEED + 101);

// The playable area: 2 km east to west, 3 km south to north.
export const BOUNDS = { minX: -1000, maxX: 1000, minZ: -2750, maxZ: 250 };
export const inBounds = (x, z, margin = 0) =>
  x > BOUNDS.minX + margin && x < BOUNDS.maxX - margin && z > BOUNDS.minZ + margin && z < BOUNDS.maxZ - margin;

// --- The coast ----------------------------------------------------------------------------
// The sea fills the south of the map. Its shore wanders in bays and points, about a hundred
// meters south of the crash. You can wade and swim a little way out, but no further.
export const SEA_LEVEL = 0;
export const coastZ = (x) => 88 + 30 * noise(x * 0.0032 + 11, 3.1) + 9 * noise(x * 0.017 + 40, 7.7) + 14 * smoothstep(Math.abs(x), 120, 600);
export const SEA_SWIM = 35; // meters out from the shore you can swim before turning back

// --- The fire tower ------------------------------------------------------------------------
// On a hill inland, north-east of the crash, looking out over the coast and the foothills.
export const TOWER = { x: 330, z: -430, heading: 0.6, hill: { top: 22, radius: 30, foot: 200, height: 28 } };

// --- The south, filled in -------------------------------------------------------------------
// Between the crash and the mountains: two more hills, an old county road with a few homes
// along it, tracks off it, a second (older) lookout tower, and a waterfall where the river
// comes off the mountains' foot.
//
// The hills: { x, z, radius (its flat top), foot (where it meets the land), height }. The
// Bluff's south side drops away in a short cliff (`cliff`: how far out from the middle the
// cliff's foot is on that side, and which way that side faces, as atan2(dx, dz)).
export const HILLS = [
  { name: 'Bald Knob', x: -650, z: -620, radius: 38, foot: 235, height: 40 },
  { name: 'The Bluff', x: 720, z: -1000, radius: 26, foot: 175, height: 30, cliff: { foot: 44, facing: 0.15 } },
];
// The west lookout: an older fire tower on top of Bald Knob, looking out over the west.
export const WEST_TOWER = { x: -650, z: -620, heading: -0.5 };
// The waterfall: where the river starts, it drops off a rock step at the mountains' foot into
// a pool. `x, z` is the middle of the cliff's foot; the water falls toward `heading` (as
// atan2(dx, dz)) from `drop` meters up; the step is `width` meters across, and the pool at its
// foot `pool` meters across.
export const FALLS = { x: -226, z: -1228, heading: 0.12, drop: 9, width: 30, pool: 8 };
// The fisherman's shack at the river mouth, the homestead on the county road, the hunter's
// cabin under the Bluff, and the burnt-out cabin off in the west foothills.
export const SHACK = { x: -112, z: 66, heading: 1.25 };
export const HOMESTEAD = { x: -575, z: -272, heading: 0.1 };
export const HUNTER_CABIN = { x: 762, z: -782, heading: 0.3 };
export const BURNT_CABIN = { x: -790, z: -830, heading: 0.7 };
// Where the jeep track ends, below the mountain trail: a gravel pull-off with a car left in it.
export const TRAILHEAD = { x: -112, z: -1118, heading: 2.6 };
// The roads (each a list of points, smoothed in roads.js), and how wide each is:
//   the county road, in off the west edge, past the homestead, over the river on the old
//   bridge, along north of the crash and up to the fire tower's gate;
//   the jeep track north from it to the trailhead; the spur off the fire road to the hunter's
//   cabin; and footpaths from the crash out to the road and from the homestead up Bald Knob.
export const ROADS = {
  county: { width: 4, points: [
    { x: -1010, z: -175 }, { x: -880, z: -192 }, { x: -760, z: -230 }, { x: -640, z: -250 }, { x: -575, z: -252 },
    { x: -470, z: -244 }, { x: -340, z: -228 }, { x: -240, z: -240 }, { x: -147, z: -245 }, { x: -105, z: -230 },
    { x: -60, z: -205 }, { x: 10, z: -195 }, { x: 70, z: -205 }, { x: 125, z: -245 }, { x: 190, z: -310 },
    { x: 260, z: -385 }, { x: 330, z: -428 },
  ] },
  jeep: { width: 2.6, points: [
    { x: -40, z: -203 }, { x: -46, z: -300 }, { x: -30, z: -420 }, { x: 15, z: -540 }, { x: 52, z: -650 },
    { x: 62, z: -745 }, { x: 50, z: -830 }, { x: 5, z: -920 }, { x: -50, z: -1010 }, { x: -90, z: -1080 }, { x: -108, z: -1112 },
  ] },
  spur: { width: 2.6, points: [
    { x: 680, z: -386 }, { x: 698, z: -470 }, { x: 694, z: -560 }, { x: 718, z: -640 }, { x: 750, z: -715 }, { x: 760, z: -770 },
  ] },
  crashPath: { width: 1.4, foot: true, points: [{ x: -6, z: -20 }, { x: -14, z: -80 }, { x: -28, z: -140 }, { x: -45, z: -200 }] },
  knobPath: { width: 1.4, foot: true, points: [
    { x: -548, z: -251 }, { x: -546, z: -300 }, { x: -566, z: -350 }, { x: -588, z: -415 }, { x: -612, z: -490 }, { x: -640, z: -560 }, { x: -646, z: -606 },
  ] },
};
// Where the county road crosses the river: the old timber road bridge.
export const ROAD_BRIDGE = { x: -147, z: -245 };

// --- The foothills -----------------------------------------------------------------------
// Rolling mixed forest and meadow rising to the mountains: deer, wolves and their den, and the
// hunting stand.
export const STAND = { x: -290, z: -930, heading: 0.4 };
export const DEN = { x: 410, z: -1120, heading: 2.6 };

// --- The mountains ------------------------------------------------------------------------
// A wall from one side of the map to the other: its southern foot, the ridgeline along its top,
// and its northern foot, each wandering in and out east to west, with peaks standing up along
// the ridge (each { x, z, radius, height }).
export const RANGE = {
  southFoot: (x) => -1255 + 80 * noise(x * 0.0025 + 300, 1.7) + 30 * noise(x * 0.009 + 310, 2.3),
  crest: (x) => {
    const wander = (u) => -1635 + 55 * noise(u * 0.003 + 330, 2.9) + 15 * noise(u * 0.012 + 345, 4.1);
    // (Through the saddle where the trail crosses.)
    return wander(x) + (SADDLE.z - wander(SADDLE.x)) * Math.exp(-(((x - SADDLE.x) / 220) ** 2));
  },
  northFoot: (x) => -1965 + 40 * noise(x * 0.003 + 390, 5.1) + 15 * noise(x * 0.011 + 400, 6.2),
  height: [70, 105], // meters above the land at their feet: the ridge's low and high stretches
  peaks: [
    { x: -880, z: -1620, radius: 210, height: 60 },
    { x: -640, z: -1680, radius: 180, height: 75 },
    { x: -420, z: -1600, radius: 200, height: 55 },
    { x: -230, z: -1660, radius: 160, height: 70 },
    { x: 330, z: -1610, radius: 170, height: 72 },
    { x: 560, z: -1670, radius: 210, height: 80 },
    { x: 790, z: -1600, radius: 190, height: 58 },
    { x: 960, z: -1660, radius: 170, height: 66 },
  ],
};
// The one way over: a trail switching back and forth up from the foothills to a saddle in the
// crest, then down the far side to the lakeshore cabin. Off it, the mountainsides are too steep
// to climb (see terrain.js: canClimb).
// A narrow footpath: it follows the lie of the land, cut into the mountainside only where it
// would otherwise be too steep to walk (see terrain.js: trailHeight), and climbs the steep
// slopes in tight switchbacks. Below the ravine they keep to its west side; one long traverse
// crosses it (at the broken bridge); above it they climb on its east side to the saddle.
export const TRAIL = {
  halfWidth: 1.3,
  points: [
    { x: -150, z: -1150 }, // out of the foothills...
    { x: -135, z: -1235 }, // ...to the mountains' foot
    { x: -195, z: -1275 },
    { x: -110, z: -1305 },
    { x: -200, z: -1340 },
    { x: -115, z: -1372 },
    { x: -205, z: -1405 },
    { x: -125, z: -1432 },
    { x: 15, z: -1458 }, // the traverse, over the ravine
    { x: 75, z: -1487 },
    { x: -5, z: -1515 },
    { x: 70, z: -1545 },
    { x: 0, z: -1578 },
    { x: 55, z: -1606 },
    { x: 45, z: -1640 }, // the saddle
    { x: 105, z: -1695 },
    { x: 20, z: -1728 },
    { x: 100, z: -1765 },
    { x: 15, z: -1800 },
    { x: 95, z: -1838 },
    { x: 20, z: -1875 },
    { x: 90, z: -1912 },
    { x: 35, z: -1948 },
    { x: 60, z: -1985 }, // down at the lakeshore
  ],
  saddle: 14, // which point is the saddle
  grade: 0.22, // the steepest it climbs: meters up per meter along
};
// The ravine cutting across the trail on the way up, with the old footbridge over it broken.
export const RAVINE = {
  top: { x: -55, z: -1575 }, // where it starts, high on the mountainside...
  bottom: { x: -75, z: -1285 }, // ...and where it opens out at the foot
  halfWidth: 4.5,
  depth: 13, // meters down, where the trail crosses (shallower towards its ends)
};
// A stone hut on the trail above the ravine, for sitting out a blizzard.
export const SHELTER = { x: -22, z: -1590, heading: 0.9 };
// The observatory, on a shoulder of the crest just east of the saddle: a domed building with a
// terrace looking north, down over the lake to the cabin.
export const OBSERVATORY = { x: 135, z: -1665, heading: Math.PI };

// --- The lake -------------------------------------------------------------------------------
// North of the mountains, from one side of the map to the other: far too wide to swim. The
// lakeshore cabin and its dock stand where the trail comes down; pines grow round it (for sap).
export const LAKE = {
  level: 14, // the water's surface, in meters
  south: (x) => -2045 + 45 * noise(x * 0.003 + 500, 6.6) + 22 * noise(x * 0.009 + 515, 4.4) + 8 * noise(x * 0.03 + 530, 2.2) + 15 * Math.exp(-(((x - 70) / 90) ** 2)),
  north: (x) => -2440 + 55 * noise(x * 0.003 + 560, 8.8) + 25 * noise(x * 0.009 + 575, 7.1) + 8 * noise(x * 0.03 + 590, 3.4),
  swim: 30, // meters out from either shore you can swim before turning back
};
export const LAKE_CABIN = { x: 66, heading: Math.PI }; // (z: set back from the shore: see places below)
export const DOCK = { x: 92 };

// --- The farm --------------------------------------------------------------------------------
// Across the lake, far north: a farmhouse, a barn with the pickup in it, a few houses, and the
// dirt road leading north off the edge of the map: the way out.
export const FARM = {
  house: { x: -60, z: -2600, heading: 0.1 },
  barn: { x: 40, z: -2615, heading: -0.1 },
  houses: [
    { x: -270, z: -2545, heading: 0.6 },
    { x: 230, z: -2565, heading: -0.4 },
    { x: 150, z: -2680, heading: 0.2 },
  ],
  road: [
    { x: -40, z: -2575 },
    { x: -15, z: -2620 },
    { x: -5, z: -2680 },
    { x: 10, z: -2730 },
    { x: 18, z: -2790 },
  ],
};

// Level ground for buildings: the land round each is flattened to one height (its middle's),
// blending back into the slope beyond (`radius` flat, then as far again to blend).
export const PADS = [
  { x: 135, z: -1665, radius: 17 }, // the observatory and its terrace
  { x: -22, z: -1590, radius: 6 }, // the blizzard shelter
  { x: -60, z: -2600, radius: 12 }, // the farmhouse
  { x: 40, z: -2615, radius: 14 }, // the barn
  { x: -270, z: -2545, radius: 9 },
  { x: 230, z: -2565, radius: 9 },
  { x: 150, z: -2680, radius: 9 },
];

// Where along the shore something by the lake stands: `back` meters inland from the south shore.
export const southShore = (x, back = 0) => ({ x, z: LAKE.south(x) + back });

// --- Regions --------------------------------------------------------------------------------
// Each part of the map, for what spawns where: animals (how common each kind is, 0–1), wolves,
// berry bushes (how many, as a share of the usual) and pines you can tap for sap.
export const REGIONS = {
  coast: { name: 'The coast', animals: { rabbit: 1, deer: 0.5 }, wolves: false, berries: 1, sap: false },
  tower: { name: 'The fire tower', animals: { rabbit: 1, deer: 0.7 }, wolves: false, berries: 0.8, sap: false },
  foothills: { name: 'The foothills', animals: { rabbit: 1, deer: 1 }, wolves: true, berries: 1.3, sap: false },
  mountains: { name: 'The mountains', animals: { rabbit: 0.3, deer: 0 }, wolves: false, berries: 0, sap: false },
  lake: { name: 'The lake', animals: { rabbit: 1, deer: 0.6 }, wolves: false, berries: 0.8, sap: true },
  farm: { name: 'The farm', animals: { rabbit: 1, deer: 0.8 }, wolves: false, berries: 0.6, sap: false },
};
const TOWER_REGION = 260; // meters round the tower that count as its region
const FOOTHILLS_FROM = -380; // north of this (z) the coast gives way to the foothills

// Which region (x, z) is in: a key of REGIONS.
export function regionAt(x, z) {
  if (z < LAKE.north(x) + 15) return 'farm';
  if (z < RANGE.northFoot(x)) return 'lake';
  if (z < RANGE.southFoot(x)) return 'mountains';
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER_REGION) return 'tower';
  if (z < FOOTHILLS_FROM + 30 * noise(x * 0.006 + 640, 9.9)) return 'foothills';
  return 'coast';
}

// --- The trail, worked out ------------------------------------------------------------------
// Its points with the distance along it to each.
const trailPoints = [];
{
  let along = 0;
  TRAIL.points.forEach((p, i) => {
    if (i > 0) along += Math.hypot(p.x - TRAIL.points[i - 1].x, p.z - TRAIL.points[i - 1].z);
    trailPoints.push({ ...p, along });
  });
}
export const TRAIL_LENGTH = trailPoints.at(-1).along;
export const SADDLE = trailPoints[TRAIL.saddle];

// The nearest point on the trail to (x, z): { distance, along } (how far from its middle, and how
// far along it from the foothills end). Reuses one object.
const nearest = { distance: Infinity, along: 0, x: 0, z: 0 };
export function nearestOnTrail(x, z) {
  nearest.distance = Infinity;
  for (let i = 1; i < trailPoints.length; i++) {
    const a = trailPoints[i - 1];
    const b = trailPoints[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < nearest.distance) {
      nearest.distance = d;
      nearest.along = a.along + (b.along - a.along) * t;
      nearest.x = px;
      nearest.z = pz;
    }
  }
  return nearest;
}

// The point `along` meters up the trail, and which way it heads there (radians, as atan2(dx, dz)).
export function trailAt(along) {
  for (let i = 1; i < trailPoints.length; i++) {
    const a = trailPoints[i - 1];
    const b = trailPoints[i];
    if (along <= b.along || i === trailPoints.length - 1) {
      const t = clamp((along - a.along) / (b.along - a.along), 0, 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }
  }
  return null;
}

// Where the ravine crosses the trail: { x, z, along } (and the ravine's own direction).
export const RAVINE_CROSSING = (() => {
  const { top, bottom } = RAVINE;
  let best = null;
  for (let t = 0; t <= 1; t += 0.002) {
    const x = top.x + (bottom.x - top.x) * t;
    const z = top.z + (bottom.z - top.z) * t;
    const n = nearestOnTrail(x, z);
    if (!best || n.distance < best.distance) best = { x: n.x, z: n.z, along: n.along, distance: n.distance, t };
  }
  return { ...best, heading: Math.atan2(bottom.x - top.x, bottom.z - top.z) };
})();

// How far (x, z) is from the ravine's middle line, and how far down it (0 at its top, 1 at the
// bottom): { distance, t }. Reuses one object.
const inRavine = { distance: Infinity, t: 0 };
export function ravineAt(x, z) {
  const { top, bottom } = RAVINE;
  const dx = bottom.x - top.x;
  const dz = bottom.z - top.z;
  const t = clamp(((x - top.x) * dx + (z - top.z) * dz) / (dx * dx + dz * dz), 0, 1);
  // (It wanders a little, as a stream-cut gully would.)
  const wobble = 5 * noise(t * 6 + 700, 1.1);
  inRavine.distance = Math.abs(Math.hypot(x - (top.x + dx * t), z - (top.z + dz * t)) * Math.sign((x - top.x) * dz - (z - top.z) * dx) - wobble);
  inRavine.t = t;
  return inRavine;
}

export { noise as layoutNoise };
