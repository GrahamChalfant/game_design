// Works out what a question needs by reading its solution: the tables, the columns and the
// filters (like franchise = 'The Matrix'). The game highlights these in the question and in the
// table diagram, so players can see where to look.

import { tokenize } from './highlight.js';

// tables: the output of describeTables(). Returns
//   { tables: Set('films'), columns: Set('films.title'), filters: [{ text, column, values }] }
export function analyzeSolution(solution, tables) {
  const columnsOf = Object.fromEntries(tables.map((t) => [t.name, t.columns.map((c) => c.name)]));
  const words = tokenize(solution).filter((t) => t.type !== 'space' && t.type !== 'comment');

  // Which tables are used, and the aliases they're given (FROM films f, JOIN screens AS sc).
  // Only a name right after FROM or JOIN counts, so ORDER BY films (a count named "films") doesn't.
  const aliases = {};
  words.forEach((token, i) => {
    const before = words[i - 1]?.text.toLowerCase();
    if (token.type !== 'ident' || !columnsOf[token.text] || (before !== 'from' && before !== 'join')) return;
    aliases[token.text] = token.text;
    const next = words[i + 1]?.text.toLowerCase() === 'as' ? words[i + 2] : words[i + 1];
    if (next?.type === 'ident' && !columnsOf[next.text]) aliases[next.text] = token.text;
  });
  const used = new Set(Object.values(aliases));

  // Resolves a column reference (title, f.title, films.title) to 'table.column' names.
  const resolve = (ref) => {
    const [qualifier, name] = ref.includes('.') ? ref.split('.') : [null, ref];
    if (qualifier) return aliases[qualifier] && columnsOf[aliases[qualifier]].includes(name) ? [`${aliases[qualifier]}.${name}`] : [];
    return [...used].filter((t) => columnsOf[t].includes(name)).map((t) => `${t}.${name}`);
  };

  const columns = new Set();
  words.forEach((token, i) => {
    if (token.type !== 'ident' || words[i - 1]?.text.toLowerCase() === 'as' || words[i - 1]?.text === '.') return;
    const ref = words[i + 1]?.text === '.' && words[i + 2]?.type === 'ident' ? `${token.text}.${words[i + 2].text}` : token.text;
    for (const column of resolve(ref)) columns.add(column);
  });

  // Comparisons against a fixed value: franchise = 'The Matrix', runtime > 170, COUNT(*) >= 5.
  // Comparisons on made-up names (WHERE rnk = 1) are steps of the solution, not filters, so they're skipped.
  const filters = [];
  const literal = String.raw`'(?:[^']|'')*'|-?\d+(?:\.\d+)?`;
  const comparison = new RegExp(
    String.raw`([\w.]+(?:\([^()]*\))?)\s*(<=|>=|<>|!=|=|<|>|\bLIKE\b|\bBETWEEN\b)\s*(${literal})(?:\s+AND\s+(${literal}))?`,
    'gi',
  );
  for (const m of solution.replace(/\s+/g, ' ').matchAll(comparison)) {
    const [, left, op, value, value2] = m;
    if (op.toUpperCase() !== 'BETWEEN' && value2 !== undefined) continue; // "x = 1 AND y" isn't a range
    const isAggregate = left.includes('(');
    const column = isAggregate ? null : resolve(left)[0];
    if (!isAggregate && !column) continue;
    const name = isAggregate ? left : left.split('.').pop();
    const values = [value, value2].filter(Boolean).map((v) => v.replace(/^'|'$/g, '').replace(/''/g, "'"));
    const text = op.toUpperCase() === 'BETWEEN' ? `${name} BETWEEN ${value} AND ${value2}` : `${name} ${op.toUpperCase()} ${value}`;
    if (!filters.some((f) => f.text === text)) filters.push({ text, column, values });
  }
  return { tables: used, columns, filters };
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The prompt as HTML, with filter values, column names and table names wrapped in highlight spans.
export function highlightPrompt(prompt, needs) {
  const terms = new Map(); // text -> css class; filters win over columns, columns over tables
  for (const table of needs.tables) terms.set(table, 'hl-table');
  for (const column of needs.columns) {
    const name = column.split('.')[1];
    terms.set(name, 'hl-column');
    if (name.includes('_')) terms.set(name.replace(/_/g, ' '), 'hl-column'); // "tickets sold" for tickets_sold
  }
  for (const filter of needs.filters) {
    for (const value of filter.values) {
      if (!value.trim()) continue;
      terms.set(value, 'hl-filter');
      // Prompts often drop the "The": 'The Godfather' should still light up "each Godfather film".
      if (/^The /.test(value)) terms.set(value.slice(4), 'hl-filter');
    }
  }
  if (terms.size === 0) return escapeHtml(prompt);

  const sorted = [...terms.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?<![\\w%])(${sorted.map(escapeRegExp).join('|')})(?![\\w%])`, 'g');
  let html = '';
  let last = 0;
  for (const m of prompt.matchAll(pattern)) {
    html += escapeHtml(prompt.slice(last, m.index)) + `<mark class="${terms.get(m[1])}">${escapeHtml(m[1])}</mark>`;
    last = m.index + m[1].length;
  }
  return html + escapeHtml(prompt.slice(last));
}
