// The game screen. A day goes: start screen → (3-2-1 countdown → question → reveal) × 3 → end credits.

import { features, questions } from '../data/features.js';
import { TIERS, TIER_ORDER, PERFECT_BONUS, COUNTDOWN_SECONDS, BOOST_FRACTION, boostFor } from './config.js';
import { runQuery, checkAnswer, describeSchema } from './checker.js';
import { highlightSql, attachHighlighter } from './highlight.js';
import {
  todayString, isDateString, puzzleNumber, pickFeature, secondsUntilTomorrow,
  loadDay, saveDay, forgetDay, loadHistory, recordScore, stats,
} from './daily.js';

const $ = (id) => document.getElementById(id);
const MAX_SHOWN_ROWS = 100;
const VIEWS = ['loading', 'view-start', 'view-countdown', 'view-question', 'view-reveal', 'view-credits'];

// ?date=2026-11-05 plays another day (handy for testing). ?reset clears that day's progress.
const params = new URLSearchParams(location.search);
const date = isDateString(params.get('date')) ? params.get('date') : todayString();
if (params.has('reset')) {
  forgetDay(date);
  params.delete('reset'); // so refreshing the page doesn't wipe progress again
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}

let SQL;
let day;
let feature;
let shownView = null; // which view is on screen, so the tick only redraws when it changes
let redrawColors = () => {}; // repaints the editor's color-coding after its text is set from code

const questionFor = (tier) => questions.find((q) => q.id === `${day.featureId}/${tier}`);
const isDone = (t) => t.status === 'solved' || t.status === 'failed';
const allDone = () => TIER_ORDER.every((tier) => isDone(day.tiers[tier]));
const nextTier = () => TIER_ORDER.find((tier) => !isDone(day.tiers[tier]));
const activeTier = () => TIER_ORDER.find((tier) => day.tiers[tier].status === 'active');
const counting = (tier) => Date.now() < day.tiers[tier].startedAt;

// Days before LAUNCH_DATE have no puzzle number yet, so they're labelled as a preview.
const puzzleLabel = () => (puzzleNumber(date) >= 1 ? `#${puzzleNumber(date)}` : 'Preview');

// startedAt is when the clock starts: COUNTDOWN_SECONDS after the player clicked.
// Storing it that way means a refresh mid-countdown or mid-question picks up exactly where it was.
function secondsLeft(tier) {
  const t = day.tiers[tier];
  if (t.status !== 'active') return t.secondsLeft ?? TIERS[tier].seconds;
  const elapsed = Math.max(0, (Date.now() - t.startedAt) / 1000);
  return Math.max(0, TIERS[tier].seconds - elapsed);
}

function totalScore() {
  const base = TIER_ORDER.reduce((sum, tier) => sum + day.tiers[tier].points + day.tiers[tier].bonus, 0);
  return base + (TIER_ORDER.every((tier) => day.tiers[tier].status === 'solved') ? PERFECT_BONUS : 0);
}

// Which view belongs on screen right now. Everything else is drawn from this.
function currentView() {
  const active = activeTier();
  if (active) return counting(active) ? `countdown:${active}` : `question:${active}`;
  if (allDone() && day.creditsRolled) return 'credits';
  const lastDone = [...TIER_ORDER].reverse().find((tier) => isDone(day.tiers[tier]));
  return lastDone ? `reveal:${lastDone}` : 'start';
}

// ---------------------------------------------------------------- start up

async function start() {
  if (location.protocol === 'file:') return; // index.html already shows how to fix this
  try {
    SQL = await initSqlJs({ locateFile: (file) => `vendor/${file}` });
  } catch (err) {
    $('loading').innerHTML =
      `<b>The SQL engine couldn't load.</b><br>${escapeHtml(err.message)}<br>` +
      'Check that the <code>vendor/</code> folder (sql-wasm.js and sql-wasm.wasm) is next to index.html.';
    return;
  }

  day = loadDay(date, pickFeature(date, features), features);
  feature = features.find((f) => f.id === day.featureId);
  saveDay(day);
  $('puzzle-label').textContent = `${puzzleLabel()} · ${formatDate(date)}`;

  wireUpControls();
  tick();
  setInterval(tick, 100);
}

function wireUpControls() {
  $('begin-btn').addEventListener('click', rollNext);
  $('next-btn').addEventListener('click', rollNext);
  $('run-btn').addEventListener('click', run);
  $('submit-btn').addEventListener('click', submit);
  $('hint-btn').addEventListener('click', showHint);
  $('giveup-btn').addEventListener('click', giveUp);
  $('share-btn').addEventListener('click', share);
  $('help-btn').addEventListener('click', () => $('help').showModal());

  const editor = $('editor');
  redrawColors = attachHighlighter(editor, $('editor-colors'));
  editor.addEventListener('input', () => {
    const tier = activeTier();
    if (!tier) return;
    day.tiers[tier].sql = editor.value;
    saveDay(day);
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.shiftKey ? submit() : run();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
      editor.dispatchEvent(new Event('input')); // setRangeText doesn't fire one, so save and recolor
    }
  });
}

// ---------------------------------------------------------------- actions

// The one button on every between-screen: start the next part (after a countdown), or roll the credits.
function rollNext() {
  const tier = nextTier();
  if (!tier) {
    day.creditsRolled = true;
  } else {
    day.tiers[tier].status = 'active';
    day.tiers[tier].startedAt = Date.now() + COUNTDOWN_SECONDS * 1000;
  }
  saveDay(day);
  tick();
}

function run() {
  const tier = activeTier();
  if (!tier || counting(tier)) return;
  const result = runQuery(SQL, questionFor(tier).dataset, $('editor').value);
  if (result.ok) {
    showFeedback(null);
    showResults(result, 'Your output');
  } else {
    showError(result);
    showResults(null);
  }
}

function submit() {
  const tier = activeTier();
  if (!tier || counting(tier)) return;
  const t = day.tiers[tier];
  const remaining = secondsLeft(tier);
  const check = checkAnswer(SQL, questionFor(tier), $('editor').value);
  t.attempts++;
  t.sql = $('editor').value;

  if (check.status === 'correct') {
    t.points = TIERS[tier].points;
    t.bonus = boostFor(tier, remaining);
    finish(tier, 'solved', remaining);
    return;
  }
  saveDay(day);
  if (check.status === 'error') {
    showError(check);
    showResults(null);
  } else {
    showFeedback('wrong', 'Not quite.', [check.message], check.details);
    showResults(check.result, 'Your output');
  }
}

function showHint() {
  const tier = activeTier();
  if (!tier) return;
  const t = day.tiers[tier];
  if (t.hintsShown < questionFor(tier).hints.length) t.hintsShown++;
  saveDay(day);
  renderHints(tier);
}

function giveUp() {
  const tier = activeTier();
  if (!tier || !confirm('Give up on this part? You\'ll see the solution and score 0 for it.')) return;
  finish(tier, 'failed', secondsLeft(tier), 'gave-up');
}

function finish(tier, status, remaining, reason) {
  const t = day.tiers[tier];
  t.status = status;
  t.secondsLeft = remaining;
  t.reason = reason;
  if (allDone()) recordScore(date, totalScore());
  saveDay(day);
  tick();
}

// ---------------------------------------------------------------- the loop

function tick() {
  const active = activeTier();
  if (active && !counting(active) && secondsLeft(active) <= 0) {
    finish(active, 'failed', 0, 'timeout');
    return;
  }

  const view = currentView();
  if (view !== shownView) {
    shownView = view;
    render(view);
  }
  const [name, tier] = view.split(':');
  if (name === 'countdown') renderCountdown(tier);
  if (name === 'question') renderTimer(tier);
  if (name === 'credits') $('countdown').textContent = formatClock(secondsUntilTomorrow());
}

// ---------------------------------------------------------------- rendering

function render(view) {
  const [name, tier] = view.split(':');
  for (const id of VIEWS) $(id).hidden = id !== `view-${name}`;
  $('console').hidden = name !== 'question';
  renderHud(name === 'question' || name === 'countdown' ? tier : null);

  if (name === 'start') renderStart();
  if (name === 'countdown') $('countdown-label').textContent = `${TIERS[tier].part} · ${TIERS[tier].label}`;
  if (name === 'question') renderQuestion(tier);
  if (name === 'reveal') renderReveal(tier);
  if (name === 'credits') renderCredits();
}

// Krillion-style: three small squares and "Part 1 of 3". Nothing to click.
function renderHud(currentTier) {
  $('total-score').textContent = totalScore();
  $('dots').innerHTML = TIER_ORDER.map((tier) => {
    const t = day.tiers[tier];
    return `<span class="dot ${isDone(t) ? t.status : tier === currentTier ? 'current' : ''}"></span>`;
  }).join('');
  const number = currentTier ? TIER_ORDER.indexOf(currentTier) + 1 : null;
  $('progress-text').textContent = number ? `Part ${number} of 3` : allDone() ? 'That\'s a wrap' : '';
}

function renderStart() {
  $('start-theme').textContent = feature.theme;
  $('start-tagline').textContent = feature.tagline;
  $('begin-btn').focus();
}

// Film-leader style: a big number with a hand sweeping round once per second.
function renderCountdown(tier) {
  const secondsToGo = (day.tiers[tier].startedAt - Date.now()) / 1000;
  $('countdown-num').textContent = Math.max(1, Math.ceil(secondsToGo));
  const sweep = 360 * (1 - (secondsToGo % 1));
  document.querySelector('.leader-sweep').style.setProperty('--sweep', `${sweep}deg`);
}

function renderQuestion(tier) {
  const q = questionFor(tier);
  const t = day.tiers[tier];
  $('q-eyebrow').textContent = `${TIERS[tier].part} · ${TIERS[tier].label} · ${TIERS[tier].points} pts`;
  $('q-title').textContent = q.title;
  $('q-prompt').textContent = q.prompt;
  $('q-columns').innerHTML = q.columns.map((c) => `<code>${escapeHtml(c)}</code>`).join(' ');
  renderSchema(q.dataset);
  renderHints(tier);
  showFeedback(null);
  showResults(null);

  // Mark where the boost runs out on the ring. The ring is drawn from 3 o'clock and the whole
  // SVG is turned -90°, so this tick (drawn at 12 o'clock) needs an extra quarter turn.
  $('boost-tick').setAttribute('transform', `rotate(${90 + 360 * BOOST_FRACTION} 32 32)`);

  const editor = $('editor');
  editor.value = t.sql;
  redrawColors();
  editor.focus();
  renderTimer(tier);
}

function renderTimer(tier) {
  const total = TIERS[tier].seconds;
  const left = secondsLeft(tier);
  const boost = boostFor(tier, left);
  const circumference = 2 * Math.PI * 28;
  const ring = $('ring-fill');
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = circumference * (1 - left / total);
  $('timer-text').textContent = left > 60 ? formatTime(left) : Math.ceil(left);

  const timer = document.querySelector('.timer');
  timer.classList.toggle('boosting', boost > 0);
  timer.classList.toggle('low', left <= 10);
  const boostText = $('boost-text');
  boostText.classList.toggle('on', boost > 0);
  boostText.textContent = boost > 0
    ? `Boost +${boost} · ${formatTime(left - total * BOOST_FRACTION)} left`
    : 'Boost gone · keep going';
}

function renderHints(tier) {
  const t = day.tiers[tier];
  const hints = questionFor(tier).hints;
  $('hints').innerHTML = hints.slice(0, t.hintsShown).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  $('hint-btn').textContent = t.hintsShown < hints.length ? `Hint (${hints.length - t.hintsShown})` : 'No more hints';
  $('hint-btn').disabled = t.hintsShown >= hints.length;
}

let schemaShown = null;
function renderSchema(dataset) {
  if (schemaShown === dataset) return;
  schemaShown = dataset;
  const container = $('schema');
  container.innerHTML = '';
  for (const [table, columns] of Object.entries(describeSchema(SQL, dataset))) {
    const chip = document.createElement('button');
    chip.className = 'table-chip';
    chip.title = `Preview ${table} on the screen`;
    chip.innerHTML = `<b>${escapeHtml(table)}</b>(${columns.map(escapeHtml).join(', ')})`;
    chip.addEventListener('click', () => {
      showResults(runQuery(SQL, dataset, `SELECT * FROM ${table} LIMIT 5`), `Preview: ${table}, first 5 rows`);
    });
    container.append(chip);
  }
}

function renderReveal(tier) {
  const t = day.tiers[tier];
  const q = questionFor(tier);
  const next = nextTier();
  $('reveal-eyebrow').textContent = `${TIERS[tier].part} · ${q.title}`;
  if (t.status === 'solved') {
    $('reveal-title').textContent = 'Correct!';
    $('reveal-points').innerHTML =
      `<span class="good">+${t.points}</span>` +
      (t.bonus ? ` <span class="boost">+${t.bonus} boost</span>` : '') +
      ` <span class="muted">· ${formatTime(TIERS[tier].seconds - t.secondsLeft)}</span>`;
  } else {
    $('reveal-title').textContent = t.reason === 'timeout' ? 'Time\'s up!' : 'Cut!';
    $('reveal-points').innerHTML = '<span class="bad">+0</span>';
  }
  $('solution-sql').innerHTML = highlightSql(dedent(q.solution));
  $('next-btn').textContent = next ? `Roll ${TIERS[next].part}` : 'Roll the credits';
  $('next-btn').focus();
}

function renderCredits() {
  const perfect = TIER_ORDER.every((tier) => day.tiers[tier].status === 'solved');
  $('credits-theme').textContent = feature.theme;
  $('final-score').textContent = totalScore();
  const line = (name, value, cls = '') =>
    `<li class="${cls}"><span class="name">${name}</span><span class="leader-dots"></span><span>${value}</span></li>`;
  $('credits').innerHTML =
    TIER_ORDER.map((tier) => {
      const t = day.tiers[tier];
      const mark = t.status === 'solved' ? '✓' : '✗';
      return line(`${mark} ${TIERS[tier].part}: ${escapeHtml(questionFor(tier).title)}`, t.points + t.bonus);
    }).join('') +
    line(`${perfect ? '★' : '·'} All three correct`, perfect ? PERFECT_BONUS : 0) +
    line('Total', totalScore(), 'total');
  $('share-preview').textContent = shareText();

  const s = stats(loadHistory(), date);
  $('stats').innerHTML = [['Played', s.played], ['Streak', s.streak], ['Best', s.best], ['Average', s.average]]
    .map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`)
    .join('');
  $('countdown').textContent = formatClock(secondsUntilTomorrow());
  $('view-credits').classList.add('roll-in');
}

// kind: 'error' | 'wrong' | 'info', or null to hide.
function showFeedback(kind, title, paragraphs = [], bullets = [], raw = null) {
  const box = $('feedback');
  if (!kind) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.className = `feedback ${kind}`;
  box.innerHTML =
    `<h4>${escapeHtml(title)}</h4>` +
    (raw ? `<p class="raw">${escapeHtml(raw)}</p>` : '') +
    paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
    (bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '');
}

function showError({ error, tip }) {
  showFeedback('error', 'Your query has an error.', tip ? [tip] : [], [], `SQLite says: ${error}`);
}

function showResults(result, caption = '') {
  const box = $('results');
  if (!result) {
    box.innerHTML = '';
    return;
  }
  const rows = result.rows.slice(0, MAX_SHOWN_ROWS);
  const count = result.rows.length;
  let note = `${count} row${count === 1 ? '' : 's'}`;
  if (count > MAX_SHOWN_ROWS || result.truncated) note = `first ${rows.length} rows`;
  const cell = (v) =>
    v === null ? '<td class="null">NULL</td>' : `<td${typeof v === 'number' ? ' class="num"' : ''}>${escapeHtml(String(v))}</td>`;
  box.innerHTML =
    `<div class="results-caption">${escapeHtml(caption)} · ${note}</div>` +
    '<table class="data"><thead><tr>' +
    result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('') +
    '</tbody></table>';
}

// ---------------------------------------------------------------- sharing

// 🟨 solved with the boost, 🟩 solved, 🟥 missed.
function shareText() {
  const squares = TIER_ORDER.map((tier) => {
    const t = day.tiers[tier];
    return t.status !== 'solved' ? '🟥' : t.bonus ? '🟨' : '🟩';
  }).join('');
  return [`🎬 SQL: The Sequel ${puzzleLabel()}`, feature.theme, `${squares} ${totalScore()}/1000`].join('\n');
}

async function share() {
  try {
    await navigator.clipboard.writeText(shareText());
    $('share-btn').textContent = 'Copied!';
  } catch {
    $('share-btn').textContent = 'Select the text below to copy';
  }
  setTimeout(() => ($('share-btn').textContent = 'Copy results'), 2000);
}

// ---------------------------------------------------------------- helpers

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function dedent(sql) {
  const lines = sql.replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

start();
