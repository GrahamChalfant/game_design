import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHUNK_SIZE, chunkKey, chunkOf, chunksAround } from './stream.js';
import { glassMaterial, paintedSurface, surfaceFor } from './look.js';
import { lodFade } from './seeThrough.js';

const loader = new GLTFLoader();
// Vite serves public/ at the site root; a plain web server serves it at /public/.
const MODEL_FOLDERS = ['models/', 'public/models/'];

// How many models are loading right now, and when the last one finished: for the loading
// cover (see whenModelsLoaded).
let loading = 0;
let lastLoaded = 0;

// Which of them it is here, asked once (of a model that's always there), so each model's then
// fetched from the right place first time instead of failing at the wrong one first.
const foldersHere = fetch(MODEL_FOLDERS[0] + 'pine.glb', { method: 'HEAD' })
  .then((response) => (response.ok ? MODEL_FOLDERS : [...MODEL_FOLDERS].reverse()))
  .catch(() => MODEL_FOLDERS);
// True if public/ is served at /public/ here, not at the site root (for the icons: itemIcons.js).
export const publicInFolder = foldersHere.then((folders) => folders[0] !== MODEL_FOLDERS[0]);

// Loads public/models/<name>.glb. Resolves to the model, or null if there isn't one yet.
export function loadModel(name, folders = null) {
  loading++;
  return (folders ? Promise.resolve(folders) : foldersHere).then((list) => fetchModel(name, list)).finally(() => {
    loading--;
    lastLoaded = performance.now();
  });
}

// Resolves once every model asked for has loaded and nothing more has been asked for in the
// last `quiet` milliseconds (more are asked for as the first frames are drawn). Until then the
// game shows a loading cover rather than the simple stand-in shapes (see main.js).
export function whenModelsLoaded(quiet = 800) {
  return new Promise((resolve) => {
    const check = () => {
      if (loading === 0 && performance.now() - lastLoaded > quiet) resolve();
      else setTimeout(check, 100);
    };
    setTimeout(check, 100);
  });
}

function fetchModel(name, folders) {
  if (folders.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    loader.load(
      folders[0] + name + '.glb',
      (gltf) => {
        // Blender's clips start on frame 1, so their keys start a frame late; moved to start at
        // 0, a looping clip's last key (the same pose as its first) meets the next loop's first
        // without holding that pose an extra frame.
        // (Tracks, even of different clips, can share one array of times: each array's shifted
        // once, by where its clip starts, and then every clip's length is measured again.)
        const shifts = new Map();
        for (const clip of gltf.animations) {
          const start = Math.min(...clip.tracks.map((track) => track.times[0]));
          for (const track of clip.tracks) shifts.set(track.times, start);
        }
        for (const [times, start] of shifts) for (let i = 0; i < times.length; i++) times[i] -= start;
        for (const clip of gltf.animations) clip.resetDuration();
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
      () => resolve(fetchModel(name, folders.slice(1))),
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
// `distant`, if given, is { name, radius, fade }: copies further than `radius` meters from the
// player are drawn with that (simpler) model, fading over to it from `radius - fade`
// (`shadows` false: and without shadows).
// Call `holder.setInstance(i, matrix)` to move, rotate or hide (scale 0) one copy.
const CHUNK_REACH = 24; // meters a copy can stick up or out past its chunk (a tall tree, a falling one)
export function instancedModel(name, placeholder, transforms, changeMaterial, tints, positions, detail, distant) {
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
  let distantTemplate = null;
  const materials = new Map(); // each original material → its changed copy, made once
  const matrix = new THREE.Matrix4();
  // chunk key → { far, near, distant }: lists of { mesh, local }, one per mesh in the model
  // (and in the detailed model, while the chunk is near the player, and the simple one, while
  // any of it's far from them; otherwise near or distant is null).
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
  // The same for the simple model: the band where it and the plain one are both drawn, and
  // how far each one's list reaches into it.
  const distantFrom = distant ? distant.radius - distant.fade : Infinity;
  const plainReach = distant ? distant.radius + LOD_STEP : Infinity;
  const distantReach = distant ? Math.max(0, distantFrom - LOD_STEP) : Infinity;
  // Each changed material, as it is on each version of the model (`role`: 'near', 'far' or
  // 'distant'): fading in or out across the bands where two versions are both drawn.
  const faded = new Map();
  const fading = (m, role) => {
    const changed = change(m);
    // (No fading until the model on the other side of a band has loaded.)
    const inner = fades && detailTemplate ? [fadeFrom, detail.radius] : null;
    const outer = distantTemplate ? [distantFrom, distant.radius] : null;
    const bands = role === 'near' ? [null, inner] : role === 'far' ? [inner, outer] : [outer, null];
    if (!bands[0] && !bands[1]) return changed;
    if (!faded.has(changed)) faded.set(changed, new Map());
    const versions = faded.get(changed);
    if (!versions.has(role)) versions.set(role, lodFade(changed, ...bands));
    return versions.get(role);
  };
  // A sphere round the whole chunk, with room for what stands up out of it.
  const sphereOf = (chunk) => new THREE.Sphere(
    new THREE.Vector3((chunk.cx + 0.5) * CHUNK_SIZE, chunk.heights / chunk.indices.length, (chunk.cz + 0.5) * CHUNK_SIZE),
    CHUNK_SIZE * 0.71 + CHUNK_REACH,
  );
  // One InstancedMesh per mesh in `model`, with room for all the chunk's copies.
  const meshesFor = (model, chunk, sphere) => {
    const parts = [];
    const role = model === detailTemplate ? 'near' : model === distantTemplate ? 'distant' : 'far';
    const pick = (m) => fading(m, role);
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!child.isMesh) return;
      const material = Array.isArray(child.material) ? child.material.map(pick) : pick(child.material);
      const mesh = new THREE.InstancedMesh(child.geometry, material, chunk.indices.length);
      // (Far-off small things' shadows fall short of the ground near you, where shadows are drawn.)
      mesh.castShadow = role !== 'distant' || distant.shadows !== false;
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
  // How far the nearest and furthest of the chunk are from the player (squared; as chunkNear).
  const chunkSpan = (chunk) => {
    const [x0, z0] = [chunk.cx * CHUNK_SIZE, chunk.cz * CHUNK_SIZE];
    const dx = Math.max(x0 - lod.x, 0, lod.x - x0 - CHUNK_SIZE);
    const dz = Math.max(z0 - lod.z, 0, lod.z - z0 - CHUNK_SIZE);
    const fx = Math.max(lod.x - x0, x0 + CHUNK_SIZE - lod.x);
    const fz = Math.max(lod.z - z0, z0 + CHUNK_SIZE - lod.z);
    return [dx * dx + dz * dz, fx * fx + fz * fz];
  };
  // Puts each of the chunk's copies into the near meshes, the far ones, the distant ones, or
  // (in a band where one fades into the next) two of them.
  const fill = (key) => {
    const entry = built.get(key);
    const chunk = chunks.get(key);
    let farCount = 0;
    let nearCount = 0;
    let distantCount = 0;
    const place = (parts, slot, i) => {
      for (const { mesh, local } of parts) {
        mesh.setMatrixAt(slot, matrix.multiplyMatrices(transforms[i], local));
        if (tints) mesh.setColorAt(slot, tints[i]);
      }
    };
    for (const i of chunk.indices) {
      // (A copy scaled to nothing is hidden, like a stump before its tree's cut: there are
      // thousands, and drawing them costs as much as if they showed.)
      const e = transforms[i].elements;
      if (e[0] === 0 && e[5] === 0 && e[10] === 0) continue;
      const d2 = entry.near || entry.distant ? away2(i) : Infinity;
      if (entry.near && d2 < nearReach ** 2) place(entry.near, nearCount++, i);
      if ((!entry.near || d2 >= farReach ** 2) && (!entry.distant || d2 < plainReach ** 2)) place(entry.far, farCount++, i);
      if (entry.distant && d2 >= distantReach ** 2) place(entry.distant, distantCount++, i);
    }
    for (const [parts, count] of [[entry.far, farCount], [entry.near ?? [], nearCount], [entry.distant ?? [], distantCount]]) {
      for (const { mesh } of parts) {
        mesh.count = count;
        mesh.visible = count > 0; // (nothing to draw: not even looked at, each frame)
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };
  // Gives the chunk detailed meshes if it's come near the player, or takes them away if it's
  // gone far (and the same for the simple ones, the other way about), then sorts its copies
  // again.
  const refine = (key) => {
    const entry = built.get(key);
    const chunk = chunks.get(key);
    const sphere = () => entry.far[0]?.mesh.boundingSphere ?? sphereOf(chunk);
    const wantNear = Boolean(detail && detailTemplate) && chunkNear(chunk);
    const [nearest, furthest] = distantTemplate ? chunkSpan(chunk) : [0, 0];
    const wantDistant = Boolean(distantTemplate) && furthest >= distantReach ** 2;
    // (All of it past the band and already sorted that way: nothing changes as you walk.)
    const allDistant = wantDistant && nearest >= plainReach ** 2;
    if (allDistant && entry.allDistant && entry.distant && !entry.near) return;
    const changed = wantNear !== Boolean(entry.near) || wantDistant !== Boolean(entry.distant);
    if (wantNear && !entry.near) entry.near = meshesFor(detailTemplate, chunk, sphere());
    if (!wantNear && entry.near) {
      dispose(entry.near);
      entry.near = null;
    }
    if (wantDistant && !entry.distant) entry.distant = meshesFor(distantTemplate, chunk, sphere());
    if (!wantDistant && entry.distant) {
      dispose(entry.distant);
      entry.distant = null;
    }
    if (changed || entry.near || entry.distant) fill(key);
    entry.allDistant = allDistant;
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
    if (entry.distant) dispose(entry.distant);
    built.delete(key);
  };

  let keys = [];
  let wanted = new Set();
  const stream = {
    // Draws these chunks' copies and no others: right away if `now`, else the changes are
    // left to be made a few each frame (see drawModelsAround), the new chunks first.
    draw(newKeys, now = true) {
      keys = newKeys;
      wanted = new Set(keys.filter((key) => chunks.has(key)));
      const changes = [...wanted].filter((key) => !built.has(key));
      for (const key of built.keys()) if (!wanted.has(key)) changes.push(key);
      for (const key of changes) {
        if (now) stream.settle(key);
        else waiting.push({ stream, key });
      }
    },
    // Builds a chunk that's wanted and isn't there, or takes away one that isn't wanted.
    settle(key) {
      if (wanted.has(key) && !built.has(key)) buildChunk(key);
      else if (!wanted.has(key) && built.has(key)) dropChunk(key);
    },
    refine() {
      if (detail || distant) for (const key of built.keys()) refine(key);
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
  Promise.all([loadModel(name), detail ? loadModel(detail.name) : null, distant ? loadModel(distant.name) : null]).then(([model, detailed, simple]) => {
    if (model) template = model;
    if (detailed) detailTemplate = detailed;
    if (simple) distantTemplate = simple;
    if (model || detailed || simple) rebuild();
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
// Chunks of copies still to be built or taken away ([{ stream, key }], nearest first for each
// model), and the most time per frame spent on them. Walking into a new chunk brings a whole
// row of new chunks into view at once, and takes one out, for every model there is: done in one
// go, that's a stutter at every chunk's edge. They're three chunks off, so nobody sees them turn
// up (or go) a few frames late.
let waiting = [];
const MODELS_BUDGET_MS = 2;
// Where the player was when near and far copies were last sorted (see instancedModel's
// `detail`), and how far they walk before it's done again.
const lod = { x: Infinity, z: Infinity };
const LOD_STEP = 3;

// Draws the copies around (x, z). Cheap to call every frame: it only does work when the
// player crosses into another chunk, or (for models with a detailed version near the player)
// has walked a few meters. The chunks that come into view are built over the next few frames,
// unless `now` (after a jump to somewhere else: then all of it's built before the next frame).
export function drawModelsAround(x, z, now = false) {
  const chunk = chunkOf(x, z).join();
  const moved = (x - lod.x) ** 2 + (z - lod.z) ** 2 > LOD_STEP ** 2;
  if (moved) Object.assign(lod, { x, z });
  if (chunk !== currentChunk) {
    currentChunk = chunk;
    currentKeys = chunksAround(x, z).map((c) => c.key);
    waiting = [];
    for (const stream of streamed) stream.draw(currentKeys, now);
  } else if (moved) {
    for (const stream of streamed) stream.refine();
  }
  const deadline = now ? Infinity : performance.now() + MODELS_BUDGET_MS;
  while (waiting.length && performance.now() < deadline) {
    const { stream, key } = waiting.shift();
    stream.settle(key);
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
