import * as THREE from 'three';

// A little life going on around you, just for the feel of the place: a few birds flying over
// by day. They stay around the player, so there are some about now and then.
const FLOCKS = 1;
const BIRDS_PER_FLOCK = [3, 4];
const BIRD_SPEED = 9; // m/s
const BIRD_HEIGHT = [7, 11]; // meters above the ground
const BIRD_RANGE = 90; // a flock this far off turns up somewhere else, upwind
const GLIDE_TIME = 1.5; // seconds a bird glides between bouts of flapping
const BIRD_COLORS = [[0x26241f, 0x3a3631], [0x5d625f, 0x8a8c86]]; // [back, belly]: crows, then grey jays

export class AmbientLife {
  constructor(scene, world) {
    this.world = world;
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Birds: crows and grey jays, low-poly, with wings that bend at the wrist.
    this.flocks = Array.from({ length: FLOCKS }, (_, f) => {
      const parts = birdParts(BIRD_COLORS[f % BIRD_COLORS.length]);
      const count = Math.round(rand(...BIRDS_PER_FLOCK));
      const birds = Array.from({ length: count }, (_, i) => {
        const bird = makeBird(parts);
        bird.userData.offset = new THREE.Vector3(rand(-3, 3), rand(-1, 1), -i * 1.2 + rand(-0.5, 0.5));
        bird.userData.flap = rand(0, 10);
        bird.userData.glide = rand(0, 10); // when it next stops flapping to glide
        this.group.add(bird);
        return bird;
      });
      return { birds, center: new THREE.Vector3(), heading: 0, height: 0, placed: false };
    });

  }

  // `hour` 0–24; `position` the player's; `hidden` while down a cave (none of them are there).
  update(dt, hour, position, hidden) {
    this.time += dt;
    this.group.visible = !hidden;
    if (hidden) return;
    const { terrain } = this.world;
    const day = hour > 5.5 && hour < 20;
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
        const data = bird.userData;
        const local = data.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
        bird.position.set(flock.center.x + local.x, Math.max(ground, 0) + flock.height + data.offset.y, flock.center.z + local.z);
        bird.rotation.y = facing;
        // A few seconds of flapping, then a glide on still wings, held a little up.
        data.glide -= dt;
        if (data.glide < -GLIDE_TIME) data.glide = rand(2, 6);
        const flapping = THREE.MathUtils.smoothstep(data.glide, -0.3, 0.3);
        data.flap += dt * 10 * flapping;
        flapBird(bird, Math.sin(data.flap) * 0.75 * flapping, Math.sin(data.flap - 0.9) * 0.55 * flapping, 0.12 * (1 - flapping));
      }
    }
  }
}

const rand = (min, max) => min + Math.random() * (max - min);

// The pieces of one kind of bird, shared by its flock: a body (head, beak and tail fan on
// it), and a left wing in two parts, the inner from the shoulder to the wrist and the outer
// from the wrist to the tip. About a crow's size: 0.8 m across the wings. Faces +z.
function birdParts([back, belly]) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 1 });
  const shape = (triangles) => {
    const positions = [];
    const colors = [];
    for (const [color, ...corners] of triangles) {
      const c = new THREE.Color(color);
      for (const p of corners) {
        positions.push(...p);
        colors.push(c.r, c.g, c.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  };
  const head = [0, 0.012, 0.17];
  const top = [0, 0.04, 0.02];
  const under = [0, -0.035, 0.02];
  const left = [0.045, 0, 0.03];
  const right = [-0.045, 0, 0.03];
  const rump = [0, 0.01, -0.11];
  const beak = 0x1c1b19;
  const body = shape([
    [back, head, left, top], [back, head, top, right], [belly, head, under, left], [belly, head, right, under],
    [back, rump, top, left], [back, rump, right, top], [belly, rump, left, under], [belly, rump, under, right],
    // The beak, and the tail fanned out behind.
    [beak, [0, 0.004, 0.215], [0.013, 0.008, 0.163], [-0.013, 0.008, 0.163]],
    [beak, [0, 0.004, 0.215], [-0.013, 0.008, 0.163], [0, 0.02, 0.163]],
    [beak, [0, 0.004, 0.215], [0, 0.02, 0.163], [0.013, 0.008, 0.163]],
    [back, [0, 0.01, -0.1], [0.055, 0.005, -0.24], [0, 0.005, -0.26]],
    [back, [0, 0.01, -0.1], [0, 0.005, -0.26], [-0.055, 0.005, -0.24]],
  ]);
  const inner = shape([[back, [0, 0, 0.04], [0.19, 0, 0.03], [0.19, 0, -0.08]], [back, [0, 0, 0.04], [0.19, 0, -0.08], [0, 0, -0.07]]]);
  const outer = shape([
    [back, [0, 0, 0.03], [0.21, 0, -0.03], [0.17, 0, -0.1]], [back, [0, 0, 0.03], [0.17, 0, -0.1], [0, 0, -0.08]],
  ]);
  return { material, body, inner, outer };
}

// One bird, from its kind's parts: the wings hinge at the shoulders and bend at the wrists.
function makeBird({ material, body, inner, outer }) {
  const bird = new THREE.Group();
  bird.add(new THREE.Mesh(body, material));
  const wings = [1, -1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.035, 0.02, 0.03);
    shoulder.scale.x = side; // the right wing is the left one mirrored
    const wrist = new THREE.Group();
    wrist.position.x = 0.19;
    wrist.add(new THREE.Mesh(outer, material));
    shoulder.add(new THREE.Mesh(inner, material), wrist);
    bird.add(shoulder);
    return { shoulder, wrist, side };
  });
  bird.userData.wings = wings;
  return bird;
}

// Sets a bird's wings: `beat` raises the whole wing at the shoulder (radians), `tip` bends the
// outer part at the wrist (a beat behind, so the wing ripples), and `lift` holds both a little up.
function flapBird(bird, beat, tip, lift) {
  for (const { shoulder, wrist, side } of bird.userData.wings) {
    // (The mirrored right wing turns the other way at the shoulder; inside the mirror, the
    // wrist bends up for both.)
    shoulder.rotation.z = side * (beat + lift);
    wrist.rotation.z = tip - beat * 0.3;
  }
}
