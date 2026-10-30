import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// Fuel is measured in in-game minutes of burning.
const START_FUEL = 120; // a new fire burns for 2 in-game hours...
const FUEL_PER_WOOD = 60; // ...and each extra log adds 1 hour
const MAX_FUEL = 8 * 60;
const RADIUS = 0.7; // the player can't walk through a fire

// Campfires the player has built: placing them, burning fuel, flames and firelight.
export class Campfires {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.fires = [];
  }

  // True if there's room for a fire at (x, z): dry ground, nothing in the way.
  canBuildAt(x, z) {
    return (
      this.world.terrain.waterDepth(x, z) === 0 &&
      this.world.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + RADIUS + 0.2)
    );
  }

  build(x, z) {
    const object = new THREE.Group();
    object.position.set(x, this.world.terrain.heightAt(x, z), z);

    const pit = new THREE.Group();
    pit.add(placeholders.campfire());
    loadModel('campfire').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = child.receiveShadow = true));
      pit.clear();
      pit.add(model);
    });

    const flames = placeholders.flames();
    flames.position.y = 0.15;
    const light = new THREE.PointLight(0xff9a3c, 0, 12, 1.6);
    light.position.y = 0.9;
    object.add(pit, flames, light);
    this.scene.add(object);

    this.world.grass.clear(x, z, RADIUS + 0.5);
    const obstacle = { x, z, radius: RADIUS };
    this.world.obstacles.push(obstacle);
    const fire = { x, z, fuel: START_FUEL, object, pit, flames, light, obstacle, flicker: Math.random() * 100 };
    this.fires.push(fire);
    return fire;
  }

  // The fire nearest to (x, z), if one is within `reach` of its edge.
  near(x, z, reach) {
    let best = null;
    let bestDistance = Infinity;
    for (const fire of this.fires) {
      const distance = Math.hypot(fire.x - x, fire.z - z) - RADIUS;
      if (distance < reach && distance < bestDistance) {
        best = fire;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Adds one log. Returns false if the fire is already as big as it gets.
  addWood(fire) {
    if (fire.fuel > MAX_FUEL - FUEL_PER_WOOD) return false;
    fire.fuel = Math.max(fire.fuel, 0) + FUEL_PER_WOOD;
    return true;
  }

  // `gameMinutes` is how much in-game time passed this frame; `time` is for animation.
  update(gameMinutes, time) {
    for (const fire of this.fires) {
      fire.fuel = Math.max(0, fire.fuel - gameMinutes);
      const burning = fire.fuel > 0;
      // Fires shrink in their last half hour before going out.
      const strength = Math.min(1, fire.fuel / 30);
      const t = time * 9 + fire.flicker;
      const flicker = 0.85 + Math.sin(t) * 0.08 + Math.sin(t * 2.3) * 0.05 + Math.sin(t * 5.1) * 0.03;

      fire.flames.visible = burning;
      fire.flames.children.forEach((flame, i) => {
        const wobble = 1 + Math.sin(t * 1.3 + i * 2.1) * 0.15;
        flame.scale.set(strength, strength * flicker * wobble, strength);
      });
      fire.light.intensity = burning ? 18 * strength * flicker : 0;
      // Burnt-out logs turn dark.
      fire.pit.traverse((child) => {
        if (child.userData.burns) child.material.color.setHex(burning ? 0x6b4a32 : 0x2a2420);
      });
    }
  }

  // Removes every fire, for a new game.
  reset() {
    for (const fire of this.fires) {
      this.scene.remove(fire.object);
      this.world.obstacles.splice(this.world.obstacles.indexOf(fire.obstacle), 1);
    }
    this.fires = [];
    this.world.grass.restore();
  }
}

// "2h 30m" of fuel left.
export function formatFuel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.floor(minutes % 60);
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}
