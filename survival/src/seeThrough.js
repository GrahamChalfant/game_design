import * as THREE from 'three';

// Cuts a soft, dotted hole through anything that stands between the camera and the
// player (like tall trees), so the player never disappears behind them.

// Trees, from below and up close: the boughs' undersides get this much of their own colour back
// as light (lit only from the ground, they'd be near black overhead), and their faces a soft
// grain (GRAIN: how strong, and how fine, per meter), so a big flat bough reads
// as needles rather than a painted board.
const UNDER_FILL = 1.6; // (the needles are dark, so it takes a lot to lift their undersides off black)
const GRAIN = { strength: 0.22, scale: 6.5 };

const uniforms = {
  uSeeCenter: { value: new THREE.Vector2() }, // player's position on screen, in pixels
  uSeeRadius: { value: 0 }, // size of the hole, in pixels
  uSeeDepth: { value: 0 }, // how far the player is from the camera
  uNearFade: { value: 0 }, // meters: closer to the camera than this, it fades out (0: never)
  uUnderFill: { value: UNDER_FILL }, // extra light on faces turned down (see seeThroughMaterial)
};

// Fades trees out within `meters` of the camera, so in the close-up views branches don't fill
// the screen when you stand under one or the camera backs into it. (A fine, irregular stipple:
// the see-through hole's 4x4 dot grid shows as a screen door right in front of your eyes.)
export function setNearFade(meters) {
  uniforms.uNearFade.value = meters;
}

// Returns a copy of `material` that gets the see-through hole.
export function seeThroughMaterial(material) {
  const patched = material.clone();
  patched.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTreeWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vTreeWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vTreeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uSeeCenter;
        uniform float uSeeRadius;
        uniform float uSeeDepth;
        uniform float uNearFade;
        // A 4x4 grid of thresholds, so the hole's edge fades out as a dot pattern.
        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                                  3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return (m[i] + 0.5) / 16.0;
        }
        // Interleaved gradient noise: a fine, even stipple with no visible grid.
        float stipple(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }
        uniform float uUnderFill;
        varying vec3 vTreeWorld;
        float treeHash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        // Smooth 3D value noise, for the grain on the boughs and bark.
        float treeNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(treeHash(i), treeHash(i + vec3(1, 0, 0)), f.x), mix(treeHash(i + vec3(0, 1, 0)), treeHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(treeHash(i + vec3(0, 0, 1)), treeHash(i + vec3(1, 0, 1)), f.x), mix(treeHash(i + vec3(0, 1, 1)), treeHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z
          );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - ${GRAIN.strength.toFixed(2)} * 0.5 + ${GRAIN.strength.toFixed(2)} * treeNoise(vTreeWorld * ${GRAIN.scale.toFixed(1)});`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uUnderFill * max(0.0, -inverseTransformDirection(normal, viewMatrix).y);`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float seeDistance = distance(gl_FragCoord.xy, uSeeCenter);
        if (vViewPosition.z < uSeeDepth && seeDistance < uSeeRadius) {
          // Fully clear in the middle, fading to solid at the edge.
          float solid = smoothstep(uSeeRadius * 0.45, uSeeRadius, seeDistance);
          if (solid < bayer4(gl_FragCoord.xy)) discard;
        }
        if (uNearFade > 0.0 && smoothstep(uNearFade * 0.45, uNearFade, vViewPosition.z) < stipple(gl_FragCoord.xy)) discard;`,
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
