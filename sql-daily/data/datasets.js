// The databases players query. Each dataset is plain SQL that builds and fills its tables.
// A fresh copy is created for every query, so players can't break it (even with DELETE or DROP).
//
// films and roles are about real movies. Box office figures are approximate worldwide totals in
// millions of US dollars, rounded, and include re-releases where they're commonly counted. They're here
// for the game, not as a reference.
//
// screens and screenings are made up: one week at The Sequel, the game's fictional cinema.
//
// Changing existing rows changes existing answers, so run the validator after any edit.

// Short notes shown next to columns in the table diagram under the editor.
export const columnNotes = {
  movies: {
    'films.part': '1 = first',
    'films.runtime': 'minutes',
    'films.gross': '$ millions',
    'screenings.show_date': "'YYYY-MM-DD'",
    'screenings.show_time': "'HH:MM'",
    'screenings.ticket_price': '$',
  },
};

export const datasets = {
  movies: `
    CREATE TABLE films (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      franchise  TEXT NOT NULL,
      part       INTEGER NOT NULL,  -- 1 for the first film in the franchise, 2 for the sequel, ...
      year       INTEGER NOT NULL,
      runtime    INTEGER NOT NULL,  -- minutes (theatrical cut)
      director   TEXT NOT NULL,
      gross      INTEGER NOT NULL,  -- worldwide box office, $ millions (approximate)
      oscar_wins INTEGER NOT NULL
    );
    INSERT INTO films VALUES
      (1,  'The Fellowship of the Ring',                'Middle-earth',       1, 2001, 178, 'Peter Jackson',          888,  4),
      (2,  'The Two Towers',                            'Middle-earth',       2, 2002, 179, 'Peter Jackson',          938,  2),
      (3,  'The Return of the King',                    'Middle-earth',       3, 2003, 201, 'Peter Jackson',          1138, 11),
      (4,  'The Hobbit: An Unexpected Journey',         'Middle-earth',       4, 2012, 169, 'Peter Jackson',          1017, 0),
      (5,  'The Hobbit: The Desolation of Smaug',       'Middle-earth',       5, 2013, 161, 'Peter Jackson',          959,  0),
      (6,  'The Hobbit: The Battle of the Five Armies', 'Middle-earth',       6, 2014, 144, 'Peter Jackson',          962,  0),
      (7,  'Back to the Future',                        'Back to the Future', 1, 1985, 116, 'Robert Zemeckis',        381,  1),
      (8,  'Back to the Future Part II',                'Back to the Future', 2, 1989, 108, 'Robert Zemeckis',        332,  0),
      (9,  'Back to the Future Part III',               'Back to the Future', 3, 1990, 118, 'Robert Zemeckis',        245,  0),
      (10, 'Toy Story',                                 'Toy Story',          1, 1995, 81,  'John Lasseter',          373,  0),
      (11, 'Toy Story 2',                               'Toy Story',          2, 1999, 92,  'John Lasseter',          497,  0),
      (12, 'Toy Story 3',                               'Toy Story',          3, 2010, 103, 'Lee Unkrich',            1067, 2),
      (13, 'Toy Story 4',                               'Toy Story',          4, 2019, 100, 'Josh Cooley',            1073, 1),
      (14, 'The Godfather',                             'The Godfather',      1, 1972, 175, 'Francis Ford Coppola',   250,  3),
      (15, 'The Godfather Part II',                     'The Godfather',      2, 1974, 202, 'Francis Ford Coppola',   93,   6),
      (16, 'The Godfather Part III',                    'The Godfather',      3, 1990, 162, 'Francis Ford Coppola',   137,  0),
      (17, 'Jurassic Park',                             'Jurassic Park',      1, 1993, 127, 'Steven Spielberg',       1029, 3),
      (18, 'The Lost World: Jurassic Park',             'Jurassic Park',      2, 1997, 129, 'Steven Spielberg',       619,  0),
      (19, 'Jurassic Park III',                         'Jurassic Park',      3, 2001, 92,  'Joe Johnston',           368,  0),
      (20, 'The Matrix',                                'The Matrix',         1, 1999, 136, 'The Wachowskis',         467,  4),
      (21, 'The Matrix Reloaded',                       'The Matrix',         2, 2003, 138, 'The Wachowskis',         741,  0),
      (22, 'The Matrix Revolutions',                    'The Matrix',         3, 2003, 129, 'The Wachowskis',         427,  0),
      (23, 'The Matrix Resurrections',                  'The Matrix',         4, 2021, 148, 'Lana Wachowski',         157,  0),
      (24, 'Raiders of the Lost Ark',                   'Indiana Jones',      1, 1981, 115, 'Steven Spielberg',       390,  4),
      (25, 'Indiana Jones and the Temple of Doom',      'Indiana Jones',      2, 1984, 118, 'Steven Spielberg',       333,  1),
      (26, 'Indiana Jones and the Last Crusade',        'Indiana Jones',      3, 1989, 127, 'Steven Spielberg',       474,  1),
      (27, 'Indiana Jones and the Kingdom of the Crystal Skull', 'Indiana Jones', 4, 2008, 122, 'Steven Spielberg', 791, 0),
      (28, 'Indiana Jones and the Dial of Destiny',     'Indiana Jones',      5, 2023, 154, 'James Mangold',          384,  0);

    CREATE TABLE roles (
      film_id   INTEGER NOT NULL REFERENCES films(id),
      actor     TEXT NOT NULL,
      character TEXT NOT NULL
    );
    INSERT INTO roles VALUES
      (1, 'Elijah Wood', 'Frodo Baggins'), (1, 'Ian McKellen', 'Gandalf'), (1, 'Viggo Mortensen', 'Aragorn'),
      (1, 'Sean Astin', 'Samwise Gamgee'), (1, 'Orlando Bloom', 'Legolas'), (1, 'John Rhys-Davies', 'Gimli'),
      (1, 'Cate Blanchett', 'Galadriel'), (1, 'Hugo Weaving', 'Elrond'), (1, 'Sean Bean', 'Boromir'),
      (1, 'Ian Holm', 'Bilbo Baggins'),
      (2, 'Elijah Wood', 'Frodo Baggins'), (2, 'Ian McKellen', 'Gandalf'), (2, 'Viggo Mortensen', 'Aragorn'),
      (2, 'Sean Astin', 'Samwise Gamgee'), (2, 'Orlando Bloom', 'Legolas'), (2, 'John Rhys-Davies', 'Gimli'),
      (2, 'Cate Blanchett', 'Galadriel'), (2, 'Hugo Weaving', 'Elrond'), (2, 'Andy Serkis', 'Gollum'),
      (3, 'Elijah Wood', 'Frodo Baggins'), (3, 'Ian McKellen', 'Gandalf'), (3, 'Viggo Mortensen', 'Aragorn'),
      (3, 'Sean Astin', 'Samwise Gamgee'), (3, 'Orlando Bloom', 'Legolas'), (3, 'John Rhys-Davies', 'Gimli'),
      (3, 'Cate Blanchett', 'Galadriel'), (3, 'Hugo Weaving', 'Elrond'), (3, 'Andy Serkis', 'Gollum'),
      (3, 'Ian Holm', 'Bilbo Baggins'),
      (4, 'Martin Freeman', 'Bilbo Baggins'), (4, 'Ian McKellen', 'Gandalf'), (4, 'Richard Armitage', 'Thorin Oakenshield'),
      (4, 'Cate Blanchett', 'Galadriel'), (4, 'Hugo Weaving', 'Elrond'), (4, 'Andy Serkis', 'Gollum'),
      (4, 'Elijah Wood', 'Frodo Baggins'), (4, 'Ian Holm', 'Bilbo Baggins'),
      (5, 'Martin Freeman', 'Bilbo Baggins'), (5, 'Ian McKellen', 'Gandalf'), (5, 'Richard Armitage', 'Thorin Oakenshield'),
      (5, 'Orlando Bloom', 'Legolas'), (5, 'Benedict Cumberbatch', 'Smaug'), (5, 'Cate Blanchett', 'Galadriel'),
      (6, 'Martin Freeman', 'Bilbo Baggins'), (6, 'Ian McKellen', 'Gandalf'), (6, 'Richard Armitage', 'Thorin Oakenshield'),
      (6, 'Orlando Bloom', 'Legolas'), (6, 'Benedict Cumberbatch', 'Smaug'), (6, 'Cate Blanchett', 'Galadriel'),
      (6, 'Hugo Weaving', 'Elrond'),

      (7, 'Michael J. Fox', 'Marty McFly'), (7, 'Christopher Lloyd', 'Emmett Brown'), (7, 'Lea Thompson', 'Lorraine Baines'),
      (7, 'Thomas F. Wilson', 'Biff Tannen'), (7, 'Claudia Wells', 'Jennifer Parker'),
      (8, 'Michael J. Fox', 'Marty McFly'), (8, 'Christopher Lloyd', 'Emmett Brown'), (8, 'Lea Thompson', 'Lorraine Baines'),
      (8, 'Thomas F. Wilson', 'Biff Tannen'), (8, 'Elisabeth Shue', 'Jennifer Parker'),
      (9, 'Michael J. Fox', 'Marty McFly'), (9, 'Christopher Lloyd', 'Emmett Brown'), (9, 'Lea Thompson', 'Maggie McFly'),
      (9, 'Thomas F. Wilson', 'Buford Tannen'), (9, 'Elisabeth Shue', 'Jennifer Parker'), (9, 'Mary Steenburgen', 'Clara Clayton'),

      (10, 'Tom Hanks', 'Woody'), (10, 'Tim Allen', 'Buzz Lightyear'), (10, 'Don Rickles', 'Mr. Potato Head'),
      (11, 'Tom Hanks', 'Woody'), (11, 'Tim Allen', 'Buzz Lightyear'), (11, 'Don Rickles', 'Mr. Potato Head'),
      (11, 'Joan Cusack', 'Jessie'),
      (12, 'Tom Hanks', 'Woody'), (12, 'Tim Allen', 'Buzz Lightyear'), (12, 'Don Rickles', 'Mr. Potato Head'),
      (12, 'Joan Cusack', 'Jessie'),
      (13, 'Tom Hanks', 'Woody'), (13, 'Tim Allen', 'Buzz Lightyear'), (13, 'Joan Cusack', 'Jessie'),
      (13, 'Tony Hale', 'Forky'),

      (14, 'Marlon Brando', 'Vito Corleone'), (14, 'Al Pacino', 'Michael Corleone'), (14, 'James Caan', 'Sonny Corleone'),
      (14, 'Robert Duvall', 'Tom Hagen'), (14, 'Diane Keaton', 'Kay Adams'), (14, 'Talia Shire', 'Connie Corleone'),
      (15, 'Al Pacino', 'Michael Corleone'), (15, 'Robert De Niro', 'Vito Corleone'), (15, 'Robert Duvall', 'Tom Hagen'),
      (15, 'Diane Keaton', 'Kay Adams'), (15, 'Talia Shire', 'Connie Corleone'),
      (16, 'Al Pacino', 'Michael Corleone'), (16, 'Diane Keaton', 'Kay Adams'), (16, 'Talia Shire', 'Connie Corleone'),
      (16, 'Andy Garcia', 'Vincent Mancini'),

      (17, 'Sam Neill', 'Alan Grant'), (17, 'Laura Dern', 'Ellie Sattler'), (17, 'Jeff Goldblum', 'Ian Malcolm'),
      (17, 'Richard Attenborough', 'John Hammond'),
      (18, 'Jeff Goldblum', 'Ian Malcolm'), (18, 'Richard Attenborough', 'John Hammond'), (18, 'Julianne Moore', 'Sarah Harding'),
      (19, 'Sam Neill', 'Alan Grant'), (19, 'Laura Dern', 'Ellie Sattler'), (19, 'William H. Macy', 'Paul Kirby'),

      (20, 'Keanu Reeves', 'Neo'), (20, 'Carrie-Anne Moss', 'Trinity'), (20, 'Laurence Fishburne', 'Morpheus'),
      (20, 'Hugo Weaving', 'Agent Smith'),
      (21, 'Keanu Reeves', 'Neo'), (21, 'Carrie-Anne Moss', 'Trinity'), (21, 'Laurence Fishburne', 'Morpheus'),
      (21, 'Hugo Weaving', 'Agent Smith'),
      (22, 'Keanu Reeves', 'Neo'), (22, 'Carrie-Anne Moss', 'Trinity'), (22, 'Laurence Fishburne', 'Morpheus'),
      (22, 'Hugo Weaving', 'Agent Smith'),
      (23, 'Keanu Reeves', 'Neo'), (23, 'Carrie-Anne Moss', 'Trinity'), (23, 'Yahya Abdul-Mateen II', 'Morpheus'),
      (23, 'Jonathan Groff', 'Agent Smith'),

      (24, 'Harrison Ford', 'Indiana Jones'), (24, 'Karen Allen', 'Marion Ravenwood'), (24, 'John Rhys-Davies', 'Sallah'),
      (25, 'Harrison Ford', 'Indiana Jones'), (25, 'Kate Capshaw', 'Willie Scott'), (25, 'Ke Huy Quan', 'Short Round'),
      (26, 'Harrison Ford', 'Indiana Jones'), (26, 'Sean Connery', 'Henry Jones Sr.'), (26, 'John Rhys-Davies', 'Sallah'),
      (26, 'River Phoenix', 'Young Indiana Jones'),
      (27, 'Harrison Ford', 'Indiana Jones'), (27, 'Karen Allen', 'Marion Ravenwood'), (27, 'Shia LaBeouf', 'Mutt Williams'),
      (27, 'Cate Blanchett', 'Irina Spalko'),
      (28, 'Harrison Ford', 'Indiana Jones'), (28, 'Phoebe Waller-Bridge', 'Helena Shaw'), (28, 'John Rhys-Davies', 'Sallah'),
      (28, 'Mads Mikkelsen', 'Jürgen Voller');

    CREATE TABLE screens (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL,
      seats INTEGER NOT NULL
    );
    INSERT INTO screens VALUES
      (1, 'Grand',   120),
      (2, 'Balcony', 80),
      (3, 'Studio',  50);

    -- One week of showings at The Sequel. Films not listed here weren't shown this week.
    CREATE TABLE screenings (
      id           INTEGER PRIMARY KEY,
      film_id      INTEGER NOT NULL REFERENCES films(id),
      screen_id    INTEGER NOT NULL REFERENCES screens(id),
      show_date    TEXT NOT NULL,   -- 'YYYY-MM-DD'
      show_time    TEXT NOT NULL,   -- 'HH:MM', 24-hour clock
      tickets_sold INTEGER NOT NULL,
      ticket_price REAL NOT NULL    -- $9 before 17:00 (matinee), $14 after
    );
    INSERT INTO screenings VALUES
      (1, 12, 1, '2025-06-02', '13:00', 34, 9.00),
      (2, 11, 1, '2025-06-02', '19:00', 74, 14.00),
      (3, 14, 2, '2025-06-02', '15:30', 24, 9.00),
      (4, 20, 2, '2025-06-02', '21:30', 58, 14.00),
      (5, 2, 3, '2025-06-02', '13:00', 22, 9.00),
      (6, 4, 3, '2025-06-02', '19:00', 18, 14.00),
      (7, 24, 1, '2025-06-03', '13:00', 29, 9.00),
      (8, 9, 1, '2025-06-03', '19:00', 32, 14.00),
      (9, 2, 2, '2025-06-03', '15:30', 30, 9.00),
      (10, 21, 2, '2025-06-03', '21:30', 35, 14.00),
      (11, 15, 3, '2025-06-03', '13:00', 9, 9.00),
      (12, 12, 3, '2025-06-03', '19:00', 28, 14.00),
      (13, 4, 1, '2025-06-04', '13:00', 38, 9.00),
      (14, 2, 1, '2025-06-04', '19:00', 83, 14.00),
      (15, 3, 2, '2025-06-04', '15:30', 24, 9.00),
      (16, 15, 2, '2025-06-04', '21:30', 37, 14.00),
      (17, 20, 3, '2025-06-04', '13:00', 20, 9.00),
      (18, 1, 3, '2025-06-04', '19:00', 30, 14.00),
      (19, 3, 1, '2025-06-05', '13:00', 53, 9.00),
      (20, 9, 1, '2025-06-05', '19:00', 39, 14.00),
      (21, 17, 2, '2025-06-05', '15:30', 27, 9.00),
      (22, 20, 2, '2025-06-05', '21:30', 49, 14.00),
      (23, 4, 3, '2025-06-05', '13:00', 13, 9.00),
      (24, 12, 3, '2025-06-05', '19:00', 26, 14.00),
      (25, 7, 1, '2025-06-06', '13:00', 65, 9.00),
      (26, 12, 1, '2025-06-06', '19:00', 76, 14.00),
      (27, 15, 2, '2025-06-06', '15:30', 25, 9.00),
      (28, 9, 2, '2025-06-06', '21:30', 38, 14.00),
      (29, 4, 3, '2025-06-06', '13:00', 12, 9.00),
      (30, 11, 3, '2025-06-06', '19:00', 29, 14.00),
      (31, 7, 1, '2025-06-07', '13:00', 59, 9.00),
      (32, 2, 1, '2025-06-07', '19:00', 115, 14.00),
      (33, 4, 2, '2025-06-07', '15:30', 22, 9.00),
      (34, 20, 2, '2025-06-07', '21:30', 70, 14.00),
      (35, 12, 3, '2025-06-07', '13:00', 28, 9.00),
      (36, 10, 3, '2025-06-07', '19:00', 39, 14.00),
      (37, 14, 1, '2025-06-08', '13:00', 51, 9.00),
      (38, 4, 1, '2025-06-08', '19:00', 57, 14.00),
      (39, 12, 2, '2025-06-08', '15:30', 24, 9.00),
      (40, 7, 2, '2025-06-08', '21:30', 76, 14.00),
      (41, 17, 3, '2025-06-08', '13:00', 24, 9.00),
      (42, 8, 3, '2025-06-08', '19:00', 29, 14.00);
  `,
};
