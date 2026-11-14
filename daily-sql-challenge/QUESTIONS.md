# Question rules

What a film in `data/films.json` has to look like. `tools/validate.py` enforces the rules marked
**(checked)**; the rest are judgement calls for whoever writes or reviews a film.

## The film

- A well-known movie. The tables hold data from inside the movie's world (the Fellowship, Kevin's
  traps), not real box office figures. Invented numbers and a few invented extras are fine.
- One or two tables. A second table exists only so Act III can join to it. **(checked: at most 2)**
- Each table is at most 12 rows and 5 columns, so it can be read in a few seconds. **(checked)**
- Plain column names, no spaces. Text values without apostrophes, so nobody fights with quoting.
- All three acts use the same tables. The player reads them once, on the start screen.

## Act I: Premiere Night (45 seconds)

**Fix a broken query.** The editor starts with a query that has exactly one thing wrong.

- The prompt says what the query should do and what goes wrong ("returns nothing", "crashes",
  "only returns one row"). It does not name the fix.
- The fix is small: one keyword, one symbol, one clause. Nothing to write from scratch.
- One table. No join, no window function. **(checked)**
- The broken query must not already pass. **(checked)**
- Bugs used so far, to keep new ones varied: missing GROUP BY, WHERE where HAVING is needed,
  `= NULL`, missing comma, unquoted text, clauses in the wrong order, missing DESC,
  COUNT without DISTINCT, LIKE without `%`, AND where OR is needed, wrong aggregate (AVG for SUM),
  IN without parentheses, missing DISTINCT, `=` where `!=` is needed, BETWEEN backwards,
  misspelled keyword, missing LIMIT, ORDER BY on the wrong column, GROUP BY on the wrong column,
  listing rows where a COUNT is wanted.

## Act II: Opening Weekend (90 seconds)

**Write one query against one table.** The editor starts empty.

- One table. No join, no window function, no subquery needed. **(checked: no join or window)**
- Uses two or three basic pieces together: filter, sort, limit, group, a simple aggregate, HAVING,
  or arithmetic in the SELECT list. Typical shapes: "top 3 by ...", "total per ...", "average per
  ... for groups with more than one".
- If the film has two tables, the prompt names the one to use.

## Act III: Worldwide Release (180 seconds)

**Write one query that needs exactly one harder idea:** either one join or one window function,
never both. **(checked)**

- Join questions: an inner join, usually with a filter, a sort, or a GROUP BY on the borrowed
  column. A LEFT JOIN to find rows with no match is allowed.
- Window questions: one function with one OVER clause. Used so far: RANK, SUM/MAX/MIN/AVG over a
  partition, a running SUM, LAG, and an empty `OVER ()`.
- No subqueries or CTEs are required (players may use them; answers are judged by result).

## Every question

- The prompt names every column the answer needs, in order, and says how to sort if order matters.
  It stays under 230 characters. **(checked)**
- `ordered` is true only when the prompt asks for an order, and then the sort key has no ties.
  **(checked: no duplicate rows in ordered answers)**
- Answers come out as whole numbers or one clean decimal where possible, so rounding never decides
  whether an answer is accepted.
- The solution is written one column per line, keywords in capitals, two-space indent.
- `lesson` is one plain sentence on the idea the question was testing.

## How answers are judged

The player's query runs in real SQLite (in the browser) and its result is compared with the
solution's result. Capitals, column names, extra columns, and (unless the prompt asks for an
order) row order do not matter. Text comparisons in WHERE are not case-sensitive.
