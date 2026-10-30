import * as THREE from 'three';
import { HIDDEN, instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { seeThroughMaterial } from './seeThrough.js';

// How much wood each kind of tree gives, and how long it takes to chop (seconds of holding).
const KINDS = {
  pine: { wood: 4, chopTime: 2.5 },
  broadleaf: { wood: 3, chopTime: 2 },
};
const STUMP_RADIUS = 0.35;
const FALL_TIME = 1.3; // seconds to topple over
const VANISH_TIME = 0.5; // seconds to shrink away once it's down

// All the choppable trees: places them, tracks chopping, and animates them falling.
export class Trees {
  constructor(scene) {
    this.scene = scene;
    this.all = [];
  }

  // `spots` are { x, y, z, rotation, scale, obstacle }, one per tree of this kind.
  add(kind, placeholder, spots) {
    const transforms = spots.map((spot) => treeMatrix(spot, 0, null));
    // Trees get a see-through hole wherever they'd hide the player.
    const trees = instancedModel(kind, placeholder, transforms, seeThroughMaterial);
    const stumps = instancedModel('stump', placeholders.stump(), spots.map(() => HIDDEN.clone()));
    this.scene.add(trees, stumps);

    spots.forEach((spot, index) => {
      const tree = { ...KINDS[kind], kind, index, spot, trees, stumps, radius: spot.obstacle.radius };
      this.all.push(tree);
      this.resetTree(tree);
    });
  }

  // The standing tree closest to (x, z), if one is within `reach` of its trunk.
  findTarget(x, z, reach) {
    let best = null;
    let bestDistance = Infinity;
    for (const tree of this.all) {
      if (tree.state !== 'standing') continue;
      const distance = Math.hypot(tree.spot.x - x, tree.spot.z - z) - tree.radius;
      if (distance < reach && distance < bestDistance) {
        best = tree;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Chops `tree` for `dt` seconds. Returns true when it comes down.
  chop(tree, dt, fromX, fromZ) {
    tree.chopped += dt;
    if (tree.chopped < tree.chopTime) return false;

    tree.state = 'falling';
    tree.fallTime = 0;
    // Fall away from the player.
    const away = new THREE.Vector3(tree.spot.x - fromX, 0, tree.spot.z - fromZ).normalize();
    tree.fallAxis = new THREE.Vector3(0, 1, 0).cross(away).normalize();
    tree.spot.obstacle.radius = STUMP_RADIUS * tree.spot.scale;
    tree.stumps.setInstance(tree.index, treeMatrix(tree.spot, 0, null));
    return true;
  }

  // How far through chopping `tree` is, from 0 to 1.
  progress(tree) {
    return Math.min(1, tree.chopped / tree.chopTime);
  }

  update(dt) {
    for (const tree of this.all) {
      if (tree.state !== 'falling') continue;
      tree.fallTime += dt;
      const fall = Math.min(1, tree.fallTime / FALL_TIME);
      const angle = (Math.PI / 2) * fall * fall; // speeds up as it goes, like a real tree
      const shrink = 1 - Math.min(1, Math.max(0, tree.fallTime - FALL_TIME) / VANISH_TIME);
      tree.trees.setInstance(tree.index, treeMatrix(tree.spot, angle, tree.fallAxis, shrink));
      if (shrink === 0) tree.state = 'stump';
    }
  }

  // Puts every tree back, for a new game.
  reset() {
    for (const tree of this.all) this.resetTree(tree);
  }

  resetTree(tree) {
    tree.state = 'standing';
    tree.chopped = 0;
    tree.spot.obstacle.radius = tree.radius;
    tree.trees.setInstance(tree.index, treeMatrix(tree.spot, 0, null));
    tree.stumps.setInstance(tree.index, HIDDEN);
  }
}

// Position, tilt (while falling) and size for one tree.
function treeMatrix(spot, tilt, axis, shrink = 1) {
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.rotation);
  const rotation = axis ? new THREE.Quaternion().setFromAxisAngle(axis, tilt).multiply(spin) : spin;
  const size = spot.scale * shrink;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(spot.x, spot.y, spot.z),
    rotation,
    new THREE.Vector3(size, size, size),
  );
}
