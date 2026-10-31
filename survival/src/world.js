import * as THREE from 'three';
import { createGrass } from './grass.js';
import { instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { createNoise, createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { Trees } from './trees.js';

export const WORLD_SIZE = 140; // meters across; the playable area is a square centred on 0,0
const GROUND_SIZE = WORLD_SIZE + 80; // the ground continues past the edge into the haze
const CONIFER_COUNT = 300;
const BROADLEAF_COUNT = 25;
// Each pine variety's collision radius.
const PINE_RADIUS = { pine: 0.5, 'pine-small': 0.3, 'pine-skinny': 0.35, 'pine-tall': 0.65, 'pine-wide': 0.55 };
// Pines take their variety from this list in turn, so tall and wide ones are the rarest.
const PINE_MIX = ['pine', 'pine-small', 'pine', 'pine-skinny', 'pine-small', 'pine-tall', 'pine', 'pine-wide'];
const ROCK_COUNT = 260;
// Each rock shape: its collision radius and how much it can be scaled.
const ROCK_SHAPES = {
  rock: { radius: 0.55, scale: [0.5, 1.6] },
  'rock-small': { radius: 0.25, scale: [0.7, 1.6] },
  'rock-flat': { radius: 0.7, scale: [0.7, 1.4] },
  'rock-tall': { radius: 0.35, scale: [0.7, 1.4] },
  'rock-large': { radius: 0.95, scale: [0.8, 1.4] },
};
// Rocks take their shape from this list in turn, so small ones are common and large ones rare.
const ROCK_MIX = ['rock', 'rock-small', 'rock-flat', 'rock-small', 'rock', 'rock-tall', 'rock-small', 'rock-large'];
const CRASH_CLEARING = 14; // keep this radius around the crash site (at 0, 0) free of trees
// The player starts about 20 m south of the wreck: just out of view, so you have to find it.
const SPAWN = { x: 0.5, z: 14 };
const SPAWN_CLEARING = 4;

// Builds the map from a seed: the same seed always gives the same world.
export function buildWorld(scene, seed) {
  const random = createRandom(seed);
  const noise = createNoise(seed + 1);

  const terrain = createTerrain(random, noise, GROUND_SIZE);
  scene.add(terrain.ground, terrain.water);

  // Obstacles are circles on the ground the player can't walk into: { x, z, radius }.
  const obstacles = [];
  const isFree = (x, z, spacing) =>
    Math.hypot(x, z) > CRASH_CLEARING &&
    Math.hypot(x - SPAWN.x, z - SPAWN.z) > SPAWN_CLEARING &&
    !terrain.nearWater(x, z, 2) &&
    obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + spacing);

  const place = (x, z, radius, scale) => {
    const obstacle = { x, z, radius: radius * scale };
    obstacles.push(obstacle);
    // Sink things slightly so they don't float on slopes.
    return { x, y: terrain.heightAt(x, z) - 0.1, z, rotation: random.range(0, Math.PI * 2), scale, obstacle };
  };

  const trees = new Trees(scene);

  // Dark spruce grow together in forests...
  const pines = Object.fromEntries(Object.keys(PINE_RADIUS).map((kind) => [kind, []]));
  let placedPines = 0;
  scatter(random, CONIFER_COUNT, (x, z) => {
    if (terrain.forest(x, z) < random.range(-0.15, 0.45) || !isFree(x, z, 1.4)) return null;
    const kind = PINE_MIX[placedPines++ % PINE_MIX.length];
    const pine = place(x, z, PINE_RADIUS[kind], random.range(0.8, 1.3));
    pines[kind].push(pine);
    return pine;
  });
  for (const [kind, spots] of Object.entries(pines)) trees.add(kind, placeholders.conifer(), spots);

  // ...while round leafy trees stand alone or in small groups out in the fields.
  const broadleaves = scatter(random, BROADLEAF_COUNT, (x, z) => {
    if (terrain.forest(x, z) > 0 || !isFree(x, z, 4)) return null;
    return place(x, z, 0.45, random.range(0.8, 1.25));
  });
  trees.add('broadleaf', placeholders.broadleaf(), broadleaves);

  // Boulders lie in clusters on rocky ground (and the odd one out in the grass). They're
  // bigger up the valley walls, and each is squashed or stretched a little differently.
  const rocks = Object.fromEntries(Object.keys(ROCK_SHAPES).map((name) => [name, []]));
  let placedRocks = 0;
  scatter(random, ROCK_COUNT, (x, z) => {
    if (terrain.groundAt(x, z).kind !== 'rock' && random.next() > 0.08) return null;
    if (!isFree(x, z, 0.3)) return null;
    const name = ROCK_MIX[placedRocks++ % ROCK_MIX.length];
    const shape = ROCK_SHAPES[name];
    const big = Math.max(Math.abs(x), Math.abs(z)) > 45 ? 1.6 : 1;
    const { y, rotation, scale } = place(x, z, shape.radius, random.range(...shape.scale) * big);
    const rock = transform(x, y, z, rotation, scale, [random.range(0.8, 1.5), random.range(0.6, 1.1), random.range(0.8, 1.3)]);
    rocks[name].push(rock);
    return rock;
  });
  for (const [name, transforms] of Object.entries(rocks)) {
    scene.add(instancedModel(name, placeholders.rock(), transforms));
  }

  const grass = createGrass(random, terrain, WORLD_SIZE + 10);
  scene.add(grass.mesh);

  return {
    terrain,
    obstacles,
    trees,
    grass,
    size: WORLD_SIZE,
    spawn: new THREE.Vector3(SPAWN.x, terrain.heightAt(SPAWN.x, SPAWN.z), SPAWN.z),
    update(dt, time) {
      grass.update(time);
      trees.update(dt);
    },
  };
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

// `stretch` optionally squashes or stretches it along each axis: [x, y, z].
function transform(x, y, z, rotation, scale, stretch = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
    new THREE.Vector3(scale * stretch[0], scale * stretch[1], scale * stretch[2]),
  );
}
