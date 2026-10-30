import * as THREE from 'three';

// Simple stand-ins, used until Blender models exist in public/models/.
const material = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });

const BARK = material(0x5a4030);

// Tall, slender conifer, about 9 m tall, base at the origin.
export function conifer() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 2.4, 10), BARK);
  trunk.position.y = 1.2;
  tree.add(trunk);

  const needles = material(0x2e5e38);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const radius = 1.9 - t * 1.4;
    const height = 2.6 - t * 0.9;
    const tier = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 16, 1), needles);
    tier.position.y = 1.6 + i * 1.15 + height / 2;
    tree.add(tier);
  }
  return tree;
}

// Round, leafy tree standing in the fields, about 6 m tall, base at the origin.
export function broadleaf() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 3, 10), BARK);
  trunk.position.y = 1.5;
  tree.add(trunk);

  const leaves = [material(0x5d8c2f), material(0x76a03a), material(0x4a7a2a)];
  const blobs = [
    [0, 4.2, 0, 1.9],
    [1.2, 3.6, 0.4, 1.3],
    [-1.1, 3.7, -0.3, 1.35],
    [0.3, 3.5, -1.1, 1.25],
    [-0.4, 3.4, 1.1, 1.2],
    [0.2, 5.3, 0.2, 1.2],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), leaves[i % leaves.length]);
    blob.position.set(x, y, z);
    tree.add(blob);
  });
  return tree;
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
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), stone);
    rock.position.set(Math.cos(angle) * 0.55, 0.08, Math.sin(angle) * 0.55);
    rock.scale.set(1, 0.7, 1);
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

// Flickering flames. They glow by themselves (not lit by the sun), base at the origin.
export function flames() {
  const group = new THREE.Group();
  const layers = [
    [0.32, 0.9, 0xff6a1f, 0.85],
    [0.22, 0.75, 0xffa53a, 0.9],
    [0.12, 0.55, 0xffe08a, 0.95],
  ];
  for (const [radius, height, color, opacity] of layers) {
    const geometry = new THREE.ConeGeometry(radius, height, 12, 1, true).translate(0, height / 2, 0);
    const flame = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
    );
    group.add(flame);
  }
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

// Rounded boulder about 1 m across, base at the origin.
export function rock() {
  const geometry = new THREE.IcosahedronGeometry(0.6, 3);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    // Lumpy, but the same every time (no randomness), so all copies share one shape.
    const bump = 1 + 0.12 * Math.sin(point.x * 7) * Math.cos(point.z * 6) + 0.06 * Math.sin(point.y * 11);
    point.multiplyScalar(bump);
    position.setXYZ(i, point.x, point.y * 0.65, point.z * 0.85);
  }
  geometry.computeVertexNormals();
  const stone = new THREE.Mesh(geometry, material(0x8b8a84, 0.95));
  stone.position.y = 0.2;
  return stone;
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
  person.add(coat, head, hood, backpack);
  person.traverse((child) => (child.castShadow = true));
  return person;
}
