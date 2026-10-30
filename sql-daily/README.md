# SQL: The Sequel

A daily SQL game for your morning coffee. Every day is a new **feature**: a movie-themed
trilogy of three quick SQL questions, played one at a time on a movie theater screen.

- **Part I** is easy: 1 minute, 100 points.
- **Part II** is medium: 2 minutes, 200 points.
- **Part III** is hard: 3 minutes, 300 points.

Everyone gets the same feature on the same day. Day 1 is *The Lord of the Rings*.

## Playing it locally

From inside the `sql-daily` folder, run:

```bash
python3 serve.py
```

Then open http://localhost:8001. Press **Ctrl+C** in the terminal to stop the server.
(Port 8001 keeps it out of the way of the survival game on 8000.)

`serve.py` is a tiny web server that tells your browser not to cache the game's files. The
usual `python3 -m http.server` works too, but after you pull changes the browser can mix old
cached files with new ones, which shows up as a broken, unstyled page. If that happens, do a
hard refresh: **Cmd+Shift+R** on a Mac, **Ctrl+Shift+R** on Windows or Linux.

You can't just double-click `index.html`, because browsers block this kind of page when it's
opened as a local file. If you try, the page tells you what to do instead.

Testing shortcuts (add these to the address):

| Address | What it does |
| --- | --- |
| `?date=2026-11-05` | Play another day's feature |
| `?reset` | Clear your progress for that day so you can replay it |
| `?date=2026-11-05&reset` | Both |

## How a day plays

1. The start screen shows today's feature and one button: **Begin**.
2. An old-school film-leader countdown runs **3, 2, 1**, then Part I appears on the screen and
   its timer starts. Your editor sits below the screen; your output and any error messages
   appear on the screen.
3. Run your query as often as you like and submit when you think it's right. Wrong
   submissions and hints are free.
4. When you get it right, give up or run out of time, the screen shows your points and the
   solution, and one button: **Roll Part II**. Another 3-2-1 countdown, then Part II. Same for Part III.
5. After Part III, **Roll the credits** shows your score, a share button and your stats.

The three squares at the top show where you are. You can't jump between questions.
If you close the tab, the clock keeps running and you pick up where you left off, even mid-countdown.

## Scoring: how it adds up to 1,000

| | Time | Correct | Boost |
| --- | --- | --- | --- |
| Part I (easy) | 1:00 | 100 | +50 |
| Part II (medium) | 2:00 | 200 | +100 |
| Part III (hard) | 3:00 | 300 | +150 |
| All three correct | | +100 | |
| **Perfect day** | | **700** | **+300 = 1,000** |

You earn a question's **boost** by answering correctly with more than a third of its time left
(more than 20 seconds on Part I, 40 on Part II, 60 on Part III). The timer ring glows gold while
the boost is available, and a tick on the ring marks where it runs out.

The share text uses 🟨 for a boosted answer, 🟩 for a correct one and 🟥 for a miss.
All of these numbers live in `js/config.js`.

## How it works

- **SQL engine.** The game runs [SQLite](https://sqlite.org/) inside the browser using
  [sql.js](https://sql.js.org/) (in `vendor/`). There's no server and no database to set up.
  It's SQLite only, so players never have to guess the dialect (dates use `strftime()`, not `DATE_TRUNC`).
- **The data.** One small movie database in `data/datasets.js`:
  - `films` and `roles`: 28 real films from 7 franchises (year, runtime, director, approximate
    box office, Oscar wins) and who played whom.
  - `screens` and `screenings`: a made-up week at *The Sequel*, the game's own cinema, with
    show dates, show times, tickets sold and prices. This gives medium and hard questions
    dates, joins and gaps to work with.
- **The table diagram.** Every question uses the same four tables. They're drawn under the
  editor with their column types, short notes (`gross` is in $ millions, `part` 1 = first film),
  primary and foreign keys, and lines between the join keys.
- **Highlights.** The game reads each question's solution to work out which tables, columns and
  filters it needs (like `franchise = 'The Matrix'`). Those light up in the question text, in a
  "Filter" line under it, and in the table diagram, including the join lines it uses. This is in `js/needs.js`.
- **Checking answers.** Your query and the official solution both run against a fresh copy
  of the data. If the results match, you're right, so a CTE or a subquery, or `RANK` or
  `ROW_NUMBER`, all count. Column names don't matter. Row order only matters if the question
  asks for one.
- **Error messages.** When a query fails, the game shows SQLite's error plus a plain-English tip
  (*There's no table called "film". Did you mean "films"?*). When it runs but the answer is
  wrong, it says what's off: a misspelled value (*'middle-earth' doesn't appear anywhere in the
  data. Did you mean 'Middle-earth'?*), wrong row or column counts, wrong order, rounding, and
  so on. This is all in `js/checker.js`.
- **The daily rotation.** Features play in the order they're listed in `data/features.js`,
  one per day, starting on `LAUNCH_DATE` in `js/config.js`, then repeat.

## Writing questions

Keep them coffee-sized: short to read, quick to type, with a small answer you can check at a glance.

| Tier | Time | Size | Use |
| --- | --- | --- | --- |
| Easy | 1 min | 1–2 pieces, one table | `WHERE`, `GROUP BY` with `COUNT`/`SUM`/`AVG`, `ORDER BY` with `LIMIT`, `DISTINCT`, simple `CASE WHEN`, `BETWEEN`/`IN`/`LIKE` |
| Medium | 2 min | 2–3 pieces | a join plus aggregation, `HAVING`, a subquery in `WHERE`, `COALESCE`, `strftime()` grouping, `SUM(CASE WHEN …)`, or one basic window function (`ROW_NUMBER`/`RANK`) |
| Hard | 3 min | 3–4 pieces | `LAG`/`LEAD`, running totals, a CTE that filters a window result (top-N per group), self-joins, `NOT EXISTS`, frame clauses (`ROWS BETWEEN …`), percent of total |

- **Write prompts the highlights can find.** Highlights come from the solution, and light up
  in the prompt wherever the same words appear. So use the real filter values ("The Matrix",
  "170") and column names ("title", "tickets sold" for `tickets_sold`) in the prompt text.
  `npm run validate -- --verbose` lists what each question will highlight.
- **Hard means hard SQL, not unclear wording.** Always spell out the columns and the sort order.
- **No tricks on easy.** Save NULL and join gotchas for medium, and warn about them in the prompt.
- **Watch for tier creep.** `ROW_NUMBER` alone is medium. Filtering on it (top 2 per group) is hard.

Features live in `data/features.js`. Copy an existing one and change it:

```js
{
  id: 'middle-earth',                   // unique, never change it once it's live
  theme: 'The Lord of the Rings',       // shown on the start screen
  tagline: 'One query to rule them all.',
  questions: {
    easy: {
      title: 'The Extended Editions',
      prompt: 'List the title and runtime of every Middle-earth film longer than 170 minutes, longest first.',
      columns: ['title', 'runtime'],    // shown to the player
      orderMatters: true,               // true only if the prompt asks for an order
      solution: `SELECT title, runtime FROM films WHERE franchise = 'Middle-earth' AND runtime > 170 ORDER BY runtime DESC;`,
      hints: ['Combine two conditions in WHERE with AND.', 'Sort with ORDER BY runtime DESC.'],
      tests: {
        accept: [ /* other correct queries that must pass */ ],
        reject: [ /* common mistakes that must fail */
          `SELECT title, runtime FROM films WHERE runtime > 170 ORDER BY runtime DESC`,
        ],
      },
    },
    medium: { ... },
    hard: { ... },
  },
},
```

### Checking your work

After any change, run the validator. It runs every solution and every test query, and tells
you exactly what's wrong: a solution that doesn't run, a missing field, a feature without a
hard question, a `reject` query that accidentally passes, and so on. It also **warns** when a
question:

- looks like the wrong tier (a JOIN on easy, LAG on medium, …),
- has a solution too long to type comfortably in the time,
- has a prompt too long to read quickly, or
- has an answer with too many rows to check at a glance.

Without installing anything: start the server as above and open
http://localhost:8001/validate.html.

Or, with Node.js:

```bash
npm install
```

```bash
npm run validate
```

Add `-- --verbose` to see details for questions that pass too. The command exits with an error
if anything fails, so it can also run automatically on GitHub before changes are merged.

## Project layout

```
index.html           The theater: HUD, screen, console
styles.css           Theater styles (curtains, screen, film-leader countdown, console)
validate.html        Feature checker, in the browser
js/config.js         Points, timers, boost rule, countdown length, launch date
js/game.js           The flow: start → countdown → question → reveal → credits
js/checker.js        Runs queries, compares results, writes the error messages
js/daily.js          Picks today's feature, saves progress and stats
js/validate.js       Feature checks (shared by validate.html and npm run validate)
data/features.js     The daily features and their questions
data/datasets.js     The movie database and The Sequel's week of screenings
tools/validate-bank.js   npm run validate
vendor/              sql.js (SQLite compiled to run in the browser)
```

## Roadmap

1. ~~In-browser SQL engine, answer checking and helpful error messages~~
2. ~~Movie theme: daily features, Part I / II / III~~
3. ~~Theater look, 3-2-1 countdowns, 1/2/3-minute timers, boost, scoring to 1,000~~
4. ~~Daily rotation, saved progress, streaks and stats~~
5. ~~Feature format and validator, with tier and size warnings~~ (7 features to start)
6. **Write more features.** With 7, the game repeats after a week. Aim for at least 30 before
   launch. Good candidates: Star Wars, Harry Potter, Shrek, Mission: Impossible, Rocky, Alien.
   Most will need their films and cast added to the database.
7. **Put it online.** It's a static site, so GitHub Pages, Netlify or itch.io all work.
   Upload the `sql-daily` folder (you don't need `node_modules`).
8. **Schedule features by date.** Adding a feature in the middle of the list shifts which
   feature lands on which day. Before launch, consider giving each feature a fixed date.
9. **Optional extras:** sound (a projector whir, a ding on correct), a leaderboard (needs a
   small server), a practice mode with past features, and syntax highlighting in the editor.
