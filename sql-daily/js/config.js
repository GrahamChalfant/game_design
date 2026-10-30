// Scoring and timing. A perfect day adds up to exactly 1,000:
//
//   base points     100 + 200 + 300 = 600   (for a correct answer)
//   speed bonus      50 + 100 + 150 = 300   (up to half the base, shrinking as the timer runs down)
//   perfect bonus                     100   (all three correct)
//                                   -----
//                                   1,000

export const TIERS = {
  easy: { label: 'Easy', points: 100, maxSpeedBonus: 50, seconds: 60 },
  medium: { label: 'Medium', points: 200, maxSpeedBonus: 100, seconds: 60 },
  hard: { label: 'Hard', points: 300, maxSpeedBonus: 150, seconds: 60 },
};

export const TIER_ORDER = ['easy', 'medium', 'hard'];

export const PERFECT_BONUS = 100;

// Day 1 of the game. The puzzle number shown to players counts from here.
export const LAUNCH_DATE = '2026-11-01';

// Speed bonus for answering with `secondsLeft` remaining, rounded to the nearest 5 points.
export function speedBonus(tier, secondsLeft) {
  const { maxSpeedBonus, seconds } = TIERS[tier];
  const fraction = Math.max(0, Math.min(1, secondsLeft / seconds));
  return Math.round((maxSpeedBonus * fraction) / 5) * 5;
}
