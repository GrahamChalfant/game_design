import * as THREE from 'three';
import { CHUNK_SIZE, chunkOf, setDrawChunks } from './stream.js';
import { redrawModels } from './models.js';

// The three ways of looking at the game, switched with V:
// - 'top': the usual camera, looking down on the player from above and behind.
// - 'third': over the player's shoulder, looking where the mouse points.
// - 'first': through the player's eyes.
// In the last two, click to capture the mouse (Esc lets it go); moving the mouse turns your
// head, and WASD walks relative to where you're looking. You can see much further, so more
// of the land is drawn in full detail, with a rough version of the rest beyond (farView.js).
export const VIEWS = ['top', 'third', 'first'];
const NAMES = { top: 'Top-down view', third: 'Over-the-shoulder view', first: 'First-person view' };

const LOOK_SPEED = 0.0024; // radians per pixel the mouse moves
const PITCH = [-1.2, 1.0]; // how far you can look down and up (radians)
const EYE = 1.62; // eye height when standing, in meters...
const CROUCHED_EYE = 1.1; // ...and crouched
const SHOULDER = { back: 4.2, up: 1.75, side: 0.55 }; // where the over-the-shoulder camera sits
const NEAR_CHUNKS = 3; // detailed chunks out from the player in these views (2 from above)
const FOG_REACH = 2.6; // the haze is pushed this much further back in these views
const FAR = 650; // meters the camera draws to in these views (300 from above): past the haze on the clearest day

// A sky for looking at the horizon: the haze colour at the horizon (matching the fog, so the
// far land fades into it), deepening to the sky's colour overhead. From above it's never seen.
function createSky(scene, ambient) {
  const uniforms = { uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
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
      fragmentShader: `uniform vec3 uHorizon; uniform vec3 uZenith; varying vec3 vDir;
        void main() {
          float up = normalize(vDir).y;
          gl_FragColor = vec4(mix(uHorizon, uZenith, smoothstep(0.0, 0.5, up)), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.visible = false;
  scene.add(sky);
  return {
    mesh: sky,
    update(camera) {
      sky.position.copy(camera.position);
      uniforms.uHorizon.value.copy(scene.fog.color);
      // Overhead: the sky light's colour, a little deeper and bluer.
      uniforms.uZenith.value.copy(ambient.color).multiplyScalar(0.82).lerp(new THREE.Color(0x6f8fb8), 0.35);
    },
  };
}

export function createViews({ camera, renderer, input, player, world, farView, hud, scene, ambient, start = 'top' }) {
  const sky = createSky(scene, ambient);
  let view = VIEWS.includes(start) ? start : 'top';
  let yaw = player.facing + Math.PI; // 0 looks north (-z), like the top-down camera
  let pitch = -0.08;
  const canvas = renderer.domElement;
  const locked = () => document.pointerLockElement === canvas;
  const lookDir = new THREE.Vector3();
  const pivot = new THREE.Vector3();

  document.addEventListener('mousemove', (e) => {
    if (!locked() || view === 'top') return;
    yaw -= e.movementX * LOOK_SPEED;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * LOOK_SPEED, ...PITCH);
  });
  let panelOpen = false; // (the inventory, map or menu: they need the mouse pointer)
  canvas.addEventListener('pointerdown', () => {
    if (view !== 'top' && !locked() && !panelOpen) canvas.requestPointerLock?.();
  });

  function apply() {
    const looking = view !== 'top';
    setDrawChunks(looking ? NEAR_CHUNKS : 2);
    redrawModels();
    world.drawAround(player.position.x, player.position.z); // (build the newly drawn ground now)
    farView.setAlways(looking);
    camera.far = looking ? FAR : 300;
    camera.fov = view === 'first' ? 70 : view === 'third' ? 60 : 45;
    camera.updateProjectionMatrix();
    player.object.visible = view !== 'first';
    sky.mesh.visible = looking;
    input.yaw = looking ? yaw : 0;
    if (!looking && locked()) document.exitPointerLock();
  }
  apply();

  return {
    get mode() {
      return view;
    },
    // Puts the camera's draw distance and field of view back (after the binoculars).
    restoreCamera() {
      camera.near = 0.1;
      camera.far = view === 'top' ? 300 : FAR;
      camera.fov = view === 'first' ? 70 : view === 'third' ? 60 : 45;
      camera.updateProjectionMatrix();
    },
    // True in the views that look out across the land (third and first person).
    get looking() {
      return view !== 'top';
    },
    cycle() {
      view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
      if (view !== 'top') yaw = player.facing + Math.PI; // start looking the way you face
      apply();
      hud.toast(`${NAMES[view]} (V)${view === 'top' ? '' : ' · click to look around with the mouse'}`);
    },
    // Turns your head to look `yawTo` (0 = north) and `pitchTo` up (radians).
    lookAt(yawTo, pitchTo = pitch) {
      yaw = yawTo;
      pitch = THREE.MathUtils.clamp(pitchTo, ...PITCH);
    },
    // Where to aim (the middle of the screen, while the mouse is captured), in -1..1 screen units.
    aim(pointer) {
      if (view !== 'top' && locked()) return pointer.set(0, 0);
      return pointer.set((input.pointer.x / innerWidth) * 2 - 1, -(input.pointer.y / innerHeight) * 2 + 1);
    },
    // Keeps the rough far view out of the detailed chunks round the player.
    updateFar() {
      if (sky.mesh.visible) sky.update(camera);
      const [cx, cz] = chunkOf(player.position.x, player.position.z);
      const n = view === 'top' ? 2 : NEAR_CHUNKS;
      farView.setNear((cx - n) * CHUNK_SIZE, (cz - n) * CHUNK_SIZE, (cx + n + 1) * CHUNK_SIZE, (cz + n + 1) * CHUNK_SIZE);
    },
    // Lets go of the mouse while a panel (inventory, map, menu) is open, so you can click in it.
    setPanelOpen(open) {
      panelOpen = open;
      if (open && locked()) document.exitPointerLock();
    },
    // Before the player moves: which way "forward" is for WASD.
    beforeMove() {
      input.yaw = view === 'top' ? 0 : yaw;
    },
    // Pushes the haze back (after Daylight sets it), so you can see across the valley.
    widenFog() {
      sky.mesh.visible = view !== 'top' && !player.cave;
      if (!sky.mesh.visible) return;
      scene.fog.far *= FOG_REACH;
      scene.fog.near = scene.fog.far * 0.35;
    },
    // Places the camera for the third- and first-person views. `target` is kept on the
    // player (the shadows and snow follow it).
    place(dt, target) {
      lookDir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const body = player.object.position; // (includes jumps)
      target.lerp(pivot.set(player.position.x, player.standingOn, player.position.z), Math.min(1, dt * 6));
      if (view === 'first') {
        // You face where you look.
        player.facing = yaw + Math.PI;
        player.object.rotation.y = player.facing;
        camera.position.set(body.x, body.y + (player.sneaking ? CROUCHED_EYE : EYE), body.z);
        camera.position.addScaledVector(lookDir.clone().setY(0).normalize(), 0.15);
        camera.lookAt(camera.position.clone().add(lookDir));
        return;
      }
      // Over the shoulder: behind the head and a little to the right, kept above the ground.
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      pivot.set(body.x, body.y + SHOULDER.up, body.z).addScaledVector(right, SHOULDER.side);
      camera.position.copy(pivot).addScaledVector(lookDir, -SHOULDER.back);
      const ground = player.cave ? -Infinity : world.terrain.heightAt(camera.position.x, camera.position.z) + 0.35;
      camera.position.y = Math.max(camera.position.y, ground);
      camera.lookAt(pivot.clone().addScaledVector(lookDir, 12));
    },
  };
}
