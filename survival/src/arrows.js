import * as THREE from 'three';
import * as placeholders from './placeholders.js';
import { loadModel } from './models.js';
import { ARROW_GRAVITY, ARROW_HIT_PADDING, arrowFlight, hitAnimal } from './hunting.js';

// How tall each animal is, for whether an arrow passes over it (as a multiple of its radius).
const HEIGHT_PER_RADIUS = 2.6;
// Arrows are drawn bigger than life, so you can follow one in flight (a real one, 0.8 m long and
// a centimeter thick, is gone from sight in a moment), with a faint streak behind it.
const SIZE = 1.6;
const STREAK = { length: 1.8, width: 0.035, opacity: 0.4 };
const GLINT = 0.28; // meters across: a soft pale spot at the fletching, so it shows from behind too
const LIFETIME = 8; // seconds: one still flying after this (off over the edge of the map) is gone
const TREE_HEIGHT = 9; // arrows this low over a tree's trunk hit it

// Arrows in flight. Each leaves the bow aimed so it flies true to the point you aimed at (if
// it's within reach of the draw; past that it drops short), and from then on it's just thrown:
// it keeps going, and falls, until it hits an animal, a tree, a rock or the ground. One that hits
// an animal stays stuck in it; one that hits nothing lands where it came down, where it can be
// picked up again (see onLand).
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
    const streak = new THREE.PlaneGeometry(STREAK.width, STREAK.length).rotateX(-Math.PI / 2).translate(0, 0, -STREAK.length / 2);
    // (fading out along its length, toward the back)
    const colors = [];
    const position = streak.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const fade = 1 + position.getZ(i) / STREAK.length;
      colors.push(fade, fade, fade);
    }
    streak.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // (A round, soft-edged spot.)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.35, 'rgba(255,250,235,0.6)');
    glow.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 32, 32);
    this.glint = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), color: 0xfff3d6, transparent: true, opacity: 0.85, depthWrite: false });
    this.streak = { geometry: streak, material: new THREE.MeshBasicMaterial({ color: 0xfff6e0, vertexColors: true, transparent: true, opacity: STREAK.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
  }

  // Shoots from `from` (the middle of the bow, a Vector3) at the point `to`, with the bow drawn
  // `draw` (0–1) of the way.
  fire(from, to, draw) {
    const { speed, range } = arrowFlight(draw);
    // Aim at the target, or, if it's further than the arrow flies true, at the point that far
    // along the line to it.
    const sight = to.clone().sub(from);
    if (sight.length() > range) sight.setLength(range);
    const velocity = launch(sight, speed) ?? sight.clone().setLength(speed);

    const object = new THREE.Group();
    const shaft = this.model ? this.model.clone() : placeholders.arrow();
    if (this.model) shaft.position.z = -0.35; // centre the shaft on the flight point (origin is at the nock)
    object.add(shaft);
    object.scale.setScalar(SIZE);
    // Two crossed planes, so the streak shows from any side. They grow out as the arrow leaves the bow.
    const streak = new THREE.Group();
    for (const roll of [0, Math.PI / 2]) {
      const plane = new THREE.Mesh(this.streak.geometry, this.streak.material);
      plane.rotation.z = roll;
      streak.add(plane);
    }
    streak.position.z = -0.3;
    streak.scale.set(1 / SIZE, 1 / SIZE, 0.01);
    const glint = new THREE.Sprite(this.glint);
    glint.scale.setScalar(GLINT / SIZE);
    glint.position.z = -0.3;
    object.add(streak, glint);
    this.scene.add(object);
    const arrow = { position: from.clone(), velocity, travelled: 0, age: 0, object, streak, glint };
    this.place(arrow);
    this.flying.push(arrow);
  }

  // Points the arrow the way it's flying.
  place(arrow) {
    arrow.object.position.copy(arrow.position);
    arrow.object.lookAt(arrow.position.clone().add(arrow.velocity));
    arrow.streak.scale.z = Math.min(1, arrow.travelled / STREAK.length) / SIZE;
  }

  update(dt) {
    const { terrain, obstacles, bounds } = this.world;
    for (const arrow of [...this.flying]) {
      arrow.age += dt;
      const from = arrow.position.clone();
      arrow.velocity.y -= ARROW_GRAVITY * dt;
      const to = from.clone().addScaledVector(arrow.velocity, dt);
      // Whatever it hits first along this step: an animal, a tree or rock, or the ground.
      const animal = this.hitAnimal(from, to);
      const steps = Math.max(1, Math.ceil(from.distanceTo(to) / 0.25));
      let landed = null;
      let blocked = false;
      for (let i = 1; i <= steps; i++) {
        const p = from.clone().lerp(to, i / steps);
        const ground = terrain.heightAt(p.x, p.z);
        if (p.y <= ground) {
          landed = p.setY(ground);
          break;
        }
        if (p.y - ground < TREE_HEIGHT && !obstacles.isClear(p.x, p.z, 0)) {
          landed = p;
          blocked = true;
          break;
        }
      }
      if (animal && (!landed || animal.at <= from.distanceTo(landed))) {
        arrow.travelled += animal.at;
        arrow.position.copy(from).addScaledVector(to.clone().sub(from).normalize(), animal.at);
        this.place(arrow);
        this.stick(arrow, animal.animal);
        if (hitAnimal(animal.animal)) {
          const { x, z } = arrow.velocity;
          this.animals.kill(animal.animal, x, z);
          this.onKill(animal.animal);
        } else this.onHit(animal.animal);
        continue;
      }
      const end = landed ?? to;
      arrow.travelled += from.distanceTo(end);
      arrow.position.copy(end);
      this.place(arrow);
      const off = end.x < bounds.minX || end.x > bounds.maxX || end.z < bounds.minZ || end.z > bounds.maxZ;
      if (landed) {
        this.remove(arrow);
        // Glances off a tree or rock and drops at its foot; otherwise sticks in the ground.
        const back = blocked ? 0.6 : 0;
        const flat = Math.hypot(arrow.velocity.x, arrow.velocity.z) || 1;
        this.onLand(end.x - (arrow.velocity.x / flat) * back, end.z - (arrow.velocity.z / flat) * back);
      } else if (off || arrow.age > LIFETIME) {
        this.remove(arrow);
      }
    }
  }

  // The first live animal the segment from `a` to `b` passes through (close enough across, and
  // low enough): { animal, at } (how far along it), or null.
  hitAnimal(a, b) {
    const d = b.clone().sub(a);
    const flat2 = d.x * d.x + d.z * d.z || 1e-9;
    const length = d.length();
    let best = null;
    for (const animal of this.animals.all) {
      if (animal.dead) continue;
      const { x, y, z } = animal.position;
      const t = Math.max(0, Math.min(1, ((x - a.x) * d.x + (z - a.z) * d.z) / flat2));
      const across = Math.hypot(a.x + d.x * t - x, a.z + d.z * t - z);
      const height = a.y + d.y * t - y;
      if (across > animal.radius + ARROW_HIT_PADDING) continue;
      if (height < -0.1 || height > animal.radius * HEIGHT_PER_RADIUS) continue;
      if (!best || t * length < best.at) best = { animal, at: t * length };
    }
    return best;
  }

  // Leaves the arrow stuck in the animal it hit (it goes when the animal does).
  stick(arrow, animal) {
    this.flying.splice(this.flying.indexOf(arrow), 1);
    arrow.object.remove(arrow.streak, arrow.glint);
    animal.object.attach(arrow.object);
    arrow.object.translateZ(-0.4); // (the head buried in it)
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

// The velocity, at `speed`, that carries a thrown arrow through the point `sight` away (the
// flatter of the two ways up), or null if it can't reach.
function launch(sight, speed) {
  const g = ARROW_GRAVITY;
  const flat = Math.hypot(sight.x, sight.z);
  if (flat < 0.01) return null;
  const v2 = speed * speed;
  const root = v2 * v2 - g * (g * flat * flat + 2 * sight.y * v2);
  if (root < 0) return null;
  const angle = Math.atan((v2 - Math.sqrt(root)) / (g * flat));
  const across = Math.cos(angle) * speed;
  return new THREE.Vector3((sight.x / flat) * across, Math.sin(angle) * speed, (sight.z / flat) * across);
}
