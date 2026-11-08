import * as THREE from 'three';

const WATER = {
  color: 0x3e6066, // deep slate teal (paler and it glows turquoise in daylight)
  roughness: 0.2,
  metalness: 0.1,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
};

const RIPPLES = 12; // the most rings on the water at once
const RIPPLE_LIFE = 1.8; // seconds before a ring fades away
const RIPPLE_SPEED = 1.5; // how fast a ring spreads, in meters a second
const RIPPLE_STEP = 0.7; // a moving player starts a new ring every this many meters...
const RIPPLE_IDLE = 1.4; // ...and one standing still, every this many seconds

const uniforms = {
  uTime: { value: 0 },
  // One per ring: x and z are where it started, and y is the time it started.
  uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector3(0, -100, 0)) },
};

// The water material, with moving light on the surface. In the river (`flows`) it slides
// downstream as soft patches; on the lake it drifts slowly as thin ripple lines.
function waterMaterial(flows, look = {}) {
  const material = new THREE.MeshStandardMaterial({ ...WATER, ...look });
  material.defines = { RIPPLES, RIPPLE_LIFE: RIPPLE_LIFE.toFixed(1), RIPPLE_SPEED: RIPPLE_SPEED.toFixed(1) };
  if (flows) material.defines.FLOWS = '';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWaterPosition;
        #ifdef FLOWS
          attribute vec2 flow;
          varying vec2 vFlow;
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWaterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef FLOWS
          vFlow = flow;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uRipples[RIPPLES];
        varying vec3 vWaterPosition;
        #ifdef FLOWS
          varying vec2 vFlow; // meters along the river, and -1 to 1 across it
        #endif
        float waterHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float waterNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(waterHash(cell), waterHash(cell + vec2(1.0, 0.0)), f.x),
            mix(waterHash(cell + vec2(0.0, 1.0)), waterHash(cell + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float light = 0.0; // pale lines
        float sheen = 0.0; // soft, slightly lighter blue patches
        #ifdef FLOWS
          // Long streaks sliding downstream, in two layers at different speeds.
          float streak = waterNoise(vec2(vFlow.x * 0.22 - uTime * 0.3, vFlow.y * 2.6 + 4.0));
          streak += 0.5 * waterNoise(vec2(vFlow.x * 0.6 - uTime * 0.75, vFlow.y * 5.0));
          // (The river starts inside the lake, so its streaks fade in as it leaves.)
          sheen = smoothstep(0.7, 1.2, streak) * 0.5 * smoothstep(7.0, 14.0, vFlow.x);
        #else
          float line = waterNoise(vWaterPosition.xz * 0.22 + vec2(uTime * 0.05, uTime * 0.03));
          line += 0.3 * waterNoise(vWaterPosition.zx * 0.6 - vec2(uTime * 0.06));
          light = (1.0 - smoothstep(0.0, 0.025, abs(line - 0.68))) * 0.2;
        #endif
        for (int i = 0; i < RIPPLES; i++) {
          float age = uTime - uRipples[i].y;
          if (age < 0.0 || age > RIPPLE_LIFE) continue;
          float away = distance(vWaterPosition.xz, uRipples[i].xz);
          float ring = 1.0 - smoothstep(0.0, 0.3 + age * 0.2, abs(away - 0.25 - age * RIPPLE_SPEED));
          sheen = max(sheen, ring * (1.0 - age / RIPPLE_LIFE) * 0.6);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.38, 0.5), sheen);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.9, 0.95), light);`,
      );
  };
  return material;
}

// The lakes (each a flat sheet a bit bigger than it; the shore hides the edges), a ribbon of
// water following the river down its channel, and narrower, clearer ones down the creeks.
export function createWater(lakes, river, creeks = []) {
  const lakeMaterial = waterMaterial(false);
  const sheets = lakes.map((lake) => {
    const shape = new THREE.Shape();
    const sides = lake.big ? 240 : 96;
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const r = lake.radiusAt(angle) * 1.4;
      if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    const sheet = new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), lakeMaterial);
    // Shapes are drawn on the x/y plane; tip it over so the shape's y becomes the world's z.
    sheet.rotation.x = Math.PI / 2;
    sheet.position.set(lake.x, lake.level, lake.z);
    sheet.receiveShadow = true;
    return sheet;
  });

  // (The river a little more opaque than the lake: deep and silty, its bed mostly hidden.)
  const stream = ribbon(river.points, 0.5, 0, waterMaterial(true, { opacity: 0.93 }));
  // Creek water is thin and clear: you see the pebbles through it. (Its streaks start
  // straight away: the river's fade in only as it leaves its lake.)
  const creekMaterial = waterMaterial(true, { color: 0x6f9a94, opacity: 0.38 });
  const creekRibbons = creeks.map(({ points }) => ribbon(points, 0.25, 14, creekMaterial));

  const mesh = new THREE.Group();
  mesh.add(...sheets, stream, ...creekRibbons);

  let next = 0; // the ring to reuse next
  let lastRipple = new THREE.Vector2(Infinity, Infinity);
  let lastTime = -Infinity;

  return {
    mesh,
    // `wading` says whether the player is in the water at (x, z).
    update(time, x, z, wading) {
      uniforms.uTime.value = time;
      if (!wading) return;
      if (Math.hypot(x - lastRipple.x, z - lastRipple.y) < RIPPLE_STEP && time - lastTime < RIPPLE_IDLE) return;
      uniforms.uRipples.value[next].set(x, time, z);
      next = (next + 1) % RIPPLES;
      lastRipple.set(x, z);
      lastTime = time;
    },
  };
}

// A strip of water following `points` ({ x, z, level, halfWidth }), `overhang` meters wider
// than the channel on each side (the banks hide its edges). Its `flow` attribute is meters
// along it (starting from `start`) and -1 to 1 across it.
function ribbon(points, overhang, start, material) {
  const vertices = [];
  const flow = [];
  const indices = [];
  let along = start;
  points.forEach((p, i) => {
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const angle = Math.atan2(next.z - prev.z, next.x - prev.x);
    const w = p.halfWidth + overhang;
    const sx = -Math.sin(angle) * w;
    const sz = Math.cos(angle) * w;
    vertices.push(p.x + sx, p.level, p.z + sz, p.x - sx, p.level, p.z - sz);
    if (i > 0) along += Math.hypot(p.x - prev.x, p.z - prev.z);
    flow.push(along, 1, along, -1);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
