import * as THREE from 'three';
import { HIDDEN, instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { seeThroughMaterial } from './seeThrough.js';
import { needleMaterial, paintedSurface, softFoliage } from './look.js';
import { SpatialGrid } from './grid.js';

// How much wood each kind of tree gives, how long it takes to chop (seconds of holding),
// and how big its stump is (1 is the size of stump.glb, whose cut top is 0.26 m across in
// radius: each is the tree's own trunk at its base, measured from its model, a little over).
const KINDS = {
  pine: { wood: 4, chopTime: 2.5, stump: 0.58 },
  'pine-small': { wood: 2, chopTime: 1.5, stump: 0.31 },
  'pine-skinny': { wood: 3, chopTime: 2, stump: 0.31 },
  'pine-tall': { wood: 6, chopTime: 3.5, stump: 0.75 },
  'pine-wide': { wood: 5, chopTime: 3, stump: 0.76 },
  'pine-snow': { wood: 4, chopTime: 2.5, stump: 0.55 },
  'pine-small-snow': { wood: 2, chopTime: 1.5, stump: 0.31 },
  'sapling-pine': { wood: 1, chopTime: 0.8, stump: 0.2 },
  'tree-dead': { wood: 3, chopTime: 2, stump: 0.78 },
};
// Each tree is multiplied by one of these, so the forest isn't all one green.
// Cool blue-greens, mostly, and the odd warmer one.
const TREE_TINTS = [0xffffff, 0xd6e4d2, 0xb2cac6, 0xc2d2cc, 0xa6c0b8, 0xe2e2c6].map((hex) => new THREE.Color(hex));
const UNTINTED = new Set(['tree-dead']); // bare wood stays its own colour
// Meters from the player within which spruce are drawn in full detail (their needle cards).
const DETAIL_RADIUS = 26;
const DETAIL_FADE = 7; // ...fading in from the plain ones over the last this many meters, not popping in
const STUMP_RADIUS = 0.35;
const STUMP_HEIGHT = 0.45;
const FALL_TIME = 1.3; // seconds to topple over
const VANISH_TIME = 0.5; // seconds to shrink away once it's down

// All the choppable trees: places them, tracks chopping, and animates them falling.
export class Trees {
  constructor(scene) {
    this.scene = scene;
    this.all = [];
    this.grid = new SpatialGrid(); // for finding the tree in front of the player quickly
    this.falling = [];
  }

  // `spots` are { x, y, z, rotation, scale, obstacle }, one per tree of this kind.
  add(kind, placeholder, spots) {
    const transforms = spots.map((spot) => treeMatrix(spot, 0, null));
    // Trees get a see-through hole wherever they'd hide the player.
    const tints = UNTINTED.has(kind) ? undefined : spots.map(treeTint);
    // (A model's needle cards are painted with see-through needles.)
    const prepare = (material) => {
      const result = seeThroughMaterial(material.name.startsWith('needles') ? needleMaterial(material) : material);
      return kind === 'tree-dead' ? paintedSurface(result, 'wood') : softFoliage(result);
    };
    // The spruce near the player are the needle-card ones (public/models/near/),
    // the rest the plain ones: the same boughs in the same places, just simpler.
    const detail = kind !== 'tree-dead' ? { name: `near/${kind}`, radius: DETAIL_RADIUS, fade: DETAIL_FADE } : undefined;
    const trees = instancedModel(kind, placeholder, transforms, prepare, tints, undefined, detail);
    // Stumps start hidden, so tell them where they belong on the map.
    const stumps = instancedModel('stump', placeholders.stump(), spots.map(() => HIDDEN.clone()), undefined, undefined, spots);
    this.scene.add(trees, stumps);

    spots.forEach((spot, index) => {
      const tree = { ...KINDS[kind], kind, index, spot, trees, stumps, x: spot.x, z: spot.z, radius: spot.obstacle.radius };
      this.all.push(tree);
      this.grid.add(tree);
      this.resetTree(tree);
    });
  }

  // The standing tree closest to (x, z), if one is within `reach` of its trunk.
  findTarget(x, z, reach) {
    let best = null;
    let bestDistance = Infinity;
    for (const tree of this.grid.near(x, z, reach)) {
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
    this.falling.push(tree);
    // Fall away from the player.
    const away = new THREE.Vector3(tree.spot.x - fromX, 0, tree.spot.z - fromZ).normalize();
    tree.fallAxis = new THREE.Vector3(0, 1, 0).cross(away).normalize();
    tree.spot.obstacle.radius = STUMP_RADIUS * tree.spot.scale * tree.stump;
    tree.spot.obstacle.top = tree.spot.y + STUMP_HEIGHT * tree.spot.scale * stumpHeight(tree.stump); // the player can jump onto it
    tree.stumps.setInstance(tree.index, stumpMatrix(tree.spot, tree.stump));
    return true;
  }

  // How far through chopping `tree` is, from 0 to 1.
  progress(tree) {
    return Math.min(1, tree.chopped / tree.chopTime);
  }

  update(dt) {
    for (const tree of this.falling) {
      tree.fallTime += dt;
      const fall = Math.min(1, tree.fallTime / FALL_TIME);
      const angle = (Math.PI / 2) * fall * fall; // speeds up as it goes, like a real tree
      const shrink = 1 - Math.min(1, Math.max(0, tree.fallTime - FALL_TIME) / VANISH_TIME);
      tree.trees.setInstance(tree.index, treeMatrix(tree.spot, angle, tree.fallAxis, shrink));
      if (shrink === 0) tree.state = 'stump';
    }
    this.falling = this.falling.filter((tree) => tree.state === 'falling');
  }

  // Puts every tree back, for a new game.
  reset() {
    this.falling = [];
    for (const tree of this.all) this.resetTree(tree);
  }

  resetTree(tree) {
    tree.state = 'standing';
    tree.chopped = 0;
    tree.spot.obstacle.radius = tree.radius;
    tree.spot.obstacle.top = undefined;
    tree.trees.setInstance(tree.index, treeMatrix(tree.spot, 0, null));
    tree.stumps.setInstance(tree.index, HIDDEN);
  }
}

// A shade for the tree at this spot: the same spot always gets the same one.
function treeTint({ x, z }) {
  const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  const shade = Math.abs(Math.sin(x * 39.346 + z * 11.135) * 24634.6345) % 1;
  const tint = TREE_TINTS[Math.floor(hash * TREE_TINTS.length)];
  return tint.clone().multiplyScalar(0.82 + shade * 0.33);
}

// Position, tilt (while falling) and size for one tree.
// A stump as wide as the tree's trunk, but cut at a height an axe leaves (knee high or so),
// not shrunk as short as it is narrow.
const stumpHeight = (width) => Math.min(1, width + 0.4);
function stumpMatrix(spot, width) {
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.rotation);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(spot.x, spot.y, spot.z),
    spin,
    new THREE.Vector3(spot.scale * width, spot.scale * stumpHeight(width), spot.scale * width),
  );
}

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
