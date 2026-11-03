import * as THREE from 'three';

// Northern summer: long days. The sun is up from SUNRISE to SUNSET; the moon lights the rest.
const SUNRISE = 5;
const SUNSET = 20;
// The sun hands over to the moon (and back) on opposite sides of the sky. To hide the
// jump, their light fades out this many hours before the switch and back in after it.
const HANDOVER = 0.75;

// How the world looks at different times of day; everything in between is blended.
// The sun is stronger at dawn and dusk because low sunlight hits the ground at a slant.
// light: sun (or moon) colour and strength · sky/ground: ambient light from above/below ·
// haze: horizon and fog colour · fogFar: how far you can see.
const NIGHT = { light: [0xa0b4f0, 0.5], sky: 0x36466e, ground: 0x1a2220, ambient: 0.5, haze: 0x10182a, fogFar: 60 };
const KEYFRAMES = [
  { hour: 0, ...NIGHT },
  { hour: 4, ...NIGHT },
  { hour: 5, light: [0xf0a07a, 1.2], sky: 0x7e7a9e, ground: 0x36382e, ambient: 1.1, haze: 0x6e6a84, fogFar: 75 },
  { hour: 6.5, light: [0xf2b488, 4.0], sky: 0xc4c2d4, ground: 0x6c7048, ambient: 1.7, haze: 0xd4c0aa, fogFar: 95 },
  // Daytime: cool, muted, open daylight under a grey-blue sky, with a bluish haze.
  { hour: 9, light: [0xf2f0e8, 3.2], sky: 0xc6d4e4, ground: 0x6f7a5a, ambient: 1.65, haze: 0xa9b8c8, fogFar: 160 },
  { hour: 16.5, light: [0xf4ecdc, 3.1], sky: 0xc6d4e4, ground: 0x6f7a5a, ambient: 1.65, haze: 0xb2bcc6, fogFar: 150 },
  { hour: 18.5, light: [0xf0b47e, 4.0], sky: 0xd2c0b8, ground: 0x786e4c, ambient: 1.7, haze: 0xd6b28e, fogFar: 95 },
  { hour: 19.5, light: [0xe88a5c, 2.9], sky: 0xa48aa0, ground: 0x524638, ambient: 1.35, haze: 0xae7e7e, fogFar: 85 },
  { hour: 20, light: [0xe0705a, 1.2], sky: 0x605a82, ground: 0x2c2c28, ambient: 0.9, haze: 0x423a5c, fogFar: 75 },
  { hour: 21, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const colorA = new THREE.Color();
const colorB = new THREE.Color();
const mix = (a, b, t, out) => out.copy(colorA.setHex(a)).lerp(colorB.setHex(b), t);

// Moves the sun and moon and changes the light, sky and fog through the day.
export class Daylight {
  constructor(scene, sun, ambient, snow) {
    this.scene = scene;
    this.sun = sun;
    this.ambient = ambient;
    this.snow = snow;
  }

  // `hour` is the time of day, 0–24 (e.g. 13.5 is half past one in the afternoon).
  update(hour, center) {
    const next = KEYFRAMES.findIndex((k) => k.hour > hour);
    const a = KEYFRAMES[next - 1];
    const b = KEYFRAMES[next];
    const t = (hour - a.hour) / (b.hour - a.hour);

    mix(a.light[0], b.light[0], t, this.sun.color);
    const fromHandover = Math.min(Math.abs(hour - SUNRISE), Math.abs(hour - SUNSET));
    this.sun.intensity =
      THREE.MathUtils.lerp(a.light[1], b.light[1], t) * THREE.MathUtils.smoothstep(fromHandover, 0, HANDOVER);
    mix(a.sky, b.sky, t, this.ambient.color);
    mix(a.ground, b.ground, t, this.ambient.groundColor);
    this.ambient.intensity = THREE.MathUtils.lerp(a.ambient, b.ambient, t);
    mix(a.haze, b.haze, t, this.scene.background);
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.far = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t);
    this.scene.fog.near = this.scene.fog.far * 0.4;
    // Snowflakes glow by themselves, so dim them along with the light.
    this.snow.points.material.color.setScalar(0.25 + 0.75 * Math.min(1, this.ambient.intensity / 1.7));

    // The sun crosses from east to west during the day; the moon does the same at night.
    const isDay = hour >= SUNRISE && hour < SUNSET;
    const progress = isDay
      ? (hour - SUNRISE) / (SUNSET - SUNRISE)
      : (((hour - SUNSET + 24) % 24) / (24 - SUNSET + SUNRISE));
    const angle = progress * Math.PI;
    this.sun.position.set(
      center.x + Math.cos(angle) * 45,
      center.y + 28 + Math.sin(angle) * 25, // never low on the horizon, so shadows don't cover everything
      center.z - 12,
    );
    this.sun.target.position.copy(center);
  }
}

export function isNight(hour) {
  return hour < SUNRISE || hour >= SUNSET;
}
