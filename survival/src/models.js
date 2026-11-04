import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHUNK_SIZE, chunkKey, chunkOf, chunksAround } from './stream.js';

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

// Draws many copies of a model cheaply. Only the copies in the chunks around the player are
// drawn (see drawModelsAround), so there can be tens of thousands of copies across the map.
// Each drawn chunk gets its own InstancedMesh per mesh in the model, so three.js can skip the
// chunks the camera can't see, and those outside the sun's small shadow area when it draws
// shadows (with one mesh for everything, every copy nearby was drawn twice every frame).
// `transforms` holds one Matrix4 (position/rotation/scale) per copy.
// `changeMaterial`, if given, swaps each material for a modified one.
// `tints`, if given, holds one THREE.Color per copy to multiply its colours by.
// `positions`, if given, holds { x, z } per copy: where it belongs on the map. Otherwise it's
// taken from the transforms (pass it when copies start hidden, like stumps before a tree's cut).
// Call `holder.setInstance(i, matrix)` to move, rotate or hide (scale 0) one copy.
const CHUNK_REACH = 24; // meters a copy can stick up or out past its chunk (a tall tree, a falling one)
export function instancedModel(name, placeholder, transforms, changeMaterial, tints, positions) {
  transforms = transforms.map((t) => t.clone());
  const holder = new THREE.Group();
  const chunks = new Map(); // chunk key → { indices, centre } of the copies in it
  const chunkOfCopy = new Array(transforms.length);
  const slotOf = new Int32Array(transforms.length); // copy → its place in its chunk's meshes
  transforms.forEach((transform, i) => {
    const x = positions ? positions[i].x : transform.elements[12];
    const z = positions ? positions[i].z : transform.elements[14];
    const [cx, cz] = chunkOf(x, z);
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, { indices: [], cx, cz, heights: 0 });
    const chunk = chunks.get(key);
    slotOf[i] = chunk.indices.length;
    chunk.indices.push(i);
    chunk.heights += transform.elements[13];
    chunkOfCopy[i] = chunk;
  });

  let template = placeholder;
  const materials = new Map(); // each original material → its changed copy, made once
  const matrix = new THREE.Matrix4();
  const built = new Map(); // chunk key → [{ mesh, local }] for each mesh in the model

  const change = (m) => {
    if (!changeMaterial) return m;
    if (!materials.has(m)) materials.set(m, changeMaterial(m));
    return materials.get(m);
  };
  // Makes one chunk's meshes, filled with its copies.
  const buildChunk = (key) => {
    const chunk = chunks.get(key);
    const parts = [];
    template.updateMatrixWorld(true);
    // A sphere round the whole chunk, with room for what stands up out of it.
    const sphere = new THREE.Sphere(
      new THREE.Vector3((chunk.cx + 0.5) * CHUNK_SIZE, chunk.heights / chunk.indices.length, (chunk.cz + 0.5) * CHUNK_SIZE),
      CHUNK_SIZE * 0.71 + CHUNK_REACH,
    );
    template.traverse((child) => {
      if (!child.isMesh) return;
      const material = Array.isArray(child.material) ? child.material.map(change) : change(child.material);
      const mesh = new THREE.InstancedMesh(child.geometry, material, chunk.indices.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.boundingSphere = sphere;
      const local = child.matrixWorld.clone();
      chunk.indices.forEach((i, slot) => {
        mesh.setMatrixAt(slot, matrix.multiplyMatrices(transforms[i], local));
        if (tints) mesh.setColorAt(slot, tints[i]);
      });
      holder.add(mesh);
      parts.push({ mesh, local });
    });
    built.set(key, parts);
  };
  const dropChunk = (key) => {
    for (const { mesh } of built.get(key)) {
      holder.remove(mesh);
      mesh.dispose();
    }
    built.delete(key);
  };

  let keys = [];
  const stream = {
    draw(newKeys) {
      keys = newKeys;
      const wanted = new Set(keys.filter((key) => chunks.has(key)));
      for (const key of [...built.keys()]) if (!wanted.has(key)) dropChunk(key);
      for (const key of wanted) if (!built.has(key)) buildChunk(key);
    },
  };
  streamed.add(stream);
  stream.draw(currentKeys);
  loadModel(name).then((model) => {
    if (!model) return;
    template = model;
    for (const key of [...built.keys()]) dropChunk(key);
    stream.draw(keys);
  });

  holder.setInstance = (i, transform) => {
    transforms[i] = transform.clone();
    const parts = built.get(chunkKey(chunkOfCopy[i].cx, chunkOfCopy[i].cz));
    if (!parts) return;
    for (const { mesh, local } of parts) {
      mesh.setMatrixAt(slotOf[i], matrix.multiplyMatrices(transforms[i], local));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return holder;
}

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

// Makes the next drawModelsAround redraw (after the draw distance changes).
export function redrawModels() {
  currentChunk = null;
}

// A transform that hides a copy.
export const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// Shows `placeholder` until public/models/<name>.glb loads, then a copy of that in its place.
// Returns a group to put in the scene; anything else added to it (a torch's flame) stays.
// `hinges` lists the model's parts that open, and how: [{ node: 'chest-lid', axis: 'x',
// angle: -1.8 }] (the parts' origins are their hinges: see blender/props.py). The group's
// `userData.open(open)` swings them (or the stand-in's own parts) open or shut.
const swapModels = new Map(); // name → promise of the loaded model, loaded once
export function swappable(name, placeholder, hinges = []) {
  const holder = new THREE.Group();
  holder.add(placeholder);
  let model = null;
  let isOpen = false;
  holder.userData.open = (open) => {
    isOpen = open;
    if (!model) return placeholder.userData.open?.(open);
    for (const { node, axis, angle } of hinges) {
      const part = model.getObjectByName(node);
      if (!part) continue;
      part.userData.rest ??= part.rotation[axis];
      part.rotation[axis] = part.userData.rest + (open ? angle : 0);
    }
  };
  if (!swapModels.has(name)) swapModels.set(name, loadModel(name));
  swapModels.get(name).then((loaded) => {
    if (!loaded) return;
    model = loaded.clone();
    model.traverse((child) => {
      if (child.isMesh) child.castShadow = child.receiveShadow = true;
    });
    holder.remove(placeholder);
    holder.add(model);
    holder.userData.open(isOpen);
    holder.userData.onSwap?.(model);
  });
  return holder;
}
