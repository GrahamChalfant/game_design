import * as THREE from 'three';
import { CRASH, createCrashTrail } from './crashTrail.js';
import { createWater } from './water.js';
import { CHUNK_SIZE, DRAW_CHUNKS, chunksAround } from './stream.js';

const { smoothstep, clamp } = THREE.MathUtils;

// A painted-landscape palette: muted sage and olive grass, ochre dry patches, mossy
// blotches, grey stone and scree.
const SAGE = new THREE.Color(0x8aa660);
const OLIVE = new THREE.Color(0xa4a659);
const OCHRE = new THREE.Color(0xbfae72);
const MOSS = new THREE.Color(0x688841);
const FOREST_FLOOR = new THREE.Color(0x4c6334);
const STONE = new THREE.Color(0x86877f);
const SNOW = new THREE.Color(0xeef2f4);
const MUD = new THREE.Color(0x7a6a50);
const GRAVEL = new THREE.Color(0x9a948a);
const WATER_BED = new THREE.Color(0x3c5c55);
const TORN_SOIL = new THREE.Color(0xb8a285);
const DARK_SOIL = new THREE.Color(0x9c8973);

const GROUND_CELL = 0.5; // meters along each side of a ground square: bigger gives bigger facets
const LAKE_GAP = [12, 18]; // meters from the plane to the lake's shore

// The land: gently rolling ground, a lake, and a river running out of it. Everything is worked out from (x, z) so other code can ask "what's here?".
// Call build() to make its meshes once you've decided to keep it (see isDry).
export function createTerrain(random, noise, size) {
  const lakeRadius = random.range(11, 15);
  const radiusAt = (angle) =>
    lakeRadius * (1 + 0.28 * noise(Math.cos(angle) * 1.5 + 20, Math.sin(angle) * 1.5 + 20));
  // The plane came down beside the lake, so you always start near water. The lake lies on
  // the crash's open side: the skid trail runs back to the north-west and you start to the
  // south, so it goes somewhere from north-east (-60°) round to south-east (40°), with its
  // shore LAKE_GAP meters from the plane.
  const lakeAngle = random.range(-1.05, 0.7);
  const lakeReach = random.range(...LAKE_GAP) + radiusAt(lakeAngle + Math.PI);
  const lakeCenter = new THREE.Vector2(
    CRASH.x + Math.cos(lakeAngle) * lakeReach,
    CRASH.z + Math.sin(lakeAngle) * lakeReach,
  );
  // Below 1 inside the lake's outline, 1 on it, above 1 outside.
  const lakeDistance = (x, z) => {
    const dx = x - lakeCenter.x;
    const dz = z - lakeCenter.y;
    return Math.hypot(dx, dz) / radiusAt(Math.atan2(dz, dx));
  };

  const hills = (x, z) => noise(x * 0.02 + 100, z * 0.02) * 4 + noise(x * 0.07 + 200, z * 0.07) * 0.8;

  // Water sits just below the lowest point of the lake's rim, so it never spills over.
  let rimLow = Infinity;
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const r = radiusAt(angle) * 1.35;
    rimLow = Math.min(rimLow, hills(lakeCenter.x + Math.cos(angle) * r, lakeCenter.y + Math.sin(angle) * r));
  }
  const waterLevel = rimLow - 0.25;
  const lakeBed = waterLevel - 3; // deep enough to swim in the middle

  const lakeHeightAt = (x, z) => {
    const h = hills(x, z);
    const d = lakeDistance(x, z);
    if (d > 1.35) return h;
    return lakeBed + (h - lakeBed) * smoothstep(d, 0.7, 1.35);
  };

  const river = createRiver(random, noise, lakeAngle, lakeCenter, radiusAt, lakeDistance, waterLevel, lakeHeightAt, size);

  const crashTrail = createCrashTrail(noise);

  const heightAt = (x, z) => {
    const h = lakeHeightAt(x, z) + crashTrail.at(x, z).height;
    const r = river.nearest(x, z);
    return r ? Math.min(h, river.carve(r)) : h;
  };

  // How deep the water is at (x, z): 0 on dry land.
  const waterDepth = (x, z) => {
    let level = lakeDistance(x, z) < 1.5 ? waterLevel : -Infinity;
    const r = river.nearest(x, z);
    if (r && r.distance < r.halfWidth + 0.5) level = Math.max(level, r.level);
    return level === -Infinity ? 0 : Math.max(0, level - heightAt(x, z));
  };
  // Rough "is this within `margin` meters of the lake or river" check, for placing things.
  const nearWater = (x, z, margin) => {
    if ((lakeDistance(x, z) - 1.35) * lakeRadius < margin) return true;
    const r = river.nearest(x, z);
    return Boolean(r && r.distance < r.halfWidth + 1.5 + margin);
  };

  // How "foresty" an area is (roughly -1..1). Trees grow in clumps where this is high.
  const forest = (x, z) => noise(x * 0.04 + 50, z * 0.04);

  const color = new THREE.Color();
  const tint = new THREE.Color();
  // What the ground looks like at (x, z). The returned colour is reused: copy it if you keep it.
  const groundAt = (x, z) => {
    // Broad sage and olive areas, ochre dry patches and dark mossy blotches, like brush strokes.
    color.copy(SAGE).lerp(OLIVE, clamp(noise(x * 0.025 + 300, z * 0.025) + 0.5, 0, 1));
    color.lerp(OCHRE, smoothstep(noise(x * 0.07 + 600, z * 0.07) + noise(x * 0.3, z * 0.3) * 0.25, 0.15, 0.6) * 0.7);
    color.lerp(MOSS, smoothstep(noise(x * 0.18 + 800, z * 0.18), 0.1, 0.5) * 0.5);
    color.lerp(FOREST_FLOOR, smoothstep(forest(x, z), 0.05, 0.5) * 0.7);

    let kind = 'grass';
    // Grey stone showing through.
    const rock = noise(x * 0.05 + 900, z * 0.05) + noise(x * 0.4 + 950, z * 0.4) * 0.25;
    if (rock > 0.38) {
      tint.copy(STONE).lerp(OCHRE, clamp(noise(x * 0.8, z * 0.8) * 0.3 + 0.1, 0, 0.25));
      color.lerp(tint, Math.min(1, (rock - 0.38) / 0.05));
      kind = 'rock';
    }
    // A little lingering snow, in the odd patch.
    const snow = noise(x * 0.06 + 400, z * 0.06) + noise(x * 0.4 + 500, z * 0.4) * 0.22;
    if (snow > 0.86) {
      color.lerp(SNOW, Math.min(1, (snow - 0.86) / 0.03));
      kind = 'snow';
    }
    // Bare soil torn up by the crash, with dark streaks running along the skid.
    const scar = crashTrail.at(x, z);
    if (scar.dirt > 0) {
      tint.copy(TORN_SOIL).lerp(DARK_SOIL, smoothstep(scar.streak, -0.2, 0.35));
      color.lerp(tint, scar.dirt);
      if (scar.dirt > 0.4) kind = 'dirt';
    }
    // Muddy lake shore, gravelly river banks, and the beds under the water.
    if (lakeDistance(x, z) < 1.6 || river.nearest(x, z)) {
      const h = heightAt(x, z);
      const level = Math.max(lakeDistance(x, z) < 1.6 ? waterLevel : -Infinity, river.nearest(x, z)?.level ?? -Infinity);
      const wet = 1 - smoothstep(h, level, level + 0.45);
      if (wet > 0) {
        color.lerp(h < level ? WATER_BED : lakeDistance(x, z) < 1.6 ? MUD : GRAVEL, wet);
        if (wet > 0.4) kind = h < level ? 'water' : 'shore';
      }
    }
    return { color, kind };
  };

  const terrain = {
    heightAt,
    waterLevel,
    waterDepth,
    nearWater,
    forest,
    crashTrail,
    groundAt,
    riverPoints: river.points, // the river's path, from the lake outwards
    // True if the ground is dry everywhere within `radius` of (x, z), and at least `margin`
    // meters from the water's edge. Used to check a new map's crash site and start.
    isDry(x, z, radius, margin) {
      for (let dx = -radius; dx <= radius; dx += 1.5) {
        for (let dz = -radius; dz <= radius; dz += 1.5) {
          if (dx * dx + dz * dz > radius * radius) continue;
          if (waterDepth(x + dx, z + dz) > 0 || nearWater(x + dx, z + dz, margin)) return false;
        }
      }
      return true;
    },
    // Makes the ground and water meshes (slow, so only for the map you keep).
    build() {
      const ground = createGround(size, heightAt, groundAt, noise);
      terrain.ground = ground.group;
      terrain.drawAround = ground.drawAround;
      terrain.water = createWater(lakeCenter, radiusAt, waterLevel, river);
      return terrain;
    },
  };
  return terrain;
}

// A river winding out of the lake to the edge of the map. It flows downhill: its surface
// never rises, and it carves a channel through anything in the way.
function createRiver(random, noise, lakeAngle, lakeCenter, radiusAt, lakeDistance, lakeLevel, heightAt, size) {
  // Leave the lake on its far side, flowing away from the crash site.
  const direction = lakeAngle + random.range(-0.4, 0.4);
  let heading = direction;
  const start = radiusAt(heading) * 0.9;
  let x = lakeCenter.x + Math.cos(heading) * start;
  let z = lakeCenter.y + Math.sin(heading) * start;
  const points = [];
  let level = lakeLevel;
  const STEP = 2.5;
  for (let i = 0; i < 200 && Math.max(Math.abs(x), Math.abs(z)) < size / 2 + 5; i++) {
    const halfWidth = 1.5 + Math.min(1.2, i * 0.02); // widens as it goes
    // The surface sits below the lowest ground across the channel, and never rises.
    const across = [-1, 0, 1].map((s) => heightAt(x - Math.sin(heading) * s * (halfWidth + 1), z + Math.cos(heading) * s * (halfWidth + 1)));
    // (Still inside the lake, the river is just the lake's surface.)
    if (lakeDistance(x, z) > 1.35) level = Math.min(level, Math.min(...across) - 0.35);
    points.push({ x, z, level, halfWidth });
    // Meander, but keep drifting back to the overall direction so it never doubles back.
    heading += noise(i * 0.15 + 70, 3.3) * 0.35 + (direction - heading) * 0.12;
    x += Math.cos(heading) * STEP;
    z += Math.sin(heading) * STEP;
  }

  // Look-up grid so finding the nearest bit of river is quick.
  const CELL = 8;
  const REACH = 8; // the river affects the ground this far from its middle (channel + banks)
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const minX = Math.floor((Math.min(a.x, b.x) - REACH) / CELL);
    const maxX = Math.floor((Math.max(a.x, b.x) + REACH) / CELL);
    const minZ = Math.floor((Math.min(a.z, b.z) - REACH) / CELL);
    const maxZ = Math.floor((Math.max(a.z, b.z) + REACH) / CELL);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const k = key(cx, cz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  }

  // The closest point on the river to (x, z), if it's within reach:
  // { distance, level, halfWidth }. Reuses one object, so copy it if you keep it.
  const result = { distance: 0, level: 0, halfWidth: 0 };
  const nearest = (px, pz) => {
    const segments = grid.get(key(Math.floor(px / CELL), Math.floor(pz / CELL)));
    if (!segments) return null;
    let best = Infinity;
    for (const i of segments) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
      if (d < best) {
        best = d;
        result.distance = d;
        result.level = a.level + (b.level - a.level) * t;
        result.halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
      }
    }
    return best < REACH ? result : null;
  };

  // The ground height the channel cuts down to at that spot: a rounded bed under the
  // water, and banks sloping back up to meet the land.
  const carve = ({ distance, level, halfWidth }) =>
    distance < halfWidth
      ? level - 0.2 - 1.3 * (1 - (distance / halfWidth) ** 2)
      : level - 0.2 + (distance - halfWidth) * 0.6;

  return { points, nearest, carve };
}

// The ground: faceted hilly meshes where every triangle is one flat colour, one per chunk,
// built as the player comes near (see drawAround) and dropped again once they're far away.
function createGround(size, heightAt, groundAt, noise) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const built = new Map(); // chunk key → mesh
  const cells = Math.round(CHUNK_SIZE / GROUND_CELL);
  const half = size / 2;

  const buildChunk = ({ cx, cz, key }) => {
    const grid = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, cells, cells)
      .rotateX(-Math.PI / 2)
      .translate((cx + 0.5) * CHUNK_SIZE, 0, (cz + 0.5) * CHUNK_SIZE);
    const corners = grid.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      corners.setY(i, heightAt(corners.getX(i), corners.getZ(i)));
    }
    // Triangles that don't share corners get hard edges between them.
    const geometry = grid.toNonIndexed();
    geometry.computeVertexNormals();

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const shade = new THREE.Color();
    for (let i = 0; i < position.count; i += 3) {
      const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
      const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
      const { color } = groundAt(x, z);
      const speckle = noise(x * 1.3, z * 1.3) * 0.08 + noise(x * 7.3, z * 7.3) * 0.1;
      shade.setRGB(color.r, color.g, color.b, THREE.SRGBColorSpace).multiplyScalar(1 + speckle);
      for (let corner = 0; corner < 3; corner++) shade.toArray(colors, (i + corner) * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    built.set(key, mesh);
    group.add(mesh);
  };

  return {
    group,
    // Builds the chunks around (x, z), nearest first. Builds at most `budget` new ones per
    // call, so walking into new ground doesn't stall a frame; pass Infinity to build them all.
    drawAround(x, z, budget = 2) {
      const wanted = chunksAround(x, z).filter(
        ({ cx, cz }) => Math.abs((cx + 0.5) * CHUNK_SIZE) < half + CHUNK_SIZE && Math.abs((cz + 0.5) * CHUNK_SIZE) < half + CHUNK_SIZE,
      );
      for (const chunk of wanted) {
        if (budget <= 0) break;
        if (built.has(chunk.key)) continue;
        buildChunk(chunk);
        budget--;
      }
      // Let go of chunks well out of sight (a little slack, so walking back and forth
      // across a chunk edge doesn't rebuild the same ground over and over).
      const keep = new Set(chunksAround(x, z, DRAW_CHUNKS + 2).map((c) => c.key));
      for (const [key, mesh] of built) {
        if (keep.has(key)) continue;
        group.remove(mesh);
        mesh.geometry.dispose();
        built.delete(key);
      }
    },
  };
}
