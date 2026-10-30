# SQL Daily

A daily SQL puzzle game that runs in the browser. Every day there are three questions,
easy, medium and hard, each with its own timer. Everyone gets the same questions on the same day.

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
| `?date=2026-11-05` | Play another day's puzzle |
| `?reset` | Clear your progress for that day so you can replay it |
| `?date=2026-11-05&reset` | Both |

## Scoring: how it adds up to 1,000

| | Correct | Speed bonus | Timer |
| --- | --- | --- | --- |
| Q1 Easy | 100 | up to +50 | 3:00 |
| Q2 Medium | 200 | up to +100 | 5:00 |
| Q3 Hard | 300 | up to +150 | 8:00 |
| All three correct | +100 | | |
| **Perfect day** | **600** | **+300** | **+100 = 1,000** |

The speed bonus is half the question's points if you answer instantly, and shrinks to 0
as the timer runs out. If the timer hits 0:00, the question is over and you see the solution.
Wrong submissions and hints are free. All of these numbers live in `js/config.js`.

## How it works

- **SQL engine.** The game runs [SQLite](https://sqlite.org/) inside the browser using
  [sql.js](https://sql.js.org/) (in `vendor/`). There's no server and no database to set up.
- **Checking answers.** Your query and the question's official solution both run against a
  fresh copy of the data. If the results match, you're right. So any query that produces the
  right answer counts, not just one exact wording. Column names don't matter; values, the number
  of columns and rows do. Row order only matters if the question asks for an order.
- **Error messages.** When a query fails, the game shows SQLite's error plus a plain-English
  tip, like *There's no table called "customer". Did you mean "customers"?* When a query runs
  but gives the wrong answer, it explains what's off: wrong number of rows or columns, right
  rows in the wrong order, a column that needs rounding, and so on. This is all in `js/checker.js`.
- **The daily rotation.** Each tier cycles through its questions in order, starting on
  `LAUNCH_DATE` in `js/config.js`. Your progress (including a running timer) is saved in the
  browser, so refreshing the page doesn't reset the clock.

## Adding questions (the question bank)

Questions live in `data/questions.js`, and the tables they query live in `data/datasets.js`.
To add a question, copy an existing one and change it:

```js
{
  id: 'cheap-products',                 // unique, never change it once it's live
  tier: 'easy',                         // 'easy', 'medium' or 'hard'
  dataset: 'shop',                      // a key from data/datasets.js
  title: 'Bargain Bin',
  prompt: 'Show the name and price of every product that costs less than $30, cheapest first.',
  columns: ['name', 'price'],           // shown to the player
  orderMatters: true,                   // true only if the prompt asks for an order
  solution: `SELECT name, price FROM products WHERE price < 30 ORDER BY price;`,
  hints: ['Use WHERE price < 30.', 'ORDER BY sorts from smallest to largest by default.'],
  tests: {
    accept: [ /* other correct queries that must pass */ ],
    reject: [ /* common mistakes that must fail */
      `SELECT name, price FROM products WHERE price < 30 ORDER BY price DESC`,
    ],
  },
},
```

Tips for good questions:

- Say exactly which columns to return, and the order if it matters.
- Make sure the data gives a single clear answer. If two rows tie for "the highest", either
  change the data or say how to break the tie.
- Add the mistakes you expect people to make to `tests.reject`. The validator then proves
  they're marked wrong.
- To add a new table, add it to the `shop` dataset in `data/datasets.js`, then run the
  validator to check existing questions still pass. Changing existing rows changes existing answers.

### Checking the question bank

After any change, run the validator. It runs every solution and every test query, and tells
you exactly what's wrong (a solution with a typo, a missing field, a `reject` query that
accidentally passes, and so on).

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
validate.html        Question bank checker, in the browser
js/config.js         Points, timers, launch date
js/game.js           Game screen: timers, editor, submitting, results
js/checker.js        Runs queries, compares results, writes the error messages
js/daily.js          Picks today's questions, saves progress and stats
js/validate.js       Question bank checks (shared by validate.html and npm run validate)
data/questions.js    The question bank
data/datasets.js     The tables and data the questions use
tools/validate-bank.js   npm run validate
vendor/              sql.js (SQLite compiled to run in the browser)
```

## Roadmap

What's done, and what's next:

1. ~~Pick an in-browser SQL engine~~ (sql.js / SQLite)
2. ~~Build a sample dataset~~ (a small shop: customers, products, orders, order items, employees)
3. ~~Answer checking with helpful error messages~~
4. ~~Game screen: three questions in order, per-question timers, scoring to 1,000~~
5. ~~Daily rotation and saved progress, streaks and stats~~
6. ~~Question bank format and validator~~ (18 questions to start: 6 per tier)
7. **Write more questions.** With 6 per tier, questions start repeating after 6 days. Aim for
   at least 30 per tier before launch. More datasets (a school, a music app, a sports league)
   keep it fresh.
8. **Put it online.** It's a static site, so GitHub Pages, Netlify or itch.io all work.
   Upload the `sql-daily` folder (you don't need `node_modules`).
9. **Stop the order shuffling.** Adding questions to a tier changes which question lands on
   which day, including today's. Players mid-question keep theirs, but before launch, consider
   giving each question a fixed `date` instead.
10. **Optional extras:** a leaderboard (needs a small server), a practice mode with past
    puzzles, and syntax highlighting in the editor.
