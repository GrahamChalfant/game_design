import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const RADIUS = 0.4;
const WALK_SPEED = 5;
const SNEAK_SPEED = 2.2;
const SWIM_SPEED = 2.2;
const SWIM_DEPTH = 1.25; // once the water is this deep, the player swims with their head above water
const TURN_SPEED = 12;

export class Player {
  constructor(scene, spawn, worldSize, spawnFacing = 0) {
    this.position = spawn.clone();
    this.spawnFacing = spawnFacing;
    this.facing = spawnFacing;
    this.walkTime = 0;
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

    loadModel('player').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = true));
      this.object.remove(this.body);
      this.body = model;
      this.object.add(model);
    });
  }

  // What the player holds ('axe', 'wood', null) and whether they're chopping.
  setAction(heldItem, chopping) {
    this.axe.visible = heldItem === 'axe';
    this.chopping = chopping;
  }

  update(dt, input, world) {
    // Swing the axe while chopping; otherwise rest it on the shoulder.
    this.chopTime = this.chopping ? (this.chopTime ?? 0) + dt : 0;
    this.axe.rotation.x = this.chopping ? 0.5 + Math.sin(this.chopTime * 9) * 1.1 : 0.35;

    if (!this.alive) {
      // Slowly topple over.
      this.body.rotation.x += (-Math.PI / 2 - this.body.rotation.x) * Math.min(1, dt * 3);
      return;
    }

    const { x, z } = input.moveAxis();
    const moving = x !== 0 || z !== 0;
    const depth = world.terrain.waterDepth(this.position.x, this.position.z);
    this.swimming = depth > SWIM_DEPTH;
    // Wading slows you down the deeper you go; swimming is slower still.
    // Hold Shift to sneak: slower and crouched, so animals don't notice you as soon.
    this.sneaking = input.isDown('ShiftLeft', 'ShiftRight') && !this.swimming;
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
    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;
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
    this.body.rotation.x = 0;
  }

  tryMove(dx, dz, world) {
    const x = THREE.MathUtils.clamp(this.position.x + dx, -this.limit, this.limit);
    const z = THREE.MathUtils.clamp(this.position.z + dz, -this.limit, this.limit);
    for (const o of world.obstacles) {
      if (Math.hypot(o.x - x, o.z - z) < o.radius + RADIUS) return;
    }
    this.position.x = x;
    this.position.z = z;
  }
}
