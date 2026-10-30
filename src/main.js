import * as THREE from 'three';
import { Campfires, formatFuel, WOOD_TO_BUILD } from './campfires.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { HOTBAR_SIZE, ITEMS, Inventory } from './inventory.js';
import { Player } from './player.js';
import { updateSeeThrough } from './seeThrough.js';
import { Snowfall } from './snow.js';
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

const HAZE = 0xe9dcb8; // warm, golden-hour haze on the horizon
const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, 40, 100);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Lighting: a low, golden late-afternoon sun ---
scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x8a9a5a, 1.7));
const sun = new THREE.DirectionalLight(0xffe2b0, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-35, 45, -8);

// --- Game objects ---
const input = new Input(renderer.domElement);
const world = buildWorld(scene, SEED);
const player = new Player(scene, world.spawn, WORLD_SIZE);
const snow = new Snowfall(scene);
const survival = new Survival();
const inventory = new Inventory();
const campfires = new Campfires(scene, world);
const hud = new Hud({
  onRestart: () => {
    survival.reset();
    inventory.reset();
    world.trees.reset();
    campfires.reset();
    player.reset();
    hud.hideGameOver();
  },
  onSelectSlot: (i) => inventory.select(i),
});

// Works out what the player is doing this frame (drinking, chopping, tending a fire)
// and what to tell them.
function updateActions(dt) {
  if (!survival.alive) return { prompt: null };
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    if (input.wasPressed(`Digit${i + 1}`)) inventory.select(i);
  }

  const held = inventory.selectedItem;
  const canDrink = player.canDrink(world);
  const drinking = canDrink && input.isDown('KeyE');
  const tree = player.treeInReach(world);
  const chopping = tree && held === 'axe' && input.usingTool();
  let prompt = null;
  let progress = null;

  const fire = campfires.near(player.position.x, player.position.z, 1.2);

  if (fire) {
    // Tending a fire: E adds a log.
    const wood = inventory.count('wood');
    if (input.wasPressed('KeyE') && wood > 0 && campfires.addWood(fire)) {
      inventory.remove('wood', 1);
      hud.toast('-1 Wood');
    }
    const status = fire.fuel > 0 ? `Campfire: ${formatFuel(fire.fuel)} left` : 'The fire is out';
    const action = wood > 0 ? (fire.fuel > 0 ? 'E to add wood' : 'E to relight (1 wood)') : 'no wood to add';
    prompt = `${status} · ${action}`;
  } else if (tree && held !== 'axe') {
    prompt = `Press ${inventory.slotOf('axe') + 1} to take out your axe`;
  } else if (tree) {
    prompt = chopping ? 'Chopping…' : 'Hold Space or click to chop';
    progress = world.trees.progress(tree);
  } else if (held === 'wood') {
    // Building: use wood on open ground to make a campfire.
    const spot = player.ahead(1.6);
    if (inventory.count('wood') < WOOD_TO_BUILD) {
      prompt = `You need ${WOOD_TO_BUILD} wood to build a campfire`;
    } else if (!campfires.canBuildAt(spot.x, spot.z)) {
      prompt = 'No room for a campfire here';
    } else if (input.startedUsingTool()) {
      inventory.remove('wood', WOOD_TO_BUILD);
      campfires.build(spot.x, spot.z);
      hud.toast(`-${WOOD_TO_BUILD} Wood`);
    } else {
      prompt = `Space or click to build a campfire (${WOOD_TO_BUILD} wood)`;
    }
  }
  if (chopping && world.trees.chop(tree, dt, player.position.x, player.position.z)) {
    const leftOver = inventory.add('wood', tree.wood);
    hud.toast(`+${tree.wood - leftOver} ${ITEMS.wood.name}`);
    if (leftOver > 0) hud.toast('Inventory full');
  }
  if (canDrink) prompt = drinking ? 'Drinking…' : 'Hold E to drink';

  player.setAction(held, chopping);
  return { drinking, working: chopping, prompt, progress };
}

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

  // Keep the sun's shadow area centred on the player.
  sun.position.copy(cameraTarget).add(SUN_OFFSET);
  sun.target.position.copy(cameraTarget);
}

// --- Main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // avoid huge jumps after a tab switch

  const actions = updateActions(dt);
  survival.update(dt, actions, TIME_SPEED);
  campfires.update(survival.alive ? dt * GAME_MINUTES_PER_SECOND * TIME_SPEED : 0, clock.elapsedTime);
  if (!survival.alive && player.alive) player.die();
  hud.update(survival, inventory, actions);

  player.update(dt, input, world);
  updateCamera(dt);
  world.update(dt, clock.elapsedTime);
  snow.update(dt, clock.elapsedTime, cameraTarget);

  input.endFrame();
  renderer.render(scene, camera);
});
