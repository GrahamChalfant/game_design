// Hunger, thirst, health and the survival clock. All the numbers to tune the
// difficulty are here at the top.

// One in-game day lasts 10 real minutes at normal speed.
const GAME_MINUTES_PER_SECOND = 2.4;
const START_HOUR = 8; // the first day starts at 8 in the morning

// Drain rates, in points (out of 100) per in-game hour.
const HUNGER_PER_HOUR = 2.8; // empty after about 36 in-game hours
const THIRST_PER_HOUR = 5; // empty after about 20 in-game hours
const STARVING_DAMAGE_PER_HOUR = 25; // health lost per empty stat: dead about 4 hours later
const HEALING_PER_HOUR = 5; // health regained while well fed and watered
const WELL_FED = 50; // hunger and thirst both need to be above this to heal

const DRINK_PER_SECOND = 30; // thirst regained per real second while drinking
const WORK_HUNGER = 3; // hard work (like chopping) makes you hungry this many times faster

export class Survival {
  constructor() {
    this.reset();
  }

  reset() {
    this.hunger = 100;
    this.thirst = 100;
    this.health = 100;
    this.minutesSurvived = 0;
    this.alive = true;
  }

  // `speed` makes time pass faster for testing (see README).
  update(dt, { drinking, working }, speed = 1) {
    if (!this.alive) return;
    const minutes = dt * GAME_MINUTES_PER_SECOND * speed;
    const hours = minutes / 60;
    this.minutesSurvived += minutes;

    this.hunger = clamp(this.hunger - HUNGER_PER_HOUR * hours * (working ? WORK_HUNGER : 1));
    this.thirst = clamp(this.thirst - THIRST_PER_HOUR * hours);
    if (drinking) this.thirst = clamp(this.thirst + DRINK_PER_SECOND * dt * speed);

    const emptyStats = (this.hunger === 0 ? 1 : 0) + (this.thirst === 0 ? 1 : 0);
    if (emptyStats > 0) {
      this.health = clamp(this.health - STARVING_DAMAGE_PER_HOUR * emptyStats * hours);
    } else if (this.hunger > WELL_FED && this.thirst > WELL_FED) {
      this.health = clamp(this.health + HEALING_PER_HOUR * hours);
    }

    if (this.health === 0) this.alive = false;
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
