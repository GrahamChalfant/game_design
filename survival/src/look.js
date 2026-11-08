import * as THREE from 'three';

// A test of a richer, less blocky look, at the crash site and everywhere else: add ?look=new to
// the URL. The spruce near the player are made of needle cards (public/models/look/, made by
// blender/conifers.py with LOOK = 'new'; further off they're the plain ones, see trees.js), lit
// as soft rounded masses; the ground's colours blend smoothly with painted-looking detail
// instead of flat triangles, and so do the moss and litter; the haze comes in closer, so the
// land fades back in layers; and the picture gets a gentle colour grade.
export const NEW_LOOK = new URLSearchParams(location.search).get('look') === 'new';

let needles = null;

// Spruce sprays, drawn once: light strokes on clear, so the vertex colour gives the shade and
// the clear parts are cut away. u runs along the bough (it repeats), v from the branch the
// sprays grow from (top: a solid band, so a card always joins its bough) out to their tips
// (bottom). Each spray is a twig running out and a little along, with needles on both sides
// pointing forward, dark at their base and lighter toward the tip (this year's growth), and
// gaps between the sprays, so you see depth through a bough rather than a flat panel.
const SPRAYS = 16; // across one repeat
function needleTexture() {
  if (needles) return needles;
  const W = 512, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stroke = (x, y, angle, length, width, light) => {
    const l = Math.round(Math.min(255, light));
    ctx.strokeStyle = `rgb(${l},${l},${l})`;
    ctx.lineWidth = width;
    for (const dx of [-W, 0, W]) { // (drawn three times, so it repeats seamlessly along u)
      ctx.beginPath();
      ctx.moveTo(x + dx, y);
      ctx.lineTo(x + dx + Math.sin(angle) * length, y + Math.cos(angle) * length);
      ctx.stroke();
    }
  };
  for (let i = 0; i < 700; i++) stroke(rand() * W, rand() * 30, (rand() - 0.5) * 1.6, 14 + rand() * 22, 3 + rand() * 3, 130 + rand() * 70);
  for (let s = 0; s < SPRAYS * 2; s++) {
    // (Two layers: long sprays reaching the tips, and shorter ones filling in nearer the branch.)
    const long = s < SPRAYS;
    let x = (s % SPRAYS) * (W / SPRAYS) + rand() * (W / SPRAYS) * (long ? 0.6 : 1);
    let y = 10 + rand() * 8;
    const lean = (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.35);
    const length = long ? 170 + rand() * 70 : 70 + rand() * 60;
    for (let d = 0; d < length; d += 3.2) {
      const t = d / length;
      const a = lean + Math.sin(d * 0.025 + s) * 0.12;
      x += Math.sin(a) * 3.2;
      y += Math.cos(a) * 3.2;
      stroke(x, y, a, 4, 2.6 * (1 - t) + 0.9, 115 + 30 * t);
      for (const side of [-1, 1]) {
        const spread = side * (0.75 + rand() * 0.45);
        stroke(x, y, a + spread, (19 + rand() * 13) * (1 - 0.4 * t), 1.8 + rand() * 1.0, 150 + 90 * t + rand() * 30);
      }
    }
  }
  needles = new THREE.CanvasTexture(canvas);
  needles.colorSpace = THREE.SRGBColorSpace;
  needles.wrapS = THREE.RepeatWrapping;
  needles.anisotropy = 4;
  return needles;
}

// The material for a tree's needle cards (named 'needles' in the model): the needle texture,
// cut out where it's clear, seen from both sides.
export function needleMaterial(material) {
  const result = material.clone();
  result.map = needleTexture();
  result.alphaTest = 0.45;
  result.side = THREE.DoubleSide;
  return result;
}

// Lights a tree as one soft, rounded mass instead of facet by facet: every face's normal is
// bent toward pointing out and a little up from the trunk (SOFT: how far), and the back of a
// face is lit like its front, so a needle card or a bough's underside doesn't go dark just
// because it's seen from behind. Call on a material whose onBeforeCompile is already set.
const SOFT = 0.7;
export function softFoliage(material) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      objectNormal = normalize(mix(objectNormal, normalize(vec3(position.x, 0.45 * length(position.xz) + 0.25, position.z)), ${SOFT.toFixed(2)}));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
    );
  };
  return material;
}

// The forest floor's moss, needle litter, ferns and the rest: the ground's painted mottling (by
// world position, so neighbouring pieces vary) and `shade` darker overall, so a cushion of moss
// in full sun reads as moss, not a bright plastic disc.
export function paintedCover(material, shade = 1) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCoverXZ;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vCoverXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
        #else
          vCoverXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vCoverXZ;
        float coverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float coverNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(coverHash(i), coverHash(i + vec2(1, 0)), f.x), mix(coverHash(i + vec2(0, 1)), coverHash(i + vec2(1, 1)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float clumps = coverNoise(vCoverXZ * 5.0) * 0.6 + coverNoise(vCoverXZ * 13.0) * 0.4;
          float grain = coverNoise(vCoverXZ * 34.0);
          diffuseColor.rgb *= ${shade.toFixed(2)} * (0.72 + 0.4 * clumps) * (0.9 + 0.18 * grain);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.0, 0.82), smoothstep(0.6, 0.85, clumps) * 0.6);
        }`);
  };
  return material;
}

// The colour grade, applied to the finished picture: a little less saturated, cool in the shade
// and warm in the light, a touch more contrast, and darker toward the corners.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.88);
      c += vec3(-0.012, 0.0, 0.028) * (1.0 - l);
      c *= mix(vec3(1.0), vec3(1.05, 1.01, 0.94), l);
      c = (c - 0.5) * 1.06 + 0.5;
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 0.6;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
