import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const RADIUS = 0.4;
const HEIGHT = 1.8;
const SPEED = 6;
const JUMP_SPEED = 10;
const GRAVITY = 25;
const FALL_LIMIT = -20;
// Box3 counts touching as overlapping, so keep the collision box a hair above the feet
// or standing on the ground would block every horizontal move.
const SKIN = 0.01;

export class Player {
  constructor(scene, spawn) {
    this.spawn = spawn.clone();
    this.position = spawn.clone(); // feet position
    this.velocityY = 0;
    this.grounded = false;
    this.facing = 0;

    this.object = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x3d7bd9 }),
    );
    body.position.y = HEIGHT / 2;
    body.castShadow = true;
    // A small "nose" so you can see which way the player faces.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    nose.position.set(0, HEIGHT * 0.75, RADIUS);
    this.object.add(body, nose);
    scene.add(this.object);

    this.loadModel('/models/player.glb', body, nose);
  }

  // Swap the capsule for a Blender model if one has been exported to public/models/.
  loadModel(url, ...placeholders) {
    new GLTFLoader().load(
      url,
      (gltf) => {
        gltf.scene.traverse((child) => (child.castShadow = true));
        for (const mesh of placeholders) this.object.remove(mesh);
        this.object.add(gltf.scene);
      },
      undefined,
      () => {}, // No model yet: keep the capsule.
    );
  }

  update(dt, input, cameraYaw, platforms) {
    // Move relative to where the camera is looking.
    const { x, z } = input.moveAxis();
    const move = new THREE.Vector3(x, 0, -z);
    if (move.lengthSq() > 0) {
      move.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
      this.facing = Math.atan2(move.x, move.z);
    }

    if (input.jumpPressed && this.grounded) {
      this.velocityY = JUMP_SPEED;
      this.grounded = false;
    }
    this.velocityY -= GRAVITY * dt;

    // Resolve one axis at a time so the player slides along walls.
    this.moveAxis('x', move.x * SPEED * dt, platforms);
    this.moveAxis('z', move.z * SPEED * dt, platforms);
    this.grounded = false;
    this.moveAxis('y', this.velocityY * dt, platforms);

    if (this.position.y < FALL_LIMIT) this.respawn();

    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;
  }

  moveAxis(axis, amount, platforms) {
    if (amount === 0) return;
    this.position[axis] += amount;
    const box = this.bounds();
    for (const platform of platforms) {
      if (!box.intersectsBox(platform)) continue;
      if (axis === 'y') {
        if (amount < 0) {
          this.position.y = platform.max.y;
          this.grounded = true;
        } else {
          this.position.y = platform.min.y - HEIGHT;
        }
        this.velocityY = 0;
      } else {
        this.position[axis] -= amount;
      }
      return;
    }
  }

  bounds() {
    const p = this.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - RADIUS, p.y + SKIN, p.z - RADIUS),
      new THREE.Vector3(p.x + RADIUS, p.y + HEIGHT, p.z + RADIUS),
    );
  }

  respawn() {
    this.position.copy(this.spawn);
    this.velocityY = 0;
  }
}
