# SQL: The Sequel (Daily SQL Challenge)

A daily SQL game set in a pixel movie theater. Every day there is one film and three timed SQL
questions about it. The faster you answer, the more money the film makes. Your score is the
film's total box office.

| Act | Release window | Kind of question | Time | Most it can earn |
| --- | --- | --- | --- | --- |
| I | Premiere night | Fix a broken query | 45 s | $100M |
| II | Opening weekend | One table, one query | 90 s | $300M |
| III | Worldwide release | One join or one window function | 180 s | $600M |

A perfect day is $1 billion. The final total earns a verdict in box-office language:

| Total | Verdict |
| --- | --- |
| $0 | Box office bomb |
| under $150M | Flop |
| $150M+ | Underperformer |
| $300M+ | Sleeper hit |
| $450M+ | Hit |
| $650M+ | Smash hit |
| $800M+ | Blockbuster |

## Playing

Online: https://grahamchalfant.github.io/game_design/ (published automatically from `main` by
`.github/workflows/deploy-sql-sequel.yml`).

On your own machine:

```bash
python serve.py 8020
```

Then open http://localhost:8020. The game needs the local server; opening `index.html` directly
will not load the question bank.

- The start screen shows the day's tables. Read them for as long as you like; nothing is timed yet.
- Click **Start the show**. After the 3-2-1 countdown the clock for Act I starts.
- Type a query and press **Run** (or Ctrl+Enter). You can run as often as you like until time runs out.
- Answers are judged by their result, not their text. Capitals do not matter, column names do not
  matter, and extra columns are forgiven. Row order only matters when the question asks for one.
- Progress is saved in the browser. Reloading mid-question does not stop the clock.
- Add `?day=7` to the address to play any screening as practice. Practice runs are not saved.

The seats along the bottom of the window fill with an audience as the film earns. The house is
full at $800M. The audience also cheers each time an act pays out, and gets louder with every
milestone on the money bar the film has passed ($50M, $150M, $250M and so on up to $1B). Run out
of time or walk out and the audience boos instead. While a question is on screen there is quiet
background life at random moments: someone munches popcorn, or, less often, someone's face lights
up from their phone and they get shushed.

Finish with a Hit or better ($450M+) and spotlights sweep up from the bottom corners of the
window; a Blockbuster gets four of them.

## How payouts work

Answer in the first 10% of the time limit and the act pays its maximum. After that the payout
falls steadily, down to 20% of the maximum for a correct answer at the last second. Running out
of time or walking out pays $0.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css` | The theater: marquee, curtains, countdown, question screen, end credits |
| `js/game.js` | Runs the show: the day's film, timer, payouts, saved progress. The tuning numbers (time limits, payouts, verdicts, milestones) are at the top |
| `js/sound.js` | Plays the audience's cheers and boos. The loudness and length ranges are at the top |
| `sounds/` | The crowd recordings (public domain, from Freesound; sources in `sounds/README.md`) |
| `js/engine.js` | Builds the film's tables in an in-browser SQLite database and checks answers |
| `data/films.json` | The question bank: one entry per film, each with its tables and three acts |
| `tools/validate.py` | Checks every question in the bank against real SQLite |
| `vendor/` | sql.js (SQLite compiled for the browser) |

## Adding a film

The rules for what makes a good film and a good question for each act are in
[QUESTIONS.md](QUESTIONS.md).

Add an entry to `data/films.json` with `id`, `title`, `blurb`, `tables` and exactly three `acts`.
Each act needs a `prompt`, a `solution`, `ordered` (does row order matter?) and a one-line
`lesson`. Act I also needs a broken `starter` query. Then run:

```bash
python tools/validate.py
```

Films are shown in the order they appear in the file, one per day, and the list repeats when it
runs out. There are 20 films today, so the cycle is 20 days. Screening #1 is 13 November 2026
(`EPOCH` in `js/game.js`).
