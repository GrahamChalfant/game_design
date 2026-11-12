import * as THREE from 'three';
import { createGrass } from './grass.js';
import { drawModelsAround, instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { createNoise, createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { Trees } from './trees.js';
import { stoneSpots } from './hunting.js';
import { CRASH, FLIGHT_PATH, onFlightPath, trailPoint } from './crashTrail.js';
import { damageFlightPath } from './flightPath.js';
import { SpatialGrid } from './grid.js';
import { LOOKOUT, lookoutBase, lookoutObstacles, lookoutStructure } from './lookout.js';
import { fromPoi, placePois, poiClearing, poiObstacles, poiStructure } from './pois.js';
import { CABIN_STYLES } from './landmarks.js';
import { KEEP_CLEAR, ROAD_WIDTH, alongRoads, fixedRoads, ruinRoads } from './roads.js';
import { scatterDetails } from './details.js';
import { BOUNDS, MAP_SEED, RAVINE, REGIONS, TOWER, TRAIL, WEST_TOWER, inBounds, nearestOnTrail, ravineAt, regionAt } from './layout.js';
const SAP_KINDS = new Set(['pine', 'pine-tall', 'pine-wide', 'pine-skinny']); // (grown trees, not saplings or snags)

// The playable area (see layout.js: 2 km by 3 km, the crash at 0,0 near the south coast). Only
// the chunks around the player are drawn (see stream.js), so a big map costs little more than a
// small one.
export { BOUNDS };
const HECTARES = ((BOUNDS.maxX - BOUNDS.minX - 4) * (BOUNDS.maxZ - BOUNDS.minZ - 4)) / 10000; // the area things are scattered over
const STICKS_PER_TREE = 0.12; // the share of trees with a fallen stick or two lying near them
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
    if (path.foot) continue; // (no ruts on a footpath)
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
// What lies along the water's edges (blender/shore.py's models; see buildWorld).
const EDGE_MODELS = {
  rock: ['bank-edge-1', 'bank-edge-2', 'bank-stones-1', 'bank-stones-2', 'bank-stones-3', 'shore-rock-1', 'shore-rock-2', 'shore-rock-3'],
  wood: ['driftwood-1', 'driftwood-2', 'driftwood-3'],
};
const STONES = ['bank-stones-1', 'bank-stones-2', 'bank-stones-3'];
const DRIFTWOOD = { 'driftwood-1': { length: 6.2, radius: 0.26 }, 'driftwood-2': { length: 4.4, radius: 0.19 }, 'driftwood-3': { length: 5.2, radius: 0.22 } };
const SHORE_ROCKS = { 'shore-rock-1': { radius: 1.5, height: 1.5 }, 'shore-rock-2': { radius: 1.7, height: 1.0 }, 'shore-rock-3': { radius: 1.1, height: 2.5 } };
// The river's banks: none along its first `from` points (the waterfall's pool); `waterline`, how
// far out past the channel's edge the water reaches up the bank; then, at each point on each
// side, the chance of a torn length of bank (`edge`), of cobbles (`stones`), of a lodged trunk.
const BANKS = { from: 12, waterline: 0.33, edge: 0.34, stones: 0.3, drift: 0.02 };
// The river above the waterfall: at each point on each side, the chance of a torn length of
// bank (in grass) and of cobbles; the chance of a boulder in it where it's `calm` and where
// it's `rough` (the slope `rapids`).
const HEADWATERS = { edge: 0.3, stones: 0.4, level: 0.06, calm: 0.05, rough: 0.34, rapids: [0.08, 0.35] }; // (`level`: the slope below which flat cobbles can lie along it)
// The sea's shore: something tried every `step` meters along it. The chance of a rock (on open
// beach, and in rocky stretches), of shingle on the tide line, of a drifted trunk (likewise);
// and nothing within `mouth` meters of where the river runs out.
const SEA_SHORE = { step: 2.5, rocks: [0.14, 0.85], shingle: 0.6, drift: [0.07, 0.17], mouth: 14 };
// Boulders in the river: none in its first `from` points (the waterfall's pool and the spill out
// of it) or its last `fromMouth`; the chance of one at each point where the water's `calm` and
// where it's `rough` (the slope `rapids`: from where it starts to break to all white); and
// `apart`, the clear water left round each (a way through for a swimmer).
const RIVER_STONES = { from: 14, fromMouth: 12, calm: 0.05, rough: 0.5, rapids: [0.02, 0.11], apart: 0.9 };
const ROCK_TOP = 0.9; // rocks taper, so the player stands a little below the very top
// Rocks take their shape from this list in turn, so small ones are common and large ones rare.
const ROCK_MIX = ['rock', 'rock-small', 'rock-flat', 'rock-small', 'rock', 'rock-tall', 'rock-small', 'rock-large'];
const CRASH_CLEARING = 14; // keep this radius around the crash site (at 0, 0) free of trees
// The player starts about 20 m south of the wreck: just out of view, so you have to find it.
const SPAWN = { x: 0.5, z: 14 };
const SPAWN_CLEARING = 4;

// Builds the map: the same every time (see layout.js).
export function buildWorld(scene) {
  const mapSeed = MAP_SEED;
  const random = createRandom(mapSeed);
  const noise = createNoise(mapSeed + 1);
  const terrain = createTerrain(noise, BOUNDS);
  terrain.build();
  scene.add(terrain.ground, terrain.water.mesh);

  // Obstacles are circles on the ground the player can't walk into: { x, z, radius }.
  const obstacles = new SpatialGrid();
  // The fire lookout tower goes first, so trees and rocks keep clear of it.
  // (And the older one up on Bald Knob, in the west.)
  const lookout = { x: TOWER.x, z: TOWER.z, heading: TOWER.heading, hasMap: true };
  const westLookout = { x: WEST_TOWER.x, z: WEST_TOWER.z, heading: WEST_TOWER.heading, hasMap: false, old: true };
  const lookouts = [lookout, westLookout];
  // Then the cabins, caves and hunting stands (see pois.js), each with a clearing round it.
  const pois = placePois(terrain);
  // The old fire road from the tower out east, and the farm's dirt road north off the map
  // (painted into the ground, so before any of the ground is drawn), with a truck left on it.
  const roads = fixedRoads(terrain, lookout, pois);
  // (Should the road still pass over a cabin or the like, that place goes: nothing is ever
  // built on the road.)
  const roadPoints = alongRoads(roads.paths, 2);
  for (let i = pois.length - 1; i >= 0; i--) {
    const reach = KEEP_CLEAR[pois[i].kind] ?? 4;
    if (roadPoints.some(({ x, z }) => Math.hypot(x - pois[i].x, z - pois[i].z) < reach - 1)) pois.splice(i, 1);
  }
  terrain.setRoads(roads.paths, ROAD_WIDTH);
  // (The roads are cut into the hillsides, which moves the ground near them: everything standing
  // on it is set on the ground as it is now.)
  const settled = new Map(placePois(terrain).map((poi) => [poi.seed, poi]));
  for (const poi of pois) Object.assign(poi, { base: settled.get(poi.seed).base, rim: settled.get(poi.seed).rim, drop: settled.get(poi.seed).drop });
  for (const truck of roads.trucks) truck.base = terrain.heightAt(truck.x, truck.z);
  pois.push(...roads.trucks);
  for (const spot of lookouts) {
    spot.base = lookoutBase(spot, terrain); // the height of its foot
    for (const o of lookoutObstacles(spot, spot.base)) obstacles.add(o);
  }
  // Buildings you can walk up into: each has floorAt(x, z, maxY) and roofOver(x, z, feet).
  const structures = lookouts.map((spot) => lookoutStructure(spot, spot.base));
  // Everything is drawn around the player as they move: start where they spawn.
  drawModelsAround(SPAWN.x, SPAWN.z);
  terrain.drawAround(SPAWN.x, SPAWN.z, Infinity);
  const clearings = new SpatialGrid();
  for (const { x, z, half, foot } of alongRoads(roads.paths, 3)) clearings.add({ x, z, radius: half + (foot ? 0.4 : 1.2) });
  for (const poi of pois) {
    clearings.add(poiClearing(poi));
    for (const o of poiObstacles(poi)) obstacles.add(o);
    structures.push(poiStructure(poi));
  }
  const isFree = (x, z, spacing) =>
    Math.hypot(x, z) > CRASH_CLEARING &&
    lookouts.every((spot) => Math.hypot(x - spot.x, z - spot.z) > LOOKOUT.clearing) &&
    clearings.isClear(x, z, 0) &&
    Math.hypot(x - SPAWN.x, z - SPAWN.z) > SPAWN_CLEARING &&
    nearestOnTrail(x, z).distance > TRAIL.halfWidth + 1.5 && // (the mountain trail stays open)
    ravineAt(x, z).distance > RAVINE.halfWidth + 0.5 && // (and the ravine's floor: the way out, should you fall in)
    !(onFlightPath(x, z) && Math.abs(onFlightPath(x, z).side) < FLIGHT_PATH.half) && // (the plane cut through there)
    !terrain.nearWater(x, z, 2) &&
    !terrain.crashTrail.near(x, z, 2) &&
    obstacles.isClear(x, z, spacing);

  // Trees need soil: none on bare rock or stony ground.
  const soil = (x, z) => !['rock', 'stony'].includes(terrain.groundKind(x, z));
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
    if (!isFree(x, z, THREE.MathUtils.lerp(FOREST_SPACING.open, FOREST_SPACING.deep, deep)) || !soil(x, z)) return null;
    const mix = random.next() < deep ? DEEP_FOREST_MIX : FOREST_MIX;
    const kind = mix[placedTrees++ % mix.length];
    const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.8, 1.3));
    forest[kind].push(tree);
    return tree;
  });
  // The understory, in among the trees of the deep forest.
  scatter(random, Math.round(UNDERSTORY_PER_HECTARE * HECTARES), (x, z) => {
    const deep = THREE.MathUtils.smoothstep(terrain.forest(x, z), ...DEEP_FROM);
    if (deep < random.range(0.2, 1) || !isFree(x, z, UNDERSTORY_SPACING) || !soil(x, z)) return null;
    const kind = UNDERSTORY_MIX[placedTrees++ % UNDERSTORY_MIX.length];
    const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.6, 1.1));
    forest[kind].push(tree);
    return tree;
  });
  // Up the mountains (the band right across the map).
  const range = { minX: BOUNDS.minX, maxX: BOUNDS.maxX, minZ: -2000, maxZ: -1200 };
  const rangeHectares = ((range.maxX - range.minX) * (range.maxZ - range.minZ)) / 10000;
  scatterIn(random, range, Math.round(SPRUCE_PER_HECTARE * rangeHectares), (x, z) => {
    const up = terrain.mountainAt(x, z);
    // Thinner the higher you go, and none above the treeline.
    if (up < 0.02 || up > TREELINE * random.range(0.8, 1.05) || !isFree(x, z, FOREST_SPACING.open * 0.6) || !soil(x, z)) return null;
    const kind = random.pick(up > SNOWY_ABOVE ? SNOWY_SPRUCE : SPRUCE);
    const tree = place(x, z, FOREST_RADIUS[kind], random.range(0.8, 1.3));
    forest[kind].push(tree);
    return tree;
  });
  for (const [kind, spots] of Object.entries(forest)) {
    trees.add(kind, placeholders.conifer(), spots);
  }
  // The grown pines round the lake (where REGIONS says there's sap) can be tapped for sap.
  for (const tree of trees.all) {
    if (REGIONS[regionAt(tree.x, tree.z)].sap && SAP_KINDS.has(tree.kind)) tree.sap = true;
  }
  // Fallen sticks under the trees, here and there: picked up like stones (see main.js), for
  // fires and making things before you've a knife or an axe.
  const sticks = [];
  const stickRandom = createRandom(mapSeed + 31); // (its own, so the rest of the map stays the same)
  for (const spot of Object.values(forest).flat()) {
    if (stickRandom.next() > STICKS_PER_TREE) continue;
    const angle = stickRandom.range(0, Math.PI * 2);
    const away = stickRandom.range(1.2, 2.6);
    const x = spot.x + Math.cos(angle) * away;
    const z = spot.z + Math.sin(angle) * away;
    if (terrain.waterDepth(x, z) > 0 || !obstacles.isClear(x, z, 0.3)) continue;
    sticks.push({ x, z, count: stickRandom.next() < 0.5 ? 1 : 2, emptySince: null });
  }

  // Boulders lie in clusters on rocky ground (and the odd one out in the grass), each
  // squashed or stretched a little differently.
  const rocks = Object.fromEntries(Object.keys(ROCK_SHAPES).map((name) => [name, []]));
  let placedRocks = 0;
  const snowyRocks = Object.fromEntries(Object.keys(ROCK_SHAPES).map((name) => [name, []])); // the rocks in snowy places, for their snow
  scatter(random, Math.round(ROCKS_PER_HECTARE * HECTARES), (x, z) => {
    if (!['rock', 'stony'].includes(terrain.groundKind(x, z)) && random.next() > 0.08) return null;
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
  const details = scatterDetails(scene, { random, terrain, obstacles, isFree, pois, bounds: BOUNDS, hectares: HECTARES });
  ruinRoads(scene, random, terrain, roads, details.addLog, obstacles);
  // The plane's way in over the trees: snapped, uprooted and leaning spruce along its path.
  damageFlightPath(scene, {
    random: createRandom(mapSeed + 37),
    terrain,
    obstacles,
    clear: (x, z, radius) =>
      obstacles.isClear(x, z, radius) &&
      clearings.isClear(x, z, 0) &&
      Math.hypot(x, z) > CRASH_CLEARING &&
      !terrain.crashTrail.near(x, z, 2) &&
      !terrain.nearWater(x, z, 1),
  });
  scene.add(instancedModel('puddle', puddle(), roadPuddles(createRandom(mapSeed + 23), terrain, roads.paths)));

  // Loose stones (for arrowheads) lie in small groups by the rocks and the lake shore,
  // never deep in the forest. They're picked up like any other item (see main.js).
  const stones = stoneSpots(
    random,
    BOUNDS,
    (x, z) => {
      if (terrain.forest(x, z) > 0.2 || terrain.waterDepth(x, z) > 0) return false;
      const byRocks = [...obstacles.near(x, z, 3)].some((o) => o.top !== undefined && Math.hypot(o.x - x, o.z - z) < o.radius + 3);
      return byRocks || (terrain.nearWater(x, z, 4) && !terrain.nearWater(x, z, 0.5));
    },
    (x, z) =>
      inBounds(x, z, 1) &&
      terrain.waterDepth(x, z) === 0 &&
      obstacles.isClear(x, z, 0.3),
  );

  // (These last, each with its own random numbers, so nothing else on the map moves for them.)
  // Boulders standing in the river, their tops out of the water: plenty where it runs steep
  // and white, the odd one near a bank where it's calm. The water piles up against each and
  // trails away below it (see `wakes` in water.js).
  const riverRandom = createRandom(mapSeed + 41); // (its own, so the rest of the map stays the same)
  const wakes = [];
  const riverRocks = { rock: [], 'rock-flat': [] };
  const course = terrain.riverPoints;
  for (let i = RIVER_STONES.from; i < course.length - RIVER_STONES.fromMouth; i++) {
    const [before, p, after] = [course[i - 2], course[i], course[i + 2]];
    const run = Math.hypot(after.x - before.x, after.z - before.z);
    const fall = Math.max(0, before.level - after.level) / run;
    const steep = THREE.MathUtils.smoothstep(fall, ...RIVER_STONES.rapids);
    if (riverRandom.next() > THREE.MathUtils.lerp(RIVER_STONES.calm, RIVER_STONES.rough, steep)) continue;
    const along = Math.atan2(after.z - before.z, after.x - before.x);
    // (In the rapids anywhere across it; in calm water out toward a bank.)
    const out = (steep > 0.3 ? riverRandom.range(-0.75, 0.75) : riverRandom.pick([-1, 1]) * riverRandom.range(0.55, 0.85)) * p.halfWidth;
    const x = p.x - Math.sin(along) * out;
    const z = p.z + Math.cos(along) * out;
    const flat = riverRandom.next() < 0.12;
    const name = flat ? 'rock-flat' : 'rock';
    const shape = ROCK_SHAPES[name];
    const scale = riverRandom.range(...(flat ? [0.8, 1.2] : [0.9, 1.5]));
    const stretch = [riverRandom.range(0.9, 1.4), riverRandom.range(0.8, 1.1), riverRandom.range(0.9, 1.3)];
    if (!clearings.isClear(x, z, 0) || !obstacles.isClear(x, z, shape.radius * scale + RIVER_STONES.apart)) continue;
    // Its top this far out of the water (the rest of it under, down into the bed).
    const top = p.level + riverRandom.range(...(flat ? [0.16, 0.3] : [0.3, 0.65]));
    const y = top - shape.height * scale * stretch[1];
    const obstacle = { x, z, radius: shape.radius * scale, top: y + shape.height * ROCK_TOP * scale * stretch[1] };
    obstacles.add(obstacle);
    riverRocks[name].push(transform(x, y, z, riverRandom.range(0, Math.PI * 2), scale, stretch));
    wakes.push({ x, z, level: p.level, radius: shape.reach * scale * Math.max(stretch[0], stretch[2]) * (flat ? 0.95 : 0.7), along, fall, steep });
  }
  terrain.water.addWakes(wakes);
  for (const [name, transforms] of Object.entries(riverRocks)) scene.add(instancedModel(name, placeholders.rock(), transforms));

  // The water's edges. Along the river: torn lengths of bank (bare earth under a lip of sod,
  // roots hanging out), cobbles at the waterline, the odd bleached trunk lodged against the
  // bank. Along the river above the waterfall: much the same, smaller. Along the sea: outcrops and boulders in rocky
  // stretches, shingle on the tide line, and driftwood (whole trees, roots and all) thrown up
  // the beach. (The models are blender/shore.py's.)
  const edgeRandom = createRandom(mapSeed + 43);
  const edges = Object.fromEntries([...EDGE_MODELS.wood, ...EDGE_MODELS.rock].map((name) => [name, []]));
  const facing = (dx, dz) => Math.atan2(dx, dz); // the turn that points a model's +z along (dx, dz)
  const edgeClear = (x, z, radius = 0) => inBounds(x, z, 2) && clearings.isClear(x, z, 0) && Math.hypot(x, z) > CRASH_CLEARING && obstacles.isClear(x, z, radius);
  // A trunk lying on the ground through (x, z), along `heading`; you can jump onto it.
  const addDriftwood = (x, z, heading, scale) => {
    const name = edgeRandom.pick(EDGE_MODELS.wood);
    const { length, radius } = DRIFTWOOD[name];
    const [dx, dz] = [Math.cos(heading), -Math.sin(heading)];
    const half = (length * scale) / 2;
    for (let t = -half; t <= half; t += 1) if (!edgeClear(x + dx * t, z + dz * t, radius * scale + 0.3)) return;
    // (Lying on the land, or the bed where that's under water: never floating.)
    const h0 = terrain.heightAt(x - dx * half, z - dz * half);
    const h1 = terrain.heightAt(x + dx * half, z + dz * half);
    edges[name].push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, (h0 + h1) / 2 - 0.05, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, Math.atan2(h1 - h0, half * 2), 'YZX')),
      new THREE.Vector3(scale, scale, scale),
    ));
    for (let t = -half + radius; t <= half - radius; t += 0.8) {
      const [ox, oz] = [x + dx * t, z + dz * t];
      obstacles.add({ x: ox, z: oz, radius: radius * scale + 0.05, top: terrain.heightAt(ox, oz) + radius * scale * 1.9, log: true });
    }
  };
  for (let i = BANKS.from; i < course.length - 1; i++) {
    const [p, q] = [course[i], course[i + 1]];
    const along = Math.atan2(q.z - p.z, q.x - p.x);
    for (const side of [-1, 1]) {
      const [nx, nz] = [-Math.sin(along) * side, Math.cos(along) * side]; // out from the middle, toward this bank
      const waterline = p.halfWidth + BANKS.waterline;
      const roll = edgeRandom.next();
      if (roll < BANKS.edge) {
        const [x, z] = [p.x + nx * (waterline + 0.1), p.z + nz * (waterline + 0.1)];
        if (edgeClear(x, z)) edges[edgeRandom.pick(['bank-edge-1', 'bank-edge-2'])].push(transform(x, p.level, z, facing(-nx, -nz), edgeRandom.range(0.8, 1.1)));
      } else if (roll < BANKS.edge + BANKS.stones) {
        const [x, z] = [p.x + nx * (waterline - 0.15), p.z + nz * (waterline - 0.15)];
        if (edgeClear(x, z)) edges[edgeRandom.pick(STONES)].push(transform(x, p.level, z, facing(-nx, -nz) + edgeRandom.range(-0.3, 0.3), edgeRandom.range(0.9, 1.5)));
      } else if (roll < BANKS.edge + BANKS.stones + BANKS.drift) {
        // (Lodged along the bank, its butt upstream, half in the shallows.)
        addDriftwood(p.x + nx * (waterline + 0.2), p.z + nz * (waterline + 0.2), -along + edgeRandom.range(-0.35, 0.35), edgeRandom.range(0.5, 0.8));
      }
    }
  }
  // The river above the waterfall and the forks that feed it (see HEADWATERS in terrain.js):
  // cobbles down both sides, torn banks where the main stream runs through grass, and boulders
  // standing in it, more of them where it comes down steep.
  // (Every rock stands on the ground: boulders bedded in the stream's bed, tall enough to stand
  // well out of the water; loose rocks on the banks. Flat clusters of cobbles only where the
  // stream runs level, up on the bank at the waterline: laid on a slope they'd hang in the air.)
  const headWakes = [];
  const headRocks = { rock: [], 'rock-tall': [], 'rock-small': [] };
  const bedded = (name, x, z, scale, stretch, sunk) => {
    const shape = ROCK_SHAPES[name];
    const y = terrain.heightAt(x, z) - shape.height * scale * stretch[1] * sunk;
    headRocks[name].push(transform(x, y, z, edgeRandom.range(0, Math.PI * 2), scale, stretch));
    return y + shape.height * scale * stretch[1];
  };
  const dress = (points, main) => {
    for (let i = 3; i < points.length - (main ? 3 : 9); i++) { // (not where a fork runs into the main stream)
      const [before, p, after] = [points[i - 2], points[i], points[i + 2]];
      const along = Math.atan2(after.z - before.z, after.x - before.x);
      const fall = Math.max(0, before.level - after.level) / Math.hypot(after.x - before.x, after.z - before.z);
      for (const side of [-1, 1]) {
        const [nx, nz] = [-Math.sin(along) * side, Math.cos(along) * side];
        const roll = edgeRandom.next();
        if (main && roll < HEADWATERS.edge && fall < 0.12 && terrain.groundKind(p.x + nx * (p.halfWidth + 1.5), p.z + nz * (p.halfWidth + 1.5)) === 'grass') {
          const [x, z] = [p.x + nx * (p.halfWidth + 0.3), p.z + nz * (p.halfWidth + 0.3)];
          if (edgeClear(x, z)) edges[edgeRandom.pick(['bank-edge-1', 'bank-edge-2'])].push(transform(x, p.level, z, facing(-nx, -nz), edgeRandom.range(0.65, 0.9)));
        } else if (roll < HEADWATERS.edge + HEADWATERS.stones) {
          if (main && fall < HEADWATERS.level) {
            const out = p.halfWidth + 0.45;
            edges[edgeRandom.pick(STONES)].push(transform(p.x + nx * out, p.level - 0.05, p.z + nz * out, facing(-nx, -nz) + edgeRandom.range(-0.3, 0.3), edgeRandom.range(0.5, 0.8)));
          } else {
            // Loose rocks on the bank, one or two, half sunk in the ground.
            for (let k = edgeRandom.next() < 0.4 ? 2 : 1; k > 0; k--) {
              const name = edgeRandom.next() < 0.7 ? 'rock-small' : 'rock';
              const scale = name === 'rock' ? edgeRandom.range(0.45, 0.85) : edgeRandom.range(0.9, 1.9);
              const out = p.halfWidth + ROCK_SHAPES[name].radius * scale + edgeRandom.range(0, 0.8);
              const slip = edgeRandom.range(-1, 1);
              const [x, z] = [p.x + nx * out + Math.cos(along) * slip, p.z + nz * out + Math.sin(along) * slip];
              const top = bedded(name, x, z, scale, [edgeRandom.range(0.9, 1.3), edgeRandom.range(0.8, 1.1), edgeRandom.range(0.9, 1.3)], 0.35);
              if (name === 'rock') obstacles.add({ x, z, radius: ROCK_SHAPES.rock.radius * scale, top: top - ROCK_SHAPES.rock.height * scale * (1 - ROCK_TOP) });
            }
          }
        }
      }
      if (!main) continue;
      const steep = THREE.MathUtils.smoothstep(fall, ...HEADWATERS.rapids);
      if (edgeRandom.next() > THREE.MathUtils.lerp(HEADWATERS.calm, HEADWATERS.rough, steep)) continue;
      // A boulder in the stream: a tall one where it's narrow, as big as leaves the water a way round.
      const name = p.halfWidth < 1 || edgeRandom.next() < 0.4 ? 'rock-tall' : 'rock';
      const shape = ROCK_SHAPES[name];
      const scale = Math.min(edgeRandom.range(0.9, 1.6), (p.halfWidth * 0.62) / shape.radius);
      const stretch = [edgeRandom.range(0.9, 1.3), edgeRandom.range(0.9, 1.2), edgeRandom.range(0.9, 1.3)];
      const out = edgeRandom.range(-0.55, 0.55) * p.halfWidth;
      const [x, z] = [p.x - Math.sin(along) * out, p.z + Math.cos(along) * out];
      // (Only if, bedded a quarter of its height, it stands clear of the water.)
      const tall = shape.height * scale * stretch[1];
      if (terrain.heightAt(x, z) + tall * 0.75 < p.level + 0.22 || !obstacles.isClear(x, z, shape.radius * scale + 0.3)) continue;
      const top = bedded(name, x, z, scale, stretch, 0.25);
      obstacles.add({ x, z, radius: shape.radius * scale, top: top - tall * (1 - ROCK_TOP) });
      // (White water round it where the stream's level enough for it to lie on.)
      if (fall < 0.16) headWakes.push({ x, z, level: p.level, radius: shape.reach * scale * Math.max(stretch[0], stretch[2]) * 0.6, along, fall, steep });
    }
  };
  dress(terrain.headwaters.main, true);
  for (const fork of terrain.headwaters.forks) dress(fork, false);
  terrain.water.addWakes(headWakes);
  for (const [name, transforms] of Object.entries(headRocks)) scene.add(instancedModel(name, placeholders.rock(), transforms));
  // The sea's shore, from one side of the map to the other.
  const mouth = course[course.length - 1];
  for (let x = BOUNDS.minX + 4; x < BOUNDS.maxX - 4; x += SEA_SHORE.step) {
    if (Math.abs(x - mouth.x) < SEA_SHORE.mouth) continue; // (the river runs out here)
    const edgeZ = terrain.seaEdgeAt(x);
    // Rocky stretches and open beach, in turn along the coast.
    const rocky = THREE.MathUtils.smoothstep(Math.sin(x * 0.021 + 1.3) + 0.6 * Math.sin(x * 0.0057 + 0.4), -0.2, 0.9);
    if (edgeRandom.next() < THREE.MathUtils.lerp(SEA_SHORE.rocks[0], SEA_SHORE.rocks[1], rocky)) {
      const name = edgeRandom.pick(EDGE_MODELS.rock.filter((n) => n.startsWith('shore-rock')));
      const shape = SHORE_ROCKS[name];
      const scale = edgeRandom.range(0.7, 1.4);
      const rx = x + edgeRandom.range(-1.5, 1.5);
      // (Up the beach, on the tide line, or out in the shallows: only as deep as it stands tall.)
      const rz = edgeZ + edgeRandom.range(-8, Math.min(5, shape.height * scale * 2.2));
      if (edgeClear(rx, rz, shape.radius * scale + 0.4)) {
        const y = terrain.heightAt(rx, rz) - 0.12 * scale;
        obstacles.add({ x: rx, z: rz, radius: shape.radius * scale, top: y + shape.height * ROCK_TOP * scale });
        edges[name].push(transform(rx, y, rz, edgeRandom.range(0, Math.PI * 2), scale));
      }
    }
    if (edgeRandom.next() < SEA_SHORE.shingle) {
      const sz = edgeZ + 0.4 - 8 * edgeRandom.next() ** 2; // (thickest along the tide line, thinning up the beach)
      const sx = x + edgeRandom.range(-1.5, 1.5);
      if (edgeClear(sx, sz)) edges[edgeRandom.pick(STONES)].push(transform(sx, terrain.heightAt(sx, sz) + 0.12, sz, edgeRandom.range(-0.5, 0.5), edgeRandom.range(1, 1.7)));
    }
    if (edgeRandom.next() < THREE.MathUtils.lerp(SEA_SHORE.drift[0], SEA_SHORE.drift[1], rocky)) {
      // (Mostly lying along the tide line; the odd one end-on, its top in the water.)
      const endOn = edgeRandom.next() < 0.25;
      const heading = endOn ? edgeRandom.pick([1, -1]) * Math.PI / 2 + edgeRandom.range(-0.4, 0.4) : edgeRandom.pick([0, Math.PI]) + edgeRandom.range(-0.5, 0.5);
      addDriftwood(x + edgeRandom.range(-1.5, 1.5), edgeZ - (endOn ? edgeRandom.range(0, 2.5) : edgeRandom.range(1.5, 7)), heading, edgeRandom.range(0.8, 1.35));
    }
  }
  for (const name of EDGE_MODELS.rock) if (edges[name].length) scene.add(instancedModel(name, placeholders.rock(), edges[name]));
  for (const name of EDGE_MODELS.wood) if (edges[name].length) scene.add(instancedModel(name, placeholders.rock(), edges[name]));

  const grass = createGrass(mapSeed, terrain, BOUNDS, { trees, obstacles });
  grass.update(0, SPAWN.x, SPAWN.z, true);
  scene.add(grass.group);

  return {
    terrain,
    obstacles,
    trees,
    grass,
    stones,
    sticks,
    lookout,
    lookouts,
    pois,
    // Wells you can drink from (the homestead's).
    wells: pois.filter((poi) => CABIN_STYLES[poi.style]?.well).map((poi) => fromPoi(poi, ...CABIN_STYLES[poi.style].well)),
    roads: roads.paths,
    creeks: terrain.creeks,
    structures,
    bounds: BOUNDS,
    regionAt,
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
      terrain.water.update(time, player.x, player.z, terrain.waterDepth(player.x, player.z) > 0.02, scene.background);
      trees.update(dt);
    },
  };
}

// Tries random spots until `count` of them are accepted by `place`.
function scatter(random, count, place) {
  return scatterIn(random, BOUNDS, count, place);
}

// Like scatter, but only tries spots inside `rect` ({ minX, maxX, minZ, maxZ }, and the map).
function scatterIn(random, rect, count, place) {
  const transforms = [];
  for (let tries = 0; transforms.length < count && tries < count * 40; tries++) {
    const x = random.range(Math.max(rect.minX, BOUNDS.minX + 2), Math.min(rect.maxX, BOUNDS.maxX - 2));
    const z = random.range(Math.max(rect.minZ, BOUNDS.minZ + 2), Math.min(rect.maxZ, BOUNDS.maxZ - 2));
    const result = place(x, z);
    if (result) transforms.push(result);
  }
  return transforms;
}

// `stretch` optionally squashes or stretches it along each axis: [x, y, z].
function transform(x, y, z, rotation, scale, stretch = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
    new THREE.Vector3(scale * stretch[0], scale * stretch[1], scale * stretch[2]),
  );
}
