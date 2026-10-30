# Game Design

Games that run in the browser. Each game lives in its own folder with everything it needs,
including its own README explaining how to run and change it.

| Folder | Game |
| --- | --- |
| [`survival/`](survival/) | **Northern Survival**: a top-down 3D survival game (Three.js). Chop wood, build fires, trap and cook food, and see how long you can last through the days and nights. |
| [`sql-daily/`](sql-daily/) | **SQL: The Sequel**: a daily SQL puzzle game. Three timed, movie-themed SQL questions a day. |

## Playing a game

Each game runs from its own folder with a small local web server. For example:

```bash
cd survival
python3 -m http.server 8000
```

Then open http://localhost:8000. Press **Ctrl+C** in the terminal to stop the server.
The README in each folder has the details: [survival](survival/README.md), [sql-daily](sql-daily/README.md).

## Adding a new game

Create a new folder at the top level of the repo, give it its own `index.html` and `README.md`,
and add a row to the table above.
