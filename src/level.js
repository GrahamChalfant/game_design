import * as THREE from 'three';

// Each platform: [x, y, z, width, height, depth, color]. y is the platform's top surface.
const PLATFORMS = [
  [0, 0, 0, 30, 1, 30, 0x5fa55a], // ground
  [6, 1, 4, 4, 1, 4, 0xc9a26b],
  [10, 2.5, -1, 3, 1, 3, 0xc9a26b],
  [6, 4, -6, 3, 1, 3, 0xc9a26b],
  [0, 5.5, -8.5, 4, 1, 3, 0xc9a26b],
  [-7, 1.5, 5, 5, 1, 2, 0x8a8f99],
  [-9, 3, -2, 2, 1, 6, 0x8a8f99],
];

const COINS = [
  [0, 1, 6],
  [6, 2, 4],
  [10, 3.5, -1],
  [6, 5, -6],
  [0, 6.5, -8.5],
  [-7, 2.5, 5],
  [-9, 4, -4],
  [-10, 1, -10],
];

export function buildLevel(scene) {
  const platforms = [];
  for (const [x, top, z, w, h, d, color] of PLATFORMS) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(x, top - h / 2, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    platforms.push(new THREE.Box3().setFromObject(mesh));
  }

  const coinGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24).rotateX(Math.PI / 2);
  const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3 });
  const coins = COINS.map(([x, y, z]) => {
    const mesh = new THREE.Mesh(coinGeometry, coinMaterial);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  });

  return { platforms, coins, spawn: new THREE.Vector3(0, 0, 8) };
}
