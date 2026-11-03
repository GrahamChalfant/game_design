import { isNight } from './daylight.js';

// Hunger, thirst, temperature, health and the survival clock. All the numbers to tune the
// difficulty are here at the top.

// One in-game day lasts 10 real minutes at normal speed.
export const GAME_MINUTES_PER_SECOND = 2.4;
const START_HOUR = 8; // the first day starts at 8 in the morning

// Drain rates, in points (out of 100) per in-game hour.
const HUNGER_PER_HOUR = 2.8; // empty after about 36 in-game hours
const THIRST_PER_HOUR = 5; // empty after about 20 in-game hours
const STARVING_DAMAGE_PER_HOUR = 25; // health lost per empty stat: dead about 4 hours later
const HEALING_PER_HOUR = 5; // health regained while well fed and watered
const WELL_FED = 25; // hunger and thirst both need to be at least this to heal

const START_HEALTH = 35; // you start hurt from the crash: use bandages to heal
const DRINK_PER_SECOND = 30; // thirst regained per real second while drinking
const WORK_HUNGER = 3; // hard work (like chopping) makes you hungry this many times faster

// Temperature (0–100). Rates are points per in-game hour (1 game hour ≈ 25 real seconds).
const START_TEMPERATURE = 60;
const WATER_CHILL_PER_HOUR = 28; // submerged in water
const NIGHT_CHILL_PER_HOUR = 12; // outdoors at night with no fire or shelter
const OUTDOOR_WARMING_PER_HOUR = 5; // daytime outdoors drifts toward DAY_TEMPERATURE at this rate
const DAY_TEMPERATURE = 60; // outdoor warming never goes above this
const WET_HOURS = 1; // after leaving the water you're Wet this long...
const WET_WARMING_PER_HOUR = 5; // ...and can only warm this fast
const SHELTER_WARMING_PER_HOUR = 15;
const SHELTER_MAX = 85;
const FIRE_WARMING_PER_HOUR = 35;
const FIRE_MAX = 100; // a fire is the only way above SHELTER_MAX
export const FREEZING = 15; // at or below this you're Freezing
const FREEZING_DAMAGE_PER_HOUR = 10;
const FROZEN_DAMAGE_PER_HOUR = 25; // at temperature 0
const COSY = 80; // healing needs this temperature (a shelter or a fire gets you there)...
const COSY_HOURS = 1; // ...held for this many in-game hours in a row

// One step of the temperature model. Pure, so it can be simulated outside the game.
// state: { temperature, wetHours }; env: { submerged, fire, shelter, night }.
export function stepTemperature(state, { submerged, fire, shelter, night }, hours) {
  let t = state.temperature;
  let wetHours = state.wetHours;
  if (submerged) {
    t -= WATER_CHILL_PER_HOUR * hours;
    wetHours = WET_HOURS;
  } else {
    let rate, max;
    if (fire) [rate, max] = [FIRE_WARMING_PER_HOUR, FIRE_MAX];
    else if (shelter) [rate, max] = [SHELTER_WARMING_PER_HOUR, SHELTER_MAX];
    else if (night) [rate, max] = [-NIGHT_CHILL_PER_HOUR, 100];
    else [rate, max] = [OUTDOOR_WARMING_PER_HOUR, DAY_TEMPERATURE];
    if (wetHours > 0) rate = Math.min(rate, WET_WARMING_PER_HOUR);
    if (rate > 0) {
      if (t < max) t = Math.min(max, t + rate * hours); // a source never pushes you past its cap
      else if (!fire && !shelter) t = Math.max(max, t - OUTDOOR_WARMING_PER_HOUR * hours); // daytime drifts down to 60
    } else t += rate * hours;
    wetHours = Math.max(0, wetHours - hours);
  }
  return { temperature: clamp(t), wetHours };
}

export class Survival {
  constructor() {
    this.reset();
  }

  reset() {
    this.hunger = 100;
    this.thirst = 100;
    this.temperature = START_TEMPERATURE;
    this.wetHours = 0;
    this.cosyHours = 0; // continuous hours at COSY or warmer
    this.health = START_HEALTH;
    this.minutesSurvived = 0;
    this.alive = true;
  }

  // `speed` makes time pass faster for testing (see README).
  update(dt, { drinking, working, fire, shelter, wet }, speed = 1) {
    if (!this.alive) return;
    const minutes = dt * GAME_MINUTES_PER_SECOND * speed;
    const hours = minutes / 60;
    this.minutesSurvived += minutes;

    this.hunger = clamp(this.hunger - HUNGER_PER_HOUR * hours * (working ? WORK_HUNGER : 1));
    this.thirst = clamp(this.thirst - THIRST_PER_HOUR * hours);
    if (drinking) this.thirst = clamp(this.thirst + DRINK_PER_SECOND * dt * speed);

    const next = stepTemperature(this, { submerged: wet, fire, shelter, night: isNight(this.hourOfDay) }, hours);
    this.temperature = next.temperature;
    this.wetHours = next.wetHours;
    this.cosyHours = this.temperature >= COSY ? this.cosyHours + hours : 0;

    const emptyStats = (this.hunger === 0 ? 1 : 0) + (this.thirst === 0 ? 1 : 0);
    if (emptyStats > 0) {
      this.health = clamp(this.health - STARVING_DAMAGE_PER_HOUR * emptyStats * hours);
    } else if (this.cosyHours >= COSY_HOURS && this.hunger >= WELL_FED && this.thirst >= WELL_FED) {
      this.health = clamp(this.health + HEALING_PER_HOUR * hours);
    }

    if (this.temperature === 0) this.health = clamp(this.health - FROZEN_DAMAGE_PER_HOUR * hours);
    else if (this.temperature <= FREEZING) this.health = clamp(this.health - FREEZING_DAMAGE_PER_HOUR * hours);

    if (this.health === 0) this.alive = false;
  }

  get isWet() {
    return this.wetHours > 0;
  }

  get isFreezing() {
    return this.temperature <= FREEZING;
  }

  // Eating: changes hunger and health (health can go down, e.g. from raw meat).
  // Sleeps until `wakeHour` the next morning. Time passes, but nothing else changes.
  // Returns how many in-game minutes were slept.
  sleepUntil(wakeHour) {
    const minutes = (((wakeHour - this.hourOfDay) % 24) + 24) % 24 * 60;
    this.minutesSurvived += minutes;
    return minutes;
  }

  drink(amount) {
    this.thirst = clamp(this.thirst + amount);
  }

  // Takes `amount` health (e.g. a boar's gore).
  hurt(amount) {
    this.health = clamp(this.health - amount);
    if (this.health === 0) this.alive = false;
  }

  eat(hunger, health) {
    this.hunger = clamp(this.hunger + hunger);
    this.health = clamp(this.health + health);
    if (this.health === 0) this.alive = false;
  }

  // Time of day as hours from 0 to 24, e.g. 13.5 for half past one in the afternoon.
  get hourOfDay() {
    return ((START_HOUR * 60 + this.minutesSurvived) / 60) % 24;
  }

  // The in-game day (starting at 1) and time of day, e.g. { day: 2, hour: 14, minute: 5 }.
  get clock() {
    const total = START_HOUR * 60 + this.minutesSurvived;
    return {
      day: Math.floor(total / 1440) + 1,
      hour: Math.floor(total / 60) % 24,
      minute: Math.floor(total) % 60,
    };
  }
}

const clamp = (value) => Math.min(100, Math.max(0, value));

// "1 day, 6 hours" / "14 hours, 20 minutes" / "19 minutes"
export function formatDuration(totalMinutes) {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = Math.floor(totalMinutes) % 60;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (days > 0) return `${plural(days, 'day')}, ${plural(hours, 'hour')}`;
  if (hours > 0) return `${plural(hours, 'hour')}, ${plural(minutes, 'minute')}`;
  return plural(minutes, 'minute');
}
