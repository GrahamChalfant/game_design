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
import { KEEP_CLEAR, ROAD_WIDTH, alongRoads, layRoads, ruinRoads } from './roads.js';
import { scatterDetails } from './details.js';

// Meters across; the playable area is a square centred on the crash, at 0,0. Only the chunks
// around the player are drawn (see stream.js), so a big map costs little more than a small one.
export const WORLD_SIZE = 1400;
const GROUND_SIZE = WORLD_SIZE + 80; // the ground continues past the edge into the haze
const HECTARES = ((WORLD_SIZE - 4) / 100) ** 2; // the area things are scattered over
// How many of each thing to scatter, per hectare (100 m × 100 m).
const FOREST_PER_HECTARE = 300; // (the most tried for: open woods take fewer)
const ROCKS_PER_HECTARE = 140;
// Each forest tree's collision radius.
const FOREST_RADIUS = {
  pine: 0.5,
  'pine-small': 0.3,
  'pine-skinny': 0.35,
  'pine-tall': 0.65,
  'pine-wide': 0.55,
  'pine-snow': 0.5,
  'pine-small-snow': 0.3,
  'sapling-pine': 0.15,
  'tree-dead': 0.4,
};
// Forest trees take their kind from these lists in turn, so anything listed once is the rarest.
// Far north, it's all spruce. At the forest's edges it's open spruce woodland: slim, scattered
// spruce, young ones and dead snags, with room to walk between them; deeper in it closes into
// boreal forest, crowded together.
const FOREST_MIX = [
  'pine-skinny', 'pine-small', 'pine', 'sapling-pine', 'pine-skinny', 'tree-dead', 'pine-small', 'pine-skinny',
  'pine', 'sapling-pine', 'pine-skinny', 'pine-wide', 'pine-small', 'tree-dead', 'pine-skinny', 'pine-tall',
];
const DEEP_FOREST_MIX = [
  'pine-skinny', 'pine', 'pine-small', 'pine-skinny', 'pine-tall', 'pine-small', 'pine-skinny', 'pine',
  'tree-dead', 'pine-skinny', 'pine-wide', 'pine', 'pine-skinny', 'pine-tall', 'pine-small', 'pine',
];
// Meters of open ground kept between forest trees: at the edges, and in the thick of it.
// (Spruce boughs reach about 2 m: any closer and it's a wall of branches. The open woodland is
// spaced well apart, so it reads as scattered trees you can see between.)
const FOREST_SPACING = { open: 4.2, deep: 2.1 };
const DEEP_FROM = [0.25, 0.7]; // forest() values where it goes from open woods to deep forest
// Under the trees in the deep forest: saplings, young spruce and dead snags, close together.
const UNDERSTORY_PER_HECTARE = 200;
const UNDERSTORY_MIX = ['sapling-pine', 'sapling-pine', 'pine-small', 'sapling-pine', 'sapling-pine', 'tree-dead', 'pine-small', 'sapling-pine'];
const UNDERSTORY_SPACING = 1.2;
// Up the mountains, dark spruce grow on the lower slopes and snowy ones higher up, thinning
// out to nothing at the treeline (see mountainAt in terrain.js: 0 at a mountain's foot, 1 at the top).
const SPRUCE = ['pine', 'pine-tall', 'pine-skinny', 'pine-small', 'pine-wide', 'sapling-pine', 'pine', 'tree-dead'];
const SNOWY_SPRUCE = ['pine-snow', 'pine-small-snow', 'pine-snow', 'pine-skinny'];
const SPRUCE_PER_HECTARE = 110;
const SNOWY_ABOVE = 0.35;
const TREELINE = 0.55;
// Each rock shape: its collision radius, how far its widest side reaches from the middle (in
// the model, before stretching), how tall it stands, and how much it can be scaled.
const ROCK_SHAPES = {
  rock: { radius: 0.55, reach: 0.59, height: 0.77, scale: [0.5, 1.6] },
  'rock-small': { radius: 0.25, reach: 0.33, height: 0.3, scale: [0.7, 1.6] },
  'rock-flat': { radius: 0.7, reach: 0.97, height: 0.29, scale: [0.7, 1.4] },
  'rock-tall': { radius: 0.35, reach: 0.51, height: 1.17, scale: [0.7, 1.4] },
  'rock-large': { radius: 0.95, reach: 1.18, height: 1.28, scale: [0.8, 1.4] },
};
// Rain water standing in the fire road's wheel ruts, here and there (see RUTS in terrain.js):
// a flat sheet just above the bottom of the rut, so the ground round it shapes the puddle.
const PUDDLES = { every: 4, chance: 0.2, rut: 0.8, length: [0.6, 1.6], width: [0.45, 0.7] };
function roadPuddles(random, terrain, paths) {
  const out = [];
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      for (let t = random.range(0, PUDDLES.every); t < d; t += PUDDLES.every) {
        if (random.next() > PUDDLES.chance) continue;
        const side = random.next() < 0.5 ? -1 : 1;
        const x = a.x + ((b.x - a.x) * t) / d + Math.cos(heading) * PUDDLES.rut * side;
        const z = a.z + ((b.z - a.z) * t) / d - Math.sin(heading) * PUDDLES.rut * side;
        if (terrain.waterDepth(x, z) > 0 || terrain.snowAt(x, z).depth > 0) continue;
        // (The ground is drawn from heights every half meter, which round off the bottom of a
        // rut: sit the water just above the drawn ground, from those corners, not the true bottom.)
        const [gx, gz] = [Math.floor(x / 0.5) * 0.5, Math.floor(z / 0.5) * 0.5];
        const drawn = (terrain.heightAt(gx, gz) + terrain.heightAt(gx + 0.5, gz) + terrain.heightAt(gx, gz + 0.5) + terrain.heightAt(gx + 0.5, gz + 0.5)) / 4;
        out.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x, Math.min(drawn, terrain.heightAt(x, z) + 0.06) + 0.012, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading),
          new THREE.Vector3(random.range(...PUDDLES.width), 1, random.range(...PUDDLES.length)),
        ));
      }
    }
  }
  return out;
}
// A puddle: a flat, dark, glassy oval (1 across before sizing).
function puddle() {
  const geometry = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x3a5054, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.88 }));
}
// Snow lying on a rock: a copy of the rock a touch bigger, white, drawn only where it faces up
// (so the snow sits on its top faces, whatever its shape). Swaps in for the rock's material.
const SNOW_ON_ROCK = { grow: 1.025, facingUp: 0.55 };
let snowOnRockMaterial = null;
function snowOnRock() {
  if (snowOnRockMaterial) return snowOnRockMaterial;
  snowOnRockMaterial = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.9 });
  snowOnRockMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      if (inverseTransformDirection(normal, viewMatrix).y < ${SNOW_ON_ROCK.facingUp.toFixed(2)}) discard;`,
    );
  };
  return snowOnRockMaterial;
}
// How far a rock, scaled and stretched, reaches out from its middle.
const rockReach = (shape, scale, stretch) => shape.reach * scale * Math.max(stretch[0], stretch[2]);
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
  // (Should the road still pass over a cabin or the like, that place goes: nothing is ever
  // built on the road.)
  const roadPoints = alongRoads(roads.paths, 2);
  for (let i = pois.length - 1; i >= 0; i--) {
    const reach = KEEP_CLEAR[pois[i].kind] ?? 4;
    if (roadPoints.some(({ x, z }) => Math.hypot(x - pois[i].x, z - pois[i].z) < reach - 1)) pois.splice(i, 1);
  }
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

  // Open spruce woodland grows in clumps across the valley, closing into deep forest further in.
  const forest = Object.fromEntries(Object.keys(FOREST_RADIUS).map((kind) => [kind, []]));
  let placedTrees = 0;
  scatter(random, Math.round(FOREST_PER_HECTARE * HECTARES), (x, z) => {
    const woods = terrain.forest(x, z);
    if (woods < random.range(-0.15, 0.45)) return null;
    const deep = THREE.MathUtils.smoothstep(woods, ...DEEP_FROM);
    if (!isFree(x, z, THREE.MathUtils.lerp(FOREST_SPACING.open, FOREST_SPACING.deep, deep))) return null;
    const mix = random.next() < deep ? DEEP_FOREST_MIX : FOREST_MIX;
    const kind = mix[placedTrees++ % mix.length];
    const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.8, 1.3));
    forest[kind].push(tree);
    return tree;
  });
  // The understory, in among the trees of the deep forest.
  scatter(random, Math.round(UNDERSTORY_PER_HECTARE * HECTARES), (x, z) => {
    const deep = THREE.MathUtils.smoothstep(terrain.forest(x, z), ...DEEP_FROM);
    if (deep < random.range(0.2, 1) || !isFree(x, z, UNDERSTORY_SPACING)) return null;
    const kind = UNDERSTORY_MIX[placedTrees++ % UNDERSTORY_MIX.length];
    const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.6, 1.1));
    forest[kind].push(tree);
    return tree;
  });
  for (const massif of terrain.massifs) {
    const hectares = (Math.PI * (massif.radius / 100) ** 2) / 4; // a quarter-circle in from a corner
    scatterAround(random, massif, Math.round(SPRUCE_PER_HECTARE * hectares), (x, z) => {
      const up = terrain.mountainAt(x, z);
      // Thinner the higher you go, and none above the treeline.
      if (up < 0.02 || up > TREELINE * random.range(0.8, 1.05) || !isFree(x, z, FOREST_SPACING.open * 0.6)) return null;
      const kind = random.pick(up > SNOWY_ABOVE ? SNOWY_SPRUCE : SPRUCE);
      const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.8, 1.3));
      forest[kind].push(tree);
      return tree;
    });
  }
  for (const [kind, spots] of Object.entries(forest)) {
    trees.add(kind, placeholders.conifer(), spots);
  }

  // Boulders lie in clusters on rocky ground (and the odd one out in the grass), each
  // squashed or stretched a little differently.
  const rocks = Object.fromEntries(Object.keys(ROCK_SHAPES).map((name) => [name, []]));
  let placedRocks = 0;
  const snowyRocks = Object.fromEntries(Object.keys(ROCK_SHAPES).map((name) => [name, []])); // the rocks in snowy places, for their snow
  scatter(random, Math.round(ROCKS_PER_HECTARE * HECTARES), (x, z) => {
    if (!['rock', 'stony'].includes(terrain.groundAt(x, z).kind) && random.next() > 0.08) return null;
    const name = ROCK_MIX[placedRocks % ROCK_MIX.length];
    const shape = ROCK_SHAPES[name];
    const size = random.range(...shape.scale);
    const stretch = [random.range(0.8, 1.5), random.range(0.6, 1.1), random.range(0.8, 1.3)];
    // No tree growing out of it: clear of trunks under the whole rock, not just its collision circle.
    if (!isFree(x, z, 0.3) || !trees.grid.isClear(x, z, rockReach(shape, size, stretch) + 0.1)) return null;
    placedRocks++;
    const { y, rotation, scale, obstacle } = place(x, z, shape.radius, size);
    obstacle.top = y + shape.height * ROCK_TOP * scale * stretch[1]; // the player can jump onto it
    const rock = transform(x, y, z, rotation, scale, stretch);
    rocks[name].push(rock);
    // Lying in snow, a rock has snow on top too.
    if (terrain.snowAt(x, z).amount > 0.5) {
      const g = SNOW_ON_ROCK.grow;
      snowyRocks[name].push(transform(x, y + 0.01, z, rotation, scale * g, stretch));
    }
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
      if (!clearings.isClear(x, z, 0) || Math.hypot(x, z) < CRASH_CLEARING) continue;
      const name = random.next() < 0.6 ? 'rock-small' : random.next() < 0.6 ? 'rock-flat' : 'rock';
      const shape = ROCK_SHAPES[name];
      const scale = random.range(0.6, 1.1) * (name === 'rock' ? 0.6 : 1);
      const stretch = [random.range(0.9, 1.5), random.range(0.5, 0.9), random.range(0.9, 1.3)];
      if (!obstacles.isClear(x, z, 0.2) || !trees.grid.isClear(x, z, rockReach(shape, scale, stretch) + 0.1)) continue;
      const obstacle = { x, z, radius: shape.radius * scale };
      obstacles.add(obstacle);
      const y = terrain.heightAt(x, z) - 0.08;
      obstacle.top = y + shape.height * ROCK_TOP * scale * stretch[1];
      rocks[name].push(transform(x, y, z, random.range(0, Math.PI * 2), scale, stretch));
    }
  }
  for (const [name, transforms] of Object.entries(snowyRocks)) {
    if (transforms.length) scene.add(instancedModel(name, placeholders.rock(), transforms, snowOnRock));
  }
  for (const [name, transforms] of Object.entries(rocks)) {
    scene.add(instancedModel(name, placeholders.rock(), transforms));
  }

  // Fallen trees, old fences, and the ruin of the fire road.
  const details = scatterDetails(scene, { random, terrain, obstacles, isFree, pois, worldSize: WORLD_SIZE, hectares: HECTARES });
  ruinRoads(scene, random, terrain, roads, details.addLog, obstacles);
  scene.add(instancedModel('puddle', puddle(), roadPuddles(createRandom(mapSeed + 23), terrain, roads.paths)));

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

  const grass = createGrass(mapSeed, terrain, WORLD_SIZE + 10, { trees, obstacles });
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
