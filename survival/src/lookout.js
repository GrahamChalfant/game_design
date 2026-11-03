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

// The tower's walkable layout, in its own space: x and z across, y up from its foot. Four
// straight flights of stairs switch back and forth between landings, up to the cab. The last
// flight comes up through a hatch in the cab floor.
export const TOWER = {
  storey: 3, // meters each flight climbs
  flights: 4,
  stairEnd: 1.1, // the flights run from x = -1.1 to 1.1
  lane: 0.55, // each flight runs along z = ±0.55 (alternating)...
  laneHalf: 0.45, // ...and is 0.9 m wide
  landing: 1.65, // landings reach from the stairs' end out to here
  cab: 1.9, // the cab is 3.8 m square
  cabFloor: 12,
  legSpread: 2,
};
const FLIGHTS = Array.from({ length: TOWER.flights }, (_, i) => ({
  z: i % 2 ? TOWER.lane : -TOWER.lane,
  from: i % 2 ? TOWER.stairEnd : -TOWER.stairEnd,
  to: i % 2 ? -TOWER.stairEnd : TOWER.stairEnd,
  y0: i * TOWER.storey,
}));

// The highest floor (a stair, a landing or the cab floor) at (x, z) in the tower's own space
// that's no higher than `maxY`, or -Infinity if there's none.
export function towerFloorAt(x, z, maxY) {
  let best = -Infinity;
  const consider = (y) => {
    if (y <= maxY && y > best) best = y;
  };
  const inStairwell = (flight) =>
    Math.abs(z - flight.z) <= TOWER.laneHalf && x >= -TOWER.stairEnd && x <= TOWER.stairEnd;
  for (const flight of FLIGHTS) {
    if (!inStairwell(flight)) continue;
    consider(flight.y0 + ((x - flight.from) / (flight.to - flight.from)) * TOWER.storey);
  }
  // A landing at the top of every flight but the last, on the side it ends.
  FLIGHTS.slice(0, -1).forEach((flight, i) => {
    const side = Math.sign(flight.to);
    const out = x * side;
    if (out >= TOWER.stairEnd && out <= TOWER.landing && Math.abs(z) <= 1) consider((i + 1) * TOWER.storey);
  });
  // The cab floor, with a hatch where the last flight comes up.
  if (Math.abs(x) <= TOWER.cab && Math.abs(z) <= TOWER.cab && !inStairwell(FLIGHTS[FLIGHTS.length - 1])) {
    consider(TOWER.cabFloor);
  }
  return best;
}

// True if (x, z, at height `feet`) in the tower's own space is inside the cab.
export function insideCab(x, z, feet) {
  return Math.abs(x) <= TOWER.cab && Math.abs(z) <= TOWER.cab && feet >= TOWER.cabFloor - 0.5;
}

// World (x, z) to the tower's own space, and back.
export function toTower(spot, x, z) {
  return rotate({ x: x - spot.x, z: z - spot.z }, -spot.heading);
}

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

// The circles the player can't walk through: the four legs (down on the ground), the crate,
// and the cab's walls (only up in the cab). `base` is the height of the tower's foot.
export function lookoutObstacles({ x, z, heading, crate }, base) {
  const at = (local) => {
    const p = rotate(local, heading);
    return { x: x + p.x, z: z + p.z };
  };
  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({
    ...at({ x: sx * LOOKOUT.legSpread, z: sz * LOOKOUT.legSpread }),
    radius: 0.35,
    below: base + 2, // up the stairs, you're above them
  }));
  // A row of circles just outside each cab wall, so you can walk right up to the windows.
  const walls = [];
  const edge = TOWER.cab + 0.3;
  for (let t = -edge; t <= edge + 0.01; t += 0.5) {
    for (const [lx, lz] of [[t, edge], [t, -edge], [edge, t], [-edge, t]]) {
      walls.push({ ...at({ x: lx, z: lz }), radius: 0.3, above: base + TOWER.cabFloor - 0.5 });
    }
  }
  return [...legs, { x: crate.x, z: crate.z, radius: 0.6 }, ...walls];
}

// What the player can stand on and be inside of at the tower: see world.structures.
export function lookoutStructure(spot, base) {
  return {
    // The highest floor at (x, z) no higher than `maxY` (world heights), or -Infinity.
    floorAt(x, z, maxY) {
      if (Math.abs(x - spot.x) > 3 || Math.abs(z - spot.z) > 3) return -Infinity;
      const p = toTower(spot, x, z);
      return base + towerFloorAt(p.x, p.z, maxY - base);
    },
    // True if (x, z) with feet at height `feet` is under the cab's roof.
    roofOver(x, z, feet) {
      if (Math.abs(x - spot.x) > 3 || Math.abs(z - spot.z) > 3) return false;
      const p = toTower(spot, x, z);
      return insideCab(p.x, p.z, feet - base);
    },
  };
}

// Builds the tower and its crate. Searching the crate works like a suitcase at the wreck.
export function buildLookout(scene, world) {
  const spot = world.lookout;
  const tower = new THREE.Group();
  tower.add(placeholders.lookoutTower(TOWER));
  loadModel('lookout').then((model) => {
    if (!model) return;
    model.traverse((child) => (child.castShadow = child.receiveShadow = true));
    tower.clear();
    tower.add(model);
    findRoof();
  });
  tower.position.set(spot.x, spot.base, spot.z);
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

  // The cab's roof and windows fade away while you're inside, so you can see in. They're the
  // stand-in's parts marked `userData.roof`, or lookout.glb's meshes with "roof" in their name.
  let roofShown = 1;
  let roofParts = [];
  const findRoof = () => {
    roofParts = [];
    tower.traverse((child) => {
      if (!child.isMesh || !(child.userData.roof || /roof/i.test(child.name))) return;
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.userData.opacity = child.material.opacity;
      roofParts.push(child);
    });
    roofShown = 1;
  };
  findRoof();

  return {
    x: spot.x,
    z: spot.z,
    // Fades the roof out while `inside` is true, and back in once you leave.
    update(dt, inside) {
      const target = inside ? 0 : 1;
      if (roofShown === target) return;
      roofShown = target > roofShown ? Math.min(target, roofShown + dt * 4) : Math.max(target, roofShown - dt * 4);
      for (const part of roofParts) {
        part.material.opacity = part.material.userData.opacity * roofShown;
        part.material.depthWrite = roofShown > 0.99;
      }
    },
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
