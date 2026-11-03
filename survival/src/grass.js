import * as THREE from 'three';
import { SpatialGrid } from './grid.js';
import { loadModel } from './models.js';
import { createRandom } from './random.js';
import { CHUNK_SIZE, chunkOf, chunkSeed, chunksAround } from './stream.js';

const FOREST_THINNING = 0.75; // the share of tufts left out where trees grow
const TUFT_BRIGHTNESS = 1.5;
const TRIES_PER_CHUNK = 900; // spots tried per chunk; the ones on grassy ground get a tuft
const GRASS_CHUNKS = 2; // grass is small, so it's only drawn this many chunks out from the player
const UP = new THREE.Vector3(0, 1, 0);
// Each tuft picks a model from this list at random, so repeating a name makes it more common.
const TUFT_MIX = [
  'grass-tuft', 'grass-tuft', 'grass-short', 'grass-short', 'grass-short', 'grass-clump', 'grass-clump',
  'grass-sparse', 'grass-sparse', 'grass-wide', 'grass-wisp', 'grass-tall', 'grass-seed', 'grass-fern',
];

// Light the tufts as if they were the ground, so they blend into it instead of looking dark.
function faceUp(geometry) {
  const normals = geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
}

// Thousands of chunky grass tufts that sway in the wind, drawn with one InstancedMesh per
// tuft model, grown chunk by chunk around the player. Each tuft is a single blade until its
// model loads.
export function createGrass(seed, terrain, area) {
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
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95, vertexColors: true });
  material.onBeforeCompile = (shader) => {
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

  // Each chunk grows its own tufts from the map's seed, so they're the same every time it's
  // drawn. Chunks out of sight are forgotten and grown again when you come back.
  const half = area / 2;
  const cleared = new SpatialGrid(); // circles where the grass was cleared, e.g. under a campfire
  const chunks = new Map(); // chunk key → { [model name]: [tuft] }
  const growChunk = (cx, cz) => {
    const random = createRandom(chunkSeed(seed, cx, cz));
    const tufts = Object.fromEntries(TUFT_MIX.map((name) => [name, []]));
    for (let tries = 0; tries < TRIES_PER_CHUNK; tries++) {
      const x = (cx + random.next()) * CHUNK_SIZE;
      const z = (cz + random.next()) * CHUNK_SIZE;
      const name = random.pick(TUFT_MIX);
      const shade = random.range(0.85, 1.15);
      const hue = random.range(-0.015, 0.015);
      const width = random.range(0.8, 1.3);
      const height = random.range(0.3, 0.7);
      const spin = random.range(0, Math.PI * 2);
      const thin = random.next();
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const ground = terrain.groundAt(x, z);
      if (ground.kind !== 'grass') continue;
      if (terrain.forest(x, z) > 0.1 && thin < FOREST_THINNING) continue;
      if (!cleared.isClear(x, z, 0)) continue;
      // The same colour the ground is drawn in, a little brighter so tufts stand out from it.
      const { r, g, b } = ground.color;
      const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
      color.multiplyScalar(TUFT_BRIGHTNESS * shade);
      color.offsetHSL(hue, 0, 0);
      const scale = new THREE.Vector3(width, height, width);
      const rotation = new THREE.Quaternion().setFromAxisAngle(UP, spin);
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, terrain.heightAt(x, z), z), rotation, scale);
      tufts[name].push({ x, z, matrix, color });
    }
    return tufts;
  };

  // One InstancedMesh per tuft model, holding the tufts of the chunks around the player.
  const group = new THREE.Group();
  const kinds = [...new Set(TUFT_MIX)].map((name) => {
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
  let shownKeys = [];
  const draw = () => {
    for (const kind of kinds) {
      const tufts = shownKeys.flatMap((key) => chunks.get(key)?.[kind.name] ?? []);
      if (!kind.mesh || kind.mesh.instanceMatrix.count < tufts.length) {
        if (kind.mesh) {
          group.remove(kind.mesh);
          kind.mesh.dispose();
        }
        kind.mesh = new THREE.InstancedMesh(kind.geometry, material, Math.max(64, Math.ceil(tufts.length * 1.5)));
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
  const drawAround = (x, z) => {
    const chunk = chunkOf(x, z).join();
    if (chunk === currentChunk && !dirty) return;
    currentChunk = chunk;
    dirty = false;
    const around = chunksAround(x, z, GRASS_CHUNKS);
    for (const { cx, cz, key } of around) if (!chunks.has(key)) chunks.set(key, growChunk(cx, cz));
    shownKeys = around.map((c) => c.key);
    // Forget chunks well out of sight.
    const keep = new Set(chunksAround(x, z, GRASS_CHUNKS + 2).map((c) => c.key));
    for (const key of chunks.keys()) if (!keep.has(key)) chunks.delete(key);
    draw();
  };
  let last = { x: 0, z: 0 };

  return {
    group,
    // Sways the grass, and grows the grass around (x, z).
    update(time, x = last.x, z = last.z) {
      uniforms.uTime.value = time;
      last = { x, z };
      drawAround(x, z);
    },
    // Removes the grass within `radius` of (x, z), e.g. under a campfire.
    clear(x, z, radius) {
      cleared.add({ x, z, radius });
      for (const tufts of chunks.values()) {
        for (const name in tufts) {
          tufts[name] = tufts[name].filter((tuft) => Math.hypot(tuft.x - x, tuft.z - z) > radius);
        }
      }
      dirty = true;
    },
    // Grows back all cleared grass, for a new game.
    restore() {
      cleared.clear();
      chunks.clear();
      dirty = true;
    },
  };
}
