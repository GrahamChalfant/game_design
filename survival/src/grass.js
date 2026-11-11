import * as THREE from 'three';
import { SpatialGrid } from './grid.js';
import { loadModel } from './models.js';
import { createRandom } from './random.js';
import { CHUNK_SIZE, chunkKey, chunkOf, chunkSeed, chunksAround } from './stream.js';
import { COVER_KINDS, coverParts, pickCarpet, pickCover, placeCover, rootsFor } from './groundCover.js';
import { bladeMaterial, bladeTuft, isBladeTuft } from './look.js';

const FOREST_THINNING = 0.75; // the share of tufts left out where trees grow
const TUFT_BRIGHTNESS = 0.92;
const STRAW = new THREE.Color(0x9e8650);
const TRIES_PER_CHUNK = 900; // spots tried per chunk; the ones on grassy ground get a tuft
const COVER_TRIES_PER_CHUNK = 650; // ...and for the moss, ferns, shrubs and so on (see groundCover.js)
const COVER_GROUND = new Set(['grass', 'dirt', 'stony']); // what ground they grow on
const CARPET_TRIES_PER_CHUNK = 3600; // ...and for the heath and lichen carpeting the ground (pickCarpet)
const HEATH_BRIGHTNESS = 2.5; // (the leaf texture is mid-grey; a little darker than the ground, for depth)
// The road's verges: from this far inside its edge to this far outside it, the grass grows
// long and thick, from these tufts.
const VERGE = [0.35, 1.1];
const VERGE_MIX = ['grass-tall', 'grass-tall', 'grass-wide', 'grass-clump', 'grass-seed', 'grass-wisp'];
const GRASS_CHUNKS = 2; // grass is small, so it's only drawn this many chunks out from the player
const GRASS_BUDGET_MS = 2; // the most time per frame spent growing grass
const UP = new THREE.Vector3(0, 1, 0);
// Each tuft picks a model from this list at random, so repeating a name makes it more common.
const TUFT_MIX = [
  'grass-tuft', 'grass-tuft', 'grass-short', 'grass-short', 'grass-short', 'grass-clump', 'grass-clump',
  'grass-sparse', 'grass-sparse', 'grass-wide', 'grass-wisp', 'grass-tall', 'grass-seed', 'grass-fern',
];

// A heath plant takes the colour of the ground it grows in (the ground is painted in the
// tundra's broad fields of colour: terrain.js), nudged a quarter of the way toward its own
// plant's colour, so the plants are texture within a field of colour, not spots on it.
const plantTint = new THREE.Color();
function tintLikeGround(tuft, terrain, x, z, own) {
  const { r, g, b } = terrain.groundAt(x, z).color;
  const shade = tuft.color.r; // (each copy's own lightness, from placeCover)
  tuft.color.setRGB(r, g, b, THREE.SRGBColorSpace).lerp(plantTint.set(own), 0.25).multiplyScalar(HEATH_BRIGHTNESS * shade);
}

// Light the tufts as if they were the ground, so they blend into it instead of looking dark.
function faceUp(geometry) {
  const normals = geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
}

// Thousands of chunky grass tufts that sway in the wind, drawn with one InstancedMesh per
// tuft model, grown chunk by chunk around the player. Each tuft is a single blade until its
// model loads. The forest floor's moss, ferns, shrubs, branches and so on (groundCover.js)
// grow with them, kept clear of `obstacles` (trunks, rocks), with roots round the `trees`.
// The grass, ferns and brush lie flat round animals and the player (otherwise a rabbit's lost in
// grass taller than it is). Up to TRAMPLE_COUNT circles at once: see trample().
const TRAMPLE_COUNT = 12;
const FLATTENED = 0.2; // how tall the grass is in the middle of a circle (a share of its height)

export function createGrass(seed, terrain, bounds, { trees = null, obstacles = null } = {}) {
  const tramples = { value: Array.from({ length: TRAMPLE_COUNT }, () => new THREE.Vector3()) };
  // Adds the flattening to a material of tufts (drawn instanced, each tuft's origin at its root).
  const flattens = (material) => {
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      before?.call(material, shader, renderer);
      shader.uniforms.uTrample = tramples;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec3 uTrample[${TRAMPLE_COUNT}];`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec2 trampleRoot = instanceMatrix[3].xz;
          float squash = 1.0;
          for (int i = 0; i < ${TRAMPLE_COUNT}; i++) {
            vec3 t = uTrample[i];
            if (t.z <= 0.0) continue;
            squash = min(squash, mix(${FLATTENED.toFixed(2)}, 1.0, smoothstep(t.z * 0.45, t.z, distance(trampleRoot, t.xy))));
          }
          transformed.y *= squash;
          #endif`,
        );
    };
    material.customProgramCacheKey = () => `${key?.call(material) ?? ''}-trample`;
    return material;
  };
  const geometry = new THREE.PlaneGeometry(0.2, 1, 1, 4).translate(0, 0.5, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setX(i, position.getX(i) * (1 - y)); // taper to a point
    position.setZ(i, y * y * 0.18); // slight bend
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3).fill(1), 3));
  faceUp(geometry);

  const uniforms = { uTime: { value: 0 } };
  const grassMaterial = () => {
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95, vertexColors: true });
    material.onBeforeCompile = grassShader;
    return material;
  };
  const grassShader = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vBladeHeight;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBladeHeight = position.y;
        vec2 rootPos = instanceMatrix[3].xz;
        float gust = sin(uTime * 1.6 + rootPos.x * 0.3 + rootPos.y * 0.2) * 0.6
                   + sin(uTime * 0.7 + rootPos.x * 0.07) * 0.4;
        transformed.x += gust * position.y * position.y * 0.3;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeHeight;')
      // Both sides of a blade face "up", so the back of a blade isn't lit as if it faced away.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.8, 1.0, min(vBladeHeight, 1.0));',
      );
  };
  const material = flattens(grassMaterial());
  // The tufts are cards of fine blades (look.js), with a material of their own.
  const blades = flattens(bladeMaterial(grassMaterial()));

  // Each chunk grows its own tufts from the map's seed, so they're the same every time it's
  // drawn. Chunks out of sight are forgotten and grown again when you come back.
  const outside = (x, z) => x < bounds.minX - 5 || x > bounds.maxX + 5 || z < bounds.minZ - 5 || z > bounds.maxZ + 5;
  const cleared = new SpatialGrid(); // circles where the grass was cleared, e.g. under a campfire
  const chunks = new Map(); // chunk key → { [model name]: [tuft] }
  // Grows one chunk a little at a time: it pauses (yields) every so often, so the work can be
  // spread over several frames. Returns the chunk's tufts, by model.
  function* growChunk(cx, cz) {
    const random = createRandom(chunkSeed(seed, cx, cz));
    const tufts = Object.fromEntries(TUFT_MIX.map((name) => [name, []]));
    for (let tries = 0; tries < TRIES_PER_CHUNK; tries++) {
      if (tries % 40 === 39) yield;
      const x = (cx + random.next()) * CHUNK_SIZE;
      const z = (cz + random.next()) * CHUNK_SIZE;
      let name = random.pick(TUFT_MIX);
      const shade = random.range(0.85, 1.15);
      const hue = random.range(-0.015, 0.015);
      // (Narrow, so up close a tuft is blades of grass rather than a few wide paper strips.)
      const width = random.range(0.5, 0.85);
      let height = random.range(0.25, 0.55); // (tundra grass and sedge: short)
      const spin = random.range(0, Math.PI * 2);
      const thin = random.next();
      if (outside(x, z)) continue;
      const ground = terrain.groundAt(x, z);
      // Along the fire road's edges the grass grows long and thick (the verges).
      const road = terrain.roadAt(x, z);
      const verge = road && Math.abs(road.offset) > road.half - VERGE[0] && Math.abs(road.offset) < road.half + VERGE[1] && ground.kind !== 'snow';
      if (verge) {
        name = random.pick(VERGE_MIX);
        height *= 1.5;
      } else {
        if (ground.kind !== 'grass') continue;
        if (terrain.forest(x, z) > 0.1 && thin < FOREST_THINNING) continue;
      }
      if (!cleared.isClear(x, z, 0)) continue;
      // The same colour the ground is drawn in, a little brighter so tufts stand out from it.
      const { r, g, b } = ground.color;
      // (Autumn grass and sedge: straw, picking up a little of the ground's colour.)
      const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace).lerp(STRAW, 0.6);
      color.multiplyScalar(TUFT_BRIGHTNESS * shade);
      color.offsetHSL(hue, 0, 0);
      const scale = new THREE.Vector3(width, height, width);
      const rotation = new THREE.Quaternion().setFromAxisAngle(UP, spin);
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, terrain.heightAt(x, z), z), rotation, scale);
      tufts[name].push({ x, z, matrix, color });
    }
    // The forest floor.
    for (const kind of COVER_KINDS) tufts[kind] = [];
    for (let tries = 0; tries < COVER_TRIES_PER_CHUNK; tries++) {
      if (tries % 40 === 39) yield;
      const x = (cx + random.next()) * CHUNK_SIZE;
      const z = (cz + random.next()) * CHUNK_SIZE;
      if (outside(x, z)) continue;
      const kind = pickCover(random, Math.max(0, terrain.forest(x, z)));
      if (!kind) continue;
      if (!COVER_GROUND.has(terrain.groundKind(x, z)) || terrain.waterDepth(x, z) > 0) continue;
      if (!cleared.isClear(x, z, 0) || (obstacles && !obstacles.isClear(x, z, 0.12))) continue;
      const cover = placeCover(kind, x, z, random, terrain);
      if (kind === 'shrub') tintLikeGround(cover, terrain, x, z, 0x7e8452);
      tufts[kind].push(cover);
    }
    // The carpet: heath, lichen and Labrador tea, in patches and zones.
    for (let tries = 0; tries < CARPET_TRIES_PER_CHUNK; tries++) {
      if (tries % 60 === 59) yield;
      const x = (cx + random.next()) * CHUNK_SIZE;
      const z = (cz + random.next()) * CHUNK_SIZE;
      if (outside(x, z)) continue;
      const carpet = pickCarpet(random, x, z, Math.max(0, terrain.forest(x, z)));
      if (!carpet) continue;
      const ground = terrain.groundKind(x, z);
      // (On stony ground, every other plant: lichen and heath among the stones.)
      const stony = ground === 'stony' && random.next() < 0.5;
      if (!(ground === 'grass' || stony || ((ground === 'rock' || ground === 'stony') && carpet.kind === 'lichen')) || terrain.waterDepth(x, z) > 0) continue;
      if (!cleared.isClear(x, z, 0) || (obstacles && !obstacles.isClear(x, z, 0.25))) continue;
      const tuft = placeCover(carpet.kind, x, z, random, terrain);
      if (carpet.tint !== null) tintLikeGround(tuft, terrain, x, z, carpet.tint);
      tufts[carpet.kind].push(tuft);
    }
    if (trees) tufts.roots = rootsFor(trees, cx, cz, CHUNK_SIZE, terrain, random);
    yield;
    // (Grass may have been cleared while this chunk was growing.)
    for (const name in tufts) tufts[name] = tufts[name].filter((tuft) => cleared.isClear(tuft.x, tuft.z, 0));
    return tufts;
  }

  // One InstancedMesh per tuft model, holding the tufts of the chunks around the player.
  const group = new THREE.Group();
  const kinds = [...new Set(TUFT_MIX)].map((name) => {
    if (isBladeTuft(name)) return { name, geometry: bladeTuft(name), material: blades, mesh: null };
    const kind = { name, geometry, mesh: null };
    loadModel(name).then((model) => {
      model?.traverse((child) => {
        if (!child.isMesh) return;
        faceUp(child.geometry);
        kind.geometry = child.geometry;
        if (kind.mesh) kind.mesh.geometry = child.geometry;
      });
    });
    return kind;
  });
  const cover = coverParts();
  for (const m of new Set([cover.material, ...Object.values(cover.materials)])) flattens(m);
  for (const name of COVER_KINDS) kinds.push({ name, geometry: cover.shapes[name], material: cover.materials[name] ?? cover.material, mesh: null });
  let shownKeys = [];
  const draw = () => {
    for (const kind of kinds) {
      const tufts = shownKeys.flatMap((key) => chunks.get(key)?.[kind.name] ?? []);
      if (!kind.mesh || kind.mesh.instanceMatrix.count < tufts.length) {
        if (kind.mesh) {
          group.remove(kind.mesh);
          kind.mesh.dispose();
        }
        kind.mesh = new THREE.InstancedMesh(kind.geometry, kind.material ?? material, Math.max(64, Math.ceil(tufts.length * 1.5)));
        kind.mesh.receiveShadow = true;
        kind.mesh.frustumCulled = false;
        kind.mesh.setColorAt(0, new THREE.Color());
        group.add(kind.mesh);
      }
      tufts.forEach((tuft, i) => {
        kind.mesh.setMatrixAt(i, tuft.matrix);
        kind.mesh.setColorAt(i, tuft.color);
      });
      kind.mesh.count = tufts.length;
      kind.mesh.instanceMatrix.needsUpdate = true;
      kind.mesh.instanceColor.needsUpdate = true;
    }
  };

  let currentChunk = null;
  let dirty = true;
  const jobs = new Map(); // chunk key → its growing, part done
  // Grows the chunks around (x, z), nearest first, plus one more ring ahead of the ones drawn
  // so they're ready before you get there. Works for at most GRASS_BUDGET_MS per frame, unless
  // `now` (then it grows the drawn chunks right away).
  const drawAround = (x, z, now) => {
    const chunk = chunkOf(x, z).join();
    if (chunk !== currentChunk) {
      currentChunk = chunk;
      shownKeys = chunksAround(x, z, GRASS_CHUNKS).map((c) => c.key);
      // Forget chunks well out of sight.
      const keep = new Set(chunksAround(x, z, GRASS_CHUNKS + 2).map((c) => c.key));
      for (const key of chunks.keys()) if (!keep.has(key)) chunks.delete(key);
      for (const key of jobs.keys()) if (!keep.has(key)) jobs.delete(key);
      dirty = true;
    }
    const deadline = now ? Infinity : performance.now() + GRASS_BUDGET_MS;
    for (const { cx, cz, key } of chunksAround(x, z, now ? GRASS_CHUNKS : GRASS_CHUNKS + 1)) {
      if (chunks.has(key)) continue;
      if (!jobs.has(key)) jobs.set(key, growChunk(cx, cz));
      const job = jobs.get(key);
      while (performance.now() < deadline) {
        const step = job.next();
        if (step.done) {
          chunks.set(key, step.value);
          jobs.delete(key);
          if (shownKeys.includes(key)) dirty = true;
          break;
        }
      }
      if (performance.now() >= deadline) break;
    }
    if (!dirty) return;
    dirty = false;
    draw();
  };
  let last = { x: 0, z: 0 };

  return {
    group,
    // Sways the grass, and grows the grass around (x, z) (right away if `now`).
    update(time, x = last.x, z = last.z, now = false) {
      uniforms.uTime.value = time;
      last = { x, z };
      drawAround(x, z, now);
    },
    // Flattens the grass in these circles ([{ x, z, radius }], up to TRAMPLE_COUNT), till the next call.
    trample(circles) {
      tramples.value.forEach((t, i) => {
        const c = circles[i];
        if (c) t.set(c.x, c.z, c.radius);
        else t.z = 0;
      });
    },
    // Removes the grass within `radius` of (x, z), e.g. under a campfire.
    clear(x, z, radius) {
      cleared.add({ x, z, radius });
      // Only the chunks the circle touches (usually just one).
      const [minX, minZ] = chunkOf(x - radius, z - radius);
      const [maxX, maxZ] = chunkOf(x + radius, z + radius);
      for (let cx = minX; cx <= maxX; cx++) {
        for (let cz = minZ; cz <= maxZ; cz++) {
          const key = chunkKey(cx, cz);
          const tufts = chunks.get(key);
          if (!tufts) continue;
          for (const name in tufts) {
            tufts[name] = tufts[name].filter((tuft) => Math.hypot(tuft.x - x, tuft.z - z) > radius);
          }
          if (shownKeys.includes(key)) dirty = true;
        }
      }
    },
    // Grows back all cleared grass, for a new game.
    restore() {
      cleared.clear();
      chunks.clear();
      jobs.clear();
      dirty = true;
    },
  };
}
