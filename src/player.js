import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const RADIUS = 0.4;
const WALK_SPEED = 5;
const SWIM_SPEED = 2.2;
const SWIM_DEPTH = 1.25; // once the water is this deep, the player swims with their head above water
const TURN_SPEED = 12;

export class Player {
  constructor(scene, spawn, worldSize) {
    this.position = spawn.clone();
    this.facing = 0;
    this.walkTime = 0;
    this.limit = worldSize / 2 - 1;
    this.spawn = spawn.clone();
    this.alive = true;

    this.object = new THREE.Group();
    this.body = placeholders.survivor();
    this.object.add(this.body);
    scene.add(this.object);

    loadModel('player').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = true));
      this.object.remove(this.body);
      this.body = model;
      this.object.add(model);
    });
  }

  update(dt, input, world) {
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
    const speed = THREE.MathUtils.lerp(WALK_SPEED, SWIM_SPEED, Math.min(1, depth / SWIM_DEPTH));

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
    if (this.swimming) {
      // Bob gently in the water.
      this.body.position.y = Math.sin(performance.now() / 400) * 0.06;
    } else {
      // A little bounce while walking.
      this.body.position.y = moving ? Math.abs(Math.sin(this.walkTime * 10)) * 0.08 : 0;
    }
  }

  // True when standing in, or facing, water close enough to drink.
  canDrink(world) {
    const reach = 1.2;
    const aheadX = this.position.x + Math.sin(this.facing) * reach;
    const aheadZ = this.position.z + Math.cos(this.facing) * reach;
    return (
      world.terrain.waterDepth(this.position.x, this.position.z) > 0.02 ||
      world.terrain.waterDepth(aheadX, aheadZ) > 0.02
    );
  }

  die() {
    this.alive = false;
  }

  reset() {
    this.alive = true;
    this.position.copy(this.spawn);
    this.facing = 0;
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
