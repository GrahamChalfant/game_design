import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel } from './models.js';

// Simple stand-ins, used until Blender models exist in public/models/.
const material = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });

const BARK = material(0x5a4030);

// Dark spruce, about 9 m tall, base at the origin. The branch tiers have ragged, drooping
// edges and are darker inside and lighter at the tips, all in one mesh.
export function conifer() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.26, 2.4, 8).translate(0, 1.2, 0);
  paint(trunk, () => new THREE.Color(0x4a3426));
  parts.push(trunk);

  const inner = new THREE.Color(0x1f3a2a);
  const tip = new THREE.Color(0x46684a);
  const TIERS = 8;
  for (let i = 0; i < TIERS; i++) {
    const t = i / (TIERS - 1);
    const radius = 1.7 - t * 1.35;
    const height = 1.9 - t * 0.7;
    const base = 1.3 + i * 0.95;
    const tier = new THREE.ConeGeometry(radius, height, 11, 2).translate(0, base + height / 2, 0);
    const position = tier.attributes.position;
    for (let v = 0; v < position.count; v++) {
      const x = position.getX(v);
      const z = position.getZ(v);
      const out = Math.hypot(x, z) / radius; // 0 at the trunk, 1 at the edge
      if (out < 0.5) continue;
      // Ragged branch tips that droop.
      const angle = Math.atan2(z, x);
      const ragged = 1 + 0.22 * Math.sin(angle * 5 + i * 1.7) + 0.1 * Math.sin(angle * 11 + i);
      position.setX(v, x * ragged);
      position.setZ(v, z * ragged);
      position.setY(v, position.getY(v) - (ragged - 0.8) * 0.35 * out);
    }
    tier.computeVertexNormals();
    paint(tier, (x, y, z) => inner.clone().lerp(tip, Math.min(1, Math.hypot(x, z) / radius) * (0.7 + 0.3 * t)));
    parts.push(tier);
  }
  const tree = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  tree.castShadow = true;
  return tree;
}

// Gives every vertex of `geometry` the colour returned by colorAt(x, y, z).
function paint(geometry, colorAt) {
  const position = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < position.count; i++) {
    const c = colorAt(position.getX(i), position.getY(i), position.getZ(i));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// Tree stump left after chopping, base at the origin. Scaled to match the tree.
export function stump() {
  const group = new THREE.Group();
  const bark = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.45, 12), BARK);
  bark.position.y = 0.225;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 12), material(0xd9b98a));
  top.position.y = 0.455;
  group.add(bark, top);
  return group;
}

const PAINT = material(0xd9a52b, 0.6); // classic yellow bush-plane paint
const STRIPE = material(0xa83a2a, 0.6);
const METAL = material(0x7d8288, 0.5);
const GLASS = material(0x2a3a44, 0.2);

// A small single-engine bush plane, crashed nose-first into the ground. It's about
// 8 m long with its nose pointing along +z; one wing has broken off (see brokenWing).
export function crashedPlane() {
  const wreck = new THREE.Group();
  const plane = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 4.6, 16), PAINT);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.8, 0.6);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.2, 3, 16), PAINT);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0.95, -3.2);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.35, 16), STRIPE);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, 0.8, -0.8);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.9, 16), METAL);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0.75, 3.3);
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), GLASS);
  windscreen.position.set(0, 1.45, 1.8);
  windscreen.rotation.x = -0.35;
  const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.45, 1.3), GLASS);
  sideWindows.position.set(0, 1.2, 0.8);

  // The remaining (left) wing, mounted high on the body, plus its strut.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.12, 1.6), PAINT);
  wing.position.set(-3.2, 1.75, 1.1);
  wing.rotation.z = 0.12; // bent from the crash
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), METAL);
  strut.position.set(-1.6, 1.15, 1.1);
  strut.rotation.z = 1.15;

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 1.2), PAINT);
  fin.position.set(0, 1.75, -4.1);
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 1.2), STRIPE);
  finStripe.position.set(0, 2.2, -4.1);
  const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.9), PAINT);
  stabilizer.position.set(0, 1.1, -4.1);

  // Bent propeller.
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), METAL);
  hub.position.set(0, 0.75, 3.85);
  const blade = new THREE.BoxGeometry(0.12, 1.1, 0.05).translate(0, 0.55, 0);
  for (const [angle, bend] of [[0.3, 0.6], [Math.PI + 0.3, -0.4]]) {
    const b = new THREE.Mesh(blade, METAL);
    b.position.copy(hub.position);
    b.rotation.set(bend, 0, angle);
    plane.add(b);
  }

  plane.add(body, tail, stripe, engine, windscreen, sideWindows, wing, strut, fin, finStripe, stabilizer, hub);
  // Nose dug into the ground, tilted onto one side.
  plane.rotation.set(0.14, 0, -0.18);
  plane.position.y = -0.25;
  wreck.add(plane);
  wreck.traverse((child) => (child.castShadow = child.receiveShadow = true));
  return wreck;
}

// The wing that broke off in the crash, lying on the ground. About 5.5 m long.
export function brokenWing() {
  const group = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 1.6), PAINT);
  wing.position.y = 0.2;
  wing.rotation.set(0.05, 0, 0.08);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 1.6), STRIPE);
  tip.position.set(2.5, 0.4, 0);
  tip.rotation.z = 0.08;
  group.add(wing, tip);
  group.traverse((child) => (child.castShadow = child.receiveShadow = true));
  return group;
}

// A suitcase lying flat on the ground, about 0.7 m long. Its lid (userData.lid) hinges
// open along the back edge.
export function suitcase(color) {
  const leather = material(color);
  const trim = material(0x2a2420);
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.48), leather);
  base.position.y = 0.06;
  const lid = new THREE.Group();
  lid.position.set(0, 0.12, -0.24); // the hinge
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.48), leather);
  top.position.set(0, 0.05, 0.24);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), trim);
  handle.position.set(0, 0.05, 0.49);
  handle.rotation.x = Math.PI / 2;
  lid.add(top, handle);
  group.add(base, lid);
  group.userData.lid = lid;
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A torn scrap of the plane lying in the grass.
export function debris() {
  const scrap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), PAINT);
  scrap.position.y = 0.05;
  scrap.rotation.set(0.2, 0.4, -0.15);
  scrap.castShadow = true;
  return scrap;
}

// A landing wheel torn off in the crash, lying on its side with a bent strut.
export function landingWheel() {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 10), material(0x2a2826));
  tyre.position.y = 0.12;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 8), METAL);
  hub.position.y = 0.13;
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.9), PAINT);
  strut.position.set(0.1, 0.24, 0.42);
  strut.rotation.y = 0.2;
  group.add(tyre, hub, strut);
  group.rotation.z = 0.12;
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A lump of soil thrown up in the crash, about 0.3 m across.
export function clod() {
  const lump = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.16, 0).toNonIndexed(),
    new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1, flatShading: true }),
  );
  lump.geometry.computeVertexNormals();
  lump.position.y = 0.06;
  return lump;
}

// The axe lying flat on the ground.
export function axeOnGround() {
  const tool = axe();
  tool.rotation.set(Math.PI / 2, 0, 0.6);
  tool.position.y = 0.05;
  const group = new THREE.Group();
  group.add(tool);
  return group;
}

// A canvas backpack, about 0.5 m tall, base at the origin.
export function backpack() {
  const group = new THREE.Group();
  const canvas = material(0x4f6b45);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.28), canvas);
  bag.position.y = 0.28;
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.18, 0.3), material(0x3f5737));
  flap.position.y = 0.5;
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.08), material(0x3f5737));
  pocket.position.set(0, 0.2, 0.17);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), material(0x8a3a2a));
  roll.rotation.z = Math.PI / 2;
  roll.position.y = 0.64;
  group.add(bag, flap, pocket, roll);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A small pile of cut logs lying on the ground, base at the origin.
export function logPile() {
  const group = new THREE.Group();
  const wood = material(0x7a5438);
  const cut = material(0xd9b98a);
  for (const [x, y, z] of [[-0.14, 0.09, 0], [0.14, 0.09, 0], [0, 0.24, 0]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 10), wood);
    log.rotation.x = Math.PI / 2;
    log.position.set(x, y, z);
    // Light-coloured cut ends.
    for (const end of [-0.351, 0.351]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 10), cut);
      face.position.set(x, y, z + end);
      face.rotation.y = end > 0 ? 0 : Math.PI;
      group.add(face);
    }
    group.add(log);
  }
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A rudimentary A-frame shelter, about 3.2 m wide, 2.3 m tall (taller than the player) and
// 2.8 m deep, base at the origin, open at the front (+z): crossed poles at each end hold a ridge pole, stitched hides
// cover both slopes and the back, and there's a bed of spruce boughs inside.
export function shelter() {
  const flatMaterial = (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  const wood = flatMaterial(0x6b4a32);
  const group = new THREE.Group();
  const add = (geometry, mat, [x, y, z], [rx, ry, rz] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };

  const HALF_WIDTH = 1.6;
  const HEIGHT = 2.3;
  const DEPTH = 2.8;
  const slope = Math.atan2(HEIGHT, HALF_WIDTH);
  const side = Math.hypot(HALF_WIDTH, HEIGHT);

  // Crossed poles at the front and back, sticking up past the ridge.
  for (const z of [DEPTH / 2 - 0.1, -DEPTH / 2 + 0.1]) {
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.05, 0.07, side + 0.45, 6), wood, [s * (HALF_WIDTH / 2 - 0.1), HEIGHT / 2 + 0.12, z], [0, 0, s * (Math.PI / 2 - slope)]);
    }
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, DEPTH + 0.4, 6), wood, [0, HEIGHT, 0], [Math.PI / 2, 0, 0]);

  // Hides on both slopes: two per side, slightly different shades, with stitched seams.
  const hides = [0x8a6a4a, 0x9c7a56, 0x7a5c40, 0x94704e];
  let n = 0;
  for (const s of [-1, 1]) {
    for (const z of [-DEPTH / 4, DEPTH / 4]) {
      add(new THREE.BoxGeometry(side, 0.05, DEPTH / 2 + 0.02), flatMaterial(hides[n++]), [s * HALF_WIDTH / 2, HEIGHT / 2, z], [0, 0, -s * slope]);
    }
    add(new THREE.BoxGeometry(side, 0.06, 0.05), flatMaterial(0xd8c49a), [s * HALF_WIDTH / 2, HEIGHT / 2 + 0.01, 0], [0, 0, -s * slope]);
  }
  // A hide stretched across the back.
  const back = new THREE.Shape();
  back.moveTo(-HALF_WIDTH, 0);
  back.lineTo(HALF_WIDTH, 0);
  back.lineTo(0, HEIGHT);
  back.closePath();
  add(new THREE.ShapeGeometry(back), flatMaterial(0x7f6044), [0, 0, -DEPTH / 2 + 0.05]);

  // A bed of spruce boughs inside.
  add(new THREE.BoxGeometry(1.9, 0.12, 2.2), flatMaterial(0x3f5c34), [0, 0.06, -0.2]);
  add(new THREE.BoxGeometry(1.6, 0.08, 1.8), flatMaterial(0x4d6e3c), [0.05, 0.14, -0.25], [0, 0.06, 0]);

  group.traverse((child) => (child.castShadow = child.receiveShadow = true));
  return group;
}

// Snare trap: a small wooden frame with a wire loop, base at the origin.
export function trap() {
  const group = new THREE.Group();
  const wood = material(0x8a6a45);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), wood);
  base.position.y = 0.025;
  for (const x of [-0.3, 0.3]) {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6), wood);
    stake.position.set(x, 0.2, 0);
    group.add(stake);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.38;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 6, 20), material(0xb8bcc0, 0.4));
  loop.position.y = 0.2;
  group.add(base, bar, loop);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// Fire pit: a ring of stones around a few crossed logs, base at the origin.
export function campfire() {
  const group = new THREE.Group();
  const stone = material(0x7d7a74, 0.95);
  // A dense ring of soft, flattened stones, nearly touching (matches campfire.glb).
  const stones = 14;
  for (let i = 0; i < stones; i++) {
    const angle = (i / stones) * Math.PI * 2;
    const size = 0.11 + 0.015 * Math.sin(i * 2.7);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), stone);
    rock.position.set(Math.cos(angle) * 0.5, size * 0.3, Math.sin(angle) * 0.5);
    rock.scale.set(1.25, 0.55, 0.9);
    rock.rotation.y = -angle + 0.3 * Math.sin(i * 1.9); // long side along the ring
    group.add(rock);
  }
  for (let i = 0; i < 4; i++) {
    // Each log gets its own material so it can be darkened when the fire burns out.
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 8), material(0x6b4a32));
    log.userData.burns = true;
    // Tip the log over, then turn it to face a different way from the others.
    log.rotation.order = 'YXZ';
    log.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI * 2, 0);
    log.position.y = 0.16;
    group.add(log);
  }
  group.traverse((child) => (child.castShadow = child.receiveShadow = true));
  return group;
}

// Flickering flames: a cluster of low-poly flame tongues leaning out at different heights, red
// at the edges and yellow at the hot core, over a bed of glowing embers. They glow by themselves
// (not lit by the sun). Base at the origin; campfires.js flickers each child separately.
export function flames() {
  const group = new THREE.Group();
  const tongues = [
    // [x, z, height, radius, lean (radians), colour]
    [0, 0, 0.62, 0.13, 0, 0xffc04a],
    [0.1, 0.05, 0.46, 0.1, 0.25, 0xff8a2e],
    [-0.09, 0.07, 0.42, 0.1, -0.3, 0xff8a2e],
    [0.03, -0.11, 0.38, 0.09, 0.3, 0xf2652a],
    [-0.11, -0.06, 0.32, 0.08, -0.35, 0xf2652a],
    [0.13, -0.06, 0.28, 0.07, 0.4, 0xe8562a],
    [-0.02, 0.12, 0.3, 0.07, -0.2, 0xe8562a],
    [0.01, 0.0, 0.36, 0.06, 0.05, 0xffe08a], // the bright core
  ];
  tongues.forEach(([x, z, height, radius, lean, color], i) => {
    // A 5-sided teardrop: widest a little above the base, drawn to a point.
    const points = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(radius * 0.7, height * 0.08),
      new THREE.Vector2(radius, height * 0.3),
      new THREE.Vector2(radius * 0.55, height * 0.65),
      new THREE.Vector2(0, height),
    ];
    const tongue = new THREE.Mesh(
      new THREE.LatheGeometry(points, 5, i * 0.7),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false }),
    );
    tongue.position.set(x, 0, z);
    tongue.rotation.set(Math.sin(i * 2.1) * lean, i * 1.3, Math.cos(i * 2.1) * lean);
    group.add(tongue);
  });
  // Embers: a few glowing chunks in the middle of the pit, under the flames.
  const ember = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), ember);
    chunk.position.set(Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12);
    chunk.userData.ember = true; // campfires.js leaves embers alone when it flickers the flames
    group.add(chunk);
  }
  // Once it's loaded, the curling, coloured tongues made in Blender (blender/flames.py) take the
  // place of these stand-in ones. Each has its origin at its base, so the flicker stretches it
  // up from there just the same.
  flameModel ??= loadModel('flames');
  flameModel.then((model) => {
    if (!model) return;
    for (const child of [...group.children]) if (!child.userData.ember) group.remove(child);
    model.traverse((part) => {
      if (!part.isMesh) return;
      const tongue = new THREE.Mesh(part.geometry, FLAME_MATERIAL);
      tongue.userData.keepColours = true; // (the torch's flame is on the player: outfits.js mustn't repaint its reds)
      tongue.position.copy(part.position);
      tongue.quaternion.copy(part.quaternion);
      group.add(tongue);
    });
  });
  return group;
}
let flameModel = null;
const FLAME_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });

// A torch: a stick with a dark, pitch-soaked wrap at the top. The origin is where the hand
// grips it; `userData.tip` is how far up the wrap's top is (where a flame goes).
export function torch() {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.62, 7), material(0x6b4a32));
  stick.position.y = 0.16;
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.13, 7), material(0x3a2a20));
  wrap.position.y = 0.46;
  group.add(stick, wrap);
  group.traverse((child) => (child.castShadow = true));
  group.userData.tip = 0.52;
  return group;
}

// A fire lookout tower, about 15 m tall, base at the origin: four timber legs leaning in,
// cross-braced on every storey, flights of stairs switching back between landings, and a cab
// with windows all round and a roof. `layout` is TOWER in lookout.js: the stairs, landings
// and floors here are where the player can walk. The cab's roof and windows are marked
// `userData.roof`, so they can fade away while the player is inside.
export function lookoutTower(layout) {
  const timber = material(0x6b4a32);
  const dark = material(0x54392a);
  const plank = material(0x8a6a45);
  const group = new THREE.Group();
  const add = (mesh) => {
    group.add(mesh);
    return mesh;
  };
  // A square beam from a to b.
  const beam = (a, b, width, mat = timber) => {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, from.distanceTo(to), width), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return add(mesh);
  };
  // A flat board: x from x0 to x1, z from z0 to z1, its top at height y.
  const board = (x0, x1, z0, z1, y, mat = plank) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, z1 - z0), mat);
    mesh.position.set((x0 + x1) / 2, y - 0.05, (z0 + z1) / 2);
    mesh.userData.floor = true; // fades when it's between the camera and the player
    return add(mesh);
  };
  const { storey, flights, stairEnd, lane, laneHalf, landing, landingHalf, cab, balcony, door, cabFloor, legSpread } = layout;
  const spread = (y) => legSpread - (y / cabFloor) * 0.6; // the legs lean in as they rise
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  // (The legs reach a little below the foot, into the ground on a slope.)
  for (const [sx, sz] of corners) beam([sx * legSpread, -1.5, sz * legSpread], [sx * spread(cabFloor), cabFloor, sz * spread(cabFloor)], 0.3);
  for (let i = 0; i < flights; i++) {
    const y0 = i * storey;
    const y1 = y0 + storey;
    corners.forEach(([ax, az], k) => {
      const [bx, bz] = corners[(k + 1) % 4];
      const [s0, s1] = [spread(y0), spread(y1)];
      // A crossbar at the top of the storey, and an X across each side.
      beam([ax * s1, y1, az * s1], [bx * s1, y1, bz * s1], 0.14);
      beam([ax * s0, y0 + 0.2, az * s0], [bx * s1, y1, bz * s1], 0.09, dark);
      beam([bx * s0, y0 + 0.2, bz * s0], [ax * s1, y1, az * s1], 0.09, dark);
    });
    // The flight of stairs: a sloping board with treads, and a handrail.
    const z = i % 2 ? lane : -lane;
    const [from, to] = i % 2 ? [stairEnd, -stairEnd] : [-stairEnd, stairEnd];
    const run = to - from;
    const slope = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(run, storey), 0.08, laneHalf * 2), dark);
    slope.position.set((from + to) / 2, y0 + storey / 2 - 0.06, z);
    slope.rotation.z = Math.atan2(storey, run);
    slope.userData.floor = true;
    add(slope);
    for (let t = 0; t < 1; t += 1 / 12) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, laneHalf * 2), plank);
      tread.position.set(from + run * (t + 1 / 24), y0 + storey * (t + 1 / 24), z);
      tread.userData.floor = true;
      add(tread);
    }
    const rail = z + Math.sign(z) * laneHalf;
    beam([from, y0 + 0.9, rail], [to, y1 + 0.9, rail], 0.05);
    // A landing at the top of every flight but the last.
    if (i < flights - 1) {
      const side = Math.sign(to);
      board(Math.min(side * stairEnd, side * landing), Math.max(side * stairEnd, side * landing), -landingHalf, landingHalf, y1);
    }
  }
  // The cab floor, with a hatch where the last flight comes up.
  const top = (flights - 1) % 2 ? lane : -lane; // (the last flight's lane)
  const wide = cab + 0.2;
  board(-wide, wide, -wide, top - laneHalf, cabFloor);
  board(-wide, wide, top + laneHalf, wide, cabFloor);
  board(-wide, -stairEnd, top - laneHalf, top + laneHalf, cabFloor);
  board(stairEnd, wide, top - laneHalf, top + laneHalf, cabFloor);
  // The balcony: boards all round the cab, a railing, and braces underneath.
  board(-balcony, balcony, -balcony, -wide, cabFloor);
  board(-balcony, balcony, wide, balcony, cabFloor);
  board(-balcony, -wide, -wide, wide, cabFloor);
  board(wide, balcony, -wide, wide, cabFloor);
  const railing = [];
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    const [x0, z0, x1, z1] = [ax * balcony, az * balcony, bx * balcony, bz * balcony];
    railing.push(beam([x0, cabFloor + 1, z0], [x1, cabFloor + 1, z1], 0.08));
    railing.push(beam([x0, cabFloor + 0.5, z0], [x1, cabFloor + 0.5, z1], 0.05));
    for (let t = 0; t < 1; t += 0.25) {
      railing.push(beam([x0 + (x1 - x0) * t, cabFloor, z0 + (z1 - z0) * t], [x0 + (x1 - x0) * t, cabFloor + 1.05, z0 + (z1 - z0) * t], 0.09));
    }
  }
  for (const [sx, sz] of corners) beam([sx * spread(cabFloor - 2.5), cabFloor - 2.5, sz * spread(cabFloor - 2.5)], [sx * (balcony - 0.2), cabFloor - 0.1, sz * (balcony - 0.2)], 0.12, dark);

  // Waist-high walls, then windows and a roof, with a doorway out onto the balcony in the +x
  // wall. Walls, windows and the roof (`cutaway`, `roof`) fade when they're between the camera
  // and the player.
  const wallMat = material(0x8a6a45);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3a44, roughness: 0.2, transparent: true, opacity: 0.55 });
  const cutaway = (mesh) => {
    mesh.userData.cutaway = true;
    return mesh;
  };
  // A stretch of wall and window from (x0, z0) to (x1, z1).
  const wallFrom = (x0, z0, x1, z1) => {
    const [w, d] = [Math.max(Math.abs(x1 - x0), 0.08), Math.max(Math.abs(z1 - z0), 0.08)];
    const [x, z] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const wall = cutaway(add(new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), wallMat)));
    wall.position.set(x, cabFloor + 0.5, z);
    const glass = cutaway(add(new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), glassMat)));
    glass.position.set(x, cabFloor + 1.6, z);
  };
  wallFrom(-cab, cab, cab, cab);
  wallFrom(-cab, -cab, cab, -cab);
  wallFrom(-cab, -cab, -cab, cab);
  wallFrom(cab, -cab, cab, -door);
  wallFrom(cab, door, cab, cab);
  // A beam along the top of the windows (and over the doorway), under the roof.
  for (const [w, d, x, z] of [[cab * 2, 0.14, 0, cab], [cab * 2, 0.14, 0, -cab], [0.14, cab * 2, cab, 0], [0.14, cab * 2, -cab, 0]]) {
    const header = cutaway(add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), timber)));
    header.position.set(x, cabFloor + 2.27, z);
  }
  for (const [sx, sz] of corners) cutaway(beam([sx * cab, cabFloor, sz * cab], [sx * cab, cabFloor + 2.3, sz * cab], 0.16));
  for (const s of [-1, 1]) cutaway(beam([cab, cabFloor, s * door], [cab, cabFloor + 2.2, s * door], 0.12)); // the door frame
  // The roof, with short eaves (the balcony is open to the sky).
  const roof = new THREE.Mesh(new THREE.ConeGeometry((cab + 0.6) * Math.SQRT2, 1.9, 4), material(0x5a5148));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = cabFloor + 3.2;
  roof.userData.roof = true;
  add(roof);
  group.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return group;
}

// The fire lookout's fire finder (an Osborne fire finder): a round map table on a post, with
// a sighting ring on top for taking bearings on smoke. Base at the origin.
export function fireFinder() {
  const wood = material(0x6b4a32);
  const brass = material(0xc9a24a, 0.5);
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.95, 8), wood);
  post.position.y = 0.475;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), wood);
  top.position.y = 0.98;
  const chart = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 16), material(0xe6d8b4));
  chart.position.y = 1.02;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 4, 24), brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.04;
  const sights = [-1, 1].map((s) => {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.06), brass);
    sight.position.set(s * 0.47, 1.12, 0);
    return sight;
  });
  group.add(post, top, chart, ring, ...sights);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// Binoculars on a post, for scanning the country from a lookout's balcony. Base at the
// origin; they look out along +x.
export function mountedBinoculars() {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.25, 8), material(0x3a3430, 0.6));
  post.position.y = 0.625;
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.26), material(0x3a3430, 0.6));
  yoke.position.y = 1.3;
  const body = material(0x2a2e30, 0.5);
  const tubes = [-0.07, 0.07].map((z) => {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 10), body);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0.04, 1.4, z);
    return tube;
  });
  const lenses = [-0.07, 0.07].map((z) => {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 10), material(0x6a8aa0, 0.15));
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.205, 1.4, z);
    return lens;
  });
  group.add(post, yoke, ...tubes, ...lenses);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A camp cot with a rolled blanket, about 2 m long along x, base at the origin.
export function cot() {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.75), material(0x4f5b3a));
  frame.position.y = 0.42;
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.72), material(0x8c3a2a));
  blanket.position.set(0.3, 0.49, 0);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), material(0xd8c49a));
  roll.rotation.x = Math.PI / 2;
  roll.position.set(-0.8, 0.56, 0);
  group.add(frame, blanket, roll);
  for (const [x, z] of [[-0.95, -0.33], [0.95, -0.33], [-0.95, 0.33], [0.95, 0.33]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), material(0x3a3430));
    leg.position.set(x, 0.21, z);
    group.add(leg);
  }
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A tall metal ranger's locker, base at the origin, its door facing +z and hinged on the
// left (`userData.open(true)` swings it open).
export function locker() {
  const steel = material(0x5a6a5a, 0.6);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), steel);
  body.position.y = 0.9;
  const hinge = new THREE.Group();
  hinge.position.set(-0.35, 0, 0.26);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.74, 0.03), material(0x6a7a68, 0.6));
  door.position.set(0.34, 0.9, 0);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.04), material(0x2f2a28));
  handle.position.set(0.6, 0.95, 0.03);
  const vents = [1.45, 1.55, 1.65].map((y) => {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.01), material(0x3a4a3a));
    vent.position.set(0.34, y, 0.02);
    return vent;
  });
  hinge.add(door, handle, ...vents);
  group.add(body, hinge);
  group.userData.open = (open) => (hinge.rotation.y = open ? -1.9 : 0);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A wooden supply crate, base at the origin, with a lid that hinges open at the back
// (`userData.lid`: set its rotation.x to about -1.9 to open it).
export function supplyCrate() {
  const wood = material(0x4f5b3a); // olive-painted, so it stands out from floorboards
  const band = material(0x2f3a28);
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.6), wood);
  box.position.y = 0.275;
  for (const x of [-0.35, 0.35]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.57, 0.62), band);
    strap.position.set(x, 0.275, 0);
    group.add(strap);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.55, -0.3); // the hinge, along the back edge
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.08, 0.62), wood);
  top.position.set(0, 0.04, 0.3);
  const stencil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.2), material(0xa83a2a));
  stencil.position.set(0, 0.085, 0.3);
  lid.add(top, stencil);
  group.add(box, lid);
  group.userData.lid = lid;
  group.userData.open = (open) => (lid.rotation.x = open ? -1.9 : 0);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// Axe held in the player's hand. The origin is where the hand grips the handle.
export function axe() {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.75, 8), material(0x8a6a45));
  handle.position.y = 0.25;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.22), material(0x9aa0a6, 0.4));
  head.position.set(0, 0.55, 0.08);
  group.add(handle, head);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// Angular boulder about 1 m across, base at the origin: grey stone with pale lichen on top.
export function rock() {
  const geometry = new THREE.IcosahedronGeometry(0.6, 1);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    // Lumpy, but the same every time (no randomness), so all copies share one shape.
    const bump = 1 + 0.16 * Math.sin(point.x * 7 + 1) * Math.cos(point.z * 6) + 0.08 * Math.sin(point.y * 11);
    point.multiplyScalar(bump);
    position.setXYZ(i, point.x, Math.max(point.y * 0.7, -0.25), point.z * 0.85);
  }
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  const stone = new THREE.Color(0x76766f);
  const dark = new THREE.Color(0x58585a);
  const lichen = new THREE.Color(0x949266);
  const normal = faceted.attributes.normal;
  const p = faceted.attributes.position;
  const colors = [];
  for (let i = 0; i < p.count; i++) {
    const c = stone.clone().lerp(dark, 0.5 + 0.5 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 5));
    if (normal.getY(i) > 0.6) c.lerp(lichen, 0.4);
    colors.push(c.r, c.g, c.b);
  }
  faceted.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(faceted, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  mesh.position.y = 0.15;
  return mesh;
}

// Rabbit, about 0.55 m long (bigger than life, for visibility), feet at the origin, facing +z.
export function rabbit() {
  const fur = material(0x8a7a66);
  const rabbit = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), fur);
  body.scale.set(1, 0.95, 1.35);
  body.position.y = 0.16;
  const head = new THREE.Group();
  head.position.set(0, 0.28, 0.17);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), fur);
  const ear = new THREE.CapsuleGeometry(0.025, 0.14, 4, 8);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(ear, fur);
    e.position.set(side * 0.04, 0.12, -0.02);
    e.rotation.set(-0.25, 0, side * 0.15);
    head.add(e);
  }
  head.add(skull);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), material(0xf2efe8));
  tail.position.set(0, 0.17, -0.21);
  rabbit.add(body, head, tail);
  // A bit bigger than life, so rabbits are easy to spot from above.
  rabbit.scale.setScalar(1.4);
  rabbit.userData.head = head;
  rabbit.traverse((child) => (child.castShadow = true));
  return rabbit;
}

// Deer, about 1.6 m tall at the head, feet at the origin, facing +z.
export function deer() {
  const coat = material(0x8b5a3c);
  const pale = material(0xe8dcc8);
  const deer = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.75, 8, 16), coat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.95;
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.6, 6, 12), pale);
  belly.rotation.x = Math.PI / 2;
  belly.position.y = 0.86;

  const legs = [];
  for (const [x, z] of [[-0.14, 0.4], [0.14, 0.4], [-0.14, -0.4], [0.14, -0.4]]) {
    // Each leg hangs from a hip pivot so it can swing.
    const hip = new THREE.Group();
    hip.position.set(x, 0.85, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.85, 8), coat);
    leg.position.y = -0.425;
    hip.add(leg);
    legs.push(hip);
    deer.add(hip);
  }

  // Neck and head pivot at the shoulders so the deer can lower its head to graze.
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0.5);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 6, 12), coat);
  neck.position.set(0, 0.2, 0.1);
  neck.rotation.x = 0.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), coat);
  skull.scale.set(0.9, 0.9, 1.5);
  skull.position.set(0, 0.45, 0.25);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), material(0x2a2420));
  nose.position.set(0, 0.42, 0.44);
  const earGeometry = new THREE.ConeGeometry(0.05, 0.16, 8);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeometry, coat);
    ear.position.set(side * 0.1, 0.58, 0.15);
    ear.rotation.z = -side * 0.7;
    head.add(ear);
  }
  head.add(neck, skull, nose);

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pale);
  tail.position.set(0, 1.05, -0.62);
  deer.add(body, belly, head, tail);
  deer.userData.legs = legs;
  deer.userData.head = head;
  deer.traverse((child) => (child.castShadow = true));
  return deer;
}

// About 1.8 m tall, feet at the origin, facing +z.
export function survivor() {
  const person = new THREE.Group();
  const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 8, 16), material(0xa8432c));
  coat.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), material(0xe0b896));
  head.position.y = 1.45;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), material(0x5a4a3a));
  hood.position.y = 1.47;
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.25), material(0x6b5a3a));
  backpack.position.set(0, 0.95, -0.35);
  backpack.name = 'player-pack'; // shown once the player has found the backpack
  person.add(coat, head, hood, backpack);
  person.traverse((child) => (child.castShadow = true));
  return person;
}

// A loose stone you can pick up, about 0.2 m across (stand-in until stone.glb lands).
export function stone() {
  const mesh = rock();
  mesh.scale.setScalar(0.25);
  mesh.position.y = 0.04;
  return mesh;
}

// A simple bow, about 1.2 m tall: a curved stave and a straight string, upright along y,
// facing +z (stand-in until bow.glb lands).
export function bow() {
  const group = new THREE.Group();
  const stave = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 6, 16, Math.PI * 0.55), material(0x7a5232));
  // Rotate the arc so it bows forward (+z) and stands upright.
  stave.rotation.set(0, Math.PI / 2, Math.PI / 2 - Math.PI * 0.275);
  stave.position.z = -0.55;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.15, 4), material(0xe8e0cc));
  string.position.z = -0.55 + 0.75 * Math.cos(Math.PI * 0.275);
  group.add(stave, string);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// An arrow about 0.8 m long, pointing along +z (stand-in until arrow.glb lands).
export function arrow() {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5), material(0xb48a5a));
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 5), material(0x6f6f6a, 0.5));
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.44;
  const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.07, 0.14), material(0xd8d2c4));
  fletch.position.z = -0.34;
  group.add(shaft, head, fletch);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A low berry bush, about 0.9 m tall, base at the origin (stand-in until berry-bush.glb lands).
// userData.berries is the cluster of berries, hidden once the bush has been picked.
export function berryBush() {
  const bush = new THREE.Group();
  const leaf = material(0x3f5a2e);
  for (const [x, y, z, r] of [[0, 0.4, 0, 0.45], [0.3, 0.3, 0.15, 0.32], [-0.28, 0.32, -0.1, 0.34], [0.05, 0.62, -0.1, 0.3]]) {
    const clump = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf);
    clump.position.set(x, y, z);
    bush.add(clump);
  }
  const berries = new THREE.Group();
  const red = material(0xb3243a, 0.5);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), red);
    berry.position.set(Math.cos(a) * 0.42, 0.25 + (i % 4) * 0.13, Math.sin(a) * 0.42);
    berries.add(berry);
  }
  bush.add(berries);
  bush.userData.berries = berries;
  bush.traverse((child) => (child.castShadow = true));
  return bush;
}

// A stocky wild boar, about 0.8 m at the shoulder, facing +z (stand-in until boar.glb lands).
export function boar() {
  const bristle = material(0x4a3a2e);
  const boar = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 8, 14), bristle);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.62;
  const legs = [];
  for (const [x, z] of [[-0.16, 0.32], [0.16, 0.32], [-0.16, -0.32], [0.16, -0.32]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.45, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.45, 6), bristle);
    leg.position.y = -0.225;
    hip.add(leg);
    legs.push(hip);
    boar.add(hip);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.55);
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 8), bristle);
  skull.rotation.x = Math.PI / 2;
  skull.position.z = 0.15;
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8), material(0x8a5a50));
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 0.42;
  head.add(skull, snout);
  for (const side of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 5), material(0xeee6d0));
    tusk.position.set(side * 0.09, -0.05, 0.36);
    tusk.rotation.x = -0.6;
    head.add(tusk);
  }
  boar.add(body, head);
  boar.userData.legs = legs;
  boar.userData.head = head;
  boar.traverse((child) => (child.castShadow = true));
  return boar;
}

// A stone knife, about 0.3 m long: a wooden grip and a knapped stone blade along +y,
// origin at the grip (stand-in until knife.glb lands).
export function knife() {
  const group = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.12, 6), material(0x7a5232));
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), material(0x8a8880, 0.6));
  blade.scale.z = 0.4;
  blade.position.y = 0.16;
  group.add(grip, blade);
  group.traverse((child) => (child.castShadow = true));
  return group;
}
