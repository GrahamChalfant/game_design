import * as THREE from 'three';
import { loadModel } from './models.js';
import { skyPath } from './daylight.js';

// The sky, for the views that look out across the land (third and first person: see
// views.js). From above it's never seen. It has:
// - a dome: the haze colour at the horizon (matching the fog, so the far land fades into
//   it), deepening to the sky's colour overhead, with the sun (a bright disc and a glow,
//   warmer near the horizon) by day, and the moon and stars by night;
// - clouds: low-poly cumulus made in Blender (blender/sky.py → clouds.glb), drifting slowly
//   on the wind, high above the land, and fading into the haze far off.
// The weather (src/weather.js) says how many clouds are out (none on a clear day, all of them
// when it's overcast) and how blue the sky deepens overhead (grey in a blizzard).
const RADIUS = 600; // meters: the dome (inside the camera's far plane, 650)
const CLOUDS = {
  count: 60,
  tile: 1300, // meters: clouds are scattered over a square this big, which moves with you
  // High and not too big, so from the ground they're up in the sky rather than a ceiling just
  // over the trees (the highest peaks reach about 90 m).
  height: [240, 320], // meters up
  scale: [1.5, 2.6], // the models are about 40 m across
  wind: new THREE.Vector2(2.2, 0.9), // meters a second
  hazeFrom: 280, // meters away (across the ground) where clouds start fading into the sky...
  hazeTo: 500, // ...and where they're gone (before the camera's far plane, high as they are)
};
const NIGHT_SKY = new THREE.Color(0x1b2440);
const DAY_DEEP = new THREE.Color(0x6f8fb8); // overhead, the sky deepens towards this blue
const CLEAR_DEEP = new THREE.Color(0x3f7cc8); // ...and on a clear day, this one

export function createSky(scene, ambient, hour, weather = () => null) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // ---- The dome.
  const uniforms = {
    uHorizon: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform vec3 uSunColor;
        uniform float uNight; uniform float uTime; varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 dir = normalize(vDir);
          float up = dir.y;
          vec3 colour = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, up));
          float toward = max(dot(dir, uSun), 0.0);
          // Low in the sky, the light round the sun is warmer and spreads wider.
          float low = 1.0 - smoothstep(0.0, 0.35, uSun.y);
          float glow = pow(toward, mix(24.0, 6.0, low)) * mix(0.35, 0.6, low);
          float disc = smoothstep(mix(0.9994, 0.99965, uNight), mix(0.9997, 0.99985, uNight), toward);
          colour += uSunColor * glow * (1.0 - uNight * 0.75);
          colour = mix(colour, uNight > 0.5 ? vec3(0.86, 0.88, 0.92) : vec3(1.0, 0.97, 0.88), disc * step(-0.02, uSun.y));
          // Stars: a few bright points in a grid over the sky, twinkling.
          vec2 grid = vec2(atan(dir.z, dir.x) * 70.0, asin(clamp(up, -1.0, 1.0)) * 70.0);
          vec2 cell = floor(grid);
          float h = hash(cell);
          if (h > 0.985) {
            float d = length(fract(grid) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6);
            float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
            colour += vec3(0.9, 0.92, 1.0) * smoothstep(0.12, 0.0, d) * twinkle * uNight * smoothstep(0.03, 0.25, up) * (1.0 - disc);
          }
          gl_FragColor = vec4(colour, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  group.add(dome);

  // ---- The clouds: one instanced mesh per cloud shape, placed fresh each frame.
  const random = mulberry(7);
  const clouds = [];
  for (let i = 0; i < CLOUDS.count; i++) {
    clouds.push({
      shape: i % 6,
      x: random() * CLOUDS.tile,
      z: random() * CLOUDS.tile,
      y: CLOUDS.height[0] + random() * (CLOUDS.height[1] - CLOUDS.height[0]),
      scale: CLOUDS.scale[0] + random() * (CLOUDS.scale[1] - CLOUDS.scale[0]),
      turn: random() * Math.PI * 2,
    });
  }
  // (Which go first as the sky clears: a share `clouds` of the weather's are out.)
  const order = mulberry(11);
  for (const cloud of clouds) cloud.rank = order();
  const haze = { uHaze: { value: new THREE.Color() }, uHazeRange: { value: new THREE.Vector2(CLOUDS.hazeFrom, CLOUDS.hazeTo) } };
  const cloudMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: 0x000000 });
  // Far-off clouds fade into the haze (the sky's own fog), so none pop in or out.
  cloudMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, haze);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAway;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 cloudWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\nvAway = length(cloudWorld.xz - cameraPosition.xz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHaze; uniform vec2 uHazeRange; varying float vAway;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(uHazeRange.x, uHazeRange.y, vAway));');
  };
  const meshes = [];
  loadModel('clouds').then((model) => {
    if (!model) return;
    for (let shape = 0; shape < 6; shape++) {
      const source = model.getObjectByName(`cloud-${shape + 1}`);
      if (!source?.isMesh) continue;
      const count = clouds.filter((c) => c.shape === shape).length;
      const mesh = new THREE.InstancedMesh(source.geometry, cloudMaterial, count);
      mesh.frustumCulled = false;
      mesh.renderOrder = -1;
      meshes[shape] = mesh;
      group.add(mesh);
    }
  });

  const deep = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const drift = new THREE.Vector2();

  return {
    get visible() {
      return group.visible;
    },
    set visible(on) {
      group.visible = on;
    },
    // Keeps the dome round the camera and the clouds over the player; sets the colours for
    // the time of day (after Daylight has set the fog and the sky light).
    update(camera, time) {
      dome.position.copy(camera.position);
      const { angle, isDay } = skyPath(hour());
      // The sun or moon: rising in the east (+x), setting in the west, a little to the south.
      uniforms.uSun.value.set(Math.cos(angle), Math.sin(angle) * 0.85, 0.3).normalize();
      uniforms.uNight.value = isDay ? 0 : 1;
      uniforms.uTime.value = time;
      uniforms.uHorizon.value.copy(scene.fog.color);
      haze.uHaze.value.copy(scene.fog.color);
      // Clouds are lit through, not just on the sunny side: they glow a little with the sky's
      // own light, so their undersides are soft grey rather than dark.
      cloudMaterial.emissive.copy(ambient.color).multiplyScalar(0.32 * Math.min(1, ambient.intensity / 1.65));
      // Overhead: the sky light's colour, deeper and bluer by day, dark blue at night.
      const sky = weather() ?? { deep: 0.35, clouds: 1, grey: 0, blue: 0 };
      deep.copy(ambient.color).multiplyScalar(0.82).lerp(DAY_DEEP, sky.deep);
      if (isDay && sky.blue > 0) deep.lerp(CLEAR_DEEP, sky.blue * Math.min(1, ambient.intensity / 1.65));
      if (sky.grey > 0) deep.lerp(scene.fog.color, sky.grey);
      uniforms.uZenith.value.copy(deep).lerp(NIGHT_SKY, isDay ? 0 : 0.6);
      uniforms.uSunColor.value.set(isDay ? 0xfff0d0 : 0x8090b0).lerp(new THREE.Color(0xff9a50), isDay ? 1 - THREE.MathUtils.smoothstep(Math.sin(angle), 0.05, 0.4) : 0);

      // Clouds drift on the wind; the square they're scattered over follows the camera, so
      // there are always clouds around you.
      drift.copy(CLOUDS.wind).multiplyScalar(time);
      const counts = [0, 0, 0, 0, 0, 0];
      const half = CLOUDS.tile / 2;
      for (const cloud of clouds) {
        const mesh = meshes[cloud.shape];
        if (!mesh || cloud.rank >= sky.clouds) continue;
        const wrap = (v, centre) => ((((v - centre + half) % CLOUDS.tile) + CLOUDS.tile) % CLOUDS.tile) - half + centre;
        position.set(wrap(cloud.x + drift.x, camera.position.x), cloud.y, wrap(cloud.z + drift.y, camera.position.z));
        quaternion.setFromAxisAngle(up, cloud.turn);
        scale.set(cloud.scale, cloud.scale * 0.8, cloud.scale);
        mesh.setMatrixAt(counts[cloud.shape]++, matrix.compose(position, quaternion, scale));
      }
      meshes.forEach((mesh, shape) => {
        if (!mesh) return;
        mesh.count = counts[shape];
        mesh.instanceMatrix.needsUpdate = true;
      });
    },
  };
}

// A small seeded random number generator (the clouds are the same every game).
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
