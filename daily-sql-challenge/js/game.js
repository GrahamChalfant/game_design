// SQL: The Sequel. One film a day, three timed SQL questions ("acts"). The faster you answer,
// the more the film earns. This file runs the show: picking the day's film, the curtains and
// countdown, the timer and payouts, saving progress, and the end credits.
import { initEngine, buildDb, runQuery, compare } from './engine.js';

// ---- Tuning ---------------------------------------------------------------------------------
// Each act: seconds allowed and the most it can earn, in millions of dollars.
const ACTS = [
  { num: 'ACT I', name: 'OPENING WEEKEND', short: 'Opening', limit: 30, max: 100, kind: 'Fix the broken query' },
  { num: 'ACT II', name: 'INTERNATIONAL RELEASE', short: 'Intl', limit: 90, max: 300, kind: 'One table, one query' },
  { num: 'ACT III', name: 'STREAMING RIGHTS', short: 'Streaming', limit: 180, max: 600, kind: 'One join or one window function' },
];
const GRACE = 0.1;      // answer within this share of the time limit and you still earn the maximum
const FLOOR = 0.2;      // a correct answer at the last second still earns this share of the maximum
const TOTAL_MAX = ACTS.reduce((s, a) => s + a.max, 0);
const EPOCH = [2026, 10, 13]; // Screening #1 is 13 November 2026 (months count from 0)
const CURTAIN_MS = 900;
const STORE_KEY = 'sqlsequel.v1';

// Lines that appear under the box office gauge as the total passes each amount (in millions).
const MILESTONES = [
  { at: 50, note: 'that covers the catering bill.' },
  { at: 150, note: 'the studio stops panicking.' },
  { at: 250, note: 'broke even. the accountants exhale.' },
  { at: 400, note: 'the sequel is greenlit.' },
  { at: 600, note: 'action figures hit the shelves.' },
  { at: 800, note: 'a theme park ride is approved.' },
  { at: 1000, note: 'welcome to the billion dollar club.' },
];

// Final verdicts, by total box office in millions. The last one whose `min` you reach wins.
const TIERS = [
  { min: 0, name: 'SHELVED', line: 'The studio would like a word.' },
  { min: 1, name: 'STRAIGHT TO DVD', line: 'Coming soon to a bargain bin near you.' },
  { min: 100, name: 'CULT CLASSIC', line: 'Seven people love it. Fiercely.' },
  { min: 250, name: 'SLEEPER HIT', line: 'Word of mouth did the heavy lifting.' },
  { min: 450, name: 'CERTIFIED BLOCKBUSTER', line: 'Lines around the block.' },
  { min: 650, name: 'RECORD BREAKER', line: 'The trades are calling it a phenomenon.' },
  { min: 900, name: 'ONE IN A BILLION', line: 'Critics wept. Accountants wept harder.' },
];

// ---- Small helpers --------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function money(m) {
  if (!m) return '$0';
  if (m >= 1000) return `$${(m / 1000).toFixed(2)}B`;
  return `$${Number(m.toFixed(1))}M`;
}

function payout(actIndex, elapsed) {
  const { limit, max } = ACTS[actIndex];
  const frac = Math.min(1, Math.max(0, (limit - elapsed) / (limit * (1 - GRACE))));
  return Math.round(max * (FLOOR + (1 - FLOOR) * frac) * 10) / 10;
}

function todayNumber() {
  const n = new Date();
  return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(...EPOCH)) / 864e5) + 1;
}

// ---- Saved progress -------------------------------------------------------------------------
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.days) return s;
  } catch { /* fall through to a fresh store */ }
  return { days: {}, muted: false };
}
const store = loadStore();
function save() {
  if (practice) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private mode: play on unsaved */ }
}

// ?day=7 plays that screening as practice: nothing is saved and it can be replayed.
const params = new URLSearchParams(location.search);
const practice = params.has('day');
const day = practice ? (parseInt(params.get('day'), 10) || 1) : todayNumber();
// state: { acts: [{ solved, secs, earned, how }], current: { act, startedAt } | null, done }
const state = practice ? { acts: [] } : (store.days[day] ||= { acts: [] });

let film = null;
let db = null;
let want = null;     // expected result of the current act
let actIndex = 0;
let ticker = null;

const total = () => state.acts.reduce((s, a) => s + a.earned, 0);

// ---- Sound ----------------------------------------------------------------------------------
let audio = null;
function beep(freq, ms, type = 'square', vol = 0.05, delay = 0) {
  if (store.muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
  } catch { /* no sound available */ }
}
const sfx = {
  tick: () => beep(440, 120),
  go: () => beep(880, 260),
  cash: () => { beep(660, 90); beep(990, 90, 'square', 0.05, 0.09); beep(1320, 220, 'square', 0.05, 0.18); },
  bomb: () => beep(120, 450, 'sawtooth', 0.06),
};

function paintMute() { $('mute').textContent = store.muted ? 'SOUND OFF' : 'SOUND ON'; }
$('mute').addEventListener('click', () => {
  store.muted = !store.muted;
  paintMute();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
});

// ---- Stage: curtains, views, the card in front of the curtains --------------------------------
const stage = $('stage');
const VIEWS = ['leader', 'question', 'wrap', 'finale'];
function show(view) {
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
}
const openCurtains = () => stage.classList.add('open');
const closeCurtains = () => stage.classList.remove('open');

function front(html) {
  const el = $('front');
  if (html === null) { el.hidden = true; stage.style.minHeight = ''; return; }
  el.innerHTML = html;
  el.hidden = false;
  // The card floats over the curtains, so make sure the stage is tall enough to hold it (phones).
  stage.style.minHeight = `${el.offsetHeight + 96}px`;
}

function paintHud() {
  const d = new Date();
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  $('hud-day').textContent = practice ? `PRACTICE · SCREENING #${day}` : `SCREENING #${day} · ${label}`;
  const t = total();
  $('hud-gross').textContent = t ? money(t) : '$0';
  $('gauge-fill').style.width = `${Math.min(100, (t / TOTAL_MAX) * 100)}%`;
  const passed = MILESTONES.filter((m) => t >= m.at).pop();
  $('gauge-note').textContent = passed ? `${money(passed.at)} · ${passed.note}` : 'an empty theater. the popcorn is still warm.';
}

function buildGauge() {
  $('gauge-ticks').innerHTML = MILESTONES
    .map((m) => `<i style="left:${(m.at / TOTAL_MAX) * 100}%"></i>`)
    .join('');
}

// ---- Lobby ------------------------------------------------------------------------------------
function lobbyCard() {
  const stubs = ACTS.map((a) => `
    <li class="stub">
      <b>${a.num}</b>
      <span class="stub-name">${a.name}</span>
      <span>${a.kind}</span>
      <span class="stub-nums">${a.limit}s · up to ${money(a.max)}</span>
    </li>`).join('');
  front(`
    <p class="kicker">NOW SHOWING</p>
    <h2 class="film-title">${esc(film.title)}</h2>
    <p class="blurb">${esc(film.blurb)}</p>
    <ul class="stubs">${stubs}</ul>
    <p class="fine">Three SQL questions, five minutes at most. The faster you answer, the more the film earns.
      Capitals don't matter, and column names in your answer don't either.</p>
    <button id="start" class="btn big" type="button">▶ START THE SHOW</button>`);
  $('start').addEventListener('click', startShow);
}

function intermissionCard(nextAct) {
  front(`
    <p class="kicker">INTERMISSION</p>
    <h2 class="film-title">${esc(film.title)}</h2>
    <p class="blurb">Box office so far: ${money(total())}</p>
    <button id="start" class="btn big" type="button">▶ ${ACTS[nextAct].num}: ${ACTS[nextAct].name}</button>`);
  $('start').addEventListener('click', () => beginAct(nextAct, true));
}

function actCard(i) {
  const a = ACTS[i];
  front(`
    <p class="kicker">${a.num}</p>
    <h2 class="film-title">${a.name}</h2>
    <p class="blurb">${a.kind}</p>
    <p class="fine">${a.limit} seconds · up to ${money(a.max)}</p>`);
}

// ---- The show -----------------------------------------------------------------------------------
async function startShow() {
  front(null);
  show('leader');
  openCurtains();
  await wait(CURTAIN_MS);
  for (const n of [3, 2, 1]) {
    $('leader-num').textContent = n;
    n === 1 ? sfx.go() : sfx.tick();
    await wait(1000);
  }
  beginAct(0, false);
}

// viaCurtain: close the curtains, show the act's title card, then open on the question.
async function beginAct(i, viaCurtain) {
  if (viaCurtain) {
    front(null);
    closeCurtains();
    await wait(stage.classList.contains('open') ? 0 : CURTAIN_MS);
    actCard(i);
    prepareQuestion(i);
    show('question');
    await wait(1800);
    front(null);
    openCurtains();
    await wait(CURTAIN_MS);
  } else {
    prepareQuestion(i);
    show('question');
  }
  startTimer(i, Date.now());
}

function tableHtml(columns, rows) {
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((v) => (v === null
    ? '<td class="null">NULL</td>'
    : `<td>${esc(typeof v === 'number' ? Math.round(v * 100) / 100 : v)}</td>`)).join('')}</tr>`).join('');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function prepareQuestion(i) {
  actIndex = i;
  const act = film.acts[i];
  db?.close();
  db = buildDb(film);
  want = runQuery(db, act.solution);

  $('q-act-num').textContent = ACTS[i].num;
  $('q-act-name').textContent = ACTS[i].name;
  $('q-prompt').textContent = act.prompt;
  $('editor').value = act.starter || '';
  $('feedback').hidden = true;
  $('result').hidden = true;
  resetSkip();
  $('run').disabled = false;

  $('tables').innerHTML = film.tables.map((t) => `
    <div class="tbl">
      <div class="tbl-name"><b>${esc(t.name)}</b><span>${t.rows.length} rows</span></div>
      <div class="grid-wrap">${tableHtml(t.columns.map((c) => c[0]), t.rows)}</div>
    </div>`).join('');
  paintTimer(0);
}

function paintTimer(elapsed) {
  const { limit } = ACTS[actIndex];
  const left = Math.max(0, limit - elapsed);
  const fill = $('timer-fill');
  fill.style.width = `${(left / limit) * 100}%`;
  fill.classList.toggle('low', left / limit < 0.25);
  $('timer-secs').textContent = left >= 60
    ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`
    : `${Math.ceil(left)}s`;
  $('timer-money').textContent = money(payout(actIndex, elapsed));
}

function startTimer(i, startedAt) {
  state.current = { act: i, startedAt };
  save();
  $('editor').focus();
  clearInterval(ticker);
  const tick = () => {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed >= ACTS[i].limit) { finishAct('timeout', ACTS[i].limit); return; }
    paintTimer(elapsed);
  };
  ticker = setInterval(tick, 100);
  tick();
}

const WHY = {
  empty: () => 'Your query ran, but it returned no rows.',
  rows: (g, w) => `Your query returned ${g.rows.length} row${g.rows.length === 1 ? '' : 's'}. The right answer has ${w.rows.length}.`,
  columns: (g, w) => `Your result has ${g.columns.length} column${g.columns.length === 1 ? '' : 's'}. The right answer needs ${w.columns.length}.`,
  order: () => 'Right rows, wrong order.',
  values: () => 'Right shape, but some of the values are off.',
};

function runPlayerQuery() {
  if (!state.current) return;
  const got = runQuery(db, $('editor').value);
  const fb = $('feedback');
  const res = $('result');
  fb.hidden = false;
  if (got.error) {
    fb.className = 'feedback bad';
    fb.textContent = `SQL ERROR · ${got.error}`;
    res.hidden = true;
    return;
  }
  res.innerHTML = tableHtml(got.columns, got.rows);
  res.hidden = false;
  const verdict = compare(want, got, film.acts[actIndex].ordered);
  if (verdict.ok) {
    finishAct('solved', (Date.now() - state.current.startedAt) / 1000);
  } else {
    fb.className = 'feedback bad';
    fb.textContent = `NOT QUITE · ${WHY[verdict.why](got, want)}`;
  }
}

// how: 'solved' | 'timeout' | 'skipped'
function finishAct(how, elapsed) {
  clearInterval(ticker);
  const i = actIndex;
  const solved = how === 'solved';
  const earned = solved ? payout(i, elapsed) : 0;
  state.acts[i] = { solved, how, secs: Math.round(elapsed * 10) / 10, earned };
  state.current = null;
  if (i === ACTS.length - 1) state.done = true;
  save();
  paintHud();
  solved ? sfx.cash() : sfx.bomb();

  const act = film.acts[i];
  $('wrap-kicker').textContent = solved
    ? `CUT! THAT'S A WRAP ON ${ACTS[i].num}`
    : how === 'timeout' ? 'THE REEL RAN OUT' : 'YOU WALKED OUT';
  $('wrap-money').textContent = solved ? `+${money(earned)}` : '$0';
  $('wrap-money').classList.toggle('flop', !solved);
  $('wrap-detail').textContent = solved
    ? `${ACTS[i].name} · solved in ${state.acts[i].secs}s of ${ACTS[i].limit}s`
    : `${ACTS[i].name} · the theater sat empty`;
  $('wrap-solution').textContent = act.solution;
  $('wrap-lesson').textContent = act.lesson || '';
  $('next').textContent = i < ACTS.length - 1
    ? `NEXT · ${ACTS[i + 1].num}: ${ACTS[i + 1].name} ▶`
    : 'ROLL THE CREDITS ▶';
  show('wrap');
  $('next').focus();
}

$('next').addEventListener('click', () => {
  if (actIndex < ACTS.length - 1) beginAct(actIndex + 1, true);
  else showFinale(true);
});

$('run').addEventListener('click', runPlayerQuery);
$('editor').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runPlayerQuery();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const el = e.target;
    const at = el.selectionStart;
    el.value = `${el.value.slice(0, at)}  ${el.value.slice(el.selectionEnd)}`;
    el.selectionStart = el.selectionEnd = at + 2;
  }
});

// Walking out takes two clicks, so a stray one doesn't throw the act away.
let skipArmed = false;
function resetSkip() {
  skipArmed = false;
  $('skip').textContent = 'WALK OUT ($0)';
}
$('skip').addEventListener('click', () => {
  if (!state.current) return;
  if (!skipArmed) {
    skipArmed = true;
    $('skip').textContent = 'SURE? CLICK AGAIN';
    setTimeout(resetSkip, 3000);
    return;
  }
  finishAct('skipped', (Date.now() - state.current.startedAt) / 1000);
});

// ---- End credits --------------------------------------------------------------------------------
function tierFor(t) {
  return TIERS.filter((x) => t >= x.min).pop();
}

function streak() {
  let n = 0;
  for (let d = day; store.days[d]?.done; d--) n++;
  return n;
}

function shareText() {
  const t = total();
  const marks = state.acts.map((a, i) => `${a.solved ? '🟩' : '🟥'} ${ACTS[i].short} ${a.solved ? money(a.earned) : '$0'}`);
  return `SQL: The Sequel #${day} · ${film.title}\n🎬 ${t ? money(t) : '$0'} · ${tierFor(t).name}\n${marks.join('  ')}`;
}

let nextTicker = null;
function showFinale(animate) {
  const t = total();
  const tier = tierFor(t);
  $('fin-film').textContent = `${film.title} · total box office`;
  $('fin-tier').textContent = tier.name;
  $('fin-tier').classList.toggle('top', tier === TIERS[TIERS.length - 1]);
  $('fin-tier-line').textContent = tier.line;
  $('fin-rows').innerHTML = state.acts.map((a, i) => `
    <tr class="${a.solved ? '' : 'flop'}">
      <td>${ACTS[i].num}</td>
      <td>${ACTS[i].name}</td>
      <td>${a.solved ? `${a.secs}s` : a.how === 'skipped' ? 'walked out' : 'out of time'}</td>
      <td class="num">${a.solved ? money(a.earned) : '$0'}</td>
    </tr>`).join('');

  const el = $('fin-total');
  if (animate && t > 0) {
    const began = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - began) / 1400);
      el.textContent = money(t * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = money(t);
    };
    requestAnimationFrame(step);
  } else {
    el.textContent = t ? money(t) : '$0';
  }

  if (practice) {
    $('fin-streak').textContent = 'Practice screening. Nothing was saved.';
    $('fin-next').textContent = '';
  } else {
    const s = streak();
    $('fin-streak').textContent = s > 1 ? `${s} days in a row.` : '';
    clearInterval(nextTicker);
    const paintNext = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const left = Math.max(0, Math.floor((midnight - now) / 1000));
      if (left === 0 && todayNumber() !== day) { location.reload(); return; }
      const h = String(Math.floor(left / 3600)).padStart(2, '0');
      const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
      const sec = String(left % 60).padStart(2, '0');
      $('fin-next').textContent = `Next screening in ${h}:${m}:${sec}`;
    };
    nextTicker = setInterval(paintNext, 1000);
    paintNext();
  }
  show('finale');
}

$('share').addEventListener('click', async () => {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  $('share').textContent = 'COPIED!';
  setTimeout(() => { $('share').textContent = 'COPY RESULTS'; }, 1600);
});

// ---- Boot -------------------------------------------------------------------------------------
async function boot() {
  paintMute();
  buildGauge();
  front('<p class="kicker">THREADING THE PROJECTOR...</p>');
  let films;
  try {
    [films] = await Promise.all([fetch('data/films.json').then((r) => r.json()), initEngine()]);
  } catch (e) {
    front(`<p class="kicker">THE PROJECTOR JAMMED</p><p class="fine">${esc(e.message || e)}<br>
      Run the game through its local server (python serve.py), not by opening the file directly.</p>`);
    return;
  }
  film = films[(((day - 1) % films.length) + films.length) % films.length];
  paintHud();

  if (state.done) {
    // Already played today: straight to the credits, curtains open.
    front(null);
    stage.classList.add('instant', 'open');
    showFinale(false);
    requestAnimationFrame(() => stage.classList.remove('instant'));
  } else if (state.current) {
    // Reloaded mid-question: the clock kept running.
    const { act, startedAt } = state.current;
    front(null);
    prepareQuestion(act);
    show('question');
    stage.classList.add('instant', 'open');
    requestAnimationFrame(() => stage.classList.remove('instant'));
    startTimer(act, startedAt);
  } else if (state.acts.length) {
    intermissionCard(state.acts.length);
  } else {
    lobbyCard();
  }
}

boot();
