import * as THREE from 'three';
import { createGrass } from './grass.js';
import { instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { createNoise, createRandom } from './random.js';
import { createTerrain } from './terrain.js';

export const WORLD_SIZE = 140; // meters across; the playable area is a square centred on 0,0
const GROUND_SIZE = WORLD_SIZE + 80; // the ground continues past the edge into the haze
const CONIFER_COUNT = 260;
const BROADLEAF_COUNT = 45;
const ROCK_COUNT = 40;
const SPAWN_CLEARING = 7; // keep this radius around the start free of trees

// Builds the map from a seed: the same seed always gives the same world.
export function buildWorld(scene, seed) {
  const random = createRandom(seed);
  const noise = createNoise(seed + 1);

  const terrain = createTerrain(random, noise, GROUND_SIZE);
  scene.add(terrain.ground, terrain.water);

  // Obstacles are circles on the ground the player can't walk into: { x, z, radius }.
  const obstacles = [];
  const isFree = (x, z, spacing) =>
    Math.hypot(x, z) > SPAWN_CLEARING &&
    !terrain.nearLake(x, z, 2) &&
    obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + spacing);

  const place = (x, z, radius, scale) => {
    obstacles.push({ x, z, radius: radius * scale });
    // Sink things slightly so they don't float on slopes.
    return transform(x, terrain.heightAt(x, z) - 0.1, z, random.range(0, Math.PI * 2), scale);
  };

  // Tall conifers grow together in forests...
  const conifers = scatter(random, CONIFER_COUNT, (x, z) => {
    if (terrain.forest(x, z) < random.range(-0.15, 0.45) || !isFree(x, z, 1.4)) return null;
    return place(x, z, 0.5, random.range(0.8, 1.3));
  });
  scene.add(instancedModel('pine', placeholders.conifer(), conifers));

  // ...while round leafy trees stand alone or in small groups out in the fields.
  const broadleaves = scatter(random, BROADLEAF_COUNT, (x, z) => {
    if (terrain.forest(x, z) > 0 || !isFree(x, z, 4)) return null;
    return place(x, z, 0.45, random.range(0.8, 1.25));
  });
  scene.add(instancedModel('broadleaf', placeholders.broadleaf(), broadleaves));

  const rocks = scatter(random, ROCK_COUNT, (x, z) => {
    if (!isFree(x, z, 1)) return null;
    return place(x, z, 0.55, random.range(0.6, 1.8));
  });
  scene.add(instancedModel('rock', placeholders.rock(), rocks));

  const grass = createGrass(random, terrain, WORLD_SIZE + 10);
  scene.add(grass.mesh);

  return {
    terrain,
    obstacles,
    spawn: new THREE.Vector3(0, terrain.heightAt(0, 0), 0),
    update: (time) => grass.update(time),
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

function transform(x, y, z, rotation, scale) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
    new THREE.Vector3(scale, scale, scale),
  );
}
