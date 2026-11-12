import * as THREE from 'three';
import { CRASH, createCrashTrail } from './crashTrail.js';
import { createWater } from './water.js';
import { createRandom } from './random.js';
import {
  FALLS, HILLS, LAKE, MAP_SEED, PADS, RANGE, RAVINE, RAVINE_CROSSING, SADDLE, SEA_LEVEL, SEA_SWIM, TOWER, TRAIL, TRAIL_LENGTH,
  coastZ, inBounds, nearestOnTrail, ravineAt, trailAt,
} from './layout.js';
import { CHUNK_SIZE, DRAW_CHUNKS, chunksAround } from './stream.js';

const { smoothstep, clamp } = THREE.MathUtils;

// A northern autumn palette (after the tundra along the Dempster Highway): broad fields of
// gold, burnt orange, deep red and olive on the open ground, the darker forest floor, ochre
// dry ground, cool grey stone and scree.
const OCHRE = new THREE.Color(0xae8d58);
const MOSS = new THREE.Color(0x5e7444);
// The open tundra in autumn, in broad fields: straw gold, burnt orange where the dwarf birch
// and willow have turned, deep red where the bilberry and bearberry have, olive-brown where
// crowberry and Labrador tea stay dark; a muted green only down in the wet hollows.
// (Written lighter than they show: the ground's colours are darkened on the way to the
// screen, see createGround, so these land on gold (176,150,100), orange (178,125,72), red
// (150,75,50), olive (120,115,70) and green (105,115,75).)
const TUNDRA_GOLD = new THREE.Color(0xd7c8a7);
const TUNDRA_ORANGE = new THREE.Color(0xd8b890);
const TUNDRA_RED = new THREE.Color(0xc8927a);
const TUNDRA_OLIVE = new THREE.Color(0xb5b28e);
const TUNDRA_WET = new THREE.Color(0xaab292);
const FOREST_FLOOR = new THREE.Color(0x435440);
const STONE = new THREE.Color(0xb0b2b4);
const SNOW = new THREE.Color(0xe8eef2);
const MUD = new THREE.Color(0xa49884);
const GRAVEL = new THREE.Color(0xb0b0aa);
const WATER_BED = new THREE.Color(0x3e5a5c);
const SAND = new THREE.Color(0x8f877a); // the sea's beaches: grey-brown sand and shingle
const TORN_SOIL = new THREE.Color(0xb89a78);
const DARK_SOIL = new THREE.Color(0x9c8064);
const ROAD = new THREE.Color(0x9a8668); // the old fire road's packed dirt...
const RUT = new THREE.Color(0x7e6c54); // ...its wheel ruts...
const ROAD_GRASS = new THREE.Color(0x848e5c); // ...and the grass growing back down the middle

// The steepest ground anyone can walk up (the player and animals). Only the mountains' rock
// faces are steeper; lake beds and stream banks don't count (see canClimb).
export const MAX_CLIMB = THREE.MathUtils.degToRad(40);
// Where the mountains begin (see mountainAt): past this, no insects.
export const MOUNTAIN_FOOT = 0.02;

// Hummocks in the land (meters up or down): broad ones a few meters across, and small ones.
const RELIEF = [0.16, 0.05];
// The fire road's wheel ruts: how far out from the middle, how wide, how deep; and how much
// the middle stands up.
const RUTS = { at: 0.8, width: 0.45, depth: 0.1, crown: 0.04 };
// The roads' beds (see setRoads): how far either side (meters along) the land is averaged to lay
// the bed, the steepest it climbs (meters up per meter along: roads, footpaths), how far out
// from a road's edge the bank blends back into the land (roads, footpaths), and within how many
// meters of the river or a lake the road just follows the ground. Where a track joins a road,
// it eases from that road's bed into its own over `join` meters. It's never cut deeper than
// `cut` into the land, nor built up more than `fill` (a steeper climb, rather than a trench).
const ROAD_BED = { smooth: 14, grade: 0.12, footGrade: 0.35, shoulder: 3.2, footShoulder: 1.6, water: 6, join: 14, cut: 1.6, fill: 1.0 };
// Snow: lowland patches start where their noise passes `from`, and pile up to `depth`; the
// mountain snowfields pile up deeper.
const SNOW_PATCH = { from: 0.86, depth: 0.22 };
const SNOW_FIELD_DEPTH = 0.35;
const GROUND_CELL = 0.5; // meters along each side of a ground square: bigger gives bigger facets
const GROUND_BUDGET_MS = 3; // the most time per frame spent building ground
const GROUND_MARGIN = 72; // meters the ground carries on past the map's edge, into the haze
// The coast: the land's height at the shoreline, how fast the shore shelves down into the sea
// (meters down per meter out), how far down the sea bed goes, how high the land has risen by
// the mountains' foot, and how big the hills are by the sea and up in the foothills.
const COAST = { shore: 1.4, shelf: 0.2, rise: 20, hills: 3 };
const SEA_BED = -7;
const FOOTHILLS_HILLS = 9;
const LAKE_DEPTH = 7; // meters, out in the big lake's middle
// Meters up where the snow and cold start, whatever the mountain (see highUp): the snowline
// (MOUNTAINS.snowline) comes HIGH.from + snowline × HIGH.range up.
const HIGH = { from: 55, range: 52 };
const SADDLE_DIP = 0.28; // how much lower the crest is at the saddle the trail crosses
// Ponds of fresh water (the sea's salt): one near the crash, a few in the foothills.
const PONDS = [
  { x: 42, z: -30, radius: 12, depth: 3 },
  { x: -360, z: -560, radius: 16, depth: 2.6 },
  { x: 120, z: -760, radius: 13, depth: 2.6 },
  { x: -520, z: -1020, radius: 18, depth: 2.8 },
  { x: 560, z: -880, radius: 14, depth: 2.6 },
  // The pool at the foot of the waterfall, where the river starts (see FALLS).
  { x: FALLS.x + Math.sin(FALLS.heading) * (FALLS.pool * 0.75), z: FALLS.z + Math.cos(FALLS.heading) * (FALLS.pool * 0.75), radius: FALLS.pool * 0.75, depth: 2.2 },
];
// The river's course, from the mountains' foot down to the sea (it meanders between these).
const RIVER = [
  { x: FALLS.x + Math.sin(FALLS.heading) * FALLS.pool * 1.6, z: FALLS.z + Math.cos(FALLS.heading) * FALLS.pool * 1.6 }, // (out of the waterfall's pool)
  { x: -170, z: -1080 }, { x: -230, z: -900 }, { x: -160, z: -720 },
  { x: -210, z: -520 }, { x: -140, z: -330 }, { x: -175, z: -150 }, { x: -130, z: 20 }, { x: -150, z: 200 },
];
// Little creeks: clear, shallow and stony, running down off the hills into the river and the
// lakes. Each is traced uphill from where it meets the water until the ground stops rising.
const CREEKS = {
  count: 14,
  step: 2.5, // meters between points along a creek
  maxSteps: 140,
  minLength: 45, // meters: shorter ones aren't kept
  halfWidth: [0.4, 0.8], // at the spring, and where it meets the water
  depth: 0.24, // meters of water in the middle (shallow enough not to soak you: see WET_DEPTH in actions.js)
  clearOfCrash: 45,
};
// Up the mountains (past this far up: see mountainAt), you can only climb on the trail, or
// within this many meters of its edge.
const MOUNTAIN_WALL = 0.06;
const TRAIL_SHOULDER = 4;
const PROFILE_STEP = 3; // meters between the points of the trail's height profile (see trailHeight)
const RIVER_BANK_REACH = 22; // meters from the river's middle its banks are cut back to (see createRiver)
const CREEK_BED = new THREE.Color(0x8a8670); // pale pebbles under the water
// Snowy mountains. `up` is how far up a mountain you are, 0 at its foot to 1 near the top.
const MOUNTAINS = {
  reach: 620, // meters the range reaches into the map from its corner
  peaks: 12,
  highlandHeight: 16, // meters the whole corner rises before the peaks
  highlandUp: 0.4, // how far "up" the highland counts as: rocky and wooded, but not cold
  peakRadius: [130, 210], // meters from a peak to its foot
  height: [32, 72], // meters: the lowest foothill peaks and the highest, towards the corner
  clearOfCrash: 180, // meters kept between the crash and the foot of any peak
  screeFrom: 0.2, // `up` where scree and bare rock start to show...
  screeFull: 0.42, // ...and cover the ground
  snowline: 0.52, // `up` where the snow starts
  coldFrom: 0.42, // `up` where the air starts getting colder...
  coldFull: 0.68, // ...and is coldest
  ridgeRound: 0.25, // how rounded the ridges' crests and the gullies' bottoms are (0 is a sharp crease)
  blend: 5, // how sharply overlapping peaks meet: higher is closer to a crease, lower blends them more (and fills in the saddles)
};

// The land, shaped by hand (see layout.js): the sea along the south, the coast rising through
// the foothills to the wall of mountains, and beyond them the lake and the farmland. Everything
// is worked out from (x, z) so other code can ask "what's here?". Call build() to make its
// meshes once you've decided to keep it.
export function createTerrain(noise, bounds) {
  const random = createRandom(MAP_SEED + 5); // (for the creeks: fixed, like the rest)
  const hills = (x, z) => noise(x * 0.02 + 100, z * 0.02) * 4 + noise(x * 0.07 + 200, z * 0.07) * 0.8;
  // Gentle hummocks and hollows a few meters across, so the land isn't flat as a table at your
  // feet. (Smoothed away on the roads: see heightAt.)
  const relief = (x, z) => noise(x * 0.21 + 2100, z * 0.21) * RELIEF[0] + noise(x * 0.73 + 2200, z * 0.73) * RELIEF[1];

  // South of the mountains: the coast and the foothills, rising from the sea to the mountains'
  // foot, the hills growing as they go. The shore shelves gently into the sea.
  const tower = (x, z) => {
    const { hill } = TOWER;
    const d = Math.hypot(x - TOWER.x, z - TOWER.z);
    return hill.height * (1 - smoothstep(d, hill.radius, hill.foot)) ** 1.6;
  };
  // The other hills (see HILLS): round, a little lumpy, flat-topped; the Bluff with a cliff
  // down its south side.
  const hillShape = (hill, x, z) => {
    const dx = x - hill.x;
    const dz = z - hill.z;
    if (Math.abs(dx) > hill.foot * 1.2 || Math.abs(dz) > hill.foot * 1.2) return null;
    const d = Math.hypot(dx, dz) * (1 + 0.12 * noise(x * 0.012 + hill.x, z * 0.012 + 40));
    // How much (x, z) is out on the cliff's side (0 elsewhere).
    const toward = hill.cliff && d > 0 ? smoothstep((dx * Math.sin(hill.cliff.facing) + dz * Math.cos(hill.cliff.facing)) / d, 0.25, 0.8) : 0;
    return { d, toward, foot: hill.foot + (hill.cliff ? (hill.cliff.foot - hill.foot) * toward : 0) };
  };
  const hillHeight = (x, z) => {
    let h = 0;
    for (const hill of HILLS) {
      const shape = hillShape(hill, x, z);
      if (shape) h += hill.height * (1 - smoothstep(shape.d, hill.radius, shape.foot)) ** (1.6 - 0.9 * shape.toward);
    }
    return h;
  };
  // Bare rock (0–1): the cliff faces and the hills' open tops.
  const outcropAt = (x, z) => {
    let rock = 0;
    for (const hill of HILLS) {
      const shape = hillShape(hill, x, z);
      if (!shape) continue;
      rock = Math.max(rock, 0.55 * (1 - smoothstep(shape.d, hill.radius * 0.7, hill.radius * 1.3)));
      if (shape.toward > 0) rock = Math.max(rock, shape.toward * smoothstep(shape.d, hill.radius - 4, hill.radius + 2) * (1 - smoothstep(shape.d, shape.foot - 2, shape.foot + 4)));
    }
    return Math.max(rock, fallsAt(x, z).face);
  };
  // The waterfall's rock step (see FALLS): a shelf of rock behind a cliff that bows back at its
  // ends, ramping down to the land either side. Returns { shelf, face }: how much (x, z) is up on
  // the shelf (0–1), and how much on the cliff's face. Reuses one object.
  const falls = { shelf: 0, face: 0 };
  const fallsAt = (x, z) => {
    falls.shelf = 0;
    falls.face = 0;
    const dx = x - FALLS.x;
    const dz = z - FALLS.z;
    if (Math.abs(dx) > 140 || Math.abs(dz) > 140) return falls;
    const [s, c] = [Math.sin(FALLS.heading), Math.cos(FALLS.heading)];
    const side = dx * c - dz * s;
    const behind = -(dx * s + dz * c) + 0.012 * side * side;
    const across = 1 - smoothstep(Math.abs(side), FALLS.width / 2, FALLS.width / 2 + 24);
    falls.shelf = smoothstep(behind, -1.2, 1.6) * across * (1 - smoothstep(behind, 70, 110));
    falls.face = (1 - smoothstep(Math.abs(behind - 0.2), 1.4, 3)) * (1 - smoothstep(Math.abs(side), FALLS.width / 2, FALLS.width / 2 + 8));
    return falls;
  };
  const southLand = (x, z) => {
    const shore = coastZ(x);
    const inland = shore - z; // meters in from the shoreline
    if (inland < 0) return Math.max(SEA_BED, COAST.shore + inland * COAST.shelf);
    const t = clamp(inland / (shore - RANGE.southFoot(x)), 0, 1);
    const amp = (COAST.hills + (FOOTHILLS_HILLS - COAST.hills) * smoothstep(t, 0.3, 0.8)) * smoothstep(inland, 0, 70);
    const h = COAST.shore + COAST.rise * t ** 1.3 + (hills(x, z) / 4) * amp + tower(x, z) + hillHeight(x, z);
    // (Never down below the sea behind the shore, or the hollows there flood.)
    return Math.max(h, COAST.shore * 0.5 + Math.min(inland, 60) * 0.03);
  };
  // North of them: the lake's bed, and the land round it rising gently away from the water.
  const northLand = (x, z) => {
    const s = LAKE.south(x);
    const n = LAKE.north(x);
    if (z < s && z > n) {
      // In the lake: shelving down from each shore to its deep middle.
      const out = Math.min(s - z, z - n);
      return LAKE.level - 0.6 - LAKE_DEPTH * smoothstep(out, 0, 50);
    }
    const out = z >= s ? z - s : n - z; // meters back from the shore
    return LAKE.level + 0.8 + Math.min(out * 0.07, 10) + (hills(x, z) / 4) * 1.6 * smoothstep(out, 0, 40);
  };

  // The mountains: how far up them (x, z) is, from 0 at their feet to 1 at the crest, along the
  // wall's south-to-north profile...
  const across = (x, z) => {
    const south = RANGE.southFoot(x);
    const north = RANGE.northFoot(x);
    if (z > south || z < north) return 0;
    const crest = RANGE.crest(x);
    return z > crest ? smoothstep((south - z) / (south - crest), 0, 1) : smoothstep((z - north) / (crest - north), 0, 1);
  };
  // ...how high they stand there (lower at the saddle where the trail crosses)...
  const crestHeight = (x) => {
    const [low, high] = RANGE.height;
    const h = low + (high - low) * (0.5 + 0.5 * noise(x * 0.0045 + 800, 0.7)) + 18 * noise(x * 0.013 + 820, 1.9);
    return h * (1 - SADDLE_DIP * Math.exp(-(((x - SADDLE.x) / 150) ** 2)));
  };
  // ...and the height they add: ridges and gullies down their sides, rounded crests, and peaks.
  // Peaks stand up along the ridge (lower near the saddle: see RANGE.peaks).
  const peakAt = (x, z) => {
    let best = 0;
    for (const p of RANGE.peaks) {
      const d = Math.hypot(x - p.x, z - p.z) / (p.radius * (1 + 0.3 * noise(x * 0.008 + p.x, z * 0.008)));
      if (d < 1) best = Math.max(best, p.height * (1 - smoothstep(d, 0, 1)) ** 1.4);
    }
    return best;
  };
  const mountainHeight = (x, z) => {
    const up = across(x, z);
    if (up <= 0) return 0;
    const n = noise(x * 0.018 + 840, z * 0.018);
    const ridges = 1 - Math.sqrt(n * n + 0.25 ** 2);
    return crestHeight(x) * up ** 1.4 + ridges * 11 * up * up + peakAt(x, z) * up;
  };
  const TOP = RANGE.height[1] + 30; // about the highest the mountains reach
  // How far up a mountain (x, z) is: 0 off them, 1 at the very top (for snow, cold, rock and trees).
  const mountainAt = (x, z) => {
    const up = across(x, z);
    return up > 0 ? Math.min(1, (crestHeight(x) * up ** 1.4 + peakAt(x, z) * up) / TOP) : 0;
  };
  // The land under the mountains: the south's, blending into the north's across the crest.
  const underHeight = (x, z) => {
    const crest = RANGE.crest(x);
    const t = smoothstep((crest + 100 - z) / 200, 0, 1);
    if (t <= 0) return southLand(x, z);
    if (t >= 1) return northLand(x, z);
    return southLand(x, z) * (1 - t) + northLand(x, z) * t;
  };
  const rawHeight = (x, z) => underHeight(x, z) + mountainHeight(x, z) + relief(x, z);
  const fallsTop = rawHeight(FALLS.x, FALLS.z) + FALLS.drop;
  const wildHeight = (x, z) => {
    const h = rawHeight(x, z);
    const { shelf } = fallsAt(x, z);
    return shelf > 0 && fallsTop > h ? h + (fallsTop - h) * shelf : h;
  };

  // The trail over the mountains: graded evenly from where it leaves the foothills up to the
  // saddle, and down again to the lakeshore. Its bed is cut into the mountainside (and built up
  // where the ground falls away), blending back into it a few meters out.
  // The trail's bed, every few meters along it: the lie of the land under it, smoothed (so it
  // doesn't follow every hummock), and kept to a walkable grade (TRAIL.grade): cut in where the
  // land is steeper, built up a little where it dips. Mostly it just follows the ground.
  const profile = [];
  for (let along = 0; along <= TRAIL_LENGTH + PROFILE_STEP; along += PROFILE_STEP) {
    const p = trailAt(Math.min(along, TRAIL_LENGTH));
    profile.push(wildHeight(p.x, p.z));
  }
  let bed = profile.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -4; k <= 4; k++) {
      if (profile[i + k] === undefined) continue;
      sum += profile[i + k];
      count++;
    }
    return sum / count;
  });
  const rise = TRAIL.grade * PROFILE_STEP;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < bed.length; i++) bed[i] = clamp(bed[i], bed[i - 1] - rise, bed[i - 1] + rise);
    for (let i = bed.length - 2; i >= 0; i--) bed[i] = clamp(bed[i], bed[i + 1] - rise, bed[i + 1] + rise);
  }
  const trailHeight = (along) => {
    const f = clamp(along / PROFILE_STEP, 0, bed.length - 1.001);
    const i = Math.floor(f);
    return bed[i] + (bed[i + 1] - bed[i]) * (f - i);
  };
  const TRAIL_BLEND = 4; // meters either side it blends back into the mountainside
  const withTrail = (h, x, z) => {
    const near = nearestOnTrail(x, z);
    if (near.distance > TRAIL.halfWidth + TRAIL_BLEND) return h;
    const on = 1 - smoothstep(near.distance, TRAIL.halfWidth + 0.4, TRAIL.halfWidth + TRAIL_BLEND);
    return h + (trailHeight(near.along) - h) * on;
  };
  // The ravine: a steep-sided gully cut down the mountainside, deepest where the trail crosses it.
  const withRavine = (h, x, z) => {
    const r = ravineAt(x, z);
    const wall = RAVINE.halfWidth + 1.8;
    if (r.distance > wall) return h;
    const fromCrossing = Math.abs(r.t - RAVINE_CROSSING.t);
    const depth = RAVINE.depth * clamp(1 - fromCrossing * 1.4, 0.2, 1) * smoothstep(r.t, 0, 0.08) * (1 - smoothstep(r.t, 0.92, 1));
    return h - depth * (1 - smoothstep(r.distance, RAVINE.halfWidth, wall));
  };
  // Level pads for the buildings (see PADS).
  const padHeights = PADS.map((p) => withTrail(wildHeight(p.x, p.z), p.x, p.z));
  const withPads = (h, x, z) => {
    PADS.forEach((p, i) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.radius * 2) h += (padHeights[i] - h) * (1 - smoothstep(d, p.radius, p.radius * 2));
    });
    return h;
  };
  const baseHeight = (x, z) => withRavine(withPads(withTrail(wildHeight(x, z), x, z), x, z), x, z);
  // How high up (x, z) is, for snow and cold: up the mountains, how far up a peak you are, but
  // also simply how high: the pass and the observatory are high enough for snow and the cold.
  const highUp = (x, z) => {
    const up = mountainAt(x, z);
    return up > 0 ? Math.max(up, (baseHeight(x, z) - HIGH.from) / HIGH.range) : 0;
  };

  // Fresh water on the way: a pond near the crash (you can't drink the sea), and a few up in the
  // foothills.
  const lakes = PONDS.map(({ x, z, radius, depth }, index) => createLake(noise, index, radius, depth, baseHeight, () => [x, z]));
  // A river running down out of the mountains, through the foothills, west of the crash and out
  // into the sea.
  const river = createRiverAlong(noise, RIVER, (x, z) => withLakes(baseHeight(x, z), x, z, lakes));
  const nearRiver = (x, z, distance) =>
    river.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - x, p.z - z) < distance);
  const massifs = [{ x: 0, z: (RANGE.southFoot(0) + RANGE.northFoot(0)) / 2, radius: 1100, peaks: [] }];
  // The lake nearest to (x, z) in its own size (see Lake.distance), if any is close.
  const nearestLake = (x, z) => {
    let best = null;
    let bestDistance = Infinity;
    for (const lake of lakes) {
      if (Math.abs(x - lake.x) > lake.reach || Math.abs(z - lake.z) > lake.reach) continue;
      const d = lake.distance(x, z);
      if (d < bestDistance) [best, bestDistance] = [lake, d];
    }
    return best ? { lake: best, distance: bestDistance } : null;
  };
  // The sea and the big lake: wide water reaching right across the map. The level of the water
  // at (x, z) if it's on or just off either's shore, else -Infinity.
  const openWaterLevel = (x, z) => {
    if (z > coastZ(x) - 30) return SEA_LEVEL;
    if (z < LAKE.south(x) + 30 && z > LAKE.north(x) - 30) return LAKE.level;
    return -Infinity;
  };
  // How far out into the sea or the big lake (x, z) is, from the nearest shore (0 on land).
  const openWaterOut = (x, z) => {
    const sea = z - coastZ(x) - 7;
    if (sea > 0) return sea;
    const s = LAKE.south(x);
    const n = LAKE.north(x);
    if (z < s && z > n) return Math.min(s - z, z - n);
    return 0;
  };

  const crashTrail = createCrashTrail(noise);
  // How rocky the ground is (above 0.38 stone shows through; see groundAt).
  const rockAt = (x, z) => noise(x * 0.05 + 900, z * 0.05) + noise(x * 0.4 + 950, z * 0.4) * 0.25;
  // How much of the ground is stone there (0 soil, 1 bare rock): the plane's skid doesn't cut
  // into rock, and leaves pale scrapes on it rather than torn soil.
  const stoneAt = (x, z) => smoothstep(rockAt(x, z), 0.38, 0.5);

  // The roads, for heightAt and the ground's colours (filled in by setRoads: see roads.js).
  const ROAD_CELL = 16;
  const roadCells = new Map();

  // Where snow lies, and how deep: the odd lingering patch in the lowlands, and the snowfields
  // above the snowline up the mountains. `amount` (0–1) is how white the ground is; `depth`
  // (meters) is how much snow is piled on it: a quick bank at the edge, then a soft dome, so
  // the snow has some body to it rather than being paint on the ground.
  const snowResult = { amount: 0, depth: 0 };
  const snowAt = (x, z) => {
    snowResult.amount = 0;
    snowResult.depth = 0;
    const patch = noise(x * 0.06 + 400, z * 0.06) + noise(x * 0.4 + 500, z * 0.4) * 0.22;
    if (patch > SNOW_PATCH.from) {
      snowResult.amount = Math.min(1, (patch - SNOW_PATCH.from) / 0.03);
      snowResult.depth = SNOW_PATCH.depth * (0.6 * smoothstep(patch, SNOW_PATCH.from - 0.005, SNOW_PATCH.from + 0.025) + 0.4 * smoothstep(patch, SNOW_PATCH.from + 0.025, SNOW_PATCH.from + 0.12));
    }
    const up = highUp(x, z);
    if (up > 0) {
      const snowy = up + noise(x * 0.05 + 1300, z * 0.05) * 0.1 + noise(x * 0.3 + 1400, z * 0.3) * 0.04;
      if (snowy > MOUNTAINS.snowline) {
        const line = MOUNTAINS.snowline;
        snowResult.amount = Math.max(snowResult.amount, Math.min(1, (snowy - line) / 0.04));
        snowResult.depth = Math.max(snowResult.depth, SNOW_FIELD_DEPTH * (0.6 * smoothstep(snowy, line - 0.004, line + 0.03) + 0.4 * smoothstep(snowy, line + 0.03, line + 0.15)));
      }
    }
    // None under water, or right down to it: not in the river, a lake or a creek, nor on the
    // wet bank just above them.
    if (snowResult.amount > 0) {
      const land = landAt(x, z);
      const c = creeks.nearest(x, z);
      if (lakeOrRiverLevel(x, z) > land - 0.35 || (c && c.distance < c.halfWidth + 1)) {
        snowResult.amount = 0;
        snowResult.depth = 0;
      }
    }
    return snowResult;
  };

  // The land before the creeks are cut into it.
  const landAt = (x, z) => {
    const scarHeight = crashTrail.at(x, z).height;
    const h = withLakes(baseHeight(x, z), x, z, lakes) + (scarHeight ? scarHeight * (1 - stoneAt(x, z)) : 0);
    const r = river.nearest(x, z);
    return r && fallsAt(x, z).shelf < 0.2 ? Math.min(h, river.carve(r)) : h;
  };
  const lakeOrRiverLevel = (x, z) => {
    const near = nearestLake(x, z);
    let level = near && near.distance < 1.5 ? near.lake.level : -Infinity;
    level = Math.max(level, openWaterLevel(x, z));
    const r = river.nearest(x, z);
    if (r && r.distance < r.halfWidth + 0.5) level = Math.max(level, r.level);
    return level;
  };
  const creeks = createCreeks(
    random, noise, river, lakes, landAt, mountainAt,
    (x, z) => lakeOrRiverLevel(x, z) > landAt(x, z) - 0.3,
    (x, z) => Math.hypot(x - CRASH.x, z - CRASH.z) < CREEKS.clearOfCrash || crashTrail.near(x, z, 6) || !inBounds(x, z, 30) || nearestOnTrail(x, z).distance < 12,
  );

  const heightAt = (x, z) => {
    let h = landAt(x, z);
    // The roads: each runs on a level bed (see setRoads), cut into the hillside where the ground
    // rises across it and built up where it falls away, so a road along a slope is flat from
    // side to side, with a bank above it and below. Two wheel ruts are pressed into the bed with
    // the middle a little proud of them. (By the river the road just follows the ground, smoothed:
    // the bridge carries it over.)
    const road = roadCells.size ? roadAt(x, z) : null;
    if (road) {
      const across = Math.abs(road.offset);
      const on = 1 - smoothstep(across, road.half - 0.4, road.half + 0.6);
      const rut = road.foot ? 0 : 1 - smoothstep(Math.abs(across - RUTS.at), RUTS.width * 0.3, RUTS.width);
      const marks = -rut * RUTS.depth + (1 - smoothstep(across, 0, 0.55)) * RUTS.crown;
      const smoothed = h + on * (-relief(x, z) + marks);
      const cut = 1 - smoothstep(across, road.half + 0.2, road.half + road.shoulder);
      const bedded = h + (road.bed - h) * cut + on * marks;
      h = smoothed + (bedded - smoothed) * road.level;
    }
    const c = creeks.nearest(x, z);
    if (c) h = Math.min(h, creeks.carve(c));
    // Snow lies on top of the ground (on dry land: not in a creek, a lake or the river).
    const snow = snowAt(x, z);
    if (snow.depth <= 0 || (c && c.distance < c.halfWidth + 0.5) || lakeOrRiverLevel(x, z) > h - 0.05) return h;
    return h + snow.depth;
  };

  // The height of the water's surface at (x, z), or -Infinity if there's no water here.
  const waterLevelAt = (x, z) => {
    let level = lakeOrRiverLevel(x, z);
    const c = creeks.nearest(x, z);
    if (c && c.distance < c.halfWidth + 0.3) level = Math.max(level, c.level);
    return level;
  };
  // How deep the water is at (x, z): 0 on dry land.
  const waterDepth = (x, z) => {
    const level = waterLevelAt(x, z);
    return level === -Infinity ? 0 : Math.max(0, level - heightAt(x, z));
  };
  // True if the water at (x, z) is the sea's: salt, not fit to drink. (Not a pond, a lake, the
  // river or a creek, even where the river runs into the sea.)
  const isSea = (x, z) => z > coastZ(x) - 30 && waterDepth(x, z) > 0 && waterLevelAt(x, z) === SEA_LEVEL;
  // Which way the ground rises at (x, z) and how steeply: { x, z } meters up per meter
  // across. Reuses one object, so copy it if you keep it.
  const slope = { x: 0, z: 0 };
  const slopeAt = (x, z) => {
    slope.x = heightAt(x + 0.5, z) - heightAt(x - 0.5, z);
    slope.z = heightAt(x, z + 0.5) - heightAt(x, z - 0.5);
    return slope;
  };
  // False if heading (dx, dz) at (x, z) is up ground too steep to climb (see MAX_CLIMB).
  // Banks in and out of the water are always fine, so you can't get stuck in a lake.
  const canClimb = (x, z, dx, dz) => {
    // Too far out into the sea or the big lake: back you go. (Heading back in is always fine.)
    const out = openWaterOut(x, z);
    if (out > 0 && out > openWaterOut(x - dx, z - dz)) {
      const limit = z > coastZ(x) ? SEA_SWIM : LAKE.swim;
      if (out > limit) {
        terrain.turnedBack = z > coastZ(x) ? 'sea' : 'lake';
        return false;
      }
    }
    // Up the mountains, only the trail climbs: off it, the slopes are too steep to go up. (Down
    // in the ravine you can walk along its floor, to follow it down and out at the bottom.)
    if (mountainAt(x, z) > MOUNTAIN_WALL && nearestOnTrail(x, z).distance > TRAIL.halfWidth + TRAIL_SHOULDER && ravineAt(x, z).distance > RAVINE.halfWidth) {
      const { x: sx, z: sz } = slopeAt(x, z);
      if (sx * dx + sz * dz > 0.08 * Math.hypot(dx, dz) && waterDepth(x, z) === 0) {
        terrain.turnedBack = 'mountain';
        return false;
      }
    }
    const { x: sx, z: sz } = slopeAt(x, z);
    if (sx * dx + sz * dz <= 0 || Math.hypot(sx, sz) <= Math.tan(MAX_CLIMB)) return true;
    return waterDepth(x, z) > 0 || nearWater(x, z, 0.5);
  };
  // Rough "is this within `margin` meters of a lake or the river" check, for placing things.
  const nearWater = (x, z, margin) => {
    if (z > coastZ(x) + 7 - margin) return true; // (the sea's edge is about 7 m out from coastZ)
    if (z < LAKE.south(x) + margin && z > LAKE.north(x) - margin) return true;
    const near = nearestLake(x, z);
    if (near && (near.distance - 1.35) * near.lake.radius < margin) return true;
    const r = river.nearest(x, z);
    if (r && r.distance < r.halfWidth + 1.5 + margin) return true;
    const c = creeks.nearest(x, z);
    return Boolean(c && c.distance < c.halfWidth + 1 + margin);
  };
  // True if the only water near (x, z) is a creek (shallow enough to ford: roads cross them).
  const creekOnly = (x, z) => {
    const c = creeks.nearest(x, z);
    if (!c || c.distance > c.halfWidth + 4) return false;
    const near = nearestLake(x, z);
    const r = river.nearest(x, z);
    return !(near && near.distance < 1.6) && !(r && r.distance < r.halfWidth + 5);
  };

  // How "foresty" an area is (roughly -1..1). Large woods and open meadows, a few hundred
  // meters across, with trees growing in clumps inside the woods.
  const forest = (x, z) => {
    let f = noise(x * 0.006 + 700, z * 0.006) * 1.3 + noise(x * 0.04 + 50, z * 0.04) * 0.6 - mountainAt(x, z) * 4 - outcropAt(x, z) * 2.5;
    // The farm's fields, cleared long ago (a few trees still in hedgerows and windbreaks).
    if (z < LAKE.north(x)) f -= 1.1 * smoothstep(LAKE.north(x) - z, 30, 140) - 0.5 * Math.max(0, noise(x * 0.03 + 1500, z * 0.03));
    // Coastal forest grows thick inland, but the sea wind keeps the last stretch before the
    // shore open (rocks, grass and the odd stunted tree), so you can see the sea from the crash.
    else if (z > RANGE.southFoot(x)) f += 0.25 * (1 - smoothstep(coastZ(x) - z, 80, 400)) - 1.4 * (1 - smoothstep(coastZ(x) - z, 35, 85));
    return f;
  };
  // How cold the air is up the mountains: 0 in the lowlands, rising to 1 above the snowline.
  const coldAt = (x, z) => smoothstep(highUp(x, z), MOUNTAINS.coldFrom, MOUNTAINS.coldFull);

  // Roads, added with setRoads once the map knows where they go: segments sorted into cells.
  const roadAt = (x, z) => {
    if (!roadCells.size) return null;
    const list = roadCells.get(`${Math.floor(x / ROAD_CELL)},${Math.floor(z / ROAD_CELL)}`);
    if (!list) return null;
    let best = null;
    for (const seg of list) {
      const { ax, az, bx, bz } = seg;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
      const px = ax + dx * t;
      const pz = az + dz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (!best || distance < Math.abs(best.offset)) {
        // Which side of the middle (for the ruts).
        const side = Math.sign(dx * (z - az) - dz * (x - ax)) || 1;
        best = {
          offset: distance * side, half: seg.half, foot: seg.foot, shoulder: seg.shoulder,
          bed: seg.ya + (seg.yb - seg.ya) * t, level: seg.wa + (seg.wb - seg.wa) * t,
        };
      }
    }
    return best && Math.abs(best.offset) < best.half + best.shoulder ? best : null;
  };

  const color = new THREE.Color();
  const tint = new THREE.Color();
  // What the ground looks like at (x, z). The returned colour is reused: copy it if you keep it.
  // `withSnow` false leaves the snow out of the colour (the ground's mesh blends it in itself,
  // smoothly, from snowAt: see createGround).
  const groundAt = (x, z, withSnow = true) => {
    // The open tundra: broad fields of colour tens of meters across that shade gently into
    // one another (not spots), each softly mottled within.
    const wide = (sx, sz, off) => noise(x * sx + off, z * sz + off * 0.7) + noise(x * sx * 3.1 + off, z * sz * 3.1) * 0.25;
    color.copy(TUNDRA_GOLD);
    color.lerp(TUNDRA_ORANGE, smoothstep(wide(0.011, 0.011, 2100), 0.08, 0.42) * 0.75);
    color.lerp(TUNDRA_RED, smoothstep(wide(0.014, 0.014, 2300), 0.22, 0.58) * 0.55);
    color.lerp(TUNDRA_OLIVE, smoothstep(wide(0.017, 0.017, 2500), 0.12, 0.5) * 0.65);
    color.lerp(TUNDRA_WET, smoothstep(-hills(x, z) * 0.12 + noise(x * 0.03 + 2700, z * 0.03) * 0.4, 0.15, 0.45) * 0.6); // (down in the hollows)
    color.multiplyScalar(0.92 + 0.16 * (noise(x * 0.09 + 2900, z * 0.09) + 0.5)); // (gentle mottling within a field)
    // Under the trees: the darker, mossy forest floor.
    color.lerp(FOREST_FLOOR, smoothstep(forest(x, z), 0.05, 0.5) * 0.75);

    let kind = 'grass';
    // Grey stone showing through.
    const rock = rockAt(x, z);
    if (rock > 0.38) {
      // (Stony ground: grey stones and gravel with the tundra's plants still between them,
      // bare stone only at the heart of it.)
      tint.copy(STONE).lerp(OCHRE, clamp(noise(x * 0.8, z * 0.8) * 0.3 + 0.1, 0, 0.25));
      color.lerp(tint, Math.min(1, (rock - 0.38) / 0.05) * (0.5 + 0.5 * smoothstep(rock, 0.5, 0.68)));
      kind = rock > 0.58 ? 'rock' : 'stony';
    }
    // The cliffs and the hilltops' bare rock.
    const outcrop = outcropAt(x, z);
    if (outcrop > 0.05) {
      tint.copy(STONE).lerp(OCHRE, clamp(noise(x * 0.7 + 30, z * 0.7) * 0.3 + 0.1, 0, 0.25)).multiplyScalar(0.92);
      color.lerp(tint, Math.min(1, outcrop * 1.3));
      if (outcrop > 0.5) kind = 'rock';
      else if (outcrop > 0.25 && kind === 'grass') kind = 'stony';
    }
    // A little lingering snow, in the odd patch (see snowAt).
    const lowSnow = noise(x * 0.06 + 400, z * 0.06) + noise(x * 0.4 + 500, z * 0.4) * 0.22;
    if (lowSnow > SNOW_PATCH.from) {
      if (withSnow) color.lerp(SNOW, Math.min(1, (lowSnow - SNOW_PATCH.from) / 0.03));
      kind = 'snow';
    }
    // Up the mountains: grass gives way to scree and bare rock, then snow.
    const up = mountainAt(x, z);
    if (up > 0) {
      const scree = smoothstep(up + noise(x * 0.1 + 1200, z * 0.1) * 0.12, MOUNTAINS.screeFrom, MOUNTAINS.screeFull);
      if (scree > 0) {
        tint.copy(STONE).lerp(OCHRE, clamp(noise(x * 0.8, z * 0.8) * 0.3 + 0.1, 0, 0.2));
        color.lerp(tint, scree);
        if (scree > 0.5) kind = 'rock';
      }
      const snowy = highUp(x, z) + noise(x * 0.05 + 1300, z * 0.05) * 0.1 + noise(x * 0.3 + 1400, z * 0.3) * 0.04;
      if (snowy > MOUNTAINS.snowline) {
        if (withSnow) color.lerp(SNOW, Math.min(1, (snowy - MOUNTAINS.snowline) / 0.04));
        kind = 'snow';
      }
    }
    // Bare soil torn up by the crash, with dark streaks running along the skid.
    const scar = crashTrail.at(x, z);
    if (scar.dirt > 0) {
      const stone = stoneAt(x, z);
      tint.copy(TORN_SOIL).lerp(DARK_SOIL, smoothstep(scar.streak, -0.2, 0.35));
      color.lerp(tint, scar.dirt * (1 - stone));
      // (On rock: pale scrapes along the skid, the stone's weathered surface ground off.)
      color.lerp(tint.copy(STONE).multiplyScalar(1.12), scar.dirt * stone * 0.45 * smoothstep(scar.streak, -0.3, 0.3));
      if (scar.dirt * (1 - stone) > 0.4 && kind !== 'snow') kind = 'dirt';
    }
    // The old fire road (see roads.js): packed dirt with two wheel ruts and grass coming back
    // up the middle, its edges blending into the land.
    const road = roadAt(x, z);
    if (road) {
      const across = Math.abs(road.offset);
      const edge = 1 - smoothstep(across, road.half - 0.6, road.half + 0.5);
      if (edge > 0) {
        // (Blended in and out, not hard bands: they're about as wide as the ground's squares,
        // and hard edges come out as a zigzag checkerboard of triangles.)
        tint.copy(ROAD);
        tint.lerp(RUT, (road.foot ? 0.25 : 0.7) * (1 - smoothstep(Math.abs(across - 0.8), 0.1, 0.5)));
        tint.lerp(ROAD_GRASS, (road.foot ? 0 : 0.5) * (1 - smoothstep(across, 0.15, 0.55)));
        tint.lerp(OCHRE, clamp(noise(x * 0.5, z * 0.5) * 0.4, 0, 0.3));
        color.lerp(tint, edge);
        if (edge > 0.5 && kind !== 'snow') kind = 'road'; // (snow lying on the road is still snow underfoot)
      }
    }
    // The trail over the mountains: a worn path of packed earth and gravel, stones poking
    // through, its edges blending into the mountainside. (Snow lies over it up high.)
    const onTrail = nearestOnTrail(x, z);
    if (onTrail.distance < TRAIL.halfWidth + 0.6) {
      const edge = (1 - smoothstep(onTrail.distance, TRAIL.halfWidth - 0.6, TRAIL.halfWidth + 0.4)) * 0.85;
      tint.copy(ROAD).lerp(GRAVEL, clamp(noise(x * 0.9 + 1700, z * 0.9) * 0.6 + 0.3, 0, 0.7));
      tint.lerp(RUT, 0.35 * (1 - smoothstep(onTrail.distance, 0, 0.8)));
      color.lerp(tint, edge * (kind === 'snow' ? 0.25 : 1));
      if (edge > 0.5 && kind !== 'snow') kind = 'road';
    }
    // Creeks: pale pebbles under clear water, and wet stony banks.
    const creek = creeks.nearest(x, z);
    if (creek) {
      const wet = 1 - smoothstep(creek.distance, creek.halfWidth, creek.halfWidth + 0.9);
      if (wet > 0) {
        tint.copy(CREEK_BED).lerp(STONE, clamp(noise(x * 2.1, z * 2.1) * 0.6 + 0.3, 0, 1)).lerp(MOSS, clamp(noise(x * 0.9 + 70, z * 0.9) * 0.5, 0, 0.35));
        if (creek.distance > creek.halfWidth) tint.lerp(GRAVEL, 0.4);
        color.lerp(tint, wet);
        if (wet > 0.4) kind = creek.distance < creek.halfWidth ? 'water' : 'shore';
      }
    }
    // The sea's shore: pale sand and gravel, wet and darker at the water's edge; the big lake's,
    // mud and stones.
    const open = openWaterLevel(x, z);
    if (open > -Infinity) {
      const h = heightAt(x, z);
      const sea = open === SEA_LEVEL && z > coastZ(x) - 40;
      const beach = 1 - smoothstep(h, open + (sea ? 0.6 : 0.2), open + (sea ? 2.4 : 0.9));
      if (beach > 0) {
        const under = h < open && waterDepth(x, z) > 0;
        tint.copy(under ? WATER_BED : sea ? SAND : MUD);
        if (sea && !under) {
          // Cobbles and shingle in drifts along the beach, darker and wet down at the water.
          tint.lerp(GRAVEL, clamp(noise(x * 0.35 + 77, z * 0.9) * 0.9 + 0.35, 0, 0.8));
          tint.lerp(STONE, clamp(noise(x * 1.7 + 91, z * 1.7) * 0.6, 0, 0.35));
          tint.lerp(WATER_BED, 0.45 * (1 - smoothstep(h, open, open + 0.7)));
        }
        color.lerp(tint, beach);
        if (beach > 0.4) kind = under ? 'water' : sea ? 'gravel' : 'shore';
      }
    }
    // Muddy lake shores, gravelly river banks, and the beds under the water.
    const near = nearestLake(x, z);
    const byLake = near && near.distance < 1.6;
    if (byLake || river.nearest(x, z)) {
      const h = heightAt(x, z);
      const level = Math.max(byLake ? near.lake.level : -Infinity, river.nearest(x, z)?.level ?? -Infinity);
      const wet = 1 - smoothstep(h, level, level + 0.45);
      if (wet > 0) {
        // (The bed only where there's water over it: a dip below the river's level but off its
        // channel is damp ground, not a dark bed with nothing on it.)
        const under = h < level && waterDepth(x, z) > 0;
        color.lerp(under ? WATER_BED : byLake ? MUD : GRAVEL, wet);
        if (wet > 0.4) kind = under ? 'water' : 'shore';
      }
    }
    return { color, kind };
  };

  const terrain = {
    heightAt,
    snowAt,
    slopeAt,
    canClimb,
    waterLevelAt,
    waterDepth,
    isSea,
    // The z of the sea's edge, south of you along x (about 7 m out from coastZ).
    seaEdgeAt: (x) => coastZ(x) + 7,
    nearWater,
    forest,
    mountainAt,
    coldAt,
    lakes,
    massifs,
    crashTrail,
    groundAt,
    riverPoints: river.points, // the river's path, from the mountains down to the sea
    openWaterOut,
    // Why the last step was refused, if it was: 'sea', 'lake' or 'mountain' (see canClimb).
    turnedBack: null,
    creeks: creeks.list, // each { points: [{ x, z, level, halfWidth }] }, from its spring down
    creekOnly,
    roadAt,
    // Lays roads (each a list of { x, z } points) into the ground: `width` meters wide, or the
    // path's own `width` if it has one (a footpath, `foot`, has no wheel ruts). Call before the
    // ground is drawn.
    setRoads(paths, width) {
      for (const path of paths) {
        const half = (path.width ?? width) / 2;
        const foot = Boolean(path.foot);
        const shoulder = foot ? ROAD_BED.footShoulder : ROAD_BED.shoulder;
        // The bed along its middle: the lie of the land, smoothed over a stretch either side and
        // kept to a steady grade. Near water it gives way to the ground (`level` 0).
        const along = [0];
        for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
        const ground = path.map((p) => landAt(p.x, p.z));
        const bed = path.map((_, i) => {
          let [sum, count] = [0, 0];
          for (let k = i; k >= 0 && along[i] - along[k] <= ROAD_BED.smooth; k--) [sum, count] = [sum + ground[k], count + 1];
          for (let k = i + 1; k < path.length && along[k] - along[i] <= ROAD_BED.smooth; k++) [sum, count] = [sum + ground[k], count + 1];
          return sum / count;
        });
        // Where it joins a road already laid (a track turning off, a footpath meeting the road),
        // it meets that road's bed, easing into its own over the first stretch.
        for (const end of [0, path.length - 1]) {
          const joined = roadAt(path[end].x, path[end].z);
          if (!joined || Math.abs(joined.offset) > joined.half) continue;
          for (let i = 0; i < path.length; i++) {
            const from = Math.abs(along[i] - along[end]);
            if (from > ROAD_BED.join) continue;
            bed[i] = joined.bed + (bed[i] - joined.bed) * smoothstep(from, 0, ROAD_BED.join);
          }
        }
        const grade = foot ? ROAD_BED.footGrade : ROAD_BED.grade;
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 1; i < bed.length; i++) bed[i] = clamp(bed[i], bed[i - 1] - grade * (along[i] - along[i - 1]), bed[i - 1] + grade * (along[i] - along[i - 1]));
          for (let i = bed.length - 2; i >= 0; i--) bed[i] = clamp(bed[i], bed[i + 1] - grade * (along[i + 1] - along[i]), bed[i + 1] + grade * (along[i + 1] - along[i]));
        }
        for (let i = 0; i < bed.length; i++) bed[i] = clamp(bed[i], ground[i] - ROAD_BED.cut, ground[i] + ROAD_BED.fill);
        const level = path.map((p) => (nearWater(p.x, p.z, ROAD_BED.water) && !creekOnly(p.x, p.z) ? 0 : nearWater(p.x, p.z, ROAD_BED.water * 2) && !creekOnly(p.x, p.z) ? 0.5 : 1));
        for (let i = 1; i < path.length; i++) {
          const [a, b] = [path[i - 1], path[i]];
          const pad = half + shoulder;
          for (let cx = Math.floor((Math.min(a.x, b.x) - pad) / ROAD_CELL); cx <= Math.floor((Math.max(a.x, b.x) + pad) / ROAD_CELL); cx++) {
            for (let cz = Math.floor((Math.min(a.z, b.z) - pad) / ROAD_CELL); cz <= Math.floor((Math.max(a.z, b.z) + pad) / ROAD_CELL); cz++) {
              const key = `${cx},${cz}`;
              if (!roadCells.has(key)) roadCells.set(key, []);
              roadCells.get(key).push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, half, foot, shoulder, ya: bed[i - 1], yb: bed[i], wa: level[i - 1], wb: level[i] });
            }
          }
        }
      }
    },
    // True if the ground is dry everywhere within `radius` of (x, z), and at least `margin`
    // meters from the water's edge. Used to check a new map's crash site and start.
    isDry(x, z, radius, margin) {
      for (let dx = -radius; dx <= radius; dx += 1.5) {
        for (let dz = -radius; dz <= radius; dz += 1.5) {
          if (dx * dx + dz * dz > radius * radius) continue;
          if (waterDepth(x + dx, z + dz) > 0 || nearWater(x + dx, z + dz, margin)) return false;
        }
      }
      return true;
    },
    // Makes the ground and water meshes (slow, so only for the map you keep).
    build() {
      const ground = createGround(bounds, heightAt, groundAt, snowAt);
      terrain.ground = ground.group;
      terrain.drawAround = ground.drawAround;
      terrain.water = createWater(lakes, river, creeks.list, [
        // The sea, and the big lake (flat sheets the land hides the edges of).
        { level: SEA_LEVEL, minX: bounds.minX - 600, maxX: bounds.maxX + 600, minZ: Math.min(...[-1, 0, 1].map((k) => coastZ(k * 900))) - 60, maxZ: bounds.maxZ + 700, sea: true },
        { level: LAKE.level, minX: bounds.minX - 600, maxX: bounds.maxX + 600, minZ: -2560, maxZ: -1960 },
      ]);
      return terrain;
    },
  };
  return terrain;
}

// A lake: a round-ish bowl with a noisy outline, filled to just below the lowest point of its
// rim (so it never spills over). `place(radiusAt)` returns where its centre goes, [x, z];
// `heightAt` is the land it's dug into.
// `bays` adds smaller bays and points round the shore (for the big lake).
function createLake(noise, index, radius, depth, heightAt, place, bays = 0) {
  const offset = 20 + index * 7.3; // each lake gets its own outline
  const radiusAt = (angle) =>
    radius * (1 + 0.28 * noise(Math.cos(angle) * 1.5 + offset, Math.sin(angle) * 1.5 + offset) +
      bays * noise(Math.cos(angle) * 4 + offset + 50, Math.sin(angle) * 4 + offset));
  const [x, z] = place(radiusAt);
  let rimLow = Infinity;
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const r = radiusAt(angle) * 1.35;
    rimLow = Math.min(rimLow, heightAt(x + Math.cos(angle) * r, z + Math.sin(angle) * r));
  }
  const level = rimLow - 0.25;
  return {
    x,
    z,
    radius,
    radiusAt,
    level,
    bed: level - depth, // deep enough to swim in the middle
    reach: radius * (1.28 + bays) * 1.6, // beyond this (in x or z) it can't affect anything
    // Below 1 inside the lake's outline, 1 on it, above 1 outside.
    distance(px, pz) {
      const dx = px - x;
      const dz = pz - z;
      return Math.hypot(dx, dz) / radiusAt(Math.atan2(dz, dx));
    },
  };
}

// The land at (x, z) given its height `h` without lakes: dug down into a bowl near any lake.
function withLakes(h, x, z, lakes) {
  for (const lake of lakes) {
    if (Math.abs(x - lake.x) > lake.reach || Math.abs(z - lake.z) > lake.reach) continue;
    const d = lake.distance(x, z);
    if (d < 1.35) h = lake.bed + (h - lake.bed) * smoothstep(d, 0.7, 1.35);
  }
  return h;
}

// A river following `course` (points from its spring down to its mouth), meandering a little
// between them. It flows downhill: its surface never rises, and it carves a channel through
// anything in the way.
function createRiverAlong(noise, course, heightAt) {
  const points = [];
  let level = Infinity;
  const STEP = 2.5;
  for (let i = 1; i < course.length; i++) {
    const a = course[i - 1];
    const b = course[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.z - a.z, b.x - a.x);
    for (let d = 0; d < length; d += STEP) {
      const t = d / length;
      const wander = noise(points.length * 0.02 + 70, 3.3) * 14 * Math.sin(Math.PI * t);
      const x = a.x + (b.x - a.x) * t - Math.sin(heading) * wander;
      const z = a.z + (b.z - a.z) * t + Math.cos(heading) * wander;
      const halfWidth = 1.5 + Math.min(1.4, points.length * 0.004); // widens as it goes
      const across = [-1, 0, 1].map((s) => heightAt(x - Math.sin(heading) * s * (halfWidth + 1), z + Math.cos(heading) * s * (halfWidth + 1)));
      level = Math.min(level, Math.min(...across) - 0.35);
      points.push({ x, z, level: Math.max(level, SEA_LEVEL - 0.2), halfWidth });
    }
  }
  const index = channelIndex([{ points }], RIVER_BANK_REACH);
  const carve = ({ distance, level, halfWidth }) =>
    distance < halfWidth
      ? level - 0.2 - 1.3 * (1 - (distance / halfWidth) ** 2)
      : level - 0.2 + (distance - halfWidth) * 0.6;
  return { points, nearest: index.nearest, carve };
}

// The creeks. Each starts where it meets the water (on the river's banks or a lake shore)
// and is traced uphill, step by step, until the ground stops rising; then it's turned round so
// it runs downhill from its spring. `heightAt` is the land so far, `wet(x, z)` says whether
// there's already water there, `avoid(x, z)` whether a creek mustn't go there.
function createCreeks(random, noise, river, lakes, heightAt, mountainAt, wet, avoid) {
  const creeks = [];
  const nearCreek = (x, z, distance) =>
    creeks.some((c) => c.points.some((p, i) => i % 2 === 0 && Math.hypot(p.x - x, p.z - z) < distance));
  // Where creeks could meet the water: along the river (either bank, away from its lake) and
  // round the lakes (the big ones more often).
  const mouths = () => {
    if (random.next() < 0.45 && river.points.length > 40) {
      const i = Math.floor(random.range(20, river.points.length - 10));
      const [p, q] = [river.points[i], river.points[i + 1]];
      const side = random.next() < 0.5 ? 1 : -1;
      const along = Math.atan2(q.z - p.z, q.x - p.x);
      const out = along + (side * Math.PI) / 2;
      const reach = p.halfWidth + 0.3;
      return { x: p.x + Math.cos(out) * reach, z: p.z + Math.sin(out) * reach, heading: out + side * random.range(-0.5, 0.2) };
    }
    const lake = random.pick(lakes.filter((l) => l.radius > 10 || random.next() < 0.5));
    const angle = random.range(0, Math.PI * 2);
    const r = lake.radiusAt(angle) * 1.02;
    return { x: lake.x + Math.cos(angle) * r, z: lake.z + Math.sin(angle) * r, heading: angle };
  };

  for (let tries = 0; creeks.length < CREEKS.count && tries < CREEKS.count * 12; tries++) {
    const mouth = mouths();
    if (avoid(mouth.x, mouth.z) || nearCreek(mouth.x, mouth.z, 60)) continue;
    let { x, z, heading } = mouth;
    const offset = random.range(0, 1000);
    const points = [{ x, z }];
    let top = { i: 0, h: heightAt(x, z) };
    for (let i = 1; i < CREEKS.maxSteps; i++) {
      // Head up the slope, wandering a little, but not turning sharply.
      let best = null;
      for (const turn of [0, 0.3, -0.3, 0.6, -0.6]) {
        const angle = heading + turn + noise(i * 0.2 + offset, 7.7) * 0.25;
        const nx = x + Math.cos(angle) * CREEKS.step;
        const nz = z + Math.sin(angle) * CREEKS.step;
        const score = heightAt(nx, nz) - Math.abs(turn) * 0.25;
        if (!best || score > best.score) best = { angle, nx, nz, score };
      }
      ({ nx: x, nz: z } = best);
      heading = best.angle;
      if (avoid(x, z) || mountainAt(x, z) > 0.45 || (i > 4 && (wet(x, z) || nearCreek(x, z, 8)))) break;
      points.push({ x, z });
      const h = heightAt(x, z);
      if (h > top.h + 0.05) top = { i, h };
      else if (h < top.h - 0.6 || i - top.i > 14) break; // over the top, or flat for a while
    }
    points.length = top.i + 1; // (from the water up to the highest point reached)
    if (points.length * CREEKS.step < CREEKS.minLength) continue;
    points.reverse(); // now from the spring down to the water
    // The water's surface follows the ground down (a little below it), never rising.
    let level = Infinity;
    points.forEach((p, i) => {
      const t = i / (points.length - 1);
      p.halfWidth = THREE.MathUtils.lerp(CREEKS.halfWidth[0], CREEKS.halfWidth[1], t);
      level = Math.min(level, heightAt(p.x, p.z) - 0.12);
      p.level = level;
    });
    creeks.push({ points });
  }

  const index = channelIndex(creeks, 5);
  const carve = ({ distance, level, halfWidth }) =>
    distance < halfWidth
      ? level - 0.04 - CREEKS.depth * (1 - (distance / halfWidth) ** 2)
      : level - 0.04 + (distance - halfWidth) * 0.75;
  return { list: creeks, nearest: index.nearest, carve };
}

// A quick look-up for the nearest point on any of a list of watercourses (each with `points`
// of { x, z, level, halfWidth }), within `reach` meters of its middle.
function channelIndex(courses, reach) {
  const CELL = 8;
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  for (const course of courses) {
    const { points } = course;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      for (let cx = Math.floor((Math.min(a.x, b.x) - reach) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + reach) / CELL); cx++) {
        for (let cz = Math.floor((Math.min(a.z, b.z) - reach) / CELL); cz <= Math.floor((Math.max(a.z, b.z) + reach) / CELL); cz++) {
          const k = key(cx, cz);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(points, i);
        }
      }
    }
  }
  // The closest point on any of them to (x, z), if it's within reach:
  // { distance, level, halfWidth }. Reuses one object, so copy it if you keep it.
  const result = { distance: 0, level: 0, halfWidth: 0 };
  const nearest = (px, pz) => {
    const segments = grid.get(key(Math.floor(px / CELL), Math.floor(pz / CELL)));
    if (!segments) return null;
    let best = Infinity;
    for (let s = 0; s < segments.length; s += 2) {
      const points = segments[s];
      const i = segments[s + 1];
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
      if (d < best) {
        best = d;
        result.distance = d;
        result.level = a.level + (b.level - a.level) * t;
        result.halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
      }
    }
    return best < reach ? result : null;
  };
  return { nearest };
}

// The ground's painted-looking detail at three sizes, by world position:
// broad patches meters across, drier and warmer or darker and mossier; clumps; and a fine
// grain. (Lighter on snow, which stays clean.)
function paintedGround(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec2 vGroundXZ;
      varying float vVeg;
      varying float vStone;
      float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float groundNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), f.x), mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1, 1)), f.x), f.y);
      }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 q = vGroundXZ;
        float broad = groundNoise(q * 0.17) * 0.6 + groundNoise(q * 0.47 + 7.0) * 0.4;
        float clumps = groundNoise(q * 2.1 + broad * 3.0);
        float grain = groundNoise(q * 11.0) * 0.6 + groundNoise(q * 29.0) * 0.4;
        float specks = smoothstep(0.72, 0.9, groundNoise(q * 61.0)); // (bits of old needle and twig, at your feet)
        vec3 detail = mix(vec3(0.9, 0.88, 0.85), vec3(1.08, 1.02, 0.93), broad) * (0.88 + 0.2 * clumps) * (0.86 + 0.24 * grain) * (1.0 - 0.18 * specks) * 1.3; // (and a little lighter: from the ground, the forest floor read near black)
        // Close up, the low shrubs' leaves: flecks of red and of gold through the colour.
        float fleckRed = smoothstep(0.7, 0.85, groundNoise(q * 23.0 + 11.0));
        float fleckGold = smoothstep(0.72, 0.86, groundNoise(q * 31.0 + 37.0));
        detail *= mix(vec3(1.0), vec3(1.08, 0.92, 0.86), fleckRed * 0.35) * mix(vec3(1.0), vec3(1.08, 1.05, 0.9), fleckGold * 0.35);
        // Where plants carpet the ground: no bare earth, but low cushions of dwarf shrub, dark in
        // the gaps between them, leafy over their tops, a little lighter where the light catches.
        float cushion = groundNoise(q * 3.3 + 5.0) * 0.65 + groundNoise(q * 7.3 + 9.0) * 0.35;
        float gap = 1.0 - smoothstep(0.22, 0.52, cushion);
        float leaves = groundNoise(q * 19.0 + 3.0) * 0.6 + groundNoise(q * 43.0) * 0.4;
        // ...and a mottle a meter or two across, of the different plants: darker olive crowberry
        // and Labrador tea, redder bilberry and bearberry, through each field of colour.
        float plants = groundNoise(q * 0.8 + 21.0) * 0.7 + groundNoise(q * 1.9 + 33.0) * 0.3;
        vec3 mottle = mix(vec3(0.8, 0.84, 0.7), vec3(1.1, 0.86, 0.76), smoothstep(0.3, 0.7, plants));
        mottle = mix(mottle, vec3(1.0), smoothstep(0.42, 0.5, plants) * (1.0 - smoothstep(0.5, 0.58, plants)));
        detail *= mix(vec3(1.0), (1.0 - 0.42 * gap) * (0.86 + 0.26 * leaves) * mottle * mix(vec3(1.0), vec3(1.05, 1.03, 0.96), smoothstep(0.55, 0.8, cushion)), vVeg);
        // Bare rock: slabs of lighter and darker stone, dark cracks between them, and crusts of
        // lichen, pale green-grey and orange.
        float slab = groundNoise(q * 0.55 + 51.0) * 0.6 + groundNoise(q * 1.7 + 53.0) * 0.4;
        // (Cracks fine and broken, coming and going along their length, not drawn round every slab.)
        float crack = (1.0 - smoothstep(0.0, 0.018, abs(groundNoise(q * 1.3 + 71.0) - 0.5)))
          * smoothstep(0.45, 0.7, groundNoise(q * 0.8 + 83.0));
        float crust = smoothstep(0.6, 0.72, groundNoise(q * 4.3 + 91.0));
        vec3 lichen = mix(vec3(1.12, 1.12, 0.92), vec3(1.25, 0.98, 0.72), smoothstep(0.4, 0.6, groundNoise(q * 0.9 + 97.0)));
        vec3 rockDetail = vec3(0.8 + 0.32 * slab) * (1.0 - 0.3 * crack) * mix(vec3(1.0), lichen, crust * 0.7);
        detail *= mix(vec3(1.0), rockDetail, vStone);
        diffuseColor.rgb *= mix(detail, vec3(0.97 + 0.05 * grain), smoothstep(0.4, 0.6, vSnow));
      }`);
}

// The ground: faceted hilly meshes where every triangle is one flat colour, one per chunk,
// built as the player comes near (see drawAround) and dropped again once they're far away.
function createGround(bounds, heightAt, groundAt, snowAt) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  // Snow is blended in per pixel from each corner's `snow` amount, not painted per triangle:
  // the edge of a patch then runs as a smooth curve through the triangles, instead of a
  // sawtooth along their edges.
  const snowColor = { value: SNOW.clone() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowColor = snowColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float snow;\nvarying float vSnow;\nattribute float veg;\nvarying float vVeg;\nattribute float stone;\nvarying float vStone;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnow = snow;\nvVeg = veg;\nvStone = stone;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSnowColor;\nvarying float vSnow;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // Old snow, not a sheet of white: its edge broken up (thinning in tongues and
          // holes, the ground showing through), blue-grey in its hollows, crusted and a
          // little grubby where it thins out.
          vec2 q = vGroundXZ;
          float edge = vSnow + (groundNoise(q * 1.3) - 0.5) * 0.35 + (groundNoise(q * 6.0) - 0.5) * 0.16;
          float cover = smoothstep(0.42, 0.6, edge);
          float drift = groundNoise(q * 0.9 + 3.0);
          vec3 snow = uSnowColor * mix(vec3(0.8, 0.86, 0.95), vec3(1.0), drift * 0.7 + 0.3) * (0.94 + 0.08 * groundNoise(q * 23.0));
          snow = mix(snow * vec3(0.84, 0.82, 0.78), snow, smoothstep(0.45, 0.85, edge));
          diffuseColor.rgb = mix(diffuseColor.rgb, snow, cover);
        }`);
    paintedGround(shader);
  };
  const built = new Map(); // chunk key → mesh (its `userData.cell` is the size of its squares)
  // Chunks more than 2 out from the player's (only drawn in the views that look out across the
  // land) are built in squares twice the size: a quarter of the triangles, and far enough off
  // that it doesn't show.
  const cellFor = (chunk) => (chunk.order > 2 && DRAW_CHUNKS > 2 ? GROUND_CELL * 2 : GROUND_CELL);

  // Builds one chunk a little at a time: it pauses (yields) every so often, so the work can
  // be spread over several frames.
  function* buildChunk({ cx, cz, key }, cell) {
    const cells = Math.round(CHUNK_SIZE / cell);
    const grid = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, cells, cells)
      .rotateX(-Math.PI / 2)
      .translate((cx + 0.5) * CHUNK_SIZE, 0, (cz + 0.5) * CHUNK_SIZE);
    const corners = grid.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      corners.setY(i, heightAt(corners.getX(i), corners.getZ(i)));
      if (i % 100 === 99) yield;
    }
    yield;
    // The ground's colour at every corner of the grid: each triangle is the average of its
    // three. (Coloured from one point in the middle instead, wherever the ground changes colour
    // sharply the two triangles of a square land either side of the change, and the road and
    // yards come out as a checkerboard of brown and green.)
    const cornerColors = new Float32Array(corners.count * 3);
    const cornerSnow = new Float32Array(corners.count);
    const cornerVeg = new Float32Array(corners.count); // (1 where plants carpet the ground)
    const cornerStone = new Float32Array(corners.count); // (1 on bare rock, 0.5 on stony ground)
    for (let i = 0; i < corners.count; i++) {
      cornerSnow[i] = snowAt(corners.getX(i), corners.getZ(i)).amount;
      const { color, kind } = groundAt(corners.getX(i), corners.getZ(i), false);
      cornerVeg[i] = kind === 'grass' ? 1 : kind === 'stony' ? 0.5 : 0;
      cornerStone[i] = kind === 'rock' ? 1 : kind === 'stony' ? 0.5 : 0;
      cornerColors[i * 3] = color.r;
      cornerColors[i * 3 + 1] = color.g;
      cornerColors[i * 3 + 2] = color.b;
      if (i % 100 === 99) yield;
    }
    const cornerOf = grid.index.array; // (each corner of each triangle, in the order toNonIndexed lays them out)
    // The land is lit by its smooth slope, and each corner keeps its own colour, blended
    // across the triangles (the shader adds the painted detail: paintedGround), so there are
    // no flat-coloured, faceted triangles to see.
    grid.computeVertexNormals();
    yield;
    const geometry = grid.toNonIndexed(); // (keeps the smooth normals, one per corner)
    yield;
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const shade = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const corner = cornerOf[i] * 3;
      shade.setRGB(cornerColors[corner], cornerColors[corner + 1], cornerColors[corner + 2], THREE.SRGBColorSpace);
      shade.toArray(colors, i * 3);
      if (i % 900 === 899) yield;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const snow = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) snow[i] = cornerSnow[cornerOf[i]];
    geometry.setAttribute('snow', new THREE.BufferAttribute(snow, 1));
    const veg = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) veg[i] = cornerVeg[cornerOf[i]];
    geometry.setAttribute('veg', new THREE.BufferAttribute(veg, 1));
    const stone = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) stone[i] = cornerStone[cornerOf[i]];
    geometry.setAttribute('stone', new THREE.BufferAttribute(stone, 1));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData.cell = cell;
    const old = built.get(key); // (the same chunk at another size, until now)
    if (old) {
      group.remove(old);
      old.geometry.dispose();
    }
    built.set(key, mesh);
    group.add(mesh);
  }

  const jobs = new Map(); // chunk key → its build, part done
  const onMap = ({ cx, cz }) =>
    (cx + 0.5) * CHUNK_SIZE > bounds.minX - GROUND_MARGIN && (cx + 0.5) * CHUNK_SIZE < bounds.maxX + GROUND_MARGIN &&
    (cz + 0.5) * CHUNK_SIZE > bounds.minZ - GROUND_MARGIN && (cz + 0.5) * CHUNK_SIZE < bounds.maxZ + GROUND_MARGIN;

  return {
    group,
    // Builds the chunks around (x, z), nearest first, plus one more ring ahead of the ones
    // drawn, so they're ready before you get there. It works for at most `budgetMs` per call,
    // so walking into new ground doesn't stall a frame; pass Infinity to build the drawn
    // chunks right away.
    drawAround(x, z, budgetMs = GROUND_BUDGET_MS) {
      const now = budgetMs === Infinity;
      const deadline = performance.now() + budgetMs;
      for (const chunk of chunksAround(x, z, now ? DRAW_CHUNKS : DRAW_CHUNKS + 1)) {
        const cell = cellFor(chunk);
        if (built.get(chunk.key)?.userData.cell === cell || !onMap(chunk)) continue;
        if (jobs.get(chunk.key)?.cell !== cell) jobs.set(chunk.key, { cell, steps: buildChunk(chunk, cell) });
        const job = jobs.get(chunk.key).steps;
        while (performance.now() < deadline) {
          if (job.next().done) {
            jobs.delete(chunk.key);
            break;
          }
        }
        if (performance.now() >= deadline) break;
      }
      // Let go of chunks well out of sight (a little slack, so walking back and forth
      // across a chunk edge doesn't rebuild the same ground over and over).
      const keep = new Set(chunksAround(x, z, DRAW_CHUNKS + 2).map((c) => c.key));
      for (const [key, mesh] of built) {
        if (keep.has(key)) continue;
        group.remove(mesh);
        mesh.geometry.dispose();
        built.delete(key);
      }
      for (const key of jobs.keys()) if (!keep.has(key)) jobs.delete(key);
    },
  };
}
