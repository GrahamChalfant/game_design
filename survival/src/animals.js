import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';
import { createRandom } from './random.js';
import { CRASH } from './crashTrail.js';
import {
  BOAR_ATTACK_COOLDOWN, BOAR_ATTACK_REACH, BOAR_CALM_DISTANCE, BOAR_CHARGE_SPEED, BOAR_COUNT,
  BOAR_DAMAGE, BOAR_WALK_SPEED, chargeDistance, fleeDistance,
} from './hunting.js';

// Each kind of animal. Distances in meters, speeds in meters per second
// (the player walks at 5, so both outrun the player when scared).
const KINDS = {
  rabbit: {
    count: 6,
    radius: 0.25,
    wanderSpeed: 1.6,
    fleeSpeed: 7,
    // Runs when the player gets within FLEE_DISTANCE (hunting.js), standing or crouching...
    calmDistance: 14, // ...and keeps running until this far away
    wanderRange: 6,
    idleTime: [2, 6], // seconds spent grazing between wanders
    turnSpeed: 10,
    lureRange: 18, // notices traps this far away...
    lureChance: 0.35, // ...and heads for one this often when it decides where to go
    placeholder: placeholders.rabbit,
  },
  deer: {
    count: 3,
    radius: 0.6,
    wanderSpeed: 1.2,
    fleeSpeed: 9,
    calmDistance: 28,
    wanderRange: 12,
    idleTime: [3, 9],
    turnSpeed: 5,
    placeholder: placeholders.deer,
  },
  // Boars don't run from you: they charge (issue #76). Numbers in hunting.js.
  boar: {
    count: BOAR_COUNT,
    radius: 0.45,
    wanderSpeed: BOAR_WALK_SPEED,
    fleeSpeed: BOAR_CHARGE_SPEED, // used as its charge speed
    calmDistance: BOAR_CALM_DISTANCE,
    wanderRange: 8,
    idleTime: [3, 8],
    turnSpeed: 6,
    aggressive: true,
    placeholder: placeholders.boar,
  },
};
// Animals live around the player, wherever they go on the map: they appear between these
// distances (out of sight, but close enough to find), and any that end up further away than
// WANDERED_OFF are moved somewhere new around the player.
const SPAWN_DISTANCE = [25, 90];
const WANDERED_OFF = 130;
const RESPAWN_TIME = 60; // seconds before a caught animal is replaced
// A killed animal stumbles on (if it was running) for STUMBLE_TIME seconds; its legs stop and
// it starts to fall at FALL_START, and lies on its side FALL_TIME seconds later.
const STUMBLE_TIME = 0.7;
const FALL_START = 0.35;
const FALL_TIME = 0.8;
const RETRY_TIME = 5; // seconds before trying again to place an animal that found no spot
// Boars keep away from the crash, so you can get your bearings there in peace: none appear
// within BOAR_SPAWN_CLEAR meters of it, and none go within BOAR_KEEP_OUT, even when charging.
const BOAR_SPAWN_CLEAR = 160;
const BOAR_KEEP_OUT = 130;
const FADE_TIME = 0.2; // seconds to blend from one animation to the next
const GRAZE_PACE = 0.12; // how quickly an animal switches between looking up and grazing

// Wild animals that graze, wander around, and run away from the player.
export class Animals {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.random = createRandom(seed);
    this.all = [];
    this.respawns = [];
    this.models = {};
    // Things that draw animals in (set by Traps): a function returning [{ x, z }].
    this.lures = () => [];
    // Called with (animal, damage) when a charging boar gores the player.
    this.onAttack = () => {};
    // Called with (animal) when a boar starts to charge.
    this.onCharge = () => {};
    // Called with (animal) when a rabbit or deer spots the player and bolts.
    this.onFlee = () => {};
    for (const kind of Object.keys(KINDS)) {
      loadModel(kind).then((model) => {
        if (!model) return;
        this.models[kind] = model;
        for (const animal of this.all) if (animal.kind === kind) this.useModel(animal, model);
      });
    }
  }

  // Places every animal somewhere away from `playerPosition`.
  spawnAll(playerPosition) {
    for (const [kind, config] of Object.entries(KINDS)) {
      for (let i = 0; i < config.count; i++) this.spawn(kind, playerPosition);
    }
  }

  spawn(kind, playerPosition) {
    const config = KINDS[kind];
    const spot = this.findSpot(playerPosition, config.radius, kind);
    if (!spot) {
      this.respawns.push({ kind, timer: RETRY_TIME }); // (e.g. a boar, while you're at the crash)
      return null;
    }

    const object = new THREE.Group();
    const body = config.placeholder();
    object.add(body);
    this.scene.add(object);

    const animal = {
      kind,
      config,
      object,
      body,
      position: new THREE.Vector3(spot.x, 0, spot.z),
      radius: config.radius,
      dead: false,
      facing: this.random.range(0, Math.PI * 2),
      state: 'idle',
      timer: this.random.range(...config.idleTime),
      target: null,
      gait: this.random.range(0, 10),
    };
    if (this.models[kind]) this.useModel(animal, this.models[kind]);
    this.all.push(animal);
    return animal;
  }

  useModel(animal, model) {
    animal.object.remove(animal.body);
    animal.body = cloneSkinned(model);
    animal.body.traverse((child) => {
      child.castShadow = true;
      // Its animations move it beyond where three.js thinks it is, so always draw it.
      child.frustumCulled = false;
    });
    animal.object.add(animal.body);
    // Static models (boar.glb has no clips yet) just glide, with a little bob in animate().
    if (!model.animations.some((clip) => clip.name.startsWith(`${animal.kind}-`))) {
      animal.mixer = null;
      return;
    }
    animal.mixer = new THREE.AnimationMixer(animal.body);
    animal.clips = Object.fromEntries(
      model.animations
        .filter((clip) => clip.name.startsWith(`${animal.kind}-`))
        .map((clip) => [clip.name.slice(animal.kind.length + 1), animal.mixer.clipAction(clip)]),
    );
    animal.playing = null;
  }

  // Blends into the named animation, playing it at `speed` times its normal rate.
  play(animal, name, speed = 1) {
    const clip = animal.clips[name];
    clip.timeScale = speed;
    if (animal.playing === clip) return;
    clip.reset().play();
    if (animal.playing) clip.crossFadeFrom(animal.playing, FADE_TIME);
    animal.playing = clip;
  }

  // Takes an animal out of the world (e.g. caught in a trap). A new one appears later.
  remove(animal) {
    this.scene.remove(animal.object);
    this.all.splice(this.all.indexOf(animal), 1);
    this.respawns.push({ kind: animal.kind, timer: RESPAWN_TIME });
  }

  // Killed (by an arrow or the knife): it stumbles on a few steps if it was running, then its
  // legs give way and it topples onto its side (see updateDying). Then it can be butchered.
  kill(animal) {
    const running = animal.state === 'flee' || animal.state === 'charge';
    animal.dead = true;
    animal.state = 'dead';
    animal.dying = 0; // seconds since it was killed
    animal.dyingSpeed = running ? animal.config.fleeSpeed * 0.7 : 0.6;
  }

  updateDying(animal, dt) {
    animal.dying += dt;
    const t = animal.dying;
    // Carries on a little way, slowing down.
    const speed = animal.dyingSpeed * Math.max(0, 1 - t / STUMBLE_TIME);
    const step = speed * dt;
    const nx = animal.position.x + Math.sin(animal.facing) * step;
    const nz = animal.position.z + Math.cos(animal.facing) * step;
    if (step > 0 && this.isFree(nx, nz, animal.radius)) {
      animal.position.x = nx;
      animal.position.z = nz;
      animal.position.y = this.world.terrain.heightAt(nx, nz);
      animal.object.position.copy(animal.position);
    }
    // Its legs slow and stop...
    if (animal.mixer) {
      animal.mixer.timeScale = Math.max(0, 1 - t / FALL_START);
      animal.mixer.update(dt);
    }
    // ...then it falls over, slowly at first and faster as it goes (like falling under its weight).
    const f = Math.min(1, Math.max(0, (t - FALL_START) / FALL_TIME));
    const eased = f * f;
    animal.body.rotation.z = (Math.PI / 2) * eased; // onto its side
    animal.body.position.y = animal.config.radius * 0.6 * eased;
    if (f === 1) {
      animal.dying = null;
      if (animal.mixer) {
        animal.mixer.stopAllAction();
        animal.mixer.timeScale = 1;
      }
    }
  }

  // The nearest shot animal within `reach` of (x, z), or null.
  carcassNear(x, z, reach) {
    let best = null;
    for (const animal of this.all) {
      if (!animal.dead) continue;
      const d = Math.hypot(animal.position.x - x, animal.position.z - z);
      if (d < reach) [best, reach] = [animal, d];
    }
    return best;
  }

  update(dt, playerPosition, sneaking) {
    for (const animal of this.all) {
      if (!animal.dead) this.updateAnimal(animal, dt, playerPosition, sneaking);
      else if (animal.dying != null) this.updateDying(animal, dt);
    }
    // (Rabbits drawn to a set trap stay, so traps keep working while you're away.)
    const lures = this.lures();
    for (const animal of [...this.all]) {
      if (Math.hypot(animal.position.x - playerPosition.x, animal.position.z - playerPosition.z) < WANDERED_OFF) continue;
      const lured = animal.config.lureRange && !animal.dead &&
        lures.some((lure) => Math.hypot(lure.x - animal.position.x, lure.z - animal.position.z) < animal.config.lureRange);
      if (lured) continue;
      if (animal.dead) this.remove(animal); // a carcass left far behind
      else this.relocate(animal, playerPosition);
    }

    for (const respawn of this.respawns) respawn.timer -= dt;
    for (const respawn of this.respawns.filter((r) => r.timer <= 0)) {
      this.respawns.splice(this.respawns.indexOf(respawn), 1);
      this.spawn(respawn.kind, playerPosition);
    }
  }

  updateAnimal(animal, dt, playerPosition, sneaking) {
    const { config, position } = animal;
    const playerDistance = Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z);

    // Notice the player and bolt; settle down again once well away.
    // Boars charge instead; a wounded boar charges wherever you are within its calm distance.
    let direction = null;
    let speed = 0;
    if (config.aggressive) {
      animal.attackCooldown = Math.max(0, (animal.attackCooldown ?? 0) - dt);
      if (playerDistance < chargeDistance(sneaking) || (animal.hits && playerDistance < config.calmDistance)) {
        if (animal.state !== 'charge') this.onCharge(animal);
        animal.state = 'charge';
      }
      if (animal.state === 'charge' && playerDistance > config.calmDistance) this.rest(animal);
      if (animal.state === 'charge' && playerDistance < BOAR_ATTACK_REACH + animal.radius) {
        // Close enough: gore the player, then stand its ground until it can again.
        this.turnToward(animal, Math.atan2(playerPosition.x - position.x, playerPosition.z - position.z), dt);
        if (animal.attackCooldown === 0) {
          animal.attackCooldown = BOAR_ATTACK_COOLDOWN;
          this.onAttack(animal, BOAR_DAMAGE);
        }
      } else if (animal.state === 'charge') {
        direction = new THREE.Vector2(playerPosition.x - position.x, playerPosition.z - position.z).normalize();
        speed = config.fleeSpeed;
      }
    } else {
      const scareDistance = fleeDistance(animal.kind, sneaking);
      if (playerDistance < scareDistance) {
        if (animal.state !== 'flee') this.onFlee(animal);
        animal.state = 'flee';
      }
      if (animal.state === 'flee' && playerDistance > config.calmDistance) this.rest(animal);
    }

    if (animal.state === 'charge') {
      // (direction and speed set above)
    } else if (animal.state === 'flee') {
      direction = new THREE.Vector2(position.x - playerPosition.x, position.z - playerPosition.z).normalize();
      speed = config.fleeSpeed;
    } else if (animal.state === 'wander') {
      const toTarget = new THREE.Vector2(animal.target.x - position.x, animal.target.z - position.z);
      if (toTarget.length() < 0.3) this.rest(animal);
      else {
        direction = toTarget.normalize();
        speed = config.wanderSpeed;
      }
    } else {
      animal.timer -= dt;
      if (animal.timer <= 0) this.wander(animal);
    }

    let moved = false;
    if (direction) {
      // If the way is blocked, try veering left or right.
      for (const angle of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const step = direction.clone().rotateAround(new THREE.Vector2(), angle).multiplyScalar(speed * dt);
        if (this.isFree(position.x + step.x, position.z + step.y, config.radius, animal.kind)) {
          position.x += step.x;
          position.z += step.y;
          this.turnToward(animal, Math.atan2(step.x, step.y), dt);
          moved = true;
          break;
        }
      }
      // Completely stuck while wandering: give up and graze instead.
      if (!moved && animal.state === 'wander') this.rest(animal);
    }

    position.y = this.world.terrain.heightAt(position.x, position.z);
    animal.object.position.copy(position);
    animal.object.rotation.y = animal.facing;
    this.animate(animal, moved, speed, dt);
  }

  rest(animal) {
    animal.state = 'idle';
    animal.timer = this.random.range(...animal.config.idleTime);
  }

  wander(animal) {
    const { position, config } = animal;
    if (config.lureRange && this.random.next() < config.lureChance) {
      const lure = this.lures().find(
        (l) => Math.hypot(l.x - position.x, l.z - position.z) < config.lureRange,
      );
      if (lure) {
        animal.state = 'wander';
        animal.target = { x: lure.x, z: lure.z };
        return;
      }
    }
    for (let tries = 0; tries < 10; tries++) {
      const angle = this.random.range(0, Math.PI * 2);
      const distance = this.random.range(config.wanderRange * 0.3, config.wanderRange);
      const x = position.x + Math.cos(angle) * distance;
      const z = position.z + Math.sin(angle) * distance;
      if (this.isFree(x, z, config.radius, animal.kind)) {
        animal.state = 'wander';
        animal.target = { x, z };
        return;
      }
    }
    this.rest(animal);
  }

  turnToward(animal, target, dt) {
    const diff = Math.atan2(Math.sin(target - animal.facing), Math.cos(target - animal.facing));
    animal.facing += diff * Math.min(1, animal.config.turnSpeed * dt);
  }

  // Rabbits hop; deer bob their heads while grazing and swing their legs while moving.
  animate(animal, moving, speed, dt) {
    animal.gait += dt * (moving ? speed * 2.2 : 1);
    if (animal.mixer) {
      if (!moving) this.play(animal, Math.sin(animal.gait * GRAZE_PACE) > 0 ? 'graze' : 'idle');
      else if (animal.state === 'flee' || animal.state === 'charge') this.play(animal, 'run');
      else this.play(animal, 'walk');
      animal.mixer.update(dt);
      return;
    }
    const legs = animal.body.userData.legs;
    if (!legs && animal.kind !== 'rabbit') {
      // A static model without legs to swing: trot with a small bob instead.
      animal.body.position.y = moving ? Math.abs(Math.sin(animal.gait * 1.2)) * 0.05 : 0;
      return;
    }
    if (animal.kind === 'rabbit') {
      animal.body.position.y = moving ? Math.abs(Math.sin(animal.gait * 1.4)) * 0.22 : 0;
    } else if (legs) {
      legs.forEach((leg, i) => (leg.rotation.x = moving ? Math.sin(animal.gait + (i % 2) * Math.PI) * 0.5 : 0));
    }
    const head = animal.body.userData.head;
    if (head) head.rotation.x = moving ? 0 : Math.max(0, Math.sin(animal.gait * 0.7)) * 0.9; // nibbling
  }

  // Somewhere on dry land, clear of trees and rocks and inside the map (and for a boar, away
  // from the crash).
  isFree(x, z, radius, kind = null, keepOut = BOAR_KEEP_OUT) {
    const limit = this.world.size / 2 - 1;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    if (kind === 'boar' && Math.hypot(x - CRASH.x, z - CRASH.z) < keepOut) return false;
    if (this.world.terrain.waterDepth(x, z) > 0.35) return false; // (they wade the creeks and shallows)
    return this.world.obstacles.isClear(x, z, radius);
  }

  // Somewhere free in a ring around the player (see SPAWN_DISTANCE).
  findSpot(playerPosition, radius, kind) {
    for (let tries = 0; tries < 200; tries++) {
      const angle = this.random.range(0, Math.PI * 2);
      const distance = this.random.range(...SPAWN_DISTANCE);
      const x = playerPosition.x + Math.cos(angle) * distance;
      const z = playerPosition.z + Math.sin(angle) * distance;
      if (this.isFree(x, z, radius + 0.5, kind, BOAR_SPAWN_CLEAR)) return { x, z };
    }
    return null;
  }

  // Moves an animal the player has left far behind to somewhere new around them.
  relocate(animal, playerPosition) {
    const spot = this.findSpot(playerPosition, animal.radius, animal.kind);
    if (!spot) return; // (stays where it is for now)
    animal.position.set(spot.x, 0, spot.z);
    this.rest(animal);
  }

  // Clears every animal and places a fresh set, for a new game.
  reset(playerPosition) {
    for (const animal of this.all) this.scene.remove(animal.object);
    this.all = [];
    this.respawns = [];
    this.spawnAll(playerPosition);
  }
}
