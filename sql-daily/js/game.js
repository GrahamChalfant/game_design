// The game screen: timers, the editor, running and submitting queries, and the results summary.

import { questions } from '../data/questions.js';
import { TIERS, TIER_ORDER, PERFECT_BONUS, speedBonus } from './config.js';
import { runQuery, checkAnswer, describeSchema } from './checker.js';
import {
  todayString, isDateString, puzzleNumber, pickQuestions, secondsUntilTomorrow,
  loadDay, saveDay, forgetDay, loadHistory, recordScore, stats,
} from './daily.js';

const $ = (id) => document.getElementById(id);
const MAX_SHOWN_ROWS = 100;

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
let viewing = 'easy'; // a tier, or 'summary'

const questionFor = (tier) => questions.find((q) => q.id === day.tiers[tier].id);
const isDone = (t) => t.status === 'solved' || t.status === 'failed';
const allDone = () => TIER_ORDER.every((tier) => isDone(day.tiers[tier]));

function isLocked(tier) {
  const index = TIER_ORDER.indexOf(tier);
  return index > 0 && !isDone(day.tiers[TIER_ORDER[index - 1]]);
}

function secondsLeft(tier) {
  const t = day.tiers[tier];
  if (t.status !== 'active') return t.secondsLeft ?? TIERS[tier].seconds;
  return Math.max(0, TIERS[tier].seconds - (Date.now() - t.startedAt) / 1000);
}

function totalScore() {
  const base = TIER_ORDER.reduce((sum, tier) => sum + day.tiers[tier].points + day.tiers[tier].bonus, 0);
  const perfect = TIER_ORDER.every((tier) => day.tiers[tier].status === 'solved');
  return base + (perfect ? PERFECT_BONUS : 0);
}

const formatTime = (seconds) => {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

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

  day = loadDay(date, pickQuestions(date, questions), questions);
  saveDay(day);
  $('puzzle-label').textContent = `#${puzzleNumber(date)} · ${formatDate(date)}`;
  $('loading').hidden = true;

  const active = TIER_ORDER.find((tier) => day.tiers[tier].status === 'active');
  viewing = active ?? (allDone() ? 'summary' : TIER_ORDER.find((tier) => !isDone(day.tiers[tier])));

  wireUpControls();
  render();
  setInterval(tick, 250);
}

function wireUpControls() {
  $('start-btn').addEventListener('click', startQuestion);
  $('run-btn').addEventListener('click', run);
  $('submit-btn').addEventListener('click', submit);
  $('hint-btn').addEventListener('click', showHint);
  $('giveup-btn').addEventListener('click', giveUp);
  $('next-btn').addEventListener('click', () => {
    const next = TIER_ORDER.find((tier) => !isDone(day.tiers[tier]));
    show(next ?? 'summary');
  });
  $('share-btn').addEventListener('click', share);

  const editor = $('editor');
  editor.addEventListener('input', () => {
    if (day.tiers[viewing]?.status !== 'active') return;
    day.tiers[viewing].sql = editor.value;
    saveDay(day);
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.shiftKey ? submit() : run();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
    }
  });
}

// ---------------------------------------------------------------- actions

function startQuestion() {
  const t = day.tiers[viewing];
  t.status = 'active';
  t.startedAt = Date.now();
  saveDay(day);
  render();
  $('editor').focus();
}

function run() {
  const t = day.tiers[viewing];
  if (t.status !== 'active') return;
  const result = runQuery(SQL, questionFor(viewing).dataset, $('editor').value);
  if (result.ok) {
    showFeedback(null);
    showResults(result, 'Your output');
  } else {
    showError(result);
    showResults(null);
  }
}

function submit() {
  const tier = viewing;
  const t = day.tiers[tier];
  if (t.status !== 'active') return;
  const remaining = secondsLeft(tier);
  const check = checkAnswer(SQL, questionFor(tier), $('editor').value);
  t.attempts++;
  t.sql = $('editor').value;

  if (check.status === 'error') {
    saveDay(day);
    showError(check);
    showResults(null);
    return;
  }
  if (check.status === 'wrong') {
    saveDay(day);
    showFeedback('wrong', 'Not quite.', [check.message], check.details);
    showResults(check.result, 'Your output');
    return;
  }
  t.points = TIERS[tier].points;
  t.bonus = speedBonus(tier, remaining);
  finish(tier, 'solved', remaining);
  showResults(check.result, 'Your output');
}

function showHint() {
  const t = day.tiers[viewing];
  const hints = questionFor(viewing).hints;
  if (t.hintsShown < hints.length) t.hintsShown++;
  saveDay(day);
  renderHints();
}

function giveUp() {
  if (!confirm('Give up on this question? You\'ll see the solution and score 0 for it.')) return;
  finish(viewing, 'failed', secondsLeft(viewing), 'gave-up');
}

function finish(tier, status, remaining, reason) {
  const t = day.tiers[tier];
  t.status = status;
  t.secondsLeft = remaining;
  t.reason = reason;
  if (allDone()) recordScore(date, totalScore());
  saveDay(day);
  render();
}

function tick() {
  for (const tier of TIER_ORDER) {
    if (day.tiers[tier].status === 'active' && secondsLeft(tier) <= 0) {
      viewing = tier;
      finish(tier, 'failed', 0, 'timeout');
    }
  }
  if (TIERS[viewing]) renderTimer();
  if (viewing === 'summary') $('countdown').textContent = formatClock(secondsUntilTomorrow());
}

function show(view) {
  viewing = view;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------- rendering

function render() {
  renderSteps();
  $('total-score').textContent = totalScore();

  const isTier = Boolean(TIERS[viewing]);
  const t = isTier ? day.tiers[viewing] : null;
  $('summary').hidden = viewing !== 'summary';
  $('locked-card').hidden = !(isTier && isLocked(viewing));
  $('start-card').hidden = !(isTier && !isLocked(viewing) && t.status === 'ready');
  $('question').hidden = !(isTier && (t.status === 'active' || isDone(t)));

  if (viewing === 'summary') return renderSummary();
  if (isLocked(viewing)) {
    const previous = TIERS[TIER_ORDER[TIER_ORDER.indexOf(viewing) - 1]].label.toLowerCase();
    $('locked-text').textContent = `Finish the ${previous} question first.`;
    return;
  }
  if (t.status === 'ready') return renderStartCard();
  renderQuestion();
}

function renderSteps() {
  const nav = $('steps');
  nav.innerHTML = '';
  const steps = [...TIER_ORDER];
  if (allDone()) steps.push('summary');
  for (const step of steps) {
    const button = document.createElement('button');
    button.className = 'step';
    if (step === viewing) button.classList.add('current');
    let name;
    let status;
    if (step === 'summary') {
      name = 'Results';
      status = `${totalScore()} / 1000`;
    } else {
      const t = day.tiers[step];
      name = `${TIERS[step].label} · ${TIERS[step].points}`;
      button.classList.add(t.status);
      if (t.status === 'solved') status = `✓ +${t.points + t.bonus}`;
      else if (t.status === 'failed') status = t.reason === 'timeout' ? '✗ Out of time' : '✗ Gave up';
      else if (t.status === 'active') status = '● In progress';
      else status = isLocked(step) ? 'Locked' : 'Ready';
      button.disabled = isLocked(step);
    }
    button.innerHTML = `<span class="step-name">${name}</span><span class="step-status">${status}</span>`;
    button.addEventListener('click', () => show(step));
    nav.append(button);
  }
}

function renderStartCard() {
  const { label, points, maxSpeedBonus, seconds } = TIERS[viewing];
  $('start-tier').textContent = label;
  $('start-tier').className = `badge ${viewing}`;
  $('start-title').textContent = `Question ${TIER_ORDER.indexOf(viewing) + 1}: ${points} points`;
  $('start-details').textContent =
    `You'll have ${formatTime(seconds)} on the clock. Answer fast for up to +${maxSpeedBonus} bonus points. ` +
    'The question appears when you start the timer.';
}

function renderQuestion() {
  const q = questionFor(viewing);
  const t = day.tiers[viewing];
  const active = t.status === 'active';

  $('q-tier').textContent = `${TIERS[viewing].label} · ${TIERS[viewing].points} pts`;
  $('q-tier').className = `badge ${viewing}`;
  $('q-title').textContent = q.title;
  $('q-prompt').textContent = q.prompt;
  $('q-columns').innerHTML = q.columns.map((c) => `<code>${escapeHtml(c)}</code>`).join(' ');
  renderSchema(q.dataset);

  const editor = $('editor');
  editor.value = t.sql;
  editor.readOnly = !active;
  for (const id of ['run-btn', 'submit-btn', 'hint-btn', 'giveup-btn']) $(id).disabled = !active;
  renderHints();
  renderTimer();

  $('solution').hidden = active;
  $('next-row').hidden = active;
  showResults(null);
  if (active) {
    showFeedback(null);
    return;
  }
  $('solution-sql').textContent = dedent(q.solution);
  $('next-btn').textContent = allDone() ? 'See your results' : 'Next question →';
  if (t.status === 'solved') {
    showFeedback('correct', `Correct! +${t.points} points, +${t.bonus} speed bonus.`, [
      `Solved with ${formatTime(t.secondsLeft)} left, in ${t.attempts} ${t.attempts === 1 ? 'try' : 'tries'}.`,
      'Here\'s one way to write it. Yours may be different, and that\'s fine.',
    ]);
  } else {
    showFeedback(
      'error',
      t.reason === 'timeout' ? 'Time\'s up!' : 'You gave up on this one.',
      ['No points for this question. Study the solution below and you\'ll get the next one.'],
    );
  }
}

function renderTimer() {
  const tier = viewing;
  const t = day.tiers[tier];
  if (!t) return;
  const left = secondsLeft(tier);
  $('timer-text').textContent = formatTime(left);
  $('timer-fill').style.width = `${(left / TIERS[tier].seconds) * 100}%`;
  $('timer').classList.toggle('low', t.status === 'active' && left <= 30);
  $('bonus-text').textContent =
    t.status === 'active' ? `speed bonus +${speedBonus(tier, left)}` : t.status === 'solved' ? 'finished' : '';
}

function renderHints() {
  const t = day.tiers[viewing];
  const hints = questionFor(viewing).hints;
  $('hints').innerHTML = hints.slice(0, t.hintsShown).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  $('hint-btn').textContent = t.hintsShown < hints.length ? `Hint (${hints.length - t.hintsShown} left)` : 'No more hints';
  if (t.hintsShown >= hints.length) $('hint-btn').disabled = true;
}

let schemaShown = null;
function renderSchema(dataset) {
  if (schemaShown === dataset) return;
  schemaShown = dataset;
  const schema = describeSchema(SQL, dataset);
  const container = $('schema');
  container.innerHTML = '';
  for (const [table, columns] of Object.entries(schema)) {
    const card = document.createElement('div');
    card.className = 'table-card';
    card.innerHTML =
      `<button class="table-name">${escapeHtml(table)}</button>` +
      `<ul class="table-cols">${columns.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`;
    card.querySelector('button').addEventListener('click', () => {
      const preview = runQuery(SQL, dataset, `SELECT * FROM ${table} LIMIT 5`);
      showResults(preview, `Preview: first 5 rows of ${table}`);
    });
    container.append(card);
  }
}

// kind: 'error' | 'wrong' | 'correct' | 'info', or null to hide.
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
  if (count > MAX_SHOWN_ROWS || result.truncated) note = `showing the first ${rows.length} rows`;
  box.innerHTML =
    `<div class="results-caption">${escapeHtml(caption)} (${note})</div>` +
    '<table class="data"><thead><tr>' +
    result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows
      .map(
        (row) =>
          '<tr>' +
          row
            .map((v) =>
              v === null
                ? '<td class="null">NULL</td>'
                : `<td${typeof v === 'number' ? ' class="num"' : ''}>${escapeHtml(String(v))}</td>`,
            )
            .join('') +
          '</tr>',
      )
      .join('') +
    '</tbody></table>';
}

// ---------------------------------------------------------------- summary

function renderSummary() {
  const perfect = TIER_ORDER.every((tier) => day.tiers[tier].status === 'solved');
  $('final-score').textContent = totalScore();

  let rows = '<tr><th>Question</th><th>Points</th><th>Speed</th><th>Time left</th></tr>';
  for (const tier of TIER_ORDER) {
    const t = day.tiers[tier];
    const solved = t.status === 'solved';
    rows +=
      `<tr><td>${solved ? '✅' : '❌'} ${TIERS[tier].label}: ${escapeHtml(questionFor(tier).title)}</td>` +
      `<td>${t.points}</td><td>+${t.bonus}</td><td>${solved ? formatTime(t.secondsLeft) : '–'}</td></tr>`;
  }
  rows += `<tr><td>${perfect ? '🏆' : '·'} All three correct</td><td>${perfect ? `+${PERFECT_BONUS}` : '0'}</td><td></td><td></td></tr>`;
  rows += `<tr><th>Total</th><th>${totalScore()}</th><th></th><th></th></tr>`;
  $('breakdown').innerHTML = rows;
  $('share-preview').textContent = shareText();

  const s = stats(loadHistory(), date);
  $('stats').innerHTML = [
    ['Played', s.played],
    ['Streak', s.streak],
    ['Best', s.best],
    ['Average', s.average],
  ]
    .map(([label, value]) => `<div><strong>${value}</strong><span class="muted">${label}</span></div>`)
    .join('');
  $('countdown').textContent = formatClock(secondsUntilTomorrow());
}

function shareText() {
  const lines = [`SQL Daily #${puzzleNumber(date)}: ${totalScore()}/1000`];
  for (const tier of TIER_ORDER) {
    const t = day.tiers[tier];
    const label = TIERS[tier].label.padEnd(6);
    lines.push(
      t.status === 'solved'
        ? `🟩 ${label} +${t.points + t.bonus}  ⏱ ${formatTime(TIERS[tier].seconds - t.secondsLeft)}`
        : `🟥 ${label} ${t.reason === 'timeout' ? 'out of time' : 'gave up'}`,
    );
  }
  return lines.join('\n');
}

async function share() {
  try {
    await navigator.clipboard.writeText(shareText());
    $('share-btn').textContent = 'Copied!';
  } catch {
    $('share-btn').textContent = 'Couldn\'t copy. Select the text below instead.';
  }
  setTimeout(() => ($('share-btn').textContent = 'Copy results to share'), 2000);
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

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

start();
