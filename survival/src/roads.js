import * as THREE from 'three';
import { swappable } from './models.js';
import { FARM } from './layout.js';

// The roads: the old fire road, a dirt track from the lookout tower out to the map's east edge,
// long abandoned (trees keep off it, but it's ruined in places: fallen trees lie across it, a
// rusted truck was left on it, and a gate at the tower end hangs open); and the farm's dirt
// road north off the map.
export const ROAD_WIDTH = 4;
const STEP = 5; // meters per step when finding the way
const LOGS_ACROSS = 3;
// How far the road's middle keeps from each kind of place (meters from its centre): a cabin's
// half-length, plus half the road, plus a little.
export const KEEP_CLEAR = { cabin: 6, stand: 4.5, camp: 5, leanto: 5, cave: 5 };

// Works out where the road goes. Returns { paths: [[{x, z}]], trucks: [poi], stops }.
// The fixed map's roads: the old fire road from the tower out to the map's east edge (where it
// once came in from), with an old truck left by it, and the farm's dirt road north off the map.
export function fixedRoads(terrain, lookout, pois) {
  const blocked = pois.map((p) => ({ x: p.x, z: p.z, r: KEEP_CLEAR[p.kind] ?? 4 }));
  const start = { x: lookout.x + 9 * Math.cos(lookout.heading), z: lookout.z - 9 * Math.sin(lookout.heading) };
  const fireRoad = smooth(findWay(terrain, start, FIRE_ROAD_END, blocked));
  const farmRoad = [];
  for (let i = 1; i < FARM.road.length; i++) {
    const [a, b] = [FARM.road[i - 1], FARM.road[i]];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP);
    for (let k = 0; k < steps; k++) farmRoad.push({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
  }
  farmRoad.push(FARM.road.at(-1));
  const paths = [fireRoad, smooth(farmRoad)];
  // The truck, half off the fire road partway along.
  const trucks = [];
  if (fireRoad.length > 12) {
    const k = Math.floor(fireRoad.length * 0.45);
    const [a, b] = [fireRoad[k], fireRoad[k + 1]];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const x = a.x + (-dz / d) * 1.3;
    const z = a.z + (dx / d) * 1.3;
    trucks.push({ kind: 'truck', x, z, heading: Math.atan2(dx, dz) + 0.2, base: terrain.heightAt(x, z), seed: 424242 });
  }
  return { paths, trucks, stops: [start, FIRE_ROAD_END] };
}
const FIRE_ROAD_END = { x: 1010, z: -330 };

// Finds a way from a to b, a few meters at a time, steering round water and steep ground.
function findWay(terrain, a, b, blocked = []) {
  const points = [{ x: a.x, z: a.z }];
  let x = a.x;
  let z = a.z;
  let heading = Math.atan2(b.z - z, b.x - x);
  for (let steps = 0; steps < 400; steps++) {
    if (Math.hypot(b.x - x, b.z - z) < STEP * 1.5) break;
    const toward = Math.atan2(b.z - z, b.x - x);
    const want = heading + Math.atan2(Math.sin(toward - heading), Math.cos(toward - heading)) * 0.4;
    let best = null;
    for (const turn of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2]) {
      const angle = want + turn;
      const nx = x + Math.cos(angle) * STEP;
      const nz = z + Math.sin(angle) * STEP;
      const ford = terrain.creekOnly(nx, nz); // (creeks are shallow: the road fords them)
      if (!ford && (terrain.waterDepth(nx, nz) > 0 || terrain.nearWater(nx, nz, 3))) continue;
      if (blocked.some((o) => Math.hypot(nx - o.x, nz - o.z) < o.r)) continue;
      const climb = Math.abs(terrain.heightAt(nx, nz) - terrain.heightAt(x, z)) / STEP;
      const cost = Math.abs(turn) * 2 + climb * 8 + terrain.mountainAt(nx, nz) * 10;
      if (!best || cost < best.cost) best = { angle, nx, nz, cost };
    }
    if (!best) break; // (hemmed in by water: the road just ends)
    heading = best.angle;
    x = best.nx;
    z = best.nz;
    points.push({ x, z });
  }
  points.push({ x: b.x, z: b.z });
  return points;
}

// Rounds off the corners (Chaikin's method, twice).
function smooth(points) {
  let out = points;
  for (let k = 0; k < 2; k++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const [p, q] = [out[i], out[i + 1]];
      next.push({ x: p.x * 0.75 + q.x * 0.25, z: p.z * 0.75 + q.z * 0.25 }, { x: p.x * 0.25 + q.x * 0.75, z: p.z * 0.25 + q.z * 0.75 });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

// Points every `spacing` meters along the roads (for keeping trees off them).
export function alongRoads(paths, spacing) {
  const out = [];
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t < d; t += spacing) out.push({ x: a.x + ((b.x - a.x) * t) / d, z: a.z + ((b.z - a.z) * t) / d });
    }
  }
  return out;
}

// Lays a few fallen trees across the road (with `addLog` from details.js), and puts up the
// gate and the old signs.
export function ruinRoads(scene, random, terrain, { paths, stops }, addLog, obstacles) {
  for (let i = 0; i < LOGS_ACROSS && paths.length; i++) {
    const path = random.pick(paths);
    if (path.length < 10) continue;
    const k = Math.floor(random.range(0.2, 0.8) * (path.length - 1));
    const [a, b] = [path[k], path[k + 1]];
    const along = Math.atan2(b.z - a.z, b.x - a.x);
    // Across the road: a log's heading h lies along (cos h, -sin h).
    const across = along + Math.PI / 2;
    addLog(a.x, a.z, Math.atan2(-Math.sin(across), Math.cos(across)) + random.range(-0.3, 0.3), ROAD_WIDTH + random.range(1.5, 3), random.range(0.2, 0.3));
  }
  if (!paths.length) return;
  // The gate, just down the road from the tower, swung open and rusted that way.
  const path = paths[0];
  const at = path[Math.min(4, path.length - 2)];
  const next = path[Math.min(5, path.length - 1)];
  const along = Math.atan2(next.z - at.z, next.x - at.x);
  const swing = random.range(1.3, 1.7);
  const gate = swappable('fire-gate', fireGate(swing), [{ node: 'fire-gate-gate', axis: 'y', angle: -swing }]);
  gate.userData.open(true); // (swung open, off the road)
  gate.position.set(at.x, terrain.heightAt(at.x, at.z), at.z);
  gate.rotation.y = Math.PI / 2 - along; // the road runs through between its posts
  scene.add(gate);
  for (const side of [-1, 1]) {
    obstacles.add({ x: at.x - Math.sin(along) * side * (ROAD_WIDTH / 2 + 0.3), z: at.z + Math.cos(along) * side * (ROAD_WIDTH / 2 + 0.3), radius: 0.15 });
  }
  // Signposts at each cabin's end of the road.
  for (const stop of stops.slice(1)) {
    const sign = swappable('signpost', signpost(random));
    sign.rotation.z = random.range(-0.1, 0.1); // leaning
    const x = stop.x + 2.6;
    const z = stop.z + 1;
    sign.position.set(x, terrain.heightAt(x, z), z);
    sign.rotation.y = random.range(0, Math.PI * 2);
    scene.add(sign);
    obstacles.add({ x, z, radius: 0.12 });
  }
}

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });

// A rusted pipe gate between two posts, hanging open (the road runs along local z).
function fireGate(swing) {
  const group = new THREE.Group();
  const rust = mat(0x8a4a2a, { roughness: 0.7 });
  const half = ROAD_WIDTH / 2 + 0.3;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8), rust);
    post.position.set(side * half, 0.6, 0);
    group.add(post);
  }
  const hinge = new THREE.Group();
  hinge.position.set(-half, 0, 0);
  const bar = (y) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ROAD_WIDTH, 8).rotateZ(Math.PI / 2), rust);
    pipe.position.set(ROAD_WIDTH / 2, y, 0);
    hinge.add(pipe);
  };
  bar(1.0);
  bar(0.55);
  const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6).rotateZ(1.35), rust);
  brace.position.set(ROAD_WIDTH / 2, 0.78, 0);
  hinge.add(brace);
  hinge.rotation.y = -swing; // swung open, off the road
  group.add(hinge);
  // A faded sign wired to it.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.03), mat(0xb8a040));
  sign.position.set(ROAD_WIDTH / 2, 0.8, 0.06);
  hinge.add(sign);
  group.traverse((child) => (child.castShadow = true));
  return group;
}

// A rotting wooden signpost, leaning.
function signpost(random) {
  const group = new THREE.Group();
  const wood = mat(0x6e5a44);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), wood);
  post.position.y = 0.85;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.05), mat(0x8a7454));
  board.position.set(0.3, 1.5, 0.07);
  board.rotation.z = random.range(-0.25, 0.1);
  group.add(post, board);
  group.rotation.z = random.range(-0.12, 0.12);
  group.traverse((child) => (child.castShadow = true));
  return group;
}
