# Northern Survival

A top-down survival game set in a northern landscape of golden meadows, pine forests and
lingering snow, built with [Three.js](https://threejs.org/). The goal is to see how long you can survive.

Everything for this game lives in this `survival` folder. Ideas and planned features are tracked
in the [issues](https://github.com/GrahamChalfant/game_design/issues).

## Getting started

There are two ways to run the game. Both run the same game.

### Option A: No install needed (Python)

This uses Python, which is already on most Macs, and downloads Three.js from a CDN.
You don't need Node.js or npm.

From inside the `survival` folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. After you edit a file, refresh the browser to see the change.
To stop the server, press **Ctrl+C** in the terminal.

> You can't just double-click `index.html`. Browsers block this kind of code when it's
> opened as a local file, so it has to be served by a web server like the one above.

### Option B: With Node.js and npm

You need [Node.js](https://nodejs.org/) 20.19 or newer. From inside the `survival` folder:

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
| C, or hold Shift | Crouch: move slowly so animals don't notice you as soon. C stays on until you press it again |
| 1–6, or click a slot | Pick an item from the hotbar |
| Left mouse button (hold) | Use the item in your hand (e.g. chop a tree with the axe) |
| Space | Jump, including onto rocks and stumps that are low enough |
| E (hold, at the water's edge or in the lake) | Drink |
| E (next to a campfire) | Add a log to the fire |
| E (at a trap) | Take the catch, or pick up an empty trap |
| E (next to something on the ground) | Pick it up |
| Tab or I | Open or close your character, inventory and crafting (drag items to move them, or off the menu to drop them) |
| Mouse wheel / trackpad scroll | Zoom in and out |
| Esc | Pause and show the controls (also closes the inventory) |

### How to play

The game starts paused on a menu listing the controls. Press Esc at any time to see it again.

You start hurt (35 health) and empty-handed, a short walk south of your crashed bush
plane. It's just out of sight, so head north to find it. Your axe and backpack were thrown
clear in the crash: look around the wreckage (they have floating icons) and press E to
pick them up. The backpack gives you 12 extra slots.

Suitcases were thrown out of the plane as it crashed: some lie around the wreck, and one lies
back along the furrow the plane dug as it skidded in. Hold E next to a suitcase to search it.
Each one can be searched once:

| Where | What's inside |
| --- | --- |
| The suitcase in the skid furrow | Lighter, flare |
| The suitcases around the wreck | A first-aid kit (3 bandages), and 5 rope between them |

Select a bandage and click to heal 30 health. Keep the lighter: you need it to
light fires. Save the flare for signalling a rescue (coming later).

Your stats are the icons at the bottom right. They're white, turn yellow when low, and red when
you're about to run out. Temperature falls at night and in the water, and rises near a burning
fire. If it reaches zero, you start losing health.

Survive as long as you can. Hunger and thirst drop over time. When either one runs out,
you start losing health. Drink from the lake to stay hydrated. While you're well fed and
watered, your health slowly recovers. One in-game day lasts 10 real minutes.

Days are long, like a northern summer: the sun rises around 05:00 and sets around 20:00.
Nights are dark, so keep a campfire going if you want to see what you're doing.
To change the colours and light at each time of day, edit the table at the top of
`src/daylight.js`.

Once you have the axe, face a tree, take it out and click and hold to chop it down
for wood. Hard work makes you hungry faster.

Your hotbar has 6 slots, and the backpack (Tab, once you've found it) has 12 more. If something doesn't fit,
it's left on the ground with a floating icon above it; walk over and press E to pick it up.

Recipes appear in the crafting list once you've picked up what they're made from.

When you first pick up everything a recipe needs, a "New recipe" card pops up at the top
of the screen. In the crafting list, each ingredient shows how many you have out of how many
you need (like 2/3 wood): red until you have enough, then green.

To make a campfire, press Tab and craft one (5 wood), then select it and click to
place it on open ground. Stand next to it and press E to light it (you need the lighter).
A fire burns for 2 in-game hours; stand next to it and press E to add a log
(1 more hour each). A fire that's gone out needs more wood (E) and lighting again.

Rabbits and deer roam the map, but there aren't many of them. They graze and wander
until you get too close, then bolt. Both run faster than you, and deer spook from much
farther away (12 m standing, 5 m crouched), so you won't catch them by chasing. Press C to
crouch: animals notice you much later.

To catch rabbits, press Tab and craft a trap (3 wood and 1 rope), then select it and click to
set it. Rabbits within about 18 m are drawn to it. Leave the area, since they won't come
close while you're nearby. When one is caught, press E at the trap for 2 raw meat, a hide and some intestines. This breaks the trap, so you'll
need to craft another.
Hides and intestines can be crafted into rope (intestines give 1 rope, a hide gives 2), and
2 hides and a rope make a water flask. Select the flask and click at the lake or river to fill
it (3 drinks), then click anywhere to take a drink. Bigger animals give more meat, hide and
intestines.
To hunt deer, make a bow. Stones lie in little groups by the rocks and the lake shore (press E
to pick them up); a taken stone comes back three days later, so once you've picked an area clean you'll need to look further afield. A bowstring takes 1 intestines; once you hold a bowstring you can craft a bow
(3 wood, 2 bowstrings), and once you hold a bow, arrows (1 wood and 1 stone make 3). Select the
bow and click on the ground where you want to shoot: you turn and loose an arrow that way. One hit kills a deer or a rabbit; hold E next to
it to butcher it (a deer takes 4 s and gives 6 raw meat, 2 hides and 2 intestines). The bow
breaks after 30 shots and arrows are lost once shot. All the numbers are in `src/hunting.js`.
Craft a shelter (20 wood, 6 rope, 4 hides), select it and click to build it a few steps
ahead. Its open front always faces the camera, so you can see inside it. Under its roof you warm up (and, once you've been warm for an hour, slowly heal), like standing at a
fire. At night, press E inside it to sleep until 06:00: time passes, but none of your
stats change (campfires keep burning, so they may be out when you wake).
Hold raw meat at a burning fire and click and hold to cook it, then click away from
the fire to eat. Eating meat raw works in a pinch, but it makes you sick.

To tune the difficulty, edit the numbers at the top of `src/survival.js`.

The game has a painterly filter that makes it look hand-painted. If it runs slowly on your
computer, or to compare, add `?classic` to the address to turn it off.

To test faster, add `?speed=20` to the address (for example http://localhost:8000/?speed=20).
Time then passes 20 times faster.

## Project layout

```
index.html            Page shell and HUD
src/main.js           Renderer, lighting, camera and the main game loop
src/daylight.js       Day and night: the sun and moon, light colours, sky and fog
src/world.js          Builds the map from a seed: places trees, rocks and grass
src/terrain.js        The land: gentle hills, the lake, the river and the ground colours
src/painterly.js      The painted look: a filter that turns the picture into soft brush strokes
src/water.js          The lake and the flowing river, and ripples around the player
src/grass.js          Swaying grass tufts
src/snow.js           Light snowfall
src/player.js         Player movement, swimming and collisions
src/trees.js          Choppable trees: chopping progress, falling and stumps
src/seeThrough.js     Makes trees see-through where they'd hide the player
src/campfires.js      Building campfires, fuel, flames and firelight
src/shelters.js       Shelters: building them, warmth inside, and where you can sleep
src/animals.js        Rabbits and deer: wandering, grazing and running from the player
src/traps.js          Snare traps that catch rabbits
src/hunting.js        Bow hunting numbers and rules (stones, one-shot kills, flee distances, yield)
src/arrows.js         Arrows in flight
sim/hunting-sim.mjs   Node check of the hunting rules: node sim/hunting-sim.mjs
src/pickups.js        Items lying on the ground
src/wreck.js          The crashed plane at the start, and where the starting items lie
src/crashTrail.js     The skid marks behind the plane: where they run and how they cut the ground
src/crafting.js       Crafting recipes (add new ones here)
src/characterView.js  The close-up of your character in the inventory (drag it to turn them)
src/actions.js        What the player is doing each frame: chopping, building, cooking, eating…
src/inventory.js      Items and the hotbar
src/itemIcons.js      Item icons: small low-poly models, rendered into pictures when the game loads
src/survival.js       Hunger, thirst, temperature, health and the survival clock
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
| `player.glb` | The survivor, facing you in Blender's **Front** view, with its animations. Needs a bone called `hand_R`, a backpack mesh called `player-pack`, and clips called `idle`, `walk`, `sneak`, `crouch`, `chop`, `swim`, `drink`, `jump` and `die`. | ~1.8 m tall |
| `pine.glb` | Tall conifer that grows in the forests | ~9 m tall |
| `pine-small.glb` | Young pine | ~3.5 m tall |
| `pine-skinny.glb` | Narrow pine | ~10 m tall, ~2 m across |
| `pine-tall.glb` | Big old pine | ~14 m tall |
| `pine-wide.glb` | Short, full pine | ~6.5 m tall, ~5 m across |
| `pine-snow.glb`, `pine-small-snow.glb` | Pines with patches of snow | ~9 m and ~3.5 m tall |
| `sapling-pine.glb`, `sapling-broadleaf.glb` | Saplings | ~1.5 m and ~2 m tall |
| `tree-dead.glb` | Bare dead tree | ~7.5 m tall |
| `broadleaf.glb` | Round, leafy tree found alone in the fields | ~6 m tall |
| `grass-tuft.glb` | Tuft of grass. Keep every tuft low on triangles: thousands are drawn. Colours come from the ground, so paint tufts in shades of grey. | ~0.9 m across, 1 m tall (the game scales all tufts down) |
| `grass-short.glb`, `grass-clump.glb`, `grass-sparse.glb`, `grass-wide.glb`, `grass-wisp.glb`, `grass-tall.glb`, `grass-seed.glb`, `grass-fern.glb` | Other tufts: low patch, thick bunch, scattered blades, broad sedge, thin arcs, reeds, seed heads and fern. To add one, put its name in `TUFT_MIX` in `src/grass.js`. | 0.5–1.7 m tall |
| `rock.glb` | Boulder | ~1 m across |
| `rock-small.glb` | Small stone | ~0.6 m across |
| `rock-flat.glb` | Low, flat slab | ~1.9 m long, ~0.3 m tall |
| `rock-tall.glb` | Standing stone | ~0.8 m across, ~1.2 m tall |
| `rock-large.glb` | Large boulder | ~2 m across, ~1.3 m tall |
| `rabbit.glb` | Rabbit, nose toward Blender's **Front** view, with clips called `rabbit-idle`, `rabbit-graze`, `rabbit-walk` and `rabbit-run` | ~0.55 m long |
| `deer.glb` | Deer, nose toward Blender's **Front** view, with clips called `deer-idle`, `deer-graze`, `deer-walk` and `deer-run` | ~1.7 m tall at the head |
| `suitcase.glb` | Suitcase in shades of grey (the game tints it), with its lid as a child object called `lid`, origin on the hinge | ~0.7 m wide |
| `plane.glb` | The crashed bush plane, nose pointing toward you in Blender's **Front** view (model it already crashed) | ~8 m long |
| `clod.glb` | Lump of soil thrown up along the crash trail | ~0.3 m across |
| `plane-wing.glb` | The wing that broke off the plane, lying on the ground | ~5.5 m long |
| `backpack.glb` | Backpack lying in the grass | ~0.5 m tall |
| `axe-ground.glb` | Axe lying on the ground | ~0.75 m long |
| `logs.glb` | Pile of logs lying on the ground | ~0.7 m long |
| `trap.glb` | Spring-pole snare (rebuilt by `blender/camp_props.py`) | ~0.7 m across |
| `boar.glb` | Rigged wild boar with idle, walk, run and graze clips (rebuilt by `blender/boar.py`) | ~1.4 m long, 0.9 m tall |
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
