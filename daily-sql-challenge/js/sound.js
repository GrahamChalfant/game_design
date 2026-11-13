// The audience. Real crowd recordings (see sounds/README.md), played louder and for longer the
// better the film is doing. `level` is how many box office milestones the film has passed
// (0 = none) and `levels` is how many milestones there are.

// ---- Tuning ---------------------------------------------------------------------------------
// The recordings were made at different volumes; `trim` evens them out before anything else.
const CLIPS = {
  cheerSmall: { url: 'sounds/cheer-small.mp3', trim: 2.0 },
  cheerBig: { url: 'sounds/cheer-big.mp3', trim: 1.0 },
  boo: { url: 'sounds/boo.mp3', trim: 1.0 },
  shush: { url: 'sounds/shush.mp3', trim: 1.0 },
  popcorn1: { url: 'sounds/popcorn-1.mp3', trim: 0.4 },
  popcorn2: { url: 'sounds/popcorn-2.mp3', trim: 1.6 },
};
const BIG_CROWD_FROM = 0.5;                 // share of the milestones at which the big crowd takes over
const CHEER_VOLUME = [0.09, 0.65];          // quietest and loudest cheer (0 to 1)
const CHEER_SECONDS = [2.2, 7.5];           // shortest and longest cheer
const BOO_VOLUME = [0.35, 0.65];            // boos with an empty house and with a full one
// Background noises during a question. Kept well under the quietest cheer so they don't distract.
const AMBIENT_VOLUME = { shush: 0.45, popcorn: 1.0 };

const lerp = ([a, b], k) => a + (b - a) * k;

// Each recording is fetched and decoded once per audio context, the first time it is needed.
const cache = new WeakMap();
function load(ctx, name) {
  if (!cache.has(ctx)) cache.set(ctx, {});
  const store = cache.get(ctx);
  store[name] ||= fetch(CLIPS[name].url)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data));
  return store[name];
}

// Fetch everything ahead of time so the first cheer isn't late.
export function preload(ctx) {
  for (const name of Object.keys(CLIPS)) load(ctx, name).catch(() => {});
}

async function play(ctx, name, volume, seconds, dest, rate = 1) {
  const buffer = await load(ctx, name);
  const len = Math.min(seconds, buffer.duration);
  const t0 = ctx.currentTime + 0.02;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  const v = volume * CLIPS[name].trim;
  gain.gain.setValueAtTime(v, t0);
  gain.gain.setValueAtTime(v, t0 + len * 0.7);
  gain.gain.linearRampToValueAtTime(0, t0 + len); // fade out rather than cutting off
  src.connect(gain).connect(dest || ctx.destination);
  src.start(t0);
  src.stop(t0 + len);
  return len;
}

// A polite clap at level 0, the roof coming off at the top level.
export function cheer(ctx, level, levels, dest) {
  const k = Math.max(0, Math.min(1, level / levels));
  const name = k >= BIG_CROWD_FROM ? 'cheerBig' : 'cheerSmall';
  return play(ctx, name, lerp(CHEER_VOLUME, k), lerp(CHEER_SECONDS, k), dest);
}

// The same audience, unhappy. A bigger crowd boos louder.
export function boo(ctx, level, levels, dest) {
  const k = Math.max(0, Math.min(1, level / levels));
  return play(ctx, 'boo', lerp(BOO_VOLUME, k), 4, dest);
}

// A small background noise from somewhere in the audience: 'shush' or 'popcorn'.
// The speed is nudged a little each time so the same recording doesn't sound identical twice.
export function ambient(ctx, kind, dest) {
  const name = kind === 'popcorn' ? (Math.random() < 0.5 ? 'popcorn1' : 'popcorn2') : 'shush';
  return play(ctx, name, AMBIENT_VOLUME[kind], 6, dest, 0.92 + Math.random() * 0.16);
}
