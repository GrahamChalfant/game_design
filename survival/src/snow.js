import * as THREE from 'three';

const COUNT = 350;
const AREA = 50; // size of the box of snowflakes that follows the camera
const HEIGHT = 25;

// A light flurry of snow. Flakes stay put in the world as the player walks through them;
// any that drift too far from the player wrap around to the other side, so there's
// always snow nearby.
export class Snowfall {
  constructor(scene) {
    const positions = new Float32Array(COUNT * 3);
    this.drift = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * AREA;
      positions[i * 3 + 1] = Math.random() * HEIGHT;
      positions[i * 3 + 2] = (Math.random() - 0.5) * AREA;
      this.drift[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.14,
        map: roundFlake(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, time, center) {
    const positions = this.points.geometry.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      let y = positions.getY(i) - dt * 1.6;
      if (y < -5) y += HEIGHT;
      const x = positions.getX(i) + Math.sin(time + this.drift[i]) * dt * 0.3;
      positions.setXYZ(i, wrap(x, center.x), y, wrap(positions.getZ(i), center.z));
    }
    positions.needsUpdate = true;
  }
}

// Moves `value` by whole box-widths so it stays within half a box of `center`.
function wrap(value, center) {
  return value - Math.round((value - center) / AREA) * AREA;
}

// A soft white dot, so flakes are round instead of square.
function roundFlake() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}
