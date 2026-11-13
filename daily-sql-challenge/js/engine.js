// The SQL side of the game: builds a film's tables in an in-browser SQLite database (sql.js),
// runs the player's query, and decides whether its result matches the expected one.

let SQL = null;

export async function initEngine() {
  SQL = await window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
}

// Text columns are created case-insensitive, so WHERE race = 'hobbit' matches 'Hobbit'.
export function buildDb(film) {
  const db = new SQL.Database();
  for (const t of film.tables) {
    const cols = t.columns
      .map(([n, ty]) => `"${n}" ${ty}${ty === 'TEXT' ? ' COLLATE NOCASE' : ''}`)
      .join(', ');
    db.run(`CREATE TABLE "${t.name}" (${cols})`);
    const stmt = db.prepare(`INSERT INTO "${t.name}" VALUES (${t.columns.map(() => '?').join(', ')})`);
    for (const row of t.rows) stmt.run(row);
    stmt.free();
  }
  return db;
}

const MAX_ROWS = 200;

// Runs one read-only query. Returns { columns, rows } or { error }.
export function runQuery(db, sql) {
  const clean = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .replace(/;+\s*$/, '');
  if (!clean) return { error: 'Write a query first.' };
  if (!/^(select|with|values)\b/i.test(clean)) {
    return { error: 'Only SELECT queries are allowed in this theater.' };
  }
  let stmt;
  try {
    stmt = db.prepare(clean);
    const columns = stmt.getColumnNames();
    const rows = [];
    while (stmt.step() && rows.length < MAX_ROWS) rows.push(stmt.get());
    return { columns, rows };
  } catch (e) {
    return { error: String(e.message || e) };
  } finally {
    if (stmt) stmt.free();
  }
}

// Values are compared loosely: text ignores case and outer spaces, numbers round to 2 places.
function norm(v) {
  if (v === null || v === undefined) return '\u0000null';
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  if (v instanceof Uint8Array) return '\u0000blob';
  const s = String(v).trim().toLowerCase();
  return s !== '' && !isNaN(Number(s)) ? String(Math.round(Number(s) * 100) / 100) : s;
}

// Does `got` answer the question whose right answer is `want`?
// Column names never matter. Extra columns are forgiven as long as the expected ones are there.
// Row order only matters when the question asks for one.
// Returns { ok: true } or { ok: false, why: 'empty' | 'rows' | 'columns' | 'order' | 'values' }.
export function compare(want, got, ordered) {
  if (got.rows.length === 0) return { ok: false, why: 'empty' };
  if (got.rows.length !== want.rows.length) return { ok: false, why: 'rows' };
  if (got.columns.length < want.columns.length) return { ok: false, why: 'columns' };

  const W = want.rows.map((r) => r.map(norm));
  const G = got.rows.map((r) => r.map(norm));
  const colSig = (M, j) => M.map((r) => r[j]).sort().join('\u0001');

  // Pick, for each expected column, a column of the player's result holding the same values.
  const used = new Set();
  const pick = [];
  for (let j = 0; j < want.columns.length; j++) {
    const sig = colSig(W, j);
    let found = -1;
    for (let k = 0; k < got.columns.length; k++) {
      if (!used.has(k) && colSig(G, k) === sig) { found = k; break; }
    }
    if (found < 0) return { ok: false, why: 'values' };
    used.add(found);
    pick.push(found);
  }

  const line = (r) => r.join('\u0001');
  const wl = W.map(line);
  const gl = G.map((r) => line(pick.map((k) => r[k])));
  const sameSorted = [...wl].sort().join('\u0002') === [...gl].sort().join('\u0002');
  if (!sameSorted) return { ok: false, why: 'values' };
  if (ordered && wl.join('\u0002') !== gl.join('\u0002')) return { ok: false, why: 'order' };
  return { ok: true };
}
