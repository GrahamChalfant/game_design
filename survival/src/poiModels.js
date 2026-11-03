import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cot } from './placeholders.js';
import { swappable } from './models.js';

// Stand-in models for the places to find around the map (see pois.js): abandoned log cabins
// and hunters' tree stands. (Caves are in caves.js.) Each is built in its own space: x and z
// across, +z out of the front (the cabin's door, the cave's mouth, the stand's ladder).
// Parts marked `userData.roof` / `cutaway` fade when they're between the camera and the
// player (see cutaway.js). Sizes are shared with pois.js through the layouts below.

export const CABIN = {
  halfWidth: 2.6, // inside, along x
  halfDepth: 2.1, // inside, along z
  wall: 0.15, // half a log's thickness: wall lines run just outside the room
  door: 0.55, // the doorway in the front wall runs from x = -0.55 to 0.55
  wallHeight: 2.2,
  peak: 3.5, // the roof ridge, along x
  eave: 2.05, // where the roof ends, out past the front and back walls
};


export const STAND = {
  height: 3, // the platform's top
  half: 1.1, // the platform is 2.2 m square
  ladderFoot: 2.6, // the ladder reaches the ground at z = 2.6...
  ladderHalf: 0.42, // ...and is 0.84 m wide
  box: [-0.6, -0.55], // where the ammo box sits on the platform
};

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options });
const LOG = mat(0x6e5238);
const LOG_DARK = mat(0x58412d);
const PLANK = mat(0x7d6243);
const SHINGLE = mat(0x4a4139);
const MOSS = mat(0x58653a);
const IRON = mat(0x2e2c2a, { roughness: 0.6 });
const ROCK = mat(0x77726a, { flatShading: true, side: THREE.DoubleSide });
const ROCK_DARK = mat(0x5e5a54, { flatShading: true });
const CLOTH = mat(0x7a3a2a);
const CAMO = mat(0x4d5a3a, { side: THREE.DoubleSide });

const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
};

// A beam (square) or pole (round) from a to b.
function beam(a, b, width, material, round = false) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const length = from.distanceTo(to);
  const geometry = round ? new THREE.CylinderGeometry(width / 2, width / 2, length, 7) : new THREE.BoxGeometry(width, length, width);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
}

function shadows(group) {
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = child.receiveShadow = true;
  });
  return group;
}

// ---------------------------------------------------------------------------------------
// An abandoned log cabin. Origin on the middle of its floor. `random` varies the wear: a
// hole in the roof, moss, a tipped-over chair. Returns the group, with `userData.cupboard`
// and `userData.chest` (each with `userData.open(open)`) to search.
export function cabin(random) {
  const { halfWidth: W, halfDepth: D, wall, door, wallHeight, peak, eave } = CABIN;
  const group = new THREE.Group();
  const LOG_R = 0.14;
  const ROW = 0.27;
  const overhang = 0.35; // log ends stick out past the corners

  // Log walls: one merged mesh per wall, so each fades as a whole. Logs are horizontal
  // cylinders; the doorway and windows are gaps in them.
  const logAlong = (axis, from, to, y, at) => {
    const length = to - from;
    const geometry = new THREE.CylinderGeometry(LOG_R, LOG_R * 1.05, length, 7);
    if (axis === 'x') geometry.rotateZ(Math.PI / 2).translate(from + length / 2, y, at);
    else geometry.rotateX(Math.PI / 2).translate(at, y, from + length / 2);
    const shade = 0.82 + random.next() * 0.3;
    const color = new THREE.Color(0x6e5238).multiplyScalar(shade);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry.toNonIndexed();
  };
  const wallMesh = (pieces) => {
    const mesh = new THREE.Mesh(mergeGeometries(pieces), mat(0xffffff, { vertexColors: true }));
    mesh.userData.cutaway = true;
    group.add(mesh);
  };
  // Splits [from, to] around the gaps ([a, b] pairs) that apply at this height.
  const spans = (from, to, gaps) => {
    const out = [];
    let start = from;
    for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) {
      if (a > start) out.push([start, a]);
      start = Math.max(start, b);
    }
    if (to > start) out.push([start, to]);
    return out;
  };
  const front = [];
  const back = [];
  const left = [];
  const right = [];
  for (let y = -0.15; y < wallHeight; y += ROW) {
    const x0 = -W - wall - overhang;
    const x1 = W + wall + overhang;
    const z0 = -D - wall - overhang;
    const z1 = D + wall + overhang;
    // Front (+z): the doorway, up to 1.95 m.
    for (const [a, b] of spans(x0, x1, y < 1.95 ? [[-door, door]] : [])) front.push(logAlong('x', a, b, y, D + wall));
    // Back (-z): a window from x = 0.5 to 1.6.
    for (const [a, b] of spans(x0, x1, y > 0.85 && y < 1.6 ? [[0.5, 1.6]] : [])) back.push(logAlong('x', a, b, y, -D - wall));
    // Sides (half a row higher, as logs interlock at the corners). A window on the right (+x).
    const ys = y + ROW / 2;
    for (const [a, b] of spans(z0, z1, [])) left.push(logAlong('z', a, b, ys, -W - wall));
    for (const [a, b] of spans(z0, z1, ys > 0.85 && ys < 1.6 ? [[-0.6, 0.5]] : [])) right.push(logAlong('z', a, b, ys, W + wall));
  }
  // Gable ends on the sides: shorter and shorter logs up to the ridge.
  for (let y = wallHeight + ROW / 2; y < peak - 0.2; y += ROW) {
    const half = (D + wall) * (1 - (y - wallHeight) / (peak - wallHeight));
    left.push(logAlong('z', -half, half, y, -W - wall));
    right.push(logAlong('z', -half, half, y, W + wall));
  }
  [front, back, left, right].forEach(wallMesh);

  // The roof: two sloping slabs from the ridge out past the front and back walls. Some
  // cabins have a hole where the shingles have rotted away.
  const run = D + wall + 0.55;
  const rise = peak - eave;
  const slope = Math.atan2(rise, run);
  const slabLength = Math.hypot(run, rise);
  const roofWidth = 2 * (W + wall + 0.55);
  const holed = random.next() < 0.5;
  for (const side of [1, -1]) {
    const slab = new THREE.Group();
    slab.position.set(0, (peak + eave) / 2 + 0.08, (side * run) / 2);
    slab.rotation.x = side * slope;
    const pieces = holed && side === 1
      ? [[-roofWidth / 2, -0.4], [0.9, roofWidth / 2]] // a gap from x = -0.4 to 0.9
      : [[-roofWidth / 2, roofWidth / 2]];
    for (const [a, b] of pieces) {
      const shingles = box(b - a, 0.12, slabLength, SHINGLE, (a + b) / 2, 0, 0);
      shingles.userData.roof = true;
      slab.add(shingles);
    }
    if (holed && side === 1) {
      // The bare rafters across the hole.
      for (const x of [-0.1, 0.4]) {
        const rafter = box(0.1, 0.1, slabLength, LOG_DARK, x, -0.05, 0);
        rafter.userData.roof = true;
        slab.add(rafter);
      }
    }
    // Moss on the old shingles.
    for (let i = 0; i < 3; i++) {
      const x = random.range(-roofWidth / 2 + 0.6, roofWidth / 2 - 0.6);
      if (holed && side === 1 && x > -0.7 && x < 1.2) continue;
      const patch = box(random.range(0.5, 1.2), 0.04, random.range(0.4, 0.9), MOSS, x, 0.07, random.range(-slabLength / 3, slabLength / 3));
      patch.userData.roof = true;
      slab.add(patch);
    }
    group.add(slab);
  }
  const ridge = box(roofWidth, 0.16, 0.16, LOG_DARK, 0, peak + 0.12, 0);
  ridge.userData.roof = true;
  group.add(ridge);

  // Floorboards, corner stones under the floor, and a step up to the door.
  group.add(box(2 * W + 0.2, 0.12, 2 * D + 0.2, PLANK, 0, -0.06, 0));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    group.add(box(0.5, 1.1, 0.5, ROCK_DARK, sx * (W + wall), -0.7, sz * (D + wall)));
  }
  group.add(box(1.5, 0.1, 0.7, PLANK, 0, -0.3, D + wall + 0.45));
  group.add(box(1.5, 0.35, 0.12, LOG_DARK, 0, -0.5, D + wall + 0.75));

  // The door, hanging open into the room.
  const hinge = new THREE.Group();
  hinge.position.set(-door, 0, D + wall);
  const leaf = box(door * 2 - 0.05, 1.9, 0.06, LOG_DARK, door - 0.02, 0.95, 0);
  leaf.userData.cutaway = true;
  hinge.add(leaf);
  hinge.rotation.y = -1.3 - random.next() * 0.4;
  group.add(hinge);

  // Inside: a bed, a wood stove (its pipe up through the roof), a table and chairs, a rug,
  // a cupboard and a chest to search.
  const bed = cot();
  bed.position.set(-1.4, 0, -1.55);
  group.add(bed);
  const stove = new THREE.Group();
  stove.add(box(0.6, 0.55, 0.5, IRON, 0, 0.45, 0));
  for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) stove.add(box(0.05, 0.18, 0.05, IRON, x, 0.09, z));
  const pipe = beam([0.1, 0.7, -0.1], [0.1, peak + 0.6, -0.1], 0.14, IRON, true);
  pipe.userData.roof = true; // (it goes up through the roof)
  stove.add(pipe);
  stove.position.set(2.0, 0, -1.55);
  group.add(stove);
  const table = new THREE.Group();
  table.add(box(1.1, 0.07, 0.7, PLANK, 0, 0.75, 0));
  for (const [x, z] of [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]]) table.add(box(0.07, 0.72, 0.07, LOG_DARK, x, 0.36, z));
  table.add(box(0.12, 0.2, 0.12, mat(0x9aa0a6, { roughness: 0.5 }), 0.25, 0.88, 0.1)); // an old lantern
  table.position.set(1.3, 0, 0.6);
  group.add(table);
  const chair = () => {
    const c = new THREE.Group();
    c.add(box(0.45, 0.05, 0.45, PLANK, 0, 0.45, 0));
    c.add(box(0.45, 0.5, 0.05, PLANK, 0, 0.7, -0.2));
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) c.add(box(0.05, 0.45, 0.05, LOG_DARK, x, 0.22, z));
    return c;
  };
  const seat = chair();
  seat.position.set(0.55, 0, 0.7);
  seat.rotation.y = Math.PI / 2;
  group.add(seat);
  const tipped = chair();
  if (random.next() < 0.6) {
    tipped.position.set(1.9, 0.22, 1.45);
    tipped.rotation.set(0, 0.6, Math.PI / 2); // knocked over
  } else tipped.position.set(2.05, 0, 0.6);
  group.add(tipped);
  group.add(box(1.6, 0.02, 1.0, CLOTH, -0.2, 0.01, 0.15));

  const cupboard = woodenCupboard();
  cupboard.position.set(-2.3, 0, 0.55);
  cupboard.rotation.y = Math.PI / 2; // facing into the room
  group.add(cupboard);
  const chest = woodenChest();
  chest.position.set(-1.75, 0, 1.55);
  chest.rotation.y = Math.PI; // facing the back wall, lid hinged at the front
  group.add(chest);
  group.userData.cupboard = cupboard;
  group.userData.chest = chest;
  return shadows(group);
}

// A tall wooden cupboard, base at the origin, doors facing +z. `userData.open(true)` swings
// them open.
export function woodenCupboard() {
  return swappable('cupboard', cupboardStandIn(), [
    { node: 'cupboard-door-left', axis: 'y', angle: -1.8 },
    { node: 'cupboard-door-right', axis: 'y', angle: 1.8 },
  ]);
}
function cupboardStandIn() {
  const group = new THREE.Group();
  group.add(box(0.8, 1.7, 0.45, LOG_DARK, 0, 0.85, 0));
  const doors = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.4, 0, 0.23);
    hinge.add(box(0.39, 1.6, 0.04, PLANK, -side * 0.2, 0.85, 0));
    hinge.add(box(0.03, 0.12, 0.04, IRON, -side * 0.34, 0.9, 0.03));
    group.add(hinge);
    return { hinge, side };
  });
  group.userData.open = (open) => {
    for (const { hinge, side } of doors) hinge.rotation.y = open ? side * 1.8 : 0;
  };
  return shadows(group);
}

// A wooden chest with iron bands, base at the origin, lid hinged at the back (-z).
export function woodenChest() {
  return swappable('chest', chestStandIn(), [{ node: 'chest-lid', axis: 'x', angle: -1.8 }]);
}
function chestStandIn() {
  const group = new THREE.Group();
  group.add(box(0.9, 0.45, 0.55, PLANK, 0, 0.225, 0));
  for (const x of [-0.32, 0.32]) group.add(box(0.06, 0.47, 0.57, IRON, x, 0.225, 0));
  const lid = new THREE.Group();
  lid.position.set(0, 0.45, -0.275);
  lid.add(box(0.92, 0.1, 0.57, LOG_DARK, 0, 0.05, 0.275));
  group.add(lid);
  group.userData.open = (open) => (lid.rotation.x = open ? -1.8 : 0);
  return shadows(group);
}

// An old canvas pack slumped on the ground. "Opening" it flops the flap back.
export function weatheredPack() {
  return swappable('weathered-pack', packStandIn(), [{ node: 'weathered-pack-flap', axis: 'x', angle: -2.2 }]);
}
function packStandIn() {
  const group = new THREE.Group();
  group.add(box(0.55, 0.45, 0.35, mat(0x6b6a45), 0, 0.22, 0));
  const flap = new THREE.Group();
  flap.position.set(0, 0.45, -0.17);
  flap.add(box(0.57, 0.06, 0.4, mat(0x5a5a3a), 0, 0.02, 0.18));
  group.add(flap);
  group.add(beam([-0.3, 0.5, 0], [0.3, 0.5, 0], 0.16, mat(0x7a3a2a), true)); // a rolled blanket on top
  group.userData.open = (open) => (flap.rotation.x = open ? -2.2 : 0);
  return shadows(group);
}

// ---------------------------------------------------------------------------------------
// A hunter's stand: a small platform on four legs, 3 m up, with a ladder at the front (open
// at the top, so you can climb on), a rail round the other sides, and sometimes a camouflage canopy. Returns the group with
// `userData.box` (an ammo box) to search.
export function huntingStand(random) {
  const { height: P, half, ladderFoot, ladderHalf } = STAND;
  const group = new THREE.Group();
  const wood = random.next() < 0.5 ? LOG : LOG_DARK;
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of corners) group.add(beam([sx * (half + 0.25), -1, sz * (half + 0.25)], [sx * half, P + 1.05, sz * half], 0.12, wood, true));
  // Cross braces.
  for (const [ax, az, bx, bz] of [[1, 1, 1, -1], [-1, 1, -1, -1], [1, -1, -1, -1]]) {
    group.add(beam([ax * (half + 0.12), 0.4, az * (half + 0.12)], [bx * half, P - 0.2, bz * half], 0.07, wood, true));
  }
  const deck = box(half * 2 + 0.1, 0.1, half * 2 + 0.1, PLANK, 0, P - 0.05, 0);
  group.add(deck);
  // Rails: back and sides all the way, the front either side of the ladder.
  const rail = P + 0.9;
  group.add(beam([-half, rail, -half], [half, rail, -half], 0.07, wood, true));
  for (const sx of [-1, 1]) group.add(beam([sx * half, rail, -half], [sx * half, rail, half], 0.07, wood, true));
  // The ladder.
  for (const sx of [-1, 1]) group.add(beam([sx * ladderHalf, -0.2, ladderFoot + 0.1], [sx * ladderHalf, P + 0.4, half], 0.07, wood, true));
  for (let y = 0.3; y < P; y += 0.35) {
    const z = ladderFoot - ((ladderFoot - half) * y) / P;
    group.add(beam([-ladderHalf, y, z], [ladderHalf, y, z], 0.05, wood, true));
  }
  // A seat at the back, and an ammo box.
  group.add(box(0.9, 0.06, 0.32, PLANK, 0.25, P + 0.45, -half + 0.25));
  for (const x of [-0.15, 0.65]) group.add(box(0.06, 0.45, 0.06, wood, x, P + 0.22, -half + 0.25));
  const ammo = ammoBox();
  ammo.position.set(STAND.box[0], P, STAND.box[1]);
  group.add(ammo);
  group.userData.box = ammo;
  // Some have a sloping camouflage canopy.
  group.userData.canopy = random.next() < 0.55;
  if (group.userData.canopy) {
    const canopy = box(half * 2 + 0.5, 0.04, half * 2 + 0.7, CAMO, 0, P + 2.0, 0);
    canopy.rotation.x = 0.18;
    canopy.userData.roof = true;
    group.add(canopy);
    for (const [sx, sz] of corners) group.add(beam([sx * half, P + 0.9, sz * half], [sx * half, P + 2.0 - sz * 0.15, sz * half], 0.05, wood, true));
  }
  return shadows(group);
}

// A small olive ammo box with a lid hinged at the back.
export function ammoBox() {
  return swappable('ammo-box', ammoStandIn(), [{ node: 'ammo-box-lid', axis: 'x', angle: -1.9 }]);
}
function ammoStandIn() {
  const group = new THREE.Group();
  const olive = mat(0x4f5b3a, { roughness: 0.7 });
  group.add(box(0.5, 0.28, 0.3, olive, 0, 0.14, 0));
  const lid = new THREE.Group();
  lid.position.set(0, 0.28, -0.15);
  lid.add(box(0.52, 0.05, 0.31, olive, 0, 0.025, 0.15));
  lid.add(box(0.14, 0.03, 0.05, IRON, 0, 0.06, 0.15));
  group.add(lid);
  group.userData.open = (open) => (lid.rotation.x = open ? -1.9 : 0);
  return shadows(group);
}

// An old rain barrel, base at the origin.
export function barrel() {
  return swappable('barrel', barrelStandIn());
}
function barrelStandIn() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.85, 12), LOG_DARK).translateY(0.43));
  for (const y of [0.15, 0.7]) group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12), IRON).translateY(y));
  return shadows(group);
}

// ---------------------------------------------------------------------------------------
// An abandoned campsite: a fire ring, logs to sit on, a collapsed tent, tin cans, and
// (sometimes) a pack left behind. Origin at the fire. `groundAt(x, z)` as for the cabin.
export const CAMP = { pack: [1.6, -1.4] };
export function campsite(random, groundAt) {
  const group = new THREE.Group();
  const on = (object, x, z, lift = 0) => {
    object.position.set(x, groundAt(x, z) + lift, z);
    group.add(object);
    return object;
  };
  const ring = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ring.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), ROCK_DARK).translateX(Math.cos(a) * 0.5).translateZ(Math.sin(a) * 0.5));
  }
  ring.add(beam([-0.3, 0.06, -0.1], [0.3, 0.06, 0.12], 0.1, mat(0x1e1a18), true));
  ring.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 10).rotateX(-Math.PI / 2), mat(0x2a2522)).translateY(0.02));
  on(ring, 0, 0);
  // Two log seats.
  for (const [x, z, turn] of [[-1.4, 0.3, 0.3], [0.4, 1.5, 1.6]]) {
    on(beam([-0.7, 0, 0], [0.7, 0, 0], 0.32, LOG, true), x, z, 0.16).rotation.y = turn;
  }
  // A collapsed tent: a sagging tarp over a broken ridge pole.
  const tent = new THREE.Group();
  const tarp = mat(random.pick([0x5a6b4a, 0x8a4a2a, 0x3d5a78]), { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), tarp);
    sheet.position.set(0, 0.35, side * 0.5);
    sheet.rotation.set(side * 1.15, 0, side * 0.12);
    tent.add(sheet);
  }
  tent.add(beam([-1.1, 0.75, 0], [0.9, 0.3, 0], 0.05, LOG_DARK, true));
  on(tent, -1.2, -2.0).rotation.y = random.range(-0.5, 0.5);
  // Rusty cans.
  for (let i = 0; i < 3; i++) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 8), mat(0x8a5a3a, { roughness: 0.6 }));
    if (i === 2) can.rotation.z = Math.PI / 2;
    on(can, random.range(-0.9, 0.9), random.range(0.7, 1.1), 0.05);
  }
  const pack = on(weatheredPack(), ...CAMP.pack);
  pack.rotation.y = random.range(0, 3);
  group.userData.pack = pack;
  return shadows(group);
}

// A trapper's lean-to: a sloping roof of bark on poles, open to the front (+z), with a
// drying rack of stretched hides, a chopping block and a crate. Origin under the roof.
export const LEAN_TO = { half: 1.6, depth: 1.5, crate: [-0.9, -0.6], rack: [2.6, 0.4], block: [-2.3, 1.2] };
export function leanTo(random, groundAt) {
  const { half, depth } = LEAN_TO;
  const group = new THREE.Group();
  const y0 = groundAt(0, 0);
  // Front posts 2 m tall, the roof sloping back down to the ground.
  for (const sx of [-1, 1]) {
    group.add(beam([sx * half, y0 - 0.2, depth / 2], [sx * half, y0 + 2, depth / 2], 0.12, LOG, true));
    group.add(beam([sx * half, y0 + 2, depth / 2], [sx * half, y0 - 0.1, -depth / 2 - 0.5], 0.1, LOG, true));
  }
  group.add(beam([-half - 0.3, y0 + 2, depth / 2], [half + 0.3, y0 + 2, depth / 2], 0.12, LOG, true));
  const roofLength = Math.hypot(depth + 0.5, 2.1);
  const bark = mat(0x5a4636, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const x = -half + (i + 0.5) * ((half * 2) / 7);
    const strip = box((half * 2) / 7 + 0.04, 0.05, roofLength, i % 2 ? bark : LOG_DARK, x, y0 + 0.95, -0.25);
    strip.rotation.x = Math.atan2(2.1, depth + 0.5);
    strip.userData.roof = true;
    group.add(strip);
  }
  // A bed of spruce boughs under it, and a crate to search.
  group.add(box(half * 1.6, 0.08, depth * 0.7, mat(0x3d5a3a), 0.3, y0 + 0.04, -0.1));
  const crate = woodenChest();
  crate.position.set(LEAN_TO.crate[0], groundAt(...LEAN_TO.crate), LEAN_TO.crate[1]);
  crate.scale.setScalar(0.85);
  group.add(crate);
  group.userData.crate = crate;
  // A drying rack with hides stretched on it.
  const [rx, rz] = LEAN_TO.rack;
  const ry = groundAt(rx, rz);
  for (const dz of [-0.7, 0.7]) group.add(beam([rx, ry - 0.2, rz + dz], [rx, ry + 1.6, rz + dz], 0.08, LOG_DARK, true));
  group.add(beam([rx, ry + 1.55, rz - 0.8], [rx, ry + 1.55, rz + 0.8], 0.07, LOG_DARK, true));
  const hide = mat(0xb08a5a, { side: THREE.DoubleSide });
  for (const dz of [-0.35, 0.35]) {
    const skin = new THREE.Mesh(new THREE.CircleGeometry(0.4, 7), hide);
    skin.position.set(rx + 0.03, ry + 1.05, rz + dz);
    skin.rotation.y = Math.PI / 2;
    skin.scale.set(0.8, 1.2, 1);
    group.add(skin);
  }
  // A chopping block with an old trap hanging off a peg.
  const [bx, bz] = LEAN_TO.block;
  group.add(beam([bx, groundAt(bx, bz), bz], [bx, groundAt(bx, bz) + 0.5, bz], 0.45, LOG, true));
  group.add(box(0.35, 0.03, 0.35, IRON, bx, groundAt(bx, bz) + 0.52, bz));
  return shadows(group);
}

// The rusted wreck of a forest service pickup, left on the fire road. Origin in the middle,
// facing +z. Returns the group with `userData.glovebox` to search (the open passenger door).
export const TRUCK = { half: [1, 2.6], door: [1.25, 0.4] };
export function rustedTruck(random) {
  const group = new THREE.Group();
  const rust = mat(0x7a4a2e, { roughness: 0.8 });
  const paint = mat(0x5a6a4a, { roughness: 0.8 }); // what's left of the green paint
  const dark = mat(0x1e1c1a);
  group.add(box(1.9, 0.6, 5, random.next() < 0.5 ? rust : paint, 0, 0.75, 0)); // body
  group.add(box(1.8, 0.75, 1.6, paint, 0, 1.4, 0.4)); // cab
  group.add(box(1.7, 0.5, 0.05, dark, 0, 1.5, 1.21)); // windscreen (gone)
  group.add(box(1.9, 0.12, 1.4, rust, 0, 0.98, 1.8)); // bonnet
  group.add(box(1.9, 0.45, 0.06, rust, 0, 1.0, -1.2)); // the bed's front wall
  for (const [x, z] of [[-0.9, 1.6], [0.9, 1.6], [-0.9, -1.6], [0.9, -1.6]]) {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), dark);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(x, 0.3, z);
    group.add(tyre);
  }
  // The passenger door hangs open.
  const hinge = new THREE.Group();
  hinge.position.set(0.95, 0, 1.2);
  hinge.add(box(0.05, 0.75, 1.0, paint, 0, 1.15, -0.5));
  hinge.rotation.y = -1.1;
  group.add(hinge);
  group.rotation.z = random.range(-0.04, 0.04); // settled on a flat tyre
  group.userData.glovebox = { userData: { open: (open) => (hinge.rotation.y = open ? -1.6 : -1.1) } };
  return shadows(group);
}

// ---------------------------------------------------------------------------------------
// Little things scattered about (drawn many times over, see details.js).

// A fallen tree trunk, 1 m long along x and 1 m thick (scaled per copy), with a broken
// branch stub and a little moss.
export function fallenLog() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1, 9).rotateZ(Math.PI / 2), LOG);
  trunk.position.y = 0.5;
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.5, 9).rotateY(Math.PI / 2), mat(0xa08060));
  end.position.set(0.501, 0.5, 0);
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), LOG_DARK);
  stub.position.set(0.1, 0.95, 0.15);
  stub.rotation.z = -0.6;
  const moss = box(0.5, 0.12, 0.6, MOSS, -0.15, 0.97, 0);
  group.add(trunk, end, stub, moss);
  return group;
}

// One 2.5 m length of old split-rail fence: posts at both ends, two rails. `broken` has a
// rail down and a post leaning.
export const FENCE_LENGTH = 2.5;
export function fenceSegment(broken = false) {
  const group = new THREE.Group();
  const grey = mat(0x7a7064);
  group.add(beam([0, -0.2, 0], [0, 1.15, 0], 0.11, grey));
  group.add(beam([FENCE_LENGTH, -0.2, 0], broken ? [FENCE_LENGTH + 0.25, 1.05, 0.15] : [FENCE_LENGTH, 1.15, 0], 0.11, grey));
  group.add(beam([0, 0.95, 0], [FENCE_LENGTH, 0.95, 0], 0.08, grey));
  if (broken) group.add(beam([0, 0.5, 0], [FENCE_LENGTH * 0.8, 0.05, 0.2], 0.08, grey));
  else group.add(beam([0, 0.5, 0], [FENCE_LENGTH, 0.5, 0], 0.08, grey));
  return group;
}
