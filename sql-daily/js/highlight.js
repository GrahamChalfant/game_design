// A tiny SQL syntax highlighter: turns SQL text into HTML with a <span class="sql-…"> per token.
// Used for the editor (drawn behind a see-through textarea) and for the solutions on the reveal screen.

const KEYWORDS = new Set(`
  select from where and or not in is null as join left right inner outer full cross on using group by
  order having limit offset distinct all case when then else end with recursive union intersect except
  exists between like glob escape collate asc desc nulls first last over partition rows range groups
  preceding following current row unbounded filter window insert into values update set delete create
  table view drop alter index primary key references true false cast
`.split(/\s+/).filter(Boolean));

// One pattern per token type, tried in order at each position.
const TOKENS = [
  ['comment', /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
  ['string', /'(?:[^']|'')*(?:'|$)/y],
  ['ident', /"(?:[^"]|"")*(?:"|$)|`[^`]*(?:`|$)|\[[^\]]*(?:\]|$)/y],
  ['number', /\b\d+(?:\.\d+)?\b|\.\d+\b/y],
  ['word', /[A-Za-z_][A-Za-z0-9_$]*/y],
  ['op', /<>|<=|>=|!=|==|\|\||[-+*/%=<>(),.;]/y],
  ['space', /\s+/y],
  ['other', /./y],
];

const escapeHtml = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// Splits SQL into tokens: [{ type, text }], where type is keyword, function, ident, string, number,
// comment, op or space.
export function tokenize(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    for (const [type, pattern] of TOKENS) {
      pattern.lastIndex = i;
      const match = pattern.exec(sql);
      if (!match) continue;
      const text = match[0];
      let kind = type === 'other' ? 'space' : type;
      if (type === 'word') {
        // A word is a keyword (SELECT), a function (COUNT followed by a bracket) or a name (title).
        if (KEYWORDS.has(text.toLowerCase())) kind = 'keyword';
        else if (/^\s*\(/.test(sql.slice(i + text.length))) kind = 'function';
        else kind = 'ident';
      }
      tokens.push({ type: kind, text });
      i += text.length;
      break;
    }
  }
  return tokens;
}

export function highlightSql(sql) {
  return tokenize(sql)
    .map(({ type, text }) => (type === 'space' ? escapeHtml(text) : `<span class="sql-${type}">${escapeHtml(text)}</span>`))
    .join('');
}

// Draws `textarea`'s text, color-coded, in `layer` (a <pre> placed exactly behind it), and keeps the
// two in step as the player types and scrolls.
export function attachHighlighter(textarea, layer) {
  const update = () => {
    // A trailing newline needs something after it, or the <pre> is a line shorter than the textarea.
    layer.innerHTML = highlightSql(textarea.value) + (textarea.value.endsWith('\n') ? ' ' : '');
    syncScroll();
  };
  const syncScroll = () => {
    layer.scrollTop = textarea.scrollTop;
    layer.scrollLeft = textarea.scrollLeft;
  };
  textarea.addEventListener('input', update);
  textarea.addEventListener('scroll', syncScroll);
  return update;
}
