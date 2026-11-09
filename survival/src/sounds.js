// The sounds of the place, the far north (the Yukon, the Northwest Territories) as the cold
// sets in. Mostly a great quiet: the wind, and now and then a bird of the boreal winter (a
// junco, a chickadee, a raven). Out by a lake, the ice along its edges booms and cracks as the
// cold works on it, more at night. By night, owls, and wolves far off. Deer moving about
// nearby; water lapping, a campfire crackling, and dripping and bats down a cave.
//
// Every sound is a recording in public/sounds/ named after it (see SOUNDS below), e.g.
// public/sounds/raven.mp3; most have a few takes (raven-2.mp3, raven-3.mp3, ...), and each time
// one is picked at random. They're field recordings and sound effects from Freesound, public
// domain or free to use with credit: public/sounds/CREDITS.md lists them. A sound with no
// recording is simply not heard. Open listen.html (with the game's server running) to hear
// each one on its own.
//
// Browsers only allow sound once you've clicked or pressed a key, so it starts then.
// N turns it off and on (remembered for next time).
export const SOUNDS = {
  wind: 'loop', // stronger up the mountains
  water: 'loop', // by a lake or the river
  fire: 'loop', // by a burning campfire (crackle and all)
  cave: 'loop', // the hum underground
  sizzle: 'loop', // meat cooking on a fire
  // By day, now and then, a bird somewhere around you.
  junco: 'once', chickadee: 'once', raven: 'once',
  owl: 'once', // at night, now and then
  wolf: 'once', // at night, far off
  ice: 'once', // the lake ice booming and cracking, out by the water (more at night)
  // Deer nearby, from where the deer is:
  'deer-snort': 'once', 'deer-bleat': 'once', 'deer-step': 'once', 'deer-run': 'once',
  drip: 'once', // underground
  bat: 'once', // underground
  // Footsteps, one per step, by what's underfoot:
  'step-grass': 'once', 'step-dirt': 'once', 'step-gravel': 'once', 'step-rock': 'once',
  'step-snow': 'once', 'step-wood': 'once', 'step-water': 'once', swim: 'once',
  // Things happening (see Sound.play):
  hit: 'once', hurt: 'once', chop: 'once', 'tree-creak': 'once', 'tree-fall': 'once',
  'bow-draw': 'once', 'bow-shoot': 'once', 'arrow-hit': 'once', 'arrow-land': 'once', stab: 'once',
  chew: 'once', gulp: 'once', rummage: 'once', bandage: 'once', pickup: 'once', 'fire-light': 'once',
  'add-wood': 'once', 'trap-set': 'once', cloth: 'once', splash: 'once', land: 'once',
};
// How loud each one-off sound plays, from right beside you (the recordings are all levelled to
// about the same loudness; this sets them against each other). Anything not listed plays at 1.
const LEVEL = {
  ice: 0.35, // (far out on the lake: a deep boom, not a bang)
  junco: 0.6, chickadee: 0.6, raven: 0.8, owl: 0.8, wolf: 0.9,
  'deer-run': 0.8, 'deer-bleat': 0.7,
  drip: 0.5, bat: 0.45,
  'step-grass': 0.5, 'step-dirt': 0.5, 'step-gravel': 0.5, 'step-snow': 0.5,
  'step-wood': 0.5, 'step-water': 0.6, swim: 0.7, land: 0.6,
  'step-rock': 0.65, 'deer-step': 0.7, // (sharp sounds: they measure quieter than they are)
  chew: 1.6, gulp: 1.5, rummage: 0.8, bandage: 0.8, cloth: 0.8, pickup: 0.8,
  hurt: 0.8, 'bow-draw': 1.0,
};
const FORMATS = ['mp3', 'ogg', 'wav'];
// Vite serves public/ at the site root; a plain web server serves it at /public/.
const SOUND_FOLDERS = ['sounds/', 'public/sounds/'];
const VOLUME = 0.7;
const MAX_TAKES = 8; // recordings of one sound (name.mp3, name-2.mp3, ...)

export class Sound {
  constructor() {
    this.ctx = null;
    this.files = {}; // name → [AudioBuffer, ...]: its takes
    this.folder = null; // where the recordings turned out to be served from
    this.loops = {};
    this.timers = { birds: 6, owl: 8, wolf: 40, ice: 6, drip: 1, bat: 5, busy: 0 };
    this.deer = new WeakMap(); // deer → seconds until its next footstep (or bleat)
    this.muted = readMuted();
    this.time = 0;
    this.listener = { x: 0, z: 0 };
    this.cave = false;
    const start = () => {
      if (this.ctx) return;
      try {
        this.start();
      } catch {
        // (No Web Audio: the game just stays silent.)
      }
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(ctx.destination);
    // An echo for underground (a delay feeding back into itself).
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.23;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    this.echo.connect(feedback).connect(this.echo);
    this.echoOut = ctx.createGain();
    this.echoOut.gain.value = 0;
    this.echo.connect(this.echoOut).connect(this.master);
    for (const name of Object.keys(SOUNDS)) this.load(name);
  }

  // Loads the recordings of `name`: name.mp3, then its other takes (name-2.mp3, ...).
  async load(name) {
    const first = await this.fetchSound(name);
    if (!first) return;
    this.files[name] = [first];
    if (SOUNDS[name] === 'loop') {
      this.startLoop(name);
      return;
    }
    for (let i = 2; i <= MAX_TAKES; i++) {
      const take = await this.fetchSound(`${name}-${i}`);
      if (!take) break;
      this.files[name].push(take);
    }
  }

  // The recording called `file`, decoded, or null if there isn't one.
  async fetchSound(file) {
    const folders = this.folder ? [this.folder] : SOUND_FOLDERS;
    for (const folder of folders) {
      for (const format of FORMATS) {
        try {
          const response = await fetch(`${folder}${file}.${format}`);
          if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('audio')) continue;
          const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
          this.folder = folder;
          return buffer;
        } catch {
          // (Not there, or not a sound.)
        }
      }
    }
    return null;
  }

  // A loop plays all the time, silent until update() turns it up.
  startLoop(name) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.files[name][0];
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master);
    // (From somewhere different in each, so they don't all start together.)
    source.start(0, Math.random() * source.buffer.duration);
    this.loops[name] = { source, gain };
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('survival-muted', this.muted ? '1' : '');
    } catch {
      // (Private window: it just won't be remembered.)
    }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // Call every frame. `env`: { paused, night, underground, cold (0–1), water (0–1: how close
  // the water is), fire (0–1), woods (0–1), listener: { x, z } (the player), animals (all of
  // them, for the deer), and what the player's busy with: cooking, eating, drinking,
  // searching, bandaging }.
  update(dt, env) {
    if (!this.ctx) return;
    if (env.listener) this.listener = env.listener;
    this.cave = env.underground > 0.5;
    this.time += dt;
    const now = this.ctx.currentTime;
    // (`smooth`: how quickly it gets there, in seconds. Too slow and quick swells are lost.)
    const set = (name, level, smooth = 0.4) => this.loops[name]?.gain.gain.setTargetAtTime(env.paused ? 0 : level, now, smooth);
    const outside = env.underground ? 0 : 1;
    const gust = 0.75 + 0.25 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11);
    set('wind', outside * (0.05 + 0.3 * env.cold) * gust);
    set('water', outside * 0.27 * env.water, 0.3);
    set('fire', outside * 0.35 * env.fire, 0.2);
    set('cave', env.underground * 0.13); // a low background, under the drips and your steps
    set('sizzle', env.cooking ? 0.6 : 0); // (a quiet recording)
    this.echoOut.gain.setTargetAtTime(env.underground ? 0.35 : 0, now, 0.3);
    if (env.paused) return;

    // Now-and-then sounds.
    for (const key of Object.keys(this.timers)) this.timers[key] -= dt;
    // (The north is quiet: a bird only every half a minute or so, fewer still in the cold.)
    if (!env.underground && !env.night && env.cold < 0.6 && this.timers.birds <= 0) {
      this.timers.birds = (rand(14, 40) / (0.5 + env.woods)) * (1 + 2 * env.cold);
      const pick = Math.random();
      this.play(pick < 0.4 ? 'junco' : pick < 0.75 ? 'chickadee' : 'raven', this.around(8, 35));
    }
    // The night: an owl, and wolves far off.
    if (!env.underground && env.night && this.timers.owl <= 0) {
      this.timers.owl = rand(25, 60);
      this.play('owl', this.around(20, 40));
    }
    if (!env.underground && env.night && this.timers.wolf <= 0) {
      this.timers.wolf = rand(60, 150);
      this.play('wolf', this.around(42, 48));
    }
    // The ice along the lake: only out by the water, now and then, more at night.
    if (!env.underground && env.water && this.timers.ice <= 0) {
      this.timers.ice = rand(15, 45) * (env.night ? 1 : 2) / (0.5 + env.water);
      this.play('ice', this.around(20, 40));
    }
    // Deer nearby: their hooves as they walk or bolt, and a bleat now and then while they graze.
    // (The snort as one spots you is played by main.js.)
    for (const animal of env.underground ? [] : env.animals ?? []) {
      if (animal.kind !== 'deer' || animal.dead) continue;
      const distance = Math.hypot(animal.position.x - this.listener.x, animal.position.z - this.listener.z);
      if (distance > 45) continue;
      let timer = (this.deer.get(animal) ?? rand(0, 1)) - dt;
      if (timer <= 0) {
        if (animal.state === 'flee') {
          // (A recording of it running off, a second or more of hooves.)
          this.play('deer-run', animal.position);
          timer = rand(1.4, 1.8);
        } else if (animal.state === 'wander' && distance < 20) {
          this.play('deer-step', animal.position);
          timer = rand(0.55, 0.7);
        } else {
          if (animal.state === 'idle' && Math.random() < 0.025) this.play('deer-bleat', animal.position);
          timer = rand(0.5, 1);
        }
      }
      this.deer.set(animal, timer);
    }
    if (env.underground && this.timers.drip <= 0) {
      this.timers.drip = rand(2, 6);
      this.play('drip', this.around(3, 10));
    }
    if (env.underground && this.timers.bat <= 0) {
      this.timers.bat = rand(15, 35);
      this.play('bat', this.around(4, 12));
    }
    // Busy hands: chewing, gulping, rummaging, winding a bandage (each recording a second or so).
    const busy = env.eating ? ['chew', 0.9, 1.2] : env.drinking ? ['gulp', 0.8, 1.0]
      : env.searching ? ['rummage', 0.9, 1.3] : env.bandaging ? ['bandage', 1.0, 1.4] : null;
    if (busy && this.timers.busy <= 0) {
      this.timers.busy = rand(busy[1], busy[2]);
      this.play(busy[0]);
    }
  }

  // Plays `name` (one of its takes, at random), from world position `at` ({ x, z }, or the
  // player's own if left out): further away is quieter, and off to the side is panned.
  // `volume` scales it (e.g. quieter footsteps while sneaking).
  play(name, at = null, volume = 1) {
    if (!this.ctx || this.muted) return;
    const takes = this.files[name];
    if (!takes) return;
    let pan = 0;
    let gain = volume * (LEVEL[name] ?? 1);
    if (at) {
      const dx = at.x - this.listener.x;
      const distance = Math.hypot(dx, at.z - this.listener.z);
      if (distance > 50) return;
      pan = Math.max(-1, Math.min(1, dx / 14));
      gain *= 1 / (1 + distance / 9);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = takes[Math.floor(Math.random() * takes.length)];
    source.playbackRate.value = rand(0.95, 1.05);
    source.connect(this.voice(gain * 0.6, pan, this.cave || name === 'drip' || name === 'bat'));
    source.start();
  }

  // A gain (and stereo position) to play one sound through; underground, also into the echo.
  voice(volume, pan, echo = false) {
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner).connect(this.master);
    if (echo) panner.connect(this.echo);
    return gain;
  }

  // Somewhere `near` to `far` meters from the player, in any direction.
  around(near, far) {
    const angle = rand(0, Math.PI * 2);
    const distance = rand(near, far);
    return { x: this.listener.x + Math.cos(angle) * distance, z: this.listener.z + Math.sin(angle) * distance };
  }
}

const rand = (min, max) => min + Math.random() * (max - min);

function readMuted() {
  try {
    return localStorage.getItem('survival-muted') === '1';
  } catch {
    return false;
  }
}
