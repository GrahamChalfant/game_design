import * as THREE from 'three';
import { swappable } from './models.js';
import { ammoBox, woodenCupboard } from './poiModels.js';
import { caveEntrance, entranceRocks } from './caves.js';

// The fixed map's landmarks (see layout.js for where each stands), each a kind of place in
// pois.js: the observatory, the broken footbridge over the ravine, the blizzard shelter, the
// lakeshore cabin's dock, the farm's barn and the wolves' den. Their Blender models are made by
// blender/landmarks.py; the shapes here stand in until those load. Like the other places, each
// is laid out in its own space: x and z across, +z out of its front.
//
// For each: what you can't walk through, the floors you stand on, and which part is roofed
// (warm, and somewhere to sleep).

// Sizes, shared with blender/landmarks.py.
export const OBSERVATORY = {
  radius: 4.2, // the tower's
  wall: 4.4, // its height
  door: 0.75, // half the doorway's width (at the front, +z)
  terrace: { half: 5.6, from: 3.9, to: 10.5, height: 0.3 }, // the paved terrace out in front
  telescope: [0, 8.9], // the spyglass on the terrace, looking out (north)
  cupboard: [-2.6, -1.9],
};
export const BRIDGE = { half: 0.8, end: 4.4, reach: 7.6 }; // half its width; where each broken end stops and the deck reaches to
export const DOCK = { half: 1.1, length: 14 };
export const BARN = { half: [5, 7], wall: 4.2, door: 2.1 };
export const HUT = { half: [1.8, 2.1], wall: 2.0, door: 0.55, box: [-1.0, -1.4] };

// How much ground each keeps clear, and how far its floors reach (from its middle).
export const LANDMARKS = {
  observatory: { clearing: 12, reach: 12, model: 'observatory' },
  bridge: { clearing: 3, reach: 9, model: 'bridge-broken' },
  hut: { clearing: 4, reach: 3.5, model: 'stone-hut' },
  dock: { clearing: 2, reach: 16, model: 'dock' },
  barn: { clearing: 9, reach: 9, model: 'barn' },
  den: { clearing: 6, reach: 0, model: null },
};
export const isLandmark = (kind) => kind in LANDMARKS;

// The circles you can't walk through, given `at(x, z, radius, extra)` and `line(a, b, radius,
// extra)` (in the place's own space; see pois.js).
export function landmarkObstacles(poi, at, line) {
  if (poi.kind === 'observatory') {
    const { radius: R, door, terrace: t, telescope } = OBSERVATORY;
    const ring = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;
      if (z > 0 && Math.abs(x) < door + 0.2) continue; // the doorway
      ring.push(at(x, z, 0.32));
    }
    return [
      ...ring,
      at(0, 0, 0.75), // the telescope's pier
      ...line([-t.half, t.from], [-t.half, t.to], 0.1), // the terrace's railing
      ...line([t.half, t.from], [t.half, t.to], 0.1),
      ...line([-t.half, t.to], [t.half, t.to], 0.1),
      at(...telescope, 0.35),
      at(...OBSERVATORY.cupboard, 0.45),
    ];
  }
  if (poi.kind === 'bridge') {
    // Where each broken end stops: a rope barrier you can't step off past.
    const { half, end } = BRIDGE;
    return [...line([-half, end], [half, end], 0.2), ...line([-half, -end], [half, -end], 0.2)];
  }
  if (poi.kind === 'hut') {
    const [W, D] = HUT.half;
    return [
      ...line([-W, -D], [W, -D], 0.22),
      ...line([-W, -D], [-W, D], 0.22),
      ...line([W, -D], [W, D], 0.22),
      ...line([-W, D], [-HUT.door - 0.2, D], 0.22),
      ...line([HUT.door + 0.2, D], [W, D], 0.22),
      at(W - 0.55, 0.3, 0.32), // the stove
    ];
  }
  if (poi.kind === 'barn') {
    const [W, D] = BARN.half;
    return [
      ...line([-W, -D], [W, -D], 0.15),
      ...line([-W, -D], [-W, D], 0.15),
      ...line([W, -D], [W, D], 0.15),
      ...line([-W, D], [-BARN.door, D], 0.15),
      ...line([BARN.door, D], [W, D], 0.15),
      at(-3.6, -5.0, 0.7), at(3.7, -5.6, 0.55), // bales
    ];
  }
  if (poi.kind === 'den') return entranceRocks().map(([x, z, size]) => at(x, z, size * 0.9));
  return [];
}

// The floor's height (relative to the place's base) at (x, z) in its own space, or null.
export function landmarkFloor(poi, p) {
  if (poi.kind === 'observatory') {
    const { radius: R, terrace: t } = OBSERVATORY;
    if (Math.hypot(p.x, p.z) < R) return 0.11;
    if (Math.abs(p.x) < t.half && p.z > t.from - 0.4 && p.z < t.to) return t.height;
  }
  if (poi.kind === 'bridge') {
    const { half, end, reach } = BRIDGE;
    if (Math.abs(p.x) < half && Math.abs(p.z) > end - 0.3 && Math.abs(p.z) < reach) return 0;
  }
  if (poi.kind === 'dock') {
    if (Math.abs(p.x) < DOCK.half && p.z > -0.5 && p.z < DOCK.length) return 0;
  }
  return null;
}

// True if (x, z) in the place's own space is under its roof.
export function landmarkRoofed(poi, p) {
  if (poi.kind === 'observatory') return Math.hypot(p.x, p.z) < OBSERVATORY.radius - 0.2;
  if (poi.kind === 'hut') return Math.abs(p.x) < HUT.half[0] && Math.abs(p.z) < HUT.half[1];
  if (poi.kind === 'barn') return Math.abs(p.x) < BARN.half[0] && Math.abs(p.z) < BARN.half[1];
  return false;
}

// Builds the place's stand-in (swapped for its model once that loads: see pois.js), and adds
// what there is to search with `add(object, label, x, z, y, table, options)`.
export function buildLandmark(poi, random, add, groundAt) {
  const group = new THREE.Group();
  const flat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const box = (w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (poi.kind === 'observatory') {
    const { radius: R, wall, terrace: t } = OBSERVATORY;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(R, R, wall, 20), flat(0x7e7d76));
    tower.position.y = wall / 2;
    tower.name = 'observatory-wall';
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R + 0.25, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(0x5f8a78));
    dome.position.y = wall + 0.24;
    dome.name = 'observatory-roof';
    group.add(tower, dome);
    box(t.half * 2, t.height, t.to - t.from, 0x86806f, 0, t.height / 2, (t.from + t.to) / 2);
    const cupboard = woodenCupboard();
    cupboard.position.set(...[OBSERVATORY.cupboard[0], 0.11, OBSERVATORY.cupboard[1]]);
    cupboard.rotation.y = Math.atan2(-OBSERVATORY.cupboard[0], -OBSERVATORY.cupboard[1]);
    cupboard.userData.keep = true;
    group.add(cupboard);
    add(cupboard, "the astronomer's cupboard", ...OBSERVATORY.cupboard, poi.base + 0.11, 'observatory', { standing: true });
  } else if (poi.kind === 'bridge') {
    const { half, end, reach } = BRIDGE;
    for (const side of [1, -1]) box(half * 2, 0.08, reach - end, 0x8a8174, 0, -0.04, (side * (end + reach)) / 2);
  } else if (poi.kind === 'dock') {
    box(DOCK.half * 2, 0.08, DOCK.length, 0x8a8174, 0, -0.04, DOCK.length / 2);
  } else if (poi.kind === 'barn') {
    const [W, D] = BARN.half;
    const walls = box(W * 2, BARN.wall, D * 2, 0x8a3b2c, 0, BARN.wall / 2, 0);
    walls.name = 'barn-wall';
  } else if (poi.kind === 'hut') {
    const [W, D] = HUT.half;
    const walls = box(W * 2, HUT.wall, D * 2, 0x7e7d76, 0, HUT.wall / 2, 0);
    walls.name = 'stone-hut-wall';
    const supplies = ammoBox();
    supplies.position.set(HUT.box[0], 0.02, HUT.box[1]);
    supplies.userData.keep = true;
    group.add(supplies);
    add(supplies, 'the emergency box', ...HUT.box, poi.base, 'hut');
  } else if (poi.kind === 'den') {
    // The wolves' den: a hole under a rocky bank, with bones scattered in front of it.
    group.add(caveEntrance(random, groundAt));
    const bone = flat(0xd8cfbd);
    const bones = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 5).rotateZ(Math.PI / 2), bone);
      mesh.position.set(random.range(-1, 1), 0.05, random.range(0.5, 1.2));
      mesh.rotation.y = random.range(0, Math.PI);
      bones.add(mesh);
    }
    const remains = swappable('bones', bones);
    remains.position.set(0, groundAt(0, 2.6), 2.6);
    remains.userData.keep = true;
    group.add(remains);
  }
  return group;
}
