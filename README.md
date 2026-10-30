# Northern Survival

A top-down survival game set in a northern landscape of golden meadows, pine forests and
lingering snow, built with [Three.js](https://threejs.org/). The goal is to see how long you can survive.

Planned features (hunger and thirst, chopping wood, campfires, traps and cooking) are tracked
in the [issues](https://github.com/GrahamChalfant/game_design/issues).

## Getting started

There are two ways to run the game. Both run the same game.

### Option A: No install needed (Python)

This uses Python, which is already on most Macs, and downloads Three.js from a CDN.
You don't need Node.js or npm.

From inside the project folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. After you edit a file, refresh the browser to see the change.
To stop the server, press **Ctrl+C** in the terminal.

> You can't just double-click `index.html`. Browsers block this kind of code when it's
> opened as a local file, so it has to be served by a web server like the one above.

### Option B: With Node.js and npm

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). The page reloads
automatically whenever you save a file.

### Controls

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Walk |
| 1–6, or click a slot | Pick an item from the hotbar |
| Space or left mouse button (hold) | Use the item in your hand (e.g. chop a tree with the axe) |
| E (hold, at the water's edge or in the lake) | Drink |
| E (next to a campfire) | Add a log to the fire |
| Mouse wheel / trackpad scroll | Zoom in and out |

### How to play

Survive as long as you can. Hunger and thirst drop over time. When either one runs out,
you start losing health. Drink from the lake to stay hydrated. While you're well fed and
watered, your health slowly recovers. One in-game day lasts 10 real minutes.

You start with an axe. Face a tree, take out the axe and hold Space to chop it down
for wood. Hard work makes you hungry faster.

With wood in your hand, press Space on open ground to build a campfire (5 wood).
A fire burns for 2 in-game hours; stand next to it and press E to add a log
(1 more hour each). A fire that's gone out can be relit the same way.

Rabbits and deer roam the map, but there aren't many of them. They graze and wander
until you get too close, then bolt. Both run faster than you, and deer spook from much
farther away, so you won't catch them by chasing.

To tune the difficulty, edit the numbers at the top of `src/survival.js`.

To test faster, add `?speed=20` to the address (for example http://localhost:8000/?speed=20).
Time then passes 20 times faster.

## Project layout

```
index.html            Page shell and HUD
src/main.js           Renderer, lighting, camera and the main game loop
src/world.js          Builds the map from a seed: places trees, rocks and grass
src/terrain.js        Hills, the lake, and the colours painted on the ground
src/grass.js          Swaying grass blades
src/snow.js           Light snowfall
src/player.js         Player movement, swimming and collisions
src/trees.js          Choppable trees: chopping progress, falling and stumps
src/seeThrough.js     Makes trees see-through where they'd hide the player
src/campfires.js      Building campfires, fuel, flames and firelight
src/animals.js        Rabbits and deer: wandering, grazing and running from the player
src/inventory.js      Items and the hotbar
src/survival.js       Hunger, thirst, health and the survival clock
src/hud.js            On-screen stats, clock, prompts and game-over screen
src/input.js          Keyboard and mouse handling
src/models.js         Loads Blender models and draws many copies efficiently
src/placeholders.js   Simple stand-in shapes used until Blender models exist
src/random.js         Seeded random numbers and noise (same seed = same map)
public/models/        3D models exported from Blender (.glb)
```

To get a different map, change `SEED` in `src/main.js`.

## Adding models from Blender

The game uses simple stand-in shapes until you make real models. To replace one:

1. Model it in Blender, with 1 Blender unit = 1 meter and the model's base at the origin.
2. Go to **File → Export → glTF 2.0**, and choose the **glTF Binary (.glb)** format.
3. Save it into `public/models/` with the matching name below.

The next time you load the game, your model replaces the stand-in automatically.

| File | What it is | Size |
| --- | --- | --- |
| `player.glb` | The survivor. Should face you in Blender's **Front** view. | ~1.8 m tall |
| `pine.glb` | Tall conifer that grows in the forests | ~9 m tall |
| `broadleaf.glb` | Round, leafy tree found alone in the fields | ~6 m tall |
| `rock.glb` | Boulder | ~1 m across |
| `rabbit.glb` | Rabbit (the stand-in is drawn a bit bigger than life, to be easy to spot) | ~0.55 m long |
| `deer.glb` | Deer | ~1.6 m tall at the head |
| `campfire.glb` | Fire pit: stones and logs (the flames are added by the game) | ~1.3 m across |
| `stump.glb` | Stump left after chopping a tree | ~0.6 m across, ~0.45 m tall |
| `axe.glb` | Axe held in the hand. Put the origin where the hand grips the handle, with the blade pointing up (+Z in Blender). | ~0.75 m long |

## Updating Three.js

The Three.js version is listed in two places. If you change one, change both:
`"three"` in `package.json` (Option B) and the import map in `index.html` (Option A).

## Sharing the game

You need Option B (npm) for this:

```bash
npm run build
```

This creates a `dist/` folder. You can upload it to [itch.io](https://itch.io) (as a zipped HTML
game), GitHub Pages, Netlify or any other static host.
