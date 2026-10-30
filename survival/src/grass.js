import * as THREE from 'three';

// Thousands of individual grass blades that sway in the wind, drawn as one InstancedMesh.
export function createGrass(random, terrain, area, count = 120000) {
  const geometry = new THREE.PlaneGeometry(0.12, 1, 1, 4).translate(0, 0.5, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setX(i, position.getX(i) * (1 - y)); // taper to a point
    position.setZ(i, y * y * 0.18); // slight bend
  }
  // Light the blades as if they were the ground, so they blend into it instead of looking dark.
  const normals = geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);

  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95 });
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
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.75, 1.1, vBladeHeight);',
      );
  };

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const color = new THREE.Color();
  const half = area / 2;
  const roots = []; // x, z of every blade, for clearing grass later
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 6; tries++) {
    const x = random.range(-half, half);
    const z = random.range(-half, half);
    const ground = terrain.groundAt(x, z);
    if (ground.kind !== 'grass') continue;
    color.copy(ground.color).offsetHSL(random.range(-0.015, 0.015), 0.03, random.range(-0.01, 0.06));
    const height = random.range(0.35, 0.85);
    spot.set(x, terrain.heightAt(x, z), z);
    rotation.setFromAxisAngle(up, random.range(0, Math.PI * 2));
    scale.set(random.range(0.8, 1.3), height, 1);
    mesh.setMatrixAt(placed, matrix.compose(spot, rotation, scale));
    mesh.setColorAt(placed, color);
    roots.push(x, z);
    placed++;
  }
  mesh.count = placed;

  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const cleared = new Map(); // blade index -> its original matrix

  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
    // Removes the grass within `radius` of (x, z), e.g. under a campfire.
    clear(x, z, radius) {
      for (let i = 0; i < placed; i++) {
        if (cleared.has(i) || Math.hypot(roots[i * 2] - x, roots[i * 2 + 1] - z) > radius) continue;
        const original = new THREE.Matrix4();
        mesh.getMatrixAt(i, original);
        cleared.set(i, original);
        mesh.setMatrixAt(i, hidden);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    // Grows back all cleared grass, for a new game.
    restore() {
      for (const [i, original] of cleared) mesh.setMatrixAt(i, original);
      cleared.clear();
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
