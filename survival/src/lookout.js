import * as THREE from 'three';
import { CRASH } from './crashTrail.js';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// A fire lookout tower (#90, #94): a tall timber tower on high ground that you can climb.
// Up in its cab are a supply crate (sometimes with a map of the area in it) and a ranger's
// locker to search.
export const LOOKOUT = {
  distance: [250, 550], // meters from the crash
  clearing: 11, // meters around it kept free of trees and rocks
  mapChance: 0.6, // how often the crate has a map in it
};

// The tower's walkable layout, in its own space: x and z across, y up from its foot. Four
// straight flights of stairs switch back and forth between landings, up to the cab. The last
// flight comes up through a hatch in the cab floor.
export const TOWER = {
  storey: 3, // meters each flight climbs
  flights: 4,
  stairEnd: 1.8, // the flights run from x = -1.8 to 1.8
  lane: 0.9, // each flight runs along z = ±0.9 (alternating)...
  laneHalf: 0.5, // ...and is 1 m wide
  landing: 2.5, // landings reach from the stairs' end out to here...
  landingHalf: 1.4, // ...and are 2.8 m wide
  cab: 3, // the cab is 6 m square
  cabFloor: 12,
  legSpread: 3, // meters from the middle to each leg, at the foot (they lean in as they rise)
};
const FLIGHTS = Array.from({ length: TOWER.flights }, (_, i) => ({
  z: i % 2 ? TOWER.lane : -TOWER.lane,
  from: i % 2 ? TOWER.stairEnd : -TOWER.stairEnd,
  to: i % 2 ? -TOWER.stairEnd : TOWER.stairEnd,
  y0: i * TOWER.storey,
}));

// What's up in the cab, in the tower's own space: [x, z, obstacle radius]. The crate and the
// locker can be searched.
const CAB = {
  fireFinder: [0, -1.4, 0.6], // the lookout's map table, for taking bearings on fires
  crate: [2.2, -2.3, 0.55],
  locker: [-2.45, -2.35, 0.5],
  cot: [[-2.3, 2.35, 0.45], [-1.5, 2.35, 0.45], [-0.7, 2.35, 0.45]],
};
const SEARCH_HEIGHT = 1.5; // you have to be about level with something to search it

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
    const out = x * Math.sign(flight.to);
    if (out >= TOWER.stairEnd && out <= TOWER.landing && Math.abs(z) <= TOWER.landingHalf) consider((i + 1) * TOWER.storey);
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

// World (x, z) to the tower's own space.
export function toTower(spot, x, z) {
  return rotate({ x: x - spot.x, z: z - spot.z }, -spot.heading);
}

// The tower's own space to world (x, z).
export function fromTower(spot, x, z) {
  const p = rotate({ x, z }, spot.heading);
  return { x: spot.x + p.x, z: spot.z + p.z };
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
    if (terrain.mountainAt(x, z) > 0.35 || terrain.nearWater(x, z, 12)) continue;
    const height = terrain.heightAt(x, z);
    if (!best || height > best.height) best = { x, z, height };
  }
  best ??= { x: CRASH.x + LOOKOUT.distance[0], z: CRASH.z };
  return { x: best.x, z: best.z, heading: random.range(0, Math.PI * 2), hasMap: random.next() < LOOKOUT.mapChance };
}

// The height of the tower's foot: the lowest ground under it, so the stairs start at (or
// below) the ground and you can always step onto them. (The legs reach down into it elsewhere.)
export function lookoutBase(spot, terrain) {
  const s = TOWER.legSpread;
  const under = [[0, 0], [-TOWER.stairEnd - 1, -TOWER.lane], [s, s], [s, -s], [-s, s], [-s, -s]];
  return Math.min(...under.map(([x, z]) => {
    const p = fromTower(spot, x, z);
    return terrain.heightAt(p.x, p.z);
  })) - 0.1;
}

// The circles the player can't walk through: the four legs (down on the ground), and the
// cab's walls and furniture (only up in the cab). `base` is the height of the tower's foot.
export function lookoutObstacles(spot, base) {
  const s = TOWER.legSpread;
  const legs = [[s, s], [s, -s], [-s, s], [-s, -s]].map(([x, z]) => ({
    ...fromTower(spot, x, z),
    radius: 0.4,
    below: base + 2, // up the stairs, you're above them
  }));
  const up = base + TOWER.cabFloor - 0.5;
  // A row of circles just outside each cab wall, so you can walk right up to the windows.
  const walls = [];
  const edge = TOWER.cab + 0.3;
  for (let t = -edge; t <= edge + 0.01; t += 0.5) {
    for (const [x, z] of [[t, edge], [t, -edge], [edge, t], [-edge, t]]) {
      walls.push({ ...fromTower(spot, x, z), radius: 0.3, above: up });
    }
  }
  const furniture = [CAB.fireFinder, CAB.crate, CAB.locker, ...CAB.cot].map(([x, z, radius]) => ({
    ...fromTower(spot, x, z),
    radius,
    above: up,
  }));
  return [...legs, ...walls, ...furniture];
}

// What the player can stand on and be inside of at the tower: see world.structures.
export function lookoutStructure(spot, base) {
  const near = (x, z) => Math.abs(x - spot.x) < TOWER.legSpread + 1 && Math.abs(z - spot.z) < TOWER.legSpread + 1;
  return {
    // The highest floor at (x, z) no higher than `maxY` (world heights), or -Infinity.
    floorAt(x, z, maxY) {
      if (!near(x, z)) return -Infinity;
      const p = toTower(spot, x, z);
      return base + towerFloorAt(p.x, p.z, maxY - base);
    },
    // True if (x, z) with feet at height `feet` is under the cab's roof.
    roofOver(x, z, feet) {
      if (!near(x, z)) return false;
      const p = toTower(spot, x, z);
      return insideCab(p.x, p.z, feet - base);
    },
  };
}

// Builds the tower and what's in its cab. Searching the crate and the locker works like a
// suitcase at the wreck.
export function buildLookout(scene, world) {
  const spot = world.lookout;
  const tower = new THREE.Group();
  tower.position.set(spot.x, spot.base, spot.z);
  tower.rotation.y = spot.heading;
  scene.add(tower);
  const structure = new THREE.Group(); // the tower itself (swapped for lookout.glb if it exists)
  structure.add(placeholders.lookoutTower(TOWER));
  tower.add(structure);
  world.grass.clear(spot.x, spot.z, TOWER.legSpread + 1.5);

  // The cab's furniture.
  const place = (object, [x, z], turn = 0) => {
    object.position.set(x, TOWER.cabFloor, z);
    object.rotation.y = turn;
    tower.add(object);
    return object;
  };
  place(placeholders.fireFinder(), CAB.fireFinder);
  place(placeholders.cot(), [-1.5, 2.35]);
  const crateObject = place(placeholders.supplyCrate(), CAB.crate, Math.PI);
  const lockerObject = place(placeholders.locker(), CAB.locker);

  const container = (label, [x, z], loot, object, note = null) => ({
    ...fromTower(spot, x, z),
    y: spot.base + TOWER.cabFloor,
    label,
    note,
    loot,
    object,
    searched: false,
  });
  const containers = [
    container(
      'the supply crate',
      CAB.crate,
      spot.hasMap ? [['map', 1], ['bandage', 2]] : [['bandage', 2], ['rope', 2]],
      crateObject,
      spot.hasMap ? 'a map of the area' : null,
    ),
    container("the ranger's locker", CAB.locker, [['torch', 2], ['rope', 2]], lockerObject),
  ];
  const setOpen = (c, open) => {
    c.searched = open;
    c.object.userData.open(open);
  };

  // While you're inside the cab, the roof fades away and so do the walls and windows on the
  // camera's side (a cutaway), so you can see in; the far walls and windows stay. They're the
  // stand-in's parts marked `userData.roof` / `userData.cutaway`, or lookout.glb's meshes with
  // "roof", or "wall" / "window", in their names.
  const GHOST = 0.12; // how much of a cut-away wall still shows
  let shown = 1; // 1: all there; 0: cut away
  let fading = [];
  const findCutaway = () => {
    fading = [];
    tower.updateMatrixWorld(true);
    const where = new THREE.Vector3();
    structure.traverse((child) => {
      if (!child.isMesh) return;
      const roof = child.userData.roof || /roof/i.test(child.name);
      const wall = child.userData.cutaway || /wall|window/i.test(child.name);
      if (!roof && !wall) return;
      // The camera always looks from the +z side, so walls on that side are in the way.
      child.getWorldPosition(where);
      if (!roof && where.z - spot.z < TOWER.cab * 0.4) return;
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.userData.opacity = child.material.opacity;
      fading.push({ mesh: child, hidden: roof ? 0 : GHOST });
    });
    shown = 1;
  };
  findCutaway();
  loadModel('lookout').then((model) => {
    if (!model) return;
    model.traverse((child) => (child.castShadow = child.receiveShadow = true));
    structure.clear();
    structure.add(model);
    findCutaway();
  });

  return {
    x: spot.x,
    z: spot.z,
    // Cuts the cab away while `inside` is true, and puts it back once you leave.
    update(dt, inside) {
      const target = inside ? 0 : 1;
      if (shown === target) return;
      shown = target > shown ? Math.min(target, shown + dt * 4) : Math.max(target, shown - dt * 4);
      for (const { mesh, hidden } of fading) {
        mesh.material.opacity = mesh.material.userData.opacity * (hidden + (1 - hidden) * shown);
        mesh.material.depthWrite = shown > 0.99;
      }
    },
    // Something to search within `reach` of (x, z), about level with your feet, if any.
    near(x, z, reach, feet) {
      let best = null;
      for (const c of containers) {
        const distance = Math.hypot(c.x - x, c.z - z);
        if (distance < reach && Math.abs(feet - c.y) < SEARCH_HEIGHT) [best, reach] = [c, distance];
      }
      return best;
    },
    // Opens it and returns what was inside.
    search(c) {
      setOpen(c, true);
      return c.loot;
    },
    // Closes everything up again, for a new game.
    reset() {
      for (const c of containers) setOpen(c, false);
    },
  };
}

function rotate({ x, z }, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c + z * s, z: -x * s + z * c };
}
