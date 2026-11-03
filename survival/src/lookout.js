import * as THREE from 'three';
import { CRASH } from './crashTrail.js';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// A fire lookout tower (#90, #94): a tall timber tower on high ground, with a supply crate
// at its foot. Sometimes the crate holds a map of the area.
export const LOOKOUT = {
  distance: [250, 550], // meters from the crash
  clearing: 9, // meters around it kept free of trees and rocks
  legSpread: 2, // meters from the middle to each leg, at the foot
  mapChance: 0.6, // how often the crate has a map in it
};
const CRATE = { x: 3.2, z: 1.2 }; // where the crate sits, next to the tower (turned with it)

// Where the tower stands: the highest dry ground found in a ring around the crash, below the
// snowy peaks. Returns { x, z, heading, hasMap }.
export function chooseLookout(random, terrain, worldSize) {
  const half = worldSize / 2 - 30;
  let best = null;
  for (let tries = 0; tries < 400; tries++) {
    const angle = random.range(0, Math.PI * 2);
    const distance = random.range(...LOOKOUT.distance);
    const x = CRASH.x + Math.cos(angle) * distance;
    const z = CRASH.z + Math.sin(angle) * distance;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    if (terrain.mountainAt(x, z) > 0.35 || terrain.nearWater(x, z, 10)) continue;
    const height = terrain.heightAt(x, z);
    if (!best || height > best.height) best = { x, z, height };
  }
  best ??= { x: CRASH.x + LOOKOUT.distance[0], z: CRASH.z };
  const heading = random.range(0, Math.PI * 2);
  const crate = rotate(CRATE, heading);
  return {
    x: best.x,
    z: best.z,
    heading,
    hasMap: random.next() < LOOKOUT.mapChance,
    crate: { x: best.x + crate.x, z: best.z + crate.z },
  };
}

// The circles the player can't walk through: the four legs and the crate.
export function lookoutObstacles({ x, z, heading, crate }) {
  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
    const leg = rotate({ x: sx * LOOKOUT.legSpread, z: sz * LOOKOUT.legSpread }, heading);
    return { x: x + leg.x, z: z + leg.z, radius: 0.35 };
  });
  return [...legs, { x: crate.x, z: crate.z, radius: 0.6 }];
}

// Builds the tower and its crate. Searching the crate works like a suitcase at the wreck.
export function buildLookout(scene, world) {
  const spot = world.lookout;
  const ground = world.terrain.heightAt(spot.x, spot.z);
  const tower = new THREE.Group();
  tower.add(placeholders.lookoutTower());
  loadModel('lookout').then((model) => {
    if (!model) return;
    model.traverse((child) => (child.castShadow = child.receiveShadow = true));
    tower.clear();
    tower.add(model);
  });
  tower.position.set(spot.x, ground - 0.1, spot.z);
  tower.rotation.y = spot.heading;
  scene.add(tower);

  const crateObject = placeholders.supplyCrate();
  crateObject.position.set(spot.crate.x, world.terrain.heightAt(spot.crate.x, spot.crate.z), spot.crate.z);
  crateObject.rotation.y = spot.heading;
  scene.add(crateObject);
  world.grass.clear(spot.x, spot.z, 4);
  world.grass.clear(spot.crate.x, spot.crate.z, 1);

  const loot = spot.hasMap
    ? [['map', 1], ['bandage', 2], ['rope', 2]]
    : [['bandage', 2], ['rope', 2], ['torch', 2]];
  const crate = {
    x: spot.crate.x,
    z: spot.crate.z,
    label: 'the supply crate',
    note: spot.hasMap ? 'a map of the area' : null,
    loot,
    searched: false,
    object: crateObject,
  };
  const setOpen = (open) => {
    crate.searched = open;
    crateObject.userData.lid.rotation.x = open ? -1.9 : 0;
  };

  return {
    x: spot.x,
    z: spot.z,
    // The crate, if it's within `reach` of (x, z).
    near(x, z, reach) {
      return Math.hypot(crate.x - x, crate.z - z) < reach ? crate : null;
    },
    // Opens the crate and returns what was inside.
    search() {
      setOpen(true);
      return crate.loot;
    },
    // Closes it up again, for a new game.
    reset() {
      setOpen(false);
    },
  };
}

function rotate({ x, z }, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c + z * s, z: -x * s + z * c };
}
