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
// Half its width; where each broken end stops and the deck reaches to; and the rope barrier
// across the trail at each rim of the ravine (`rim` out from the middle, `across` either side),
// so you don't walk off the edge.
export const BRIDGE = { half: 0.8, end: 4.4, reach: 7.6, rim: 7.0, across: 4.6 };
export const DOCK = { half: 1.1, length: 14 };
export const BARN = { half: [5, 7], wall: 4.2, door: 2.1 };
export const HUT = { half: [1.8, 2.1], wall: 2.0, door: 0.55, box: [-1.0, -1.4] };
// The old timber road bridge over the river: its deck's half width and half length (along +z),
// and its railings either side.
export const ROAD_BRIDGE = { half: 2.3, length: 9, rail: 2.45 };
// The burnt cabin: what's left of its walls (a cabin's size: see CABIN in poiModels.js), the
// stone chimney still standing, and a tin box under the floorboards.
export const RUIN = { half: [2.75, 2.25], chimney: [1.9, -2.3], box: [-1.1, -0.6] };
// The trailhead's notice board (facing +z).
export const BOARD = { half: 0.9 };
// What the board says.
const TRAIL_NOTE = 'A notice board, the paint flaking: "PASS TRAIL. Over the mountains to the lake, 4 km. Blizzard shelter above the ravine. Footbridge over the ravine CLOSED. The observatory on the saddle keeps emergency supplies. Waterfall 100 m west."';
// The cabins that aren't plain log cabins (see pois.js): their Blender models, and the circles
// you can't walk through round them outside ([x, z, radius] in the cabin's own space).
export const CABIN_STYLES = {
  // The fisherman's shack: tin-roofed, a rowboat upturned beside it, a drying rack behind.
  shack: { model: 'cabin-shack', outside: [[-4.4, -0.6, 0.6], [-4.4, 0.5, 0.6], [-4.4, 1.6, 0.6], [-1.2, -3.6, 0.12], [1.2, -3.6, 0.12]] },
  // The homestead: a clapboard farmhouse, a half-fallen shed, and a stone well.
  homestead: { model: 'cabin-homestead', outside: [[6.2, -1.6, 1.0], [6.2, -0.2, 1.0], [7.0, -0.9, 1.0], [-5.0, 3.4, 0.75]], well: [-5.0, 3.4] },
  // The hunter's cabin: logs, antlers over the door, a smokehouse out back.
  hunter: { model: 'cabin-hunter', outside: [[-4.9, -1.4, 1.05]] },
};

// How much ground each keeps clear, and how far its floors reach (from its middle).
export const LANDMARKS = {
  observatory: { clearing: 12, reach: 12, model: 'observatory' },
  bridge: { clearing: 3, reach: 9, model: 'bridge-broken' },
  hut: { clearing: 4, reach: 3.5, model: 'stone-hut' },
  dock: { clearing: 2, reach: 16, model: 'dock' },
  barn: { clearing: 9, reach: 9, model: 'barn' },
  den: { clearing: 6, reach: 0, model: null },
  roadbridge: { clearing: 4, reach: 10, model: 'road-bridge' },
  ruin: { clearing: 7, reach: 0, model: 'cabin-burnt' },
  board: { clearing: 2, reach: 0, model: 'notice-board' },
  falls: { clearing: 9, reach: 0, model: 'waterfall' },
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
    // A rope barrier across the trail at each rim, before the ground falls away into the
    // ravine. (Only up at the trail's level: down in the ravine, it's no wall.)
    const { across } = BRIDGE;
    const rim = poi.rim ?? BRIDGE.rim;
    const extra = { above: poi.base - 5 }; // (well above the ravine floor, below the trail on either side)
    return [...line([-across, rim], [across, rim], 0.2, extra), ...line([-across, -rim], [across, -rim], 0.2, extra)];
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
  if (poi.kind === 'roadbridge') {
    // The railings, up on the deck (you can wade under the bridge).
    const { rail, length } = ROAD_BRIDGE;
    const extra = { above: poi.base - 1 };
    return [...line([-rail, -length], [-rail, length], 0.12, extra), ...line([rail, -length], [rail, length], 0.12, extra)];
  }
  if (poi.kind === 'ruin') {
    // The back wall and one side still stand waist-high; the chimney.
    const [W, D] = RUIN.half;
    return [...line([-W, -D], [W - 1.5, -D], 0.2), ...line([-W, -D], [-W, D - 1], 0.2), at(...RUIN.chimney, 0.6)];
  }
  if (poi.kind === 'board') return [at(-BOARD.half, 0, 0.1), at(BOARD.half, 0, 0.1)];
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
  if (poi.kind === 'roadbridge') {
    if (Math.abs(p.x) < ROAD_BRIDGE.rail && Math.abs(p.z) < ROAD_BRIDGE.length) return 0;
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
    const { half, end, reach, across } = BRIDGE;
    const rim = poi.rim ?? BRIDGE.rim;
    for (const side of [1, -1]) box(half * 2, 0.08, reach - end, 0x8a8174, 0, -0.04, (side * (end + reach)) / 2);
    // The rope barriers at the rims: stakes driven in across the trail, a rope strung along them.
    const stake = flat(0x5d4a3a);
    const rope = flat(0xa8946a);
    const barrier = new THREE.Group();
    barrier.userData.keep = true; // (stays when the bridge's model swaps in)
    for (const side of [1, -1]) {
      for (const x of [-across, -across / 2, across / 2, across]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6), stake);
        post.position.set(x, groundAt(x, side * rim) + 0.45, side * rim);
        barrier.add(post);
      }
      for (const [a, b] of [[-across, -across / 2], [-across / 2, across / 2], [across / 2, across]]) {
        const ya = groundAt(a, side * rim) + 0.85;
        const yb = groundAt(b, side * rim) + 0.85;
        const length = Math.hypot(b - a, yb - ya);
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, length, 5), rope);
        strand.position.set((a + b) / 2, (ya + yb) / 2 - 0.06, side * rim);
        strand.rotation.z = Math.PI / 2 - Math.atan2(yb - ya, b - a);
        barrier.add(strand);
      }
    }
    group.add(barrier);
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
  } else if (poi.kind === 'roadbridge') {
    const { half, length, rail } = ROAD_BRIDGE;
    box(half * 2, 0.2, length * 2, 0x7a6a58, 0, -0.1, 0);
    for (const side of [-1, 1]) box(0.15, 0.9, length * 2, 0x6a5a48, side * rail, 0.45, 0);
  } else if (poi.kind === 'ruin') {
    const [W, D] = RUIN.half;
    box(W * 2 - 1.5, 0.9, 0.3, 0x2b2622, -0.75, 0.45, -D);
    box(0.3, 0.7, D * 2 - 1, 0x2b2622, -W, 0.35, -0.5);
    box(1.0, 4.2, 1.0, 0x6d6862, ...[RUIN.chimney[0], 2.1, RUIN.chimney[1]]);
    const tin = ammoBox();
    tin.position.set(RUIN.box[0], groundAt(...RUIN.box) + 0.02, RUIN.box[1]);
    tin.userData.keep = true;
    group.add(tin);
    add(tin, 'the scorched tin box', ...RUIN.box, poi.base + groundAt(...RUIN.box), 'ruin');
  } else if (poi.kind === 'board') {
    box(BOARD.half * 2, 1.0, 0.08, 0x7a6550, 0, 1.4, 0);
    for (const side of [-1, 1]) box(0.12, 2.0, 0.12, 0x5d4a3a, side * BOARD.half, 1.0, -0.06);
    add({ userData: { open() {} } }, 'the notice board', 0, 0.6, poi.base, 'board', { standing: true, read: TRAIL_NOTE });
  } else if (poi.kind === 'falls') {
    group.add(waterfallStandIn(poi.drop ?? 9));
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

// A stand-in for the waterfall (until waterfall.glb loads): a sheet of falling water from the
// rock step's lip down into the pool, `drop` meters, facing +z.
function waterfallStandIn(drop) {
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(4, drop, 1, 8), fallingWater());
  sheet.name = 'waterfall-water';
  sheet.position.set(0, drop / 2, 0.6);
  return sheet;
}

// Falling water, for the waterfall's sheet ("waterfall-water", its uv's v running up it) and the
// foam where it hits the pool ("waterfall-foam"): white streaks rushing down it (or churning
// out across the foam), see-through between them. `fallsClock.value` is the time (see pois.js).
export const fallsClock = { value: 0 };
export function fallingWater(foam = false) {
  const material = new THREE.MeshStandardMaterial({ color: 0xe4eef0, roughness: 0.35, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  material.defines = { USE_UV: '', ...(foam ? { FOAM: '' } : {}) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = fallsClock;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        float fallHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fallNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fallHash(i), fallHash(i + vec2(1.0, 0.0)), f.x), mix(fallHash(i + vec2(0.0, 1.0)), fallHash(i + 1.0), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef FOAM
          vec2 q = vec2(vUv.x * 9.0, vUv.y * 5.0 - uTime * 0.6);
          float streak = fallNoise(q) * 0.6 + fallNoise(q * 2.3 + 7.0) * 0.4;
          float edge = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          diffuseColor.a *= smoothstep(0.35, 0.75, streak) * edge * 0.85;
        #else
          vec2 q = vec2(vUv.x * 14.0, vUv.y * 3.0 + uTime * 2.6);
          float streak = fallNoise(q) * 0.65 + fallNoise(q * vec2(2.0, 3.1) + 3.0) * 0.35;
          diffuseColor.rgb *= 0.82 + 0.25 * streak;
          diffuseColor.a *= mix(0.35, 0.95, smoothstep(0.3, 0.7, streak)) * smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
        #endif`);
  };
  return material;
}
