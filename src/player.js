import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const RADIUS = 0.4;
const WALK_SPEED = 5;
const TURN_SPEED = 12;

export class Player {
  constructor(scene, spawn, worldSize) {
    this.position = spawn.clone();
    this.facing = 0;
    this.walkTime = 0;
    this.limit = worldSize / 2 - 1;

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
    const { x, z } = input.moveAxis();
    const moving = x !== 0 || z !== 0;

    if (moving) {
      const step = new THREE.Vector2(x, z).normalize().multiplyScalar(WALK_SPEED * dt);
      // Move one axis at a time so the player slides along trees and the shore.
      this.tryMove(step.x, 0, world);
      this.tryMove(0, step.y, world);

      // Turn smoothly toward the direction of travel.
      const target = Math.atan2(x, z);
      const diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += diff * Math.min(1, TURN_SPEED * dt);
      this.walkTime += dt;
    }

    this.position.y = world.terrain.heightAt(this.position.x, this.position.z);
    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;
    // A little bounce while walking.
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkTime * 10)) * 0.08 : 0;
  }

  tryMove(dx, dz, world) {
    const x = THREE.MathUtils.clamp(this.position.x + dx, -this.limit, this.limit);
    const z = THREE.MathUtils.clamp(this.position.z + dz, -this.limit, this.limit);
    // Look one body-width ahead so the player stops at the water's edge.
    const ahead = Math.sign(dx) * RADIUS;
    const aheadZ = Math.sign(dz) * RADIUS;
    if (world.terrain.isWater(x + ahead, z + aheadZ)) return;
    for (const o of world.obstacles) {
      if (Math.hypot(o.x - x, o.z - z) < o.radius + RADIUS) return;
    }
    this.position.x = x;
    this.position.z = z;
  }
}
