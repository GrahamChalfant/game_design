# SQL: The Sequel (Daily SQL Challenge)

A daily SQL game set in a pixel movie theater. Every day there is one film and three timed SQL
questions about it. The faster you answer, the more money the film makes. Your score is the
film's total box office.

| Act | Release window | Kind of question | Time | Most it can earn |
| --- | --- | --- | --- | --- |
| I | Opening weekend | Fix a broken query | 30 s | $100M |
| II | International release | One table, one query | 90 s | $300M |
| III | Streaming rights | One join or one window function | 180 s | $600M |

A perfect day is $1 billion. Reaching $900M earns the top verdict, "One in a Billion".

## Playing

```bash
python serve.py 8020
```

Then open http://localhost:8020. The game needs the local server; opening `index.html` directly
will not load the question bank.

- Click **Start the show**. After the 3-2-1 countdown the clock for Act I starts.
- Type a query and press **Run** (or Ctrl+Enter). You can run as often as you like until time runs out.
- Answers are judged by their result, not their text. Capitals do not matter, column names do not
  matter, and extra columns are forgiven. Row order only matters when the question asks for one.
- Progress is saved in the browser. Reloading mid-question does not stop the clock.
- Add `?day=7` to the address to play any screening as practice. Practice runs are not saved.

## How payouts work

Answer in the first 10% of the time limit and the act pays its maximum. After that the payout
falls steadily, down to 20% of the maximum for a correct answer at the last second. Running out
of time or walking out pays $0.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css` | The theater: marquee, curtains, countdown, question screen, end credits |
| `js/game.js` | Runs the show: the day's film, timer, payouts, saved progress. The tuning numbers (time limits, payouts, verdicts, milestones) are at the top |
| `js/engine.js` | Builds the film's tables in an in-browser SQLite database and checks answers |
| `data/films.json` | The question bank: one entry per film, each with its tables and three acts |
| `tools/validate.py` | Checks every question in the bank against real SQLite |
| `vendor/` | sql.js (SQLite compiled for the browser) |

## Adding a film

Add an entry to `data/films.json` with `id`, `title`, `blurb`, `tables` and exactly three `acts`.
Each act needs a `prompt`, a `solution`, `ordered` (does row order matter?) and a one-line
`lesson`. Act I also needs a broken `starter` query. Then run:

```bash
python tools/validate.py
```

Films are shown in the order they appear in the file, one per day, and the list repeats when it
runs out. There are 10 films today, so the cycle is 10 days. Screening #1 is 13 November 2026
(`EPOCH` in `js/game.js`).
