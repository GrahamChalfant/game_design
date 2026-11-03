import * as THREE from 'three';
import * as placeholders from './placeholders.js';
import { loadModel } from './models.js';
import { ARROW_ARC, arrowFlight, arrowHitTest, hitAnimal } from './hunting.js';

const LAUNCH_HEIGHT = 1.3; // meters above the ground an arrow leaves the bow
const LAND_HEIGHT = 0.1; // ...and where it comes down, if it hits nothing
// How tall each animal is, for whether an arrow passes over it (as a multiple of its radius).
const HEIGHT_PER_RADIUS = 2.6;

// Arrows in flight. Each arcs from the bow to the spot it was aimed at (or as far as the
// draw sends it), at a speed you can follow. One that hits an animal stays stuck in it; one
// that hits nothing lands in the ground, where it can be picked up again (see onLand).
export class Arrows {
  constructor(scene, world, animals) {
    this.scene = scene;
    this.world = world;
    this.animals = animals;
    this.flying = [];
    this.onKill = () => {};
    this.onHit = () => {}; // (animal) hit but not killed
    this.onLand = () => {}; // (x, z) an arrow came down here without hitting anything
    // arrow.glb points along +z from its nock, like the stand-in, so both turn the same way.
    this.model = null;
    loadModel('arrow').then((model) => (this.model = model));
  }

  // Shoots from (x, z) toward (targetX, targetZ), with the bow drawn `draw` (0–1) of the way.
  fire(x, z, targetX, targetZ, draw) {
    const { speed, range } = arrowFlight(draw);
    const facing = Math.atan2(targetX - x, targetZ - z);
    const distance = Math.min(range, Math.max(2, Math.hypot(targetX - x, targetZ - z)));
    const object = new THREE.Group();
    const shaft = this.model ? this.model.clone() : placeholders.arrow();
    if (this.model) shaft.position.z = -0.35; // centre the shaft on the flight point (origin is at the nock)
    object.add(shaft);
    object.rotation.order = 'YXZ';
    this.scene.add(object);
    const start = this.world.terrain.heightAt(x, z) + LAUNCH_HEIGHT;
    const endX = x + Math.sin(facing) * distance;
    const endZ = z + Math.cos(facing) * distance;
    const end = this.world.terrain.heightAt(endX, endZ) + LAND_HEIGHT;
    const arrow = { x, z, x0: x, z0: z, facing, dx: Math.sin(facing), dz: Math.cos(facing), speed, distance, travelled: 0, start, end, object };
    this.place(arrow);
    this.flying.push(arrow);
  }

  // How high the arrow is `s` meters along its flight: a gentle arc from the bow to the ground.
  heightAt(arrow, s) {
    const u = s / arrow.distance;
    return arrow.start + (arrow.end - arrow.start) * u + arrow.distance * ARROW_ARC * 4 * u * (1 - u);
  }

  place(arrow) {
    const y = this.heightAt(arrow, arrow.travelled);
    arrow.object.position.set(arrow.x, y, arrow.z);
    // Point along the way it's flying: nose up at first, nose down as it comes in.
    const ahead = this.heightAt(arrow, Math.min(arrow.distance, arrow.travelled + 0.2)) - y;
    const behind = y - this.heightAt(arrow, Math.max(0, arrow.travelled - 0.2));
    const slope = (arrow.travelled > 0.2 ? behind : ahead) / 0.2;
    arrow.object.rotation.set(-Math.atan(slope), arrow.facing, 0);
  }

  update(dt) {
    for (const arrow of [...this.flying]) {
      const step = Math.min(arrow.speed * dt, arrow.distance - arrow.travelled);
      const nx = arrow.x + arrow.dx * step;
      const nz = arrow.z + arrow.dz * step;
      // Animals it passes low enough to hit.
      const y = this.heightAt(arrow, arrow.travelled + step / 2);
      const low = this.animals.all.filter((animal) => !animal.dead && y - animal.position.y < animal.radius * HEIGHT_PER_RADIUS);
      const hit = arrowHitTest(arrow.x, arrow.z, nx, nz, low);
      // Trees and boulders stop arrows too.
      const blocked = !this.world.obstacles.isClear(nx, nz, 0);
      [arrow.x, arrow.z] = [nx, nz];
      arrow.travelled += step;
      this.place(arrow);
      if (hit) {
        this.stick(arrow, hit);
        if (hitAnimal(hit)) {
          this.animals.kill(hit, arrow.dx, arrow.dz);
          this.onKill(hit);
        } else this.onHit(hit);
      } else if (blocked || arrow.travelled >= arrow.distance - 1e-6) {
        this.remove(arrow);
        // Glances off a tree or rock and drops at its foot; otherwise sticks in the ground.
        const back = blocked ? 0.6 : 0;
        this.onLand(arrow.x - arrow.dx * back, arrow.z - arrow.dz * back);
      }
    }
  }

  // Leaves the arrow stuck in the animal it hit (it goes when the animal does).
  stick(arrow, animal) {
    this.flying.splice(this.flying.indexOf(arrow), 1);
    animal.object.attach(arrow.object);
    arrow.object.translateZ(-0.25); // in a little way
  }

  remove(arrow) {
    this.scene.remove(arrow.object);
    this.flying.splice(this.flying.indexOf(arrow), 1);
  }

  reset() {
    for (const arrow of this.flying) this.scene.remove(arrow.object);
    this.flying = [];
  }
}
