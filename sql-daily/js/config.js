// Scoring and timing. A perfect day adds up to exactly 1,000:
//
//   base points     100 + 200 + 300 = 600   (for a correct answer)
//   boost            50 + 100 + 150 = 300   (answer with more than a third of the time left)
//   perfect bonus                     100   (all three correct)
//                                   -----
//                                   1,000

export const TIERS = {
  easy: { part: 'Part I', label: 'Easy', points: 100, boost: 50, seconds: 60 },
  medium: { part: 'Part II', label: 'Medium', points: 200, boost: 100, seconds: 120 },
  hard: { part: 'Part III', label: 'Hard', points: 300, boost: 150, seconds: 180 },
};

export const TIER_ORDER = ['easy', 'medium', 'hard'];

export const PERFECT_BONUS = 100;

// The boost is earned by answering while more than this fraction of the time is left.
export const BOOST_FRACTION = 1 / 3;

// Seconds of 3-2-1 countdown before each question.
export const COUNTDOWN_SECONDS = 3;

// Day 1 of the game. The puzzle number shown to players counts from here.
export const LAUNCH_DATE = '2026-11-01';

// Boost points for answering with `secondsLeft` remaining: all or nothing.
export function boostFor(tier, secondsLeft) {
  return secondsLeft > TIERS[tier].seconds * BOOST_FRACTION ? TIERS[tier].boost : 0;
}
