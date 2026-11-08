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
  material.customProgramCacheKey = () => `cover-${shade}`; // (see paintedSurface)
  return material;
}

// Painted surfaces for every model (see models.js): the same kind of hand-painted detail the
// needle trees have, by what a thing is made of. Patterns are in the model's own space (each
// placed copy shifted), so they stay put on things that move and differ from copy to copy.
//   wood:  grain streaks, darker and lighter boards, weathered silver-grey in places
//   rock:  grain and specks, pale lichen spots, moss on the tops
//   metal: grime, and rust blooming through the paint
//   cloth: dirt and fading
//   fur:   streaks along the body
//   plain: gentle mottling, for anything else
const SURFACES = {
  wood: `
    vec3 wn = abs(vPaintObjN);
    float streak = wn.y > 0.7 ? psNoise(p * vec3(10.0, 1.5, 1.5)) : psNoise(p * vec3(1.5, 10.0, 1.5));
    c *= (0.78 + 0.24 * mid + 0.1 * fine) * (0.82 + 0.3 * streak);
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))) * vec3(0.98, 0.98, 1.02) * 1.1, smoothstep(0.55, 0.85, big) * 0.45);`,
  rock: `
    c *= 0.76 + 0.3 * mid + 0.12 * fine;
    float lichen = smoothstep(0.74, 0.8, psNoise(p * 3.1 + 5.0));
    c = mix(c, vec3(0.42, 0.42, 0.3), lichen * 0.55);
    float moss = smoothstep(0.45, 0.85, vPaintN.y) * smoothstep(0.35, 0.65, big + 0.25 * fine);
    c = mix(c, vec3(0.1, 0.15, 0.06), moss * 0.75);`,
  metal: `
    c *= 0.84 + 0.18 * mid + 0.08 * fine;
    float rust = smoothstep(0.6, 0.85, mid * 0.6 + big * 0.55);
    c = mix(c, vec3(0.3, 0.13, 0.05), rust * 0.65);`,
  cloth: `
    c *= 0.8 + 0.22 * mid + 0.06 * fine;
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.12);`,
  fur: `
    float streak = psNoise(p * vec3(7.0, 22.0, 7.0));
    c *= (0.84 + 0.18 * mid) * (0.82 + 0.3 * streak);`,
  plain: `
    c *= 0.84 + 0.2 * mid + 0.08 * fine;`,
};
// ---- grass, as cards of fine blades (see grass.js) ----
let blades = null;
// Many fine blades of grass, drawn once: light on clear, darker at the base and paler toward
// the tips, leaning and curving a little, of mixed heights. u runs across (it repeats), v up.
function bladeTexture() {
  if (blades) return blades;
  const W = 512, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 230; i++) {
    const x = rand() * W;
    const height = H * (0.35 + 0.65 * rand() ** 0.7);
    const lean = (rand() - 0.5) * 0.5;
    const width = 3 + rand() * 4;
    const light = 190 + rand() * 50;
    for (const dx of [-W, 0, W]) {
      const gradient = ctx.createLinearGradient(0, H, 0, H - height);
      gradient.addColorStop(0, `rgb(${light * 0.75},${light * 0.75},${light * 0.75})`);
      gradient.addColorStop(1, `rgb(${Math.min(255, light + 40)},${Math.min(255, light + 40)},${Math.min(255, light + 40)})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x + dx - width / 2, H);
      ctx.quadraticCurveTo(x + dx + lean * height * 0.3, H - height * 0.55, x + dx + lean * height, H - height);
      ctx.quadraticCurveTo(x + dx + lean * height * 0.3 + width * 0.3, H - height * 0.5, x + dx + width / 2, H);
      ctx.fill();
    }
  }
  blades = new THREE.CanvasTexture(canvas);
  blades.colorSpace = THREE.SRGBColorSpace;
  blades.wrapS = THREE.RepeatWrapping;
  blades.anisotropy = 4;
  return blades;
}

// Gives the grass material the blade texture, cut out where it's clear.
export function bladeMaterial(material) {
  material.map = bladeTexture();
  material.alphaTest = 0.4;
  // (The blades' texture is mid-grey, the old tufts' paint near white; and the new look's ground
  // is lifted (terrain.js), so the grass is lifted to match.)
  material.color.setScalar(2.2);
  return material;
}

// The grass tufts as clumps of crossed cards: [cards, width, height] in meters, before each
// tuft's own scale.
const TUFTS = {
  'grass-tuft': [4, 0.55, 0.9], 'grass-short': [4, 0.6, 0.6], 'grass-clump': [5, 0.65, 1.0], 'grass-sparse': [3, 0.5, 0.8],
  'grass-wide': [4, 0.9, 0.75], 'grass-wisp': [3, 0.4, 1.1], 'grass-tall': [4, 0.6, 1.5], 'grass-seed': [4, 0.55, 1.3],
};
export const isBladeTuft = (name) => name in TUFTS;
export function bladeTuft(name) {
  const [cards, width, height] = TUFTS[name];
  const positions = [];
  const uvs = [];
  const index = [];
  let seed = name.length * 97;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < cards; k++) {
    const a = (Math.PI * k) / cards + rand() * 0.4;
    const dx = (Math.cos(a) * width) / 2;
    const dz = (Math.sin(a) * width) / 2;
    const u = rand();
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    uvs.push(u, 0, u + width / 1.2, 0, u + width / 1.2, 1, u, 1);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(positions.length).fill(1), 3));
  geometry.setIndex(index);
  return geometry;
}

// The models rebuilt for the new look (blender/remake.py), loaded from public/models/look/ in
// its place (see models.js).
export const REMADE = new Set([
  'rock', 'rock-small', 'rock-flat', 'rock-tall', 'rock-large',
  'fallen-log', 'stump', 'tree-dead', 'logs',
  'plane', 'plane-wing', 'suitcase', 'debris', 'landing-wheel', 'clod',
  'barrel', 'chest', 'supply-crate', 'ammo-box', 'locker', 'cupboard', 'weathered-pack',
  'campfire', 'log-pile', 'fire-ring', 'torch', 'bedroll', 'trap', 'berry-bush', 'grass-fern',
  'bones', 'stalagmite', 'stone', 'axe', 'axe-ground',
  // (These keep their old layouts, built from finer parts: blender/fine.py.)
  'cabin', 'hunting-stand', 'lean-to', 'campsite', 'truck', 'fence', 'fence-broken', 'lookout',
  'cot', 'fire-finder', 'binoculars', 'fire-gate', 'signpost', 'crystals', 'glow-fungus',
]);

// Which surface each of the models' materials gets, by its name in the model.
const SURFACE_OF = {
  wood: 'wood', 'log-pile': 'wood', stump: 'wood', campfire: 'wood', tool: 'wood', bow: 'wood', arrow: 'wood', knife: 'wood', trap: 'wood',
  rock: 'rock', stone: 'rock',
  metal: 'metal', truck: 'metal',
  cloth: 'cloth', backpack: 'cloth', suitcase: 'cloth', player: 'cloth',
  animal: 'fur',
  shelter: 'plain', 'berry-bush': 'plain', berry: 'plain',
};
export const surfaceFor = (materialName) => SURFACE_OF[materialName.split('.')[0]];

export function paintedSurface(material, kind) {
  const paint = SURFACES[kind];
  // (Once only: a model's parts often share a material, and painting it twice breaks its shader.)
  if (!paint || material.userData.painted) return material;
  material.userData.painted = true;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before?.(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintP;\nvarying vec3 vPaintN;\nvarying vec3 vPaintObjN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPaintP = position;
        vPaintObjN = normalize(objectNormal);
        #ifdef USE_INSTANCING
          vPaintP += instanceMatrix[3].xyz * 0.37;
          vPaintN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vPaintN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPaintP;
        varying vec3 vPaintN;
        varying vec3 vPaintObjN;
        float psHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float psNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(psHash(i), psHash(i + vec3(1, 0, 0)), f.x), mix(psHash(i + vec3(0, 1, 0)), psHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(psHash(i + vec3(0, 0, 1)), psHash(i + vec3(1, 0, 1)), f.x), mix(psHash(i + vec3(0, 1, 1)), psHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vPaintP;
          float big = psNoise(p * 0.6);
          float mid = psNoise(p * 2.3 + 3.0);
          float fine = psNoise(p * 9.0 + 7.0);
          vec3 c = diffuseColor.rgb;
          ${paint}
          diffuseColor.rgb = c;
        }`);
  };
  // (Three.js shares one compiled shader between materials whose onBeforeCompile looks the
  // same; each surface has to say it's different.)
  material.customProgramCacheKey = () => `${key}|painted-${kind}`;
  // (A copy of the material, as the cabins' fading roofs and the suitcases make, is painted too.)
  material.clone = function () {
    const copy = THREE.Material.prototype.clone.call(this);
    delete copy.userData.painted; // (copied over with the rest, but the copy isn't painted yet)
    return paintedSurface(copy, kind);
  };
  material.needsUpdate = true;
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
