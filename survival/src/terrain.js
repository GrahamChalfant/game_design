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
const GROUND_BUDGET_MS = 3; // the most time per frame spent building ground
const LAKE_GAP = [12, 18]; // meters from the plane to the crash lake's shore
// More lakes around the lowlands: how many, how big (meters), and how far apart.
const LAKES = { perSquareKm: 10, radius: [6, 16], clearOfCrash: 90, spacing: 40 };
// Snowy mountains. `up` is how far up a mountain you are, 0 at its foot to 1 near the top.
const MOUNTAINS = {
  count: 3,
  radius: [200, 290], // meters from a massif's middle to its foot
  height: [40, 60], // meters
  clearOfCrash: 180, // meters kept between the crash and the foot of any mountain
  screeFrom: 0.2, // `up` where scree and bare rock start to show...
  screeFull: 0.42, // ...and cover the ground
  snowline: 0.55, // `up` where the snow starts
  coldFrom: 0.42, // `up` where the air starts getting colder...
  coldFull: 0.68, // ...and is coldest
};

// The land: gently rolling ground, a lake, and a river running out of it. Everything is worked out from (x, z) so other code can ask "what's here?".
// Call build() to make its meshes once you've decided to keep it (see isDry).
export function createTerrain(random, noise, size) {
  const hills = (x, z) => noise(x * 0.02 + 100, z * 0.02) * 4 + noise(x * 0.07 + 200, z * 0.07) * 0.8;

  // The plane came down beside a lake, so you always start near water. The lake lies on
  // the crash's open side: the skid trail runs back to the north-west and you start to the
  // south, so it goes somewhere from north-east (-60°) round to south-east (40°), with its
  // shore LAKE_GAP meters from the plane.
  const crashLakeRadius = random.range(11, 15);
  const crashLakeAngle = random.range(-1.05, 0.7);
  const crashLake = createLake(noise, 0, crashLakeRadius, 3, hills, (radiusAt) => {
    const reach = random.range(...LAKE_GAP) + radiusAt(crashLakeAngle + Math.PI);
    return [CRASH.x + Math.cos(crashLakeAngle) * reach, CRASH.z + Math.sin(crashLakeAngle) * reach];
  });
  const lakes = [crashLake];

  // A river winds out of the crash lake, away from the crash, to the edge of the map.
  const river = createRiver(random, noise, crashLakeAngle, crashLake, (x, z) => withLakes(hills(x, z), x, z, lakes), size);
  const nearRiver = (x, z, distance) =>
    river.points.some((p, i) => i % 4 === 0 && Math.hypot(p.x - x, p.z - z) < distance);

  // Snowy mountains: a few big massifs, well away from the crash and clear of the river.
  const massifs = [];
  for (let tries = 0; massifs.length < MOUNTAINS.count && tries < 400; tries++) {
    const radius = random.range(...MOUNTAINS.radius);
    const angle = random.range(0, Math.PI * 2);
    const distance = random.range(radius + MOUNTAINS.clearOfCrash, size / 2 - radius * 0.4);
    const x = CRASH.x + Math.cos(angle) * distance;
    const z = CRASH.z + Math.sin(angle) * distance;
    if (Math.abs(x) > size / 2 - radius * 0.4 || Math.abs(z) > size / 2 - radius * 0.4) continue;
    if (nearRiver(x, z, radius * 1.15 + 30)) continue;
    if (massifs.some((m) => Math.hypot(m.x - x, m.z - z) < (m.radius + radius) * 0.85)) continue;
    // Each massif is a main peak with a couple of lower shoulders, so it isn't a round dome.
    const height = random.range(...MOUNTAINS.height);
    const offset = random.range(0, 500);
    const peaks = [{ x, z, radius: radius * 0.85, height, offset }];
    for (let i = 0; i < 3; i++) {
      const a = random.range(0, Math.PI * 2);
      const d = radius * random.range(0.3, 0.5);
      peaks.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, radius: radius * random.range(0.5, 0.65), height: height * random.range(0.65, 0.9), offset: offset + 100 * (i + 1) });
    }
    massifs.push({ x, z, radius, peaks });
  }
  const peaks = massifs.flatMap((m) => m.peaks);
  // How far out from a peak (x, z) is, compared to the peak's foot: 0 at the top, 1 at the foot.
  // The foot wanders in and out, so mountains have ragged edges.
  const outFrom = (p, x, z) => {
    const edge = p.radius * (1 + 0.35 * noise(x * 0.006 + p.offset, z * 0.006) + 0.15 * noise(x * 0.02 + p.offset, z * 0.02));
    return Math.hypot(x - p.x, z - p.z) / edge;
  };
  const nearPeak = (p, x, z) => Math.abs(x - p.x) < p.radius * 1.6 && Math.abs(z - p.z) < p.radius * 1.6;
  // How far up a mountain (x, z) is: 0 on the lowlands and at a mountain's foot, 1 at the top.
  const mountainAt = (x, z) => {
    let best = 0;
    for (const p of peaks) {
      if (!nearPeak(p, x, z)) continue;
      best = Math.max(best, (p.height / MOUNTAINS.height[1]) * (1 - smoothstep(outFrom(p, x, z), 0, 1)));
    }
    return best;
  };
  const mountainHeight = (x, z) => {
    let h = 0;
    for (const p of peaks) {
      if (!nearPeak(p, x, z)) continue;
      const up = 1 - smoothstep(outFrom(p, x, z), 0, 1);
      if (up <= 0) continue;
      // Ridges and gullies on the way up.
      const ridges = 1 - Math.abs(noise(x * 0.018 + p.offset, z * 0.018));
      h = Math.max(h, p.height * up ** 1.3 + ridges * 7 * up * up);
    }
    return h;
  };
  const baseHeight = (x, z) => hills(x, z) + mountainHeight(x, z);

  // Lakes dotted around the lowlands, so there's water wherever you wander.
  const half = size / 2 - 60;
  for (let tries = 0; lakes.length - 1 < Math.round(LAKES.perSquareKm * (size / 1000) ** 2) && tries < 2000; tries++) {
    const radius = random.range(...LAKES.radius);
    const x = random.range(-half, half);
    const z = random.range(-half, half);
    if (Math.hypot(x - CRASH.x, z - CRASH.z) < LAKES.clearOfCrash) continue;
    if (mountainAt(x, z) > 0 || mountainAt(x + radius * 2, z) > 0 || mountainAt(x - radius * 2, z) > 0 ||
        mountainAt(x, z + radius * 2) > 0 || mountainAt(x, z - radius * 2) > 0) continue;
    if (nearRiver(x, z, radius * 1.8 + 15)) continue;
    if (lakes.some((l) => Math.hypot(l.x - x, l.z - z) < (l.radius + radius) * 1.8 + LAKES.spacing)) continue;
    lakes.push(createLake(noise, lakes.length, radius, random.range(2.2, 3), baseHeight, () => [x, z]));
  }
  // The lake nearest to (x, z) in its own size (see Lake.distance), if any is close.
  const nearestLake = (x, z) => {
    let best = null;
    let bestDistance = Infinity;
    for (const lake of lakes) {
      if (Math.abs(x - lake.x) > lake.reach || Math.abs(z - lake.z) > lake.reach) continue;
      const d = lake.distance(x, z);
      if (d < bestDistance) [best, bestDistance] = [lake, d];
    }
    return best ? { lake: best, distance: bestDistance } : null;
  };

  const crashTrail = createCrashTrail(noise);

  const heightAt = (x, z) => {
    const h = withLakes(baseHeight(x, z), x, z, lakes) + crashTrail.at(x, z).height;
    const r = river.nearest(x, z);
    return r ? Math.min(h, river.carve(r)) : h;
  };

  // The height of the water's surface at (x, z), or -Infinity if there's no water here.
  const waterLevelAt = (x, z) => {
    const near = nearestLake(x, z);
    let level = near && near.distance < 1.5 ? near.lake.level : -Infinity;
    const r = river.nearest(x, z);
    if (r && r.distance < r.halfWidth + 0.5) level = Math.max(level, r.level);
    return level;
  };
  // How deep the water is at (x, z): 0 on dry land.
  const waterDepth = (x, z) => {
    const level = waterLevelAt(x, z);
    return level === -Infinity ? 0 : Math.max(0, level - heightAt(x, z));
  };
  // Rough "is this within `margin` meters of a lake or the river" check, for placing things.
  const nearWater = (x, z, margin) => {
    const near = nearestLake(x, z);
    if (near && (near.distance - 1.35) * near.lake.radius < margin) return true;
    const r = river.nearest(x, z);
    return Boolean(r && r.distance < r.halfWidth + 1.5 + margin);
  };

  // How "foresty" an area is (roughly -1..1). Large woods and open meadows, a few hundred
  // meters across, with trees growing in clumps inside the woods. No birch up the mountains.
  const forest = (x, z) =>
    noise(x * 0.006 + 700, z * 0.006) * 1.3 + noise(x * 0.04 + 50, z * 0.04) * 0.6 - mountainAt(x, z) * 4;
  // How cold the air is up the mountains: 0 in the lowlands, rising to 1 above the snowline.
  const coldAt = (x, z) => smoothstep(mountainAt(x, z), MOUNTAINS.coldFrom, MOUNTAINS.coldFull);

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
    // Up the mountains: grass gives way to scree and bare rock, then snow.
    const up = mountainAt(x, z);
    if (up > 0) {
      const scree = smoothstep(up + noise(x * 0.1 + 1200, z * 0.1) * 0.12, MOUNTAINS.screeFrom, MOUNTAINS.screeFull);
      if (scree > 0) {
        tint.copy(STONE).lerp(OCHRE, clamp(noise(x * 0.8, z * 0.8) * 0.3 + 0.1, 0, 0.2));
        color.lerp(tint, scree);
        if (scree > 0.5) kind = 'rock';
      }
      const snowy = up + noise(x * 0.05 + 1300, z * 0.05) * 0.1 + noise(x * 0.3 + 1400, z * 0.3) * 0.04;
      if (snowy > MOUNTAINS.snowline) {
        color.lerp(SNOW, Math.min(1, (snowy - MOUNTAINS.snowline) / 0.04));
        kind = 'snow';
      }
    }
    // Bare soil torn up by the crash, with dark streaks running along the skid.
    const scar = crashTrail.at(x, z);
    if (scar.dirt > 0) {
      tint.copy(TORN_SOIL).lerp(DARK_SOIL, smoothstep(scar.streak, -0.2, 0.35));
      color.lerp(tint, scar.dirt);
      if (scar.dirt > 0.4) kind = 'dirt';
    }
    // Muddy lake shores, gravelly river banks, and the beds under the water.
    const near = nearestLake(x, z);
    const byLake = near && near.distance < 1.6;
    if (byLake || river.nearest(x, z)) {
      const h = heightAt(x, z);
      const level = Math.max(byLake ? near.lake.level : -Infinity, river.nearest(x, z)?.level ?? -Infinity);
      const wet = 1 - smoothstep(h, level, level + 0.45);
      if (wet > 0) {
        color.lerp(h < level ? WATER_BED : byLake ? MUD : GRAVEL, wet);
        if (wet > 0.4) kind = h < level ? 'water' : 'shore';
      }
    }
    return { color, kind };
  };

  const terrain = {
    heightAt,
    waterLevelAt,
    waterDepth,
    nearWater,
    forest,
    mountainAt,
    coldAt,
    lakes,
    massifs,
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
      terrain.water = createWater(lakes, river);
      return terrain;
    },
  };
  return terrain;
}

// A lake: a round-ish bowl with a noisy outline, filled to just below the lowest point of its
// rim (so it never spills over). `place(radiusAt)` returns where its centre goes, [x, z];
// `heightAt` is the land it's dug into.
function createLake(noise, index, radius, depth, heightAt, place) {
  const offset = 20 + index * 7.3; // each lake gets its own outline
  const radiusAt = (angle) => radius * (1 + 0.28 * noise(Math.cos(angle) * 1.5 + offset, Math.sin(angle) * 1.5 + offset));
  const [x, z] = place(radiusAt);
  let rimLow = Infinity;
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const r = radiusAt(angle) * 1.35;
    rimLow = Math.min(rimLow, heightAt(x + Math.cos(angle) * r, z + Math.sin(angle) * r));
  }
  const level = rimLow - 0.25;
  return {
    x,
    z,
    radius,
    radiusAt,
    level,
    bed: level - depth, // deep enough to swim in the middle
    reach: radius * 1.28 * 1.6, // beyond this (in x or z) it can't affect anything
    // Below 1 inside the lake's outline, 1 on it, above 1 outside.
    distance(px, pz) {
      const dx = px - x;
      const dz = pz - z;
      return Math.hypot(dx, dz) / radiusAt(Math.atan2(dz, dx));
    },
  };
}

// The land at (x, z) given its height `h` without lakes: dug down into a bowl near any lake.
function withLakes(h, x, z, lakes) {
  for (const lake of lakes) {
    if (Math.abs(x - lake.x) > lake.reach || Math.abs(z - lake.z) > lake.reach) continue;
    const d = lake.distance(x, z);
    if (d < 1.35) h = lake.bed + (h - lake.bed) * smoothstep(d, 0.7, 1.35);
  }
  return h;
}

// A river winding out of the lake to the edge of the map. It flows downhill: its surface
// never rises, and it carves a channel through anything in the way.
function createRiver(random, noise, lakeAngle, lake, heightAt, size) {
  // Leave the lake on its far side, flowing away from the crash site.
  const direction = lakeAngle + random.range(-0.4, 0.4);
  let heading = direction;
  const start = lake.radiusAt(heading) * 0.9;
  let x = lake.x + Math.cos(heading) * start;
  let z = lake.z + Math.sin(heading) * start;
  const points = [];
  let level = lake.level;
  const STEP = 2.5;
  for (let i = 0; i < 2000 && Math.max(Math.abs(x), Math.abs(z)) < size / 2 + 5; i++) {
    const halfWidth = 1.5 + Math.min(1.2, i * 0.02); // widens as it goes
    // The surface sits below the lowest ground across the channel, and never rises.
    const across = [-1, 0, 1].map((s) => heightAt(x - Math.sin(heading) * s * (halfWidth + 1), z + Math.cos(heading) * s * (halfWidth + 1)));
    // (Still inside the lake, the river is just the lake's surface.)
    if (lake.distance(x, z) > 1.35) level = Math.min(level, Math.min(...across) - 0.35);
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

  // Builds one chunk a little at a time: it pauses (yields) every so often, so the work can
  // be spread over several frames.
  function* buildChunk({ cx, cz, key }) {
    const grid = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, cells, cells)
      .rotateX(-Math.PI / 2)
      .translate((cx + 0.5) * CHUNK_SIZE, 0, (cz + 0.5) * CHUNK_SIZE);
    const corners = grid.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      corners.setY(i, heightAt(corners.getX(i), corners.getZ(i)));
      if (i % 400 === 399) yield;
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
      if (i % 1200 === 1197) yield;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    built.set(key, mesh);
    group.add(mesh);
  }

  const jobs = new Map(); // chunk key → its build, part done
  const onMap = ({ cx, cz }) =>
    Math.abs((cx + 0.5) * CHUNK_SIZE) < half + CHUNK_SIZE && Math.abs((cz + 0.5) * CHUNK_SIZE) < half + CHUNK_SIZE;

  return {
    group,
    // Builds the chunks around (x, z), nearest first, plus one more ring ahead of the ones
    // drawn, so they're ready before you get there. It works for at most `budgetMs` per call,
    // so walking into new ground doesn't stall a frame; pass Infinity to build the drawn
    // chunks right away.
    drawAround(x, z, budgetMs = GROUND_BUDGET_MS) {
      const now = budgetMs === Infinity;
      const deadline = performance.now() + budgetMs;
      for (const chunk of chunksAround(x, z, now ? DRAW_CHUNKS : DRAW_CHUNKS + 1)) {
        if (built.has(chunk.key) || !onMap(chunk)) continue;
        if (!jobs.has(chunk.key)) jobs.set(chunk.key, buildChunk(chunk));
        const job = jobs.get(chunk.key);
        while (performance.now() < deadline) {
          if (job.next().done) {
            jobs.delete(chunk.key);
            break;
          }
        }
        if (performance.now() >= deadline) break;
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
      for (const key of jobs.keys()) if (!keep.has(key)) jobs.delete(key);
    },
  };
}
