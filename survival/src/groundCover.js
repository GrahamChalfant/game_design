import * as THREE from 'three';

// The small things on the forest floor and in the meadows, so the ground isn't bare: moss
// mounds, ferns, low shrubs (Labrador tea and blueberry), fallen branches, rust-brown drifts of
// spruce needles, little clusters of stones, and roots spreading out from the spruce. They're
// grown with the grass (see grass.js), chunk by chunk around the player, and like it they're
// cleared from under campfires, cabins and so on.
//
// Each kind is one small low-poly shape, made here, flat-shaded in the muted palette. Every
// copy is tinted, turned and sized a little differently.

const UP = new THREE.Vector3(0, 1, 0);

// What grows where. `weights` are how often each kind is picked: deep in the forest, and out
// in the open (in between, they're blended). `chance` is how many of the spots tried get
// anything at all.
const DEEP = { chance: 0.62, weights: { moss: 26, litter: 22, fern: 16, shrub: 14, branch: 12, stones: 5, mushrooms: 5 } };
const OPEN = { chance: 0.11, weights: { shrub: 46, stones: 26, fern: 8, moss: 8, branch: 6, litter: 0, mushrooms: 0 } };
export const COVER_KINDS = ['moss', 'litter', 'fern', 'shrub', 'branch', 'stones', 'mushrooms', 'roots'];
// The spruce whose roots show (the others are birch, saplings and the like).
const ROOTED = new Set(['pine', 'pine-tall', 'pine-wide', 'pine-skinny', 'pine-snow', 'tree-dead']);

// One kind's shape: a list of triangles, each [colour, a, b, c], as a flat-shaded geometry.
function shape(triangles) {
  const positions = [];
  const colors = [];
  const c = new THREE.Color();
  for (const [color, ...corners] of triangles) {
    c.set(color);
    for (const p of corners) {
      positions.push(...p);
      colors.push(c.r, c.g, c.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// A rough ball (an icosahedron, jittered), squashed to `size`, coloured top and bottom.
function lump(center, size, top, side, random, triangles) {
  const ico = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const p = ico.attributes.position;
  const jitter = new Map();
  const at = (i) => {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.82 + random() * 0.36);
    const k = jitter.get(key);
    return [center[0] + p.getX(i) * size[0] * k, center[1] + p.getY(i) * size[1] * k, center[2] + p.getZ(i) * size[2] * k];
  };
  for (let i = 0; i < p.count; i += 3) {
    const tri = [at(i), at(i + 1), at(i + 2)];
    const up = (tri[0][1] + tri[1][1] + tri[2][1]) / 3 - center[1];
    triangles.push([up > size[1] * 0.25 ? top : side, ...tri]);
  }
}

// A tapered prism from `a` to `b` (radii ra, rb), for branches and roots.
function stick(a, b, ra, rb, color, triangles, sides = 5) {
  const axis = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, axis);
  const ring = (centre, r, k) => {
    const t = (k / sides) * Math.PI * 2;
    return new THREE.Vector3(...centre).addScaledVector(side, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r).toArray();
  };
  for (let k = 0; k < sides; k++) {
    const [a0, a1, b0, b1] = [ring(a, ra, k), ring(a, ra, k + 1), ring(b, rb, k), ring(b, rb, k + 1)];
    triangles.push([color, a0, b0, a1], [color, a1, b0, b1]);
  }
}

// Seeded the same every time, so the shapes don't change between games.
function maker(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function buildShapes() {
  const r = maker(7);
  const shapes = {};
  // Moss: a low, soft mound, bright on top.
  let t = [];
  lump([0, 0.02, 0], [0.42, 0.13, 0.36], 0x6f8a4a, 0x4c6236, r, t);
  lump([0.28, 0.0, 0.14], [0.2, 0.08, 0.18], 0x7a9452, 0x52683a, r, t);
  shapes.moss = shape(t);
  // Needle litter: a flat, ragged rust-brown drift lying on the ground.
  t = [];
  const rim = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2;
    const d = 0.75 + r() * 0.35;
    return [Math.cos(a) * d, 0.015, Math.sin(a) * d];
  });
  for (let i = 0; i < rim.length; i++) t.push([i % 3 ? 0x5c4430 : 0x4e3a29, [0, 0.025, 0], rim[(i + 1) % rim.length], rim[i]]);
  shapes.litter = shape(t);
  // A fern: fronds arching out from the middle and drooping at the tips.
  t = [];
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2 + r() * 0.4;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const [sx, sz] = [-dz, dx];
    const pts = [[0, 0.02], [0.18, 0.2], [0.36, 0.27], [0.52, 0.2], [0.62, 0.08]];
    const widths = [0.02, 0.07, 0.08, 0.05, 0.0];
    const color = f % 2 ? 0x5f7a3c : 0x6c8644;
    for (let i = 0; i < pts.length - 1; i++) {
      const [d0, y0] = pts[i];
      const [d1, y1] = pts[i + 1];
      const [w0, w1] = [widths[i], widths[i + 1]];
      const p0l = [dx * d0 + sx * w0, y0, dz * d0 + sz * w0];
      const p0r = [dx * d0 - sx * w0, y0, dz * d0 - sz * w0];
      const p1l = [dx * d1 + sx * w1, y1, dz * d1 + sz * w1];
      const p1r = [dx * d1 - sx * w1, y1, dz * d1 - sz * w1];
      t.push([color, p0l, p1l, p0r], [color, p0r, p1l, p1r]);
    }
  }
  shapes.fern = shape(t);
  // A low shrub: a few dark, leathery leaf clumps (Labrador tea), the odd paler one.
  t = [];
  lump([0, 0.16, 0], [0.26, 0.17, 0.24], 0x48603a, 0x34472c, r, t);
  lump([0.2, 0.11, 0.12], [0.18, 0.12, 0.17], 0x52683e, 0x3a4e2e, r, t);
  lump([-0.16, 0.1, 0.1], [0.17, 0.11, 0.16], 0x6a7046, 0x44502e, r, t);
  stick([0, 0, 0], [0.05, 0.14, 0.02], 0.018, 0.01, 0x4a3a2c, t, 4);
  shapes.shrub = shape(t);
  // A fallen branch: a grey-brown stick lying on the ground with a side twig (length 1).
  t = [];
  stick([-0.5, 0.035, 0], [0.5, 0.025, 0.04], 0.035, 0.016, 0x6b5a48, t);
  stick([0.05, 0.03, 0.01], [0.32, 0.03, 0.22], 0.016, 0.006, 0x6b5a48, t, 4);
  stick([-0.2, 0.03, 0], [-0.36, 0.06, -0.15], 0.014, 0.005, 0x5e4e3e, t, 4);
  shapes.branch = shape(t);
  // Stones: three or four small grey ones together.
  t = [];
  lump([0, 0.04, 0], [0.11, 0.07, 0.09], 0x8a8a84, 0x6a6a66, r, t);
  lump([0.15, 0.025, 0.08], [0.07, 0.045, 0.06], 0x92928a, 0x707070, r, t);
  lump([-0.1, 0.02, 0.12], [0.06, 0.035, 0.05], 0x7e7e78, 0x62625e, r, t);
  lump([0.06, 0.015, -0.13], [0.05, 0.03, 0.045], 0x8a8a84, 0x66665f, r, t);
  shapes.stones = shape(t);
  // Mushrooms: a few pale-capped ones in the moss.
  t = [];
  for (const [x, z, h] of [[0, 0, 0.09], [0.08, 0.05, 0.06], [-0.06, 0.07, 0.05]]) {
    stick([x, 0, z], [x, h, z], 0.012, 0.01, 0xd8ccb0, t, 4);
    lump([x, h, z], [0.04 * (h / 0.07), 0.018, 0.04 * (h / 0.07)], 0xb88a5a, 0x9a7048, r, t);
  }
  shapes.mushrooms = shape(t);
  // Roots: four spreading out from a trunk's foot and down into the ground (for a tree of scale 1).
  t = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + r() * 0.5;
    const reach = 0.75 + r() * 0.45;
    stick([Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2], [Math.cos(a) * reach, -0.04, Math.sin(a) * reach], 0.075, 0.02, 0x4e3e30, t);
  }
  shapes.roots = shape(t);
  return shapes;
}

// The materials and shapes, made once.
export function coverParts() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
  return { material, shapes: buildShapes() };
}

// Picks something to grow at (x, z) in a chunk, or null. `random` is the chunk's own;
// `woods` how deep in the forest it is (0–1); `ground` the terrain's ground there.
export function pickCover(random, woods) {
  const deep = THREE.MathUtils.smoothstep(woods, 0.1, 0.6);
  if (random.next() > THREE.MathUtils.lerp(OPEN.chance, DEEP.chance, deep)) return null;
  let total = 0;
  const weights = COVER_KINDS.filter((k) => k !== 'roots').map((k) => {
    const w = THREE.MathUtils.lerp(OPEN.weights[k] ?? 0, DEEP.weights[k] ?? 0, deep);
    total += w;
    return [k, w];
  });
  let roll = random.next() * total;
  for (const [k, w] of weights) if ((roll -= w) <= 0) return k;
  return null;
}

// How big each kind is drawn (a scale range), and whether it lies along the slope.
const SIZES = { moss: [0.6, 1.5], litter: [0.45, 1.05], fern: [0.7, 1.35], shrub: [0.7, 1.4], branch: [0.7, 1.7], stones: [0.7, 1.4], mushrooms: [0.8, 1.3] };
const LIES_FLAT = new Set(['litter', 'branch', 'moss']);

// A copy of `kind` at (x, z): its matrix and tint.
export function placeCover(kind, x, z, random, terrain) {
  const size = THREE.MathUtils.lerp(...SIZES[kind], random.next());
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, random.next() * Math.PI * 2);
  if (LIES_FLAT.has(kind)) {
    const { x: sx, z: sz } = terrain.slopeAt(x, z);
    turn.premultiply(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(-sx, 1, -sz).normalize()));
  }
  const scale = kind === 'branch' ? new THREE.Vector3(size, 1, size) : new THREE.Vector3(size, size * (0.85 + random.next() * 0.3), size);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, terrain.heightAt(x, z) - 0.01, z), turn, scale);
  const color = new THREE.Color().setScalar(0.85 + random.next() * 0.3);
  return { x, z, matrix, color };
}

// Roots for each spruce in the chunk at (cx, cz) (see Trees: `grid`), sized to the tree.
export function rootsFor(trees, chunkX, chunkZ, chunkSize, terrain, random) {
  const out = [];
  const midX = (chunkX + 0.5) * chunkSize;
  const midZ = (chunkZ + 0.5) * chunkSize;
  for (const tree of trees.grid.near(midX, midZ, chunkSize * 0.72)) {
    if (!ROOTED.has(tree.kind)) continue; // (a stump keeps its roots)
    if (Math.floor(tree.x / chunkSize) !== chunkX || Math.floor(tree.z / chunkSize) !== chunkZ) continue;
    const { scale, rotation } = tree.spot;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(tree.x, terrain.heightAt(tree.x, tree.z), tree.z),
      new THREE.Quaternion().setFromAxisAngle(UP, rotation + random.next()),
      new THREE.Vector3(scale, scale, scale),
    );
    out.push({ x: tree.x, z: tree.z, matrix, color: new THREE.Color().setScalar(0.85 + random.next() * 0.3), tree });
  }
  return out;
}
