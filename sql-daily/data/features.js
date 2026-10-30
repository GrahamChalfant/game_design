// The daily features. Each day is one feature: a movie-themed trilogy of questions
// (Part I is easy, Part II is medium, Part III is hard), played in order, one minute each.
//
// A feature needs:
//   id         Unique, never changes once players have seen it (used for saved progress).
//   theme      Shown on the start screen, e.g. 'The Lord of the Rings'.
//   tagline    One short line under the theme.
//   dataset    (optional) Which database from data/datasets.js to use. Defaults to 'movies'.
//   questions  { easy, medium, hard }, each with:
//     title        Short name shown above the question.
//     prompt       What to do. Say exactly which columns to return, and the order if it matters.
//     columns      The column names the answer should have (shown to the player as a guide).
//     orderMatters true if the rows must come back in a specific order.
//     solution     A correct query. The player's result is compared to this query's result.
//     hints        One or more nudges, from gentle to more direct.
//     tests        (optional) accept: other correct queries; reject: common mistakes.
//
// Players get ONE MINUTE per question, so keep answers short to type. Hard questions should be
// hard to think through, not long to write.
//
// After editing, run the validator (see README.md).

import { TIER_ORDER } from '../js/config.js';

export const features = [
  {
    id: 'middle-earth',
    theme: 'The Lord of the Rings',
    tagline: 'One query to rule them all.',
    questions: {
      easy: {
        title: 'The Extended Edition',
        prompt: 'Which Middle-earth film has the longest runtime? Return its title and runtime.',
        columns: ['title', 'runtime'],
        orderMatters: false,
        solution: `SELECT title, runtime FROM films WHERE franchise = 'Middle-earth' ORDER BY runtime DESC LIMIT 1;`,
        hints: ['Sort by runtime from longest to shortest.', 'ORDER BY runtime DESC LIMIT 1 keeps only the top row.'],
        tests: {
          accept: [`SELECT title, MAX(runtime) FROM films WHERE franchise = 'Middle-earth'`],
          reject: [`SELECT title, runtime FROM films ORDER BY runtime DESC LIMIT 1`],
        },
      },
      medium: {
        title: 'The Lady of the Wood',
        prompt: 'List the title and year of every film Cate Blanchett appears in, oldest first.',
        columns: ['title', 'year'],
        orderMatters: true,
        solution: `
          SELECT f.title, f.year
          FROM films f JOIN roles r ON r.film_id = f.id
          WHERE r.actor = 'Cate Blanchett'
          ORDER BY f.year;`,
        hints: ['Actors are in the roles table. Join it to films on roles.film_id = films.id.', 'Then filter on actor and sort by year.'],
        tests: {
          accept: [`SELECT title, year FROM films WHERE id IN (SELECT film_id FROM roles WHERE actor = 'Cate Blanchett') ORDER BY year`],
          reject: [`SELECT f.title, f.year FROM films f JOIN roles r ON r.film_id = f.id WHERE r.character = 'Galadriel' ORDER BY f.year`],
        },
      },
      hard: {
        title: 'There and Back Again',
        prompt:
          'Which actors appear in more than one franchise? Return the actor and the number of different franchises they appear in, sorted by actor.',
        columns: ['actor', 'franchises'],
        orderMatters: true,
        solution: `
          SELECT r.actor, COUNT(DISTINCT f.franchise) AS franchises
          FROM roles r JOIN films f ON f.id = r.film_id
          GROUP BY r.actor
          HAVING franchises > 1
          ORDER BY r.actor;`,
        hints: [
          'Join roles to films so you know each role\'s franchise, then GROUP BY actor.',
          'COUNT(DISTINCT franchise) counts franchises, not films. Filter groups with HAVING.',
        ],
        tests: {
          reject: [
            `SELECT r.actor, COUNT(f.franchise) AS n FROM roles r JOIN films f ON f.id = r.film_id
             GROUP BY r.actor HAVING n > 1 ORDER BY r.actor`,
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
        prompt: 'List the title and year of every film released in the 1980s (1980 to 1989), oldest first, then by title.',
        columns: ['title', 'year'],
        orderMatters: true,
        solution: `SELECT title, year FROM films WHERE year BETWEEN 1980 AND 1989 ORDER BY year, title;`,
        hints: ['BETWEEN 1980 AND 1989 includes both ends.', 'You can sort by two columns: ORDER BY year, title.'],
        tests: {
          accept: [`SELECT title, year FROM films WHERE year >= 1980 AND year < 1990 ORDER BY 2, 1`],
          reject: [`SELECT title, year FROM films WHERE year > 1980 AND year < 1989 ORDER BY year, title`],
        },
      },
      medium: {
        title: 'Decade by Decade',
        prompt: 'How many films came out in each decade? Return the decade (like 1980) and the number of films, sorted by decade.',
        columns: ['decade', 'films'],
        orderMatters: true,
        solution: `SELECT year / 10 * 10 AS decade, COUNT(*) AS films FROM films GROUP BY decade ORDER BY decade;`,
        hints: [
          'Dividing whole numbers drops the remainder: 1985 / 10 is 198.',
          'So year / 10 * 10 turns 1985 into 1980. GROUP BY that.',
        ],
        tests: {
          accept: [`SELECT year - year % 10 AS d, COUNT(*) FROM films GROUP BY d ORDER BY d`],
          reject: [`SELECT year, COUNT(*) FROM films GROUP BY year ORDER BY year`],
        },
      },
      hard: {
        title: 'The Gap Years',
        prompt:
          'For every film, show its title and how many years passed since the previous film in the same franchise (NULL for the first film). Sort by franchise, then part.',
        columns: ['title', 'gap'],
        orderMatters: true,
        solution: `
          SELECT title, year - LAG(year) OVER (PARTITION BY franchise ORDER BY part) AS gap
          FROM films
          ORDER BY franchise, part;`,
        hints: [
          'LAG(year) gives the year from the previous row.',
          'Make "previous" mean previous in the same franchise: OVER (PARTITION BY franchise ORDER BY part).',
        ],
        tests: {
          reject: [`SELECT title, year - LAG(year) OVER (ORDER BY year) AS gap FROM films ORDER BY franchise, part`],
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
        title: 'Toy Box Inventory',
        prompt: 'How many films does each franchise have? Return the franchise and the number of films, most films first, then by franchise name.',
        columns: ['franchise', 'films'],
        orderMatters: true,
        solution: `SELECT franchise, COUNT(*) AS films FROM films GROUP BY franchise ORDER BY films DESC, franchise;`,
        hints: ['GROUP BY franchise gives one row per franchise.', 'ORDER BY films DESC, franchise sorts by count, then name.'],
        tests: { reject: [`SELECT franchise, COUNT(*) AS films FROM films GROUP BY franchise ORDER BY films DESC`] },
      },
      medium: {
        title: 'Short and Sweet',
        prompt: 'Show each franchise and its average runtime, rounded to the nearest minute. Shortest average first.',
        columns: ['franchise', 'avg_runtime'],
        orderMatters: true,
        solution: `SELECT franchise, ROUND(AVG(runtime)) AS avg_runtime FROM films GROUP BY franchise ORDER BY avg_runtime;`,
        hints: ['AVG() works with GROUP BY.', 'ROUND(x) rounds to a whole number.'],
        tests: {
          reject: [`SELECT franchise, AVG(runtime) AS a FROM films GROUP BY franchise ORDER BY a`],
        },
      },
      hard: {
        title: 'The Sequel Strikes Back',
        prompt:
          'Which sequels made more money (gross) than the first film in their franchise? Return the sequel\'s title, sorted by title.',
        columns: ['title'],
        orderMatters: true,
        solution: `
          SELECT s.title
          FROM films s JOIN films o ON o.franchise = s.franchise AND o.part = 1
          WHERE s.gross > o.gross
          ORDER BY s.title;`,
        hints: [
          'Join films to itself: one copy for the sequel, one for the original (part = 1) of the same franchise.',
          'FROM films s JOIN films o ON o.franchise = s.franchise AND o.part = 1, then compare s.gross with o.gross.',
        ],
        tests: {
          accept: [
            `SELECT title FROM films f WHERE gross > (SELECT gross FROM films WHERE franchise = f.franchise AND part = 1) ORDER BY title`,
          ],
          reject: [`SELECT title FROM films WHERE part > 1 AND gross > (SELECT AVG(gross) FROM films) ORDER BY title`],
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
        prompt: 'List the title and Oscar wins of every film that won at least 4 Oscars. Most wins first, then by title.',
        columns: ['title', 'oscar_wins'],
        orderMatters: true,
        solution: `SELECT title, oscar_wins FROM films WHERE oscar_wins >= 4 ORDER BY oscar_wins DESC, title;`,
        hints: ['"At least 4" means >= 4.', 'Sort by two columns: ORDER BY oscar_wins DESC, title.'],
        tests: { reject: [`SELECT title, oscar_wins FROM films WHERE oscar_wins > 4 ORDER BY oscar_wins DESC, title`] },
      },
      medium: {
        title: 'Recast',
        prompt: 'Which characters were played by more than one actor? Return the character and the number of actors, sorted by character.',
        columns: ['character', 'actors'],
        orderMatters: true,
        solution: `
          SELECT character, COUNT(DISTINCT actor) AS actors
          FROM roles GROUP BY character HAVING actors > 1 ORDER BY character;`,
        hints: ['GROUP BY character, and count the different actors with COUNT(DISTINCT actor).', 'Filter the groups with HAVING.'],
        tests: {
          reject: [`SELECT character, COUNT(*) AS n FROM roles GROUP BY character HAVING n > 1 ORDER BY character`],
        },
      },
      hard: {
        title: 'The Family Favorite',
        prompt:
          'For each franchise, find the film with the most Oscar wins. Return the franchise, title and oscar_wins, sorted by franchise.',
        columns: ['franchise', 'title', 'oscar_wins'],
        orderMatters: true,
        solution: `
          SELECT franchise, title, oscar_wins FROM films f
          WHERE oscar_wins = (SELECT MAX(oscar_wins) FROM films WHERE franchise = f.franchise)
          ORDER BY franchise;`,
        hints: [
          'Compare each film with the best in its own franchise: a subquery with MAX(oscar_wins) WHERE franchise = f.franchise.',
          'In SQLite, SELECT franchise, title, MAX(oscar_wins) ... GROUP BY franchise also returns the matching title.',
        ],
        tests: {
          accept: [`SELECT franchise, title, MAX(oscar_wins) FROM films GROUP BY franchise ORDER BY franchise`],
          reject: [`SELECT franchise, title, oscar_wins FROM films ORDER BY oscar_wins DESC LIMIT 7`],
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
        title: 'Clever Directors',
        prompt:
          'For each director, show the director, how many films they made, and their total gross. Most films first, then by director.',
        columns: ['director', 'films', 'total_gross'],
        orderMatters: true,
        solution: `
          SELECT director, COUNT(*) AS films, SUM(gross) AS total_gross
          FROM films GROUP BY director ORDER BY films DESC, director;`,
        hints: ['GROUP BY director, then use both COUNT(*) and SUM(gross).', 'ORDER BY films DESC, director.'],
        tests: {
          reject: [`SELECT director, COUNT(*) AS films, AVG(gross) FROM films GROUP BY director ORDER BY films DESC, director`],
        },
      },
      hard: {
        title: 'Survival of the Fittest',
        prompt:
          'Which films made more than the average gross of their own franchise? Return the title, franchise and gross, highest gross first.',
        columns: ['title', 'franchise', 'gross'],
        orderMatters: true,
        solution: `
          SELECT title, franchise, gross FROM films f
          WHERE gross > (SELECT AVG(gross) FROM films WHERE franchise = f.franchise)
          ORDER BY gross DESC;`,
        hints: [
          'You need each franchise\'s own average, not the overall average.',
          'A correlated subquery does it: (SELECT AVG(gross) FROM films WHERE franchise = f.franchise).',
        ],
        tests: {
          reject: [`SELECT title, franchise, gross FROM films WHERE gross > (SELECT AVG(gross) FROM films) ORDER BY gross DESC`],
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
        prompt: 'Which actors appear in at least 5 films? Return the actor and their number of films, most first, then by actor.',
        columns: ['actor', 'films'],
        orderMatters: true,
        solution: `
          SELECT actor, COUNT(*) AS films FROM roles
          GROUP BY actor HAVING films >= 5 ORDER BY films DESC, actor;`,
        hints: ['Each row in roles is one actor in one film. GROUP BY actor and COUNT.', 'Use HAVING to keep only 5 or more.'],
        tests: {
          reject: [`SELECT actor, COUNT(*) AS films FROM roles GROUP BY actor HAVING films > 5 ORDER BY films DESC, actor`],
        },
      },
      hard: {
        title: 'Mr. Anderson, Meet Galadriel',
        prompt:
          'Hugo Weaving and Cate Blanchett have shared the screen. List the title of every film they both appear in, oldest first.',
        columns: ['title'],
        orderMatters: true,
        solution: `
          SELECT f.title FROM films f
          JOIN roles a ON a.film_id = f.id AND a.actor = 'Hugo Weaving'
          JOIN roles b ON b.film_id = f.id AND b.actor = 'Cate Blanchett'
          ORDER BY f.year;`,
        hints: [
          'You need two different rows from roles for the same film. Join roles twice, with different aliases.',
          'Or find each actor\'s film_ids and keep the ones in both lists (IN, or INTERSECT).',
        ],
        tests: {
          accept: [
            `SELECT title FROM films WHERE id IN (SELECT film_id FROM roles WHERE actor = 'Hugo Weaving'
             INTERSECT SELECT film_id FROM roles WHERE actor = 'Cate Blanchett') ORDER BY year`,
          ],
          reject: [
            `SELECT DISTINCT f.title FROM films f JOIN roles r ON r.film_id = f.id
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
        title: 'Supporting Cast',
        prompt:
          'For each Indiana Jones film, show the title and the number of cast members listed in roles. Sort by year.',
        columns: ['title', 'cast_size'],
        orderMatters: true,
        solution: `
          SELECT f.title, COUNT(*) AS cast_size
          FROM films f JOIN roles r ON r.film_id = f.id
          WHERE f.franchise = 'Indiana Jones'
          GROUP BY f.id ORDER BY f.year;`,
        hints: ['Join films to roles, keep only Indiana Jones films.', 'GROUP BY the film, COUNT the roles, ORDER BY year.'],
        tests: {
          reject: [
            `SELECT f.title, COUNT(*) FROM films f JOIN roles r ON r.film_id = f.id GROUP BY f.id ORDER BY f.year`,
          ],
        },
      },
      hard: {
        title: 'X Marks the Running Total',
        prompt:
          'For each Indiana Jones film, show the title, its gross, and the franchise\'s running total gross up to and including that film. Sort by year.',
        columns: ['title', 'gross', 'running_total'],
        orderMatters: true,
        solution: `
          SELECT title, gross, SUM(gross) OVER (ORDER BY year) AS running_total
          FROM films WHERE franchise = 'Indiana Jones' ORDER BY year;`,
        hints: ['A window function can add up rows "so far".', 'SUM(gross) OVER (ORDER BY year).'],
        tests: {
          accept: [
            `SELECT title, gross, (SELECT SUM(gross) FROM films g WHERE g.franchise = f.franchise AND g.year <= f.year)
             FROM films f WHERE franchise = 'Indiana Jones' ORDER BY year`,
          ],
          reject: [`SELECT title, gross, SUM(gross) OVER () FROM films WHERE franchise = 'Indiana Jones' ORDER BY year`],
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
    dataset: feature.dataset ?? 'movies',
    feature: feature.id,
    ...feature.questions[tier],
  })),
);
