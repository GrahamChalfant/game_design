// Fits the bow hand's fingers to the bow's grip (for handtest.html): each finger closed, joint by
// joint from the knuckle, until that segment rests on the grip, and the thumb brought in across the
// near side of it until it meets the grip or the fingertips. The numbers it gives are GRIPS.bow
// (src/handRig.js). Run it again after changing the grip (blender/hunting_props.py), the hands
// (blender/fp_hands.py) or how the bow's held (BOW_HOLD, src/handView.js). In the console:
//   const F = await import('./handtest-fit.js'); F.fitBow(); F.report()
import * as THREE from 'three';
import { GRIPS } from './src/handRig.js';

const { hands } = window.T;
const BOW_SCALE = 1.68 / 1.4; // (as handView.js draws the bow)
// The grip's cross-sections, as hunting_props.py's GRIP: [how far along it, half its width, half
// its depth], rounded rectangles (POWER); and the limbs it runs into, as they're made there.
const GRIP = [[0.078, 0.0172, 0.0146], [0.058, 0.0172, 0.0146], [0.042, 0.0136, 0.015], [0.02, 0.0126, 0.0152], [0.0, 0.0125, 0.0155]];
const POWER = 3.5;

// How far a point's outside the bow (model meters; negative: inside), in the bow mesh's own
// space: y along the stave, x across it, the string toward -z.
function outsideBow(p) {
  const y = Math.abs(p.y);
  let d = Infinity;
  if (y <= 0.09) {
    let [, rx, rz] = GRIP[0];
    for (let i = 0; i < GRIP.length - 1; i++) {
      const [y1, a1, b1] = GRIP[i];
      const [y0, a0, b0] = GRIP[i + 1];
      if (y > y1 || y < y0) continue;
      const t = (y - y0) / (y1 - y0);
      [rx, rz] = [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];
    }
    const f = ((Math.abs(p.x) / rx) ** POWER + (Math.abs(p.z) / rz) ** POWER) ** (1 / POWER);
    const r = Math.hypot(p.x, p.z);
    d = Math.max(f > 1e-6 ? r - r / f : -Math.min(rx, rz), y - GRIP[0][0]);
  }
  if (y >= 0.06) {
    // A limb: a tapering rectangle, bent back toward the string.
    const t = (y - 0.06) / (0.7 - 0.06);
    const qx = Math.abs(p.x) - 0.0192 * (1 - 0.6 * t) * Math.SQRT1_2;
    const qz = Math.abs(p.z + 0.1 * (y / 0.7) ** 2) - 0.0156 * (1 - 0.45 * t) * Math.SQRT1_2;
    d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0));
  }
  return d;
}

const rig = () => hands.rigs.left;
const v = new THREE.Vector3();
function bowMesh() {
  let found = null;
  hands.tools.bow.traverse((child) => (found = child.isMesh && child.name === 'bow' ? child : found));
  return found;
}

// The least any of a hand part's points is clear of the bow (meters, as drawn; negative: inside
// it). `own`: not the knuckle behind its joint, which goes where the segment before it does.
function clearOfBow(part, own = false) {
  const toBow = bowMesh().matrixWorld.clone().invert().multiply(part.matrixWorld);
  const points = part.geometry.attributes.position;
  let least = Infinity;
  for (let i = 0; i < points.count; i++) {
    v.fromBufferAttribute(points, i);
    if (own && v.z > 0.002) continue;
    least = Math.min(least, outsideBow(v.applyMatrix4(toBow)) * BOW_SCALE);
  }
  return least;
}

// The least any of a thumb segment's points is clear of the fingers (each of their segments
// taken as a rod with rounded ends).
function clearOfFingers(part) {
  const rods = [];
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    rig().parts[name].forEach(({ part: segment }, j) => {
      segment.geometry.computeBoundingBox();
      const box = segment.geometry.boundingBox;
      const from = segment.localToWorld(new THREE.Vector3());
      const to = segment.localToWorld(new THREE.Vector3(0, 0, j < 2 ? segment.children[0].position.z : box.min.z + box.max.x));
      rods.push({ line: new THREE.Line3(from, to), radius: box.max.x * 0.95 });
    });
  }
  const points = part.geometry.attributes.position;
  const near = new THREE.Vector3();
  let least = Infinity;
  for (let i = 0; i < points.count; i += 2) {
    v.fromBufferAttribute(points, i);
    if (v.z > 0.002) continue;
    part.localToWorld(v);
    for (const rod of rods) least = Math.min(least, rod.line.closestPointToPoint(v, true, near).distanceTo(v) - rod.radius);
  }
  return least;
}

// Puts the bow hand's fingers straight into `grip`.
function hold(grip) {
  rig().grip(grip);
  rig().update(0, true);
  hands.group.updateWorldMatrix(true, true);
}

// The fit. `gap`: how far clear of the grip each segment stops (meters); `thumbDown`: how far
// the thumb's turned down across the fingers before it's brought in.
export function fitBow({ gap = 0.0007, thumbDown = 0.5 } = {}) {
  window.T.set({ item: 'bow' });
  const grip = { thumb: [1.3, thumbDown, 0, 0] }; // (the thumb out of the way)
  for (const name of ['index', 'middle', 'ring', 'pinky']) grip[name] = [0, 0, 0];
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    const bends = grip[name];
    [1.5, 1.6, 1.1].forEach((most, j) => {
      const part = rig().parts[name][j].part;
      for (; bends[j] <= most; bends[j] += 0.01) {
        hold(grip);
        if (clearOfBow(part, true) < gap) break;
      }
      bends[j] = Math.max(0, bends[j] - 0.01);
    });
  }
  // The thumb: swung in from out to the side until it touches, then its last joints curled.
  const thumb = rig().parts.thumb.map(({ part }) => part);
  const touching = () => {
    hold(grip);
    return Math.min(...thumb.map((part) => Math.min(clearOfBow(part, true), clearOfFingers(part)))) < gap;
  };
  const bends = grip.thumb;
  for (; bends[0] > -0.5 && !touching(); bends[0] -= 0.01);
  bends[0] += 0.01;
  for (const [j, most] of [[2, 1.0], [3, 0.8]]) {
    for (; bends[j] <= most && !touching(); bends[j] += 0.01);
    bends[j] = Math.max(0, bends[j] - 0.01);
  }
  for (const name of Object.keys(grip)) grip[name] = grip[name].map((bend) => Math.round(bend * 100) / 100);
  GRIPS.bow = grip;
  hold(grip);
  return JSON.stringify(grip);
}

// How far clear of the bow each part of the bow hand is as it's held now (mm; negative: through it).
export function report() {
  hold(GRIPS.bow);
  const clear = {};
  hands.left.traverse((child) => {
    if (child.isMesh && child.name.startsWith('fp-l-')) clear[child.name.slice(5)] = Math.round(clearOfBow(child) * 10000) / 10;
  });
  return clear;
}
