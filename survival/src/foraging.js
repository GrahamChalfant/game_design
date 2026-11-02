// Berry foraging (issue #74): the first rung of the food ladder (berries → traps →
// knife/boar → bow/deer). Every number to tune is here. Pure logic only (no three.js),
// so it can be simulated outside the game: see sim/food-sim.mjs.

export const BUSH_COUNT = 8;
export const BUSH_RING = [15, 45]; // bushes grow this many meters from the crash site (at 0, 0)
export const BUSH_SPACING = 3; // meters kept between bushes
export const BERRIES_PER_PICK = 2; // what one bush gives (kept small: berries are a fallback, not a staple)
export const BERRY_HUNGER = 12; // hunger one handful restores (cooked meat gives 35)
export const BERRY_STACK = 20;
export const BUSH_REGROW_MINUTES = 24 * 60; // one in-game day (10 real minutes) until it fruits again
// Berries don't spoil in v1.

// Where bushes grow: a ring around the wreck, in the starter woods. `isFree(x, z)` says
// whether a spot is open ground; `random` is a seeded generator.
export function bushSpots(random, isFree) {
  const spots = [];
  for (let tries = 0; spots.length < BUSH_COUNT && tries < BUSH_COUNT * 300; tries++) {
    const angle = random.range(0, Math.PI * 2);
    const distance = random.range(BUSH_RING[0], BUSH_RING[1]);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (!isFree(x, z)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < BUSH_SPACING)) continue;
    spots.push({ x, z });
  }
  return spots;
}

// A bush: { x, z, pickedAt: null | game minute }. It has berries unless picked within the
// last BUSH_REGROW_MINUTES. `now` is game minutes (survival.minutesSurvived), so sleeping
// counts as time passing.
export function hasBerries(bush, now) {
  return bush.pickedAt === null || now - bush.pickedAt >= BUSH_REGROW_MINUTES;
}

// Picks a bush; returns how many berries came off it (0 if it's bare).
export function pickBush(bush, now) {
  if (!hasBerries(bush, now)) return 0;
  bush.pickedAt = now;
  return BERRIES_PER_PICK;
}

// Game minutes until a picked bush fruits again (0 if it has berries).
export function regrowLeft(bush, now) {
  return hasBerries(bush, now) ? 0 : BUSH_REGROW_MINUTES - (now - bush.pickedAt);
}
