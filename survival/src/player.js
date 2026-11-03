import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const RADIUS = 0.4;
const WALK_SPEED = 5;
const SNEAK_SPEED = 2.2;
const SWIM_SPEED = 2.2;
const SWIM_DEPTH = 1.25; // once the water is this deep, the player swims with their head above water
const TURN_SPEED = 12;
const JUMP_SPEED = 5.5; // how fast you leave the ground: about a 0.75 m hop, 0.55 s in the air
const GRAVITY = 20;
const JUMP_MAX_DEPTH = 0.3; // too deep in the water to jump beyond this
const TOP_MARGIN = 0.1; // feet this close below the top of a rock or stump still clear it
const TOP_OVERHANG = 0.25; // how far past a rock's edge the player can stand on it
const KNIFE_GRIP_OFFSET = 0.01; // nudge so the middle of knife.glb's handle (1 cm below its origin) sits in the fist
const STAB_TIME = 0.25; // seconds a knife jab lasts
const FADE_TIME = 0.15; // seconds to blend from one animation to the next

export class Player {
  constructor(scene, spawn, worldSize, spawnFacing = 0) {
    this.position = spawn.clone();
    this.spawnFacing = spawnFacing;
    this.facing = spawnFacing;
    this.walkTime = 0;
    this.jumpHeight = 0; // how far above the ground the player's feet are right now
    this.standingHeight = 0; // how high above the ground the rock or stump underfoot is, if any
    this.jumpSpeed = 0;
    this.crouched = false;
    this.limit = worldSize / 2 - 1;
    this.spawn = spawn.clone();
    this.alive = true;

    this.object = new THREE.Group();
    this.body = placeholders.survivor();
    this.object.add(this.body);
    scene.add(this.object);

    // The axe, shown in the player's right hand while it's selected.
    this.axe = placeholders.axe();
    this.axe.position.set(0.42, 0.85, 0.05);
    this.axe.visible = false;
    this.object.add(this.axe);
    loadModel('axe').then((model) => {
      if (!model) return;
      this.axe.clear();
      this.axe.add(model);
    });

    // The bow, shown in the right hand while it's selected (stand-in until bow.glb loads).
    this.bow = new THREE.Group();
    this.bow.add(placeholders.bow());
    loadModel('bow').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = true));
      this.bow.clear();
      this.bow.add(model);
    });
    this.bow.position.set(-0.4, 1.0, 0.25);
    this.bow.scale.setScalar(0.8);
    this.bow.visible = false;
    this.object.add(this.bow);

    // The stone knife (#75), in the right hand while selected (stand-in until knife.glb loads).
    this.knife = new THREE.Group();
    this.knife.add(placeholders.knife());
    loadModel('knife').then((model) => {
      if (!model) return;
      this.knife.clear();
      // knife.glb's origin is at the guard/hide wrap: handle runs 7.5 cm down -Y, blade from
      // +4.5 cm up +Y. Nudged so the fist closes on the handle with the blade clear in front.
      model.position.y = KNIFE_GRIP_OFFSET;
      this.knife.add(model);
    });
    this.knife.position.set(0.42, 0.9, 0.2);
    this.knife.visible = false;
    this.object.add(this.knife);
    this.stabTime = 0; // counts down after a stab, to jab the knife forward

    loadModel('player').then((model) => {
      if (!model) return;
      model.traverse((child) => {
        child.castShadow = true;
        // Its animations move it beyond where three.js thinks it is, so always draw it.
        child.frustumCulled = false;
      });
      this.object.remove(this.body);
      this.body = model;
      this.object.add(model);

      // The axe goes in the right hand, with its handle pointing forward.
      model.getObjectByName('hand_R').add(this.axe);
      this.axe.position.set(0, 0.03, 0.02);
      this.axe.rotation.set(Math.PI / 2, 0, 0);
      // bow.glb's origin is the grip, so it sits in the hand with its tips along the arm's up axis.
      model.getObjectByName('hand_R').add(this.bow);
      this.bow.position.set(0, 0.03, 0.02);
      this.bow.rotation.set(0, 0, 0);
      this.bow.scale.setScalar(1);
      // knife's origin is the grip; the blade points along the hand's up axis, like the bow.
      model.getObjectByName('hand_R').add(this.knife);
      this.knife.position.set(0, 0.03, 0.02);
      this.knife.rotation.set(Math.PI / 2, 0, 0);

      this.mixer = new THREE.AnimationMixer(model);
      this.clips = Object.fromEntries(model.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
      for (const clip of [this.clips.die, this.clips.jump]) {
        clip.setLoop(THREE.LoopOnce);
        clip.clampWhenFinished = true;
      }
      this.play('idle');
    });
  }

  // Blends into the named animation, playing it at `speed` times its normal rate.
  play(name, speed = 1) {
    const clip = this.clips[name];
    clip.timeScale = speed;
    if (this.playing === clip) return;
    clip.reset().play();
    if (this.playing) clip.crossFadeFrom(this.playing, FADE_TIME);
    this.playing = clip;
  }

  // What the player holds ('axe', 'wood', null), whether they're chopping or drinking,
  // and whether they've found the backpack yet.
  setAction(heldItem, chopping, drinking, hasBackpack) {
    this.axe.visible = heldItem === 'axe' && !this.swimming && !drinking; // put away when the hands are busy
    this.bow.visible = heldItem === 'bow' && !this.swimming && !drinking;
    this.knife.visible = heldItem === 'knife' && !this.swimming && !drinking;
    this.body.getObjectByName('player-pack').visible = hasBackpack;
    this.chopping = chopping;
    this.drinking = drinking;
  }

  // True while in the air from a jump, or falling off a rock.
  get airborne() {
    return this.jumpHeight > this.standingHeight;
  }

  // Picks the animation for what the player is doing now.
  animate(dt, moving, speed) {
    if (!this.alive) this.play('die');
    else if (this.swimming) this.play('swim');
    else if (this.airborne) this.play('jump');
    else if (this.drinking) this.play('drink');
    else if (this.chopping) this.play('chop');
    else if (moving) this.play(this.sneaking ? 'sneak' : 'walk', speed / (this.sneaking ? SNEAK_SPEED : WALK_SPEED));
    else this.play(this.sneaking ? 'crouch' : 'idle');
    this.mixer.update(dt);
  }

  // A quick forward jab of the knife (no stab animation in player.glb yet).
  stab() {
    this.stabTime = STAB_TIME;
  }

  update(dt, input, world) {
    this.stabTime = Math.max(0, this.stabTime - dt);
    const jab = Math.sin((this.stabTime / STAB_TIME) * Math.PI); // 0 → 1 → 0
    this.knife.rotation.x = Math.PI / 2 - jab * 0.9;
    if (!this.mixer) {
      // Swing the axe while chopping; otherwise rest it on the shoulder.
      this.chopTime = this.chopping ? (this.chopTime ?? 0) + dt : 0;
      this.axe.rotation.x = this.chopping ? 0.5 + Math.sin(this.chopTime * 9) * 1.1 : 0.35;
    }

    if (!this.alive) {
      if (this.mixer) this.animate(dt);
      // Slowly topple over.
      else this.body.rotation.x += (-Math.PI / 2 - this.body.rotation.x) * Math.min(1, dt * 3);
      return;
    }

    const { x, z } = input.moveAxis();
    const moving = x !== 0 || z !== 0;
    const depth = world.terrain.waterDepth(this.position.x, this.position.z);
    this.swimming = depth > SWIM_DEPTH;
    // Wading slows you down the deeper you go; swimming is slower still.
    // Press C to crouch or stand back up, or hold Shift: slower, and animals don't notice you
    // as soon.
    if (input.wasPressed('KeyC')) this.crouched = !this.crouched;
    this.sneaking = (this.crouched || input.isDown('ShiftLeft', 'ShiftRight')) && !this.swimming;
    const landSpeed = this.sneaking ? SNEAK_SPEED : WALK_SPEED;
    const speed = THREE.MathUtils.lerp(landSpeed, SWIM_SPEED, Math.min(1, depth / SWIM_DEPTH));

    if (moving) {
      const step = new THREE.Vector2(x, z).normalize().multiplyScalar(speed * dt);
      // Move one axis at a time so the player slides along trees and the shore.
      this.tryMove(step.x, 0, world);
      this.tryMove(0, step.y, world);

      // Turn smoothly toward the direction of travel.
      const target = Math.atan2(x, z);
      const diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += diff * Math.min(1, TURN_SPEED * dt);
      this.walkTime += dt;
    }

    const ground = world.terrain.heightAt(this.position.x, this.position.z);
    this.position.y = Math.max(ground, world.terrain.waterLevel - SWIM_DEPTH);

    // Space to jump (not while swimming or wading deep). The jump only lifts the body:
    // `position` stays on the ground, so the camera doesn't bob.
    this.standingHeight = this.heightUnderfoot(world);
    if (input.wasPressed('Space') && !this.airborne && depth < JUMP_MAX_DEPTH) this.jumpSpeed = JUMP_SPEED;
    if (this.jumpSpeed !== 0 || this.airborne) {
      this.jumpSpeed -= GRAVITY * dt;
      this.jumpHeight += this.jumpSpeed * dt;
      if (this.jumpHeight <= this.standingHeight) this.jumpSpeed = 0; // landed
    }
    if (this.jumpSpeed === 0 && this.jumpHeight <= this.standingHeight) this.jumpHeight = this.standingHeight;

    this.object.position.copy(this.position);
    this.object.position.y += this.jumpHeight;
    this.object.rotation.y = this.facing;
    if (this.mixer) {
      this.animate(dt, moving, speed);
      return;
    }
    const crouch = this.sneaking ? 0.75 : 1;
    this.body.scale.y += (crouch - this.body.scale.y) * Math.min(1, dt * 10);
    if (this.swimming) {
      // Bob gently in the water.
      this.body.position.y = Math.sin(performance.now() / 400) * 0.06;
    } else {
      // A little bounce while walking.
      this.body.position.y = moving ? Math.abs(Math.sin(this.walkTime * 10)) * (this.sneaking ? 0.03 : 0.08) : 0;
    }
  }

  // A point on the ground `distance` meters in front of the player.
  ahead(distance) {
    return {
      x: this.position.x + Math.sin(this.facing) * distance,
      z: this.position.z + Math.cos(this.facing) * distance,
    };
  }

  // True when standing in, or facing, water close enough to drink.
  canDrink(world) {
    const { x, z } = this.ahead(1.2);
    return (
      world.terrain.waterDepth(this.position.x, this.position.z) > 0.02 || world.terrain.waterDepth(x, z) > 0.02
    );
  }

  // The standing tree in front of the player, close enough to chop, if any.
  treeInReach(world) {
    const { x, z } = this.ahead(0.9);
    return world.trees.findTarget(x, z, 0.6);
  }

  die() {
    this.alive = false;
  }

  reset() {
    this.alive = true;
    this.position.copy(this.spawn);
    this.facing = this.spawnFacing;
    this.jumpHeight = this.jumpSpeed = this.standingHeight = 0;
    this.crouched = false;
    this.body.rotation.x = 0;
  }

  // How high above the ground the feet can rest here: the top of the highest rock or stump
  // they've cleared, or 0.
  heightUnderfoot(world) {
    const feet = this.position.y + this.jumpHeight;
    let top = this.position.y;
    for (const o of world.obstacles.near(this.position.x, this.position.z, TOP_OVERHANG)) {
      if (o.top === undefined || o.top > feet + TOP_MARGIN) continue;
      if (Math.hypot(o.x - this.position.x, o.z - this.position.z) < o.radius + TOP_OVERHANG) top = Math.max(top, o.top);
    }
    return top - this.position.y;
  }

  tryMove(dx, dz, world) {
    const x = THREE.MathUtils.clamp(this.position.x + dx, -this.limit, this.limit);
    const z = THREE.MathUtils.clamp(this.position.z + dz, -this.limit, this.limit);
    const feet = this.position.y + this.jumpHeight;
    for (const o of world.obstacles.near(x, z, RADIUS)) {
      if (o.top !== undefined && feet >= o.top - TOP_MARGIN) continue; // high enough to pass over it
      const distance = Math.hypot(o.x - x, o.z - z);
      // Moving away is always allowed, so landing against something can't trap the player.
      if (distance < o.radius + RADIUS && distance < Math.hypot(o.x - this.position.x, o.z - this.position.z)) return;
    }
    this.position.x = x;
    this.position.z = z;
  }
}
