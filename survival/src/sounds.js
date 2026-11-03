// The sounds of the place: wind, birdsong by day, crickets and the odd owl at night, water
// lapping nearby, a campfire crackling, and dripping and bats down a cave.
//
// Every sound is made right here with the Web Audio API, so the game needs no sound files.
// To use a recording instead, drop a file into public/sounds/ named after the sound (see
// SOUNDS below), e.g. public/sounds/birds.mp3: if it's there, it's played in place of the
// made-up one. Loops (wind, crickets, water, fire, cave) are played looping; the others are
// played now and then, a little higher or lower each time.
//
// Browsers only allow sound once you've clicked or pressed a key, so it starts then.
// N turns it off and on (remembered for next time).
export const SOUNDS = {
  wind: 'loop', // stronger up the mountains
  crickets: 'loop', // at night
  water: 'loop', // by a lake or the river
  fire: 'loop', // by a burning campfire
  cave: 'loop', // the hum underground
  birds: 'once', // by day: a bird singing somewhere around you
  owl: 'once', // at night, now and then
  drip: 'once', // underground
  bat: 'once', // underground
};
const FORMATS = ['mp3', 'ogg', 'wav'];
const VOLUME = 0.7;

export class Sound {
  constructor() {
    this.ctx = null;
    this.files = {}; // name → AudioBuffer, for any recordings found in public/sounds/
    this.loops = {};
    this.timers = { birds: 1, owl: 8, drip: 1, bat: 5, crackle: 0 };
    this.muted = readMuted();
    this.time = 0;
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
    feedback.gain.value = 0.45;
    this.echo.connect(feedback).connect(this.echo);
    this.echoOut = ctx.createGain();
    this.echoOut.gain.value = 0;
    this.echo.connect(this.echoOut).connect(this.master);

    this.noise = makeNoise(ctx);
    // The made-up loops: filtered noise, or (for the crickets) a pulsing whistle.
    this.loops.wind = this.noiseLoop('bandpass', 420, 0.6);
    this.loops.water = this.noiseLoop('lowpass', 520, 0.5);
    this.loops.fire = this.noiseLoop('bandpass', 1800, 1.2);
    this.loops.cave = this.noiseLoop('lowpass', 140, 0.7);
    this.loops.crickets = this.cricketLoop();
    for (const name of Object.keys(SOUNDS)) this.load(name);
  }

  // Looks for a recording of `name` in public/sounds/.
  async load(name) {
    for (const format of FORMATS) {
      try {
        const response = await fetch(`sounds/${name}.${format}`);
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
    source.start();
    return { source, gain, filter };
  }

  // Crickets: a high whistle switched on and off in quick bursts.
  cricketLoop() {
    const ctx = this.ctx;
    const tone = ctx.createOscillator();
    tone.frequency.value = 4300;
    const pulse = ctx.createOscillator();
    pulse.type = 'square';
    pulse.frequency.value = 28;
    const chirp = ctx.createGain();
    chirp.gain.value = 0;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    pulse.connect(pulseDepth).connect(chirp.gain);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    tone.connect(chirp).connect(gain).connect(this.master);
    tone.start();
    pulse.start();
    // Bursts of chirping, a few times a second.
    const bursts = ctx.createOscillator();
    bursts.frequency.value = 2.6;
    const burstDepth = ctx.createGain();
    burstDepth.gain.value = 0.5;
    bursts.connect(burstDepth).connect(gain.gain);
    bursts.start();
    return { gain, base: 0 };
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
  // the water is), fire (0–1), woods (0–1) }.
  update(dt, env) {
    if (!this.ctx) return;
    this.time += dt;
    const now = this.ctx.currentTime;
    const set = (name, level) => this.loops[name]?.gain.gain.setTargetAtTime(env.paused ? 0 : level, now, 0.4);
    const outside = env.underground ? 0 : 1;
    const gust = 0.75 + 0.25 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11);
    set('wind', outside * (0.05 + 0.3 * env.cold) * gust);
    set('water', outside * 0.18 * env.water);
    set('fire', outside * 0.35 * env.fire);
    set('cave', env.underground * 0.45);
    set('crickets', outside * (env.night ? 0.035 * (1 - env.cold) : 0));
    this.echoOut.gain.setTargetAtTime(env.underground ? 0.7 : 0, now, 0.3);
    if (env.paused) return;

    // Now-and-then sounds.
    for (const key of Object.keys(this.timers)) this.timers[key] -= dt;
    if (!env.underground && !env.night && env.cold < 0.6 && this.timers.birds <= 0) {
      this.timers.birds = rand(1.2, 4.5) / (0.5 + env.woods);
      this.bird();
    }
    if (!env.underground && env.night && this.timers.owl <= 0) {
      this.timers.owl = rand(14, 35);
      this.owl();
    }
    if (env.underground && this.timers.drip <= 0) {
      this.timers.drip = rand(0.6, 3);
      this.drip();
    }
    if (env.underground && this.timers.bat <= 0) {
      this.timers.bat = rand(4, 12);
      this.bat();
    }
    if (env.fire > 0 && this.timers.crackle <= 0) {
      this.timers.crackle = rand(0.04, 0.3);
      this.crackle(env.fire);
    }
  }

  // Plays a recording of `name` if there is one; returns false if there isn't.
  playFile(name, volume, pan = 0) {
    const buffer = this.files[name];
    if (!buffer) return false;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rand(0.9, 1.1);
    source.connect(this.voice(volume, pan, name === 'drip' || name === 'bat'));
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

  // A few quick whistled notes, sliding up or down, somewhere off to one side.
  bird() {
    const pan = rand(-0.9, 0.9);
    const volume = rand(0.03, 0.07);
    if (this.playFile('birds', volume * 4, pan)) return;
    const ctx = this.ctx;
    const out = this.voice(1, pan);
    const notes = 2 + Math.floor(Math.random() * 5);
    const base = rand(2200, 3800);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < notes; i++) {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      const length = rand(0.05, 0.14);
      const from = base * rand(0.85, 1.2);
      tone.frequency.setValueAtTime(from, t);
      tone.frequency.exponentialRampToValueAtTime(from * rand(0.7, 1.5), t + length);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + length);
      tone.connect(gain).connect(out);
      tone.start(t);
      tone.stop(t + length + 0.02);
      t += length + rand(0.03, 0.12);
    }
  }

  // Hoo… hoo-hoo.
  owl() {
    const pan = rand(-0.8, 0.8);
    if (this.playFile('owl', 0.3, pan)) return;
    const ctx = this.ctx;
    const out = this.voice(1, pan);
    let t = ctx.currentTime + 0.05;
    for (const [length, pitch] of [[0.45, 420], [0.2, 400], [0.5, 380]]) {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.setValueAtTime(pitch, t);
      tone.frequency.linearRampToValueAtTime(pitch * 0.93, t + length);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.06);
      gain.gain.linearRampToValueAtTime(0, t + length);
      tone.connect(gain).connect(out);
      tone.start(t);
      tone.stop(t + length + 0.02);
      t += length + 0.15;
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
    source.start(t, Math.random() * 1.5, 0.05);
  }
}

const rand = (min, max) => min + Math.random() * (max - min);

// Two seconds of white noise, to filter into wind, water and fire.
function makeNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
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
