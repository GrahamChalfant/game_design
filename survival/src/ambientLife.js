import * as THREE from 'three';

// Little lives going on around you, just for the feel of the place: flocks of birds flying
// over by day, butterflies over the meadows, and fireflies blinking in the dark. They all
// stay around the player, so there's always some about.
const FLOCKS = 2;
const BIRDS_PER_FLOCK = [5, 9];
const BIRD_SPEED = 9; // m/s
const BIRD_HEIGHT = [7, 11]; // meters above the ground
const BIRD_RANGE = 90; // a flock this far off turns up somewhere else, upwind
const BUTTERFLIES = 10;
const BUTTERFLY_RANGE = 22;
const FIREFLIES = 60;
const FIREFLY_RANGE = 24;

export class AmbientLife {
  constructor(scene, world) {
    this.world = world;
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Birds: two flapping wings each, dark against the ground.
    const birdMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2622, side: THREE.DoubleSide, roughness: 1 });
    const wingGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0.38, 0, -0.05), new THREE.Vector3(0, 0, -0.12),
    ]);
    wingGeometry.computeVertexNormals();
    this.flocks = Array.from({ length: FLOCKS }, () => {
      const count = Math.round(rand(...BIRDS_PER_FLOCK));
      const birds = Array.from({ length: count }, (_, i) => {
        const bird = new THREE.Group();
        const left = new THREE.Mesh(wingGeometry, birdMaterial);
        const right = new THREE.Mesh(wingGeometry, birdMaterial);
        right.scale.x = -1;
        bird.add(left, right, new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4).scale(1, 0.8, 2), birdMaterial));
        bird.userData = { left, right, offset: new THREE.Vector3(rand(-3, 3), rand(-1, 1), -i * 1.2 + rand(-0.5, 0.5)), flap: rand(0, 10) };
        this.group.add(bird);
        return bird;
      });
      return { birds, center: new THREE.Vector3(), heading: 0, height: 0, placed: false };
    });

    // Butterflies: two little coloured wings.
    const colors = [0xf2ecd8, 0xf0c23a, 0xe0782a, 0x8fb6e0, 0xf2ecd8];
    const butterflyWing = new THREE.PlaneGeometry(0.09, 0.07).translate(0.045, 0, 0).rotateX(-Math.PI / 2);
    this.butterflies = Array.from({ length: BUTTERFLIES }, (_, i) => {
      const material = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
      const fly = new THREE.Group();
      const left = new THREE.Mesh(butterflyWing, material);
      const right = new THREE.Mesh(butterflyWing, material);
      right.scale.x = -1;
      fly.add(left, right);
      fly.userData = { left, right, phase: rand(0, 10), home: new THREE.Vector3(), placed: false };
      this.group.add(fly);
      return fly;
    });

    // Fireflies: glowing points that drift and blink.
    const positions = new Float32Array(FIREFLIES * 3);
    const glow = new Float32Array(FIREFLIES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(glow, 3));
    this.fireflies = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: dot(), fog: false,
    }));
    this.fireflies.frustumCulled = false;
    this.fireflyState = Array.from({ length: FIREFLIES }, () => ({ placed: false, phase: rand(0, 10), speed: rand(0.6, 1.4), drift: rand(0, 10) }));
    this.group.add(this.fireflies);
  }

  // `hour` 0–24; `position` the player's; `hidden` while down a cave (none of them are there).
  update(dt, hour, position, hidden) {
    this.time += dt;
    this.group.visible = !hidden;
    if (hidden) return;
    const { terrain } = this.world;
    const day = hour > 5.5 && hour < 20;
    const dusk = hour > 20.5 || hour < 4;
    const cold = terrain.coldAt(position.x, position.z);

    // Birds fly over by day, each flock in a loose V, across the player's patch of sky.
    for (const flock of this.flocks) {
      const show = day && cold < 0.7;
      for (const bird of flock.birds) bird.visible = show;
      if (!show) {
        flock.placed = false;
        continue;
      }
      const away = Math.hypot(flock.center.x - position.x, flock.center.z - position.z);
      if (!flock.placed || away > BIRD_RANGE) {
        // Come in from the edge, heading roughly across the player's position.
        const from = rand(0, Math.PI * 2);
        flock.center.set(position.x + Math.cos(from) * BIRD_RANGE * 0.9, 0, position.z + Math.sin(from) * BIRD_RANGE * 0.9);
        flock.heading = from + Math.PI + rand(-0.5, 0.5);
        flock.height = rand(...BIRD_HEIGHT);
        flock.placed = true;
      }
      flock.heading += Math.sin(this.time * 0.3 + flock.height) * 0.1 * dt;
      flock.center.x += Math.cos(flock.heading) * BIRD_SPEED * dt;
      flock.center.z += Math.sin(flock.heading) * BIRD_SPEED * dt;
      const ground = terrain.heightAt(flock.center.x, flock.center.z);
      const facing = Math.atan2(Math.cos(flock.heading), Math.sin(flock.heading));
      for (const bird of flock.birds) {
        const { left, right, offset } = bird.userData;
        bird.userData.flap += dt * 11;
        const local = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
        bird.position.set(flock.center.x + local.x, Math.max(ground, 0) + flock.height + offset.y, flock.center.z + local.z);
        bird.rotation.y = facing;
        const flap = Math.sin(bird.userData.flap) * 0.7;
        left.rotation.z = flap;
        right.rotation.z = -flap;
      }
    }

    // Butterflies flutter over the meadows on warm days.
    for (const fly of this.butterflies) {
      const data = fly.userData;
      const meadow = terrain.forest(position.x, position.z) < 0.2 && cold < 0.2;
      fly.visible = day && meadow;
      if (!fly.visible) {
        data.placed = false;
        continue;
      }
      if (!data.placed || Math.hypot(data.home.x - position.x, data.home.z - position.z) > BUTTERFLY_RANGE) {
        const a = rand(0, Math.PI * 2);
        const r = rand(4, BUTTERFLY_RANGE * 0.9);
        data.home.set(position.x + Math.cos(a) * r, 0, position.z + Math.sin(a) * r);
        data.placed = true;
      }
      data.phase += dt;
      const t = data.phase;
      const x = data.home.x + Math.sin(t * 0.7) * 1.5 + Math.sin(t * 1.9) * 0.4;
      const z = data.home.z + Math.cos(t * 0.5) * 1.5 + Math.cos(t * 2.3) * 0.4;
      fly.position.set(x, terrain.heightAt(x, z) + 0.6 + Math.abs(Math.sin(t * 1.3)) * 0.6, z);
      fly.rotation.y = t * 0.7;
      const flap = Math.sin(t * 22) * 1.1;
      data.left.rotation.z = flap;
      data.right.rotation.z = -flap;
    }

    // Fireflies blink low over the ground on summer nights.
    this.fireflies.visible = dusk && cold < 0.3;
    if (!this.fireflies.visible) return;
    const p = this.fireflies.geometry.attributes.position;
    const c = this.fireflies.geometry.attributes.color;
    this.fireflyState.forEach((fly, i) => {
      if (!fly.placed || Math.hypot(fly.x - position.x, fly.z - position.z) > FIREFLY_RANGE) {
        const a = rand(0, Math.PI * 2);
        const r = rand(2, FIREFLY_RANGE);
        fly.x = position.x + Math.cos(a) * r;
        fly.z = position.z + Math.sin(a) * r;
        fly.y = rand(0.4, 2.2);
        fly.placed = true;
      }
      fly.drift += dt * 0.4;
      fly.x += Math.sin(fly.drift * 1.3 + i) * dt * 0.3;
      fly.z += Math.cos(fly.drift * 1.1 + i) * dt * 0.3;
      const blink = Math.max(0, Math.sin((this.time + fly.phase) * fly.speed * 2)) ** 3;
      p.setXYZ(i, fly.x, terrain.heightAt(fly.x, fly.z) + fly.y + Math.sin(fly.drift * 2) * 0.2, fly.z);
      c.setXYZ(i, 0.8 * blink, 1 * blink, 0.35 * blink);
    });
    p.needsUpdate = true;
    c.needsUpdate = true;
  }
}

const rand = (min, max) => min + Math.random() * (max - min);

// A soft round glow, for the fireflies.
function dot() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}
