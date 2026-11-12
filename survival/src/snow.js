import * as THREE from 'three';

// A light flurry of snow. Flakes stay put in the world as the player walks through them;
// any that drift too far wrap around to the other side, so there's always snow nearby.
//
// From above, a few hundred flakes over a wide box read as a flurry. From the ground the same
// flakes would be a few stray dots in the air, so in the close-up views the box shrinks round
// the camera and fills with more, smaller flakes. Flakes under a roof aren't shown, and none
// fall down a cave.
//
// How much falls, and how hard the wind drives it, is the weather's (see setWeather): none on a
// clear day, the light flurry when overcast, four times as much blown sideways in a blizzard.
const COUNT = 5600; // flakes made (the most shown at once: a blizzard, close up)
const NEAR = 1.5; // in the close-up views, no flakes this close to the camera (meters)
const LOOKS = {
  above: { shown: 350, area: 50, height: 25, below: 5, size: 0.14 },
  close: { shown: 1400, area: 24, height: 14, below: 3, size: 0.065 },
};

export class Snowfall {
  constructor(scene) {
    this.flakes = new Float32Array(COUNT * 3); // where each flake really is
    this.drift = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.flakes[i * 3] = Math.random();
      this.flakes[i * 3 + 1] = Math.random();
      this.flakes[i * 3 + 2] = Math.random();
      this.drift[i] = Math.random() * Math.PI * 2;
    }
    this.look = null;
    this.amount = 1; // how much is falling (1: a light flurry)
    this.wind = new THREE.Vector2(); // meters a second it blows the flakes sideways
    this.fall = 1.6; // meters a second they fall
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: LOOKS.above.size,
        map: roundFlake(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        fog: false, // (the flakes are all close by: in a blizzard's whiteout the fog would hide them)
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // The weather: `amount` of snow (0 none, 1 a light flurry, 3 a blizzard), `wind` 0–1 blowing
  // toward `windAngle` (radians round from +x toward +z).
  setWeather({ amount, wind, windAngle }) {
    this.amount = amount;
    this.wind.set(Math.cos(windAngle), Math.sin(windAngle)).multiplyScalar(wind * 9);
    this.fall = 1.6 + wind * 2.4;
    // (Driven snow: bigger, clumped flakes, so it reads as a storm.)
    if (this.look) this.points.material.size = this.look.size * (1 + 0.6 * wind);
  }

  // `center`: where to keep the snow (the camera in the close-up views). `close`: in those
  // views. `roofs`: the world's structures (see world.structures), so flakes stay out from under
  // their roofs. `cave`: down a cave, there's none.
  update(dt, time, center, { close = false, roofs = [], cave = false } = {}) {
    const look = close ? LOOKS.close : LOOKS.above;
    if (look !== this.look) this.relook(look, center);
    const count = Math.min(COUNT, Math.round(look.shown * this.amount));
    this.points.visible = !cave && count > 0;
    if (!this.points.visible) return;
    this.points.geometry.setDrawRange(0, count);
    const { area, height, below } = look;
    // (Only the buildings close by need checking: a cabin or stand is its `poi`'s spot.)
    const nearby = roofs.filter((s) => s.roofOver && (!s.poi || Math.hypot(s.poi.x - center.x, s.poi.z - center.z) < area));
    const flakes = this.flakes;
    const shown = this.points.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      let y = flakes[i * 3 + 1] - dt * this.fall;
      if (y < center.y - below) y += height;
      const gust = 0.8 + 0.4 * Math.sin(time * 1.3 + this.drift[i]);
      const x = wrap(flakes[i * 3] + (Math.sin(time + this.drift[i]) * 0.3 + this.wind.x * gust) * dt, center.x, area);
      const z = wrap(flakes[i * 3 + 2] + this.wind.y * gust * dt, center.z, area);
      flakes[i * 3] = x;
      flakes[i * 3 + 1] = wrapHeight(y, center.y, height, below);
      flakes[i * 3 + 2] = z;
      // (Not under a roof, and not right in front of the camera, where one flake is a big blot.)
      const covered = (close && Math.abs(x - center.x) < NEAR && Math.abs(z - center.z) < NEAR && Math.abs(flakes[i * 3 + 1] - center.y) < NEAR)
        || (nearby.length > 0 && nearby.some((s) => s.roofOver(x, z, flakes[i * 3 + 1])));
      shown.setXYZ(i, x, covered ? -1e4 : flakes[i * 3 + 1], z);
    }
    shown.needsUpdate = true;
  }

  // Scatters the flakes through the box for `look`, round `center`.
  relook(look, center) {
    this.look = look;
    this.points.geometry.setDrawRange(0, look.shown);
    this.points.material.size = look.size;
    for (let i = 0; i < COUNT; i++) {
      this.flakes[i * 3] = center.x + (Math.random() - 0.5) * look.area;
      this.flakes[i * 3 + 1] = center.y - look.below + Math.random() * look.height;
      this.flakes[i * 3 + 2] = center.z + (Math.random() - 0.5) * look.area;
    }
  }
}

// Moves `value` by whole box-widths so it stays within half a box of `center`.
function wrap(value, center, area) {
  return value - Math.round((value - center) / area) * area;
}

// Keeps a flake's height within the box round `center` (it rises with you up a mountain).
function wrapHeight(y, center, height, below) {
  const bottom = center - below;
  return bottom + ((((y - bottom) % height) + height) % height);
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
