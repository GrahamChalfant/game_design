import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';
import { createRandom } from './random.js';
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
const SPAWN_DISTANCE = 25; // new animals appear at least this far from the player
const RESPAWN_TIME = 60; // seconds before a caught animal is replaced
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
    const spot = this.findSpot(playerPosition, config.radius);
    if (!spot) return null;

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

  // Shot with an arrow: it drops where it stands, to be butchered (see carcassNear).
  kill(animal) {
    animal.dead = true;
    animal.state = 'dead';
    if (animal.mixer) animal.mixer.stopAllAction();
    animal.body.rotation.z = Math.PI / 2; // lying on its side
    animal.body.position.y = animal.config.radius * 0.6;
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
    for (const animal of this.all) if (!animal.dead) this.updateAnimal(animal, dt, playerPosition, sneaking);

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
      if (playerDistance < chargeDistance(sneaking) || (animal.hits && playerDistance < config.calmDistance)) animal.state = 'charge';
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
      if (playerDistance < scareDistance) animal.state = 'flee';
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
        if (this.isFree(position.x + step.x, position.z + step.y, config.radius)) {
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
      if (this.isFree(x, z, config.radius)) {
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

  // Somewhere on dry land, clear of trees and rocks and inside the map.
  isFree(x, z, radius) {
    const limit = this.world.size / 2 - 1;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    if (this.world.terrain.waterDepth(x, z) > 0.05) return false;
    return this.world.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + radius);
  }

  findSpot(playerPosition, radius) {
    const half = this.world.size / 2 - 3;
    for (let tries = 0; tries < 200; tries++) {
      const x = this.random.range(-half, half);
      const z = this.random.range(-half, half);
      const farEnough = Math.hypot(x - playerPosition.x, z - playerPosition.z) > SPAWN_DISTANCE;
      if (farEnough && this.isFree(x, z, radius + 0.5)) return { x, z };
    }
    return null;
  }

  // Clears every animal and places a fresh set, for a new game.
  reset(playerPosition) {
    for (const animal of this.all) this.scene.remove(animal.object);
    this.all = [];
    this.respawns = [];
    this.spawnAll(playerPosition);
  }
}
