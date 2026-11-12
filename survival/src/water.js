import * as THREE from 'three';
import { FALLS } from './layout.js';

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

const FLOW_SPEED = 1.2; // meters a second the river's patterns slide at on a level stretch (see ribbon)

const uniforms = {
  uTime: { value: 0 },
  // One per ring: x and z are where it started, and y is the time it started.
  uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector3(0, -100, 0)) },
  // The colour of the sky down at the horizon: what the water mirrors at a low angle.
  uSky: { value: new THREE.Color(0xa9b8c8) },
  // Where the waterfall lands in its pool (x, z), and how far out its rings spread.
  uFalls: { value: new THREE.Vector3(FALLS.x + Math.sin(FALLS.heading) * 1.6, FALLS.z + Math.cos(FALLS.heading) * 1.6, FALLS.pool * 1.7) },
};

// The colour the water mirrors, for the spray at the waterfall to take the day's light from too.
export const waterSky = uniforms.uSky;

// The water material, with moving light on the surface. In the river and creeks (`flows`) it
// runs downstream: thin current lines and soft swells that stretch and quicken where the
// channel steepens, breaking into white water in the rapids; pale and clear in the shallows
// at the banks, darker down the middle, with a broken line of foam along the waterline. On the
// lakes it drifts slowly as thin ripple lines. All of it mirrors the sky at a low angle, and
// its ripples catch the sun.
// `bed` is the shape of a channel's bed, for how deep the water is across it: [meters deep at
// the channel's edge, how much deeper in the middle, how steeply the bank rises beyond the
// edge]; `shallow` is the water's colour in the shallows.
function waterMaterial(flows, { bed = [0.2, 1.3, 0.6], shallow = 0x86aaa4, ...look } = {}) {
  const material = new THREE.MeshStandardMaterial({ ...WATER, ...look });
  material.defines = { RIPPLES, RIPPLE_LIFE: RIPPLE_LIFE.toFixed(1), RIPPLE_SPEED: RIPPLE_SPEED.toFixed(1), FLOW_SPEED: FLOW_SPEED.toFixed(2) };
  if (flows) material.defines.FLOWS = '';
  const own = {
    uBed: { value: new THREE.Vector3(...bed) },
    uShallow: { value: new THREE.Color(shallow) },
    uOpacity: { value: material.opacity },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWaterPosition;
        #ifdef FLOWS
          attribute vec2 flow;
          attribute vec4 bank;
          varying vec2 vFlow;
          varying vec4 vBank;
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWaterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef FLOWS
          vFlow = flow;
          vBank = bank;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uRipples[RIPPLES];
        uniform vec3 uSky;
        uniform vec3 uFalls;
        uniform vec3 uBed;
        uniform vec3 uShallow;
        uniform float uOpacity;
        varying vec3 vWaterPosition;
        #ifdef FLOWS
          varying vec2 vFlow; // how far down the river (see ribbon), and -1 to 1 across it
          varying vec4 vBank; // the ribbon's half width, the channel's, how rough the water is (0 to 1), and how much of it is there (0 where it's run into other water)
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
        }
        // The surface's normal, tipped by the ripples on it (h: their height, in meters).
        vec3 waterBump(vec3 n, float h) {
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, n);
          vec3 r2 = cross(n, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          return normalize(abs(det) * n - grad);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float light = 0.0; // pale lines
        float sheen = 0.0; // soft, slightly lighter blue patches
        float foam = 0.0; // white water
        float swell = 0.0; // the ripples' height, in meters (they tip the surface: see below)
        float body = 1.0; // 0 at the very edge of the water, 1 where there's some depth to it
        #ifdef FLOWS
          float side = vFlow.y * vBank.x; // meters from the middle
          float out_ = abs(side);
          float rough = vBank.z;
          float down = vFlow.x - uTime * FLOW_SPEED; // (the patterns ride this downstream)
          // How deep it is here, from the shape of the bed. (The waterline wanders a little.)
          float depth = out_ < vBank.y
            ? uBed.x + uBed.y * (1.0 - out_ * out_ / (vBank.y * vBank.y))
            : uBed.x - (out_ - vBank.y) * uBed.z;
          depth += (waterNoise(vec2(vFlow.x * 0.8, vFlow.y * 2.0 + uTime * 0.25)) - 0.5) * 0.3 * uBed.x;
          float deep = smoothstep(0.0, (uBed.x + uBed.y) * 0.75, depth);
          body = smoothstep(-0.25 * uBed.x, 0.6 * uBed.x, depth);
          // Clear and pale in the shallows, darker and more solid down the middle.
          diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, deep);
          diffuseColor.a = uOpacity * body * mix(0.5, 1.0, deep);
          // Swells and thin current lines sliding downstream, in two layers at different speeds.
          float slow = waterNoise(vec2(down * 0.16, side * 2.2 + 4.0));
          float quick = waterNoise(vec2((down - uTime * 0.7) * 0.42 + 13.0, side * 4.6));
          float current = slow * 0.65 + quick * 0.35;
          swell = (current - 0.5) * mix(0.05, 0.12, rough);
          light = (1.0 - smoothstep(0.0, 0.05, abs(current - 0.56))) * 0.11 * deep;
          sheen = smoothstep(0.6, 0.85, current) * 0.3 * deep;
          // White water where it runs steep: streaks of it, then most of the surface.
          float churn = waterNoise(vec2((down - uTime * 1.1) * 1.7, side * 4.4 + 9.0)) * 0.6 + quick * 0.4;
          foam = smoothstep(mix(1.05, 0.5, rough), mix(1.2, 0.74, rough), churn) * body;
          foam *= 0.6 + 0.4 * waterNoise(vec2((down - uTime * 1.6) * 4.5, side * 5.0)); // (broken up, not solid white)
          // And a broken line of foam along the banks, where the water laps the stones.
          float lap = waterNoise(vec2(vFlow.x * 1.4 - uTime * 0.35, step(0.0, side) * 7.0 + uTime * 0.12));
          float waterline = (1.0 - smoothstep(0.25 * uBed.x, 0.9 * uBed.x + 0.04, depth)) * body;
          foam = max(foam, waterline * smoothstep(0.35, 0.6, lap) * mix(0.55, 0.9, rough));
        #else
          float line = waterNoise(vWaterPosition.xz * 0.22 + vec2(uTime * 0.05, uTime * 0.03));
          line += 0.3 * waterNoise(vWaterPosition.zx * 0.6 - vec2(uTime * 0.06));
          light = (1.0 - smoothstep(0.0, 0.025, abs(line - 0.68))) * 0.2;
          swell = line * 0.06 + (waterNoise(vWaterPosition.xz * 1.7 + vec2(uTime * 0.3, -uTime * 0.22)) - 0.5) * 0.025;
          // Under the waterfall: white water boiling where it lands, and rings spreading out
          // from there across the pool, fading as they go.
          vec2 fromFall = vWaterPosition.xz - uFalls.xy;
          float fallReach = length(fromFall);
          if (fallReach < uFalls.z) {
            float near = 1.0 - smoothstep(1.5, uFalls.z, fallReach);
            float rings = sin(fallReach * 2.4 - uTime * 3.0 + waterNoise(fromFall * 0.5) * 3.0);
            swell += rings * 0.05 * near;
            light = max(light, smoothstep(0.8, 0.98, rings) * 0.3 * near * near);
            float boil = waterNoise(fromFall * 1.5 + vec2(0.0, uTime * 0.9)) * 0.6 + waterNoise(fromFall * 3.3 - vec2(uTime * 1.2, 0.0)) * 0.4;
            float thin = smoothstep(0.8, 5.5, fallReach);
            foam = smoothstep(mix(0.15, 0.78, thin), mix(0.4, 0.95, thin), boil) * (1.0 - smoothstep(4.5, 7.0, fallReach));
          }
        #endif
        for (int i = 0; i < RIPPLES; i++) {
          float age = uTime - uRipples[i].y;
          if (age < 0.0 || age > RIPPLE_LIFE) continue;
          float reach = distance(vWaterPosition.xz, uRipples[i].xz);
          float ring = 1.0 - smoothstep(0.0, 0.3 + age * 0.2, abs(reach - 0.25 - age * RIPPLE_SPEED));
          sheen = max(sheen, ring * (1.0 - age / RIPPLE_LIFE) * 0.6);
          swell += ring * (1.0 - age / RIPPLE_LIFE) * 0.04;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.38, 0.5), sheen);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.9, 0.95), light);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.91, 0.9), foam * 0.9);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam * 0.8);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // The ripples tip the surface (close by: far off they'd only shimmer), so the sun
        // glints off them; and at a low angle the water mirrors the sky.
        normal = waterBump(normal, swell * (1.0 - smoothstep(30.0, 80.0, length(vViewPosition))));
        float glance = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 5.0) * (1.0 - foam);
        diffuseColor.rgb *= 1.0 - 0.5 * glance;
        diffuseColor.a = mix(diffuseColor.a, 1.0, glance * 0.7 * body);
        #ifdef FLOWS
          diffuseColor.a *= vBank.w;
        #endif
        totalEmissiveRadiance += uSky * glance * 0.5;`,
      );
  };
  return material;
}

// The lakes (each a flat sheet a bit bigger than it; the shore hides the edges), a ribbon of
// water following the river down its channel, narrower, clearer ones down the creeks, and
// `open` water reaching right across the map (the sea and the big lake): each a flat sheet
// { level, minX, maxX, minZ, maxZ, sea } with the land hiding its edges.
export function createWater(lakes, river, creeks = [], open = [], headwaters = { main: [], forks: [] }) {
  const lakeMaterial = waterMaterial(false);
  const sheets = lakes.map((lake) => {
    const shape = new THREE.Shape();
    const sides = lake.big ? 240 : 96;
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const r = lake.radiusAt(angle) * LAKE_SHEET;
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
  const stream = ribbon(river.points, 0.5, 0, waterMaterial(true, { opacity: 0.93 }), { lakes, rapids: [0.02, 0.11] });
  // Creek water is thin and clear: you see the pebbles through it. (They run down the hills'
  // slopes all the way, so it takes a steeper pitch than the river's to whiten them.)
  // (It doesn't hide what's behind it: where a creek thins away into the river, the river shows.)
  const creekMaterial = waterMaterial(true, { color: 0x6f9a94, opacity: 0.42, bed: [0.04, 0.24, 0.75], shallow: 0x9dbab2, depthWrite: false });
  const creekRibbons = creeks.map(({ points }) => ribbon(points, 0.25, 14, creekMaterial, { rapids: [0.14, 0.4], roughest: 0.7, fadeEnd: 3 }));

  // (The sea darker and bluer than the lakes, and less clear.)
  const seaMaterial = waterMaterial(false, { color: 0x2c4f5e, opacity: 0.92 });
  const openSheets = open.map(({ level, minX, maxX, minZ, maxZ, sea }) => {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 1, 1).rotateX(-Math.PI / 2), sea ? seaMaterial : lakeMaterial);
    sheet.position.set((minX + maxX) / 2, level, (minZ + maxZ) / 2);
    sheet.receiveShadow = true;
    return sheet;
  });

  // `headwaters`: the river above the waterfall, { main, forks } (each a list of points like
  // the river's). Meltwater: pale and a little milky, white where it comes down steep. Each fork
  // swings in alongside the main stream and thins away into it (see `fadeEnd`): one water, not
  // two strips touching.
  const meltwater = { color: 0x7fa8a4, opacity: 0.82, bed: [0.05, 0.5, 0.7], shallow: 0xa6c2bb };
  const streamMaterial = waterMaterial(true, meltwater);
  const forkMaterial = waterMaterial(true, { ...meltwater, depthWrite: false }); // (so the main stream shows through a fork's thinning end)
  const streamRibbons = [
    ...(headwaters.main.length ? [ribbon(headwaters.main, 0.15, 30, streamMaterial, { rapids: [0.03, 0.14], cascade: [0.16, 0.42] })] : []),
    ...headwaters.forks.map((points) => Object.assign(ribbon(points, 0.2, 14, forkMaterial, { rapids: [0.06, 0.2], cascade: [0.2, 0.45], fadeEnd: 9 }), { renderOrder: 1 })),
  ];

  const mesh = new THREE.Group();
  mesh.add(...sheets, ...openSheets, stream, ...creekRibbons, ...streamRibbons);

  let next = 0; // the ring to reuse next
  let lastRipple = new THREE.Vector2(Infinity, Infinity);
  let lastTime = -Infinity;

  return {
    mesh,
    // White water round the boulders standing in the river (world.js puts them there): each of
    // `spots` is { x, z, level (the water's), radius (the boulder's at the waterline), along (the
    // way the river runs there, as atan2(dz, dx)), fall (its slope), steep (0 calm to 1 rapids) }.
    addWakes(spots) {
      if (spots.length) mesh.add(wakes(spots));
    },
    // `wading` says whether the player is in the water at (x, z); `sky` is the colour of the
    // sky at the horizon (the water mirrors it).
    update(time, x, z, wading, sky) {
      uniforms.uTime.value = time;
      if (sky?.isColor) uniforms.uSky.value.copy(sky);
      if (!wading) return;
      if (Math.hypot(x - lastRipple.x, z - lastRipple.y) < RIPPLE_STEP && time - lastTime < RIPPLE_IDLE) return;
      uniforms.uRipples.value[next].set(x, time, z);
      next = (next + 1) % RIPPLES;
      lastRipple.set(x, z);
      lastTime = time;
    },
  };
}

// The water round boulders in the river: a patch of foam lying on the surface at each, drawn
// together. It piles up white against the boulder's upstream side, wraps round it, and trails
// away downstream in a widening V of streaks; fainter where the river's calm.
// Each patch reaches WAKE.up boulder-radii upstream of its boulder, WAKE.down below it, and
// WAKE.wide across.
const WAKE = { up: 1.5, down: 4.2, wide: 3.8 };
function wakes(spots) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  geometry.setAttribute('wake', new THREE.InstancedBufferAttribute(new Float32Array(spots.map((s) => 0.5 + 0.5 * s.steep)), 1));
  // (Drawn as if a little nearer than it is: the river's surface steps down under it, and would cut it off.)
  const material = new THREE.MeshStandardMaterial({ color: 0xdfe9e7, roughness: 0.6, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -60 });
  material.defines = { USE_UV: '', WAKE_UP: WAKE.up.toFixed(2), WAKE_LONG: (WAKE.up + WAKE.down).toFixed(2), WAKE_WIDE: WAKE.wide.toFixed(2) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float wake;
        varying float vWake;
        varying vec2 vWakeAt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWake = wake;
        vWakeAt = instanceMatrix[3].xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying float vWake;
        varying vec2 vWakeAt;
        float wakeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wakeNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wakeHash(i), wakeHash(i + vec2(1.0, 0.0)), f.x), mix(wakeHash(i + vec2(0.0, 1.0)), wakeHash(i + 1.0), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Where this is, in boulder-radii: x downstream of the boulder's middle, y across.
        vec2 p = vec2(vUv.x * WAKE_LONG - WAKE_UP, (vUv.y - 0.5) * WAKE_WIDE);
        float d = length(p);
        float upstream = smoothstep(0.4, -0.8, p.x / max(d, 0.001));
        // The collar: water piled up against it, thickest on the upstream side, breaking round it.
        float collar = smoothstep(1.15 + 0.3 * upstream, 0.95, d) * mix(0.3, 0.85, upstream);
        collar *= smoothstep(0.7, 0.95, d) * smoothstep(0.3, 0.65, wakeNoise(vec2(atan(p.y, p.x) * 2.5 + vWakeAt.x, d * 3.0 - uTime * 1.6)));
        // The wake: a widening V below it, brightest along its two edges, in streaks sliding away.
        float half_ = 0.9 + 0.2 * p.x;
        float inside = smoothstep(half_, half_ - 0.4, abs(p.y));
        float edges = 1.0 - smoothstep(0.0, 0.45, abs(abs(p.y) - (half_ - 0.3)));
        float streak = wakeNoise(vec2(p.x * 1.5 - uTime * 2.6 + vWakeAt.x, p.y * 3.2 + vWakeAt.y));
        float trail = inside * (0.3 + 0.7 * edges) * smoothstep(0.38, 0.7, streak) * smoothstep(0.1, 0.9, p.x) * (1.0 - smoothstep(1.4, WAKE_LONG - WAKE_UP, p.x));
        diffuseColor.a *= clamp(max(collar, trail), 0.0, 1.0) * vWake * 0.9;`);
  };
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const ACROSS = new THREE.Vector3(0, 0, 1);
  spots.forEach((s, i) => {
    // (Its +x runs downstream, tipped down the river's slope; its middle is below the boulder.)
    turn.setFromAxisAngle(UP, -s.along).multiply(tilt.setFromAxisAngle(ACROSS, -Math.atan(s.fall)));
    const below = ((WAKE.down - WAKE.up) / 2) * s.radius;
    const at = new THREE.Vector3(s.x + Math.cos(s.along) * below, s.level + 0.04 - s.fall * below, s.z + Math.sin(s.along) * below);
    matrix.compose(at, turn, new THREE.Vector3((WAKE.up + WAKE.down) * s.radius, 1, WAKE.wide * s.radius));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.renderOrder = 1; // (over the water it lies on)
  mesh.receiveShadow = true;
  return mesh;
}

const LAKE_SHEET = 1.4; // a lake's sheet of water is this many times as big as the lake
const SPILL = 4; // points along it a river takes to spill down out of a lake to its own level

// A strip of water following `points` ({ x, z, level, halfWidth }), `overhang` meters wider
// than the channel on each side (the banks hide its edges). Its `flow` attribute is how far
// down it you are (starting from `start`) and -1 to 1 across it; its `bank`, the strip's half
// width, the channel's, and how rough the water is there (0 smooth to 1 white).
// `flow` isn't quite meters: it counts slower where the water runs faster (down the steeper
// stretches), so a pattern sliding along it at a steady rate speeds up and stretches out there,
// as water does. `rapids` is the slope [where the water starts to break, where it's all
// white], and `roughest` the most it breaks.
// Where the strip starts inside one of `lakes`, it lies at the lake's level until the lake's
// sheet ends, then spills down to its own over a few meters (not starting a step below it).
function ribbon(points, overhang, start, material, { lakes = [], rapids = [0.02, 0.11], roughest = 1, cascade = null, fadeEnd = 0 } = {}) {
  // (`fadeEnd`: the meters over which it thins away to nothing at its end, where it runs into other water.)
  const left = points.map(() => 0);
  for (let i = points.length - 2; i >= 0; i--) left[i] = left[i + 1] + Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  const vertices = [];
  const flow = [];
  const bank = [];
  const indices = [];
  // The water's surface: its own level, or the lake's it comes out of.
  let lastInLake = -1;
  let lakeLevel = 0;
  points.forEach((p, i) => {
    for (const lake of lakes) {
      const [dx, dz] = [p.x - lake.x, p.z - lake.z];
      if (lake.level > p.level && Math.hypot(dx, dz) < lake.radiusAt(Math.atan2(dz, dx)) * LAKE_SHEET - 0.5) [lastInLake, lakeLevel] = [i, lake.level];
    }
  });
  const surface = points.map((p, i) => {
    if (i <= lastInLake) return lakeLevel - 0.03; // (just under the lake's sheet)
    const t = THREE.MathUtils.smoothstep(i - lastInLake, 0, SPILL);
    return lastInLake >= 0 ? THREE.MathUtils.lerp(lakeLevel - 0.03, p.level, t) : p.level;
  });
  // How steeply it runs at each point (its fall over a few points either side).
  const REACH = 3;
  const slope = points.map((p, i) => {
    const [a, b] = [Math.max(i - REACH, 0), Math.min(i + REACH, points.length - 1)];
    let run = 0;
    for (let k = a; k < b; k++) run += Math.hypot(points[k + 1].x - points[k].x, points[k + 1].z - points[k].z);
    return run > 0 ? Math.max(0, surface[a] - surface[b]) / run : 0;
  });
  let along = start;
  points.forEach((p, i) => {
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const angle = Math.atan2(next.z - prev.z, next.x - prev.x);
    // (Lifted above its own level, it reaches further up the banks.)
    const w = p.halfWidth + overhang + (surface[i] - p.level) / 0.6;
    const sx = -Math.sin(angle) * w;
    const sz = Math.cos(angle) * w;
    vertices.push(p.x + sx, surface[i], p.z + sz, p.x - sx, surface[i], p.z - sz);
    // (`cascade`: the slope from which it tumbles, to where it's all white: rougher than rough.)
    const rough = THREE.MathUtils.smoothstep(slope[i], ...rapids) * roughest + (cascade ? 0.7 * THREE.MathUtils.smoothstep(slope[i], ...cascade) : 0);
    const speed = 1 + 1.6 * THREE.MathUtils.smoothstep(slope[i], 0, rapids[1] * 1.5); // (times FLOW_SPEED)
    if (i > 0) along += Math.hypot(p.x - prev.x, p.z - prev.z) / speed;
    flow.push(along, 1, along, -1);
    // (Lifted, the channel under it is that much wider and deeper: no shallows at its edges.)
    const channel = p.halfWidth + (surface[i] - p.level) / 0.6;
    const there = fadeEnd ? THREE.MathUtils.smoothstep(left[i], 0, fadeEnd) : 1;
    bank.push(w, channel, rough, there, w, channel, rough, there);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  geometry.setAttribute('bank', new THREE.Float32BufferAttribute(bank, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
