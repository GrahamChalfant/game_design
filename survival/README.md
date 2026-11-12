# Northern Survival

A top-down survival game set in a far-northern landscape of golden meadows, spruce woodland and
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
python3 serve.py
```

Then open http://localhost:8000. After you pull or edit a file, refresh the browser to see the
change. (`serve.py` tells the browser not to cache the game's files. With the plain
`python3 -m http.server 8000` the browser can keep showing old code after a pull: if you use it,
refresh with **Ctrl+Shift+R**, or **Cmd+Shift+R** on a Mac.)
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
| Hold Shift | Sprint (animals hear you coming from further off). Sprinting and jumping use stamina, the bar over the hotbar; run it out and you must get your breath back before you can sprint or jump again |
| C | Crouch: move slowly so animals don't notice you as soon. Stays on until you press C again |
| 1–6, or click a slot | Pick an item from the hotbar |
| Left mouse button (hold) | Use the item in your hand (e.g. chop a tree with the axe) |
| Space | Jump, including onto rocks and stumps that are low enough |
| E (hold, at the water's edge or in the lake) | Drink |
| E (next to a campfire) | Add a log to the fire |
| E (at a trap) | Take the catch, or pick up an empty trap |
| E (next to something on the ground) | Pick it up |
| Tab or I | Open or close your character, inventory and crafting (drag items to move them, or off the menu to drop them) |
| M | Look at your map, once you've found one |
| Mouse wheel / trackpad scroll | Zoom in and out |
| V | Switch view: top-down (the usual), over the shoulder, or first person. In the last two, click to capture the mouse and look around with it (WASD walks the way you look; Esc lets the mouse go), and you can see much further. Add `?view=third` or `?view=first` to the address to start in one |
| Esc | Pause and show the controls (also closes the inventory) |

### How to play

The game starts paused on a menu listing the controls (Play says Loading… until every model is in, so you never see the stand-in shapes). Press Esc at any time to see it again.

You start hurt (55 health), empty-handed and cold, in just a shirt, a short walk south of your crashed bush
plane. Your jacket is packed in your suitcase by the wreck: find it, select it and click to put it on, and
you warm up (in a shirt, a day outdoors never gets you above chilly, and nights bite harder). It's just out of
sight, so head north to find it. Your backpack was thrown clear in the crash: look around the wreckage (it has
a floating icon) and press E to pick it up. The backpack gives you 12 extra slots. There's no axe: one cabin in
four has one in its old chest, so you'll have to go looking.

### The map

The map is the same every game: hand-shaped, 2 km east to west and 3 km south to north, and the
way on runs from south to north. There are no quest markers: you find your way by what you see,
and what you read. (Everything below is laid out in `src/layout.js`.)

- **The crash, on the south coast.** The plane came down in coastal forest a hundred meters or so
  from the sea, which you can see from the open ground south of the wreck. Its skid trail runs back
  into the trees, and behind that the way it came in: a swath of trees snapped off by the plane,
  their tops lying where they fell, with bits of the plane scattered through it. The sea's salt,
  so for water there's a pond just north of the wreck, and a river west of it running down from
  the mountains. You can wade and swim a little way out into the sea, but no further.
- **The fire tower**, north-east of the crash on a wooded hill. Walk onto the stairs at its foot
  and follow the flights up past the landings to the cab, 12 m up: the lookout's fire-finder table,
  a cot, a supply crate (with a map in it) and a ranger's locker, with a note in it pointing you
  on to the observatory. Hold E at the crate or the locker to search it. (Up the tower, things on
  the ground below are out of reach, and you can't put down a campfire, shelter or trap.) Out on
  the balcony, binoculars stand by the railing: press E to look through them. The view pulls way
  back so you can see far across the land; WASD looks around, scrolling zooms, and E or Esc stops.
  The old fire road runs from the tower out to the east edge of the map, a rusted truck left by it.
- **The foothills**, north of the tower: mixed forest and meadow rising to the mountains, ponds,
  the river, deer (more here than anywhere), and the wolves' den under a rocky bank. The hunting
  stand is here, at a wood's edge, with a trappers' lean-to, a hunters' camp and a cave in the
  mountains' foot.
- **The mountains**, a wall right across the map. Off the trail the slopes are too steep to
  climb: there's one way over, the old trail, which leaves the foothills and switches back and
  forth up to a saddle in the ridge. Partway up, a ravine cuts across it, and the footbridge over
  it is broken (it'll take repairing). Above it, a stone hut to sit out a blizzard in, with an
  emergency box. Up there it's snow and bitter cold: you'll freeze fast without warm clothes.
- **The observatory**, on the ridge just east of the saddle: a round stone tower with a copper
  dome and a terrace looking north. Inside, the astronomer's cupboard; it's warm shelter, and
  somewhere to sleep. On the terrace, a telescope: press E to look through it, down over the far
  side to the lake and the cabin on its shore.
- **The lake**, north of the mountains and right across the map: far too wide to swim (you'll
  have to build a boat). Where the trail comes down stands the lakeshore cabin, with a dock out
  into the water and pines all round it (for sap).
- **The farm**, across the lake in the far north: the farmhouse and a few houses round it, the
  barn with the pickup in it, and the dirt road leading north off the edge of the map. The way out.

Each region has its own wildlife and plants (`REGIONS` in `src/layout.js`): how common rabbits and
deer are, whether wolves range there, how many berry bushes grow, and whether the pines can be
tapped for sap.

Most places have something to search (hold E), and a building's roof turns see-through when you
step inside. Cabins, caves, the stone hut and the observatory are warm shelter: at night, press E
inside to sleep until morning. The first time you come across a place, you'll say so.

- **Cabins** (the lakeshore cabin and the farm's houses): a bed, a stove, a table, and a cupboard
  and an old chest to search, with split wood stacked by the wall outside.
- **The cave** in the mountains' foot: a dark hole ringed by rocks. Walk into the hole holding a
  **lit torch** and the screen fades: you're in a cave system 30 m down, a few rooms joined by
  narrow passages. It's dark but for your torch, and the view closes in round you. There's an old
  camp with a pack to search, a miner's chest in the furthest room (the best finds on the map),
  glowing crystals, and bats. Climb the steps where you came in to go back up. Without a lit torch
  you won't go in.
- **Campsites**: a fire ring, log seats, a collapsed tent, and sometimes a pack left behind.
- **Trappers' lean-tos**: a bark roof to shelter under, hides on a drying rack, and a crate.
- **The hunting stand**: climb the ladder onto the platform, 3 m up: from there, animals don't
  notice you, so it's a good spot to shoot from. There's an ammo box up there.

**Fallen trees** lie about in the woods (jump over them, or onto them), and **old split-rail
fences** run across the meadows, with rails down and gaps to slip through.

A few birds fly over by day. The north is quiet: you hear the wind (louder up the mountains)
and, now and then by day, a bird of the boreal winter (a junco's "tsip", chickadees, a raven's
croak); owls and wolves far
off at night; deer walking, bleating, and snorting as they bolt from you; water nearby, a
campfire's crackle, and dripping and bats down a cave. Your footsteps sound like what's
underfoot (grass, dirt, gravel, rock, snow, wooden floors, water), and most things you do have a
sound: chopping and trees crashing down, the bow, arrows landing, eating, drinking, cooking,
searching, bandaging, lighting a fire, and you'll hear it when you're hurt. Every sound is a real
recording (from Freesound: see `public/sounds/README.md` and its credits), and `listen.html`
plays each on its own. Press N to turn the sound off and on.

What's in each place to search is rolled each game. All the numbers are at the top of
`src/pois.js` (and `src/landmarks.js` for the observatory, the bridge, the hut, the dock, the
barn and the den), and the stand-in models are in `src/poiModels.js`.

Press M to look at the map: it shows the whole area (lakes, the river, woods, the mountains and
the lookout), where you are, the crash, your campfires and shelters, and a pale trail over the
ground you've already covered.

Inside the cab, the camera moves in closer. Whenever part of the tower is between the camera and
you (the roof, a wall or window, or the floor above you on the stairs), just that part turns
see-through so you can always see yourself; everything else stays solid. Out on the balcony on
the camera's side, nothing is in the way, so the tower looks as it always does.

There's a compass in the pilot's bag by the plane's broken wing. While you carry it, a compass strip at the top of the screen shows which way you're facing,
and an arrow under it points to the crash with how far away it is: handy for finding your way
back on a big map. North is always up the screen.

Suitcases were thrown out of the plane as it crashed: some lie around the wreck, and one lies
back along the furrow the plane dug as it skidded in. Hold E next to a suitcase to search it.
Each one can be searched once:

| Where | What's inside |
| --- | --- |
| The suitcase in the skid furrow | Lighter, flare |
| Your suitcase (blue) | Your red jacket, 2 rope |
| The pilot's bag (red, by the wing) | Compass, rope |
| The brown case | A first-aid kit (3 bandages), 2 rope |

You crouch down to search things on the ground (and stand to search the ranger's locker).
Once you've searched something, the menu opens with it at the top of the "On the ground" box,
showing what's inside: drag a thing onto a slot to take it there, click it to take it all, or
Take all. Whatever you leave stays in it; E at something you've already searched opens it in the
menu again straight away.
Select a bandage and click and hold to bandage yourself up (+30 health): in first person you wind it round your
left forearm, the turns building up as you go; craft more from a hide
(2 bandages each). Eating also takes a moment: click and hold. Keep the lighter (or matches, one used
each time): you need it to light fires and torches. Save the flare for signalling a rescue (coming later).

To take off your outfit or backpack, open the menu (Tab) and drag it from your character: onto an
empty slot to carry the outfit, or off the menu to leave it on the ground. A backpack put down keeps
everything inside it until you pick it up again. Next to a campfire, the menu's "On the ground"
box shows the fire too: drag sticks or logs onto its spots to put them on (as many as it'll take;
click a spot to add one), drag raw meat onto an empty place on the spit to cook it, and drag a
piece of meat off the spit into your inventory (or click it) to take it.

Your stats are the icons at the bottom right. They're white, turn yellow when low, and red when
you're about to run out; the thermometer goes from a cool blue when you're freezing to a warm red
at its hottest. You'll say so when you get hungry or thirsty. Temperature falls at night and in the water, and rises near a burning
fire. If it reaches zero, you start losing health.

Up the mountains, spruce grow on the lower slopes, then scree and bare rock, then snow. The air
gets colder the higher you climb: above the snowline (the upper part of the trail, the saddle and
the observatory) you lose warmth even in the daytime, and you'll freeze in under a minute unless
you have a fire or a shelter (or a hide parka: see below).

Survive as long as you can. Hunger and thirst drop over time. When either one runs out,
you start losing health. Drink from a lake, the river or a creek to stay hydrated. There are
lakes all over the map, and one big one. While you're well fed and
watered, your health slowly recovers. The clock runs slower by day: the 15 daylit hours (05:00–20:00) last 12.5 real minutes, and the night about 5.5.

Days are long, like a northern summer: the sun rises around 05:00 and sets around 20:00.
Nights are dark, so keep a campfire going if you want to see what you're doing.
To change the colours and light at each time of day, edit the table at the top of
`src/daylight.js`.

**Wood comes as sticks and logs.** Sticks are what you make things from (fires, the bow and
arrows, snares, torches, the spit, a knife, the shelter); logs are firewood that burns long.
Fallen sticks lie about under the trees (press E to pick them up; they come back days later).
With a stone knife in hand, face a young tree (a sapling or a small spruce) and click and hold
to cut sticks from it, a couple at a time, three times a tree. Once you have an axe, face a
tree and click and hold to chop it down: it falls and lies there. Keep holding (or come back
to it) to cut it up: each piece leaves a log and two sticks on the ground beside the trunk
(a sapling, a bundle of sticks), and when the last is cut, the tree's gone. Hard work makes
you hungry faster. Anywhere else, click to swing the axe: it hurts an animal right in front of
you (two blows kill a deer, one a rabbit).

With the inventory open (Tab), an **On the ground** panel under the menu shows what's on the ground within five feet of
you: drag something onto a slot to take it there, or click it to take it all. Drag something
from your inventory onto that panel to put it down.

Your hotbar has 6 slots, and the backpack (Tab, once you've found it) has 12 more. If something doesn't fit,
it's left on the ground with a floating icon above it; walk over and press E to pick it up.

Recipes appear in the crafting list once you've picked up what they're made from. They're in
groups (Fire & cooking, Weapons & hunting, Shelter, Clothing & gear, Materials): click a group to
fold it open; each says how many of its recipes you can make right now.

When you first pick up everything a recipe needs, a "New recipe" card pops up at the top
of the screen. In the crafting list, each ingredient shows how many you have out of how many
you need (like 2/3 sticks): red until you have enough, then green.

To make a campfire, press Tab and craft one (6 sticks), then select it and click to
place it on open ground. To light it, select the lighter or the matches, stand next to it, and click
and hold: you strike a match on the box (or flick the lighter), shelter the flame and put it to the
kindling. (With anything else in your hand you can't light it.)
A fire burns for 6 in-game hours; stand next to it and press E to add a log (2 more hours each,
up to 16) or, with no logs, a stick (half an hour). A fire that's gone out needs more wood (E)
and lighting again.

Rabbits and deer live around you wherever you go, but there aren't many of them. They graze and wander
until you get too close, then bolt. Both run faster than you, and deer spook from much
farther away (12 m standing, 5 m crouched), so you won't catch them by chasing. Press C to
crouch: animals notice you much later.

Rabbits (a few about you at any time, mostly out in the open: snowshoe hares, a bit bigger than a
cottontail) and deer flatten the grass where they sit, as you do where you stand, so you can make
them out instead of losing them in it.
To catch rabbits, press Tab and craft a trap (3 sticks and 1 rope), then select it and click to
set it. Rabbits within about 18 m are drawn to it. Leave the area, since they won't come
close while you're nearby. When one is caught, press E at the trap for 2 raw meat, a hide and some intestines. This breaks the trap, so you'll
need to craft another.
Hides and intestines can be crafted into rope (intestines give 1 rope, a hide gives 2), and
2 hides and a rope make a water flask. Select the flask and click at the lake or river to fill
it (3 drinks), then click anywhere to take a drink. Bigger animals give more meat, hide and
intestines.
To hunt deer, make a bow. Stones lie in little groups by the rocks and the lake shore (press E
to pick them up); a taken stone comes back three days later, so once you've picked an area clean you'll need to look further afield. A bowstring takes 1 intestines; once you hold a bowstring you can craft a bow
(3 sticks, 2 bowstrings), and once you hold a bow, arrows (1 stick and 1 stone make 3). Select the
bow, aim with the crosshair (a small dot in the middle of the view while you've a bow and the
mouse is captured; otherwise the mouse pointer) and hold the button to draw (you turn to aim and walk
slowly); let go to shoot. The arrow leaves the bow's arrow rest and flies at what you aimed at,
nearly straight, then drops as it goes on; drawn, the arrow on the string points right at the
crosshair, so it flies the way it looks. It flies over low things (bushes, fences, rocks it
clears, a campfire) but stops in a tree trunk. The further you draw, the faster it flies and the
further it holds true (10 m on a light draw, 55 m drawn all the way; aim further and it drops
short). In first person you see the whole shot: you carry the bow low at your side; drawing, it comes up
a little while your right hand brings an arrow up and nocks it (the shaft lying on top of your bow
hand, on the right of the bow), then up to aim, canted over to the left, as the string comes back
to the corner of your mouth, three fingers hooked round it as an archer's are, the hand anchoring
under your jaw (the bow arm starts to shake if you hold it there long); let go and the string
snaps forward and quivers, the bow kicks, and your hand slides back along your jaw. Arrows are drawn a bit bigger than life, with a faint streak behind them, so you can
follow one in flight, and a running animal can get away. One hit kills a deer or
a rabbit, which stumbles on and falls over, with the arrow stuck in it; select your knife and
hold E next to it to butcher it (you can't without a knife; a deer takes 4 s and gives 6 raw meat,
2 hides and 2 intestines). The bow
breaks after 30 shots. An arrow that misses lands in the ground, where you can pick it up again. All the numbers are in `src/hunting.js`.
Craft a shelter (20 sticks, 6 rope, 4 hides), select it and click to build it a few steps
ahead. Its open front always faces the camera, so you can see inside it. Under its roof you warm up (and, once you've been warm for an hour, slowly heal), like standing at a
fire. At night, press E inside it to sleep until 06:00: time passes, but none of your
stats change (campfires keep burning, so they may be out when you wake).
Nights are dark away from a fire. Craft a torch (2 sticks), select it, and click and hold to light it:
your other hand brings the lighter (or a match, if you've no lighter) up under its head, so the lighter
only needs to be on you; or, next to a burning campfire, you hold the torch in the flames. A lit torch lights up the ground around you and burns for 8 in-game hours (about 5 real
minutes at night) while you hold it, with your arm bent up in front of you; put away in your inventory, it
keeps. Its slot shows how long it has left.
Craft a hide parka (6 hides, 3 rope), select it and click to put it on. It shows in your Outfit
slot, and on your character as a knee-length hide coat with a fur-trimmed hood. It keeps out most of the mountain cold, so you can climb up there by
day, and halves the chill of a night outdoors. Nights up the mountains still need a fire.
To cook, craft a cooking spit (3 sticks), hold it next to a campfire and click to set it up over
the fire. Then hold raw meat there and hold the mouse button for a second to put it on the spit
(up to three pieces at once, each cooking on its own): over a burning fire a piece is cooked in
30 seconds, and burnt if you leave it on for a minute (it darkens as it starts to burn). At the
fire, what you do depends on what you're looking at: look at a piece of meat and hold the mouse
button for a second to take it off (a hold, so you don't take one off by accident); look at the
fire to tend it (E adds a stick or a log, which never touches the meat). Away from the fire,
click and hold to eat. Eating meat raw
works in a pinch, but it makes you sick, and burnt meat isn't worth much. When you're full you
won't eat any more, and when you're not thirsty you won't drink.

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
src/layout.js         The map, by hand: where the coast, the mountains, the trail, the lake and every landmark are, and the regions
src/world.js          Builds the map: places the trees, rocks and grass
src/landmarks.js      The observatory, the broken bridge, the stone hut, the dock, the barn and the wolves' den
src/stream.js         Splits the map into chunks; only the ones around the player are drawn
src/grid.js           Finds things near a spot quickly (trees, rocks, items on the ground)
src/terrain.js        The land: the sea, the hills, the mountains and their trail, the lake, ponds, the river and creeks, the ground colours and how cold it is
src/painterly.js      The painted look: a filter that turns the picture into soft brush strokes
src/water.js          The lakes, the flowing river and creeks, and ripples around the player
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
src/lookout.js        The fire lookout tower: where it stands, and its supply crate
src/mapView.js        The map you can find (M): the whole area, markers and where you've been
src/farView.js        A rough view of the whole map, shown while you look through the binoculars
src/outfits.js        What you can wear (shirt, jacket, parka), and how it looks on you
src/crashTrail.js     The skid marks behind the plane: where they run and how they cut the ground
src/crafting.js       Crafting recipes (add new ones here)
src/characterView.js  The close-up of your character in the inventory (drag it to turn them)
src/actions.js        What the player is doing each frame: chopping, building, cooking, eating…
src/inventory.js      Items and the hotbar
src/itemIcons.js      Item icons: pictures rendered in Blender (public/icons), with code-drawn fallbacks
src/survival.js       Hunger, thirst, temperature, health and the survival clock
src/hud.js            On-screen stats, clock, prompts and game-over screen
src/input.js          Keyboard and mouse handling
src/blood.js          Blood spatter on the ground when you're hurt
src/pois.js           Cabins, caves, stands, campsites, lean-tos: where they go, loot, floors and shelter
src/caves.js          Cave entrances, and the cave systems underground
src/roads.js          The old fire road: where it goes, and the gate, signs and fallen trees on it
src/details.js        Fallen trees and old fences
src/ambientLife.js    Birds flying over
src/sounds.js         All the sounds: when and where each recording in public/sounds/ plays
src/poiModels.js      Stand-in models for the cabins, stands, campsites, lean-tos, truck, logs and fences
src/cutaway.js        Fades the parts of a building between the camera and the player
src/models.js         Loads Blender models and draws many copies efficiently
src/placeholders.js   Simple stand-in shapes used until Blender models exist
src/random.js         Seeded random numbers and noise (a fixed seed, so the same map every time)
public/models/        3D models exported from Blender (.glb)
```

The map is 2 km by 3 km (`BOUNDS` in `src/layout.js`), about 10 minutes' walk from south to
north as the crow flies (much longer the way the land makes you go). Only the 32 m chunks around the player are drawn: the ground, grass, trees and rocks are
built as you come near and dropped once you're well away, and items on the ground only get their
3D objects within 70 m. Animals live in a ring around you, and ones you leave far behind turn up
somewhere new around you. How thickly trees and rocks grow is set per hectare at the top of
`src/world.js`, so changing the map's size keeps the same density.

Each map has one mountain range, filling the corner the river doesn't run through, one big
lake (well over 100 m across, a long walk from the crash), and about 20 smaller lakes around
the lowlands. Little creeks, clear, shallow and stony, run down off the hills into the river and
the lakes: you can wade across them (the old fire road fords them), and they show on the map as
thin blue lines. To change how many there are, how big and tall the mountains are, and where
the snow and the cold start, edit `MOUNTAINS`, `BIG_LAKE`, `LAKES` and `CREEKS` at the top of
`src/terrain.js`. How fast the mountain cold chills you is `MOUNTAIN_CHILL_PER_HOUR` in
`src/survival.js`. Which trees grow up the slopes, and where the treeline is, is at the top of
`src/world.js`.

## Adding models from Blender

The game uses simple stand-in shapes until you make real models. To replace one:

1. Model it in Blender, with 1 Blender unit = 1 meter and the model's base at the origin.
2. Go to **File → Export → glTF 2.0**, and choose the **glTF Binary (.glb)** format.
3. Save it into `public/models/` with the matching name below.

The next time you load the game, your model replaces the stand-in automatically.

| File | What it is | Size |
| --- | --- | --- |
| `player.glb` | The survivor, facing you in Blender's **Front** view, with its animations. Needs a bone called `hand_R`, a backpack mesh called `player-pack`, and clips called `idle`, `walk`, `run`, `sneak`, `crouch`, `chop`, `swim`, `drink`, `jump` and `die`. The close-up details (face, knit toque, the coat's collar, pockets and cuffs, thumbs, boot soles) are a separate mesh, `player-details`, added and exported by `blender/player_details.py` | ~1.8 m tall |
| `pine.glb` | Spruce mixed into the forests: drooping, ragged tiers of branches, darker underneath, over a bare stretch of trunk (rebuilt by `blender/conifers.py`, as are the other pines and the pine sapling) | ~9 m tall |
| `lookout.glb` | The fire lookout tower: four timber legs, stairs, and a cab with windows on top. The stairs, landings and cab floor need to match where the player can walk (`TOWER` in `src/lookout.js`), and meshes with `roof`, `wall`, `window`, `floor` or `stair` in their names turn see-through whenever they're between the camera and the player | ~15 m tall, ~4 m across at the foot |
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
| `deer.glb` | Deer, nose toward Blender's **Front** view, with clips called `deer-idle`, `deer-graze`, `deer-walk` and `deer-run`. Its antlers and eyes are a separate mesh, `deer-details`, added and exported by `blender/deer_details.py` | ~1.7 m tall at the head (~2.1 m to the antlers) |
| `suitcase.glb` | Suitcase in shades of grey (the game tints it), with its lid as a child object called `lid`, origin on the hinge | ~0.7 m wide |
| `plane.glb` | The crashed bush plane, nose pointing toward you in Blender's **Front** view (model it already crashed) | ~8 m long |
| `clod.glb` | Lump of soil thrown up along the crash trail | ~0.3 m across |
| `plane-wing.glb` | The wing that broke off the plane, lying on the ground | ~5.5 m long |
| `backpack.glb` | Backpack lying in the grass | ~0.5 m tall |
| `axe-ground.glb` | Axe lying on the ground | ~0.75 m long |
| `logs.glb` | Pile of logs lying on the ground | ~0.7 m long |
| `trap.glb` | Spring-pole snare (rebuilt by `blender/camp_props.py`) | ~0.7 m across |
| `cabin.glb` | Abandoned log cabin: walls (`cabin-wall-*`) and roof fade when in the way; the cupboard and chest stay in code (rebuilt by `blender/places.py`, as are the rest below) | 5.9 × 4.9 m, 3.6 m tall |
| `hunting-stand.glb` | Hunter's stand of peeled poles and weathered planks, deck 3 m up; `hunting-stand-roof` is its tin roof (hidden on stands without one) (built by `blender/stand.py`) | 2.9 m square, 5.2 m tall |
| `lean-to.glb` | Trapper's lean-to with a bark roof (`lean-to-roof`), drying rack and chopping block | ~6 m across |
| `campsite.glb` | Abandoned campsite: fire ring, tripod and pot, log seats, collapsed tent | ~4 m across |
| `truck.glb` | Rusted forest service pickup, passenger door open | 1.9 × 5.1 m |
| `fallen-log.glb` | Fallen trunk, 1 m long and 1 m thick (stretched per copy) | 1 × 1 m |
| `fence.glb`, `fence-broken.glb` | One 2.5 m length of split-rail fence, whole or with a rail down | 2.5 m long |
| `lookout.glb` | The fire lookout tower: frame, four flights of stairs, landings, cab with windows, balcony and railing, metal roof. Stairs, floors, walls, windows and roof are separate parts that fade when in the way (rebuilt by `blender/lookout.py`) | ~16 m tall |
| `logs.glb`, `axe-ground.glb`, `clod.glb`, `debris.glb`, `landing-wheel.glb` | Things lying about: dropped firewood, the axe, crash clods, a panel of plane skin, a torn-off wheel | small |
| `torch.glb` | The torch, held by the grip (origin); the flame sits 0.52 m up | 0.7 m |
| `barrel.glb`, `ammo-box.glb`, `weathered-pack.glb`, `cupboard.glb`, `chest.glb`, `locker.glb`, `supply-crate.glb` | Things you search; lids and doors (`*-lid`, `*-door…`, `*-flap`) are hinged parts the game swings open | 0.3–1.8 m |
| `cot.glb`, `fire-finder.glb`, `binoculars.glb` | The lookout cab's furniture | |
| `fire-gate.glb`, `signpost.glb` | The fire road's rusted gate (`fire-gate-gate` swings) and its signposts | |
| `crystals.glb`, `stalagmite.glb`, `bones.glb`, `fire-ring.glb`, `bedroll.glb`, `glow-fungus.glb` | Cave props (the crystals and fungus glow: the game adds that) | small |
| `clouds.glb` | Six low-poly cumulus clouds (`cloud-1` … `cloud-6`) for the sky in the over-the-shoulder and first-person views; the game scales them up and drifts them on the wind (rebuilt by `blender/sky.py`) | ~25–60 m across |
| `campfire.glb` | Fire pit: stones and logs (the flames are added by the game) | ~1.3 m across |
| `flames.glb` | Nine curling flame tongues (`flame-1` … `flame-9`), yellow-white at the base to red at the tips, for campfires and the lit torch; each has its origin at its base so the game can flicker it (rebuilt by `blender/flames.py`) | ~0.65 m tall |
| `stump.glb` | Stump left after chopping a tree | ~0.6 m across, ~0.45 m tall |
| `axe.glb` | Axe held in the hand. Put the origin where the hand grips the handle, with the blade pointing up (+Z in Blender). | ~0.75 m long |

The broadleaf tree, its sapling and the dead tree in `blender/trees.blend` were made by hand.
`blender/recolour_trees.py` moved their colours onto the muted palette and exports their GLBs;
after editing one by hand, run it again to re-export them. (The pines that are still in
trees.blend are the old ones: the game's come from `blender/conifers.py`.)

### Inventory icons

Each item's icon is a picture in `public/icons/<item>.png`, rendered in Blender by
`blender/icons.py` (`blender -b --python icons.py`, or `-- axe map` for just those items). Items
with a model in `public/models/` are rendered from it; the rest are modelled in that script.
If a picture is missing, the game draws the item in code instead (`src/itemIcons.js`).

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
