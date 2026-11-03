import * as THREE from 'three';

// Fades whatever part of a building is between the camera and the player (a roof, a wall, a
// window, the floor above you on the stairs) to a ghost, so you can always see yourself;
// everything else stays solid. Used by the lookout tower, cabins, caves and hunting stands.
//
// Parts that can fade are meshes marked `userData.roof` / `cutaway` / `floor`, or (in Blender
// models) meshes with "roof", "wall", "window", "floor" or "stair" in their names.
const GHOST = 0.08; // how much of a part in the way still shows
const FADE_SPEED = 5; // per second
const FADES = /roof|wall|window|floor|stair/i;

export class Cutaway {
  constructor(root) {
    this.root = root;
    this.parts = [];
    this.ray = new THREE.Raycaster();
    this.point = new THREE.Vector3();
    this.toPoint = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.refresh();
  }

  // Finds the parts that can fade (call again after swapping in a Blender model).
  refresh() {
    this.parts = [];
    this.root.updateMatrixWorld(true); // (the rays need the parts' positions straight away)
    this.root.traverse((child) => {
      if (!child.isMesh) return;
      const { roof, cutaway, floor } = child.userData;
      if (!roof && !cutaway && !floor && !FADES.test(child.name)) return;
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.userData.opacity = child.material.opacity;
      this.parts.push({ mesh: child, shown: 1, blocking: false });
    });
    this.meshes = this.parts.map((part) => part.mesh);
  }

  // Rays from the camera to a few points on the player: what they pass through is in the way.
  findBlocking(camera, feet, position) {
    for (const part of this.parts) part.blocking = false;
    this.side.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.35);
    for (const [up, across] of [[0.2, 0], [0.9, 0], [1.7, 0], [0.9, 1], [0.9, -1]]) {
      this.point.set(position.x, feet + up, position.z).addScaledVector(this.side, across);
      this.toPoint.copy(this.point).sub(camera.position);
      const distance = this.toPoint.length();
      this.ray.set(camera.position, this.toPoint.normalize());
      this.ray.far = distance - 0.2;
      for (const hit of this.ray.intersectObjects(this.meshes, false)) {
        this.parts.find((part) => part.mesh === hit.object).blocking = true;
      }
    }
  }

  // Fades what's in the way while `close` (the player is at the building); otherwise, or with
  // no camera (e.g. looking through binoculars), brings everything back.
  update(dt, camera, feet, position, close) {
    const active = Boolean(camera && close);
    if (active) this.findBlocking(camera, feet, position);
    for (const part of this.parts) {
      const target = active && part.blocking ? GHOST : 1;
      if (part.shown === target) continue;
      part.shown = target > part.shown ? Math.min(target, part.shown + dt * FADE_SPEED) : Math.max(target, part.shown - dt * FADE_SPEED);
      part.mesh.material.opacity = part.mesh.material.userData.opacity * part.shown;
      part.mesh.material.depthWrite = part.shown > 0.99;
    }
  }
}
