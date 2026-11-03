import * as THREE from 'three';
import { instancedModel } from './models.js';
import { FENCE_LENGTH, fallenLog, fenceSegment } from './poiModels.js';

// Little things scattered about so the land feels lived in (and long since left): fallen
// trees to hop over in the woods, and old split-rail fences, some round the cabins' yards
// and some running across the meadows, with rails down and gaps you can slip through.
const LOGS_PER_HECTARE = 2.2;
const LOG_LENGTH = [3, 6.5];
const LOG_RADIUS = [0.17, 0.32]; // thin enough to jump over (see Player: JUMP_SPEED)
const FENCE_LINES = 22; // across the meadows
const FENCE_SEGMENTS = [4, 10]; // 2.5 m each
const YARD_CHANCE = 0.65; // how many cabins have a fenced yard
const MISSING = 0.15; // the share of fence lengths that have fallen down altogether...
const BROKEN = 0.25; // ...and that have a rail down (you can step through those)

// Adds them to the scene and their obstacles to `obstacles`. `isFree(x, z, spacing)` is the
// world's check for open ground. Returns { logs } (each { x, z, heading, length, radius }), so
// the fire road can lay a few across itself.
export function scatterDetails(scene, { random, terrain, obstacles, isFree, pois, worldSize, hectares }) {
  const half = worldSize / 2 - 4;
  const logs = [];
  const logTransforms = [];
  const addLog = (x, z, heading, length, radius) => {
    const dx = Math.cos(heading);
    const dz = -Math.sin(heading);
    const h0 = terrain.heightAt(x - (dx * length) / 2, z - (dz * length) / 2);
    const h1 = terrain.heightAt(x + (dx * length) / 2, z + (dz * length) / 2);
    const y = Math.min(h0, h1, terrain.heightAt(x, z)) - 0.04;
    const pitch = Math.atan2(h1 - h0, length);
    logTransforms.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + Math.abs(h1 - h0) / 2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, pitch, 'YZX')),
      new THREE.Vector3(length, radius * 2, radius * 2),
    ));
    for (let t = -length / 2 + radius; t <= length / 2 - radius + 0.01; t += 0.8) {
      const ox = x + dx * t;
      const oz = z + dz * t;
      obstacles.add({ x: ox, z: oz, radius: radius + 0.05, top: terrain.heightAt(ox, oz) + radius * 1.9 }); // you can jump onto it
    }
    logs.push({ x, z, heading, length, radius });
  };

  // Fallen trees, mostly in the woods.
  const logCount = Math.round(LOGS_PER_HECTARE * hectares);
  for (let tries = 0; logs.length < logCount && tries < logCount * 30; tries++) {
    const x = random.range(-half, half);
    const z = random.range(-half, half);
    const woods = terrain.forest(x, z) > 0.05 || terrain.mountainAt(x, z) > 0.03;
    if ((!woods && random.next() > 0.12) || terrain.mountainAt(x, z) > 0.45) continue;
    const heading = random.range(0, Math.PI * 2);
    const length = random.range(...LOG_LENGTH);
    const radius = random.range(...LOG_RADIUS);
    let clear = true;
    for (let t = -length / 2; t <= length / 2 && clear; t += 1) {
      clear = isFree(x + Math.cos(heading) * t, z - Math.sin(heading) * t, radius + 0.6);
    }
    if (clear) addLog(x, z, heading, length, radius);
  }

  // Old fences.
  const whole = [];
  const broken = [];
  // One length of fence from (x, z) heading along `heading`, if there's room for it.
  const addSegment = (x, z, heading, room) => {
    const dx = Math.cos(heading);
    const dz = -Math.sin(heading);
    const ex = x + dx * FENCE_LENGTH;
    const ez = z + dz * FENCE_LENGTH;
    if (Math.abs(ex) > half || Math.abs(ez) > half) return false;
    for (let t = 0; t <= FENCE_LENGTH; t += 0.8) if (!room(x + dx * t, z + dz * t)) return false;
    const roll = random.next();
    if (roll < MISSING) return true; // (fallen down: nothing left but a gap)
    const isBroken = roll < MISSING + BROKEN;
    const h0 = terrain.heightAt(x, z);
    const h1 = terrain.heightAt(ex, ez);
    (isBroken ? broken : whole).push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, h0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, Math.atan2(h1 - h0, FENCE_LENGTH), 'YZX')),
      new THREE.Vector3(1, 1, 1),
    ));
    // Whole lengths stop you; broken ones only have their posts.
    const step = isBroken ? FENCE_LENGTH : 0.4;
    for (let t = 0; t <= FENCE_LENGTH + 0.01; t += step) obstacles.add({ x: x + dx * t, z: z + dz * t, radius: 0.12 });
    return true;
  };
  // Runs of fence across the meadows, wandering a little.
  for (let line = 0, tries = 0; line < FENCE_LINES && tries < FENCE_LINES * 50; tries++) {
    let x = random.range(-half, half);
    let z = random.range(-half, half);
    if (terrain.forest(x, z) > -0.1 || terrain.mountainAt(x, z) > 0.1 || !isFree(x, z, 2)) continue;
    let heading = random.range(0, Math.PI * 2);
    const segments = Math.round(random.range(...FENCE_SEGMENTS));
    let placed = 0;
    for (let i = 0; i < segments; i++) {
      if (!addSegment(x, z, heading, (px, pz) => isFree(px, pz, 0.6) && terrain.waterDepth(px, pz) === 0)) break;
      x += Math.cos(heading) * FENCE_LENGTH;
      z -= Math.sin(heading) * FENCE_LENGTH;
      heading += random.range(-0.15, 0.15);
      placed++;
    }
    if (placed > 1) line++;
  }
  // Yards beside the cabins: three sides of a rectangle off one side of the cabin.
  for (const poi of pois) {
    if (poi.kind !== 'cabin' || random.next() > YARD_CHANCE) continue;
    const side = random.next() < 0.5 ? 1 : -1;
    const c = Math.cos(poi.heading);
    const s = Math.sin(poi.heading);
    const local = (lx, lz) => ({ x: poi.x + lx * c + lz * s, z: poi.z - lx * s + lz * c });
    const room = (px, pz) => obstacles.isClear(px, pz, 0.5) && terrain.waterDepth(px, pz) === 0;
    // Corners (in the cabin's space), going round the yard.
    const corners = [[side * 4.5, -4], [side * 12, -4], [side * 12, 6], [side * 4.5, 6]];
    for (let k = 0; k < corners.length - 1; k++) {
      const a = local(...corners[k]);
      const b = local(...corners[k + 1]);
      const heading = Math.atan2(-(b.z - a.z), b.x - a.x);
      const count = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / FENCE_LENGTH);
      for (let i = 0; i < count; i++) {
        addSegment(a.x + Math.cos(heading) * FENCE_LENGTH * i, a.z - Math.sin(heading) * FENCE_LENGTH * i, heading, room);
      }
    }
  }

  scene.add(instancedModel('fallen-log', fallenLog(), logTransforms));
  scene.add(instancedModel('fence', fenceSegment(false), whole));
  scene.add(instancedModel('fence-broken', fenceSegment(true), broken));
  return { logs, addLog };
}
