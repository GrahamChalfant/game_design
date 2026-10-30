// The daily features. Each day is one feature: a movie-themed trilogy of questions, played in order.
//
//   Part I   easy    1 minute   1–2 pieces: WHERE, GROUP BY with COUNT/SUM/AVG, ORDER BY with LIMIT,
//                               DISTINCT, simple CASE WHEN, BETWEEN/IN/LIKE, basic string/date functions.
//                               No trick questions (no NULL or join traps).
//   Part II  medium  2 minutes  2–3 pieces: a join plus aggregation, HAVING, a subquery in WHERE, COALESCE,
//                               strftime() grouping, conditional aggregation SUM(CASE WHEN ...), or ONE basic
//                               window function (ROW_NUMBER/RANK). Gotchas are OK if the prompt warns about them.
//   Part III hard    3 minutes  3–4 pieces: LAG/LEAD, running totals, a CTE that filters a window result
//                               (top-N per group), self-joins, NOT EXISTS anti-joins, frame clauses
//                               (ROWS BETWEEN ...), percent of total with x / SUM(x) OVER ().
//
// Hard should be hard because of the SQL, never because the wording is unclear. Always spell out the
// output columns and the sort order. The game uses SQLite, so dates use strftime(), not DATE_TRUNC.
//
// A feature needs:
//   id         Unique, never changes once players have seen it (used for saved progress).
//   theme      Shown on the start screen, e.g. 'The Lord of the Rings'.
//   tagline    One short line under the theme.
//   questions  { easy, medium, hard }, each with:
//     title        Short name shown above the question.
//     prompt       What to do. Say exactly which columns to return, and the order if it matters.
//     columns      The column names the answer should have (shown to the player as a guide).
//     orderMatters true if the rows must come back in a specific order.
//     solution     A correct query. The player's result is compared to this query's result.
//     hints        One or more nudges, from gentle to more direct.
//     tests        (optional) accept: other correct queries; reject: common mistakes.
//
// After editing, run the validator (see README.md). It also warns when a question looks like it's
// in the wrong tier.

import { TIER_ORDER } from '../js/config.js';

export const features = [
  {
    id: 'middle-earth',
    theme: 'The Lord of the Rings',
    tagline: 'One query to rule them all.',
    questions: {
      easy: {
        title: 'The Extended Editions',
        prompt: 'List the title and runtime of every Middle-earth film longer than 170 minutes, longest first.',
        columns: ['title', 'runtime'],
        orderMatters: true,
        solution: `SELECT title, runtime FROM films WHERE franchise = 'Middle-earth' AND runtime > 170 ORDER BY runtime DESC;`,
        hints: ['Combine two conditions in WHERE with AND.', 'Sort with ORDER BY runtime DESC.'],
        tests: {
          reject: [
            `SELECT title, runtime FROM films WHERE runtime > 170 ORDER BY runtime DESC`,
            `SELECT title, runtime FROM films WHERE franchise = 'Middle-earth' AND runtime > 170 ORDER BY runtime`,
          ],
        },
      },
      medium: {
        title: 'The Fellowship of the Seats',
        prompt:
          'For each Middle-earth film shown at The Sequel this week, return its title and the total tickets sold. Most tickets first.',
        columns: ['title', 'tickets'],
        orderMatters: true,
        solution: `
          SELECT f.title, SUM(s.tickets_sold) AS tickets
          FROM films f JOIN screenings s ON s.film_id = f.id
          WHERE f.franchise = 'Middle-earth'
          GROUP BY f.id
          ORDER BY tickets DESC;`,
        hints: [
          'Join screenings to films on screenings.film_id = films.id.',
          'GROUP BY the film and SUM(tickets_sold).',
        ],
        tests: {
          reject: [
            `SELECT f.title, COUNT(*) AS tickets FROM films f JOIN screenings s ON s.film_id = f.id
             WHERE f.franchise = 'Middle-earth' GROUP BY f.id ORDER BY tickets DESC`,
          ],
        },
      },
      hard: {
        title: 'The Return of the King',
        prompt: 'Which screening sold the most tickets each day? Return show_date, title and tickets_sold, sorted by date.',
        columns: ['show_date', 'title', 'tickets_sold'],
        orderMatters: true,
        solution: `
          WITH r AS (
            SELECT show_date, title, tickets_sold,
                   RANK() OVER (PARTITION BY show_date ORDER BY tickets_sold DESC) AS rnk
            FROM screenings JOIN films ON films.id = film_id
          )
          SELECT show_date, title, tickets_sold FROM r WHERE rnk = 1 ORDER BY show_date;`,
        hints: [
          'Rank each day\'s screenings: RANK() OVER (PARTITION BY show_date ORDER BY tickets_sold DESC).',
          'You can\'t filter on a window function in WHERE. Put it in a CTE (WITH ranked AS (...)), then keep rank 1.',
        ],
        tests: {
          accept: [
            `SELECT s.show_date, f.title, MAX(s.tickets_sold) FROM screenings s JOIN films f ON f.id = s.film_id
             GROUP BY s.show_date ORDER BY s.show_date`,
          ],
          reject: [
            `SELECT s.show_date, f.title, s.tickets_sold FROM screenings s JOIN films f ON f.id = s.film_id
             ORDER BY s.tickets_sold DESC LIMIT 7`,
          ],
        },
      },
    },
  },
  {
    id: 'back-to-the-future',
    theme: 'Back to the Future',
    tagline: 'Today\'s queries travel through time.',
    questions: {
      easy: {
        title: 'Totally Eighties',
        prompt: 'List the title and year of every film released from 1980 to 1989, oldest first, then by title.',
        columns: ['title', 'year'],
        orderMatters: true,
        solution: `SELECT title, year FROM films WHERE year BETWEEN 1980 AND 1989 ORDER BY year, title;`,
        hints: ['BETWEEN 1980 AND 1989 includes both ends.', 'Sort by two columns: ORDER BY year, title.'],
        tests: {
          accept: [`SELECT title, year FROM films WHERE year >= 1980 AND year < 1990 ORDER BY 2, 1`],
          reject: [`SELECT title, year FROM films WHERE year > 1980 AND year < 1989 ORDER BY year, title`],
        },
      },
      medium: {
        title: 'Matinee or Late Show',
        prompt:
          'For each show_date, return tickets sold at matinees (show_time before \'17:00\') and evening shows (\'17:00\' or later). Columns: show_date, matinee, evening. Sort by date.',
        columns: ['show_date', 'matinee', 'evening'],
        orderMatters: true,
        solution: `
          SELECT show_date,
                 SUM(CASE WHEN show_time < '17:00' THEN tickets_sold END) AS matinee,
                 SUM(CASE WHEN show_time >= '17:00' THEN tickets_sold END) AS evening
          FROM screenings
          GROUP BY show_date
          ORDER BY show_date;`,
        hints: [
          'Times are text like \'13:00\', so you can compare them: show_time < \'17:00\'.',
          'Add up only some rows with SUM(CASE WHEN ... THEN tickets_sold ELSE 0 END).',
        ],
        tests: {
          accept: [
            `SELECT show_date, SUM(tickets_sold) FILTER (WHERE show_time < '17:00'),
                    SUM(tickets_sold) FILTER (WHERE show_time >= '17:00')
             FROM screenings GROUP BY 1 ORDER BY 1`,
          ],
          reject: [
            `SELECT show_date, COUNT(CASE WHEN show_time < '17:00' THEN 1 END), COUNT(CASE WHEN show_time >= '17:00' THEN 1 END)
             FROM screenings GROUP BY show_date ORDER BY show_date`,
          ],
        },
      },
      hard: {
        title: 'Back in Time',
        prompt:
          'For each show_date, return the day\'s revenue (tickets_sold × ticket_price) and the change from the day before (NULL for the first day). Columns: show_date, revenue, change. Sort by date.',
        columns: ['show_date', 'revenue', 'change'],
        orderMatters: true,
        solution: `
          WITH daily AS (
            SELECT show_date, SUM(tickets_sold * ticket_price) AS revenue
            FROM screenings GROUP BY show_date
          )
          SELECT show_date, revenue, revenue - LAG(revenue) OVER (ORDER BY show_date) AS change
          FROM daily
          ORDER BY show_date;`,
        hints: [
          'First get each day\'s revenue with GROUP BY show_date (a CTE keeps it tidy).',
          'LAG(revenue) OVER (ORDER BY show_date) is the previous day\'s revenue. Subtract it.',
        ],
        tests: {
          reject: [
            `SELECT show_date, SUM(tickets_sold * ticket_price), LEAD(SUM(tickets_sold * ticket_price)) OVER (ORDER BY show_date)
               - SUM(tickets_sold * ticket_price) FROM screenings GROUP BY show_date ORDER BY show_date`,
          ],
        },
      },
    },
  },
  {
    id: 'toy-story',
    theme: 'Toy Story',
    tagline: 'Every toy has its day.',
    questions: {
      easy: {
        title: 'Short or Feature',
        prompt:
          'For each Toy Story film, return title and length: \'Short\' if runtime is under 95, otherwise \'Feature\'. Sort by year.',
        columns: ['title', 'length'],
        orderMatters: true,
        solution: `
          SELECT title, CASE WHEN runtime < 95 THEN 'Short' ELSE 'Feature' END AS length
          FROM films WHERE franchise = 'Toy Story' ORDER BY year;`,
        hints: ['CASE WHEN condition THEN \'a\' ELSE \'b\' END makes a new column.', 'Filter with WHERE franchise = \'Toy Story\'.'],
        tests: {
          accept: [`SELECT title, IIF(runtime < 95, 'Short', 'Feature') FROM films WHERE franchise = 'Toy Story' ORDER BY year`],
          reject: [
            `SELECT title, CASE WHEN runtime <= 92 THEN 'short' ELSE 'feature' END FROM films WHERE franchise = 'Toy Story' ORDER BY year`,
          ],
        },
      },
      medium: {
        title: 'Full House',
        prompt:
          'For each franchise shown this week, return the franchise and its average tickets sold per screening, rounded to 1 decimal place. Highest average first, then by franchise.',
        columns: ['franchise', 'avg_tickets'],
        orderMatters: true,
        solution: `
          SELECT f.franchise, ROUND(AVG(s.tickets_sold), 1) AS avg_tickets
          FROM screenings s JOIN films f ON f.id = s.film_id
          GROUP BY f.franchise
          ORDER BY avg_tickets DESC, f.franchise;`,
        hints: ['Join screenings to films to get each screening\'s franchise.', 'GROUP BY franchise, then ROUND(AVG(tickets_sold), 1).'],
        tests: {
          reject: [
            `SELECT f.franchise, ROUND(AVG(s.tickets_sold), 1) AS a FROM screenings s JOIN films f ON f.id = s.film_id
             GROUP BY f.franchise ORDER BY a DESC, f.franchise DESC`,
          ],
        },
      },
      hard: {
        title: 'The Sequel Strikes Back',
        prompt:
          'For each franchise, how many sequels made more (gross) than its first film (part = 1)? Return franchise and sequels, for franchises with at least one. Sort by franchise.',
        columns: ['franchise', 'sequels'],
        orderMatters: true,
        solution: `
          SELECT s.franchise, COUNT(*) AS sequels
          FROM films s JOIN films o ON o.franchise = s.franchise AND o.part = 1
          WHERE s.gross > o.gross
          GROUP BY s.franchise
          ORDER BY s.franchise;`,
        hints: [
          'Join films to itself: one copy for the sequel (s), one for the original (o) of the same franchise, with o.part = 1.',
          'Keep rows where s.gross > o.gross, then GROUP BY franchise and COUNT.',
        ],
        tests: {
          accept: [
            `SELECT franchise, COUNT(*) FROM films f
             WHERE gross > (SELECT gross FROM films WHERE franchise = f.franchise AND part = 1)
             GROUP BY franchise ORDER BY franchise`,
          ],
          reject: [
            `SELECT s.franchise, COUNT(*) FROM films s JOIN films o ON o.franchise = s.franchise
             WHERE s.gross > o.gross GROUP BY s.franchise ORDER BY s.franchise`,
          ],
        },
      },
    },
  },
  {
    id: 'the-godfather',
    theme: 'The Godfather',
    tagline: 'A query you can\'t refuse.',
    questions: {
      easy: {
        title: 'And the Oscar Goes To',
        prompt: 'List the title and oscar_wins of every film that won at least 4 Oscars. Most wins first, then by title.',
        columns: ['title', 'oscar_wins'],
        orderMatters: true,
        solution: `SELECT title, oscar_wins FROM films WHERE oscar_wins >= 4 ORDER BY oscar_wins DESC, title;`,
        hints: ['"At least 4" means >= 4.', 'Sort by two columns: ORDER BY oscar_wins DESC, title.'],
        tests: { reject: [`SELECT title, oscar_wins FROM films WHERE oscar_wins > 4 ORDER BY oscar_wins DESC, title`] },
      },
      medium: {
        title: 'Leave the Gun, Take the Zeros',
        prompt:
          'Return each Godfather film\'s title and total tickets sold this week, sorted by part. Careful: a film with no screenings should show 0, not NULL or be missing.',
        columns: ['title', 'tickets'],
        orderMatters: true,
        solution: `
          SELECT f.title, COALESCE(SUM(s.tickets_sold), 0) AS tickets
          FROM films f LEFT JOIN screenings s ON s.film_id = f.id
          WHERE f.franchise = 'The Godfather'
          GROUP BY f.id
          ORDER BY f.part;`,
        hints: [
          'An INNER JOIN drops films that have no screenings. A LEFT JOIN keeps them.',
          'SUM over no rows is NULL. COALESCE(SUM(...), 0) turns it into 0.',
        ],
        tests: {
          accept: [
            `SELECT title, (SELECT IFNULL(SUM(tickets_sold), 0) FROM screenings WHERE film_id = films.id)
             FROM films WHERE franchise = 'The Godfather' ORDER BY part`,
          ],
          reject: [
            `SELECT f.title, SUM(s.tickets_sold) FROM films f JOIN screenings s ON s.film_id = f.id
             WHERE f.franchise = 'The Godfather' GROUP BY f.id ORDER BY f.part`,
            `SELECT f.title, SUM(s.tickets_sold) FROM films f LEFT JOIN screenings s ON s.film_id = f.id
             WHERE f.franchise = 'The Godfather' GROUP BY f.id ORDER BY f.part`,
          ],
        },
      },
      hard: {
        title: 'The Family Business',
        prompt:
          'What share of the week\'s ticket revenue did each franchise earn? Return franchise, revenue (tickets_sold × ticket_price) and pct (its percentage of all revenue, rounded to 1 decimal place). Highest revenue first.',
        columns: ['franchise', 'revenue', 'pct'],
        orderMatters: true,
        solution: `
          WITH r AS (
            SELECT franchise, SUM(tickets_sold * ticket_price) AS revenue
            FROM screenings JOIN films ON films.id = film_id
            GROUP BY franchise
          )
          SELECT franchise, revenue, ROUND(100.0 * revenue / SUM(revenue) OVER (), 1) AS pct
          FROM r ORDER BY revenue DESC;`,
        hints: [
          'Get revenue per franchise with GROUP BY first (a CTE helps).',
          'SUM(revenue) OVER () is the grand total on every row. Divide by it, times 100.',
        ],
        tests: {
          accept: [
            `WITH r AS (SELECT f.franchise, SUM(s.tickets_sold * s.ticket_price) AS rev
                        FROM screenings s JOIN films f ON f.id = s.film_id GROUP BY f.franchise)
             SELECT franchise, rev, ROUND(rev * 100 / (SELECT SUM(rev) FROM r), 1) FROM r ORDER BY rev DESC`,
          ],
          reject: [
            `WITH r AS (SELECT f.franchise, SUM(s.tickets_sold * s.ticket_price) AS rev
                        FROM screenings s JOIN films f ON f.id = s.film_id GROUP BY f.franchise)
             SELECT franchise, rev, ROUND(rev / SUM(rev) OVER (), 1) FROM r ORDER BY rev DESC`,
          ],
        },
      },
    },
  },
  {
    id: 'jurassic-park',
    theme: 'Jurassic Park',
    tagline: 'Life, uh, finds a JOIN.',
    questions: {
      easy: {
        title: 'Spared No Expense',
        prompt: 'List the title and year of every film directed by Steven Spielberg, oldest first.',
        columns: ['title', 'year'],
        orderMatters: true,
        solution: `SELECT title, year FROM films WHERE director = 'Steven Spielberg' ORDER BY year;`,
        hints: ['Filter with WHERE director = ...', 'Text goes in single quotes, spelled exactly as in the table.'],
        tests: { reject: [`SELECT title, year FROM films WHERE franchise = 'Jurassic Park' ORDER BY year`] },
      },
      medium: {
        title: 'Paddock Report',
        prompt: 'For each screen, return its name, the number of screenings it showed and the total tickets it sold. Sort by name.',
        columns: ['name', 'screenings', 'tickets'],
        orderMatters: true,
        solution: `
          SELECT sc.name, COUNT(*) AS screenings, SUM(s.tickets_sold) AS tickets
          FROM screens sc JOIN screenings s ON s.screen_id = sc.id
          GROUP BY sc.id
          ORDER BY sc.name;`,
        hints: ['Join screens to screenings on screenings.screen_id = screens.id.', 'GROUP BY the screen, then COUNT(*) and SUM(tickets_sold).'],
        tests: {
          reject: [
            `SELECT sc.name, COUNT(*), SUM(sc.seats) FROM screens sc JOIN screenings s ON s.screen_id = sc.id
             GROUP BY sc.id ORDER BY sc.name`,
          ],
        },
      },
      hard: {
        title: 'Life Finds a Moving Average',
        prompt:
          'For each show_date, return the total tickets sold that day and the average of daily tickets over that day and the 2 days before it, rounded to 1 decimal place. Columns: show_date, tickets, avg_3_day. Sort by date.',
        columns: ['show_date', 'tickets', 'avg_3_day'],
        orderMatters: true,
        solution: `
          WITH daily AS (
            SELECT show_date, SUM(tickets_sold) AS tickets FROM screenings GROUP BY show_date
          )
          SELECT show_date, tickets,
                 ROUND(AVG(tickets) OVER (ORDER BY show_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS avg_3_day
          FROM daily
          ORDER BY show_date;`,
        hints: [
          'Get tickets per day first (GROUP BY show_date, in a CTE).',
          'A frame clause limits the window: AVG(tickets) OVER (ORDER BY show_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW).',
        ],
        tests: {
          reject: [
            `WITH d AS (SELECT show_date, SUM(tickets_sold) AS t FROM screenings GROUP BY show_date)
             SELECT show_date, t, ROUND(AVG(t) OVER (ORDER BY show_date), 1) FROM d ORDER BY show_date`,
          ],
        },
      },
    },
  },
  {
    id: 'the-matrix',
    theme: 'The Matrix',
    tagline: 'There is no spoon. There is only SELECT.',
    questions: {
      easy: {
        title: 'Red Pill, Long Pill',
        prompt: 'List the title and runtime of every film in The Matrix franchise, longest first.',
        columns: ['title', 'runtime'],
        orderMatters: true,
        solution: `SELECT title, runtime FROM films WHERE franchise = 'The Matrix' ORDER BY runtime DESC;`,
        hints: ['Filter on the franchise column.', 'DESC sorts from largest to smallest.'],
        tests: { reject: [`SELECT title, runtime FROM films WHERE franchise = 'The Matrix' ORDER BY runtime`] },
      },
      medium: {
        title: 'Agents Everywhere',
        prompt: 'Which actors appear in at least 5 films? Return actor and films (their number of films), most films first, then by actor.',
        columns: ['actor', 'films'],
        orderMatters: true,
        solution: `
          SELECT actor, COUNT(*) AS films FROM roles
          GROUP BY actor HAVING COUNT(*) >= 5
          ORDER BY films DESC, actor;`,
        hints: ['Each row in roles is one actor in one film. GROUP BY actor and COUNT.', 'Filter groups with HAVING, not WHERE.'],
        tests: {
          reject: [`SELECT actor, COUNT(*) AS films FROM roles GROUP BY actor HAVING films > 5 ORDER BY films DESC, actor`],
        },
      },
      hard: {
        title: 'Mr. Anderson, Meet Galadriel',
        prompt:
          'Hugo Weaving and Cate Blanchett have shared the screen. List the title and year of every film they both appear in, oldest first.',
        columns: ['title', 'year'],
        orderMatters: true,
        solution: `
          SELECT f.title, f.year FROM films f
          JOIN roles a ON a.film_id = f.id AND a.actor = 'Hugo Weaving'
          JOIN roles b ON b.film_id = f.id AND b.actor = 'Cate Blanchett'
          ORDER BY f.year;`,
        hints: [
          'You need two different rows from roles for the same film. Join roles twice, with different aliases.',
          'Or find each actor\'s film_ids and keep the ones in both lists (INTERSECT).',
        ],
        tests: {
          accept: [
            `SELECT title, year FROM films WHERE id IN (SELECT film_id FROM roles WHERE actor = 'Hugo Weaving'
             INTERSECT SELECT film_id FROM roles WHERE actor = 'Cate Blanchett') ORDER BY year`,
          ],
          reject: [
            `SELECT DISTINCT f.title, f.year FROM films f JOIN roles r ON r.film_id = f.id
             WHERE r.actor IN ('Hugo Weaving', 'Cate Blanchett') ORDER BY f.year`,
          ],
        },
      },
    },
  },
  {
    id: 'indiana-jones',
    theme: 'Indiana Jones',
    tagline: 'Today\'s queries go digging for treasure.',
    questions: {
      easy: {
        title: 'Fortune and Glory',
        prompt: 'How many films is Harrison Ford in? Return a single number in a column named films.',
        columns: ['films'],
        orderMatters: false,
        solution: `SELECT COUNT(*) AS films FROM roles WHERE actor = 'Harrison Ford';`,
        hints: ['Each row in roles is one actor in one film.', 'COUNT(*) with a WHERE filter.'],
        tests: { reject: [`SELECT COUNT(*) FROM films WHERE franchise = 'Indiana Jones' AND year < 2020`] },
      },
      medium: {
        title: 'Ranking the Relics',
        prompt:
          'Rank the Indiana Jones films by gross, with the highest gross ranked 1. Return title, gross and gross_rank, highest gross first.',
        columns: ['title', 'gross', 'gross_rank'],
        orderMatters: true,
        solution: `
          SELECT title, gross, RANK() OVER (ORDER BY gross DESC) AS gross_rank
          FROM films WHERE franchise = 'Indiana Jones'
          ORDER BY gross DESC;`,
        hints: ['RANK() OVER (ORDER BY gross DESC) numbers the rows from highest to lowest.', 'Filter to Indiana Jones films with WHERE.'],
        tests: {
          accept: [`SELECT title, gross, ROW_NUMBER() OVER (ORDER BY gross DESC) FROM films WHERE franchise = 'Indiana Jones' ORDER BY 2 DESC`],
          reject: [`SELECT title, gross, RANK() OVER (ORDER BY gross) FROM films WHERE franchise = 'Indiana Jones' ORDER BY gross DESC`],
        },
      },
      hard: {
        title: 'Raiders of the Lost Reels',
        prompt:
          'Some films weren\'t shown at The Sequel this week. For each franchise with at least one such film, return franchise and missing (how many of its films had no screenings). Sort by franchise.',
        columns: ['franchise', 'missing'],
        orderMatters: true,
        solution: `
          SELECT franchise, COUNT(*) AS missing
          FROM films f
          WHERE NOT EXISTS (SELECT 1 FROM screenings s WHERE s.film_id = f.id)
          GROUP BY franchise
          ORDER BY franchise;`,
        hints: [
          'Find films with no matching screening: WHERE NOT EXISTS (SELECT 1 FROM screenings WHERE film_id = f.id).',
          'Then GROUP BY franchise and COUNT.',
        ],
        tests: {
          accept: [
            `SELECT f.franchise, COUNT(*) FROM films f LEFT JOIN screenings s ON s.film_id = f.id
             WHERE s.id IS NULL GROUP BY f.franchise ORDER BY f.franchise`,
            `SELECT franchise, COUNT(*) FROM films WHERE id NOT IN (SELECT film_id FROM screenings) GROUP BY 1 ORDER BY 1`,
          ],
          reject: [
            `SELECT f.franchise, COUNT(*) FROM films f JOIN screenings s ON s.film_id = f.id
             GROUP BY f.franchise ORDER BY f.franchise`,
          ],
        },
      },
    },
  },
];

// Every question as a flat list, with its tier, dataset and a stable id like 'middle-earth/easy'.
export const questions = features.flatMap((feature) =>
  TIER_ORDER.filter((tier) => feature.questions?.[tier]).map((tier) => ({
    id: `${feature.id}/${tier}`,
    tier,
    dataset: 'movies', // every question uses the same four tables
    feature: feature.id,
    ...feature.questions[tier],
  })),
);
