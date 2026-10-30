// Which questions are today's, and saving progress in the browser (localStorage).

import { LAUNCH_DATE, TIER_ORDER } from './config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'sql-daily:';

// Today's date in the player's own time zone, as 'YYYY-MM-DD'. Everyone gets a new
// puzzle at their local midnight.
export function todayString(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const isDateString = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !isNaN(Date.parse(s));

// Days since launch. Parsing both dates as UTC avoids daylight-saving surprises.
export function dayIndex(date) {
  return Math.round((Date.parse(date) - Date.parse(LAUNCH_DATE)) / DAY_MS);
}

export const puzzleNumber = (date) => dayIndex(date) + 1;

// Today's feature. Features play in the order they appear in data/features.js, one per day,
// starting from LAUNCH_DATE, then repeat. The same date always gets the same feature.
export function pickFeature(date, features) {
  const day = dayIndex(date);
  return features[((day % features.length) + features.length) % features.length];
}

export function secondsUntilTomorrow(now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, Math.round((midnight - now) / 1000));
}

// ---------------------------------------------------------------- saved progress

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (e.g. private browsing). The game still works; it just won't remember.
  }
}

export function forgetDay(date) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + date);
  } catch {}
}

// A day's progress. If the player already started this day with a different feature
// (because the list changed since), they keep the one they started with.
export function loadDay(date, feature, features) {
  const saved = read(date);
  if (saved?.featureId && features.some((f) => f.id === saved.featureId)) return saved;
  const day = { date, featureId: feature.id, tiers: {} };
  for (const tier of TIER_ORDER) {
    day.tiers[tier] = { status: 'ready', startedAt: null, secondsLeft: null, points: 0, bonus: 0, attempts: 0, hintsShown: 0, sql: '' };
  }
  return day;
}

export const saveDay = (day) => write(day.date, day);

// History of finished days: { 'YYYY-MM-DD': score }.
export const loadHistory = () => read('history') ?? {};

export function recordScore(date, score) {
  const history = loadHistory();
  history[date] = score;
  write('history', history);
}

export function stats(history, today) {
  const dates = Object.keys(history).sort();
  const scores = Object.values(history);
  let streak = 0;
  for (let d = today; history[d] !== undefined; d = shiftDate(d, -1)) streak++;
  return {
    played: dates.length,
    streak,
    best: scores.length ? Math.max(...scores) : 0,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
  };
}

function shiftDate(date, days) {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}
