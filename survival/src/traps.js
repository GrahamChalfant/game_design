import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const CATCH_RADIUS = 0.6; // a rabbit this close to a set trap gets caught
const SPACING = 1.5; // traps can't be placed closer together than this
// Where a caught rabbit's body lies, in the trap's own space: just past the noose (about 0.3 m out),
// so its head rests in the loop.
const CATCH_SPOT = new THREE.Vector3(0, 0, 0.5);

// The snare model (trap.glb), loaded once, up front, and copied for each trap set: so a new trap
// shows it straight away, not the stand-in first.
let snareModel = null;
loadModel('trap').then((model) => {
  if (!model) return;
  model.traverse((child) => (child.castShadow = true));
  snareModel = model;
});

// The rabbit model, loaded once and copied for each trap that catches one.
let rabbitModel = null;
const rabbitLoaded = () => (rabbitModel ??= loadModel('rabbit'));

// Lays a rabbit on its side, head towards the trap, resting on the ground at the catch spot.
function lyingRabbit(body) {
  const holder = new THREE.Group();
  body.rotation.set(0, Math.PI, Math.PI / 2);
  holder.add(body);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body);
  const center = box.getCenter(new THREE.Vector3());
  body.position.set(-center.x, -box.min.y, -center.z);
  holder.position.copy(CATCH_SPOT);
  return holder;
}

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
      this.world.obstacles.isClear(x, z, 0.4) &&
      this.all.every((trap) => Math.hypot(trap.x - x, trap.z - z) > SPACING)
    );
  }

  place(x, z, facing) {
    const object = new THREE.Group();
    object.position.set(x, this.world.terrain.heightAt(x, z), z);
    object.rotation.y = facing;

    const snare = new THREE.Group();
    snare.add(snareModel ? snareModel.clone(true) : placeholders.trap());

    // A caught rabbit lies in the trap until it's collected.
    // It starts as the stand-in and swaps to the Blender model once that loads.
    const catchShown = new THREE.Group();
    catchShown.add(lyingRabbit(placeholders.rabbit()));
    rabbitLoaded().then((model) => {
      if (!model) return;
      const body = cloneSkinned(model);
      body.traverse((child) => {
        child.castShadow = true;
        child.frustumCulled = false;
      });
      catchShown.clear();
      catchShown.add(lyingRabbit(body));
    });
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
        (animal) => animal.kind === 'rabbit' && !animal.dead && Math.hypot(animal.position.x - trap.x, animal.position.z - trap.z) < CATCH_RADIUS,
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
