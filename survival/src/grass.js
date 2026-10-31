import * as THREE from 'three';
import { loadModel } from './models.js';

const FOREST_THINNING = 0.75; // the share of tufts left out where trees grow
const TUFT_BRIGHTNESS = 1.5;
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
// tuft model. Each tuft is a single blade until its model loads.
export function createGrass(random, terrain, area, count = 14000) {
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

  // Work out where every tuft goes, then build one InstancedMesh per model.
  const spots = Object.fromEntries(TUFT_MIX.map((name) => [name, []]));
  const half = area / 2;
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 6; tries++) {
    const x = random.range(-half, half);
    const z = random.range(-half, half);
    const ground = terrain.groundAt(x, z);
    if (ground.kind !== 'grass') continue;
    if (terrain.forest(x, z) > 0.1 && random.next() < FOREST_THINNING) continue;
    // The same colour the ground is drawn in, a little brighter so tufts stand out from it.
    const { r, g, b } = ground.color;
    const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
    color.multiplyScalar(TUFT_BRIGHTNESS * random.range(0.85, 1.15));
    color.offsetHSL(random.range(-0.015, 0.015), 0, 0);
    const width = random.range(0.8, 1.3);
    const scale = new THREE.Vector3(width, random.range(0.3, 0.7), width);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random.range(0, Math.PI * 2));
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, terrain.heightAt(x, z), z), rotation, scale);
    spots[random.pick(TUFT_MIX)].push({ x, z, matrix, color });
    placed++;
  }

  const group = new THREE.Group();
  const kinds = Object.entries(spots).map(([name, tufts]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, tufts.length);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    tufts.forEach((tuft, i) => {
      mesh.setMatrixAt(i, tuft.matrix);
      mesh.setColorAt(i, tuft.color);
    });
    group.add(mesh);
    loadModel(name).then((model) => {
      model?.traverse((child) => {
        if (!child.isMesh) return;
        faceUp(child.geometry);
        mesh.geometry = child.geometry;
      });
    });
    return { mesh, tufts, cleared: new Set() };
  });

  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    group,
    update(time) {
      uniforms.uTime.value = time;
    },
    // Removes the grass within `radius` of (x, z), e.g. under a campfire.
    clear(x, z, radius) {
      for (const { mesh, tufts, cleared } of kinds) {
        tufts.forEach((tuft, i) => {
          if (cleared.has(i) || Math.hypot(tuft.x - x, tuft.z - z) > radius) return;
          cleared.add(i);
          mesh.setMatrixAt(i, hidden);
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    // Grows back all cleared grass, for a new game.
    restore() {
      for (const { mesh, tufts, cleared } of kinds) {
        for (const i of cleared) mesh.setMatrixAt(i, tufts[i].matrix);
        cleared.clear();
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
