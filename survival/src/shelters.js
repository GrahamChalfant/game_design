import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const ROOM = 2.3; // clear ground needed around the middle of a shelter

// A-frame shelters the player has built: placing them, and whether you're inside one.
// In its own space a shelter's open front faces +z; inside is under the roof, between the
// two sloping sides.
export class Shelters {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.all = [];
  }

  // True if there's room for a shelter at (x, z): dry ground, nothing in the way.
  canBuildAt(x, z) {
    return (
      this.world.terrain.waterDepth(x, z) === 0 &&
      this.world.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + ROOM)
    );
  }

  // Builds a shelter at (x, z). Its open front always faces the camera (south), so you can
  // see inside it, and yourself when you're in it.
  build(x, z) {
    const heading = 0;
    const object = new THREE.Group();
    object.position.set(x, this.world.terrain.heightAt(x, z), z);
    object.rotation.y = heading;
    object.add(placeholders.shelter());
    loadModel('shelter').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = child.receiveShadow = true));
      object.clear();
      object.add(model);
    });
    this.scene.add(object);
    this.world.grass.clear(x, z, ROOM);

    // The sides and back block you; the open front lets you walk in.
    const toWorld = (lx, lz) => ({
      x: x + lx * Math.cos(heading) + lz * Math.sin(heading),
      z: z - lx * Math.sin(heading) + lz * Math.cos(heading),
    });
    const obstacles = [
      ...[-1.5, 1.5].flatMap((lx) => [-0.95, 0, 0.95].map((lz) => ({ ...toWorld(lx, lz), radius: 0.4 }))),
      { ...toWorld(0, -1.55), radius: 0.5 },
    ];
    this.world.obstacles.push(...obstacles);
    this.all.push({ x, z, heading, object, obstacles });
  }

  // The shelter whose roof (x, z) is under, if any.
  around(x, z) {
    return this.all.find((s) => {
      const dx = x - s.x;
      const dz = z - s.z;
      const lx = dx * Math.cos(s.heading) - dz * Math.sin(s.heading);
      const lz = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
      return Math.abs(lx) < 1.2 && lz > -1.3 && lz < 1.4;
    });
  }

  // Removes every shelter, for a new game.
  reset() {
    for (const shelter of this.all) {
      this.scene.remove(shelter.object);
      for (const o of shelter.obstacles) this.world.obstacles.splice(this.world.obstacles.indexOf(o), 1);
    }
    this.all = [];
  }
}
