import * as THREE from 'three';
import { FLIGHT_PATH, flightPoint } from './crashTrail.js';
import { instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { treeHeight, treeModel } from './trees.js';

// The swath the plane cut through the trees on its way in, before it touched down (see
// FLIGHT_PATH in crashTrail.js). Out at the far end it was still well up and only took the
// tops off; nearer the touchdown it was down among the trunks, snapping them low and pushing
// whole trees over. So, going back along the swath from the touchdown:
//   uprooted spruce lying the way it was flying, their root plates torn up behind them;
//   trunks snapped off at the height it passed, their tops lying on ahead or still hanging
//   from the break; and at the edges, trees left leaning.
// None of it can be chopped: it's the scene of the crash (the forest round it can).
const FIRST = 52; // meters behind the plane where the damage starts (just past the touchdown)
const SPACING = [1.3, 2.8]; // meters between one damaged tree and the next, going back
const PLANE_HEIGHT = [1.5, 8]; // how high the plane passed (meters), at FIRST and at the far end
const KINDS = ['pine', 'pine', 'pine-skinny', 'pine-tall'];
const SCALE = [0.8, 1.15];
const SNAG_BREAK = 2.2; // how high trunk-snapped.glb's break is before it's stretched
const SNAG_RADIUS = 0.3; // ...and how thick its trunk is
const TRUNK_RADIUS = 0.17; // a spruce's trunk at its foot (scale 1), for sizing the snag
const SPLAY = 0.45; // how far (radians) a falling tree strays either side of the way the plane went

const UP = new THREE.Vector3(0, 1, 0);

// Adds it all to the scene. `clear(x, z, radius)` says whether there's room for something
// there; obstacles get what the player walks round (or jumps onto).
export function damageFlightPath(scene, { random, terrain, obstacles, clear }) {
  const trees = Object.fromEntries([...new Set(KINDS)].map((kind) => [kind, { transforms: [], places: [] }]));
  const snags = [];
  const plates = [];
  const ground = (x, z) => terrain.heightAt(x, z);
  const dry = (x, z) => terrain.waterDepth(x, z) === 0;

  // A spruce of `kind` whose foot is at `base`, its trunk pointing along `dir` (a unit
  // vector), `length` meters long. Each lying stretch is something to walk round.
  const addTree = (kind, base, dir, length, solid) => {
    const spin = new THREE.Quaternion().setFromAxisAngle(UP, random.range(0, Math.PI * 2)); // (the boughs fall differently)
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(spin);
    const scale = length / treeHeight(kind);
    trees[kind].transforms.push(new THREE.Matrix4().compose(base, rotation, new THREE.Vector3(scale, scale, scale)));
    trees[kind].places.push({ x: base.x, z: base.z });
    if (!solid) return;
    for (let t = 1; t < length * 0.75; t += 1) {
      const p = base.clone().addScaledVector(dir, t);
      const under = ground(p.x, p.z);
      if (p.y - under < 1.6) obstacles.add({ x: p.x, z: p.z, radius: 0.45, top: Math.max(p.y, under) + 0.35 });
    }
  };
  // The way down a tree lies, from `base`, pointing along (dx, dz) and resting `rest` meters
  // up at its tip (on its boughs).
  const lying = (base, dx, dz, length, rest) => {
    const tip = ground(base.x + dx * length, base.z + dz * length) + rest;
    const drop = Math.atan2(base.y - tip, length);
    return new THREE.Vector3(dx * Math.cos(drop), -Math.sin(drop), dz * Math.cos(drop));
  };

  for (let back = FIRST; back < FLIGHT_PATH.to; back += random.range(...SPACING)) {
    const side = random.range(-1.3, 1.3) * FLIGHT_PATH.half;
    const { x, z } = flightPoint(back, side);
    if (terrain.forest(x, z) < -0.1 || !dry(x, z) || !clear(x, z, 0.8)) continue;
    // Which way the plane was going here (towards the crash), and how high it was.
    const ahead = flightPoint(back - 1, side);
    const heading = Math.atan2(ahead.z - z, ahead.x - x) + random.range(-SPLAY, SPLAY);
    const dx = Math.cos(heading);
    const dz = Math.sin(heading);
    const far = (back - FIRST) / (FLIGHT_PATH.to - FIRST);
    const passed = THREE.MathUtils.lerp(...PLANE_HEIGHT, far);
    const edge = Math.abs(side) / FLIGHT_PATH.half; // 0 in the middle, 1 at the swath's edge
    const kind = random.pick(KINDS);
    const scale = random.range(...SCALE);
    const height = treeHeight(kind) * scale;
    const y = ground(x, z);
    const roll = random.next();

    if (edge > 1 || (edge > 0.75 && roll < 0.35)) {
      // Only clipped: left standing, leaning away the way it was pushed.
      if (edge > 1 && roll < 0.4) continue;
      const lean = random.range(0.15, 0.4);
      const dir = new THREE.Vector3(dx * Math.sin(lean), Math.cos(lean), dz * Math.sin(lean));
      addTree(kind, new THREE.Vector3(x, y - 0.15, z), dir, height, false);
      obstacles.add({ x, z, radius: 0.3 * scale });
    } else if (roll < 0.1) {
      continue; // (a gap: just churned-up ground and broken boughs)
    } else if (roll < 0.1 + (0.2 + 0.5 * (1 - far)) * (1 - edge * 0.4)) {
      // Pushed over whole, roots and all, its root plate stood up on edge behind it.
      let room = true;
      for (let t = 1.5; t < height * 0.7 && room; t += 1.5) room = clear(x + dx * t, z + dz * t, 0.5) && dry(x + dx * t, z + dz * t);
      if (!room) continue;
      const size = 0.85 * scale;
      plates.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - 0.1 * size, z),
        new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-dz, dx)), // (its +x, the turf side, towards the trunk)
        new THREE.Vector3(size, size, size),
      ));
      obstacles.add({ x, z, radius: 0.8 * size, top: y + 1.7 * size });
      const base = new THREE.Vector3(x + dx * 0.2 * size, y + 0.75 * size, z + dz * 0.2 * size);
      addTree(kind, base, lying(base, dx, dz, height, 0.5), height, true);
    } else {
      // Snapped off where the plane hit it (a little higher at the edges, where only the wing
      // reached it), and the top gone on ahead.
      const broke = THREE.MathUtils.clamp(passed * random.range(0.6, 1.1) * (1 + edge * 0.3), 1.3, height * 0.7);
      const width = (TRUNK_RADIUS * scale) / SNAG_RADIUS;
      snags.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y - 0.1, z),
        new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-dz, dx) + Math.PI), // (its tallest splinters on the side away from the fall)
        new THREE.Vector3(width, broke / SNAG_BREAK, width),
      ));
      obstacles.add({ x, z, radius: TRUNK_RADIUS * scale + 0.08, top: y + broke + 0.4 });
      const top = height - broke;
      if (top > broke && broke > 1.8 && random.next() < 0.5) {
        // Still hanging from the break, folded over with its tip on the ground.
        const reach = Math.sqrt(top * top - (broke - 0.3) ** 2);
        const base = new THREE.Vector3(x, y + broke, z);
        if (dry(x + dx * reach, z + dz * reach) && clear(x + dx * reach, z + dz * reach, 0.5)) {
          addTree(kind, base, new THREE.Vector3(dx * reach, -(broke - 0.3), dz * reach).normalize(), top, true);
          continue;
        }
      }
      // Lying on ahead, where it came down.
      const away = random.range(0.6, 2);
      const base = new THREE.Vector3(x + dx * away, 0, z + dz * away);
      base.y = ground(base.x, base.z) + 0.25;
      if (!dry(base.x, base.z) || !clear(base.x + dx * top * 0.5, base.z + dz * top * 0.5, 0.6)) continue;
      addTree(kind, base, lying(base, dx, dz, top, 0.4), top, true);
    }
  }

  for (const [kind, { transforms, places }] of Object.entries(trees)) {
    if (transforms.length) scene.add(treeModel(kind, placeholders.conifer(), transforms, places));
  }
  scene.add(instancedModel('trunk-snapped', placeholders.stump(), snags));
  scene.add(instancedModel('root-plate', placeholders.stump(), plates));
}
