import * as THREE from 'three';

// The weather: clear skies, a few clouds, overcast with snow falling, and now and then a
// blizzard. It comes in spells of a few hours, each turning into one of its neighbours
// (clear ↔ a few clouds ↔ overcast ↔ blizzard), blending over half an hour at the change.
// The first day is never a blizzard; blizzards only ever build out of overcast weather, and
// the hour before one the wind picks up and the sky closes in, so you get a warning.
//
// The spells are laid out ahead of time from the game's start, so the weather is a function
// of the clock: sleeping through the night skips its weather too.
//
// Each kind of weather, as changes to how Daylight lights the world (src/daylight.js) and
// what falls from the sky:
//   sun, ambient: the sunlight and sky light, times this
//   blue: how far the haze turns to a clear blue (by day) · grey: how far it turns to a flat
//     storm grey (keeping its brightness, so a night blizzard is dark)
//   deep: how blue the sky deepens overhead (see sky.js) · clouds: the share of the clouds out
//   fog: how far you can see, times this · fogCap: and never further than this (meters)
//   snow: how much snow falls (1: the light flurry, 4 a blizzard) · wind: how hard it blows it sideways (0–1)
//   storm: how much it chills you (see stepTemperature in survival.js)
export const KINDS = {
  clear: { name: 'Clear', sun: 1.2, ambient: 1.05, blue: 0.75, grey: 0, deep: 0.8, clouds: 0, fog: 16, fogCap: Infinity, snow: 0, wind: 0, storm: 0 },
  fewClouds: { name: 'A few clouds', sun: 1.1, ambient: 1.0, blue: 0.6, grey: 0, deep: 0.65, clouds: 0.3, fog: 7, fogCap: Infinity, snow: 0.35, wind: 0.1, storm: 0 },
  overcast: { name: 'Overcast', sun: 1, ambient: 1, blue: 0, grey: 0, deep: 0.35, clouds: 1, fog: 2.2, fogCap: Infinity, snow: 1, wind: 0.15, storm: 0 },
  blizzard: { name: 'Blizzard', sun: 0.25, ambient: 0.8, blue: 0, grey: 0.85, deep: 0, clouds: 0, fog: 1, fogCap: 22, snow: 4, wind: 1, storm: 1 },
};
// What each kind can turn into next, and how likely each is.
const NEXT = {
  clear: [['fewClouds', 0.8], ['overcast', 0.2]],
  fewClouds: [['clear', 0.35], ['overcast', 0.65]],
  overcast: [['fewClouds', 0.53], ['clear', 0.12], ['blizzard', 0.35]],
  blizzard: [['overcast', 1]],
};
const SPELL_HOURS = [4, 8]; // in-game hours a spell lasts...
const BLIZZARD_HOURS = [2, 4]; // ...or a blizzard
const FIRST_DAY_HOURS = 16; // the game starts at 8 in the morning: no blizzard before midnight
const BLIZZARD_GAP_HOURS = 36; // and none sooner than this after the last one ends
const BLEND_HOURS = 0.5; // the change from one spell to the next
const WARNING_HOURS = 1; // before a blizzard, the wind rises and the sky closes in
const NUMBERS = ['sun', 'ambient', 'blue', 'grey', 'deep', 'clouds', 'fog', 'snow', 'wind', 'storm'];
const CLEAR_HAZE = new THREE.Color(0x9cc8f0); // a clear day's horizon

export class Weather {
  // `random`: 0–1, for laying out the spells (Math.random: different every game). `only`: one
  // kind of weather all the time, for testing (?weather=blizzard: see README).
  constructor(random = Math.random, only = null) {
    this.random = random;
    this.only = KINDS[only] ? only : null;
    const firsts = ['clear', 'fewClouds', 'overcast'];
    this.spells = [{ kind: firsts[Math.floor(random() * firsts.length)], from: 0, to: this.length('overcast'), windAngle: random() * Math.PI * 2 }];
    this.now = { ...KINDS[this.spells[0].kind], kind: this.spells[0].kind, windAngle: this.spells[0].windAngle, blizzardIn: null };
    this.said = new Set(); // (the warnings and news already given, by spell)
  }

  length(kind) {
    const [a, b] = kind === 'blizzard' ? BLIZZARD_HOURS : SPELL_HOURS;
    return a + this.random() * (b - a);
  }

  // The spell at `hours` (since the game began), laying out more as time goes on.
  spellAt(hours) {
    let last = this.spells[this.spells.length - 1];
    while (last.to <= hours + BLEND_HOURS + WARNING_HOURS) {
      let roll = this.random();
      let kind = NEXT[last.kind].find(([, p]) => (roll -= p) < 0)?.[0] ?? NEXT[last.kind][0][0];
      const lastStorm = this.spells.findLast((s) => s.kind === 'blizzard');
      if (kind === 'blizzard' && (last.to < FIRST_DAY_HOURS || (lastStorm && last.to - lastStorm.to < BLIZZARD_GAP_HOURS))) kind = 'fewClouds';
      const spell = { kind, from: last.to, to: last.to + this.length(kind), windAngle: this.random() * Math.PI * 2 };
      this.spells.push(spell);
      last = spell;
    }
    const i = this.spells.findIndex((s) => hours < s.to);
    return { spell: this.spells[i], next: this.spells[i + 1], index: i };
  }

  // Sets `now` (the weather's blended settings) for `hours` since the game began. Returns news
  // to tell the player: 'warning' (a blizzard's coming), 'blizzard' or 'clearing', or null.
  update(hours) {
    if (this.only) {
      Object.assign(this.now, KINDS[this.only], { kind: this.only, blend: 0, fogCapA: KINDS[this.only].fogCap, fogCapB: KINDS[this.only].fogCap, windAngle: 0.6, blizzardIn: null });
      return null;
    }
    const { spell, next, index } = this.spellAt(hours);
    const left = spell.to - hours;
    const blend = next ? THREE.MathUtils.smoothstep(BLEND_HOURS - left, 0, BLEND_HOURS) : 0;
    const a = KINDS[spell.kind];
    const b = KINDS[next?.kind ?? spell.kind];
    const now = this.now;
    for (const key of NUMBERS) now[key] = a[key] + (b[key] - a[key]) * blend;
    now.fogCapA = a.fogCap;
    now.fogCapB = b.fogCap;
    now.blend = blend;
    now.kind = blend < 0.5 ? spell.kind : next.kind;
    now.name = KINDS[now.kind].name;
    now.windAngle = blend < 0.5 ? spell.windAngle : next.windAngle;
    // The hour before a blizzard: the wind rising, the snow thickening, the light going.
    const coming = next?.kind === 'blizzard' && spell.kind !== 'blizzard';
    now.blizzardIn = coming ? left : null;
    if (coming && left < WARNING_HOURS) {
      const k = 1 - left / WARNING_HOURS;
      now.wind = Math.max(now.wind, 0.15 + 0.5 * k);
      now.snow = Math.max(now.snow, 1 + 0.8 * k);
      now.sun *= 1 - 0.35 * k;
      now.windAngle = next.windAngle;
    }
    const say = (what, key) => {
      if (this.said.has(key)) return null;
      this.said.add(key);
      return what;
    };
    if (coming && left < WARNING_HOURS) return say('warning', `warn${index}`);
    if (spell.kind === 'blizzard' && blend < 0.5) return say('blizzard', `storm${index}`);
    if (spell.kind === 'blizzard' && blend >= 0.5) return say('clearing', `clear${index}`);
    return null;
  }

  // Changes the light, sky light and haze that Daylight set this frame, for the weather.
  // `ambient`'s intensity before the views changed it says how much daylight there is.
  light(scene, sun, ambient) {
    const now = this.now;
    const day = THREE.MathUtils.smoothstep(ambient.intensity, 0.6, 1.5);
    sun.intensity *= now.sun;
    ambient.intensity *= now.ambient;
    const haze = scene.background;
    if (now.blue > 0) haze.lerp(CLEAR_HAZE, now.blue * day);
    if (now.grey > 0) {
      const level = Math.min(1, (0.2126 * haze.r + 0.7152 * haze.g + 0.0722 * haze.b) * 0.82); // (a little darker, so the snow shows against it)
      haze.lerp(new THREE.Color(level, level * 1.01, level * 1.03), now.grey);
    }
    scene.fog.color.copy(haze);
  }

  // How far you can see in this weather (after the views have set the fog for the camera).
  fog(scene) {
    const now = this.now;
    const ratio = scene.fog.near / scene.fog.far;
    const far = scene.fog.far;
    const reach = (cap) => Math.min(far * now.fog, cap);
    scene.fog.far = reach(now.fogCapA) + (reach(now.fogCapB) - reach(now.fogCapA)) * now.blend;
    scene.fog.near = scene.fog.far * ratio;
  }
}
