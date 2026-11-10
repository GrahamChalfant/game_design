import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';
import { whenIconReady } from './itemIcons.js';
import { SpatialGrid } from './grid.js';

// Items that lie in the world like any other prop, with no floating icon above them.
const NO_ICON = new Set(['stone', 'stick']);
// Items that lie tipped over rather than upright (applied to the model and its stand-in alike).
const GROUND_TILT = { backpack: [0, 0.5, -0.25] };
const MERGE_DISTANCE = 1; // dropping next to a pile of the same item adds to it
// What some items look like lying on the ground: [stand-in, Blender model name, model scale].
// Items not listed here just show their floating icon.
const GROUND_MODELS = {
  wood: [placeholders.logPile, 'logs'],
  stick: [placeholders.sticks, 'sticks'],
  axe: [placeholders.axeOnGround, 'axe-ground'],
  backpack: [placeholders.backpack, 'backpack'], // same mesh as the worn player-pack in player.glb (#67)
  stone: [placeholders.stone, 'stone', 2.5], // stone.glb is life-size (~10 cm): scaled up to be visible
  berries: [placeholders.stone, 'berry', 4], // berry.glb is a single life-size berry: scaled up to be visible
};

// Items lying on the ground (e.g. logs that didn't fit in your inventory, or loose stones),
// each shown with a floating icon so they're easy to spot. A big map has thousands of them,
// so a pile only gets its 3D object when the player comes within SHOW_DISTANCE.
const SHOW_DISTANCE = 70;
const HIDE_DISTANCE = 90; // a little further, so piles at the edge don't flicker in and out
const models = new Map(); // model name → promise of the loaded model, loaded once and copied

export class Pickups {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.grid = new SpatialGrid();
    this.shown = new Set(); // piles with a 3D object in the scene
    this.lastCheck = null;
  }

  // Every pile on the ground.
  get piles() {
    return [...this.grid];
  }

  // Leaves `count` of `item` on the ground at (x, z). Returns false if that spot is in
  // the lake (nothing is dropped there). `extra` is kept on the pile (a dropped backpack's
  // `contents`), which then doesn't merge with another.
  drop(item, count, x, z, extra = null) {
    if (this.world.terrain.waterDepth(x, z) > 0) return false;
    const existing = extra ? null : this.find(item, x, z, MERGE_DISTANCE);
    if (existing) {
      existing.count += count;
      return true;
    }
    const pile = { item, count, x, z, radius: 0, object: null, icon: null, bob: Math.random() * 10, ...extra };
    this.grid.add(pile);
    this.world.grass.clear(x, z, 0.6);
    // Show it right away if it's near the player (e.g. something they just dropped).
    if (this.lastCheck && Math.hypot(x - this.lastCheck.x, z - this.lastCheck.z) < SHOW_DISTANCE) this.show(pile);
    return true;
  }

  // The nearest pile of `item` within `reach` of (x, z), or null.
  find(item, x, z, reach) {
    let best = null;
    for (const pile of this.grid.near(x, z, reach)) {
      if (pile.item !== item) continue;
      const distance = Math.hypot(pile.x - x, pile.z - z);
      if (distance < reach) [best, reach] = [pile, distance];
    }
    return best;
  }

  // Makes the pile's 3D object: its model (if it has one) and floating icon.
  show(pile) {
    const object = new THREE.Group();
    object.position.set(pile.x, this.world.terrain.heightAt(pile.x, pile.z), pile.z);
    if (GROUND_MODELS[pile.item]) {
      const [placeholder, modelName, modelScale = 1] = GROUND_MODELS[pile.item];
      const shown = new THREE.Group();
      if (GROUND_TILT[pile.item]) shown.rotation.set(...GROUND_TILT[pile.item]);
      shown.add(placeholder());
      if (!models.has(modelName)) models.set(modelName, loadModel(modelName));
      models.get(modelName).then((model) => {
        if (!model || pile.object !== object) return;
        const copy = model.clone();
        copy.scale.setScalar(modelScale);
        shown.clear();
        shown.add(copy);
      });
      object.add(shown);
    }
    pile.icon = NO_ICON.has(pile.item) ? null : iconSprite(pile.item);
    if (pile.icon) object.add(pile.icon);
    pile.object = object;
    this.scene.add(object);
    this.shown.add(pile);
  }

  hide(pile) {
    if (!pile.object) return;
    this.scene.remove(pile.object);
    pile.icon?.material.map.dispose();
    pile.icon?.material.dispose();
    pile.object = pile.icon = null;
    this.shown.delete(pile);
  }

  // The pile nearest to (x, z), if one is within `reach`.
  near(x, z, reach) {
    let best = null;
    let bestDistance = reach;
    for (const pile of this.grid.near(x, z, reach)) {
      const distance = Math.hypot(pile.x - x, pile.z - z);
      if (distance < bestDistance) {
        best = pile;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Every pile within `reach` of (x, z), nearest first.
  within(x, z, reach) {
    return [...this.grid.near(x, z, reach)]
      .map((pile) => [pile, Math.hypot(pile.x - x, pile.z - z)])
      .filter(([, distance]) => distance < reach)
      .sort((a, b) => a[1] - b[1])
      .map(([pile]) => pile);
  }

  // Puts as much of the pile as fits into the inventory. Returns how many were taken.
  pickUp(pile, inventory) {
    const taken = pile.count - inventory.add(pile.item, pile.count);
    pile.count -= taken;
    if (pile.count === 0) this.remove(pile);
    return taken;
  }

  remove(pile) {
    this.hide(pile);
    this.grid.remove(pile);
  }

  // Bobs the floating icons, and shows the piles near (x, z) and hides the far ones.
  update(time, x, z) {
    for (const pile of this.shown) if (pile.icon) pile.icon.position.y = 1 + Math.sin(time * 2 + pile.bob) * 0.08;
    if (this.lastCheck && Math.hypot(x - this.lastCheck.x, z - this.lastCheck.z) < 4) return;
    this.lastCheck = { x, z };
    for (const pile of this.shown) {
      if (Math.hypot(pile.x - x, pile.z - z) > HIDE_DISTANCE) this.hide(pile);
    }
    for (const pile of this.grid.near(x, z, SHOW_DISTANCE)) {
      if (!pile.object && Math.hypot(pile.x - x, pile.z - z) < SHOW_DISTANCE) this.show(pile);
    }
  }

  // Removes everything on the ground, for a new game.
  reset() {
    for (const pile of [...this.shown]) this.hide(pile);
    this.grid.clear();
    this.lastCheck = null;
  }
}

// A floating picture of the item (its inventory icon), always facing the camera.
function iconSprite(item) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20, 30, 40, 0.6)';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  whenIconReady(item, (icon) => {
    ctx.drawImage(icon, 18, 18, 92, 92);
    texture.needsUpdate = true;
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.setScalar(0.7);
  return sprite;
}
