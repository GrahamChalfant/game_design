import * as THREE from 'three';
import { Cutaway } from './cutaway.js';
import { loadModel, swappable } from './models.js';
import * as placeholders from './placeholders.js';

// A fire lookout tower (#90, #94): a tall timber tower on its hill north-east of the crash (see
// layout.js) that you can climb. Up in its cab are a supply crate with a map of the area in it,
// and a ranger's locker to search, with a note pointing you on to the observatory.
export const LOOKOUT = {
  clearing: 11, // meters around it kept free of trees and rocks
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
  cab: 3, // the cab is 6 m square...
  balcony: 4.5, // ...with a balcony all round it, out to here (1.5 m wide)
  door: 0.6, // a doorway in the cab's +x wall, from z = -0.6 to 0.6, out onto the balcony
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
  binoculars: [4.35, 1.9, 0.12], // out on the balcony, on a pole against the railing (room to walk past)
};
const BINOCULAR_REACH = 1.3; // how close you need to be to look through them
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
  // The cab floor and the balcony round it, with a hatch where the last flight comes up.
  if (Math.abs(x) <= TOWER.balcony && Math.abs(z) <= TOWER.balcony && !inStairwell(FLIGHTS[FLIGHTS.length - 1])) {
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
// The note pinned inside the ranger's locker.
const RANGER_NOTE = "A note in the ranger's hand: \"Supplies are up at the observatory, by the pass over the mountains: take the old trail north through the foothills. The footbridge over the ravine is out. From the terrace you can see down to the lake cabin.\"";

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
  // Rows of small circles along the cab's walls (with a gap for the doorway) and the
  // balcony's railing, so you can walk up to the windows on either side, and to the rail.
  const walls = [];
  const line = (edge, gap = null) => {
    for (let t = -edge; t <= edge + 0.01; t += 0.4) {
      for (const [x, z] of [[t, edge], [t, -edge], [edge, t], [-edge, t]]) {
        if (gap && x === edge && Math.abs(t) < gap) continue; // the doorway
        walls.push({ ...fromTower(spot, x, z), radius: 0.15, above: up });
      }
    }
  };
  line(TOWER.cab, TOWER.door + 0.15);
  line(TOWER.balcony + 0.1);
  const furniture = [CAB.fireFinder, CAB.crate, CAB.locker, ...CAB.cot, CAB.binoculars].map(([x, z, radius]) => ({
    ...fromTower(spot, x, z),
    radius,
    above: up,
  }));
  return [...legs, ...walls, ...furniture];
}

// What the player can stand on and be inside of at the tower: see world.structures.
export function lookoutStructure(spot, base) {
  const reach = TOWER.balcony + 0.5;
  const near = (x, z) => Math.abs(x - spot.x) < reach && Math.abs(z - spot.z) < reach;
  return {
    // The highest floor at (x, z) no higher than `maxY` (world heights), or -Infinity.
    floorAt(x, z, maxY) {
      if (!near(x, z)) return -Infinity;
      const p = toTower(spot, x, z);
      return base + towerFloorAt(p.x, p.z, maxY - base);
    },
    // True if (x, z) with feet at height `feet` is inside the cab (the camera moves in closer).
    roofOver(x, z, feet) {
      if (!near(x, z)) return false;
      const p = toTower(spot, x, z);
      return insideCab(p.x, p.z, feet - base);
    },
  };
}

// The note in the old west tower's locker.
const OLD_NOTE = `A logbook, the last page: "Closing this tower for good. The new one on the east hill has the better view. Smoke seen over the west foothills last week: the old cabin out there burned. The county road's bridge is sagging. Don't trust it with a truck."`;

// Builds both towers (see world.lookouts), as one thing to ask: what's in reach, which
// binoculars you're at, and so on.
export function buildLookouts(scene, world) {
  const towers = world.lookouts.map((spot) => buildLookout(scene, world, spot));
  const combined = {
    all: towers,
    x: towers[0].x,
    z: towers[0].z,
    // Whichever tower's binoculars you were last at.
    binoculars: towers[0].binoculars,
    look: towers[0].look,
    update(...args) {
      for (const tower of towers) tower.update(...args);
    },
    binocularsNear(x, z, feet) {
      const tower = towers.find((t) => t.binocularsNear(x, z, feet));
      if (tower) Object.assign(combined, { binoculars: tower.binoculars, look: tower.look, x: tower.x, z: tower.z });
      return Boolean(tower);
    },
    near(x, z, reach, feet) {
      for (const tower of towers) {
        const found = tower.near(x, z, reach, feet);
        if (found) {
          combined.searching = tower;
          return found;
        }
      }
      return null;
    },
    search(c) {
      return (towers.find((t) => t.owns(c)) ?? towers[0]).search(c);
    },
    reset() {
      for (const tower of towers) tower.reset();
    },
  };
  return combined;
}

// Builds the tower and what's in its cab. Searching the crate and the locker works like a
// suitcase at the wreck.
export function buildLookout(scene, world, spot = world.lookout) {
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
  place(swappable('fire-finder', placeholders.fireFinder()), CAB.fireFinder);
  place(swappable('cot', placeholders.cot()), [-1.5, 2.35]);
  // Binoculars on a pole at the balcony rail, looking out (+x).
  place(swappable('binoculars', placeholders.mountedBinoculars()), CAB.binoculars);
  const binoculars = { ...fromTower(spot, CAB.binoculars[0], CAB.binoculars[1]), y: spot.base + TOWER.cabFloor };
  const outward = fromTower(spot, 1, 0); // they look out along the tower's +x
  const crateObject = place(swappable('supply-crate', placeholders.supplyCrate(), [{ node: 'supply-crate-lid', axis: 'x', angle: -1.9 }]), CAB.crate, Math.PI);
  const lockerObject = place(swappable('locker', placeholders.locker(), [{ node: 'locker-door', axis: 'y', angle: -1.9 }]), CAB.locker);

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
    // (The ranger's note points you on north: the way over the mountains, and what's beyond.)
    spot.old
      ? { ...container("the ranger's locker", CAB.locker, [['matches', 4], ['bandage', 1]], lockerObject, "an old logbook"), standing: true, read: OLD_NOTE }
      : { ...container("the ranger's locker", CAB.locker, [['torch', 2], ['rope', 2]], lockerObject, "the ranger's note"), standing: true, read: RANGER_NOTE }, // searched standing up
  ];
  const setOpen = (c, open) => {
    c.searched = open;
    c.object.userData.open(open);
  };

  // Whatever part of the tower is between the camera and the player fades (see cutaway.js).
  // (The railing never fades.)
  const cutaway = new Cutaway(structure);
  // (The old tower: weathered grey, a pane or two out, if its model exists; else the usual one.)
  (spot.old ? loadModel('lookout-old').then((model) => model ?? loadModel('lookout')) : loadModel('lookout')).then((model) => {
    if (!model) return;
    model.traverse((child) => (child.castShadow = child.receiveShadow = true));
    structure.clear();
    structure.add(model);
    cutaway.refresh();
  });

  return {
    x: spot.x,
    z: spot.z,
    // Fades whatever is between the camera and the player. Pass no camera (e.g. while looking
    // through the binoculars) to bring everything back.
    update(dt, camera, feet, position) {
      const close = Boolean(position) && Math.hypot(position.x - spot.x, position.z - spot.z) < TOWER.balcony + 6;
      cutaway.update(dt, camera, feet, position, close);
    },
    // Where the binoculars are, and which way they look (a unit vector on the ground).
    binoculars,
    look: { x: outward.x - spot.x, z: outward.z - spot.z },
    // True if the binoculars are within reach of (x, z), about level with your feet.
    binocularsNear(x, z, feet) {
      return Math.hypot(binoculars.x - x, binoculars.z - z) < BINOCULAR_REACH && Math.abs(feet - binoculars.y) < SEARCH_HEIGHT;
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
    owns(c) {
      return containers.includes(c);
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
