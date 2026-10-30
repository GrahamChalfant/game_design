// Runs queries and decides whether an answer is right. Shared by the game (in the browser)
// and the question-bank validator (in Node), so both always agree.
//
// Every function takes `SQL`, the sql.js library object returned by initSqlJs().

import { datasets, columnNotes } from '../data/datasets.js';

const MAX_ROWS = 1000;
const CHECK_WHERE_VALUES = 'Check the values in your WHERE clause. Text has to match exactly, including capitals and spelling.';

// A fresh database for every query, so nothing a player runs can change the data.
export function openDatabase(SQL, datasetName) {
  const setup = datasets[datasetName];
  if (setup === undefined) throw new Error(`Unknown dataset "${datasetName}"`);
  const db = new SQL.Database();
  db.run(setup);
  return db;
}

// Table name -> list of column names.
export function describeSchema(SQL, datasetName) {
  const db = openDatabase(SQL, datasetName);
  try {
    return schemaOf(db);
  } finally {
    db.close();
  }
}

// Everything the table diagram needs: each table's columns (with type, primary key and note)
// and the foreign keys that join the tables together.
//   [{ name, columns: [{ name, type, pk, note, references: 'films.id' | null }] }]
export function describeTables(SQL, datasetName) {
  const db = openDatabase(SQL, datasetName);
  const notes = columnNotes[datasetName] ?? {};
  try {
    return Object.keys(schemaOf(db)).map((table) => {
      const fks = db.exec(`PRAGMA foreign_key_list(${table})`)[0]?.values ?? [];
      const references = Object.fromEntries(fks.map((fk) => [fk[3], `${fk[2]}.${fk[4]}`]));
      const columns = db.exec(`PRAGMA table_info(${table})`)[0].values.map(([, name, type, , , pk]) => ({
        name,
        type: type.toLowerCase(),
        pk: pk > 0,
        note: notes[`${table}.${name}`] ?? null,
        references: references[name] ?? null,
      }));
      return { name: table, columns };
    });
  } finally {
    db.close();
  }
}

function schemaOf(db) {
  const schema = {};
  const tables = db.exec(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid`);
  for (const [table] of tables[0]?.values ?? []) {
    const info = db.exec(`PRAGMA table_info(${table})`)[0];
    schema[table] = info.values.map((row) => row[1]);
  }
  return schema;
}

// Runs `sql` and returns the result of its last statement that produces rows.
//   { ok: true, columns, rows, truncated }
//   { ok: false, error, tip }   tip is a plain-English suggestion for fixing the error
export function runQuery(SQL, datasetName, sql) {
  if (!sql || !sql.trim()) {
    return { ok: false, error: 'Your query is empty.', tip: 'Type a query, starting with SELECT.' };
  }
  const db = openDatabase(SQL, datasetName);
  try {
    let result = null;
    // iterateStatements (unlike exec) still reports the columns when a SELECT returns no rows.
    for (const stmt of db.iterateStatements(sql)) {
      const columns = stmt.getColumnNames();
      const rows = [];
      let truncated = false;
      while (stmt.step()) {
        if (rows.length >= MAX_ROWS) {
          truncated = true;
          break;
        }
        rows.push(stmt.get());
      }
      stmt.free();
      if (columns.length > 0) result = { ok: true, columns, rows, truncated };
    }
    if (!result) {
      return {
        ok: false,
        error: 'Your query ran, but it didn\'t return a table of results.',
        tip: 'Answers need to be a SELECT query (or WITH ... SELECT).',
      };
    }
    return result;
  } catch (err) {
    return { ok: false, error: err.message, tip: explainError(err.message, sql, schemaOf(db)) };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------- error messages

// Functions from other databases that SQLite doesn't have, and what to use instead.
const OTHER_DIALECT_FUNCTIONS = {
  year: "strftime('%Y', date_column)",
  month: "strftime('%m', date_column)",
  day: "strftime('%d', date_column)",
  date_trunc: "strftime('%Y-%m', date_column) to get the month",
  date_format: "strftime('%Y-%m-%d', date_column)",
  to_char: "strftime('%Y-%m', date_column)",
  extract: "strftime('%Y', date_column)",
  datediff: 'julianday(later_date) - julianday(earlier_date)',
  now: "date('now')",
  getdate: "date('now')",
  concat: "the || operator, e.g. first || ' ' || last",
  len: 'length(text)',
  isnull: 'ifnull(value, fallback)',
  nvl: 'ifnull(value, fallback) or coalesce(...)',
  left: 'substr(text, 1, n)',
};

export function explainError(message, sql, schema) {
  const tables = Object.keys(schema);
  const allColumns = [...new Set(Object.values(schema).flat())];
  let m;

  if ((m = message.match(/no such table: (\S+)/))) {
    const name = m[1].replace(/^main\./, '');
    const guess = closest(name, tables);
    return (
      `There's no table called "${name}".` +
      (guess ? ` Did you mean "${guess}"?` : '') +
      ` The tables are: ${tables.join(', ')}.`
    );
  }
  if ((m = message.match(/no such column: (\S+)/))) {
    const full = m[1];
    const name = full.includes('.') ? full.split('.').pop() : full;
    const prefix = full.includes('.') ? full.split('.')[0] : null;
    const inTables = tables.filter((t) => schema[t].includes(name));
    if (prefix && inTables.length > 0) {
      return (
        `"${name}" is a real column, but not in the table you called "${prefix}". ` +
        `It's in: ${inTables.join(', ')}. Check which table or alias goes before the dot.`
      );
    }
    const guess = closest(name, allColumns);
    if (/["“”]/.test(sql) && !prefix) {
      return (
        `There's no column called "${name}". If you meant the text '${name}', use single quotes. ` +
        `In SQL, "double quotes" are for column names and 'single quotes' are for text.`
      );
    }
    return (
      `There's no column called "${name}".` +
      (guess ? ` Did you mean "${guess}"?` : '') +
      ` Check the table list on the left for the exact column names.`
    );
  }
  if ((m = message.match(/ambiguous column name: (\S+)/))) {
    const name = m[1];
    const inTables = tables.filter((t) => schema[t].includes(name) && new RegExp(`\\b${t}\\b`, 'i').test(sql));
    return (
      `More than one table in your query has a column called "${name}" (${inTables.join(', ')}). ` +
      `Say which one you mean by putting the table name or alias in front, e.g. ${inTables[0] ?? 'table'}.${name}.`
    );
  }
  if ((m = message.match(/no such function: (\w+)/))) {
    const fn = m[1];
    const instead = OTHER_DIALECT_FUNCTIONS[fn.toLowerCase()];
    return instead
      ? `This game uses SQLite, which doesn't have ${fn}(). Use ${instead} instead.`
      : `SQLite doesn't have a function called ${fn}(). Check the spelling.`;
  }
  if (/misuse of aggregate/.test(message)) {
    return (
      'Aggregate functions like COUNT(), SUM() and AVG() can\'t go in WHERE, because WHERE runs before rows are grouped. ' +
      'Filter on aggregates with HAVING, after GROUP BY.'
    );
  }
  if (/misuse of window function/.test(message)) {
    return (
      'Window functions (like RANK() or LAG() ... OVER) can\'t be used in WHERE, GROUP BY or HAVING. ' +
      'Put the window function in a subquery or CTE, then filter on its result in the outer query.'
    );
  }
  if (/a GROUP BY clause is required before HAVING/.test(message)) {
    return 'HAVING filters groups, so it needs a GROUP BY before it. Or, to filter plain rows, use WHERE.';
  }
  if (/wrong number of arguments to function (\w+)/.test(message)) {
    return 'One of your functions has too many or too few values inside its parentheses.';
  }
  if (/ORDER BY term out of range/.test(message)) {
    return 'ORDER BY 3 means "the 3rd column", but your query doesn\'t have that many columns.';
  }
  if (/sub-select returns \d+ columns - expected 1|row value misused/.test(message)) {
    return 'A subquery used with =, IN or as a single value has to return exactly one column.';
  }
  if (/incomplete input|unrecognized token/.test(message)) {
    return 'Your query ends unexpectedly. Look for a missing closing parenthesis ) or a missing closing quote \'.';
  }
  if ((m = message.match(/near "([^"]*)": syntax error/))) {
    const near = m[1];
    if (/\bselect\s+top\b/i.test(sql)) {
      return 'SQLite doesn\'t support SELECT TOP n. Put LIMIT n at the end of the query instead.';
    }
    if (/^from$/i.test(near) && /,\s*from\b/i.test(sql)) {
      return 'There\'s an extra comma right before FROM. Remove the comma after your last column.';
    }
    if (/^(where|group|order|having|limit)$/i.test(near)) {
      return (
        `SQL got confused at ${near.toUpperCase()}. Check that the clauses are in this order: ` +
        'SELECT → FROM → JOIN → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT.'
      );
    }
    if (/^(from|join|on)$/i.test(near) || /^,/.test(near)) {
      return `Check the part just before "${near}". You may have an extra or missing comma.`;
    }
    return (
      `SQL couldn't understand the query near "${near}". Check for a typo, ` +
      'a missing comma between columns, or a keyword in the wrong place.'
    );
  }
  return 'Read the error message above, check your query near where it points, and try again.';
}

// The candidate with the smallest edit distance to `word`, if it's close enough to be a likely typo.
function closest(word, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = editDistance(word.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = above;
    }
  }
  return prev[b.length];
}

// ---------------------------------------------------------------- checking answers

// Numbers are compared to 6 decimal places, so tiny floating point noise doesn't matter
// but a missing ROUND(x, 2) does.
function normalize(value) {
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6;
  return value;
}

const rowKey = (row) => JSON.stringify(row.map(normalize));
const sameRow = (a, b) => rowKey(a) === rowKey(b);

export function formatValue(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return `'${value}'`;
  return String(value);
}

const formatRow = (row) => `(${row.map(formatValue).join(', ')})`;

// Checks a player's query against the question's solution.
//   { status: 'error', error, tip }                      the query didn't run
//   { status: 'wrong', message, details, result }         it ran but the answer is wrong
//   { status: 'correct', result }
export function checkAnswer(SQL, question, sql) {
  const result = runQuery(SQL, question.dataset, sql);
  if (!result.ok) return { status: 'error', error: result.error, tip: result.tip };

  const expected = runQuery(SQL, question.dataset, question.solution);
  if (!expected.ok) {
    return { status: 'error', error: 'This question\'s solution is broken: ' + expected.error, tip: 'Please report this.' };
  }

  const problems = compareResults(expected, result, question.orderMatters);
  if (problems.length === 0) return { status: 'correct', result };
  const [message, ...details] = problems;
  // A specific "did you mean" beats the generic advice about checking WHERE values.
  const typos = misspelledValues(SQL, question.dataset, sql);
  const rest = typos.length ? details.filter((d) => d !== CHECK_WHERE_VALUES) : details;
  return { status: 'wrong', message, details: [...typos, ...rest], result };
}

// Text in 'single quotes' that doesn't appear anywhere in the data is usually a typo
// ('Cate Blanchet') or the wrong capitalization ('middle-earth'). Point it out, with a suggestion.
export function misspelledValues(SQL, datasetName, sql) {
  const literals = [...sql.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const candidates = literals.filter((text) => text.trim() && !/[%_]/.test(text) && isNaN(Number(text)));
  if (candidates.length === 0) return [];

  const values = new Set();
  const db = openDatabase(SQL, datasetName);
  try {
    for (const [table, columns] of Object.entries(schemaOf(db))) {
      for (const column of columns) {
        const rows = db.exec(`SELECT DISTINCT "${column}" FROM "${table}" WHERE typeof("${column}") = 'text'`);
        for (const [value] of rows[0]?.values ?? []) values.add(value);
      }
    }
  } finally {
    db.close();
  }

  const tips = [];
  for (const text of new Set(candidates)) {
    if (values.has(text)) continue;
    const sameIgnoringCase = [...values].find((v) => v.toLowerCase() === text.toLowerCase());
    const guess = sameIgnoringCase ?? closest(text, [...values]);
    tips.push(
      guess
        ? `'${text}' doesn't appear anywhere in the data. Did you mean '${guess}'? Text has to match exactly, including capitals.`
        : `'${text}' doesn't appear anywhere in the data. Preview the tables to check the exact spelling.`,
    );
  }
  return tips;
}

// Returns a list of human-readable problems. Empty means the results match.
export function compareResults(expected, actual, orderMatters) {
  const want = expected.rows;
  const got = actual.rows;
  const expectedCols = expected.columns.join(', ');

  if (actual.columns.length !== expected.columns.length) {
    return [
      `Expected ${plural(expected.columns.length, 'column')} (${expectedCols}), ` +
        `but your query returned ${plural(actual.columns.length, 'column')} (${actual.columns.join(', ')}).`,
      actual.columns.length > expected.columns.length
        ? 'Only SELECT the columns the question asks for.'
        : 'Make sure you SELECT every column the question asks for.',
    ];
  }

  if (got.length === 0 && want.length > 0) {
    return [
      `Your query returned no rows, but the answer has ${plural(want.length, 'row')}.`,
      CHECK_WHERE_VALUES,
      'If you used an INNER JOIN, check the join condition matches the right columns.',
    ];
  }

  if (got.length !== want.length) {
    const tooMany = got.length > want.length;
    return [
      `Expected ${plural(want.length, 'row')}, but your query returned ${got.length}.`,
      ...(tooMany
        ? [
            'Too many rows. Is your WHERE filter missing a condition?',
            'Are there duplicates? You might need DISTINCT, or a GROUP BY.',
            'A JOIN can multiply rows if the join condition isn\'t specific enough.',
          ]
        : [
            'Too few rows. Is your WHERE filter too strict?',
            'An INNER JOIN drops rows that have no match. Would a LEFT JOIN keep them?',
          ]),
    ];
  }

  const sortedWant = sortRows(want);
  const sortedGot = sortRows(got);
  const sameRowsIgnoringOrder = sortedWant.every((row, i) => sameRow(row, sortedGot[i]));

  if (sameRowsIgnoringOrder) {
    if (!orderMatters || want.every((row, i) => sameRow(row, got[i]))) return [];
    return [
      'You have exactly the right rows, but in the wrong order.',
      'Check your ORDER BY: the column(s) you sort by, and ASC (smallest first) vs DESC (largest first).',
    ];
  }

  // Look at each column on its own to pinpoint what's off.
  const columnMatches = expected.columns.map((_, c) =>
    sameMultiset(want.map((r) => r[c]), got.map((r) => r[c])),
  );
  const badColumns = columnMatches.flatMap((ok, c) => (ok ? [] : [c]));

  if (badColumns.length === 0) {
    return [
      'Every column has the right values, but they\'re paired up wrong across rows.',
      'Check your JOIN conditions: each row should line up the right records with each other.',
    ];
  }

  const swapped = findColumnSwap(want, got);
  if (swapped) {
    return [
      'Your values look right, but the columns are in the wrong order.',
      `List them in this order: ${expectedCols}.`,
    ];
  }

  const problems = [];
  for (const c of badColumns) {
    const name = expected.columns[c];
    const yours = actual.columns[c];
    const label = name === yours ? `"${name}"` : `"${name}" (your column ${c + 1}, "${yours}")`;
    const example = firstDifference(want.map((r) => r[c]), got.map((r) => r[c]));
    let line = `The ${label} column doesn't match.`;
    if (example) line += ` For example, the answer has ${formatValue(example.want)}, but you have ${formatValue(example.got)}.`;
    problems.push(line);
    if (example && looksLikeRounding(example.want, example.got)) {
      problems.push('That looks like a rounding difference. Re-read how many decimal places the question asks for, and use ROUND(value, places).');
    }
  }
  if (badColumns.length < expected.columns.length) {
    const goodNames = columnMatches.flatMap((ok, c) => (ok ? [expected.columns[c]] : []));
    problems.push(`Good news: ${goodNames.join(', ')} ${goodNames.length === 1 ? 'is' : 'are'} right.`);
  }
  const missing = sortedWant.find((row) => !got.some((g) => sameRow(g, row)));
  if (missing && expected.columns.length > 1) {
    problems.push(`One row that should be in your results but isn't: ${formatRow(missing)}`);
  }
  return problems;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => (rowKey(a) < rowKey(b) ? -1 : rowKey(a) > rowKey(b) ? 1 : 0));
}

function sameMultiset(a, b) {
  const key = (v) => JSON.stringify(normalize(v));
  const x = a.map(key).sort();
  const y = b.map(key).sort();
  return x.every((v, i) => v === y[i]);
}

// Is `got` the same as `want` with its columns reordered?
function findColumnSwap(want, got) {
  const n = want[0]?.length ?? 0;
  if (n < 2) return false;
  const used = new Set();
  const mapping = [];
  for (let c = 0; c < n; c++) {
    const wantCol = want.map((r) => r[c]);
    const match = [...Array(n).keys()].find((g) => !used.has(g) && sameMultiset(wantCol, got.map((r) => r[g])));
    if (match === undefined) return false;
    used.add(match);
    mapping.push(match);
  }
  return mapping.some((g, c) => g !== c);
}

function firstDifference(want, got) {
  const a = [...want].sort(compareValues);
  const b = [...got].sort(compareValues);
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(normalize(a[i])) !== JSON.stringify(normalize(b[i]))) return { want: a[i], got: b[i] };
  }
  return null;
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function looksLikeRounding(want, got) {
  return typeof want === 'number' && typeof got === 'number' && Math.abs(want - got) < 1;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
