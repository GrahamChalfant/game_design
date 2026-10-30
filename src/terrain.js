import * as THREE from 'three';

const { smoothstep, clamp } = THREE.MathUtils;

const MEADOW = new THREE.Color(0x6fa23e);
const FIELD = new THREE.Color(0x9fbd45);
const GOLDEN = new THREE.Color(0xdcc25e);
const FOREST_FLOOR = new THREE.Color(0x557a35);
const SNOW = new THREE.Color(0xeef2f4);
const MUD = new THREE.Color(0x7a6a50);
const LAKE_BED = new THREE.Color(0x3c5c55);

// Rolling hills with a lake, plus the colours painted on the ground.
// Everything is worked out from (x, z) so other code can ask "what's here?".
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

  const hills = (x, z) => noise(x * 0.02 + 100, z * 0.02) * 4 + noise(x * 0.07 + 200, z * 0.07) * 0.8;

  // Water sits just below the lowest point of the lake's rim, so it never spills over.
  let rimLow = Infinity;
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const r = radiusAt(angle) * 1.35;
    rimLow = Math.min(rimLow, hills(lakeCenter.x + Math.cos(angle) * r, lakeCenter.y + Math.sin(angle) * r));
  }
  const waterLevel = rimLow - 0.25;
  const lakeBed = waterLevel - 1.5;

  const heightAt = (x, z) => {
    const h = hills(x, z);
    const d = lakeDistance(x, z);
    if (d > 1.35) return h;
    return lakeBed + (h - lakeBed) * smoothstep(d, 0.7, 1.35);
  };

  const isWater = (x, z) => lakeDistance(x, z) < 1.5 && heightAt(x, z) < waterLevel + 0.05;
  // Rough "is this within `margin` meters of the lake" check, for placing things.
  const nearLake = (x, z, margin) => (lakeDistance(x, z) - 1.35) * lakeRadius < margin;

  // How "foresty" an area is (roughly -1..1). Trees grow in clumps where this is high.
  const forest = (x, z) => noise(x * 0.04 + 50, z * 0.04);

  const color = new THREE.Color();
  // What the ground looks like at (x, z). The returned colour is reused: copy it if you keep it.
  const groundAt = (x, z) => {
    // Big fields shading from lush green to golden, with fine variation.
    const field = noise(x * 0.03 + 300, z * 0.03) + noise(x * 0.35, z * 0.35) * 0.18;
    if (field < 0) color.copy(MEADOW).lerp(FIELD, clamp(field + 1, 0, 1));
    else color.copy(FIELD).lerp(GOLDEN, clamp(field * 1.6, 0, 1));
    color.lerp(FOREST_FLOOR, smoothstep(forest(x, z), 0.05, 0.5) * 0.7);

    let kind = 'grass';
    // A few patches of lingering snow, with crisp edges.
    const snow = noise(x * 0.06 + 400, z * 0.06) + noise(x * 0.4 + 500, z * 0.4) * 0.22;
    if (snow > 0.68) {
      color.lerp(SNOW, Math.min(1, (snow - 0.68) / 0.03));
      kind = 'snow';
    }
    // Muddy shore and lake bed.
    if (lakeDistance(x, z) < 1.6) {
      const h = heightAt(x, z);
      const wet = 1 - smoothstep(h, waterLevel, waterLevel + 0.45);
      if (wet > 0) {
        color.lerp(h < waterLevel ? LAKE_BED : MUD, wet);
        if (wet > 0.4) kind = h < waterLevel ? 'water' : 'shore';
      }
    }
    return { color, kind };
  };

  return {
    heightAt,
    isWater,
    nearLake,
    forest,
    groundAt,
    ground: createGroundMesh(size, heightAt, groundAt),
    water: createWaterMesh(lakeCenter, radiusAt, waterLevel),
  };
}

// The ground: a detailed hilly mesh with a high-resolution painted texture.
function createGroundMesh(size, heightAt, groundAt) {
  const geometry = new THREE.PlaneGeometry(size, size, 256, 256).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heightAt(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();

  const pixels = 1536;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(pixels, pixels);
  for (let py = 0; py < pixels; py++) {
    for (let px = 0; px < pixels; px++) {
      const { color } = groundAt((px / pixels - 0.5) * size, (py / pixels - 0.5) * size);
      const i = (py * pixels + px) * 4;
      image.data[i] = color.r * 255;
      image.data[i + 1] = color.g * 255;
      image.data[i + 2] = color.b * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  ground.receiveShadow = true;
  return ground;
}

// A flat sheet of water a bit bigger than the lake; the shore hides its edges.
function createWaterMesh(center, radiusAt, level) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    const r = radiusAt(angle) * 1.4;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  const water = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 4),
    new THREE.MeshStandardMaterial({
      color: 0x3f7f96,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    }),
  );
  // Shapes are drawn on the x/y plane; tip it over so the shape's y becomes the world's z.
  water.rotation.x = Math.PI / 2;
  water.position.set(center.x, level, center.y);
  water.receiveShadow = true;
  return water;
}
