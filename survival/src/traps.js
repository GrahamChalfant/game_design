import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const CATCH_RADIUS = 0.6; // a rabbit this close to a set trap gets caught
const SPACING = 1.5; // traps can't be placed closer together than this

// Snare traps the player sets on the ground to catch rabbits.
export class Traps {
  constructor(scene, world, animals) {
    this.scene = scene;
    this.world = world;
    this.animals = animals;
    this.all = [];
    // Rabbits are drawn towards traps that are set and empty (as if baited).
    animals.lures = () => this.all.filter((trap) => !trap.caught);
  }

  canPlaceAt(x, z) {
    return (
      this.world.terrain.waterDepth(x, z) === 0 &&
      this.world.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + 0.4) &&
      this.all.every((trap) => Math.hypot(trap.x - x, trap.z - z) > SPACING)
    );
  }

  place(x, z, facing) {
    const object = new THREE.Group();
    object.position.set(x, this.world.terrain.heightAt(x, z), z);
    object.rotation.y = facing;

    const snare = new THREE.Group();
    snare.add(placeholders.trap());
    loadModel('trap').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = true));
      snare.clear();
      snare.add(model);
    });

    // A caught rabbit lies in the trap until it's collected.
    const catchShown = placeholders.rabbit();
    catchShown.rotation.z = Math.PI / 2;
    catchShown.position.set(0.15, 0.2, 0);
    catchShown.visible = false;
    object.add(snare, catchShown);
    this.scene.add(object);

    this.world.grass.clear(x, z, 0.6);
    const trap = { x, z, object, catchShown, caught: null };
    this.all.push(trap);
    return trap;
  }

  // The trap nearest to (x, z), if one is within `reach`.
  near(x, z, reach) {
    let best = null;
    let bestDistance = reach;
    for (const trap of this.all) {
      const distance = Math.hypot(trap.x - x, trap.z - z);
      if (distance < bestDistance) {
        best = trap;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Takes the catch out (the trap stays set). Returns what was caught.
  collect(trap) {
    const caught = trap.caught;
    trap.caught = null;
    trap.catchShown.visible = false;
    return caught;
  }

  remove(trap) {
    this.scene.remove(trap.object);
    this.all.splice(this.all.indexOf(trap), 1);
  }

  update() {
    for (const trap of this.all) {
      if (trap.caught) continue;
      const rabbit = this.animals.all.find(
        (animal) => animal.kind === 'rabbit' && Math.hypot(animal.position.x - trap.x, animal.position.z - trap.z) < CATCH_RADIUS,
      );
      if (!rabbit) continue;
      this.animals.remove(rabbit);
      trap.caught = 'rabbit';
      trap.catchShown.visible = true;
    }
  }

  // Removes every trap, for a new game.
  reset() {
    for (const trap of this.all) this.scene.remove(trap.object);
    this.all = [];
  }
}
