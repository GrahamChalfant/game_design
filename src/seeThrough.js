import * as THREE from 'three';

// Cuts a soft, dotted hole through anything that stands between the camera and the
// player (like tall trees), so the player never disappears behind them.

const uniforms = {
  uSeeCenter: { value: new THREE.Vector2() }, // player's position on screen, in pixels
  uSeeRadius: { value: 0 }, // size of the hole, in pixels
  uSeeDepth: { value: 0 }, // how far the player is from the camera
};

// Returns a copy of `material` that gets the see-through hole.
export function seeThroughMaterial(material) {
  const patched = material.clone();
  patched.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uSeeCenter;
        uniform float uSeeRadius;
        uniform float uSeeDepth;
        // A 4x4 grid of thresholds, so the hole's edge fades out as a dot pattern.
        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                                  3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return (m[i] + 0.5) / 16.0;
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float seeDistance = distance(gl_FragCoord.xy, uSeeCenter);
        if (vViewPosition.z < uSeeDepth && seeDistance < uSeeRadius) {
          // Fully clear in the middle, fading to solid at the edge.
          float solid = smoothstep(uSeeRadius * 0.45, uSeeRadius, seeDistance);
          if (solid < bayer4(gl_FragCoord.xy)) discard;
        }`,
      );
  };
  return patched;
}

const projected = new THREE.Vector3();
const size = new THREE.Vector2();

// Call every frame with the point to keep visible (the player's chest).
export function updateSeeThrough(camera, renderer, target) {
  renderer.getDrawingBufferSize(size);
  projected.copy(target).project(camera);
  uniforms.uSeeCenter.value.set((projected.x * 0.5 + 0.5) * size.x, (projected.y * 0.5 + 0.5) * size.y);
  // A bit bigger than the player, and the same size on screen at any zoom.
  uniforms.uSeeRadius.value = size.y * 0.13 * (20 / camera.position.distanceTo(target));
  // Only cut through things in front of the player, not trees behind them.
  uniforms.uSeeDepth.value = camera.position.distanceTo(target) - 0.8;
}
