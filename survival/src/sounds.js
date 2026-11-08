// The sounds of the place, the far north (the Yukon, the Northwest Territories) as the cold
// sets in. Mostly a great quiet: the wind, and now and then a bird of the boreal winter (the
// "tsip" of a junco, a boreal chickadee, a Canada jay, a raven's croak). Out by a lake, the new
// ice along its edges sings as the cold works on it: pings, groans, whip cracks, a whale-like
// moan, more at night when the cold deepens. By night, owls, wolves far off, and the yowl of a
// lynx. Deer moving about nearby; water lapping, a campfire crackling, and dripping and bats
// down a cave.
//
// Every sound is made right here with the Web Audio API, so the game needs no sound files.
// To use a recording instead, drop a file into public/sounds/ named after the sound (see
// SOUNDS below), e.g. public/sounds/birds.mp3: if it's there, it's played in place of the
// made-up one. Loops (wind, water, fire, cave) are played looping; the others are played now
// and then, a little higher or lower each time.
//
// Browsers only allow sound once you've clicked or pressed a key, so it starts then.
// N turns it off and on (remembered for next time).
export const SOUNDS = {
  wind: 'loop', // stronger up the mountains
  water: 'loop', // by a lake or the river
  fire: 'loop', // by a burning campfire
  cave: 'loop', // the hum underground
  // By day, now and then, a bird somewhere around you: any one of these (or `birds`, if
  // there's a recording of that, in place of all of them).
  birds: 'once', junco: 'once', chickadee: 'once', jay: 'once', raven: 'once',
  owl: 'once', // at night, now and then
  wolf: 'once', // at night, far off
  lynx: 'once', // at night, now and then, out in the woods
  ice: 'once', // the lake ice cracking and singing, out by the water (more at night and in the cold)
  // Deer nearby, from where the deer is:
  'deer-snort': 'once', 'deer-bleat': 'once', 'deer-step': 'once', 'deer-run': 'once',
  drip: 'once', // underground
  bat: 'once', // underground
  sizzle: 'loop', // meat cooking on a fire
  // Footsteps, one per step, by what's underfoot:
  'step-grass': 'once', 'step-dirt': 'once', 'step-gravel': 'once', 'step-rock': 'once',
  'step-snow': 'once', 'step-wood': 'once', 'step-water': 'once', 'swim': 'once',
  // Things happening (see Sound.play):
  hit: 'once', hurt: 'once', chop: 'once', 'tree-creak': 'once', 'tree-fall': 'once',
  'bow-draw': 'once', 'bow-shoot': 'once', 'arrow-hit': 'once', 'arrow-land': 'once', stab: 'once',
  chew: 'once', gulp: 'once', rummage: 'once', bandage: 'once', pickup: 'once', 'fire-light': 'once',
  'add-wood': 'once', 'trap-set': 'once', 'cloth': 'once', splash: 'once', land: 'once',
};
const FORMATS = ['mp3', 'ogg', 'wav'];
// Vite serves public/ at the site root; a plain web server serves it at /public/.
const SOUND_FOLDERS = ['sounds/', 'public/sounds/'];
const VOLUME = 0.7;

export class Sound {
  constructor() {
    this.ctx = null;
    this.files = {}; // name → AudioBuffer, for any recordings found in public/sounds/
    this.loops = {};
    this.timers = { birds: 6, owl: 8, wolf: 40, lynx: 70, ice: 6, drip: 1, bat: 5, crackle: 0, sputter: 0, busy: 0 };
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

    this.noise = makeNoise(ctx);
    // The made-up loops: filtered noise.
    this.loops.wind = this.noiseLoop('bandpass', 420, 0.6);
    this.loops.water = this.noiseLoop('lowpass', 520, 0.5);
    this.loops.fire = this.noiseLoop('lowpass', 650, 0.5); // a soft roar under the crackles
    this.loops.cave = this.noiseLoop('lowpass', 140, 0.7);
    this.loops.sizzle = this.noiseLoop('highpass', 3200, 0.5);
    for (const name of Object.keys(SOUNDS)) this.load(name);
  }

  // Looks for a recording of `name` in public/sounds/.
  async load(name) {
    for (const file of SOUND_FOLDERS.flatMap((folder) => FORMATS.map((format) => `${folder}${name}.${format}`))) {
      try {
        const response = await fetch(file);
        if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('audio')) continue;
        this.files[name] = await this.ctx.decodeAudioData(await response.arrayBuffer());
        if (SOUNDS[name] === 'loop') this.useRecordedLoop(name);
        return;
      } catch {
        // (Not there, or not a sound: keep the made-up one.)
      }
    }
  }

  noiseLoop(type, frequency, q) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    // (From somewhere different in the noise each, so no two loops sound alike.)
    source.start(0, Math.random() * this.noise.duration);
    return { source, gain, filter };
  }

  useRecordedLoop(name) {
    const old = this.loops[name];
    const source = this.ctx.createBufferSource();
    source.buffer = this.files[name];
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master);
    source.start();
    old?.source?.stop();
    old?.gain.disconnect();
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
    // Water lapping at the edge: an uneven swell, a little brighter as each wave comes in.
    const lap = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(this.time * 1.7)) * (0.5 + 0.5 * Math.sin(this.time * 0.63 + 1));
    set('water', outside * 0.27 * env.water * lap, 0.15);
    this.loops.water?.filter?.frequency.setTargetAtTime(380 + 300 * lap, now, 0.15);
    // The fire's roar rises and falls slowly; the crackles (below) do the rest.
    const flicker = 0.7 + 0.3 * Math.sin(this.time * 0.9) * Math.sin(this.time * 0.37 + 2);
    set('fire', outside * 0.35 * env.fire * flicker, 0.2);
    set('cave', env.underground * 0.13); // a low background, under the drips and your steps
    // Meat sizzling on the fire: a quiet hiss, with the fat spitting (below).
    set('sizzle', env.cooking ? 0.06 : 0);
    this.echoOut.gain.setTargetAtTime(env.underground ? 0.35 : 0, now, 0.3);
    if (env.paused) return;

    // Now-and-then sounds.
    for (const key of Object.keys(this.timers)) this.timers[key] -= dt;
    // (The north is quiet: a bird only every half a minute or so, fewer still in the cold.)
    if (!env.underground && !env.night && env.cold < 0.6 && this.timers.birds <= 0) {
      this.timers.birds = (rand(14, 40) / (0.5 + env.woods)) * (1 + 2 * env.cold);
      this.bird();
    }
    // The night: an owl, wolves far off, a lynx yowling out in the woods.
    if (!env.underground && env.night && this.timers.owl <= 0) {
      this.timers.owl = rand(25, 60);
      this.play('owl', this.around(20, 40));
    }
    if (!env.underground && env.night && this.timers.wolf <= 0) {
      this.timers.wolf = rand(60, 150);
      this.play('wolf', this.around(42, 48));
    }
    if (!env.underground && env.night && this.timers.lynx <= 0) {
      this.timers.lynx = rand(90, 220);
      this.play('lynx', this.around(25, 40));
    }
    // The ice along the lake: only out by the water, singing most as the night's cold deepens.
    if (!env.underground && env.water && this.timers.ice <= 0) {
      this.timers.ice = rand(5, 16) * (env.night ? 1 : 2) / (0.5 + env.water);
      this.play('ice', this.around(8, 30));
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
          this.play('deer-run', animal.position);
          timer = rand(0.3, 0.38);
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
      this.drip();
    }
    if (env.underground && this.timers.bat <= 0) {
      this.timers.bat = rand(10, 25);
      this.bat();
    }
    // Busy hands: chewing, gulping, rummaging, winding a bandage.
    const busy = env.eating ? ['chew', 0.22, 0.32] : env.drinking ? ['gulp', 0.5, 0.65]
      : env.searching ? ['rummage', 0.18, 0.35] : env.bandaging ? ['bandage', 0.3, 0.5] : null;
    if (busy && this.timers.busy <= 0) {
      this.timers.busy = rand(busy[1], busy[2]);
      this.play(busy[0]);
    }
    if (env.fire > 0 && this.timers.crackle <= 0) {
      this.timers.crackle = rand(0.04, 0.3);
      this.crackle(env.fire);
    }
    if (env.cooking && !this.files.sizzle && this.timers.sputter <= 0) { // (a recorded sizzle already spits)
      this.timers.sputter = rand(0.02, 0.09);
      this.burst({ type: 'highpass', freq: rand(4000, 7000), attack: 0.002, decay: rand(0.01, 0.03), gain: rand(0.01, 0.04) });
    }
  }

  // Plays sound effect `name` (see EFFECTS), from world position `at` ({ x, z }, or the
  // player's own if left out): further away is quieter, and off to the side is panned.
  // `volume` scales it (e.g. quieter footsteps while sneaking).
  play(name, at = null, volume = 1) {
    if (!this.ctx || this.muted) return;
    let pan = 0;
    let gain = volume;
    if (at) {
      const dx = at.x - this.listener.x;
      const distance = Math.hypot(dx, at.z - this.listener.z);
      if (distance > 50) return;
      pan = Math.max(-1, Math.min(1, dx / 14));
      gain *= 1 / (1 + distance / 9);
    }
    const echo = this.cave;
    if (this.playFile(name, gain * 0.6, pan, echo)) return;
    EFFECTS[name]?.(this, gain, pan, echo);
  }

  // A burst of filtered noise: the building block of footsteps, thuds, rustles and crashes.
  // `at` delays it (seconds).
  burst({ type = 'bandpass', freq = 1000, q = 1, attack = 0.005, decay = 0.08, gain = 0.1, pan = 0, echo = false, at = 0, sweep = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    source.connect(filter).connect(amp).connect(this.voice(1, pan, echo));
    source.start(t, Math.random() * (this.noise.duration - 2), attack + decay + 0.05);
  }

  // A tone that slides from one pitch to another and dies away: knocks, thuds, twangs, cries.
  tone({ type = 'sine', from = 200, to = from, attack = 0.005, decay = 0.1, gain = 0.1, pan = 0, echo = false, at = 0, filter = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + attack + decay);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    let out = osc.connect(amp);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = filter;
      f.Q.value = 1.5;
      out = out.connect(f);
    }
    out.connect(this.voice(1, pan, echo));
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  // Plays a recording of `name` if there is one; returns false if there isn't.
  playFile(name, volume, pan = 0, echo = false) {
    const buffer = this.files[name];
    if (!buffer) return false;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rand(0.9, 1.1);
    source.connect(this.voice(volume, pan, echo || name === 'drip' || name === 'bat'));
    source.start();
    return true;
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

  // A bird of the boreal winter somewhere around you (see EFFECTS).
  bird() {
    if (this.playFile('birds', rand(0.12, 0.28), rand(-0.9, 0.9))) return;
    const pick = Math.random();
    const name = pick < 0.4 ? 'junco' : pick < 0.65 ? 'chickadee' : pick < 0.82 ? 'jay' : 'raven';
    this.play(name, this.around(8, 35));
  }

  // Somewhere `near` to `far` meters from the player, in any direction.
  around(near, far) {
    const angle = rand(0, Math.PI * 2);
    const distance = rand(near, far);
    return { x: this.listener.x + Math.cos(angle) * distance, z: this.listener.z + Math.sin(angle) * distance };
  }

  // Whistled or called notes, all through one voice: birdsong, owls, wolves, a lynx, the ice.
  // `notes`: [{ at (seconds), length, from (Hz), to = from, gain = 1 }]. `type` is the tone's
  // wave and `filter` a bandpass on it (Hz); `warble`: [rate (Hz), depth (a fraction of the
  // pitch)] of a quick waver in pitch; `breath`: how much air goes with each note.
  song(notes, { volume, pan = 0, echo = false, type = 'sine', filter = null, warble = [0, 0], breath = 0.3 }) {
    const ctx = this.ctx;
    const out = this.voice(volume, pan, echo);
    let into = out;
    if (filter) {
      into = ctx.createBiquadFilter();
      into.type = 'bandpass';
      into.frequency.value = filter;
      into.Q.value = 1.2;
      into.connect(out);
    }
    const start = ctx.currentTime + 0.02;
    for (const { at, length, from, to = from, gain = 1 } of notes) {
      const t = start + at;
      const attack = Math.min(0.03, length * 0.3);
      const tone = ctx.createOscillator();
      tone.type = type;
      tone.frequency.setValueAtTime(from, t);
      tone.frequency.exponentialRampToValueAtTime(to, t + length);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.linearRampToValueAtTime(gain, t + attack);
      amp.gain.setValueAtTime(gain, t + length * 0.7);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
      tone.connect(amp).connect(into);
      tone.start(t);
      tone.stop(t + length + 0.02);
      if (warble[0]) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = warble[0];
        const depth = ctx.createGain();
        depth.gain.value = from * warble[1];
        lfo.connect(depth).connect(tone.frequency);
        lfo.start(t);
        lfo.stop(t + length + 0.02);
      }
      if (breath) this.burst({ freq: from, q: 6, attack, decay: length - attack, gain: gain * volume * breath, pan, echo, at: t - ctx.currentTime });
    }
  }

  // A drop of water falling into a puddle, echoing round the rock.
  drip() {
    const pan = rand(-0.7, 0.7);
    if (this.playFile('drip', 0.25, pan)) return;
    const ctx = this.ctx;
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    const pitch = rand(700, 1300);
    tone.frequency.setValueAtTime(pitch, t);
    tone.frequency.exponentialRampToValueAtTime(pitch * 0.35, t + 0.09);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    tone.connect(gain).connect(this.voice(1, pan, true));
    tone.start(t);
    tone.stop(t + 0.15);
  }

  // A bat's high squeak or two.
  bat() {
    const pan = rand(-0.8, 0.8);
    if (this.playFile('bat', 0.15, pan)) return;
    const ctx = this.ctx;
    const out = this.voice(1, pan, true);
    let t = ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.setValueAtTime(rand(6000, 8500), t);
      tone.frequency.exponentialRampToValueAtTime(rand(4000, 5000), t + 0.04);
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
      tone.connect(gain).connect(out);
      tone.start(t);
      tone.stop(t + 0.06);
      t += rand(0.06, 0.12);
    }
  }

  // A pop from the fire.
  crackle(level) {
    if (this.files.fire) return; // (a recorded fire already has its crackle)
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = rand(1500, 4000);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.25 * level * rand(0.3, 1), t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + rand(0.01, 0.04));
    source.connect(filter).connect(gain).connect(this.voice(1, rand(-0.3, 0.3)));
    source.start(t, Math.random() * (this.noise.duration - 2), 0.05);
  }
}

const rand = (min, max) => min + Math.random() * (max - min);

// The made-up sound effects. Each is (sound, volume, pan, echo) → plays it.
const EFFECTS = {
  // Footsteps.
  'step-grass': (s, v, pan, echo) => s.burst({ freq: rand(1500, 2200), q: 0.7, attack: 0.015, decay: 0.07, gain: 0.07 * v, pan, echo }),
  'step-dirt': (s, v, pan, echo) => {
    s.burst({ type: 'lowpass', freq: rand(700, 1000), attack: 0.004, decay: 0.06, gain: 0.09 * v, pan, echo });
    s.tone({ from: rand(85, 100), to: 60, decay: 0.05, gain: 0.08 * v, pan, echo });
  },
  'step-gravel': (s, v, pan, echo) => {
    for (let i = 0; i < 4; i++) s.burst({ freq: rand(2200, 3500), q: 1.2, attack: 0.002, decay: 0.02, gain: 0.05 * v, pan, echo, at: i * rand(0.01, 0.025) });
  },
  'step-rock': (s, v, pan, echo) => {
    s.burst({ type: 'highpass', freq: 2500, attack: 0.001, decay: 0.015, gain: 0.06 * v, pan, echo });
    s.tone({ from: rand(380, 460), to: 300, decay: 0.03, gain: 0.05 * v, pan, echo });
  },
  'step-snow': (s, v, pan, echo) => {
    for (let i = 0; i < 6; i++) s.burst({ freq: rand(900, 1500), q: 1, attack: 0.004, decay: 0.025, gain: 0.05 * v, pan, echo, at: i * 0.02 });
  },
  'step-wood': (s, v, pan, echo) => {
    s.tone({ from: rand(150, 175), to: 110, decay: 0.09, gain: 0.12 * v, pan, echo, filter: 300 });
    s.burst({ freq: 600, q: 1.5, attack: 0.002, decay: 0.03, gain: 0.05 * v, pan, echo });
  },
  'step-water': (s, v, pan, echo) => {
    s.burst({ freq: 900, q: 0.8, attack: 0.03, decay: 0.15, gain: 0.08 * v, pan, echo, sweep: 1800 });
    s.burst({ type: 'highpass', freq: 3500, attack: 0.02, decay: 0.08, gain: 0.03 * v, pan, echo, at: 0.03 });
  },
  swim: (s, v, pan, echo) => s.burst({ type: 'lowpass', freq: 400, attack: 0.12, decay: 0.3, gain: 0.08 * v, pan, echo, sweep: 1400 }),
  splash: (s, v, pan, echo) => {
    s.burst({ freq: 700, q: 0.6, attack: 0.01, decay: 0.35, gain: 0.18 * v, pan, echo, sweep: 2500 });
    s.burst({ type: 'highpass', freq: 3000, attack: 0.02, decay: 0.25, gain: 0.06 * v, pan, echo, at: 0.05 });
  },
  land: (s, v, pan, echo) => s.tone({ from: 90, to: 50, decay: 0.08, gain: 0.12 * v, pan, echo }),
  // Getting hit: a heavy thud, and the player's grunt.
  hit: (s, v, pan, echo) => {
    s.tone({ from: 110, to: 45, decay: 0.2, gain: 0.25 * v, pan, echo });
    s.burst({ type: 'lowpass', freq: 1200, attack: 0.003, decay: 0.12, gain: 0.15 * v, pan, echo });
  },
  hurt: (s, v, pan, echo) => s.tone({ type: 'sawtooth', from: 190, to: 120, attack: 0.02, decay: 0.28, gain: 0.07 * v, pan, echo, filter: 750, at: 0.04 }),
  // The axe biting into a trunk.
  chop: (s, v, pan, echo) => {
    s.tone({ from: rand(230, 270), to: 140, decay: 0.12, gain: 0.16 * v, pan, echo, filter: 400 });
    s.burst({ freq: 1400, q: 1, attack: 0.002, decay: 0.05, gain: 0.1 * v, pan, echo });
  },
  // A tree giving way: a long creak, then the crash as it hits the ground.
  'tree-creak': (s, v, pan, echo) => {
    s.tone({ type: 'sawtooth', from: 70, to: 45, attack: 0.3, decay: 0.9, gain: 0.05 * v, pan, echo, filter: 260 });
    s.burst({ freq: 500, q: 4, attack: 0.4, decay: 0.7, gain: 0.04 * v, pan, echo, sweep: 300 });
  },
  'tree-fall': (s, v, pan, echo) => {
    s.burst({ type: 'lowpass', freq: 900, attack: 0.01, decay: 1.1, gain: 0.3 * v, pan, echo, sweep: 200 });
    s.burst({ freq: 2500, q: 0.6, attack: 0.02, decay: 0.6, gain: 0.08 * v, pan, echo }); // branches snapping
    s.tone({ from: 70, to: 35, decay: 0.5, gain: 0.3 * v, pan, echo });
  },
  // The bow: a creak as it bends, then the string's twang and the arrow's whoosh.
  'bow-draw': (s, v, pan, echo) => s.burst({ freq: 300, q: 6, attack: 0.25, decay: 0.3, gain: 0.05 * v, pan, echo, sweep: 520 }),
  'bow-shoot': (s, v, pan, echo) => {
    s.tone({ type: 'triangle', from: 140, to: 110, attack: 0.002, decay: 0.25, gain: 0.14 * v, pan, echo });
    s.burst({ freq: 2500, q: 0.8, attack: 0.02, decay: 0.2, gain: 0.06 * v, pan, echo, sweep: 900 });
  },
  'arrow-hit': (s, v, pan, echo) => {
    s.tone({ from: 160, to: 90, decay: 0.08, gain: 0.15 * v, pan, echo });
    s.burst({ freq: 900, q: 1, attack: 0.002, decay: 0.05, gain: 0.08 * v, pan, echo });
  },
  'arrow-land': (s, v, pan, echo) => s.burst({ type: 'lowpass', freq: 800, attack: 0.002, decay: 0.06, gain: 0.08 * v, pan, echo }),
  stab: (s, v, pan, echo) => s.burst({ freq: 1800, q: 0.7, attack: 0.03, decay: 0.08, gain: 0.07 * v, pan, echo, sweep: 600 }),
  // Busy hands.
  chew: (s, v, pan, echo) => s.burst({ freq: rand(1200, 1800), q: 1.5, attack: 0.01, decay: 0.05, gain: 0.05 * v, pan, echo }),
  // A swallow: a short, low, wet knock in the throat.
  gulp: (s, v, pan, echo) => {
    s.tone({ from: rand(150, 180), to: 110, attack: 0.01, decay: 0.06, gain: 0.08 * v, pan, echo, filter: 300 });
    s.burst({ type: 'lowpass', freq: 500, attack: 0.008, decay: 0.05, gain: 0.05 * v, pan, echo });
  },
  rummage: (s, v, pan, echo) => s.burst({ freq: rand(1500, 3000), q: 0.8, attack: 0.02, decay: 0.07, gain: 0.05 * v, pan, echo }),
  bandage: (s, v, pan, echo) => s.burst({ freq: rand(3000, 4500), q: 1, attack: 0.06, decay: 0.12, gain: 0.04 * v, pan, echo }),
  cloth: (s, v, pan, echo) => s.burst({ freq: 2200, q: 0.6, attack: 0.08, decay: 0.25, gain: 0.06 * v, pan, echo, sweep: 1200 }),
  pickup: (s, v, pan, echo) => {
    s.burst({ freq: 1600, q: 1, attack: 0.01, decay: 0.06, gain: 0.05 * v, pan, echo });
    s.tone({ from: 600, to: 900, decay: 0.06, gain: 0.03 * v, pan, echo, at: 0.03 });
  },
  'fire-light': (s, v, pan, echo) => s.burst({ type: 'lowpass', freq: 300, attack: 0.15, decay: 0.6, gain: 0.15 * v, pan, echo, sweep: 1500 }),
  'add-wood': (s, v, pan, echo) => {
    s.tone({ from: 180, to: 120, decay: 0.08, gain: 0.08 * v, pan, echo, filter: 300 });
    s.burst({ freq: 2500, q: 0.8, attack: 0.05, decay: 0.3, gain: 0.04 * v, pan, echo, at: 0.05 });
  },
  // A trap being set: the wooden trigger snapping into its notch, then settling.
  'trap-set': (s, v, pan, echo) => {
    s.burst({ type: 'highpass', freq: 2000, attack: 0.001, decay: 0.012, gain: 0.06 * v, pan, echo });
    s.tone({ from: rand(650, 800), to: 380, decay: 0.03, gain: 0.07 * v, pan, echo, filter: 700 });
    s.burst({ freq: 900, q: 1, attack: 0.01, decay: 0.08, gain: 0.05 * v, pan, echo, at: 0.04 });
  },

  // Birds of the boreal winter, by day (see Sound.bird).
  // Dark-eyed junco: mostly its sharp little "tsip" contact calls, a few, unevenly spaced, as a
  // flock feeds; now and then a short, dry, musical trill.
  junco: (s, v, pan, echo) => {
    if (Math.random() < 0.75) {
      let at = 0;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) {
        const pitch = rand(6500, 8000);
        s.song([{ at, length: 0.035, from: pitch, to: pitch * 0.82 }], { volume: 0.06 * v, pan, echo, breath: 0.25 });
        at += rand(0.25, 1.1);
      }
    } else {
      const pitch = rand(3800, 4600);
      const notes = Array.from({ length: 10 + Math.floor(Math.random() * 8) }, (_, i) => ({ at: i * 0.065, length: 0.04, from: pitch * 1.08, to: pitch }));
      s.song(notes, { volume: 0.07 * v, pan, echo, breath: 0.2 });
    }
  },
  // Boreal chickadee, a wheezy "tsik-a-dee-dee": two quick high notes, then two buzzy ones.
  chickadee: (s, v, pan, echo) => {
    s.song([{ at: 0, length: 0.05, from: 7000, to: 5500 }, { at: 0.08, length: 0.05, from: 5000, to: 4500, gain: 0.7 }],
      { volume: 0.08 * v, pan, echo, breath: 0.2 });
    const dee = rand(3200, 3700);
    s.song([{ at: 0.18, length: 0.22, from: dee, to: dee * 0.95 }, { at: 0.45, length: 0.22, from: dee * 0.98, to: dee * 0.93 }],
      { volume: 0.06 * v, pan, echo, type: 'sawtooth', filter: dee * 1.4, warble: [rand(70, 90), 0.04], breath: 0.6 });
  },
  // Canada jay: a soft, falling whistle or two ("whee-oo"), then a quiet chuckle.
  jay: (s, v, pan, echo) => {
    const pitch = rand(2600, 3000);
    const notes = [{ at: 0, length: 0.4, from: pitch, to: pitch * 0.62 }];
    if (Math.random() < 0.6) notes.push({ at: 0.55, length: 0.35, from: pitch * 0.95, to: pitch * 0.6 });
    s.song(notes, { volume: 0.12 * v, pan, echo, warble: [rand(8, 12), 0.015] });
    for (let i = 0; i < 3; i++) s.burst({ freq: 1800, q: 3, attack: 0.005, decay: 0.03, gain: 0.03 * v, pan, echo, at: 1.1 + i * 0.09 });
  },
  // Common raven: a deep, rough croak ("kraak"), one to three times.
  raven: (s, v, pan, echo) => {
    const notes = [];
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
      const pitch = rand(330, 420);
      notes.push({ at: i * rand(0.5, 0.8), length: rand(0.25, 0.35), from: pitch, to: pitch * 0.85 });
    }
    s.song(notes, { volume: 0.18 * v, pan, echo, type: 'sawtooth', filter: 1100, warble: [rand(45, 60), 0.12], breath: 0.4 });
  },

  // The night.
  // An owl: mostly a great horned owl's deep "hoo, h'hoo-hoo, hoo, hoo"; sometimes a boreal
  // owl's quick run of higher hoots.
  owl: (s, v, pan, echo) => {
    if (Math.random() < 0.7) {
      const pitch = rand(280, 340);
      const notes = [[0, 0.35], [0.55, 0.12], [0.7, 0.3], [1.15, 0.4], [1.75, 0.45]]
        .map(([at, length]) => ({ at, length, from: pitch, to: pitch * 0.94 }));
      s.song(notes, { volume: 0.2 * v, pan, echo, breath: 0.5 });
    } else {
      const pitch = rand(650, 750);
      const notes = Array.from({ length: 8 + Math.floor(Math.random() * 6) }, (_, i) => ({ at: i * 0.13, length: 0.09, from: pitch, to: pitch * 0.95 }));
      s.song(notes, { volume: 0.12 * v, pan, echo, breath: 0.4 });
    }
  },
  // A wolf howling far off: rising into a long, wavering note that falls away. Sometimes a
  // second one joins in, a little higher.
  wolf: (s, v, pan, echo) => {
    const howl = (at, pitch, gain) => s.song(
      [{ at, length: 0.5, from: pitch * 0.7, to: pitch }, { at: at + 0.45, length: rand(2, 3.2), from: pitch, to: pitch * 0.8 }],
      { volume: gain * v, pan, echo, type: 'triangle', warble: [rand(4, 6), 0.02], breath: 0.2 },
    );
    howl(0, rand(420, 520), 0.2);
    if (Math.random() < 0.5) howl(rand(1, 2), rand(550, 650), 0.14);
  },
  // A Canada lynx out in the woods: a deep, drawn-out yowl, rising and falling like a house
  // cat's caterwaul but lower and rougher, once to three times; sometimes a low growl first.
  lynx: (s, v, pan, echo) => {
    let at = 0;
    if (Math.random() < 0.4) {
      s.song([{ at: 0, length: rand(0.8, 1.2), from: rand(95, 120), to: rand(80, 95) }],
        { volume: 0.12 * v, pan, echo, type: 'sawtooth', filter: 420, warble: [rand(18, 26), 0.08], breath: 0.6 });
      at = 1.4;
    }
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
      const pitch = rand(260, 340);
      const length = rand(0.9, 1.6);
      s.song([
        { at, length: length * 0.45, from: pitch * 0.8, to: pitch * 1.45 },
        { at: at + length * 0.4, length: length * 0.6, from: pitch * 1.45, to: pitch * 0.7 },
      ], { volume: 0.13 * v, pan, echo, type: 'sawtooth', filter: 950, warble: [rand(5, 8), 0.04], breath: 0.45 });
      at += length + rand(0.4, 1.2);
    }
  },

  // The ice along a lake, cooling and tightening (see Sound.update): any of
  // - pings: the "pew" of a crack running through the sheet, each pitch falling fast from high
  //   to low (the ice carries the high notes quickest), with a fainter echo off the far shore;
  // - a groan: a low, wavering moan as the sheet flexes;
  // - a whip crack: a sharp snap, a thump under it, and the pings running away from it;
  // - singing: a slow, whale-like glide up and down.
  ice: (s, v, pan, echo) => {
    const ping = (at, gain) => {
      const from = rand(2400, 4200);
      s.tone({ from, to: from * rand(0.06, 0.1), attack: 0.002, decay: rand(0.18, 0.3), gain: gain * v, pan, echo, at });
      s.tone({ from: from * 0.9, to: from * 0.08, attack: 0.002, decay: 0.3, gain: gain * 0.3 * v, pan: -pan * 0.5, echo, at: at + rand(0.12, 0.2) });
    };
    const pick = Math.random();
    if (pick < 0.4) {
      let at = 0;
      for (let i = 0; i < 1 + Math.floor(Math.random() * 4); i++) {
        ping(at, rand(0.05, 0.09));
        at += rand(0.15, 0.7);
      }
    } else if (pick < 0.65) {
      const pitch = rand(55, 85);
      s.song([{ at: 0, length: rand(1.4, 2.6), from: pitch, to: pitch * rand(0.75, 1.3) }],
        { volume: 0.16 * v, pan, echo, type: 'sawtooth', filter: 260, warble: [rand(2, 4), 0.1], breath: 0.5 });
    } else if (pick < 0.88) {
      s.burst({ type: 'highpass', freq: 2500, attack: 0.001, decay: 0.05, gain: 0.25 * v, pan, echo });
      s.tone({ from: 120, to: 45, attack: 0.003, decay: 0.35, gain: 0.18 * v, pan, echo });
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) ping(0.08 + i * rand(0.08, 0.2), 0.07 / (1 + i * 0.4));
    } else {
      const pitch = rand(380, 520);
      s.song([
        { at: 0, length: 1.1, from: pitch, to: pitch * 1.6 },
        { at: 1.0, length: 1.4, from: pitch * 1.6, to: pitch * 1.1 },
      ], { volume: 0.06 * v, pan, echo, type: 'sine', warble: [rand(3, 5), 0.02], breath: 0.1 });
    }
  },

  // Deer, from where the deer is (see Sound.update).
  // Spotting you and bolting: a stamp of a hoof, then a sharp blow of air through the nose.
  'deer-snort': (s, v, pan, echo) => {
    s.tone({ from: 90, to: 50, decay: 0.06, gain: 0.15 * v, pan, echo });
    for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
      s.burst({ freq: rand(900, 1300), q: 1.5, attack: 0.015, decay: 0.3, gain: 0.25 * v, pan, echo, sweep: 500, at: 0.12 + i * 0.5 });
    }
  },
  // A soft, nasal bleat ("maa") now and then while it grazes.
  'deer-bleat': (s, v, pan, echo) => {
    const pitch = rand(280, 380);
    s.song([{ at: 0, length: rand(0.25, 0.4), from: pitch, to: pitch * 0.85 }],
      { volume: 0.12 * v, pan, echo, type: 'sawtooth', filter: 900, warble: [rand(6, 9), 0.03], breath: 0.3 });
  },
  // A hoof on the ground, quietly, as it walks...
  'deer-step': (s, v, pan, echo) => {
    s.tone({ from: rand(110, 130), to: 70, decay: 0.04, gain: 0.06 * v, pan, echo });
    s.burst({ freq: rand(1500, 2200), q: 0.7, attack: 0.01, decay: 0.06, gain: 0.04 * v, pan, echo });
  },
  // ...and the drum of all four as it gallops off, crashing through the brush.
  'deer-run': (s, v, pan, echo) => {
    for (let i = 0; i < 4; i++) s.tone({ from: rand(95, 120), to: 55, decay: 0.05, gain: 0.14 * v, pan, echo, at: i * rand(0.04, 0.06) });
    s.burst({ freq: rand(1500, 2500), q: 0.6, attack: 0.02, decay: 0.12, gain: 0.06 * v, pan, echo });
  },
};

// Nine seconds of white noise, to filter into wind, water and fire. (Long enough that you can't
// hear it repeating: with only a second or two, you can.)
function makeNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 9, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function readMuted() {
  try {
    return localStorage.getItem('survival-muted') === '1';
  } catch {
    return false;
  }
}
