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
