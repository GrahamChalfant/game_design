# SQL: The Sequel

A daily SQL puzzle game that runs in the browser. Every day is a new **feature**: a movie-themed
trilogy of three SQL questions, played one at a time with one minute each.

- **Part I** is easy (100 points).
- **Part II** is medium (200 points).
- **Part III** is hard (300 points).

Everyone gets the same feature on the same day. Day 1 is *The Lord of the Rings*.

## Playing it locally

From inside the `sql-daily` folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Press **Ctrl+C** in the terminal to stop the server.

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
2. Part I appears, and its one-minute timer starts right away. Run your query as often as you
   like, and submit when you think it's right. Wrong submissions and hints are free.
3. When you get it right, give up, or run out of time, you see the solution and one button:
   **Roll Part II →**. Clicking it starts Part II's timer immediately. Part III works the same way.
4. After Part III, **Roll the credits** shows your score, a share button, your streak and stats.

The progress strip at the top shows where you are, but you can't jump between questions.
If you close the tab mid-question, the clock keeps running, and you pick up where you left off.

## Scoring: how it adds up to 1,000

| | Correct | Speed bonus | Timer |
| --- | --- | --- | --- |
| Part I (easy) | 100 | up to +50 | 1:00 |
| Part II (medium) | 200 | up to +100 | 1:00 |
| Part III (hard) | 300 | up to +150 | 1:00 |
| All three correct | +100 | | |
| **Perfect day** | **600** | **+300** | **+100 = 1,000** |

The speed bonus is half the question's points if you answer instantly, and shrinks to 0
as the timer runs out. All of these numbers live in `js/config.js`.

## How it works

- **SQL engine.** The game runs [SQLite](https://sqlite.org/) inside the browser using
  [sql.js](https://sql.js.org/) (in `vendor/`). There's no server and no database to set up.
- **The data.** One small movie database (`data/datasets.js`) with two tables. `films` has
  28 films from 7 franchises, with year, runtime, director, box office and Oscar wins. `roles`
  says which actor played which character in each film. Box office figures are approximate.
- **Checking answers.** Your query and the official solution both run against a fresh copy
  of the data. If the results match, you're right, so any query that gets the right answer
  counts. Column names don't matter; values, the number of columns and rows do. Row order only
  matters if the question asks for an order.
- **Error messages.** When a query fails, the game shows SQLite's error plus a plain-English
  tip, like *There's no table called "film". Did you mean "films"?* When a query runs but gives
  the wrong answer, it explains what's off: a misspelled name (*'Cate Blanchet' doesn't appear
  anywhere in the data. Did you mean 'Cate Blanchett'?*), wrong number of rows or columns,
  right rows in the wrong order, a value that needs rounding, and so on. This is all in `js/checker.js`.
- **The daily rotation.** Features play in the order they're listed in `data/features.js`,
  one per day, starting on `LAUNCH_DATE` in `js/config.js`, then repeat.

## Adding a feature

Features live in `data/features.js`. Copy an existing one and change it:

```js
{
  id: 'middle-earth',                   // unique, never change it once it's live
  theme: 'The Lord of the Rings',       // shown on the start screen
  tagline: 'One query to rule them all.',
  questions: {
    easy: {
      title: 'The Extended Edition',
      prompt: 'Which Middle-earth film has the longest runtime? Return its title and runtime.',
      columns: ['title', 'runtime'],    // shown to the player
      orderMatters: false,              // true only if the prompt asks for an order
      solution: `SELECT title, runtime FROM films WHERE franchise = 'Middle-earth' ORDER BY runtime DESC LIMIT 1;`,
      hints: ['Sort by runtime from longest to shortest.', 'ORDER BY runtime DESC LIMIT 1 keeps only the top row.'],
      tests: {
        accept: [ /* other correct queries that must pass */ ],
        reject: [ /* common mistakes that must fail */
          `SELECT title, runtime FROM films ORDER BY runtime DESC LIMIT 1`,
        ],
      },
    },
    medium: { ... },
    hard: { ... },
  },
},
```

Tips for good questions:

- **Keep them short to type.** Players have one minute. A good answer is under about 170
  characters. Hard questions should be hard to *think* through, not long to *write*.
- Say exactly which columns to return, and the order if it matters ("most first, then by title").
- Make sure the data gives one clear answer. If two films tie, either change the question or
  say how to break the tie.
- Add the mistakes you expect people to make to `tests.reject`. The validator then proves
  they're marked wrong.
- A feature's questions can use any franchise in the data, not just its own. To add a new
  franchise's films or cast, add rows to `data/datasets.js`, then run the validator to check
  existing answers didn't change.

### Checking your work

After any change, run the validator. It runs every solution and every test query, and tells
you exactly what's wrong: a solution with a typo, a missing field, a feature without a hard
question, a `reject` query that accidentally passes, and so on.

Without installing anything: start the server as above and open
http://localhost:8000/validate.html.

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
index.html           The game page
styles.css           Styles (light and dark mode)
validate.html        Feature checker, in the browser
js/config.js         Points, timers, launch date
js/game.js           Game screen: start screen, timers, editor, submitting, end credits
js/checker.js        Runs queries, compares results, writes the error messages
js/daily.js          Picks today's feature, saves progress and stats
js/validate.js       Feature checks (shared by validate.html and npm run validate)
data/features.js     The daily features and their questions
data/datasets.js     The movie database
tools/validate-bank.js   npm run validate
vendor/              sql.js (SQLite compiled to run in the browser)
```

## Roadmap

1. ~~In-browser SQL engine, answer checking and helpful error messages~~
2. ~~Movie theme: daily features, Part I / II / III, start screen with one Begin button~~
3. ~~One-minute timers, one question at a time, scoring to 1,000~~
4. ~~Daily rotation, saved progress, streaks and stats~~
5. ~~Feature format and validator~~ (7 features to start)
6. **Write more features.** With 7, the game repeats after a week. Aim for at least 30 before
   launch. Good candidates: Star Wars, Harry Potter, Shrek, Mission: Impossible, Rocky, Alien,
   Pixar, Marvel. Most will need their films and cast added to the database.
7. **Put it online.** It's a static site, so GitHub Pages, Netlify or itch.io all work.
   Upload the `sql-daily` folder (you don't need `node_modules`).
8. **Schedule features by date.** Adding a feature in the middle of the list shifts which
   feature lands on which day. Players mid-day keep theirs, but before launch, consider giving
   each feature a fixed date.
9. **Optional extras:** a leaderboard (needs a small server), a practice mode with past
   features, and syntax highlighting in the editor.
