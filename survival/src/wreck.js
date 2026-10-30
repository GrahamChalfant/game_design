import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// Where the plane came down, relative to the player's starting point (0, 0).
// The player starts just south of it, facing the wreck.
const PLANE = { x: 0.5, z: -6, heading: 0.6 }; // heading: which way the nose points (radians)
const WING = { x: -5.5, z: -9, heading: 2.2 }; // the wing that broke off
// Where the starting items lie around the wreckage.
export const START_ITEMS = [
  { item: 'axe', x: -3.6, z: -6.8 },
  { item: 'backpack', x: 2.8, z: -3.2 },
];

// The crashed bush plane at the start: the plane, its broken-off wing, a few
// scattered bits of debris and a wisp of smoke from the engine.
export function buildWreck(scene, world) {
  const place = (object, { x, z, heading }) => {
    object.position.set(x, world.terrain.heightAt(x, z), z);
    object.rotation.y = heading;
    scene.add(object);
  };

  const plane = new THREE.Group();
  plane.add(placeholders.crashedPlane());
  loadModel('plane').then((model) => {
    if (!model) return;
    model.traverse((child) => (child.castShadow = child.receiveShadow = true));
    plane.clear();
    plane.add(model);
  });
  place(plane, PLANE);
  place(placeholders.brokenWing(), WING);
  for (const [x, z, heading] of [[3.5, -8.5, 0.4], [-1.8, -2.4, 2.1], [4.6, -5, 1.2]]) {
    place(placeholders.debris(), { x, z, heading });
  }

  // The plane blocks the player: a row of circles along the body, plus the wing.
  const along = new THREE.Vector2(Math.sin(PLANE.heading), Math.cos(PLANE.heading));
  for (let d = -3; d <= 3; d += 1.5) {
    world.obstacles.push({ x: PLANE.x + along.x * d, z: PLANE.z + along.y * d, radius: 1 });
  }
  world.obstacles.push({ x: WING.x, z: WING.z, radius: 1.6 });

  // The crash flattened the grass.
  world.grass.clear(PLANE.x, PLANE.z, 6);
  world.grass.clear(WING.x, WING.z, 3);

  const enginePosition = new THREE.Vector3(PLANE.x + along.x * 3.3, 0, PLANE.z + along.y * 3.3);
  enginePosition.y = world.terrain.heightAt(enginePosition.x, enginePosition.z) + 0.8;
  const smoke = new Smoke(scene, enginePosition);

  return { update: (dt) => smoke.update(dt) };
}

const PUFFS = 40;

// Thin grey smoke drifting up from the engine.
class Smoke {
  constructor(scene, origin) {
    this.origin = origin;
    this.ages = Array.from({ length: PUFFS }, (_, i) => (i / PUFFS) * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFFS * 3), 3));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x5a5a5a,
        size: 1.4,
        map: softDot(),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.update(0);
  }

  update(dt) {
    const positions = this.points.geometry.attributes.position;
    for (let i = 0; i < PUFFS; i++) {
      this.ages[i] = (this.ages[i] + dt) % 6; // each puff rises for 6 seconds, then starts again
      const age = this.ages[i];
      positions.setXYZ(
        i,
        this.origin.x + Math.sin(i * 2.4) * 0.2 + age * 0.35, // drifts a little downwind
        this.origin.y + age * 1.1,
        this.origin.z + Math.cos(i * 1.7) * 0.2,
      );
    }
    positions.needsUpdate = true;
  }
}

function softDot() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
