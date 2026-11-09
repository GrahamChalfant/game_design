import * as THREE from 'three';

// A little blood when the player or an animal is hurt: a few drops fly out and leave dark
// red splats on the ground, which soak in and fade away after a while.
const SPLATS_PER_HIT = 5;
const DROPS_PER_HIT = 10;
const MAX_SPLATS = 40; // the oldest splats go first
const FADE_AFTER = 60; // seconds before a splat starts to fade...
const FADE_TIME = 30; // ...and how long it takes to go
const OPACITY = 0.85;
const GRAVITY = 9;
const SHAPES = 6;
const UP = new THREE.Vector3(0, 1, 0);

export class Blood {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.splats = [];
    this.drops = [];
    // A few splat shapes to pick from, so no two look the same. They're lit (in shade and at
    // night they darken like everything else), not glowing red.
    this.splatGeometries = Array.from({ length: SHAPES }, () => blobGeometry());
    this.dropGeometry = new THREE.IcosahedronGeometry(0.035, 0);
    this.dropMaterial = new THREE.MeshLambertMaterial({ color: 0x5a0909 });
  }

  // Blood from a wound at (x, z), knocked away in the direction (awayX, awayZ).
  spill(x, z, awayX = 0, awayZ = 0) {
    const ground = this.world.terrain.heightAt(x, z);
    for (let i = 0; i < DROPS_PER_HIT; i++) {
      const drop = new THREE.Mesh(this.dropGeometry, this.dropMaterial);
      drop.position.set(x, ground + 0.9, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.6;
      drop.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed + awayX * 1.5,
        1 + Math.random() * 1.8,
        Math.sin(angle) * speed + awayZ * 1.5,
      );
      this.scene.add(drop);
      this.drops.push(drop);
    }
    for (let i = 0; i < SPLATS_PER_HIT; i++) {
      const along = Math.random() * 1.2;
      const sx = x + awayX * along + (Math.random() - 0.5) * 0.7;
      const sz = z + awayZ * along + (Math.random() - 0.5) * 0.7;
      this.splat(sx, sz, 0.12 + Math.random() * 0.22);
    }
  }

  splat(x, z, size) {
    if (this.world.terrain.waterDepth(x, z) > 0) return; // washed away
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x4a0707).multiplyScalar(0.8 + Math.random() * 0.4),
      transparent: true,
      opacity: OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const splat = new THREE.Mesh(this.splatGeometries[Math.floor(Math.random() * SHAPES)], material);
    splat.position.set(x, this.world.terrain.heightAt(x, z) + 0.02, z);
    // Lying flat on the ground, slope and all (not level, poking out of a hillside).
    const { x: sx, z: sz } = this.world.terrain.slopeAt(x, z);
    const normal = new THREE.Vector3(-sx, 1, -sz).normalize();
    splat.quaternion.setFromUnitVectors(UP, normal).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2));
    splat.scale.set(size * (0.7 + Math.random() * 0.6), 1, size);
    splat.userData.age = 0;
    this.scene.add(splat);
    this.splats.push(splat);
    while (this.splats.length > MAX_SPLATS) this.removeSplat(this.splats[0]);
  }

  removeSplat(splat) {
    this.scene.remove(splat);
    splat.material.dispose();
    this.splats.splice(this.splats.indexOf(splat), 1);
  }

  update(dt) {
    for (const drop of [...this.drops]) {
      const v = drop.userData.velocity;
      v.y -= GRAVITY * dt;
      drop.position.addScaledVector(v, dt);
      const ground = this.world.terrain.heightAt(drop.position.x, drop.position.z);
      if (drop.position.y > ground) continue;
      // Landed: leave a tiny spot.
      this.scene.remove(drop);
      this.drops.splice(this.drops.indexOf(drop), 1);
      this.splat(drop.position.x, drop.position.z, 0.05 + Math.random() * 0.05);
    }
    for (const splat of [...this.splats]) {
      splat.userData.age += dt;
      const fade = (splat.userData.age - FADE_AFTER) / FADE_TIME;
      if (fade >= 1) this.removeSplat(splat);
      else if (fade > 0) splat.material.opacity = OPACITY * (1 - fade);
    }
  }

  reset() {
    for (const drop of this.drops) this.scene.remove(drop);
    this.drops = [];
    for (const splat of [...this.splats]) this.removeSplat(splat);
  }
}

// A flat splat lying on the ground (radius about 1, scaled per splat): an uneven blob with a
// few small drops flung out round it, each one different.
function blobGeometry() {
  const blob = (cx, cz, radius, points) => {
    const shape = new THREE.Shape();
    const lumps = [Math.random() * 6, 1.5 + Math.random() * 2, Math.random() * 6];
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = radius * (0.7 + 0.2 * Math.sin(angle * 3 + lumps[0]) + 0.12 * Math.sin(angle * lumps[1] + lumps[2]));
      const px = cx + Math.cos(angle) * r;
      const pz = cz + Math.sin(angle) * r;
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    return shape;
  };
  const shapes = [blob(0, 0, 1, 16)];
  const drops = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < drops; i++) {
    const angle = Math.random() * Math.PI * 2;
    const out = 1.1 + Math.random() * 0.7;
    shapes.push(blob(Math.cos(angle) * out, Math.sin(angle) * out, 0.1 + Math.random() * 0.18, 7));
  }
  return new THREE.ShapeGeometry(shapes).rotateX(-Math.PI / 2); // (facing up)
}
