import * as THREE from 'three';
import { createActions } from './actions.js';
import { Daylight } from './daylight.js';
import { createPainterlyRenderer } from './painterly.js';
import { Animals } from './animals.js';
import { Arrows } from './arrows.js';
import { respawnStones } from './hunting.js';
import { Campfires } from './campfires.js';
import { Shelters } from './shelters.js';
import { CharacterView } from './characterView.js';
import { craft } from './crafting.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { HOTBAR_SIZE, ITEMS, Inventory } from './inventory.js';
import { Pickups } from './pickups.js';
import { Bushes } from './bushes.js';
import { createRandom } from './random.js';
import { Player } from './player.js';
import { updateSeeThrough } from './seeThrough.js';
import { Snowfall } from './snow.js';
import { Traps } from './traps.js';
import { buildWreck, START_ITEMS } from './wreck.js';
import { GAME_MINUTES_PER_SECOND, Survival } from './survival.js';
import { buildWorld, WORLD_SIZE } from './world.js';

// Each game grows a new map from a random seed. Add ?seed=1234 to the address to play (or
// share) a particular map: the same seed always gives the same map.
const SEED = parseInt(new URLSearchParams(location.search).get('seed'), 10) || newSeed();
function newSeed() {
  return 1 + Math.floor(Math.random() * 999999);
}
// Starts a new game on a fresh map (reloads the page with a new seed in the address).
function playNewMap() {
  const url = new URL(location.href);
  url.searchParams.set('seed', newSeed());
  location.href = url;
}
// Add ?speed=20 to the URL to make time pass 20x faster (handy for testing hunger and thirst).
const TIME_SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;
// Add ?classic to the URL to turn off the painterly filter (e.g. to compare, or on a slow computer).
const PAINTERLY = !new URLSearchParams(location.search).has('classic');

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
const wreck = buildWreck(scene, world);
// Start south of the crashed plane, facing it (north) but just out of sight of it.
const player = new Player(scene, world.spawn, WORLD_SIZE, Math.PI);
const snow = new Snowfall(scene);
const daylight = new Daylight(scene, sun, ambient, snow);
const survival = new Survival();
const inventory = new Inventory();
const campfires = new Campfires(scene, world);
const shelters = new Shelters(scene, world);
// Berry bushes first, so animals don't spawn inside them.
const bushes = new Bushes(scene, world, createRandom(SEED + 3));
const animals = new Animals(scene, world, SEED + 2);
// A charging boar gores the player (#76).
animals.onAttack = (animal, damage) => {
  survival.hurt(damage);
  hud.toast(`The ${animal.kind} gores you! (-${damage} health)`);
};
animals.spawnAll(player.position);
const traps = new Traps(scene, world, animals);
const arrows = new Arrows(scene, world, animals);
arrows.onKill = (animal) => hud.toast(`You shot a ${animal.kind}! Hold E next to it to butcher it`);
const pickups = new Pickups(scene, world);
// The axe and backpack lie around the wreckage at the start of every game.
const placeStartItems = () => {
  for (const { item, x, z } of START_ITEMS) pickups.drop(item, 1, x, z);
  // Loose stones by the rocks and lake shore. Taken ones come back three days later (see below).
  for (const spot of world.stones) {
    pickups.drop('stone', 1, spot.x, spot.z);
    spot.emptySince = null;
  }
};
placeStartItems();
const hud = new Hud({
  seed: SEED,
  onNewMap: playNewMap,
  onRestart: () => {
    survival.reset();
    inventory.reset();
    world.trees.reset();
    campfires.reset();
    shelters.reset();
    traps.reset();
    bushes.reset();
    arrows.reset();
    pickups.reset();
    placeStartItems();
    wreck.reset();
    player.reset();
    world.drawAround(player.position.x, player.position.z);
    animals.reset(player.position);
    if (hud.inventoryOpen) hud.toggleInventory();
    hud.forgetRecipes();
    hud.hideSpeech();
    warnedDay = 0;
    hud.hideGameOver();
  },
  onSlotClick: (i) => {
    if (i < HOTBAR_SIZE) inventory.select(i);
  },
  onSlotDrop: (from, to) => inventory.transfer(from, to),
  // Dragged off the menu: drop it in front of the player, or at their feet if that's water.
  onDropItem: (i) => {
    const { item, count } = inventory.slots[i];
    const { x, z } = player.ahead(1.2);
    if (pickups.drop(item, count, x, z) || pickups.drop(item, count, player.position.x, player.position.z)) {
      inventory.slots[i] = null;
    } else {
      hud.toast("You can't drop that in the water");
    }
  },
  onCraft: (recipe) => {
    if (craft(inventory, recipe)) hud.toast(`+${recipe.count} ${ITEMS[recipe.item].name}`);
    else hud.toast('No room in your inventory');
  },
});
const characterView = new CharacterView(document.getElementById('character-view'));
// Sleeping in a shelter: the screen fades out, and you wake at 06:00 with your stats
// unchanged. Campfires keep burning through the night, so they may be out by morning.
const WAKE_HOUR = 6;
const sleep = () => {
  const minutes = survival.sleepUntil(WAKE_HOUR);
  campfires.update(minutes, clock.elapsedTime);
  const { day } = survival.clock;
  hud.showSleep(`Day ${day} · 0${WAKE_HOUR}:00`);
};
// The point on the ground under the mouse (for aiming the bow), or null if it's off the ground.
const aimRay = new THREE.Raycaster();
const aimNdc = new THREE.Vector2();
const aimPoint = () => {
  aimNdc.set((input.pointer.x / innerWidth) * 2 - 1, -(input.pointer.y / innerHeight) * 2 + 1);
  aimRay.setFromCamera(aimNdc, camera);
  return aimRay.intersectObject(world.terrain.ground, true)[0]?.point ?? null;
};
const updateActions = createActions({ input, inventory, player, world, wreck, campfires, shelters, traps, pickups, bushes, animals, arrows, survival, hud, onSleep: sleep, aimPoint });

// The player says things out loud when they're in trouble, in a speech bubble.
// Each line is said at most once per evening/cold spell.
const DUSK_WARNING_HOUR = 18.5; // a while before sunset at 20:00
let warnedDay = 0; // the last day the dusk warning was given
let saidFreezing = false;
let saidMountainCold = false; // said again each time you head back up
function thinkAloud({ fire, shelter, cold = 0 }) {
  if (!survival.alive) return;
  const warm = fire || shelter;
  const { day } = survival.clock;
  const hour = survival.hourOfDay;
  if (hour >= DUSK_WARNING_HOUR && hour < 21 && warnedDay !== day && !warm) {
    warnedDay = day;
    hud.say("It's getting cold… maybe I should build a fire.", 6);
  }
  if (survival.isFreezing && !warm && !saidFreezing) {
    saidFreezing = true;
    hud.say("I'm freezing… I need a fire or some shelter.", 6);
  }
  if (!survival.isFreezing) saidFreezing = false;
  if (cold > 0.3 && !saidMountainCold) {
    saidMountainCold = true;
    hud.say("The air's bitter up here… I won't last long without warmer clothes.", 6);
  }
  if (cold === 0) saidMountainCold = false;
}
const speechPoint = new THREE.Vector3();

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

const painter = PAINTERLY ? createPainterlyRenderer(renderer, scene, camera) : null;
const draw = () => (painter ? painter.render() : renderer.render(scene, camera));

// --- Main loop ---
const clock = new THREE.Clock();
let stoneCheckTimer = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // avoid huge jumps after a tab switch

  // Menus and panels.
  if (input.wasPressed('Escape')) hud.escape();
  if (hud.menuOpen) {
    // Paused: keep drawing the scene, but nothing moves or uses up time.
    hud.update(survival, inventory, { prompt: null });
    updateCamera(dt);
    world.update(0, clock.elapsedTime, player.position); // keeps the scenery around the player drawn
    pickups.update(clock.elapsedTime, player.position.x, player.position.z);
    daylight.update(survival.hourOfDay, cameraTarget);
    input.endFrame();
    draw();
    return;
  }
  if (input.wasPressed('Tab') || input.wasPressed('KeyI')) {
    hud.toggleInventory();
    if (hud.inventoryOpen) characterView.faceForward();
  }
  if (hud.inventoryOpen) characterView.update(dt, inventory.hasBackpack);

  const actions = updateActions(dt);
  survival.update(dt, actions, TIME_SPEED);
  thinkAloud(actions);
  campfires.update(survival.alive ? dt * GAME_MINUTES_PER_SECOND * TIME_SPEED : 0, clock.elapsedTime);
  if (!survival.alive && player.alive) player.die();
  hud.update(survival, inventory, actions);
  // Keep the speech bubble above the player's head.
  speechPoint.copy(player.position).setY(player.position.y + 2.1).project(camera);
  hud.placeSpeech((speechPoint.x * 0.5 + 0.5) * innerWidth, (-speechPoint.y * 0.5 + 0.5) * innerHeight);

  player.update(dt, input, world);
  updateCamera(dt);
  world.update(dt, clock.elapsedTime, player.position);
  animals.update(dt, player.position, player.sneaking);
  arrows.update(dt);
  traps.update();
  bushes.update(survival.minutesSurvived);
  pickups.update(clock.elapsedTime, player.position.x, player.position.z);
  // Stones take days to come back, so once a second is plenty (there are thousands of spots).
  stoneCheckTimer -= dt;
  if (stoneCheckTimer <= 0) {
    stoneCheckTimer = 1;
    respawnStones(
      world.stones,
      survival.minutesSurvived,
      (x, z) => pickups.find('stone', x, z, 0.3) !== null,
      (spot) => pickups.drop('stone', 1, spot.x, spot.z),
      player.position,
    );
  }
  wreck.update(dt);
  snow.update(dt, clock.elapsedTime, cameraTarget);
  // Move the sun/moon for the time of day, keeping its shadows centred on the player.
  daylight.update(survival.hourOfDay, cameraTarget);

  input.endFrame();
  draw();
});
