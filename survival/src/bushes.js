import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';
import { bushSpots, hasBerries, pickBush } from './foraging.js';

// Berry bushes around the wreck (issue #74). Rules and numbers are in foraging.js.
// berry-bush.glb, when it lands, should have a child named "berries" to hide once picked.
export class Bushes {
  constructor(scene, world, random) {
    this.scene = scene;
    this.all = [];
    const isFree = (x, z) =>
      Math.abs(x) < world.size / 2 - 2 && Math.abs(z) < world.size / 2 - 2 &&
      world.terrain.waterDepth(x, z) === 0 &&
      world.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + 0.8);
    for (const { x, z } of bushSpots(random, isFree)) {
      const object = new THREE.Group();
      object.position.set(x, world.terrain.heightAt(x, z), z);
      object.rotation.y = random.range(0, Math.PI * 2);
      const body = placeholders.berryBush();
      object.add(body);
      scene.add(object);
      world.grass.clear(x, z, 0.8);
      world.obstacles.push({ x, z, radius: 0.45 });
      this.all.push({ x, z, pickedAt: null, object, berries: body.userData.berries });
    }
    loadModel('berry-bush').then((model) => {
      if (!model) return;
      for (const bush of this.all) {
        bush.object.clear();
        const copy = model.clone();
        bush.object.add(copy);
        bush.berries = copy.getObjectByName('berries') ?? null;
      }
    });
  }

  // The nearest bush within `reach` of (x, z), or null.
  near(x, z, reach) {
    let best = null;
    for (const bush of this.all) {
      const d = Math.hypot(bush.x - x, bush.z - z);
      if (d < reach) [best, reach] = [bush, d];
    }
    return best;
  }

  pick(bush, now) {
    return pickBush(bush, now);
  }

  // Shows or hides each bush's berries for the game time `now` (in minutes).
  update(now) {
    for (const bush of this.all) if (bush.berries) bush.berries.visible = hasBerries(bush, now);
  }

  reset() {
    for (const bush of this.all) bush.pickedAt = null;
  }
}
