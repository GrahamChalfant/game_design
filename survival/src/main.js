import * as THREE from 'three';
import { createActions } from './actions.js';
import { Daylight } from './daylight.js';
import { Animals } from './animals.js';
import { Campfires } from './campfires.js';
import { craft } from './crafting.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { HOTBAR_SIZE, ITEMS, Inventory } from './inventory.js';
import { Pickups } from './pickups.js';
import { Player } from './player.js';
import { updateSeeThrough } from './seeThrough.js';
import { Snowfall } from './snow.js';
import { Traps } from './traps.js';
import { GAME_MINUTES_PER_SECOND, Survival } from './survival.js';
import { buildWorld, WORLD_SIZE } from './world.js';

// Change this number for a different map. Later, a daily challenge can use the date.
const SEED = 20261030;
// Add ?speed=20 to the URL to make time pass 20x faster (handy for testing hunger and thirst).
const TIME_SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

// --- Renderer, scene, camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

// The sky, fog and light colours are set by Daylight (src/daylight.js) as the day goes on.
const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 40, 100);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Lighting: ambient light from the sky, plus the sun (or moon) ---
const ambient = new THREE.HemisphereLight();
scene.add(ambient);
const sun = new THREE.DirectionalLight();
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
sun.shadow.intensity = 0.8; // shadows let a little light through, so shady areas aren't too dark
Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
scene.add(sun, sun.target);

// --- Game objects ---
const input = new Input(renderer.domElement);
const world = buildWorld(scene, SEED);
const player = new Player(scene, world.spawn, WORLD_SIZE);
const snow = new Snowfall(scene);
const daylight = new Daylight(scene, sun, ambient, snow);
const survival = new Survival();
const inventory = new Inventory();
const campfires = new Campfires(scene, world);
const animals = new Animals(scene, world, SEED + 2);
animals.spawnAll(player.position);
const traps = new Traps(scene, world, animals);
const pickups = new Pickups(scene, world);
const hud = new Hud({
  onRestart: () => {
    survival.reset();
    inventory.reset();
    world.trees.reset();
    campfires.reset();
    traps.reset();
    pickups.reset();
    player.reset();
    animals.reset(player.position);
    hud.hideGameOver();
  },
  // With the backpack open, clicking a slot moves its items between the backpack and
  // the hotbar; otherwise clicking a hotbar slot selects it.
  onSlotClick: (i) => {
    if (hud.backpackOpen) {
      if (!inventory.move(i)) hud.toast('No room');
    } else if (i < HOTBAR_SIZE) {
      inventory.select(i);
    }
  },
  onCraft: (recipe) => {
    if (craft(inventory, recipe)) hud.toast(`+${recipe.count} ${ITEMS[recipe.item].name}`);
    else hud.toast('No room in your inventory');
  },
});
const updateActions = createActions({ input, inventory, player, world, campfires, traps, pickups, survival, hud });

// --- Top-down camera that follows the player ---
let zoom = 20; // distance from the player
const CAMERA_ANGLE = THREE.MathUtils.degToRad(55); // 90 = straight down
const cameraTarget = player.position.clone();

function updateCamera(dt) {
  zoom = THREE.MathUtils.clamp(zoom + input.scroll * 0.02, 8, 40);
  cameraTarget.lerp(player.position, Math.min(1, dt * 6));
  camera.position.set(
    cameraTarget.x,
    cameraTarget.y + Math.sin(CAMERA_ANGLE) * zoom,
    cameraTarget.z + Math.cos(CAMERA_ANGLE) * zoom,
  );
  camera.lookAt(cameraTarget);

  // Keep the player visible through any trees in the way.
  updateSeeThrough(camera, renderer, player.position.clone().setY(player.position.y + 1));

}

// --- Main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // avoid huge jumps after a tab switch

  // Menus and panels.
  if (input.wasPressed('Escape')) hud.escape();
  if (hud.menuOpen) {
    // Paused: keep drawing the scene, but nothing moves or uses up time.
    hud.update(survival, inventory, { prompt: null });
    updateCamera(dt);
    daylight.update(survival.hourOfDay, cameraTarget);
    input.endFrame();
    renderer.render(scene, camera);
    return;
  }
  if (input.wasPressed('KeyC')) hud.toggleCrafting();
  if (input.wasPressed('Tab') || input.wasPressed('KeyI')) hud.toggleBackpack();

  const actions = updateActions(dt);
  survival.update(dt, actions, TIME_SPEED);
  campfires.update(survival.alive ? dt * GAME_MINUTES_PER_SECOND * TIME_SPEED : 0, clock.elapsedTime);
  if (!survival.alive && player.alive) player.die();
  hud.update(survival, inventory, actions);

  player.update(dt, input, world);
  updateCamera(dt);
  world.update(dt, clock.elapsedTime);
  animals.update(dt, player.position, player.sneaking);
  traps.update();
  pickups.update(clock.elapsedTime);
  snow.update(dt, clock.elapsedTime, cameraTarget);
  // Move the sun/moon for the time of day, keeping its shadows centred on the player.
  daylight.update(survival.hourOfDay, cameraTarget);

  input.endFrame();
  renderer.render(scene, camera);
});
