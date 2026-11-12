import * as THREE from 'three';
import { HIDDEN, instancedModel } from './models.js';
import * as placeholders from './placeholders.js';
import { seeThroughMaterial } from './seeThrough.js';
import { needleMaterial, paintedSurface, softFoliage } from './look.js';
import { SpatialGrid } from './grid.js';

// Each kind of tree: how many pieces it's cut into once it's down (each a log and a couple of
// sticks: see PIECE), how long it takes to fell (seconds of holding), how big its stump is
// (1 is the size of stump.glb, whose cut top is 0.26 m across in radius: each is the tree's
// own trunk at its base, measured from its model, a little over), and how tall it stands (its
// model's height, in meters, before it's scaled). `small` ones are young enough to cut sticks
// from with a knife.
const KINDS = {
  pine: { pieces: 4, chopTime: 2.5, stump: 0.58, height: 9.4 },
  'pine-small': { pieces: 2, chopTime: 1.5, stump: 0.31, height: 3.7, small: true },
  'pine-skinny': { pieces: 3, chopTime: 2, stump: 0.31, height: 10.2 },
  'pine-tall': { pieces: 6, chopTime: 3.5, stump: 0.75, height: 14.2 },
  'pine-wide': { pieces: 5, chopTime: 3, stump: 0.76, height: 6.7 },
  'pine-snow': { pieces: 4, chopTime: 2.5, stump: 0.55, height: 9.4 },
  'pine-small-snow': { pieces: 2, chopTime: 1.5, stump: 0.31, height: 3.7, small: true },
  'sapling-pine': { pieces: 1, chopTime: 0.8, stump: 0.2, height: 1.75, small: true, sticksOnly: true },
  'tree-dead': { pieces: 3, chopTime: 2, stump: 0.78, height: 7.25 },
};
// Each tree is multiplied by one of these, so the forest isn't all one green.
// Cool blue-greens, mostly, and the odd warmer one.
const TREE_TINTS = [0xffffff, 0xd6e4d2, 0xb2cac6, 0xc2d2cc, 0xa6c0b8, 0xe2e2c6].map((hex) => new THREE.Color(hex));
const UNTINTED = new Set(['tree-dead']); // bare wood stays its own colour
// Meters from the player within which spruce are drawn in full detail (their needle cards).
const DETAIL_RADIUS = 26;
const DETAIL_FADE = 7; // ...fading in from the plain ones over the last this many meters, not popping in
// ...and meters from the player past which they're the simple ones (public/models/distant/: the
// same trees in a third of the triangles), fading over to them across the last DISTANT_FADE.
// Most of the trees in view are further off than this, each a hand high on the screen or less.
const DISTANT_RADIUS = 50;
const DISTANT_FADE = 8;
const STUMP_RADIUS = 0.35;
const STUMP_HEIGHT = 0.45;
const FALL_TIME = 1.3; // seconds to topple over
const VANISH_TIME = 0.5; // seconds to shrink away once it's all cut up
// A felled tree lies where it fell until it's cut up: each piece takes BUCK_TIME seconds of
// chopping and leaves PIECE on the ground (a sapling, just sticks).
const BUCK_TIME = 1.6;
export const PIECE = { wood: 1, stick: 2 };
export const SAPLING_PIECE = { stick: 3 };
// A young tree gives STICKS_PER_CUT sticks for each CUT_TIME seconds of cutting with a knife,
// CUTS_PER_TREE times; then it's bare of good branches.
export const CUT_TIME = 1.5;
export const STICKS_PER_CUT = 2;
const CUTS_PER_TREE = 3;
const DOWN_REACH = 1.2; // how close to a fallen trunk you need to be to cut it up

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
    const trees = treeModel(kind, placeholder, transforms, spots);
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

  // The felled tree lying nearest (x, z), if its trunk is within reach: { tree, at } where `at`
  // is the point on the trunk nearest you.
  findDown(x, z) {
    let best = null;
    let bestDistance = DOWN_REACH;
    for (const tree of this.grid.near(x, z, 16)) {
      if (tree.state !== 'down') continue;
      const length = tree.height * tree.spot.scale * 0.85; // (to where the trunk's too thin to bother)
      const { x: dx, z: dz } = tree.fallDir;
      const along = Math.max(0, Math.min(length, (x - tree.spot.x) * dx + (z - tree.spot.z) * dz));
      const at = { x: tree.spot.x + dx * along, z: tree.spot.z + dz * along };
      const distance = Math.hypot(x - at.x, z - at.z);
      if (distance < bestDistance) [best, bestDistance] = [{ tree, at }, distance];
    }
    return best;
  }

  // Chops the felled tree for `dt` seconds. Returns what a piece leaves on the ground when one
  // comes off (else null); once the last does, the tree's gone.
  buck(tree, dt) {
    tree.bucked += dt;
    if (tree.bucked < BUCK_TIME) return null;
    tree.bucked = 0;
    tree.piecesLeft -= 1;
    if (tree.piecesLeft <= 0) {
      tree.state = 'vanishing';
      tree.fallTime = FALL_TIME;
      this.falling.push(tree);
    }
    return tree.sticksOnly ? SAPLING_PIECE : PIECE;
  }

  // How far through cutting the current piece off the felled tree you are, from 0 to 1.
  buckProgress(tree) {
    return tree.bucked / BUCK_TIME;
  }

  // A young standing tree whose branches you can cut for sticks, near (x, z).
  findSmall(x, z, reach) {
    const tree = this.findTarget(x, z, reach);
    return tree?.small ? tree : null;
  }

  // Cuts at the young tree with a knife for `dt` seconds. Returns how many sticks came off
  // (0 most of the time, or if it's bare).
  cutSticks(tree, dt) {
    if (tree.cutsLeft <= 0) return 0;
    tree.cutting += dt;
    if (tree.cutting < CUT_TIME) return 0;
    tree.cutting = 0;
    tree.cutsLeft -= 1;
    return STICKS_PER_CUT;
  }

  // Chops `tree` for `dt` seconds. Returns true when it comes down.
  chop(tree, dt, fromX, fromZ) {
    tree.chopped += dt;
    if (tree.chopped < tree.chopTime) return false;

    tree.state = 'falling';
    tree.fallTime = 0;
    tree.piecesLeft = tree.pieces;
    tree.bucked = 0;
    this.falling.push(tree);
    // Fall away from the player.
    const away = new THREE.Vector3(tree.spot.x - fromX, 0, tree.spot.z - fromZ).normalize();
    tree.fallDir = { x: away.x, z: away.z };
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
      // Down, it lies there until it's cut up; then it shrinks away.
      if (tree.state === 'falling' && fall === 1) tree.state = 'down';
      const shrink = tree.state === 'vanishing' ? 1 - Math.min(1, Math.max(0, tree.fallTime - FALL_TIME) / VANISH_TIME) : 1;
      tree.trees.setInstance(tree.index, treeMatrix(tree.spot, angle, tree.fallAxis, shrink));
      if (shrink === 0) tree.state = 'stump';
    }
    this.falling = this.falling.filter((tree) => tree.state === 'falling' || tree.state === 'vanishing');
  }

  // Puts every tree back, for a new game.
  reset() {
    this.falling = [];
    for (const tree of this.all) this.resetTree(tree);
  }

  resetTree(tree) {
    tree.state = 'standing';
    tree.chopped = 0;
    tree.cutting = 0;
    tree.cutsLeft = tree.small ? CUTS_PER_TREE : 0;
    tree.spot.obstacle.radius = tree.radius;
    tree.spot.obstacle.top = undefined;
    tree.trees.setInstance(tree.index, treeMatrix(tree.spot, 0, null));
    tree.stumps.setInstance(tree.index, HIDDEN);
  }
}

// A shade for the tree at this spot: the same spot always gets the same one.
// Copies of a kind of tree, drawn the way the forest's are: `transforms` places each one and
// `places` gives its { x, z } on the map (for its tint, and the chunk it's drawn with). Also
// for trees that aren't choppable: the ones the plane knocked over (see flightPath.js).
export function treeModel(kind, placeholder, transforms, places) {
  // Trees get a see-through hole wherever they'd hide the player.
  const tints = UNTINTED.has(kind) ? undefined : places.map(treeTint);
  // (A model's needle cards are painted with see-through needles.)
  const prepare = (material) => {
    const result = seeThroughMaterial(material.name.startsWith('needles') ? needleMaterial(material) : material);
    return kind === 'tree-dead' ? paintedSurface(result, 'wood') : softFoliage(result);
  };
  // The spruce near the player are the needle-card ones (public/models/near/),
  // the rest the plain ones: the same boughs in the same places, just simpler.
  const detail = kind !== 'tree-dead' ? { name: `near/${kind}`, radius: DETAIL_RADIUS, fade: DETAIL_FADE } : undefined;
  // (Shadows are only drawn on the ground near you: a young tree that far off can't reach it.)
  const distant = { name: `distant/${kind}`, radius: DISTANT_RADIUS, fade: DISTANT_FADE, shadows: !KINDS[kind].small };
  return instancedModel(kind, placeholder, transforms, prepare, tints, places, detail, distant);
}

// How tall a kind of tree's model stands, in meters, before it's scaled.
export const treeHeight = (kind) => KINDS[kind].height;

export function treeTint({ x, z }) {
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
