import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHUNK_SIZE, chunkKey, chunkOf, chunksAround } from './stream.js';
import { glassMaterial, paintedSurface, surfaceFor } from './look.js';
import { lodFade } from './seeThrough.js';

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
        // Every model's surfaces are painted, by what they're made of (look.js).
        gltf.scene.traverse((child) => {
          if (!child.isMesh) return;
          for (const material of [child.material].flat()) {
            if (material.name.startsWith('glass')) glassMaterial(material);
            else paintedSurface(material, surfaceFor(material.name));
          }
        });
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
// `detail`, if given, is { name, radius }: copies within `radius` meters of the player are
// drawn with that (richer) model instead, the rest with `name`'s. With `fade` (meters), the two
// are both drawn from `radius - fade` out to `radius`, the one fading into the other (see
// lodFade), so the detailed copies don't pop in. Which copies are near is worked out again as
// the player walks (see LOD_STEP).
// Call `holder.setInstance(i, matrix)` to move, rotate or hide (scale 0) one copy.
const CHUNK_REACH = 24; // meters a copy can stick up or out past its chunk (a tall tree, a falling one)
export function instancedModel(name, placeholder, transforms, changeMaterial, tints, positions, detail) {
  transforms = transforms.map((t) => t.clone());
  const holder = new THREE.Group();
  const chunks = new Map(); // chunk key → { indices, centre } of the copies in it
  const chunkOfCopy = new Array(transforms.length);
  transforms.forEach((transform, i) => {
    const x = positions ? positions[i].x : transform.elements[12];
    const z = positions ? positions[i].z : transform.elements[14];
    const [cx, cz] = chunkOf(x, z);
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, { indices: [], cx, cz, heights: 0, key });
    const chunk = chunks.get(key);
    chunk.indices.push(i);
    chunk.heights += transform.elements[13];
    chunkOfCopy[i] = chunk;
  });

  let template = placeholder;
  let detailTemplate = null;
  const materials = new Map(); // each original material → its changed copy, made once
  const matrix = new THREE.Matrix4();
  // chunk key → { far, near }: lists of { mesh, local }, one per mesh in the model (and in the
  // detailed model, while the chunk is near the player; otherwise near is null).
  const built = new Map();

  const change = (m) => {
    if (!changeMaterial) return m;
    if (!materials.has(m)) materials.set(m, changeMaterial(m));
    return materials.get(m);
  };
  // With a detailed model that fades: the band (meters from the player) where it and the plain
  // one are both drawn. The copies are sorted only every few meters (LOD_STEP) while the fade
  // follows the player exactly, so each list reaches a step further than the band: whatever
  // the fade shows is always there to show.
  const fades = Boolean(detail?.fade);
  const fadeFrom = fades ? detail.radius - detail.fade : 0;
  const nearReach = detail ? detail.radius + (fades ? LOD_STEP : 0) : 0;
  const farReach = fades ? Math.max(0, fadeFrom - LOD_STEP) : nearReach;
  // Each changed material, fading in (on the detailed model) or out (on the plain one).
  const faded = new Map();
  const fading = (m, fadeIn) => {
    const changed = change(m);
    if (!fades || !detailTemplate) return changed; // (no fading until the detailed model has loaded)
    if (!faded.has(changed)) faded.set(changed, new Map());
    const both = faded.get(changed);
    if (!both.has(fadeIn)) both.set(fadeIn, lodFade(changed, fadeIn, fadeFrom, detail.radius));
    return both.get(fadeIn);
  };
  // A sphere round the whole chunk, with room for what stands up out of it.
  const sphereOf = (chunk) => new THREE.Sphere(
    new THREE.Vector3((chunk.cx + 0.5) * CHUNK_SIZE, chunk.heights / chunk.indices.length, (chunk.cz + 0.5) * CHUNK_SIZE),
    CHUNK_SIZE * 0.71 + CHUNK_REACH,
  );
  // One InstancedMesh per mesh in `model`, with room for all the chunk's copies.
  const meshesFor = (model, chunk, sphere) => {
    const parts = [];
    const pick = (m) => fading(m, model === detailTemplate);
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!child.isMesh) return;
      const material = Array.isArray(child.material) ? child.material.map(pick) : pick(child.material);
      const mesh = new THREE.InstancedMesh(child.geometry, material, chunk.indices.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.boundingSphere = sphere;
      holder.add(mesh);
      parts.push({ mesh, local: child.matrixWorld.clone() });
    });
    return parts;
  };
  const dispose = (parts) => {
    for (const { mesh } of parts) {
      holder.remove(mesh);
      mesh.dispose();
    }
  };
  // How far (squared) the copy is from where the player was when they were last sorted.
  const away2 = (i) => {
    const e = transforms[i].elements;
    return (e[12] - lod.x) ** 2 + (e[14] - lod.z) ** 2;
  };
  // Is any of the chunk within the detailed model's reach of the player?
  const chunkNear = (chunk) => {
    const dx = Math.max(chunk.cx * CHUNK_SIZE - lod.x, 0, lod.x - (chunk.cx + 1) * CHUNK_SIZE);
    const dz = Math.max(chunk.cz * CHUNK_SIZE - lod.z, 0, lod.z - (chunk.cz + 1) * CHUNK_SIZE);
    return dx * dx + dz * dz < nearReach ** 2;
  };
  // Puts each of the chunk's copies into the near meshes, the far ones, or (in the band where
  // the one fades into the other) both.
  const fill = (key) => {
    const entry = built.get(key);
    const chunk = chunks.get(key);
    let farCount = 0;
    let nearCount = 0;
    const place = (parts, slot, i) => {
      for (const { mesh, local } of parts) {
        mesh.setMatrixAt(slot, matrix.multiplyMatrices(transforms[i], local));
        if (tints) mesh.setColorAt(slot, tints[i]);
      }
    };
    for (const i of chunk.indices) {
      const d2 = entry.near ? away2(i) : Infinity;
      if (d2 < nearReach ** 2) place(entry.near, nearCount++, i);
      if (d2 >= farReach ** 2) place(entry.far, farCount++, i);
    }
    for (const [parts, count] of [[entry.far, farCount], [entry.near ?? [], nearCount]]) {
      for (const { mesh } of parts) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };
  // Gives the chunk detailed meshes if it's come near the player, or takes them away if it's
  // gone far, then sorts its copies again.
  const refine = (key) => {
    const entry = built.get(key);
    const chunk = chunks.get(key);
    const wantNear = Boolean(detail && detailTemplate) && chunkNear(chunk);
    if (wantNear && !entry.near) entry.near = meshesFor(detailTemplate, chunk, entry.far[0]?.mesh.boundingSphere ?? sphereOf(chunk));
    if (!wantNear && entry.near) {
      dispose(entry.near);
      entry.near = null;
      fill(key);
    }
    if (entry.near) fill(key);
  };
  const buildChunk = (key) => {
    const chunk = chunks.get(key);
    built.set(key, { far: meshesFor(template, chunk, sphereOf(chunk)), near: null });
    fill(key);
    refine(key);
  };
  const dropChunk = (key) => {
    const entry = built.get(key);
    dispose(entry.far);
    if (entry.near) dispose(entry.near);
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
    refine() {
      if (detail) for (const key of built.keys()) refine(key);
    },
  };
  streamed.add(stream);
  stream.draw(currentKeys);
  const rebuild = () => {
    for (const key of [...built.keys()]) dropChunk(key);
    stream.draw(keys);
  };
  // With a detailed version, both are loaded before either is shown: otherwise the near copies
  // appear as the plain model first, then swap to the detailed one a moment later.
  Promise.all([loadModel(name), detail ? loadModel(detail.name) : null]).then(([model, detailed]) => {
    if (model) template = model;
    if (detailed) detailTemplate = detailed;
    if (model || detailed) rebuild();
  });

  holder.setInstance = (i, transform) => {
    transforms[i] = transform.clone();
    if (built.has(chunkOfCopy[i].key)) fill(chunkOfCopy[i].key);
  };
  return holder;
}

const streamed = new Set();
let currentKeys = [];
let currentChunk = null;
// Where the player was when near and far copies were last sorted (see instancedModel's
// `detail`), and how far they walk before it's done again.
const lod = { x: Infinity, z: Infinity };
const LOD_STEP = 3;

// Draws the copies around (x, z). Cheap to call every frame: it only does work when the
// player crosses into another chunk, or (for models with a detailed version near the player)
// has walked a few meters.
export function drawModelsAround(x, z) {
  const chunk = chunkOf(x, z).join();
  const moved = (x - lod.x) ** 2 + (z - lod.z) ** 2 > LOD_STEP ** 2;
  if (moved) Object.assign(lod, { x, z });
  if (chunk !== currentChunk) {
    currentChunk = chunk;
    currentKeys = chunksAround(x, z).map((c) => c.key);
    for (const stream of streamed) stream.draw(currentKeys);
  } else if (moved) {
    for (const stream of streamed) stream.refine();
  }
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
