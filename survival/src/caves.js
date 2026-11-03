import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Cutaway } from './cutaway.js';
import { weatheredPack, woodenChest } from './poiModels.js';

// Caves go underground. On the surface there's only a ring of rocks round a dark hole in the
// hillside. Walk into it holding a lit torch and the screen fades: you come out in a cave
// system DEPTH meters below, a few rooms joined by narrow passages, where it's dark but for
// your torch (see main.js for the darkness and the fade). Without a torch you won't go in.
//
// Everything here is in the cave's own space (see fromPoi in pois.js): x and z across, +z
// toward the mouth (downhill). Underground the player walks on the cave's own floor and
// bumps into its own walls (floorAt and blocked), not the land above.
export const DEPTH = 30; // meters below the entrance
export const ENTRANCE = {
  hole: 1.3, // the hole's radius
  ring: 2.5, // the rocks round it sit this far out...
  gap: 0.75, // ...leaving the downhill side open, this far either side (radians)
  trigger: 0.9, // walk this close to the hole's middle and you go down
};
const PLAYER_RADIUS = 0.4;
const MAIN_ROOM = 5.5;
const EXIT = { x: 0, z: 10 }; // where the way out is, at the top of the first passage
const PASSAGE = 1.25; // half the width of the passages
const WALL_TILE = 6; // wall rocks are merged in tiles this big, so each tile can fade on its own

// The rooms and passages, from the cave's seed: { rooms: [{x, z, r}], passages: [{a, b, w}] }.
export function caveLayout(random) {
  const rooms = [{ x: 0, z: 0, r: MAIN_ROOM }];
  const passages = [{ a: { x: EXIT.x, z: EXIT.z + 0.6 }, b: { x: 0, z: 0 }, w: PASSAGE }];
  const count = 2 + Math.floor(random.next() * 2);
  for (let i = 0; i < count; i++) {
    // Off to the sides and back, away from the way in.
    const angle = Math.PI + (i - (count - 1) / 2) * 1.15 + random.range(-0.25, 0.25);
    const distance = random.range(10, 13);
    const room = { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance, r: random.range(3, 4.4) };
    rooms.push(room);
    passages.push({ a: { x: 0, z: 0 }, b: room, w: PASSAGE * random.range(0.9, 1.15) });
  }
  return { rooms, passages };
}

// How far inside the open space (x, z) is (negative outside): the most of any room or passage.
function inside({ rooms, passages }, x, z) {
  let best = -Infinity;
  for (const { x: rx, z: rz, r } of rooms) best = Math.max(best, r - Math.hypot(x - rx, z - rz));
  for (const { a, b, w } of passages) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.max(best, w - Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

// A little unevenness in the floor (meters, about ±0.15).
const bump = (x, z) => Math.sin(x * 0.9) * Math.cos(z * 0.7) * 0.1 + Math.sin(x * 2.3 + z * 1.7) * 0.05;

// ---------------------------------------------------------------------------------------
// The way in, on the surface: a dark hole ringed by rocks, open on the downhill side.

// [x, z, size] of each rock in the ring (also used for the obstacles).
export function entranceRocks() {
  const { ring, gap } = ENTRANCE;
  const rocks = [];
  const steps = 11;
  for (let i = 0; i <= steps; i++) {
    const a = gap + ((Math.PI * 2 - gap * 2) * i) / steps; // 0 = +z, the open side
    rocks.push([Math.sin(a) * ring, Math.cos(a) * ring, 0.75 + (i % 3) * 0.2]);
  }
  return rocks;
}

// `groundAt(x, z)` is the ground's height in the cave's space, relative to the entrance.
export function caveEntrance(random, groundAt) {
  const group = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x6f6a63, roughness: 0.95, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.95, flatShading: true });
  for (const [x, z, size] of entranceRocks()) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), random.next() < 0.5 ? rock : dark);
    mesh.position.set(x, groundAt(x, z) + size * 0.35, z);
    mesh.rotation.set(random.range(0, 3), random.range(0, 3), random.range(0, 3));
    mesh.scale.set(random.range(0.9, 1.3), random.range(0.8, 1.4), random.range(0.9, 1.2));
    group.add(mesh);
  }
  // A bigger slab leaning over the back of the hole.
  const slab = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), rock);
  slab.position.set(0, groundAt(0, -1.6) + 0.9, -1.6);
  slab.scale.set(1.6, 0.7, 0.9);
  slab.rotation.set(0.3, 0, 0.1);
  group.add(slab);
  // The hole: black in the middle, shading out to dark earth, with worn steps going down.
  const y = groundAt(0, 0);
  const disc = (radius, color, lift, stretch = 1.3) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
    mesh.scale.z = stretch;
    mesh.position.set(0, y + lift, 0);
    group.add(mesh);
  };
  disc(ENTRANCE.hole + 0.5, 0x2a241e, 0.04);
  disc(ENTRANCE.hole + 0.15, 0x120f0c, 0.05);
  disc(ENTRANCE.hole - 0.3, 0x000000, 0.06);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.1 - i * 0.15, 0.04, 0.35), new THREE.MeshBasicMaterial({ color: [0x4a4038, 0x2e2822, 0x17130f][i] }));
    step.position.set(0, y + 0.07, 1.2 - i * 0.45);
    group.add(step);
  }
  // Scree spilling out of the mouth.
  for (let i = 0; i < 8; i++) {
    const x = random.range(-1.8, 1.8);
    const z = random.range(2, 4);
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(random.range(0.12, 0.35), 0), dark);
    stone.position.set(x, groundAt(x, z) + 0.05, z);
    stone.rotation.set(i, i * 2, i * 3);
    group.add(stone);
  }
  group.traverse((child) => {
    if (child.isMesh && child.material.isMeshStandardMaterial) child.castShadow = child.receiveShadow = true;
  });
  return group;
}

// ---------------------------------------------------------------------------------------
// Underground.

// Builds the cave system under `poi`: its model (added to `scene`, hidden until you're down
// there), and what you can search. `toWorld(x, z)` / `toLocal(x, z)` convert from and to the
// cave's own space.
export function buildUnderground(scene, poi, random, toWorld, toLocal) {
  const layout = caveLayout(random);
  const floorY = poi.base - DEPTH;
  const group = new THREE.Group();
  group.position.set(poi.x, floorY, poi.z);
  group.rotation.y = poi.heading;
  group.visible = false;
  scene.add(group);

  // Things standing on the floor that you walk round: [x, z, radius].
  const props = [];
  const free = (x, z, room) => inside(layout, x, z) > room && props.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) > pr + 1.7); // (room to walk between)

  // The floor: a grid over the whole system, damp dark stone, a little uneven.
  const xs = [...layout.rooms.map((r) => r.x), EXIT.x];
  const zs = [...layout.rooms.map((r) => r.z), EXIT.z];
  const minX = Math.min(...xs) - 8;
  const maxX = Math.max(...xs) + 8;
  const minZ = Math.min(...zs) - 8;
  const maxZ = Math.max(...zs) + 8;
  const floor = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, Math.ceil((maxX - minX) / 0.8), Math.ceil((maxZ - minZ) / 0.8)).rotateX(-Math.PI / 2);
  floor.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const p = floor.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const stone = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const edge = inside(layout, x, z);
    // Rising up into the walls at the edges.
    p.setY(i, bump(x, z) + (edge < 0 ? Math.min(3, -edge * 1.5) : 0));
    const damp = Math.sin(x * 0.5 + z * 0.3) * 0.5 + 0.5;
    stone.setRGB(0.2 + damp * 0.05, 0.19 + damp * 0.04, 0.17 + damp * 0.03).toArray(colors, i * 3);
  }
  floor.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  floor.computeVertexNormals();
  const floorMesh = new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // The walls: tall rough rocks all round the edge of the open space, merged in tiles.
  const tiles = new Map();
  for (let x = minX; x <= maxX; x += 1.1) {
    for (let z = minZ; z <= maxZ; z += 1.1) {
      const edge = inside(layout, x, z);
      if (edge > -0.2 || edge < -1.6) continue;
      if (Math.hypot(x - EXIT.x, z - EXIT.z - 1.5) < 1.6) continue; // (the way out stays open)
      const size = random.range(0.8, 1.4);
      const rock = new THREE.IcosahedronGeometry(size, 0)
        .scale(random.range(0.9, 1.3), random.range(2, 3.4), random.range(0.9, 1.3))
        .rotateY(random.range(0, 3))
        .translate(x + random.range(-0.3, 0.3), size * 1.2, z + random.range(-0.3, 0.3))
        .toNonIndexed();
      const key = `${Math.floor(x / WALL_TILE)},${Math.floor(z / WALL_TILE)}`;
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(rock);
    }
  }
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.95, flatShading: true });
  for (const pieces of tiles.values()) {
    const wall = new THREE.Mesh(mergeGeometries(pieces), wallMaterial);
    wall.userData.cutaway = true; // fades when it's between the camera and you
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
  }

  // The way out: worn steps climbing toward a faint grey glow of daylight.
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3 + i * 0.3, 0.6), wallMaterial);
    step.position.set(EXIT.x, (0.3 + i * 0.3) / 2, EXIT.z + 0.8 + i * 0.6);
    group.add(step);
  }
  const daylight = new THREE.PointLight(0xc8d4e0, 6, 9, 1.5);
  daylight.position.set(EXIT.x, 3, EXIT.z + 2.5);
  group.add(daylight);

  const add = (object, x, z, radius = 0) => {
    object.position.set(x, bump(x, z), z);
    group.add(object);
    if (radius) props.push([x, z, radius]);
    return object;
  };
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...options });

  // An old camp in the first room, with a pack to search.
  const ring = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ring.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), wallMaterial).translateX(Math.cos(a) * 0.45).translateZ(Math.sin(a) * 0.45));
  }
  for (const [a, b] of [[[-0.3, 0.06, -0.1], [0.3, 0.06, 0.12]], [[-0.1, 0.06, 0.25], [0.15, 0.06, -0.3]]]) ring.add(log(a, b, 0.1, mat(0x1e1a18)));
  add(ring, 1.4, 1.0, 0.6);
  add(log([0, 0.1, 0], [0.9, 0.1, 0.6], 0.22, mat(0x55603a)), -2.4, 1.3); // an old bedroll
  const pack = add(weatheredPack(), -2.2, -1.6, 0.4);
  pack.rotation.y = 0.7;
  const containers = [{ object: pack, label: 'the old pack', lx: -2.2, lz: -1.6, table: 'cave' }];

  // A miner's chest in the furthest room.
  const far = layout.rooms.slice(1).reduce((a, b) => (Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) ? b : a));
  const chest = add(woodenChest(), far.x * 0.92, far.z * 0.92, 0.5);
  chest.rotation.y = Math.atan2(-far.x, -far.z); // facing back toward the middle
  containers.push({ object: chest, label: "the miner's chest", lx: far.x * 0.92, lz: far.z * 0.92, table: 'deepCave' });

  // Glowing crystals in one of the side rooms, giving off a faint blue light.
  const glowRoom = layout.rooms[1];
  const crystal = mat(0x7fd4ff, { emissive: 0x2a8fd0, emissiveIntensity: 1.4, roughness: 0.3, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = random.range(0, Math.PI * 2);
    const r = glowRoom.r * random.range(0.65, 0.9);
    const x = glowRoom.x + Math.cos(a) * r;
    const z = glowRoom.z + Math.sin(a) * r;
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(random.range(0.12, 0.3), 0).scale(0.6, 2.2, 0.6), crystal);
    shard.rotation.set(random.range(-0.4, 0.4), random.range(0, 3), random.range(-0.4, 0.4));
    add(shard, x, z).position.y += 0.25;
  }
  const glow = new THREE.PointLight(0x5ab8ff, 4, 8, 1.5);
  glow.position.set(glowRoom.x, 1.5, glowRoom.z);
  group.add(glow);

  // Rocks rising from the floor, puddles, bones and pale glowing fungus here and there.
  for (let i = 0; i < 14; i++) {
    const room = random.pick(layout.rooms);
    const a = random.range(0, Math.PI * 2);
    const r = room.r * random.range(0.3, 0.85);
    const x = room.x + Math.cos(a) * r;
    const z = room.z + Math.sin(a) * r;
    if (!free(x, z, 0.9)) continue;
    const h = random.range(0.6, 1.8);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(random.range(0.2, 0.35), h, 6), wallMaterial);
    add(spike, x, z, 0.32).position.y += h / 2 - 0.05;
  }
  for (let i = 0; i < 4; i++) {
    const room = random.pick(layout.rooms);
    const x = room.x + random.range(-room.r, room.r) * 0.5;
    const z = room.z + random.range(-room.r, room.r) * 0.5;
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(random.range(0.4, 0.9), 14).rotateX(-Math.PI / 2), mat(0x1a2a33, { roughness: 0.1, metalness: 0.3 }));
    puddle.scale.x = random.range(0.7, 1.4);
    add(puddle, x, z).position.y += 0.03;
  }
  const bone = mat(0xe6dfcc);
  const bones = new THREE.Group();
  bones.add(log([-0.3, 0.05, 0], [0.3, 0.05, 0.1], 0.06, bone), log([0, 0.05, -0.25], [0.15, 0.05, 0.25], 0.05, bone));
  bones.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), bone).translateX(0.4).translateY(0.1));
  const boneRoom = layout.rooms[layout.rooms.length - 1];
  add(bones, boneRoom.x - 1, boneRoom.z + 0.5);
  const fungus = mat(0xc8f0a0, { emissive: 0x6fa040, emissiveIntensity: 0.9 });
  for (let i = 0; i < 18; i++) {
    const room = random.pick(layout.rooms);
    const a = random.range(0, Math.PI * 2);
    const x = room.x + Math.cos(a) * room.r * 0.95;
    const z = room.z + Math.sin(a) * room.r * 0.95;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(random.range(0.05, 0.1), 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fungus);
    add(cap, x, z).position.y += 0.08;
  }

  // Bats hanging about near the ceiling, which take off and flit round when you come near.
  const bats = [];
  const batMaterial = mat(0x15120f, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const bat = new THREE.Group();
    const wing = (side) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12).translate(side * 0.11, 0, 0).rotateX(-Math.PI / 2), batMaterial);
      bat.add(w);
      return w;
    };
    bat.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), batMaterial));
    const wings = [wing(1), wing(-1)];
    const room = random.pick(layout.rooms);
    bat.userData = { wings, room, phase: random.range(0, 10), speed: random.range(1.2, 2), height: random.range(2.2, 3.2) };
    group.add(bat);
    bats.push(bat);
  }

  group.traverse((child) => {
    if (child.isMesh && !child.material.emissive?.getHex()) child.castShadow = true;
  });
  const cutaway = new Cutaway(group);

  const start = toWorld(EXIT.x, EXIT.z - 3); // where you come in (well clear of the way out)
  return {
    poi,
    group,
    floorY,
    containers: containers.map((c) => ({ ...c, ...toWorld(c.lx, c.lz), y: floorY + bump(c.lx, c.lz) })),
    start: { ...start, facing: poi.heading + Math.PI }, // facing into the cave
    exit: toWorld(EXIT.x, EXIT.z),
    // The floor's height at world (x, z).
    floorAt(x, z) {
      const p = toLocal(x, z);
      return floorY + bump(p.x, p.z);
    },
    // True if the player can't stand at world (x, z): in a wall, or in a rock or the camp.
    blocked(x, z) {
      const p = toLocal(x, z);
      if (inside(layout, p.x, p.z) < PLAYER_RADIUS) return true;
      return props.some(([px, pz, pr]) => Math.hypot(px - p.x, pz - p.z) < pr + PLAYER_RADIUS);
    },
    update(dt, camera, feet, position) {
      cutaway.update(dt, camera, feet, position, true);
      // The bats circle their room, faster and lower when you're in it.
      const here = toLocal(position.x, position.z);
      for (const bat of bats) {
        const { wings, room, speed, height } = bat.userData;
        const near = Math.hypot(here.x - room.x, here.z - room.z) < room.r + 2;
        bat.userData.phase += dt * speed * (near ? 1.6 : 0.6);
        const t = bat.userData.phase;
        const r = room.r * (0.5 + 0.3 * Math.sin(t * 0.7));
        bat.position.set(room.x + Math.cos(t) * r, height + Math.sin(t * 3) * 0.3, room.z + Math.sin(t) * r);
        bat.rotation.y = -t;
        const flap = Math.sin(t * 25) * 0.9;
        wings[0].rotation.z = flap;
        wings[1].rotation.z = -flap;
      }
    },
  };
}

// A round log or bone from a to b.
function log(a, b, width, material) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, from.distanceTo(to), 7), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
}
