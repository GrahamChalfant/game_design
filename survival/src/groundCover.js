import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintedCover } from './look.js';

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
const OPEN = { chance: 0.11, weights: { shrub: 8, stones: 26, fern: 8, moss: 8, branch: 6, litter: 0, mushrooms: 0 } };
// (The heath and lichen carpet the ground in a pass of their own: pickCarpet.)
export const COVER_KINDS = ['moss', 'litter', 'fern', 'shrub', 'branch', 'stones', 'mushrooms', 'roots', 'heath', 'lichen'];
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

// Seeded the same every time, so the shapes don't change between games.
function maker(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// The moss (the other shapes are built in buildFineShapes, on top of this).
function buildShapes() {
  return { moss: mossCushion(maker(7)) };
}

// ---- the shapes: moss above, the rest here ----

// A rounded lump: a finer icosahedron, its corners jittered smoothly by noise-like offsets,
// squashed to `size`; colour(up) picks a face's colour from how far it faces up (-1 to 1).
function fineLump(center, size, colour, random, triangles, detail = 1) {
  const ico = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const p = ico.attributes.position;
  const seeds = [random() * 6, random() * 6, random() * 6];
  const at = (i) => {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    const k = 0.86 + 0.14 * Math.sin(x * 3.1 + seeds[0]) * Math.sin(y * 2.7 + seeds[1]) + 0.08 * Math.sin(z * 4.3 + seeds[2]);
    return [center[0] + x * size[0] * k, center[1] + y * size[1] * k, center[2] + z * size[2] * k];
  };
  for (let i = 0; i < p.count; i += 3) {
    const tri = [at(i), at(i + 1), at(i + 2)];
    const a = new THREE.Vector3(...tri[1]).sub(new THREE.Vector3(...tri[0]));
    const b = new THREE.Vector3(...tri[2]).sub(new THREE.Vector3(...tri[0]));
    triangles.push([colour(a.cross(b).normalize().y), ...tri]);
  }
}

// A bent, tapering stick along `path` (points), radii from r0 to r1, coloured by colour(i).
function bentStick(path, r0, r1, colour, triangles, sides = 7) {
  const rings = path.map((point, i) => {
    const next = new THREE.Vector3(...path[Math.min(i + 1, path.length - 1)]);
    const prev = new THREE.Vector3(...path[Math.max(i - 1, 0)]);
    const axis = next.sub(prev).normalize();
    const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, axis);
    const r = r0 + (r1 - r0) * (i / (path.length - 1));
    return Array.from({ length: sides }, (_, k) => {
      const t = (k / sides) * Math.PI * 2;
      return new THREE.Vector3(...point).addScaledVector(side, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r).toArray();
    });
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const c = colour(i);
      triangles.push([c, rings[i][k], rings[i + 1][k], rings[i][k1]], [c, rings[i][k1], rings[i + 1][k], rings[i + 1][k1]]);
    }
  }
}

const pick = (random, colours) => colours[Math.floor(random() * colours.length)];

function buildFineShapes() {
  const r = maker(11);
  const shapes = buildShapes(); // (the moss)
  // Needle litter: a finer ragged drift, sunk at its rim, with a few twigs lying in it.
  let t = [];
  const rim = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2;
    const d = 0.6 + r() * 0.5;
    return [Math.cos(a) * d, -0.03, Math.sin(a) * d];
  });
  const mid = rim.map(([x, , z]) => [x * 0.55 + (r() - 0.5) * 0.06, 0.015 + r() * 0.012, z * 0.55 + (r() - 0.5) * 0.06]);
  for (let i = 0; i < rim.length; i++) {
    const j = (i + 1) % rim.length;
    const shade = pick(r, [0x4f402d, 0x463826, 0x54442f, 0x5a4a34]);
    t.push([shade, [0, 0.022, 0], mid[j], mid[i]], [shade, mid[i], mid[j], rim[j]], [pick(r, [0x463826, 0x4f402d]), mid[i], rim[j], rim[i]]);
  }
  for (let k = 0; k < 4; k++) {
    const a = r() * Math.PI * 2;
    const [x, z] = [(r() - 0.5) * 0.7, (r() - 0.5) * 0.7];
    const l = 0.15 + r() * 0.2;
    bentStick([[x, 0.03, z], [x + Math.cos(a) * l, 0.03, z + Math.sin(a) * l]], 0.008, 0.004, () => 0x5e4e3e, t, 4);
  }
  shapes.litter = shape(t);
  // A fern: fronds arching out, each a stem with leaflets that shorten toward its tip.
  t = [];
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * Math.PI * 2 + r() * 0.35;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const [sx, sz] = [-dz, dx];
    const length = 0.55 + r() * 0.15;
    const spine = Array.from({ length: 9 }, (_, i) => {
      const s = i / 8;
      return [dx * length * s, 0.3 * Math.sin(s * Math.PI * 0.8) * (1 - 0.3 * s) + 0.01, dz * length * s];
    });
    const colour = f % 2 ? 0x5f7a3c : 0x6c8644;
    for (let i = 0; i < 8; i++) {
      const [p, q] = [spine[i], spine[i + 1]];
      const w = 0.09 * Math.sin(((i + 0.5) / 8) * Math.PI) + 0.015;
      for (const s of [-1, 1]) {
        const tip = [p[0] * 0.3 + q[0] * 0.7 + sx * s * w + (q[0] - p[0]) * 0.4, p[1] * 0.3 + q[1] * 0.7 - w * 0.25, p[2] * 0.3 + q[2] * 0.7 + sz * s * w + (q[2] - p[2]) * 0.4];
        t.push([colour, p, q, tip]);
      }
    }
  }
  shapes.fern = shape(t);
  // A Labrador-tea thicket: a knee-high clump of leafy sprigs (heath cards, see heathPatch).
  shapes.shrub = heathPatch(r, { radius: 0.35, mound: 0.14, cards: 11, height: [0.3, 0.52], spread: 0.8 });
  // The heath and the reindeer lichen, which carpet the open ground.
  shapes.heath = heathPatch(r, {});
  shapes.lichen = lichenClump(r);
  // A fallen branch: a bent, tapering stick (length 1) with forked side twigs.
  t = [];
  const bark = () => pick(r, [0x6b5a48, 0x5e4e3e, 0x75655a]);
  bentStick([[-0.5, 0.035, 0], [-0.2, 0.04, 0.03], [0.15, 0.03, 0.01], [0.5, 0.025, 0.05]], 0.034, 0.014, bark, t, 7);
  bentStick([[0.05, 0.035, 0.015], [0.2, 0.04, 0.12], [0.33, 0.035, 0.23]], 0.016, 0.005, bark, t, 5);
  bentStick([[0.2, 0.04, 0.12], [0.24, 0.05, 0.02]], 0.007, 0.003, bark, t, 4);
  bentStick([[-0.2, 0.04, 0.02], [-0.3, 0.06, -0.08], [-0.37, 0.07, -0.16]], 0.014, 0.004, bark, t, 5);
  shapes.branch = shape(t);
  // Stones: a few rounded grey ones together, lichen pale on their tops.
  t = [];
  for (const [c, s] of [[[0, 0.04, 0], [0.11, 0.07, 0.09]], [[0.15, 0.025, 0.08], [0.07, 0.045, 0.06]], [[-0.1, 0.02, 0.12], [0.06, 0.035, 0.05]], [[0.06, 0.015, -0.13], [0.05, 0.03, 0.045]]]) {
    fineLump(c, s, (up) => (up > 0.7 && r() < 0.35 ? 0x8f8d72 : up > 0.2 ? pick(r, [0x8a8a84, 0x92928a, 0x7e7e78]) : 0x62625e), r, t);
  }
  shapes.stones = shape(t);
  // Mushrooms: pale stems under domed caps, the gills darker underneath.
  t = [];
  for (const [x, z, h] of [[0, 0, 0.09], [0.08, 0.05, 0.06], [-0.06, 0.07, 0.05]]) {
    bentStick([[x, 0, z], [x + 0.004, h * 0.6, z], [x, h, z]], 0.012, 0.009, () => 0xd8ccb0, t, 6);
    const w = 0.042 * (h / 0.07);
    fineLump([x, h, z], [w, 0.022, w], (up) => (up > 0.1 ? pick(r, [0xb88a5a, 0xa87a4c]) : 0x6e5a44), r, t);
  }
  shapes.mushrooms = shape(t);
  // Roots: spreading from a trunk's foot, curving down into the ground (for a tree of scale 1).
  t = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r() * 0.5;
    const reach = 0.75 + r() * 0.45;
    const [cx, cz] = [Math.cos(a), Math.sin(a)];
    bentStick([[cx * 0.18, 0.14, cz * 0.18], [cx * reach * 0.4, 0.09, cz * reach * 0.4], [cx * reach * 0.75, 0.02, cz * reach * 0.75], [cx * reach, -0.05, cz * reach]], 0.08, 0.018, () => pick(r, [0x4e3e30, 0x5a4a3a, 0x463628]), t, 7);
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

// ---- the heath: the dwarf shrubs that carpet open northern ground ----
// Out of the deep forest, the boreal and subarctic ground (northern Canada, Finnmark) isn't
// grass with bare earth between: it's a knee-to-ankle-high mat of dwarf shrubs (crowberry,
// lingonberry, bilberry, bearberry, Labrador tea, dwarf birch and willow, turning red and
// orange in autumn), cushions of pale reindeer lichen on the dry rises, and moss, with sedge
// and grass in clumps through it. The plants grow in patches and zones, not evenly.
// A heath patch is a low leafy mound with sprigs standing out of it: cards of a leaf texture
// (light on clear: the copy's tint gives the plant), the mound mapped to the texture's solid
// band of leaves, the sprigs to its sprigs.
let heathLeaves = null;
const HEATH_BAND = 0.2; // the bottom of the texture: solid leaves (for the mounds)
const HEATH_CLUMPS = 4; // bushes across the rest of it, one per card
function heathTexture() {
  if (heathLeaves) return heathLeaves;
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const r = maker(29);
  const leaf = (x, y, angle, length, width, light) => {
    const l = Math.round(Math.min(255, light));
    ctx.fillStyle = `rgb(${l},${l},${l})`;
    for (const dx of [-W, 0, W]) { // (three times, so it repeats seamlessly across)
      ctx.beginPath();
      ctx.ellipse(x + dx, y, width, length, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  // The solid band at the bottom: leaves over leaves, no gaps.
  ctx.fillStyle = 'rgb(70,70,70)';
  ctx.fillRect(0, H * (1 - HEATH_BAND), W, H * HEATH_BAND);
  for (let i = 0; i < 1400; i++) leaf(r() * W, H * (1 - HEATH_BAND) + r() * H * HEATH_BAND, r() * Math.PI, 5 + r() * 4, 2.5 + r() * 2, 90 + r() * 140);
  // Above it, HEATH_CLUMPS bushes side by side (a card shows one): woody sprigs fanning up and
  // out from the middle, tallest there and lower toward the sides, so each card's outline is a
  // ragged dome, not a rectangle. Small leaves all along the sprigs, smaller toward the tips.
  ctx.lineCap = 'round';
  const clumpW = W / HEATH_CLUMPS;
  for (let c = 0; c < HEATH_CLUMPS; c++) {
    const middle = (c + 0.5) * clumpW;
    for (let s = 0; s < 26; s++) {
      const off = (r() + r() + r() - 1.5) / 1.5; // (-1..1, most near the middle)
      let x = middle + off * clumpW * 0.32;
      let y = H * (1 - HEATH_BAND * 0.5);
      const top = H * (0.06 + 0.62 * Math.abs(off) ** 1.3 + 0.22 * r());
      const lean = off * 0.55 + (r() - 0.5) * 0.25;
      const step = 7;
      for (let k = 0; y > top; k++) {
        const nx = Math.min(middle + clumpW * 0.47, Math.max(middle - clumpW * 0.47, x + lean * step + Math.sin(k * 0.7 + s) * 1.2));
        const ny = y - step;
        ctx.strokeStyle = 'rgb(85,85,85)';
        ctx.lineWidth = 2.2 * (y - top) / (H - top) + 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        const t = (H - y) / (H - top);
        for (const side of [-1, 1]) {
          const lx = Math.min(middle + clumpW * 0.46, Math.max(middle - clumpW * 0.46, nx + side * 5));
          if (r() < 0.85) leaf(lx, ny, side * (0.7 + r() * 0.5), (7 - 2.5 * t) + r() * 2, 3 + r() * 1.5, 110 + r() * 130);
        }
        x = nx;
        y = ny;
      }
    }
  }
  heathLeaves = new THREE.CanvasTexture(canvas);
  heathLeaves.colorSpace = THREE.SRGBColorSpace;
  heathLeaves.wrapS = THREE.RepeatWrapping;
  heathLeaves.anisotropy = 4;
  return heathLeaves;
}

// A heath patch about 1 m across (before each copy's scale): a lumpy mound `mound` high and
// `cards` sprig cards standing out of it, `height` (a range) tall.
function heathPatch(r, { radius = 0.5, mound = 0.1, cards = 8, height = [0.12, 0.26], spread = 0.65 }) {
  const positions = [];
  const uvs = [];
  const normals = [];
  const quad = (a, b, c, d, ua, ub, uc, ud) => {
    for (const [p, uv] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) {
      positions.push(...p);
      uvs.push(...uv);
      // (Lit like a soft rounded mass, not card by card.)
      const n = new THREE.Vector3(p[0] * 0.8, 1, p[2] * 0.8).normalize();
      normals.push(n.x, n.y, n.z);
    }
  };
  // The mound: rings out from the middle, lumpy, its rim sunk into the ground.
  const sectors = 12;
  const rings = [0, 0.4, 0.75, 1].map((f, i) => Array.from({ length: sectors }, (_, k) => {
    const a = (k / sectors) * Math.PI * 2;
    const wobble = 1 + 0.25 * Math.sin(a * 3 + r() * 6) * (i > 0 ? 1 : 0);
    const h = i === 3 ? -0.04 : mound * (1 - f * f) * (0.8 + r() * 0.4);
    return [Math.cos(a) * radius * f * wobble, h, Math.sin(a) * radius * f * wobble];
  }));
  // (Mapped flat from above onto the texture's solid band of leaves.)
  const bandUV = (p) => [p[0] * 0.45 + 0.5, HEATH_BAND * (0.5 + 0.85 * p[2] / (radius * 2))];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sectors; k++) {
      const k1 = (k + 1) % sectors;
      const [a, b, c, d] = [rings[i][k], rings[i + 1][k], rings[i + 1][k1], rings[i][k1]];
      quad(a, d, c, b, bandUV(a), bandUV(d), bandUV(c), bandUV(b)); // (wound to face up)
    }
  }
  // The sprigs: upright cards through the mound, every way round.
  for (let k = 0; k < cards; k++) {
    const a = r() * Math.PI;
    const d = Math.sqrt(r()) * radius * spread;
    const ca = r() * Math.PI * 2;
    const [cx, cz] = [Math.cos(ca) * d, Math.sin(ca) * d];
    const w = (0.3 + r() * 0.3) * radius * 2 * 0.5;
    const h = height[0] + r() * (height[1] - height[0]);
    const [dx, dz] = [Math.cos(a) * w, Math.sin(a) * w];
    const base = mound * (1 - (d / radius) ** 2) - 0.04;
    // (One of the texture's bushes, the whole width of it, maybe mirrored.)
    const clump = Math.floor(r() * HEATH_CLUMPS);
    let [u0, du] = [(clump + 0.02) / HEATH_CLUMPS, 0.96 / HEATH_CLUMPS];
    if (r() < 0.5) [u0, du] = [u0 + du, -du];
    const tilt = (r() - 0.5) * 0.15;
    quad([cx - dx, base, cz - dz], [cx + dx, base, cz + dz], [cx + dx + tilt, base + h, cz + dz], [cx - dx + tilt, base + h, cz - dz],
      [u0, HEATH_BAND * 0.6], [u0 + du, HEATH_BAND * 0.6], [u0 + du, 1], [u0, 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(positions.length).fill(1), 3));
  return geometry;
}

// Reindeer lichen: a cluster of pale, soft cushions, smooth shaded.
function lichenClump(r) {
  const parts = [];
  for (let k = 0; k < 6; k++) {
    const a = r() * Math.PI * 2;
    const d = k === 0 ? 0 : 0.12 + r() * 0.22;
    const s = 0.09 + r() * 0.09;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    const seeds = [r() * 6, r() * 6];
    for (let i = 0; i < p.count; i++) {
      let [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
      const lump = 1 + 0.18 * Math.sin(x * 7 + seeds[0]) * Math.sin(z * 6 + seeds[1]) + 0.1 * Math.sin(y * 11 + x * 5);
      y = y < 0 ? y * 0.2 : y;
      p.setXYZ(i, Math.cos(a) * d + x * s * lump, (y * 0.55 * s) * lump - 0.01, Math.sin(a) * d + z * s * lump);
      // (Pale grey-green, the hollows between its branches darker.)
      c.set(0x687060).lerp(new THREE.Color(0xa6ae9a), Math.min(1, Math.max(0, y) * 0.8 + 0.3 * (lump - 0.85)));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

// The heath's plants, as tints of the leaf texture (linear-ish, the texture is mid-grey), and
// how each zone mixes them: crowberry and lingonberry evergreen, bilberry gone red, dwarf
// birch and willow orange, Labrador tea olive.
const HEATH_TINTS = {
  crowberry: [0x5e7444, 0x687e48], lingonberry: [0x70904a, 0x7c9a4e], bilberry: [0x7a3828, 0x8a4630, 0x7a5034],
  birch: [0xa0602e, 0xae7434, 0x8e5a2c], tea: [0x7e8452, 0x8a905a],
};
const HEATH_ZONES = [
  ['crowberry', 'crowberry', 'lingonberry', 'tea', 'bilberry'],
  ['lingonberry', 'crowberry', 'bilberry', 'birch', 'lingonberry'],
  ['birch', 'crowberry', 'tea', 'bilberry', 'crowberry'],
  ['tea', 'crowberry', 'lingonberry', 'lingonberry', 'birch'],
];

// A smooth value noise (0–1), for patches and zones.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function patchNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// What carpets the ground at (x, z), or null: `woods` how deep in the forest (0–1). The heath
// grows in patches (bigger and closer in the open), lichen on the dry rises between, Labrador
// tea in thickets; under the spruce, mostly moss and bilberry.
export function pickCarpet(random, x, z, woods) {
  const patch = patchNoise(x * 0.18 + 31, z * 0.18) * 0.65 + patchNoise(x * 0.7, z * 0.7 + 17) * 0.35;
  const open = 1 - THREE.MathUtils.smoothstep(woods, 0.05, 0.5);
  const chance = THREE.MathUtils.lerp(0.3, 0.95, open) * THREE.MathUtils.smoothstep(patch, 0.12, 0.5);
  if (random.next() > chance) return null;
  const dry = patchNoise(x * 0.11 + 70, z * 0.11 - 40);
  if (open > 0.5 && dry > 0.68 && random.next() < 0.35) return { kind: 'lichen', tint: null };
  if (random.next() < 0.08 + 0.1 * (1 - open)) return { kind: 'shrub', tint: random.pick(HEATH_TINTS.tea) };
  const zone = HEATH_ZONES[Math.floor(patchNoise(x * 0.05 - 9, z * 0.05 + 23) * HEATH_ZONES.length * 0.999)];
  const plant = open > 0.5 ? random.pick(zone) : random.pick(['bilberry', 'lingonberry', 'crowberry']);
  return { kind: 'heath', tint: random.pick(HEATH_TINTS[plant]) };
}

// The materials and shapes, made once. Most are flat-shaded; the moss is smooth.
export function coverParts() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
  const smooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  // (Mottled like the ground, and the moss darker, see look.js.)
  paintedCover(material, 0.8);
  paintedCover(smooth, 0.62);
  const leaves = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, map: heathTexture(), alphaTest: 0.5 });
  paintedCover(leaves, 1);
  // (Both sides of a sprig card lit by its soft, upward normal: the back of a card doesn't go
  // dark just because it faces away.)
  const painted = leaves.onBeforeCompile;
  leaves.onBeforeCompile = (shader, renderer) => {
    painted(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  leaves.customProgramCacheKey = () => 'cover-leaves';
  const lichen = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  paintedCover(lichen, 1);
  return { material, materials: { moss: smooth, heath: leaves, shrub: leaves, lichen }, shapes: buildFineShapes() };
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
const SIZES = { heath: [0.45, 1.0], lichen: [0.5, 1.2], moss: [0.5, 1.3], litter: [0.45, 1.05], fern: [0.7, 1.35], shrub: [0.7, 1.4], branch: [0.7, 1.7], stones: [0.7, 1.4], mushrooms: [0.8, 1.3] };
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
