import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// Fuel is measured in in-game minutes of burning.
const START_FUEL = 6 * 60; // a new fire has wood for 6 in-game hours (it needs lighting first)...
const FUEL_PER_WOOD = 2 * 60; // ...and each extra log adds 2 hours
const FUEL_PER_STICK = 30; // ...or a stick, half an hour
const MAX_FUEL = 16 * 60;
const RADIUS = 0.7; // the player can't walk through a fire
// Meat on a spit over a burning fire: cooked after COOK_TIME real seconds, burnt by BURN_TIME.
export const COOK_TIME = 30;
export const BURN_TIME = 60;
const CHARRING = 45; // from here on it darkens toward burnt (take it off!)
// The meat's colour as it cooks (multiplying the model's pale flesh).
const RAW = new THREE.Color(0xd2605e);
const COOKED = new THREE.Color(0x9a5a2e);
const BURNT = new THREE.Color(0x2e231d);
const TURN_SPEED = 0.5; // radians a second the meat turns on the skewer

// The spit model (spit.glb: the forked sticks and skewer, and "spit-meat"), loaded once.
let spitModel = null;
const spitLoaded = () => (spitModel ??= loadModel('spit'));
spitLoaded();

// What meat that's been cooking for `seconds` comes off the spit as.
export function meatAfter(seconds) {
  return seconds >= BURN_TIME ? 'burntMeat' : seconds >= COOK_TIME ? 'cookedMeat' : 'rawMeat';
}

// Campfires the player has built: placing them, burning fuel, flames and firelight.
export class Campfires {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.fires = [];
  }

  // True if there's room for a fire at (x, z): dry ground, nothing in the way.
  canBuildAt(x, z) {
    return (
      this.world.terrain.waterDepth(x, z) === 0 &&
      this.world.obstacles.isClear(x, z, RADIUS + 0.2)
    );
  }

  build(x, z) {
    const object = new THREE.Group();
    object.position.set(x, this.world.terrain.heightAt(x, z), z);

    const pit = new THREE.Group();
    pit.add(placeholders.campfire());
    loadModel('campfire').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = child.receiveShadow = true));
      pit.clear();
      pit.add(model);
    });

    const flames = placeholders.flames();
    flames.position.y = 0.15;
    const light = new THREE.PointLight(0xff9a3c, 0, 12, 1.6);
    light.position.y = 0.9;
    object.add(pit, flames, light);
    this.scene.add(object);

    this.world.grass.clear(x, z, RADIUS + 0.5);
    const obstacle = { x, z, radius: RADIUS };
    this.world.obstacles.add(obstacle);
    const fire = { x, z, fuel: START_FUEL, lit: false, object, pit, flames, light, obstacle, flicker: Math.random() * 100 };
    this.fires.push(fire);
    return fire;
  }

  // The fire nearest to (x, z), if one is within `reach` of its edge.
  near(x, z, reach) {
    let best = null;
    let bestDistance = Infinity;
    for (const fire of this.fires) {
      const distance = Math.hypot(fire.x - x, fire.z - z) - RADIUS;
      if (distance < reach && distance < bestDistance) {
        best = fire;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Sets a spit up over the fire, its skewer running across `facing` (the way the player looks).
  addSpit(fire, facing) {
    const object = new THREE.Group();
    object.rotation.y = facing;
    fire.object.add(object);
    fire.spit = { object, meat: null, meatMesh: null };
    spitLoaded().then((model) => {
      if (!model || !fire.spit) return;
      const copy = model.clone(true);
      copy.traverse((child) => (child.castShadow = child.receiveShadow = true));
      const meat = copy.getObjectByName('spit-meat');
      if (meat) {
        // (Its own material, so each spit's meat can be its own colour.)
        meat.traverse((child) => {
          if (child.isMesh) child.material = child.material.clone();
        });
        meat.visible = Boolean(fire.spit.meat);
      }
      fire.spit.meatMesh = meat;
      object.add(copy);
    });
  }

  // Puts a piece of raw meat on the fire's spit.
  putMeat(fire) {
    fire.spit.meat = { cooked: 0 };
  }

  // Takes the meat off the fire's spit: returns what it's become (rawMeat, cookedMeat or burntMeat).
  takeMeat(fire) {
    const { cooked } = fire.spit.meat;
    fire.spit.meat = null;
    return meatAfter(cooked);
  }

  // How loud the sizzle of meat cooking is at (x, z): 0 to 1.
  sizzleAt(x, z) {
    let loudest = 0;
    for (const fire of this.fires) {
      if (!fire.spit?.meat || !this.isBurning(fire)) continue;
      loudest = Math.max(loudest, 1 - Math.hypot(fire.x - x, fire.z - z) / 9);
    }
    return loudest;
  }

  isBurning(fire) {
    return fire.lit && fire.fuel > 0;
  }

  // Lighting needs wood in the fire (and a lighter, which the caller checks).
  light(fire) {
    if (fire.fuel > 0) fire.lit = true;
  }

  // Adds one log (`fuel` 'wood') or stick ('stick'). Returns false if the fire is already as
  // big as it gets.
  addWood(fire, fuel = 'wood') {
    const amount = fuel === 'stick' ? FUEL_PER_STICK : FUEL_PER_WOOD;
    if (fire.fuel > MAX_FUEL - amount) return false;
    fire.fuel = Math.max(fire.fuel, 0) + amount;
    return true;
  }

  // `gameMinutes` is how much in-game time passed this frame; `time` is for animation (and the
  // real seconds since last time cook the meat on spits).
  update(gameMinutes, time) {
    const seconds = Math.min(0.25, Math.max(0, time - (this.lastTime ?? time)));
    this.lastTime = time;
    for (const fire of this.fires) {
      // Meat on the spit cooks while the fire burns. (Left on through a night's sleep, it burns.)
      const meat = fire.spit?.meat;
      if (meat && this.isBurning(fire)) {
        meat.cooked += seconds;
        if (gameMinutes > 30) meat.cooked = BURN_TIME;
      }
      const meatMesh = fire.spit?.meatMesh;
      if (meatMesh) {
        meatMesh.visible = Boolean(meat);
        if (meat) {
          if (this.isBurning(fire)) meatMesh.rotation.x += seconds * TURN_SPEED;
          const colour = meat.cooked < COOK_TIME
            ? RAW.clone().lerp(COOKED, meat.cooked / COOK_TIME)
            : COOKED.clone().lerp(BURNT, Math.min(1, Math.max(0, (meat.cooked - CHARRING) / (BURN_TIME - CHARRING))));
          meatMesh.traverse((child) => child.isMesh && child.material.color.copy(colour));
        }
      }
      if (fire.lit) fire.fuel = Math.max(0, fire.fuel - gameMinutes);
      // Once the wood runs out the fire goes out, and needs lighting again.
      if (fire.fuel === 0) fire.lit = false;
      const burning = this.isBurning(fire);
      // Fires shrink in their last half hour before going out.
      const strength = Math.min(1, fire.fuel / 30);
      const t = time * 9 + fire.flicker;
      const flicker = 0.85 + Math.sin(t) * 0.08 + Math.sin(t * 2.3) * 0.05 + Math.sin(t * 5.1) * 0.03;

      fire.flames.visible = burning;
      fire.flames.children.forEach((flame, i) => {
        if (flame.userData.ember) return;
        const wobble = 1 + Math.sin(t * 1.3 + i * 2.1) * 0.15;
        flame.scale.set(strength, strength * flicker * wobble, strength);
      });
      fire.light.intensity = burning ? 18 * strength * flicker : 0;
      // Burnt-out logs turn dark.
      fire.pit.traverse((child) => {
        if (child.userData.burns) child.material.color.setHex(burning ? 0x6b4a32 : 0x2a2420);
      });
    }
  }

  // Removes every fire, for a new game.
  reset() {
    for (const fire of this.fires) {
      this.scene.remove(fire.object);
      this.world.obstacles.remove(fire.obstacle);
    }
    this.fires = [];
    this.world.grass.restore();
  }
}

// "2h 30m" of fuel left.
export function formatFuel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.floor(minutes % 60);
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}
