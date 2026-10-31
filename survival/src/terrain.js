import * as THREE from 'three';

const { smoothstep, clamp } = THREE.MathUtils;

// A painted-landscape palette: muted sage and olive grass, ochre dry patches, mossy
// blotches, grey stone and scree.
const SAGE = new THREE.Color(0x8aa660);
const OLIVE = new THREE.Color(0xa4a659);
const OCHRE = new THREE.Color(0xbfae72);
const MOSS = new THREE.Color(0x688841);
const FOREST_FLOOR = new THREE.Color(0x4c6334);
const STONE = new THREE.Color(0x86877f);
const SCREE = new THREE.Color(0x9a9890);
const SNOW = new THREE.Color(0xeef2f4);
const MUD = new THREE.Color(0x7a6a50);
const GRAVEL = new THREE.Color(0x9a948a);
const WATER_BED = new THREE.Color(0x3c5c55);

const VALLEY_FLOOR = 42; // the ground starts rising into the valley walls this far from the middle
const VALLEY_EDGE = 100; // ...and reaches its full height here
const WALL_HEIGHT = 26;
const GROUND_CELLS = 440; // grid squares along each side of the ground: fewer gives bigger facets

// The valley: rolling ground rising into rocky walls at the edges, a lake, and a river
// running out of it. Everything is worked out from (x, z) so other code can ask "what's here?".
export function createTerrain(random, noise, size) {
  const lakeCenter = new THREE.Vector2(random.range(18, 32), random.range(-30, -14));
  const lakeRadius = random.range(11, 15);
  const radiusAt = (angle) =>
    lakeRadius * (1 + 0.28 * noise(Math.cos(angle) * 1.5 + 20, Math.sin(angle) * 1.5 + 20));
  // Below 1 inside the lake's outline, 1 on it, above 1 outside.
  const lakeDistance = (x, z) => {
    const dx = x - lakeCenter.x;
    const dz = z - lakeCenter.y;
    return Math.hypot(dx, dz) / radiusAt(Math.atan2(dz, dx));
  };

  // How far up the valley walls (x, z) is, from 0 (valley floor) to 1 (top of the walls).
  const wall = (x, z) => smoothstep(Math.max(Math.abs(x), Math.abs(z)), VALLEY_FLOOR, VALLEY_EDGE);

  const hills = (x, z) => {
    const w = wall(x, z);
    // Rolling ground, plus craggy ridges that get stronger up the walls.
    const crags = Math.abs(noise(x * 0.06 + 150, z * 0.06)) * 6 * w;
    return noise(x * 0.02 + 100, z * 0.02) * 4 + noise(x * 0.07 + 200, z * 0.07) * 0.8 + w * w * WALL_HEIGHT + crags;
  };

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

  const river = createRiver(random, noise, lakeCenter, radiusAt, lakeDistance, waterLevel, lakeHeightAt, size);

  const heightAt = (x, z) => {
    const h = lakeHeightAt(x, z);
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
    const w = wall(x, z);
    // Broad sage and olive areas, ochre dry patches and dark mossy blotches, like brush strokes.
    color.copy(SAGE).lerp(OLIVE, clamp(noise(x * 0.025 + 300, z * 0.025) + 0.5, 0, 1));
    color.lerp(OCHRE, smoothstep(noise(x * 0.07 + 600, z * 0.07) + noise(x * 0.3, z * 0.3) * 0.25, 0.15, 0.6) * 0.7);
    color.lerp(MOSS, smoothstep(noise(x * 0.18 + 800, z * 0.18), 0.1, 0.5) * 0.5);
    color.lerp(FOREST_FLOOR, smoothstep(forest(x, z), 0.05, 0.5) * 0.7);

    let kind = 'grass';
    // Grey stone showing through, more of it the higher up the valley walls you go.
    const rock = noise(x * 0.05 + 900, z * 0.05) + noise(x * 0.4 + 950, z * 0.4) * 0.25 + w * 0.7;
    if (rock > 0.38) {
      tint.copy(w > 0.4 ? SCREE : STONE).lerp(OCHRE, clamp(noise(x * 0.8, z * 0.8) * 0.3 + 0.1, 0, 0.25));
      color.lerp(tint, Math.min(1, (rock - 0.38) / 0.05));
      kind = 'rock';
    }
    // A little lingering snow: the odd patch in the valley, more on the high walls.
    const snow = noise(x * 0.06 + 400, z * 0.06) + noise(x * 0.4 + 500, z * 0.4) * 0.22 + w * w * 0.35;
    if (snow > 0.86) {
      color.lerp(SNOW, Math.min(1, (snow - 0.86) / 0.03));
      kind = 'snow';
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

  return {
    heightAt,
    waterLevel,
    waterDepth,
    nearWater,
    forest,
    groundAt,
    ground: createGroundMesh(size, heightAt, groundAt, noise),
    water: createWaterMesh(lakeCenter, radiusAt, waterLevel, river),
    riverPoints: river.points, // the river's path, from the lake outwards
  };
}

// A river winding out of the lake to the edge of the map. It flows downhill: its surface
// never rises, and it carves a channel through anything in the way.
function createRiver(random, noise, lakeCenter, radiusAt, lakeDistance, lakeLevel, heightAt, size) {
  // Leave the lake heading north-east, away from the crash site.
  const direction = -Math.PI / 4 + random.range(-0.3, 0.3);
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

// The ground: a faceted hilly mesh where every triangle is one flat colour.
function createGroundMesh(size, heightAt, groundAt, noise) {
  const grid = new THREE.PlaneGeometry(size, size, GROUND_CELLS, GROUND_CELLS).rotateX(-Math.PI / 2);
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

  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  return ground;
}

const WATER = {
  color: 0x4a7d9c,
  roughness: 0.08,
  metalness: 0.1,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
};

// The lake (a flat sheet a bit bigger than it; the shore hides the edges) and a ribbon
// of water following the river down its channel.
function createWaterMesh(center, radiusAt, level, river) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    const r = radiusAt(angle) * 1.4;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  const lake = new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), new THREE.MeshStandardMaterial(WATER));
  // Shapes are drawn on the x/y plane; tip it over so the shape's y becomes the world's z.
  lake.rotation.x = Math.PI / 2;
  lake.position.set(center.x, level, center.y);
  lake.receiveShadow = true;

  const { points } = river;
  const vertices = [];
  const indices = [];
  points.forEach((p, i) => {
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const angle = Math.atan2(next.z - prev.z, next.x - prev.x);
    const w = p.halfWidth + 0.5;
    const sx = -Math.sin(angle) * w;
    const sz = Math.cos(angle) * w;
    vertices.push(p.x + sx, p.level, p.z + sz, p.x - sx, p.level, p.z - sz);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const stream = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(WATER));
  stream.receiveShadow = true;

  const water = new THREE.Group();
  water.add(lake, stream);
  return water;
}
