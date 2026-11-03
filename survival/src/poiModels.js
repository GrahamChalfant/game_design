import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cot } from './placeholders.js';

// Stand-in models for the places to find around the map (see pois.js): abandoned log cabins,
// caves in the hillsides and hunters' tree stands. Each is built in its own space: x and z
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

export const CAVE = {
  radius: 4.2, // of the chamber inside
  height: 3, // at its highest
  mouth: 0.45, // half the angle of the opening (radians), facing +z
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

// ---------------------------------------------------------------------------------------
// A cave: a hollow rocky dome with a mouth facing +z, dug into a hillside. Origin on the
// ground in the middle of the chamber. `groundAt(x, z)` gives the ground's height in its own
// space, for the things lying inside. Returns the group with `userData.stash` to search.
export function cave(random, groundAt) {
  const { radius: R, height: H, mouth } = CAVE;
  const group = new THREE.Group();
  // A rough dome: a sphere's top half, open at the mouth, with its surface pushed in and out.
  const dome = (radius, height, roughness) => {
    // (It carries on a little below its widest, as a skirt down into the ground on the
    // downhill side.)
    const geometry = new THREE.SphereGeometry(radius, 26, 11, Math.PI / 2 + mouth, Math.PI * 2 - mouth * 2, 0, Math.PI / 2 + 0.55);
    const p = geometry.attributes.position;
    const seed = random.range(0, 100);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const bump = 1 + roughness * (Math.sin(a * 5 + seed) * 0.5 + Math.sin(a * 11 + y * 3 + seed * 2) * 0.35 + Math.sin(y * 4 + seed) * 0.3);
      // (The bottom edge stays put, so it meets the ground.)
      const keep = y < 0.05 ? 1 : bump;
      p.setXYZ(i, x * keep, y * (height / radius) * (y < 0.05 ? 1 : 1 + roughness * 0.3 * Math.sin(a * 3 + seed)), z * keep);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, ROCK);
    mesh.position.y = -0.4; // sunk a little, so the edge is buried on uneven ground
    mesh.userData.roof = true;
    return mesh;
  };
  group.add(dome(R, H + 0.4, 0.08), dome(R + 1.1, H + 1.3, 0.12));
  // Big boulders framing the mouth, and a lintel stone over it.
  const boulder = (size, x, y, z) => {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), ROCK_DARK);
    rock.position.set(x, y, z);
    rock.rotation.set(random.range(0, 3), random.range(0, 3), random.range(0, 3));
    rock.scale.set(1, random.range(0.7, 1), random.range(0.8, 1.2));
    rock.userData.cutaway = true;
    group.add(rock);
  };
  const edge = (side) => [Math.sin(side * mouth) * (R + 0.5), Math.cos(mouth) * (R + 0.5)];
  for (const side of [-1, 1]) {
    const [x, z] = edge(side);
    boulder(1.1, x + side * 0.3, groundAt(x, z) + 0.6, z);
    boulder(0.7, x + side * 0.9, groundAt(x, z) + 1.6, z - 0.4);
  }
  boulder(1.0, 0, H + 0.2, Math.cos(mouth) * R);
  // Scree spilling out of the mouth.
  for (let i = 0; i < 7; i++) {
    const x = random.range(-2, 2);
    const z = R + random.range(0.3, 2.5);
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(random.range(0.15, 0.4), 0), ROCK_DARK);
    stone.position.set(x, groundAt(x, z) + 0.05, z);
    stone.rotation.set(i, i * 2, i * 3);
    group.add(stone);
  }

  // Inside: a ring of stones round an old fire, bones, rocks rising from the floor near the
  // back, an old bedroll, and a weathered pack (to search).
  const fire = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    fire.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), ROCK_DARK).translateX(Math.cos(a) * 0.45).translateZ(Math.sin(a) * 0.45));
  }
  fire.add(beam([-0.3, 0.06, -0.1], [0.3, 0.06, 0.12], 0.1, mat(0x1e1a18), true));
  fire.add(beam([-0.1, 0.06, 0.25], [0.15, 0.06, -0.3], 0.09, mat(0x1e1a18), true));
  fire.position.set(0.6, groundAt(0.6, 0.8), 0.8);
  group.add(fire);
  const bones = new THREE.Group();
  const bone = mat(0xe6dfcc);
  bones.add(beam([-0.3, 0.05, 0], [0.3, 0.05, 0.1], 0.06, bone, true));
  bones.add(beam([0, 0.05, -0.25], [0.15, 0.05, 0.25], 0.05, bone, true));
  bones.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), bone).translateX(0.4).translateY(0.1));
  bones.position.set(1.7, groundAt(1.7, -1.4), -1.4);
  group.add(bones);
  for (const [x, z, h] of CAVE_ROCKS) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, h, 6), ROCK_DARK);
    spike.position.set(x, groundAt(x, z) + h / 2 - 0.05, z);
    group.add(spike);
  }
  const bedroll = beam([-2.6, 0.1, 0.5], [-2.0, 0.1, 1.4], 0.22, mat(0x55603a), true);
  bedroll.position.y += groundAt(-2.3, 0.95);
  group.add(bedroll);
  const stash = weatheredPack();
  stash.position.set(-1.9, groundAt(-1.9, -1.7), -1.7);
  stash.rotation.y = 0.7;
  group.add(stash);
  group.userData.stash = stash;
  return shadows(group);
}

// The rocks rising from a cave's floor near the back: [x, z, height].
export const CAVE_ROCKS = [[-0.8, -3.0, 1.2], [1.3, -3.0, 0.9], [2.9, -1.1, 1.4]];

// An old canvas pack slumped on the ground. "Opening" it flops the flap back.
export function weatheredPack() {
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
  if (random.next() < 0.55) {
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
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.85, 12), LOG_DARK).translateY(0.43));
  for (const y of [0.15, 0.7]) group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12), IRON).translateY(y));
  return shadows(group);
}
