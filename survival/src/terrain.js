import * as THREE from 'three';
import { CRASH, createCrashTrail } from './crashTrail.js';
import { createWater } from './water.js';
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
// Snow: lowland patches start where their noise passes `from`, and pile up to `depth`; the
// mountain snowfields pile up deeper.
const SNOW_PATCH = { from: 0.86, depth: 0.22 };
const SNOW_FIELD_DEPTH = 0.35;
const GROUND_CELL = 0.5; // meters along each side of a ground square: bigger gives bigger facets
const GROUND_BUDGET_MS = 3; // the most time per frame spent building ground
const LAKE_GAP = [12, 18]; // meters from the plane to the crash lake's shore
// More lakes around the lowlands: how many, how big (meters), and how far apart.
const LAKES = { perSquareKm: 10, radius: [6, 16], clearOfCrash: 90, spacing: 40 };
// One big lake out in the lowlands, a long walk from the crash.
const BIG_LAKE = { radius: [55, 72], depth: 5, clearOfCrash: 260 };
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

// The land: gently rolling ground, a lake, and a river running out of it. Everything is worked out from (x, z) so other code can ask "what's here?".
// Call build() to make its meshes once you've decided to keep it (see isDry).
export function createTerrain(random, noise, size) {
  const hills = (x, z) => noise(x * 0.02 + 100, z * 0.02) * 4 + noise(x * 0.07 + 200, z * 0.07) * 0.8;

  // The plane came down beside a lake, so you always start near water. The lake lies on
  // the crash's open side: the skid trail runs back to the north-west and you start to the
  // south, so it goes somewhere from north-east (-60°) round to south-east (40°), with its
  // shore LAKE_GAP meters from the plane.
  const crashLakeRadius = random.range(11, 15);
  const crashLakeAngle = random.range(-1.05, 0.7);
  const crashLake = createLake(noise, 0, crashLakeRadius, 3, hills, (radiusAt) => {
    const reach = random.range(...LAKE_GAP) + radiusAt(crashLakeAngle + Math.PI);
    return [CRASH.x + Math.cos(crashLakeAngle) * reach, CRASH.z + Math.sin(crashLakeAngle) * reach];
  });
  const lakes = [crashLake];

  // A river winds out of the crash lake, away from the crash, to the edge of the map.
  const river = createRiver(random, noise, crashLakeAngle, crashLake, (x, z) => withLakes(hills(x, z), x, z, lakes), size);
  const nearRiver = (x, z, distance) =>
    river.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - x, p.z - z) < distance);

  // The mountains: one big range filling a corner of the map, so there's a whole region to
  // explore. It takes the corner the river doesn't run through (the one with the least river
  // in it). Its peaks are highest towards the corner and lower towards the middle of the map,
  // so you climb up through the foothills into the snow.
  const edge = size / 2 - 40; // the playable edge
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ sx, sz, x: sx * edge, z: sz * edge }));
  const riverIn = (c) => river.points.filter((p) => Math.hypot(p.x - c.x, p.z - c.z) < MOUNTAINS.reach + 60).length;
  const corner = corners.map((c) => ({ ...c, river: riverIn(c), pick: random.next() })).sort((a, b) => a.river - b.river || a.pick - b.pick)[0];
  const range = { x: corner.x, z: corner.z, radius: MOUNTAINS.reach, peaks: [] };
  for (let tries = 0; range.peaks.length < MOUNTAINS.peaks && tries < 400; tries++) {
    // Somewhere in the quarter-circle reaching into the map from the corner.
    const angle = random.range(0, Math.PI / 2);
    const out = MOUNTAINS.reach * Math.sqrt(random.range(0.02, 0.75));
    const x = corner.x - corner.sx * Math.cos(angle) * out;
    const z = corner.z - corner.sz * Math.sin(angle) * out;
    const radius = random.range(...MOUNTAINS.peakRadius);
    if (Math.hypot(x - CRASH.x, z - CRASH.z) < radius + MOUNTAINS.clearOfCrash) continue;
    if (nearRiver(x, z, radius * 1.1 + 30)) continue;
    if (range.peaks.some((p) => Math.hypot(p.x - x, p.z - z) < (p.radius + radius) * 0.45)) continue;
    // Taller the closer to the corner.
    const height = THREE.MathUtils.lerp(MOUNTAINS.height[1], MOUNTAINS.height[0], out / MOUNTAINS.reach) * random.range(0.8, 1);
    range.peaks.push({ x, z, radius, height, offset: random.range(0, 500) });
  }
  const massifs = [range];
  const peaks = massifs.flatMap((m) => m.peaks);
  // How far out from a peak (x, z) is, compared to the peak's foot: 0 at the top, 1 at the foot.
  // The foot wanders in and out, so mountains have ragged edges.
  const outFrom = (p, x, z) => {
    const edge = p.radius * (1 + 0.35 * noise(x * 0.006 + p.offset, z * 0.006) + 0.15 * noise(x * 0.02 + p.offset, z * 0.02));
    return Math.hypot(x - p.x, z - p.z) / edge;
  };
  const nearPeak = (p, x, z) => Math.abs(x - p.x) < p.radius * 1.6 && Math.abs(z - p.z) < p.radius * 1.6;
  // The whole corner rises into a rocky highland, with the peaks standing on it, so the range
  // is one region rather than separate hills: 0 out in the lowlands, 1 deep in the corner.
  const highlandAt = (x, z) => {
    const out = Math.hypot(x - range.x, z - range.z) / (range.radius * (1 + 0.18 * noise(x * 0.004 + 900, z * 0.004)));
    return 1 - smoothstep(out, 0.5, 0.95);
  };
  // How far up a mountain (x, z) is: 0 on the lowlands and at a mountain's foot, 1 at the top.
  const mountainAt = (x, z) => {
    let best = highlandAt(x, z) * MOUNTAINS.highlandUp;
    for (const p of peaks) {
      if (!nearPeak(p, x, z)) continue;
      best = Math.max(best, (p.height / MOUNTAINS.height[1]) * (1 - smoothstep(outFrom(p, x, z), 0, 1)));
    }
    return best;
  };
  const mountainHeight = (x, z) => {
    const highland = highlandAt(x, z);
    if (highland === 0 && !peaks.some((p) => nearPeak(p, x, z))) return 0;
    // Where peaks overlap, the higher one mostly wins, but they blend into each other (a
    // power mean rather than the plain highest), so there's a rounded saddle between them
    // instead of a sharp crease.
    let sum = 0;
    for (const p of peaks) {
      if (!nearPeak(p, x, z)) continue;
      const up = 1 - smoothstep(outFrom(p, x, z), 0, 1);
      if (up <= 0) continue;
      // Ridges and gullies on the way up, with rounded crests rather than knife edges.
      const n = noise(x * 0.018 + p.offset, z * 0.018);
      const ridges = 1 - Math.sqrt(n * n + MOUNTAINS.ridgeRound ** 2);
      sum += Math.max(0, p.height * up ** 1.3 + ridges * 7 * up * up) ** MOUNTAINS.blend;
    }
    return MOUNTAINS.highlandHeight * highland ** 1.2 + sum ** (1 / MOUNTAINS.blend);
  };
  // Gentle hummocks and hollows a few meters across, so the land isn't flat as a table at your
  // feet. (Smoothed away on the roads: see heightAt.)
  const relief = (x, z) => noise(x * 0.21 + 2100, z * 0.21) * RELIEF[0] + noise(x * 0.73 + 2200, z * 0.73) * RELIEF[1];
  const baseHeight = (x, z) => hills(x, z) + mountainHeight(x, z) + relief(x, z);

  const half = size / 2 - 60;
  const lowland = (x, z, reach) =>
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].every(
      ([dx, dz]) => mountainAt(x + dx * reach, z + dz * reach) === 0,
    );
  // The big lake: somewhere well out in the lowlands, clear of the river and the crash.
  for (let tries = 0; lakes.length < 2 && tries < 400; tries++) {
    const radius = random.range(...BIG_LAKE.radius);
    const x = random.range(-half + radius * 1.5, half - radius * 1.5);
    const z = random.range(-half + radius * 1.5, half - radius * 1.5);
    if (Math.hypot(x - CRASH.x, z - CRASH.z) < BIG_LAKE.clearOfCrash + radius) continue;
    if (!lowland(x, z, radius * 2) || nearRiver(x, z, radius * 1.7 + 25)) continue;
    const lake = createLake(noise, lakes.length, radius, BIG_LAKE.depth, baseHeight, () => [x, z], 0.12);
    lake.big = true;
    lakes.push(lake);
  }

  // Smaller lakes dotted around the lowlands, so there's water wherever you wander.
  for (let tries = 0; lakes.filter((l) => !l.big).length - 1 < Math.round(LAKES.perSquareKm * (size / 1000) ** 2) && tries < 2000; tries++) {
    const radius = random.range(...LAKES.radius);
    const x = random.range(-half, half);
    const z = random.range(-half, half);
    if (Math.hypot(x - CRASH.x, z - CRASH.z) < LAKES.clearOfCrash) continue;
    if (!lowland(x, z, radius * 2)) continue;
    if (nearRiver(x, z, radius * 1.8 + 15)) continue;
    if (lakes.some((l) => Math.hypot(l.x - x, l.z - z) < (l.radius + radius) * 1.8 + LAKES.spacing)) continue;
    lakes.push(createLake(noise, lakes.length, radius, random.range(2.2, 3), baseHeight, () => [x, z]));
  }
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

  const crashTrail = createCrashTrail(noise);
  // How rocky the ground is (above 0.38 stone shows through; see groundAt).
  const rockAt = (x, z) => noise(x * 0.05 + 900, z * 0.05) + noise(x * 0.4 + 950, z * 0.4) * 0.25;
  // How much of the ground is stone there (0 soil, 1 bare rock): the plane's skid doesn't cut
  // into rock, and leaves pale scrapes on it rather than torn soil.
  const stoneAt = (x, z) => smoothstep(rockAt(x, z), 0.38, 0.5);

  // The road, for heightAt and the ground's colours (filled in by layRoads).
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
    const up = mountainAt(x, z);
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
    return r ? Math.min(h, river.carve(r)) : h;
  };
  const lakeOrRiverLevel = (x, z) => {
    const near = nearestLake(x, z);
    let level = near && near.distance < 1.5 ? near.lake.level : -Infinity;
    const r = river.nearest(x, z);
    if (r && r.distance < r.halfWidth + 0.5) level = Math.max(level, r.level);
    return level;
  };
  const creeks = createCreeks(
    random, noise, river, lakes, landAt, mountainAt,
    (x, z) => lakeOrRiverLevel(x, z) > landAt(x, z) - 0.3,
    (x, z) => Math.hypot(x - CRASH.x, z - CRASH.z) < CREEKS.clearOfCrash || crashTrail.near(x, z, 6) || Math.max(Math.abs(x), Math.abs(z)) > size / 2 - 30,
  );

  const heightAt = (x, z) => {
    let h = landAt(x, z);
    const c = creeks.nearest(x, z);
    if (c) h = Math.min(h, creeks.carve(c));
    // The old fire road: smoothed flat (no hummocks), with two wheel ruts pressed into it and
    // the middle a little proud of them, blending into the land at its edges.
    const road = roadCells.size ? roadAt(x, z) : null;
    if (road) {
      const across = Math.abs(road.offset);
      const on = 1 - smoothstep(across, road.half - 0.4, road.half + 0.6);
      const rut = 1 - smoothstep(Math.abs(across - RUTS.at), RUTS.width * 0.3, RUTS.width);
      h += on * (-relief(x, z) - rut * RUTS.depth + (1 - smoothstep(across, 0, 0.55)) * RUTS.crown);
    }
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
    const { x: sx, z: sz } = slopeAt(x, z);
    if (sx * dx + sz * dz <= 0 || Math.hypot(sx, sz) <= Math.tan(MAX_CLIMB)) return true;
    return waterDepth(x, z) > 0 || nearWater(x, z, 0.5);
  };
  // Rough "is this within `margin` meters of a lake or the river" check, for placing things.
  const nearWater = (x, z, margin) => {
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
  const forest = (x, z) =>
    noise(x * 0.006 + 700, z * 0.006) * 1.3 + noise(x * 0.04 + 50, z * 0.04) * 0.6 - mountainAt(x, z) * 4;
  // How cold the air is up the mountains: 0 in the lowlands, rising to 1 above the snowline.
  const coldAt = (x, z) => smoothstep(mountainAt(x, z), MOUNTAINS.coldFrom, MOUNTAINS.coldFull);

  // Roads, added with setRoads once the map knows where they go: segments sorted into cells.
  let roadHalf = 0;
  const roadAt = (x, z) => {
    if (!roadCells.size) return null;
    const list = roadCells.get(`${Math.floor(x / ROAD_CELL)},${Math.floor(z / ROAD_CELL)}`);
    if (!list) return null;
    let best = null;
    for (const { ax, az, bx, bz } of list) {
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
        best = { offset: distance * side, half: roadHalf };
      }
    }
    return best && Math.abs(best.offset) < roadHalf + 1 ? best : null;
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
      const snowy = up + noise(x * 0.05 + 1300, z * 0.05) * 0.1 + noise(x * 0.3 + 1400, z * 0.3) * 0.04;
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
      if (scar.dirt * (1 - stone) > 0.4) kind = 'dirt';
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
        tint.lerp(RUT, 0.7 * (1 - smoothstep(Math.abs(across - 0.8), 0.1, 0.5)));
        tint.lerp(ROAD_GRASS, 0.5 * (1 - smoothstep(across, 0.15, 0.55)));
        tint.lerp(OCHRE, clamp(noise(x * 0.5, z * 0.5) * 0.4, 0, 0.3));
        color.lerp(tint, edge);
        if (edge > 0.5) kind = 'road';
      }
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
    nearWater,
    forest,
    mountainAt,
    coldAt,
    lakes,
    massifs,
    crashTrail,
    groundAt,
    riverPoints: river.points, // the river's path, from the lake outwards
    creeks: creeks.list, // each { points: [{ x, z, level, halfWidth }] }, from its spring down
    creekOnly,
    roadAt,
    // Lays roads (each a list of { x, z } points) `width` meters wide into the ground. Call
    // before the ground is drawn.
    setRoads(paths, width) {
      roadHalf = width / 2;
      for (const path of paths) {
        for (let i = 1; i < path.length; i++) {
          const [a, b] = [path[i - 1], path[i]];
          const pad = roadHalf + 1;
          for (let cx = Math.floor((Math.min(a.x, b.x) - pad) / ROAD_CELL); cx <= Math.floor((Math.max(a.x, b.x) + pad) / ROAD_CELL); cx++) {
            for (let cz = Math.floor((Math.min(a.z, b.z) - pad) / ROAD_CELL); cz <= Math.floor((Math.max(a.z, b.z) + pad) / ROAD_CELL); cz++) {
              const key = `${cx},${cz}`;
              if (!roadCells.has(key)) roadCells.set(key, []);
              roadCells.get(key).push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
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
      const ground = createGround(size, heightAt, groundAt, snowAt);
      terrain.ground = ground.group;
      terrain.drawAround = ground.drawAround;
      terrain.water = createWater(lakes, river, creeks.list);
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

// A river winding out of the lake to the edge of the map. It flows downhill: its surface
// never rises, and it carves a channel through anything in the way.
function createRiver(random, noise, lakeAngle, lake, heightAt, size) {
  // Leave the lake on its far side, flowing away from the crash site.
  const direction = lakeAngle + random.range(-0.4, 0.4);
  let heading = direction;
  const start = lake.radiusAt(heading) * 0.9;
  let x = lake.x + Math.cos(heading) * start;
  let z = lake.z + Math.sin(heading) * start;
  const points = [];
  let level = lake.level;
  const STEP = 2.5;
  for (let i = 0; i < 2000 && Math.max(Math.abs(x), Math.abs(z)) < size / 2 + 5; i++) {
    const halfWidth = 1.5 + Math.min(1.2, i * 0.02); // widens as it goes
    // The surface sits below the lowest ground across the channel, and never rises.
    const across = [-1, 0, 1].map((s) => heightAt(x - Math.sin(heading) * s * (halfWidth + 1), z + Math.cos(heading) * s * (halfWidth + 1)));
    // (Still inside the lake, the river is just the lake's surface.)
    if (lake.distance(x, z) > 1.35) level = Math.min(level, Math.min(...across) - 0.35);
    points.push({ x, z, level, halfWidth });
    // Meander, but keep drifting back to the overall direction so it never doubles back.
    heading += noise(i * 0.15 + 70, 3.3) * 0.35 + (direction - heading) * 0.12;
    x += Math.cos(heading) * STEP;
    z += Math.sin(heading) * STEP;
  }

  // The channel and banks reach this far from its middle: far enough for the banks to slope
  // all the way up to the land where the river cuts through a hill, rather than stopping
  // short at a sheer step.
  const index = channelIndex([{ points }], RIVER_BANK_REACH);
  // The ground height the channel cuts down to at that spot: a rounded bed under the
  // water, and banks sloping back up to meet the land.
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
function createGround(size, heightAt, groundAt, snowAt) {
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
  const half = size / 2;
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
    Math.abs((cx + 0.5) * CHUNK_SIZE) < half + CHUNK_SIZE && Math.abs((cz + 0.5) * CHUNK_SIZE) < half + CHUNK_SIZE;

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
