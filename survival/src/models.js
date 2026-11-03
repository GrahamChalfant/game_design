import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { chunkKey, chunkOf, chunksAround } from './stream.js';

const loader = new GLTFLoader();
// Vite serves public/ at the site root; a plain web server serves it at /public/.
const MODEL_FOLDERS = ['models/', 'public/models/'];

// Loads public/models/<name>.glb. Resolves to the model, or null if there isn't one yet.
export function loadModel(name, folders = MODEL_FOLDERS) {
  if (folders.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    loader.load(
      folders[0] + name + '.glb',
      (gltf) => {
        gltf.scene.animations = gltf.animations;
        resolve(gltf.scene);
      },
      undefined,
      () => resolve(loadModel(name, folders.slice(1))),
    );
  });
}

// Draws many copies of a model cheaply: one InstancedMesh per mesh in the model. Only the
// copies in the chunks around the player are drawn (see drawModelsAround), so there can be
// tens of thousands of copies across the map.
// `transforms` holds one Matrix4 (position/rotation/scale) per copy.
// `changeMaterial`, if given, swaps each material for a modified one.
// `tints`, if given, holds one THREE.Color per copy to multiply its colours by.
// `positions`, if given, holds { x, z } per copy: where it belongs on the map. Otherwise it's
// taken from the transforms (pass it when copies start hidden, like stumps before a tree's cut).
// Call `holder.setInstance(i, matrix)` to move, rotate or hide (scale 0) one copy.
export function instancedModel(name, placeholder, transforms, changeMaterial, tints, positions) {
  transforms = transforms.map((t) => t.clone());
  const holder = new THREE.Group();
  const chunks = new Map(); // chunk key → indices of the copies in it
  transforms.forEach((transform, i) => {
    const x = positions ? positions[i].x : transform.elements[12];
    const z = positions ? positions[i].z : transform.elements[14];
    const [cx, cz] = chunkOf(x, z);
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(i);
  });

  const slotOf = new Int32Array(transforms.length).fill(-1); // copy → its place in the buffers
  let shown = []; // the copies being drawn, in buffer order
  let parts = []; // { mesh, local } per mesh in the model
  let template = placeholder;
  const materials = new Map(); // each original material → its changed copy, made once

  const matrix = new THREE.Matrix4();
  const write = (slot, i) => {
    for (const { mesh, local } of parts) mesh.setMatrixAt(slot, matrix.multiplyMatrices(transforms[i], local));
  };
  // Makes the InstancedMeshes, with room for at least `capacity` copies.
  const build = (capacity) => {
    for (const { mesh } of parts) mesh.dispose();
    holder.clear();
    parts = [];
    template.updateMatrixWorld(true);
    template.traverse((child) => {
      if (!child.isMesh) return;
      const change = (m) => {
        if (!changeMaterial) return m;
        if (!materials.has(m)) materials.set(m, changeMaterial(m));
        return materials.get(m);
      };
      const material = Array.isArray(child.material) ? child.material.map(change) : change(child.material);
      const mesh = new THREE.InstancedMesh(child.geometry, material, capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Copies are spread around and can move, so don't let three.js skip drawing them.
      mesh.frustumCulled = false;
      if (tints) mesh.setColorAt(0, WHITE); // makes the colour buffer
      holder.add(mesh);
      parts.push({ mesh, local: child.matrixWorld.clone() });
    });
  };
  // Fills the buffers with the copies in `keys` (a list of chunk keys).
  const fill = (keys) => {
    for (const i of shown) slotOf[i] = -1;
    shown = keys.flatMap((key) => chunks.get(key) ?? []);
    const capacity = parts[0]?.mesh.instanceMatrix.count ?? 0;
    if (shown.length > capacity || parts.length === 0) build(Math.max(64, Math.ceil(shown.length * 1.5)));
    shown.forEach((i, slot) => {
      slotOf[i] = slot;
      write(slot, i);
      if (tints) for (const { mesh } of parts) mesh.setColorAt(slot, tints[i]);
    });
    for (const { mesh } of parts) {
      mesh.count = shown.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  let keys = [];
  const stream = {
    draw(newKeys) {
      keys = newKeys;
      fill(keys);
    },
  };
  streamed.add(stream);
  stream.draw(currentKeys);
  loadModel(name).then((model) => {
    if (!model) return;
    template = model;
    build(Math.max(64, Math.ceil(shown.length * 1.5)));
    fill(keys);
  });

  holder.setInstance = (i, transform) => {
    transforms[i] = transform.clone();
    const slot = slotOf[i];
    if (slot < 0) return;
    write(slot, i);
    for (const { mesh } of parts) mesh.instanceMatrix.needsUpdate = true;
  };
  return holder;
}

const WHITE = new THREE.Color(1, 1, 1);
const streamed = new Set();
let currentKeys = [];
let currentChunk = null;

// Draws the copies around (x, z). Cheap to call every frame: it only does work when the
// player crosses into another chunk.
export function drawModelsAround(x, z) {
  const chunk = chunkOf(x, z).join();
  if (chunk === currentChunk) return;
  currentChunk = chunk;
  currentKeys = chunksAround(x, z).map((c) => c.key);
  for (const stream of streamed) stream.draw(currentKeys);
}

// A transform that hides a copy.
export const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
