import * as THREE from 'three';
import { createGrass } from './grass.js';
import { drawModelsAround, instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { createNoise, createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { Trees } from './trees.js';
import { stoneSpots } from './hunting.js';
import { CRASH, trailPoint } from './crashTrail.js';
import { SpatialGrid } from './grid.js';
import { LOOKOUT, chooseLookout, lookoutBase, lookoutObstacles, lookoutStructure } from './lookout.js';
import { choosePois, poiClearing, poiObstacles, poiStructure } from './pois.js';
import { ROAD_WIDTH, alongRoads, layRoads, ruinRoads } from './roads.js';
import { scatterDetails } from './details.js';

// Meters across; the playable area is a square centred on the crash, at 0,0. Only the chunks
// around the player are drawn (see stream.js), so a big map costs little more than a small one.
export const WORLD_SIZE = 1400;
const GROUND_SIZE = WORLD_SIZE + 80; // the ground continues past the edge into the haze
const HECTARES = ((WORLD_SIZE - 4) / 100) ** 2; // the area things are scattered over
// How many of each thing to scatter, per hectare (100 m × 100 m).
const FOREST_PER_HECTARE = 160;
const BROADLEAF_PER_HECTARE = 13;
const ROCKS_PER_HECTARE = 140;
// Each forest tree's collision radius.
const FOREST_RADIUS = {
  birch: 0.2,
  pine: 0.5,
  'pine-small': 0.3,
  'pine-skinny': 0.35,
  'pine-tall': 0.65,
  'pine-wide': 0.55,
  'pine-snow': 0.5,
  'pine-small-snow': 0.3,
  'sapling-pine': 0.15,
  'sapling-broadleaf': 0.15,
  'tree-dead': 0.4,
};
// Forest trees take their kind from this list in turn, so anything listed once is the rarest.
// The forest is mostly birch: thin trunks with room between them, so you can walk through
// it. A few spruce and the odd dead tree are mixed in for colour.
const FOREST_MIX = [
  'birch', 'birch', 'pine-small', 'birch', 'sapling-broadleaf', 'birch', 'birch', 'pine',
  'birch', 'birch', 'tree-dead', 'birch', 'birch', 'pine-skinny', 'birch', 'birch',
];
const FOREST_SPACING = 2.4; // meters of open ground kept between forest trees
// Up the mountains, dark spruce grow on the lower slopes and snowy ones higher up, thinning
// out to nothing at the treeline (see mountainAt in terrain.js: 0 at a mountain's foot, 1 at the top).
const SPRUCE = ['pine', 'pine-tall', 'pine-skinny', 'pine-small', 'pine-wide', 'sapling-pine', 'pine', 'tree-dead'];
const SNOWY_SPRUCE = ['pine-snow', 'pine-small-snow', 'pine-snow', 'pine-skinny'];
const SPRUCE_PER_HECTARE = 110;
const SNOWY_ABOVE = 0.35;
const TREELINE = 0.55;
// Each rock shape: its collision radius, how tall it stands, and how much it can be scaled.
const ROCK_SHAPES = {
  rock: { radius: 0.55, height: 0.77, scale: [0.5, 1.6] },
  'rock-small': { radius: 0.25, height: 0.3, scale: [0.7, 1.6] },
  'rock-flat': { radius: 0.7, height: 0.29, scale: [0.7, 1.4] },
  'rock-tall': { radius: 0.35, height: 1.17, scale: [0.7, 1.4] },
  'rock-large': { radius: 0.95, height: 1.28, scale: [0.8, 1.4] },
};
const ROCK_TOP = 0.9; // rocks taper, so the player stands a little below the very top
// Rocks take their shape from this list in turn, so small ones are common and large ones rare.
const ROCK_MIX = ['rock', 'rock-small', 'rock-flat', 'rock-small', 'rock', 'rock-tall', 'rock-small', 'rock-large'];
const CRASH_CLEARING = 14; // keep this radius around the crash site (at 0, 0) free of trees
// The player starts about 20 m south of the wreck: just out of view, so you have to find it.
const SPAWN = { x: 0.5, z: 14 };
const SPAWN_CLEARING = 4;

// Builds the map from a seed: the same seed always gives the same world.
export function buildWorld(scene, seed) {
  const { random, noise, terrain, seed: mapSeed } = chooseTerrain(seed);
  terrain.build();
  scene.add(terrain.ground, terrain.water.mesh);

  // Obstacles are circles on the ground the player can't walk into: { x, z, radius }.
  const obstacles = new SpatialGrid();
  // The fire lookout tower goes first, so trees and rocks keep clear of it.
  const lookout = chooseLookout(createRandom(mapSeed + 11), terrain, WORLD_SIZE);
  lookout.base = lookoutBase(lookout, terrain); // the height of its foot
  for (const o of lookoutObstacles(lookout, lookout.base)) obstacles.add(o);
  // Buildings you can walk up into: each has floorAt(x, z, maxY) and roofOver(x, z, feet).
  const structures = [lookoutStructure(lookout, lookout.base)];
  // Then the cabins, caves and hunting stands (see pois.js), each with a clearing round it.
  const pois = choosePois(createRandom(mapSeed + 13), terrain, WORLD_SIZE, lookout);
  // The old fire road from the tower out to the nearest cabins (painted into the ground, so
  // before any of the ground is drawn), with a truck or two left on it.
  const roads = layRoads(createRandom(mapSeed + 17), terrain, lookout, pois);
  terrain.setRoads(roads.paths, ROAD_WIDTH);
  pois.push(...roads.trucks);
  // Everything is drawn around the player as they move: start where they spawn.
  drawModelsAround(SPAWN.x, SPAWN.z);
  terrain.drawAround(SPAWN.x, SPAWN.z, Infinity);
  const clearings = new SpatialGrid();
  for (const { x, z } of alongRoads(roads.paths, 3)) clearings.add({ x, z, radius: ROAD_WIDTH / 2 + 1.2 });
  for (const poi of pois) {
    clearings.add(poiClearing(poi));
    for (const o of poiObstacles(poi)) obstacles.add(o);
    structures.push(poiStructure(poi));
  }
  const isFree = (x, z, spacing) =>
    Math.hypot(x, z) > CRASH_CLEARING &&
    Math.hypot(x - lookout.x, z - lookout.z) > LOOKOUT.clearing &&
    clearings.isClear(x, z, 0) &&
    Math.hypot(x - SPAWN.x, z - SPAWN.z) > SPAWN_CLEARING &&
    !terrain.nearWater(x, z, 2) &&
    !terrain.crashTrail.near(x, z, 2) &&
    obstacles.isClear(x, z, spacing);

  const place = (x, z, radius, scale) => {
    const obstacle = { x, z, radius: radius * scale };
    obstacles.add(obstacle);
    // Sink things slightly so they don't float on slopes.
    return { x, y: terrain.heightAt(x, z) - 0.1, z, rotation: random.range(0, Math.PI * 2), scale, obstacle };
  };

  const trees = new Trees(scene);

  // Open birch woods grow in clumps across the valley...
  const forest = Object.fromEntries(Object.keys(FOREST_RADIUS).map((kind) => [kind, []]));
  let placedTrees = 0;
  scatter(random, Math.round(FOREST_PER_HECTARE * HECTARES), (x, z) => {
    if (terrain.forest(x, z) < random.range(-0.15, 0.45) || !isFree(x, z, FOREST_SPACING)) return null;
    const kind = FOREST_MIX[placedTrees++ % FOREST_MIX.length];
    const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.8, 1.3));
    forest[kind].push(tree);
    return tree;
  });
  for (const massif of terrain.massifs) {
    const hectares = (Math.PI * (massif.radius / 100) ** 2) / 4; // a quarter-circle in from a corner
    scatterAround(random, massif, Math.round(SPRUCE_PER_HECTARE * hectares), (x, z) => {
      const up = terrain.mountainAt(x, z);
      // Thinner the higher you go, and none above the treeline.
      if (up < 0.02 || up > TREELINE * random.range(0.8, 1.05) || !isFree(x, z, FOREST_SPACING * 0.75)) return null;
      const kind = random.pick(up > SNOWY_ABOVE ? SNOWY_SPRUCE : SPRUCE);
      const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.8, 1.3));
      forest[kind].push(tree);
      return tree;
    });
  }
  for (const [kind, spots] of Object.entries(forest)) {
    trees.add(kind, kind === 'birch' ? placeholders.birch() : placeholders.conifer(), spots);
  }

  // ...while round leafy trees stand alone or in small groups out in the fields.
  const broadleaves = scatter(random, Math.round(BROADLEAF_PER_HECTARE * HECTARES), (x, z) => {
    if (terrain.forest(x, z) > 0 || terrain.mountainAt(x, z) > 0.02 || !isFree(x, z, 4)) return null;
    return place(x, z, 0.45, random.range(0.8, 1.25));
  });
  trees.add('broadleaf', placeholders.broadleaf(), broadleaves);

  // Boulders lie in clusters on rocky ground (and the odd one out in the grass), each
  // squashed or stretched a little differently.
  const rocks = Object.fromEntries(Object.keys(ROCK_SHAPES).map((name) => [name, []]));
  let placedRocks = 0;
  scatter(random, Math.round(ROCKS_PER_HECTARE * HECTARES), (x, z) => {
    if (terrain.groundAt(x, z).kind !== 'rock' && random.next() > 0.08) return null;
    if (!isFree(x, z, 0.3)) return null;
    const name = ROCK_MIX[placedRocks++ % ROCK_MIX.length];
    const shape = ROCK_SHAPES[name];
    const { y, rotation, scale, obstacle } = place(x, z, shape.radius, random.range(...shape.scale));
    const stretch = [random.range(0.8, 1.5), random.range(0.6, 1.1), random.range(0.8, 1.3)];
    obstacle.top = y + shape.height * ROCK_TOP * scale * stretch[1]; // the player can jump onto it
    const rock = transform(x, y, z, rotation, scale, stretch);
    rocks[name].push(rock);
    return rock;
  });
  // Stones along the creeks: half-sunk in the water and lying on the banks.
  for (const { points } of terrain.creeks) {
    for (let i = 1; i < points.length - 1; i++) {
      if (random.next() > 0.45) continue;
      const p = points[i];
      const q = points[i + 1];
      const along = Math.atan2(q.z - p.z, q.x - p.x);
      const out = random.range(-1, 1) * (p.halfWidth + 1.2);
      const x = p.x - Math.sin(along) * out + random.range(-1, 1);
      const z = p.z + Math.cos(along) * out + random.range(-1, 1);
      if (!clearings.isClear(x, z, 0) || !obstacles.isClear(x, z, 0.2) || Math.hypot(x, z) < CRASH_CLEARING) continue;
      const name = random.next() < 0.6 ? 'rock-small' : random.next() < 0.6 ? 'rock-flat' : 'rock';
      const shape = ROCK_SHAPES[name];
      const scale = random.range(0.6, 1.1) * (name === 'rock' ? 0.6 : 1);
      const obstacle = { x, z, radius: shape.radius * scale };
      obstacles.add(obstacle);
      const y = terrain.heightAt(x, z) - 0.08;
      const stretch = [random.range(0.9, 1.5), random.range(0.5, 0.9), random.range(0.9, 1.3)];
      obstacle.top = y + shape.height * ROCK_TOP * scale * stretch[1];
      rocks[name].push(transform(x, y, z, random.range(0, Math.PI * 2), scale, stretch));
    }
  }
  for (const [name, transforms] of Object.entries(rocks)) {
    scene.add(instancedModel(name, placeholders.rock(), transforms));
  }

  // Fallen trees, old fences, and the ruin of the fire road.
  const details = scatterDetails(scene, { random, terrain, obstacles, isFree, pois, worldSize: WORLD_SIZE, hectares: HECTARES });
  ruinRoads(scene, random, terrain, roads, details.addLog, obstacles);

  // Loose stones (for arrowheads) lie in small groups by the rocks and the lake shore,
  // never deep in the forest. They're picked up like any other item (see main.js).
  const stones = stoneSpots(
    random,
    WORLD_SIZE,
    (x, z) => {
      if (terrain.forest(x, z) > 0.2 || terrain.waterDepth(x, z) > 0) return false;
      const byRocks = [...obstacles.near(x, z, 3)].some((o) => o.top !== undefined && Math.hypot(o.x - x, o.z - z) < o.radius + 3);
      return byRocks || (terrain.nearWater(x, z, 4) && !terrain.nearWater(x, z, 0.5));
    },
    (x, z) =>
      Math.abs(x) < WORLD_SIZE / 2 - 1 && Math.abs(z) < WORLD_SIZE / 2 - 1 &&
      terrain.waterDepth(x, z) === 0 &&
      obstacles.isClear(x, z, 0.3),
  );

  const grass = createGrass(mapSeed, terrain, WORLD_SIZE + 10);
  grass.update(0, SPAWN.x, SPAWN.z, true);
  scene.add(grass.group);

  return {
    terrain,
    obstacles,
    trees,
    grass,
    stones,
    lookout,
    pois,
    roads: roads.paths,
    creeks: terrain.creeks,
    structures,
    size: WORLD_SIZE,
    spawn: new THREE.Vector3(SPAWN.x, terrain.heightAt(SPAWN.x, SPAWN.z), SPAWN.z),
    // Builds what's around (x, z) right away, e.g. after the player jumps back to the start.
    drawAround(x, z) {
      drawModelsAround(x, z);
      terrain.drawAround(x, z, Infinity);
      grass.update(0, x, z, true);
    },
    update(dt, time, player) {
      drawModelsAround(player.x, player.z);
      terrain.drawAround(player.x, player.z);
      grass.update(time, player.x, player.z);
      terrain.water.update(time, player.x, player.z, terrain.waterDepth(player.x, player.z) > 0.02);
      trees.update(dt);
    },
  };
}

// Some seeds put water where the crash or the start should be. Those try the next seed in
// line, so a seed still always gives the same map.
const MAX_TRIES = 50;
function chooseTerrain(seed) {
  for (let i = 0; ; i++) {
    const trySeed = seed + i * 7919;
    const random = createRandom(trySeed);
    const noise = createNoise(trySeed + 1);
    const terrain = createTerrain(random, noise, GROUND_SIZE);
    if (startIsDry(terrain) || i === MAX_TRIES) return { random, noise, terrain, seed: trySeed };
  }
}

// The wreck, the skid trail, where you start and the walk between them all need dry ground.
export function startIsDry(terrain) {
  const dry = (x, z, radius) => terrain.isDry(x, z, radius, 1);
  if (!dry(CRASH.x, CRASH.z, 6.5) || !dry(-5.5, -9, 2.5)) return false; // the plane and its wing
  for (let back = 0; back <= 48; back += 4) {
    const { x, z } = trailPoint(back, 0);
    if (!dry(x, z, 5)) return false;
  }
  for (let t = 0; t <= 1; t += 0.25) {
    if (!dry(SPAWN.x + (CRASH.x - SPAWN.x) * t, SPAWN.z + (CRASH.z - SPAWN.z) * t, 4)) return false;
  }
  return true;
}

// Tries random spots until `count` of them are accepted by `place`.
function scatter(random, count, place) {
  const half = WORLD_SIZE / 2 - 2;
  const transforms = [];
  for (let tries = 0; transforms.length < count && tries < count * 40; tries++) {
    const result = place(random.range(-half, half), random.range(-half, half));
    if (result) transforms.push(result);
  }
  return transforms;
}

// Like scatter, but only tries spots within `radius` of { x, z } (and inside the map).
function scatterAround(random, { x: cx, z: cz, radius }, count, place) {
  const half = WORLD_SIZE / 2 - 2;
  const placed = [];
  for (let tries = 0; placed.length < count && tries < count * 40; tries++) {
    const angle = random.range(0, Math.PI * 2);
    const r = radius * 1.3 * Math.sqrt(random.next());
    const x = cx + Math.cos(angle) * r;
    const z = cz + Math.sin(angle) * r;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    const result = place(x, z);
    if (result) placed.push(result);
  }
  return placed;
}

// `stretch` optionally squashes or stretches it along each axis: [x, y, z].
function transform(x, y, z, rotation, scale, stretch = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
    new THREE.Vector3(scale * stretch[0], scale * stretch[1], scale * stretch[2]),
  );
}
