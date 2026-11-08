import * as THREE from 'three';
import { NEW_LOOK, paintedCover } from './look.js';

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
// The spruce whose roots show (the others are saplings, dead snags and the like).
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
  // Moss: a low, soft, lumpy cushion (smooth-shaded: see coverParts), lighter on top.
  shapes.moss = mossCushion(r);
  // Needle litter: a thin, ragged drift of old needles, its rim sunk just under the ground so
  // it melts into it rather than lying on top like a mat.
  let t = [];
  const rim = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const d = 0.62 + r() * 0.45;
    return [Math.cos(a) * d, -0.03, Math.sin(a) * d];
  });
  const mid = rim.map(([x, , z], i) => [x * 0.55 + (r() - 0.5) * 0.08, 0.018, z * 0.55 + (r() - 0.5) * 0.08]);
  for (let i = 0; i < rim.length; i++) {
    const j = (i + 1) % rim.length;
    const shade = i % 3 ? 0x4f402d : 0x463826;
    t.push([0x54442f, [0, 0.025, 0], mid[j], mid[i]], [shade, mid[i], mid[j], rim[j]], [shade, mid[i], rim[j], rim[i]]);
  }
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
  lump([0, 0.16, 0], [0.26, 0.17, 0.24], 0x37492d, 0x263222, r, t);
  lump([0.2, 0.11, 0.12], [0.18, 0.12, 0.17], 0x3e5131, 0x2a3724, r, t);
  lump([-0.16, 0.1, 0.1], [0.17, 0.11, 0.16], 0x525a38, 0x343d26, r, t);
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

// A moss cushion: a squashed sphere with a lumpy top and a flat underside, its colour going
// from dark at the base to a lighter, mossy green on top. Smooth-shaded, so it looks soft.
function mossCushion(r) {
  const geometry = new THREE.SphereGeometry(1, 12, 7);
  const p = geometry.attributes.position;
  const colors = [];
  const low = new THREE.Color(0x2c3a24);
  const high = new THREE.Color(0x4a5c33);
  const c = new THREE.Color();
  const bumps = Array.from({ length: 7 }, () => [r() * 1.6 - 0.8, r() * 1.6 - 0.8, 0.25 + r() * 0.5]);
  for (let i = 0; i < p.count; i++) {
    let [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    let lift = 1;
    for (const [bx, bz, h] of bumps) lift += h * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) * 9);
    y = y < 0 ? y * 0.15 : y * lift;
    p.setXYZ(i, x * 0.42, y * 0.07, z * 0.36);
    c.copy(low).lerp(high, Math.min(1, Math.max(0, y) * 0.8 + 0.25 * Math.sin(x * 9 + z * 7) ** 2));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The materials and shapes, made once. Most are flat-shaded; the moss is smooth.
export function coverParts() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
  const smooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  if (NEW_LOOK) {
    // (The new look: mottled like the ground, and the moss darker, see look.js.)
    paintedCover(material, 0.8);
    paintedCover(smooth, 0.62);
  }
  return { material, materials: { moss: smooth }, shapes: buildShapes() };
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
const SIZES = { moss: [0.5, 1.3], litter: [0.45, 1.05], fern: [0.7, 1.35], shrub: [0.7, 1.4], branch: [0.7, 1.7], stones: [0.7, 1.4], mushrooms: [0.8, 1.3] };
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
