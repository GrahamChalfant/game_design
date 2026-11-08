import * as THREE from 'three';
import { CHUNK_SIZE, chunkOf, setDrawChunks } from './stream.js';
import { redrawModels } from './models.js';
import { createSky } from './sky.js';
import { setNearFade } from './seeThrough.js';

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
// In these views: how dark sun shadows are (1 = as from above), how much more sky light, and a
// little more exposure. From the ground most of what you see is ground, much of it in shade
// under the trees: without these the forest floor is close to black.
const SHADE = { shadow: 0.55, fill: 1.6, exposure: 1.12 };
// How close to the camera trees fade out (dotted, like the see-through hole), so branches don't
// fill the view when you stand under a spruce or the camera backs into one.
const NEAR_FADE = { top: 0, third: 3.2, first: 0.9 };
const FAR = 650; // meters the camera draws to in these views (300 from above): past the haze on the clearest day

export function createViews({ camera, renderer, input, player, world, farView, hud, scene, ambient, sun, hour, start = 'top' }) {
  const sky = createSky(scene, ambient, hour);
  let view = VIEWS.includes(start) ? start : 'top';
  let yaw = player.facing + Math.PI; // 0 looks north (-z), like the top-down camera
  let pitch = -0.08;
  const canvas = renderer.domElement;
  const exposure = renderer.toneMappingExposure; // (as set up for the view from above)
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
    player.hideFromCamera(view === 'first');
    setNearFade(NEAR_FADE[view]);
    renderer.toneMappingExposure = exposure * (looking ? SHADE.exposure : 1);
    sky.visible = looking;
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
      if (sky.visible) sky.update(camera, performance.now() / 1000);
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
      sky.visible = view !== 'top' && !player.cave;
      // From the ground you mostly see the ground, and under the trees most of it is in shade:
      // fill the shade in more than from above, so the forest floor isn't near black.
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
