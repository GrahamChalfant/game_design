import * as THREE from 'three';
import { CHUNK_SIZE, chunkOf, setDrawChunks } from './stream.js';
import { redrawModels } from './models.js';
import { createSky } from './sky.js';
import { setNearFade } from './seeThrough.js';

// The two ways of looking at the game, switched with V:
// - 'third': over the player's shoulder, looking where the mouse points.
// - 'first': through the player's eyes.
// Click to capture the mouse (Esc lets it go); moving the mouse turns your head, and WASD
// walks relative to where you're looking. The land near you is drawn in full detail, with a
// rough version of the rest beyond (farView.js).
export const VIEWS = ['third', 'first'];
const NAMES = { third: 'Over-the-shoulder view', first: 'First-person view' };

const LOOK_SPEED = 0.0024; // radians per pixel the mouse moves
const PITCH = [-1.2, 1.0]; // how far you can look down and up (radians)
const EYE = 1.62; // eye height when standing, in meters...
const CROUCHED_EYE = 1.1; // ...and crouched
const SHOULDER = { back: 4.2, up: 1.75, side: 0.55 }; // where the over-the-shoulder camera sits
const NEAR_CHUNKS = 3; // detailed chunks out from the player
const FOG_REACH = 2.6; // the haze is pushed this much further back in these views
// How dark sun shadows are (1 = full), how much more sky light, and a little more exposure. From the ground most of what you see is ground, much of it in shade
// under the trees: without these the forest floor is close to black.
const SHADE = { shadow: 0.55, fill: 1.6, exposure: 1.12 };
// How close to the camera trees fade out (dotted, like the see-through hole), so branches don't
// fill the view when you stand under a spruce or the camera backs into one.
const NEAR_FADE = { third: 3.2, first: 0.9 };
// Meters the camera draws to: as far as the haze lets you see (see updateFar), between these.
// On a clear day that's right across the south of the map to the mountains (their crest is
// 1.6 km from the crash).
const FAR = [650, 2600];

// How close to the eye the camera draws: in first person your hands come right up to your face
// (drawing the bow, eating), so nearer than over the shoulder.
const NEAR = { first: 0.03, third: 0.1 };
const SPRINT_FOV = 6; // degrees wider in first person while sprinting

export function createViews({ camera, renderer, input, player, world, farView, hud, scene, ambient, sun, hour, weather, start = 'third' }) {
  const sky = createSky(scene, ambient, hour, weather);
  let view = VIEWS.includes(start) ? start : 'third';
  let yaw = player.facing + Math.PI; // 0 looks north (-z)
  let pitch = -0.08;
  const canvas = renderer.domElement;
  const exposure = renderer.toneMappingExposure; // (as set up in main.js)
  const locked = () => document.pointerLockElement === canvas;
  const lookDir = new THREE.Vector3();
  const pivot = new THREE.Vector3();

  document.addEventListener('mousemove', (e) => {
    if (!locked()) return;
    yaw -= e.movementX * LOOK_SPEED;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * LOOK_SPEED, ...PITCH);
  });
  let panelOpen = false; // (the inventory, map or menu: they need the mouse pointer)
  canvas.addEventListener('pointerdown', () => {
    if (!locked() && !panelOpen) canvas.requestPointerLock?.();
  });

  let eye = EYE; // how high your eyes are now

  function apply() {
    setDrawChunks(NEAR_CHUNKS);
    redrawModels();
    world.drawAround(player.position.x, player.position.z); // (build the newly drawn ground now)
    farView.setAlways(true);
    camera.near = NEAR[view];
    camera.far = FAR[1];
    camera.fov = view === 'first' ? 70 : 60;
    camera.updateProjectionMatrix();
    player.hideFromCamera(view === 'first');
    setNearFade(NEAR_FADE[view]);
    renderer.toneMappingExposure = exposure * SHADE.exposure;
    sky.visible = true;
    input.yaw = yaw;
  }
  apply();

  return {
    get mode() {
      return view;
    },
    // True while the mouse is captured (looking around with it): you aim at the middle of the view.
    get locked() {
      return locked();
    },
    // Puts the camera's draw distance and field of view back (after the binoculars).
    restoreCamera() {
      camera.near = NEAR[view];
      camera.far = FAR[1];
      camera.fov = view === 'first' ? 70 : 60;
      camera.updateProjectionMatrix();
    },
    cycle() {
      view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
      apply();
      hud.toast(`${NAMES[view]} (V) · click to look around with the mouse`);
    },
    // Turns your head to look `yawTo` (0 = north) and `pitchTo` up (radians).
    lookAt(yawTo, pitchTo = pitch) {
      yaw = yawTo;
      pitch = THREE.MathUtils.clamp(pitchTo, ...PITCH);
    },
    // Where to aim (the middle of the screen, while the mouse is captured), in -1..1 screen units.
    aim(pointer) {
      if (locked()) return pointer.set(0, 0);
      return pointer.set((input.pointer.x / innerWidth) * 2 - 1, -(input.pointer.y / innerHeight) * 2 + 1);
    },
    // Keeps the rough far view out of the detailed chunks round the player.
    // (`spotting`: through the binoculars, which set how far the camera draws themselves.)
    updateFar(spotting = false) {
      if (sky.visible) sky.update(camera, performance.now() / 1000);
      farView.detail(camera);
      // Nothing past the haze is worth drawing: on a dull day or at night, that's most of the map.
      const far = THREE.MathUtils.clamp(scene.fog.far, ...FAR);
      if (!spotting && Math.abs(camera.far - far) > 1) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      const [cx, cz] = chunkOf(player.position.x, player.position.z);
      const n = NEAR_CHUNKS;
      farView.setNear((cx - n) * CHUNK_SIZE, (cz - n) * CHUNK_SIZE, (cx + n + 1) * CHUNK_SIZE, (cz + n + 1) * CHUNK_SIZE);
    },
    // Lets go of the mouse while a panel (inventory, map, menu) is open, so you can click in it.
    setPanelOpen(open) {
      panelOpen = open;
      if (open && locked()) document.exitPointerLock();
    },
    // Before the player moves: which way "forward" is for WASD.
    beforeMove() {
      input.yaw = yaw;
    },
    // Pushes the haze back (after Daylight sets it), so you can see across the valley.
    widenFog() {
      sky.visible = !player.cave;
      // From the ground you mostly see the ground, and under the trees most of it is in shade:
      // fill the shade in, so the forest floor isn't near black.
      if (sun) sun.shadow.intensity = sky.visible ? SHADE.shadow : 1;
      if (!sky.visible) return;
      ambient.intensity *= SHADE.fill;
      scene.fog.far *= FOG_REACH;
      scene.fog.near = scene.fog.far * 0.35;
      // ...and then the haze starts close and thickens slowly, so the land fades back in
      // layers, each treeline paler than the one in front.
      scene.fog.far *= 0.5;
      scene.fog.near = scene.fog.far * 0.04;
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
        player.hideFromCamera(true);
        player.object.rotation.y = player.facing;
        // (Crouching, you sink down, and rise again, over a moment rather than at once.)
        eye += ((player.sneaking ? CROUCHED_EYE : EYE) - eye) * (1 - Math.exp(-dt * 9));
        camera.position.set(body.x, body.y + eye, body.z);
        // Sprinting, the view widens a touch (a sense of speed), and settles back as you slow.
        const fov = 70 + (player.sprinting ? SPRINT_FOV : 0);
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 6));
          camera.updateProjectionMatrix();
        }
        camera.position.addScaledVector(lookDir.clone().setY(0).normalize(), 0.15);
        camera.lookAt(camera.position.clone().add(lookDir));
        return;
      }
      // Over the shoulder: behind the head and a little to the right, kept above the ground.
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      pivot.set(body.x, body.y + SHOULDER.up, body.z).addScaledVector(right, SHOULDER.side);
      camera.position.copy(pivot).addScaledVector(lookDir, -SHOULDER.back);
      // Pulled in towards the player if the ground rises in between (down in a ravine, say), so
      // it never looks out from inside a bank.
      if (!player.cave) {
        const want = camera.position.clone();
        for (let k = 1; k <= 10; k++) {
          const at = pivot.clone().lerp(want, k / 10);
          if (world.terrain.heightAt(at.x, at.z) + 0.3 > at.y) {
            camera.position.copy(pivot).lerp(want, Math.max(0.15, (k - 1) / 10));
            break;
          }
        }
      }
      const ground = player.cave ? -Infinity : world.terrain.heightAt(camera.position.x, camera.position.z) + 0.35;
      camera.position.y = Math.max(camera.position.y, ground);
      camera.lookAt(pivot.clone().addScaledVector(lookDir, 12));
    },
  };
}
