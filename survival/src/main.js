import * as THREE from 'three';
import { createActions } from './actions.js';
import { Daylight } from './daylight.js';
import { createPainterlyRenderer } from './painterly.js';
import { Animals } from './animals.js';
import { Arrows } from './arrows.js';
import { Blood } from './blood.js';
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
import { buildLookout } from './lookout.js';
import { buildPois } from './pois.js';
import { AmbientLife } from './ambientLife.js';
import { Sound } from './sounds.js';
import { isNight } from './daylight.js';
import { MapView } from './mapView.js';
import { FarView } from './farView.js';
import { createViews } from './views.js';
import { HandView } from './handView.js';
import { CRASH } from './crashTrail.js';
import { Survival } from './survival.js';
import { buildWorld, WORLD_SIZE } from './world.js';
import { MOUNTAIN_FOOT } from './terrain.js';

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
renderer.toneMappingExposure = 1.05; // (a little muted)
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
const lookout = buildLookout(scene, world);
const mapView = new MapView(world);
// A rough view of the whole map, for the lookout's binoculars (built a little each frame).
const farView = new FarView(scene, world);
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
// You reel back from the hit, and a little blood spatters the ground.
const blood = new Blood(scene, world);
animals.onAttack = (animal, damage) => {
  survival.hurt(damage);
  sound.play('hit');
  sound.play('hurt');
  player.hit(animal.position.x, animal.position.z);
  const away = new THREE.Vector2(player.position.x - animal.position.x, player.position.z - animal.position.z).normalize();
  blood.spill(player.position.x, player.position.z, away.x, away.y);
  hud.flashHurt();
  hud.toast(`The ${animal.kind} gores you! (-${damage} health)`);
};
animals.spawnAll(player.position);
const traps = new Traps(scene, world, animals);
const arrows = new Arrows(scene, world, animals);
// A boar squeals as it charges.
animals.onCharge = (animal) => sound.play('boar-charge', animal.position);
animals.onFlee = (animal) => {
  if (animal.kind === 'deer') sound.play('deer-snort', animal.position);
};
arrows.onKill = (animal) => {
  sound.play('arrow-hit', animal.position);
  blood.splat(animal.position.x, animal.position.z, animal.radius * 0.9);
  hud.toast(`You shot a ${animal.kind}! Hold E next to it to butcher it`);
};
arrows.onHit = (animal) => {
  sound.play('arrow-hit', animal.position);
  blood.splat(animal.position.x, animal.position.z, animal.radius * 0.6);
};
// An arrow that hits nothing comes down in the ground, where you can pick it up again.
arrows.onLand = (x, z) => {
  sound.play('arrow-land', { x, z });
  pickups.drop('arrow', 1, x, z);
};
const pickups = new Pickups(scene, world);
// Abandoned cabins, caves and hunting stands around the map (see pois.js).
const pois = buildPois(scene, world);
// Birds, butterflies and fireflies about the place, and the sounds of it all.
const ambientLife = new AmbientLife(scene, world);
const sound = new Sound();
// What the sounds need to know about where you are.
function updateSound(dt, paused, busy = {}) {
  const { x, z } = player.position;
  const { terrain } = world;
  const fire = campfires.fires.reduce((loudest, f) => {
    if (!campfires.isBurning(f)) return loudest;
    return Math.max(loudest, 1 - Math.hypot(f.x - x, f.z - z) / 9);
  }, 0);
  sound.update(dt, {
    paused,
    night: isNight(survival.hourOfDay),
    underground,
    cold: player.cave ? 0 : terrain.coldAt(x, z),
    lowland: terrain.mountainAt(x, z) <= MOUNTAIN_FOOT, // (no mosquitoes up the mountains)
    water: player.cave ? 0 : terrain.nearWater(x, z, 3) ? 1 : terrain.nearWater(x, z, 12) ? 0.45 : 0,
    fire: player.cave ? 0 : fire,
    woods: Math.min(1, Math.max(0, terrain.forest(x, z) + 0.3)),
    listener: { x, z },
    animals: animals.all,
    cooking: !paused && busy.cooking,
    eating: !paused && busy.eating,
    drinking: !paused && busy.drinking,
    searching: !paused && busy.searching,
    bandaging: !paused && busy.bandaging,
  });
}

// --- Footsteps ---
// A step each time a foot comes down in the walking animation, sounding like whatever's
// underfoot (quieter while sneaking), a thump when you land from a jump, strokes while
// swimming, and a splash as you wade in deep.
// Meters per step or stroke, for swimming and for before player.glb has loaded (a step
// every half of the walk or sneak cycle, at full speed).
const STRIDE = { walk: 1.77, sneak: 1.33, swim: 1.6 };
const GROUND_SOUNDS = { grass: 'grass', rock: 'rock', snow: 'snow', dirt: 'dirt', road: 'dirt', shore: 'gravel', water: 'water' };
let stride = 0;
const lastStep = { x: 0, z: 0 };
let wasAirborne = false;
let wasDeep = false;
function underfoot() {
  const { x, z } = player.position;
  if (player.cave) return 'rock';
  if (world.terrain.waterDepth(x, z) > 0.08) return 'water';
  if (player.standingHeight > 0.05) {
    for (const o of world.obstacles.near(x, z, 0.4)) {
      if (o.top !== undefined && Math.abs(o.top - player.feet) < 0.2 && Math.hypot(o.x - x, o.z - z) < o.radius + 0.3) return o.log ? 'wood' : 'rock';
    }
    return 'wood'; // a floor: a cabin, the tower, a hunting stand
  }
  return GROUND_SOUNDS[world.terrain.groundAt(x, z).kind] ?? 'grass';
}
function updateFootsteps() {
  const { x, z } = player.position;
  const moved = Math.hypot(x - lastStep.x, z - lastStep.z);
  lastStep.x = x;
  lastStep.z = z;
  if (!player.alive || caveMove || moved > 2) return; // (not after a jump to somewhere else)
  const deep = !player.cave && world.terrain.waterDepth(x, z) > 0.6;
  if (deep && !wasDeep) sound.play('splash');
  wasDeep = deep;
  if (wasAirborne && !player.airborne) {
    sound.play('land');
    sound.play(`step-${underfoot()}`, null, 1.3);
    // Off a cliff: a long fall hurts.
    const damage = player.takeFallDamage();
    if (damage > 0) {
      survival.hurt(damage);
      sound.play('hit');
      sound.play('hurt');
      hud.flashHurt();
      hud.toast(`You land hard (-${damage} health)`);
    }
  }
  wasAirborne = player.airborne;
  const footfalls = player.takeFootfalls();
  if (player.airborne) return;
  if (footfalls !== null && !player.swimming) {
    if (footfalls > 0) sound.play(`step-${underfoot()}`, null, player.sneaking ? 0.45 : 1);
    return;
  }
  stride += moved;
  const length = player.swimming ? STRIDE.swim : player.sneaking ? STRIDE.sneak : STRIDE.walk;
  if (stride < length) return;
  stride = 0;
  sound.play(player.swimming ? 'swim' : `step-${underfoot()}`, null, player.sneaking ? 0.45 : 1);
}
// The axe and backpack lie around the wreckage at the start of every game.
const placeStartItems = () => {
  for (const { item, x, z } of START_ITEMS) pickups.drop(item, 1, x, z);
  // Loose stones by the rocks and lake shore. Taken ones come back three days later (see below).
  for (const spot of world.stones) {
    pickups.drop('stone', 1, spot.x, spot.z);
    spot.emptySince = null;
  }
  pois.placeLoose(pickups); // wood stacked by the cabins
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
    blood.reset();
    pickups.reset();
    placeStartItems();
    wreck.reset();
    lookout.reset();
    pois.reset();
    saidAbout.clear();
    mapView.reset();
    if (spotting) stopSpotting();
    player.reset();
    world.drawAround(player.position.x, player.position.z);
    animals.reset(player.position);
    if (hud.inventoryOpen) hud.toggleInventory();
    caveMove = null;
    underground = 0;
    saidDeep = false;
    fade.style.opacity = 0;
    caveDark.style.opacity = 0;
    hud.forgetRecipes();
    hud.hideSpeech();
    warnedDay = 0;
    saidMountainCold = null;
    saidShirtCold = saidHungry = saidThirsty = false;
    hud.hideGameOver();
  },
  onSlotClick: (i) => {
    if (i < HOTBAR_SIZE) inventory.select(i);
  },
  onSlotDrop: (from, to) => inventory.transfer(from, to),
  // Dragged clothes from a slot onto your character: put them on (what you had on takes
  // their place in that slot).
  onWear: (i) => {
    const slot = inventory.slots[i];
    if (!slot || !ITEMS[slot.item].wear) return;
    const old = inventory.outfit;
    inventory.outfit = slot.item;
    inventory.slots[i] = old ? { item: old, count: 1 } : null;
    hud.toast(`You put on the ${ITEMS[slot.item].name.toLowerCase()}`);
    onDressed(slot.item);
  },
  // Dragged your outfit or backpack off the character: onto an empty slot (`to`) to carry the
  // outfit, or off the menu (to null) to leave it on the ground in front of you.
  onUnequip: (kind, to) => {
    if (kind === 'outfit' && to !== null) {
      if (inventory.slots[to] || to >= inventory.usableSlots) return;
      inventory.slots[to] = { item: inventory.outfit, count: 1 };
      inventory.outfit = null;
      return;
    }
    if (player.cave) return hud.toast("Better not leave anything down here");
    const spots = [player.ahead(1.2), player.position];
    const put = (item, extra) => spots.some(({ x, z }) => pickups.drop(item, 1, x, z, extra));
    if (kind === 'outfit') {
      if (put(inventory.outfit)) inventory.outfit = null;
      else hud.toast("You can't drop that in the water");
    } else if (spots.some(({ x, z }) => world.terrain.waterDepth(x, z) === 0)) {
      put('backpack', { contents: inventory.takeOffBackpack() });
      if (inventory.selected >= HOTBAR_SIZE) inventory.select(0);
    } else hud.toast("You can't drop that in the water");
  },
  // Dragged off the menu: drop it in front of the player, or at their feet if that's water.
  onDropItem: (i) => {
    if (player.cave) return hud.toast("Better not leave anything down here");
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
  inventory.burnTorches(minutes);
  const { day } = survival.clock;
  hud.showSleep(`Day ${day} · 0${WAKE_HOUR}:00`);
};
// The point on the ground under the mouse (for aiming the bow), or null if it's off the ground.
const aimRay = new THREE.Raycaster();
const aimNdc = new THREE.Vector2();
const aimPoint = () => {
  views.aim(aimNdc);
  aimRay.setFromCamera(aimNdc, camera);
  return aimRay.intersectObject(world.terrain.ground, true)[0]?.point ?? null;
};
const onDressed = (outfit) => {
  if (outfit === 'jacket') hud.say("That's better. I'll warm up in no time.", 5);
};
const updateActions = createActions({ sfx: (name, at) => sound.play(name, at), input, inventory, player, world, wreck, lookout, pois, campfires, shelters, traps, pickups, bushes, animals, arrows, survival, hud, onSleep: sleep, onBinoculars: () => startSpotting(), onDressed, aimPoint });

// The player says things out loud when they're in trouble, in a speech bubble.
// Each line is said at most once per evening/cold spell.
const DUSK_WARNING_HOUR = 18.5; // a while before sunset at 20:00
let warnedDay = 0; // the last day the dusk warning was given
let saidFreezing = false;
let saidMountainCold = null; // the day the player last remarked on the mountain cold (once a day at most)
let saidShirtCold = false; // said once you come to, in just a shirt
// Running low on food or water: said once each time it drops to a quarter.
const LOW = 25;
let saidHungry = false;
let saidThirsty = false;
const COME_TO_MINUTES = 4; // in-game minutes after the start before you say it (~2 s)
function thinkAloud({ fire, shelter, cold = 0 }) {
  if (!survival.alive) return;
  const warm = fire || shelter;
  if (survival.hunger <= LOW && !saidHungry) {
    saidHungry = true;
    hud.say("My stomach's growling… I need to find something to eat.", 6);
  }
  if (survival.hunger > LOW + 10) saidHungry = false;
  if (survival.thirst <= LOW && !saidThirsty) {
    saidThirsty = true;
    hud.say("I'm so thirsty… I should find some water.", 6);
  }
  if (survival.thirst > LOW + 10) saidThirsty = false;
  if (!saidShirtCold && !inventory.outfit && survival.minutesSurvived > COME_TO_MINUTES) {
    saidShirtCold = true;
    hud.say("Brr… it's cold, and I'm only in a shirt. My jacket must be in my suitcase.", 7);
  }
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
  // Up the mountains: said once a day at most, however often you go up and down.
  if (cold > 0.3 && saidMountainCold !== day) {
    saidMountainCold = day;
    hud.say("The air's bitter up here… I won't last long without warmer clothes.", 6);
  }
}
const speechPoint = new THREE.Vector3();
// What the player says on coming across the first of each kind of place.
const FIRST_SIGHT = {
  cabin: "An old cabin… nobody's lived here for years. Maybe there's something useful inside.",
  cave: "A hole in the hillside… a cave. I'll need a lit torch to go down there.",
  stand: "A hunting stand. From up there, the animals wouldn't notice me.",
  camp: "Someone camped here… a long time ago, by the look of it.",
  leanto: "A trapper's lean-to. They'd have known how to live out here.",
  truck: "An old forest service truck. Rusted solid, but maybe the cab's worth a look.",
};
const saidAbout = new Set();
const SPOTTING_SHOW = 900; // through the binoculars, places this far away are drawn

// --- Caves (see caves.js) ---
// Walking into a cave's hole with a lit torch in hand fades the screen to black and back,
// and you're down in the cave; at the top of its first passage, the same takes you back up.
// Down there it's dark but for your torch, and the view closes in round you.
const CAVE_FADE = 0.4; // seconds to fade out, and the same to fade back in
const CAVE_FOG = [3, 16]; // and you can't see further than this
const BLACK = new THREE.Color(0);
let caveMove = null; // { target: the cave you're going down (or null, going up), t, moved }
let underground = 0; // how far the darkness has closed in: 0 on the surface, 1 down a cave
let noTorchWait = 0; // seconds before you'll say you need a torch again
let saidDeep = false;
const fade = document.getElementById('fade');
const caveDark = document.getElementById('cave-dark');
function updateCaves(dt) {
  noTorchWait = Math.max(0, noTorchWait - dt);
  if (caveMove) {
    caveMove.t += dt;
    if (!caveMove.moved && caveMove.t >= CAVE_FADE) {
      // Fully black: move the player down (or up).
      caveMove.moved = true;
      const { target } = caveMove;
      const spot = target ? target.start : pois.outside(player.cave);
      player.cave = target;
      player.position.set(spot.x, target ? target.floorAt(spot.x, spot.z) : world.terrain.heightAt(spot.x, spot.z), spot.z);
      player.facing = spot.facing;
      player.jumpHeight = player.standingHeight = player.jumpSpeed = 0;
      underground = target ? 1 : 0;
      cameraTarget.copy(player.position);
      world.drawAround(spot.x, spot.z);
      if (target && !saidDeep) {
        saidDeep = true;
        hud.say('It goes deep… I need to keep this torch lit.', 5);
      }
    }
    const t = caveMove.t / CAVE_FADE;
    fade.style.opacity = t < 1 ? t : Math.max(0, 2 - t);
    if (caveMove.t >= CAVE_FADE * 2) caveMove = null;
  } else if (survival.alive) {
    const { x, z } = player.position;
    if (player.cave) {
      if (Math.hypot(player.cave.exit.x - x, player.cave.exit.z - z) < 1) caveMove = { target: null, t: 0, moved: false };
    } else {
      const cave = pois.caveEntranceAt(x, z);
      if (cave && inventory.selectedItem === 'litTorch') caveMove = { target: cave, t: 0, moved: false };
      else if (cave) {
        // Too dark to go in: step back out of the hole.
        const out = pois.outside(cave);
        const dx = x - cave.poi.x || out.x - cave.poi.x;
        const dz = z - cave.poi.z || out.z - cave.poi.z;
        const d = Math.hypot(dx, dz);
        player.position.x = cave.poi.x + (dx / d) * 1.1;
        player.position.z = cave.poi.z + (dz / d) * 1.1;
        if (noTorchWait === 0) {
          noTorchWait = 8;
          hud.say(inventory.count('litTorch') > 0
            ? "It's pitch black down there. I'll hold my torch up first."
            : "It's pitch black down there. I'm not going in without a lit torch.", 5);
        }
      }
    }
  }
  underground += ((player.cave ? 1 : 0) - underground) * Math.min(1, dt * 3);
  caveDark.style.opacity = underground;
}
// Darkens the light and closes in the fog underground (after Daylight has set them).
function darkenUnderground() {
  if (underground < 0.001) return;
  const k = underground;
  sun.intensity *= 1 - k;
  ambient.intensity *= 1 - 0.92 * k;
  // Your torch lights the rock round you brightly (it's all you've got).
  player.torchLight.intensity *= 1 + 1.5 * k;
  player.torchLight.distance = 14 + 6 * k;
  scene.background.lerp(BLACK, k);
  scene.fog.color.copy(scene.background);
  scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, CAVE_FOG[0], k);
  scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, CAVE_FOG[1], k);
}

// The compass strip (#94): which way the player faces, and which way the crash is. Bearings
// are degrees clockwise from north, and north is -z (up the screen).
const bearing = (dx, dz) => (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360;
function updateCompass() {
  const { x, z } = player.position;
  hud.updateCompass(
    inventory.count('compass') > 0,
    bearing(Math.sin(player.facing), Math.cos(player.facing)),
    bearing(CRASH.x - x, CRASH.z - z),
    Math.hypot(CRASH.x - x, CRASH.z - z),
  );
}

// --- The camera: over the shoulder or first person (V switches; see views.js) ---
// Add ?view=first to the URL to start in first person.
const views = createViews({ camera, renderer, input, player, world, farView, hud, scene, ambient, sun, hour: () => survival.hourOfDay, start: new URLSearchParams(location.search).get('view') });
// Your hands and what's in them, in the first-person view (see handView.js).
const hands = new HandView(camera, scene);

// Where the camera looks (on the player; the shadows and snow follow it).
const cameraTarget = player.position.clone();
let shownZoom = 240; // (the binoculars' pull-back, easing to where it should be)

// --- Looking through the lookout's binoculars: the camera pulls way back ---
// WASD looks around, scrolling zooms, and E or Esc stops.
const SPOTTING = {
  zoom: [100, 450], // how far back the camera can be, in meters
  startZoom: 240,
  startAhead: 120, // the view starts this far out, the way the binoculars face
  angle: THREE.MathUtils.degToRad(62), // looking down a little more steeply
  reach: 650, // how far from the tower you can look
  far: 3000, // how far the camera draws (it's normally 300)
};
let spotting = null; // { target, zoom } while looking through them
const stillInput = { moveAxis: () => ({ x: 0, z: 0 }), wasPressed: () => false, isDown: () => false };
function startSpotting() {
  const { look } = lookout;
  const x = lookout.x + look.x * SPOTTING.startAhead;
  const z = lookout.z + look.z * SPOTTING.startAhead;
  spotting = { target: new THREE.Vector3(x, world.terrain.heightAt(x, z), z), zoom: SPOTTING.startZoom };
  farView.show(true);
  camera.near = 1;
  camera.far = SPOTTING.far;
  camera.updateProjectionMatrix();
}
function stopSpotting() {
  spotting = null;
  farView.show(false);
  views.restoreCamera();
}
function updateSpottingCamera(dt) {
  spotting.zoom = THREE.MathUtils.clamp(spotting.zoom * (1 + input.scroll * 0.001), ...SPOTTING.zoom);
  // Pan faster the further out you are, so it feels the same at any zoom.
  const { x, z } = input.moveAxis();
  const t = spotting.target;
  t.x += x * spotting.zoom * 0.8 * dt;
  t.z += z * spotting.zoom * 0.8 * dt;
  const out = Math.hypot(t.x - lookout.x, t.z - lookout.z);
  if (out > SPOTTING.reach) {
    t.x = lookout.x + ((t.x - lookout.x) / out) * SPOTTING.reach;
    t.z = lookout.z + ((t.z - lookout.z) / out) * SPOTTING.reach;
  }
  t.y = world.terrain.heightAt(t.x, t.z);
  shownZoom += (spotting.zoom - shownZoom) * Math.min(1, dt * 3);
  cameraTarget.lerp(t, Math.min(1, dt * 3));
  camera.position.set(
    cameraTarget.x,
    cameraTarget.y + Math.sin(SPOTTING.angle) * shownZoom,
    cameraTarget.z + Math.cos(SPOTTING.angle) * shownZoom,
  );
  camera.lookAt(cameraTarget);
  lookout.update(dt, null); // (nothing is in the way of the view)
  pois.update(dt, null, 0, spotting.target, SPOTTING_SHOW); // far-off cabins and stands show too
}

function updateCamera(dt) {
  if (spotting) return updateSpottingCamera(dt);
  views.place(dt, cameraTarget);
  camera.updateMatrixWorld();
  hands.update(dt, views.mode === 'first' && !spotting, inventory.selectedItem, inventory.outfit, player);
  // Fade whatever part of a building is between the camera and the player.
  lookout.update(dt, camera, player.feet, player.position);
  const found = pois.update(dt, camera, player.feet, player.position, undefined, player.cave);
  if (found && !saidAbout.has(found.kind)) {
    saidAbout.add(found.kind);
    hud.say(FIRST_SIGHT[found.kind], 6);
  }

  // Keep the player visible through any trees in the way.
  updateSeeThrough(camera, renderer, player.position.clone().setY(player.feet + 1));

}

const painter = PAINTERLY ? createPainterlyRenderer(renderer, scene, camera) : null;
const draw = () => {
  views.updateFar();
  if (painter) painter.render();
  else renderer.render(scene, camera);
};

// --- Main loop ---
const clock = new THREE.Clock();
let stoneCheckTimer = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // avoid huge jumps after a tab switch

  // Menus and panels.
  // Esc closes the map first, then the inventory, then opens or closes the pause menu.
  if (input.wasPressed('Escape')) {
    if (spotting) stopSpotting();
    else if (mapView.isOpen) mapView.close();
    else hud.escape();
  }
  views.setPanelOpen(hud.menuOpen || hud.inventoryOpen || mapView.isOpen);
  if (hud.menuOpen) {
    // Paused: keep drawing the scene, but nothing moves or uses up time.
    hud.update(survival, inventory, { prompt: null });
    updateCamera(dt);
    world.update(0, clock.elapsedTime, player.position); // keeps the scenery around the player drawn
    pickups.update(clock.elapsedTime, player.position.x, player.position.z);
    daylight.update(survival.hourOfDay, cameraTarget);
    views.widenFog();
    darkenUnderground();
    updateSound(dt, true);
    input.endFrame();
    draw();
    return;
  }
  if (input.wasPressed('Tab') || input.wasPressed('KeyI')) {
    hud.toggleInventory();
    if (hud.inventoryOpen) characterView.faceForward();
  }
  if (hud.inventoryOpen) characterView.update(dt, inventory.hasBackpack, inventory.outfit);

  if (input.wasPressed('KeyV') && !spotting) views.cycle();
  if (input.wasPressed('KeyN')) hud.toast(sound.toggleMute() ? 'Sound off (N)' : 'Sound on (N)');
  if (input.wasPressed('KeyM')) {
    if (inventory.count('map') > 0) mapView.toggle();
    else hud.toast("You don't have a map");
  }
  // Looking through the binoculars, the player stands still; E stops.
  // (On the frame you stop, E mustn't also count as pressing E at the binoculars again.)
  const stopped = spotting && (input.wasPressed('KeyE') || !survival.alive);
  if (stopped) stopSpotting();
  const actions = spotting || stopped
    ? {
        prompt: 'Binoculars · WASD to look around · scroll to zoom · E to stop',
        cold: world.terrain.coldAt(player.position.x, player.position.z),
        outfit: inventory.outfit,
      }
    : updateActions(dt);
  player.wear(inventory.outfit);
  // Lit torches burn down, whether they're in your hand or not.
  if (survival.alive && inventory.burnTorches(dt * survival.clockSpeed * TIME_SPEED) > 0) hud.toast('Your torch burned out');
  survival.update(dt, actions, TIME_SPEED);
  thinkAloud(actions);
  campfires.update(survival.alive ? dt * survival.clockSpeed * TIME_SPEED : 0, clock.elapsedTime);
  if (!survival.alive && player.alive) player.die();
  hud.update(survival, inventory, actions);
  updateCompass();
  mapView.explore(player.position.x, player.position.z);
  mapView.update(inventory.count('map') > 0);
  mapView.draw({ player, lookout, pois: world.pois, roads: world.roads, creeks: world.creeks, campfires, shelters });
  // Keep the speech bubble above the player's head.
  speechPoint.copy(player.position).setY(player.feet + 2.1).project(camera);
  hud.placeSpeech((speechPoint.x * 0.5 + 0.5) * innerWidth, (-speechPoint.y * 0.5 + 0.5) * innerHeight);

  updateCaves(dt);
  views.beforeMove();
  player.update(dt, spotting || caveMove ? stillInput : input, world);
  updateFootsteps();
  updateCamera(dt);
  farView.update();
  world.update(dt, clock.elapsedTime, player.position);
  // Up a hunting stand, animals don't notice you, as if you were sneaking. (While you're down
  // a cave, they wait for you.)
  if (!player.cave) animals.update(dt, player.position, player.sneaking || pois.upAStand(player.position.x, player.position.z, player.feet));
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
  blood.update(dt);
  ambientLife.update(dt, survival.hourOfDay, player.position, Boolean(player.cave));
  updateSound(dt, !survival.alive, actions);
  snow.update(dt, clock.elapsedTime, !spotting ? camera.position : cameraTarget, { close: !spotting, roofs: world.structures, cave: Boolean(player.cave) });
  // Move the sun/moon for the time of day, keeping its shadows centred on the player.
  daylight.update(survival.hourOfDay, cameraTarget);
  views.widenFog();
  darkenUnderground();
  // Through the binoculars you can see a long way: push the haze right back.
  if (spotting) {
    scene.fog.near = 600;
    scene.fog.far = 2200;
  }

  input.endFrame();
  draw();
});
