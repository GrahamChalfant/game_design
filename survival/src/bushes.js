import * as THREE from 'three';
import { HIDDEN, instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { seeThroughMaterial } from './seeThrough.js';
import { leafMaterial, softFoliage } from './look.js';
import { bushSpots, hasBerries, pickBush } from './foraging.js';
import { REGIONS } from './layout.js';

// Berry bushes around the wreck (issue #74). Rules and numbers are in foraging.js.
// Drawn like the trees (trees.js): every bush one copy of berry-bush.glb (stems and leaf cards,
// made by blender/berry_bush.py) and one of berry-bush-berries.glb, its bunches of berries,
// hidden while it's been picked; only the copies in the chunks round the player are drawn.
// Each bush is a little bigger or smaller and a shade lighter or darker than the next.
const BUSH_TINTS = [0xffffff, 0xe4ead6, 0xd2dcc8, 0xf0e8d0].map((hex) => new THREE.Color(hex));
const spotHash = (x, z, a, b) => Math.abs(Math.sin(x * a + z * b) * 43758.5453) % 1;

export class Bushes {
  constructor(scene, world, random) {
    this.scene = scene;
    this.all = [];
    const isFree = (x, z) =>
      x > world.bounds.minX + 2 && x < world.bounds.maxX - 2 && z > world.bounds.minZ + 2 && z < world.bounds.maxZ - 2 &&
      world.terrain.waterDepth(x, z) === 0 &&
      !world.terrain.crashTrail.near(x, z, 1.5) && // (nothing grows where the plane skidded)
      world.obstacles.isClear(x, z, 0.8);
    const regional = { bounds: world.bounds, berriesAt: (x, z) => REGIONS[world.regionAt(x, z)]?.berries ?? 1 };
    const transforms = [];
    const tints = [];
    for (const { x, z } of bushSpots(random, isFree, regional)) {
      const turn = random.range(0, Math.PI * 2);
      const size = 0.88 + spotHash(x, z, 12.9898, 78.233) * 0.26;
      transforms.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, world.terrain.heightAt(x, z), z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn),
        new THREE.Vector3(size, size, size),
      ));
      const tint = BUSH_TINTS[Math.floor(spotHash(x, z, 39.346, 11.135) * BUSH_TINTS.length)];
      tints.push(tint.clone().multiplyScalar(0.9 + spotHash(x, z, 7.13, 91.7) * 0.2));
      world.grass.clear(x, z, 0.8);
      world.obstacles.add({ x, z, radius: 0.45, height: 0.9 }); // (an arrow flies over it)
      this.all.push({ x, z, index: this.all.length, pickedAt: null, shown: true });
    }
    this.transforms = transforms;
    // Lit like the spruce: the leaves as soft rounded masses, everything with the see-through
    // hole (where it'd hide the player) and the trees' grain.
    const prepare = (material) => material.name.startsWith('bush-leaves')
      ? softFoliage(seeThroughMaterial(leafMaterial(material)))
      : seeThroughMaterial(material);
    const standIn = placeholders.berryBush();
    const standInBerries = standIn.userData.berries;
    standIn.remove(standInBerries);
    this.bushes = instancedModel('berry-bush', standIn, transforms, prepare, tints);
    this.berries = instancedModel('berry-bush-berries', standInBerries, transforms, prepare);
    scene.add(this.bushes, this.berries);
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
    for (const bush of this.all) {
      const show = hasBerries(bush, now);
      if (show === bush.shown) continue;
      bush.shown = show;
      this.berries.setInstance(bush.index, show ? this.transforms[bush.index] : HIDDEN);
    }
  }

  reset() {
    for (const bush of this.all) bush.pickedAt = null;
  }
}
