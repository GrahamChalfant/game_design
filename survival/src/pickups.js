import * as THREE from 'three';
import { ITEMS } from './inventory.js';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const MERGE_DISTANCE = 1; // dropping next to a pile of the same item adds to it
// What some items look like lying on the ground: [stand-in, Blender model name].
// Items not listed here just show their floating icon.
const GROUND_MODELS = {
  wood: [placeholders.logPile, 'logs'],
  axe: [placeholders.axeOnGround, 'axe-ground'],
  backpack: [placeholders.backpack, 'backpack'],
};

// Items lying on the ground (e.g. logs that didn't fit in your inventory),
// each shown with a floating icon so they're easy to spot.
export class Pickups {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.piles = [];
  }

  // Leaves `count` of `item` on the ground at (x, z). Returns false if that spot is in
  // the lake (nothing is dropped there).
  drop(item, count, x, z) {
    if (this.world.terrain.waterDepth(x, z) > 0) return false;
    const existing = this.piles.find(
      (p) => p.item === item && Math.hypot(p.x - x, p.z - z) < MERGE_DISTANCE,
    );
    if (existing) {
      existing.count += count;
      return true;
    }

    const object = new THREE.Group();
    object.position.set(x, this.world.terrain.heightAt(x, z), z);
    if (GROUND_MODELS[item]) {
      const [placeholder, modelName] = GROUND_MODELS[item];
      const shown = new THREE.Group();
      shown.add(placeholder());
      loadModel(modelName).then((model) => {
        if (!model) return;
        shown.clear();
        shown.add(model);
      });
      object.add(shown);
    }
    const icon = iconSprite(ITEMS[item].icon);
    object.add(icon);
    this.scene.add(object);
    this.world.grass.clear(x, z, 0.6);
    this.piles.push({ item, count, x, z, object, icon, bob: Math.random() * 10 });
    return true;
  }

  // The pile nearest to (x, z), if one is within `reach`.
  near(x, z, reach) {
    let best = null;
    let bestDistance = reach;
    for (const pile of this.piles) {
      const distance = Math.hypot(pile.x - x, pile.z - z);
      if (distance < bestDistance) {
        best = pile;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Puts as much of the pile as fits into the inventory. Returns how many were taken.
  pickUp(pile, inventory) {
    const taken = pile.count - inventory.add(pile.item, pile.count);
    pile.count -= taken;
    if (pile.count === 0) this.remove(pile);
    return taken;
  }

  remove(pile) {
    this.scene.remove(pile.object);
    this.piles.splice(this.piles.indexOf(pile), 1);
  }

  update(time) {
    for (const pile of this.piles) pile.icon.position.y = 1 + Math.sin(time * 2 + pile.bob) * 0.08;
  }

  // Removes everything on the ground, for a new game.
  reset() {
    for (const pile of this.piles) this.scene.remove(pile.object);
    this.piles = [];
  }
}

// A floating picture of the item (its emoji), always facing the camera.
function iconSprite(emoji) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20, 30, 40, 0.6)';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '72px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.setScalar(0.7);
  return sprite;
}
