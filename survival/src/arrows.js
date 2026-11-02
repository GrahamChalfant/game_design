import * as THREE from 'three';
import * as placeholders from './placeholders.js';
import { loadModel } from './models.js';
import { ARROW_RANGE, ARROW_SPEED, arrowHitTest, hitAnimal } from './hunting.js';

const ARROW_HEIGHT = 1.1; // meters above the ground an arrow flies

// Arrows in flight: each flies straight until it hits an animal (killing it, see
// hunting.js) or runs out of range. Shot arrows are lost (no recovery in v1).
export class Arrows {
  constructor(scene, world, animals) {
    this.scene = scene;
    this.world = world;
    this.animals = animals;
    this.flying = [];
    this.onKill = () => {};
    // arrow.glb points along +z from its nock, like the stand-in, so both turn the same way.
    this.model = null;
    loadModel('arrow').then((model) => (this.model = model));
  }

  fire(x, z, facing) {
    const object = new THREE.Group();
    const shaft = this.model ? this.model.clone() : placeholders.arrow();
    if (this.model) shaft.position.z = -0.35; // centre the shaft on the flight point (origin is at the nock)
    object.add(shaft);
    object.rotation.y = facing; // +z turned to the flight direction (sin, cos)
    this.scene.add(object);
    const arrow = { x, z, dx: Math.sin(facing), dz: Math.cos(facing), travelled: 0, object };
    this.place(arrow);
    this.flying.push(arrow);
  }

  place(arrow) {
    arrow.object.position.set(arrow.x, this.world.terrain.heightAt(arrow.x, arrow.z) + ARROW_HEIGHT, arrow.z);
  }

  update(dt) {
    for (const arrow of [...this.flying]) {
      const step = Math.min(ARROW_SPEED * dt, ARROW_RANGE - arrow.travelled);
      const nx = arrow.x + arrow.dx * step;
      const nz = arrow.z + arrow.dz * step;
      const hit = arrowHitTest(arrow.x, arrow.z, nx, nz, this.animals.all);
      // Trees and boulders stop arrows too.
      const blocked = this.world.obstacles.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius);
      [arrow.x, arrow.z] = [nx, nz];
      arrow.travelled += step;
      this.place(arrow);
      if (hit && hitAnimal(hit)) {
        this.animals.kill(hit);
        this.onKill(hit);
      }
      if (hit || blocked || arrow.travelled >= ARROW_RANGE) this.remove(arrow);
    }
  }

  remove(arrow) {
    this.scene.remove(arrow.object);
    this.flying.splice(this.flying.indexOf(arrow), 1);
  }

  reset() {
    for (const arrow of this.flying) this.scene.remove(arrow.object);
    this.flying = [];
  }
}
