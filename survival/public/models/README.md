# Models

Put 3D models exported from Blender here as `.glb` files
(File → Export → glTF 2.0, format "glTF Binary").

The game looks for these names and uses them in place of its stand-in shapes.
Triangle counts are for the current exports; sources are in `survival/blender/`.

| File | What it is | Tris | Source |
| --- | --- | --- | --- |
| `player.glb` | Survivor, smooth shaded, baked crease shading: `player` = body in a plaid flannel shirt worn untucked (curved shirttail, folds at the waist and back, a two-part collar with points, flapped chest pockets, buttoned cuffs, creased sleeves), work trousers bloused over laced boots with padded tops, wool gloves, sculpted face, groomed beard and hair, ribbed beanie; `player-jacket` = quilted red puffer jacket (padded hem and collar with the lining showing, ribbed cuffs, sleeves lipped over them) and knitted scarf, shown once worn (outfits.js). Every hem, cuff and collar has the cloth's thickness (survivor.py's cloth_edge); `player-pack` = the backpack.glb mesh on the spine. Rigged with foot bones; animations idle, walk (a brisk walk, 3.4 m/s), run (a hard run, 5.2 m/s at 180 steps a minute: two strides that vary a little, each joint flowing round its own loop, with follow-through in the arms and torso), sneak, crouch, jump, chop, drink, swim, die (blender/player_anim.py) | ~45,000 + jacket | blender/survivor.py |
| `axe.glb` | Hand axe held by the player (material `tool`) | 128 | blender/remake.py |
| `deer.glb` | White-tailed buck in winter coat, smooth shaded, antlers; rigged, animations `deer-graze`, `deer-idle`, `deer-walk`, `deer-run` | 5,774 | blender/deer.py |
| `rabbit.glb` | Rabbit (rigged) | 1,632 | blender/smooth_rigged.py |
| `suitcase.glb` | Washed-up suitcase with `lid` | 720 | blender/remake.py |
| `plane.glb` | Crashed bush plane: smooth hull, window openings with seals and glass (material `glass`, see-through in the game), cracked and smashed windscreen, cabin interior (panel, yokes, seats), bent propeller | 14,900 | blender/plane.py |
| `plane-wing.glb` | Detached plane wing | 640 | blender/plane.py |
| `shelter.glb` | A-frame hide shelter, single vertex-colour material | 916 | blender/remake.py |
| `bow.glb` | Self bow, 1.40 m, hide grip, string; origin at grip centre, string toward +Y (archer) | 188 | hunting_props.py |
| `arrow.glb` | Arrow, 0.70 m, stone head, 3 vanes; origin at the nock, points -Y | 40 | hunting_props.py |
| `stone.glb` | Fist-sized throwing stone, ~0.09 m, smooth; origin at base centre (material `pebble`) | 1,280 | blender/props_smooth.py |
| `clod.glb` | Clod of soil and turf thrown up along the crash, grass growing from it | 1,712 | blender/props_smooth.py |
| `debris.glb` | Torn sheet metal off the plane: three bent panels, painted and scraped outside, bare inside | 2,536 | blender/props_smooth.py |
| `landing-wheel.glb` | The plane's torn-off wheel: tyre, hub, bent leg, lying on its side | 4,112 | blender/props_smooth.py |
| `fallen-log.glb` | Fallen log, 1 m unit (stretched per copy): furrowed bark, moss, broken ends | 2,280 | blender/props_smooth.py |
| `trunk-snapped.glb` | A spruce trunk the plane snapped off on its way in: 0.3 m radius, bark torn into ragged points from 2.2 m up, pale splintered wood and spears to ~2.9 m; origin at the base, tallest splinters toward +x (the game stretches its height; see src/flightPath.js) | 844 | blender/props_smooth.py |
| `root-plate.glb` | The roots and soil an uprooted spruce tears up, stood on edge: ~2 m across, centred 0.8 m up, turf side toward +x (where the trunk lies), earth and crooked roots toward -x, churned soil heaped behind | 3,160 | blender/props_smooth.py |
| `stalagmite.glb` | Cave stalagmite ~1 m, wet limestone with growth rings | 1,596 | blender/props_smooth.py |
| `backpack.glb` | Canvas rucksack, smooth (lid, front and side pockets, webbing, padded shoulder straps, rust bedroll on top), upright, origin base centre; straps toward +Z, pocket toward -Z (glTF). Same mesh as the worn `player-pack` | 2,928 | blender/props_smooth.py |
| `campfire.glb` | Ring of 15 nearly-touching stones built from `rock-small`/`rock` (mossy vertex paint), log teepee, embers, crossed-blade flame, ~0.95 m across | 1,594 | blender/remake.py |
| `spit.glb` | A cooking spit over the campfire: two forked sticks 1.24 m apart and a peeled skewer 0.8 m up, with a steak threaded on it (`spit-meat`: the same cut as the steak in your hand, `prop-steak`, a little bigger; its origin on the skewer, pale for the game to tint raw, cooked or burnt; the game copies it for up to three pieces) | 860 | blender/spit.py, blender/hand_props.py |
| `sticks.glb` | Three fallen spruce branches lying together, barked, with twigs and broken ends: a pile of sticks on the ground, and the Sticks icon | 368 | blender/sticks.py |
| `observatory.glb` | The observatory: a round dry-stone tower 4.2 m in radius, a copper dome (`observatory-roof`) with its shutter slit open to the front, the door at the front (+z), a plank floor and the big telescope on its pier inside, and a paved terrace out in front (to 10.5 m) with an iron railing and a spyglass on a tripod | 6,498 | blender/landmarks.py |
| `bridge-broken.glb` | The footbridge over the ravine, broken: each end's planks on two log stringers out to 4.4 m from the middle, posts and hand ropes, planks and rope hanging into the gap | 692 | blender/landmarks.py |
| `dock.glb` | The lakeshore dock: weathered planks on joists and posts, from the shore (origin, deck top) 14 m out along +z, a cleat and a coil of rope | 1,024 | blender/landmarks.py |
| `barn.glb` | The farm's barn: red board-and-batten walls 10 × 14 m, white trim, big doors open at the front (+z), hay inside, a gambrel roof (`barn-roof`) | 4,872 | blender/landmarks.py |
| `stone-hut.glb` | The blizzard shelter: a dry-stone hut 3.6 × 4.2 m with a low door at the front, a bench and an iron stove inside, a turf roof (`stone-hut-roof`) | 10,988 | blender/landmarks.py |
| `hand-props.glb` | Small things held in the first-person view, each standing up along +y from where the hand grips it: `prop-lighter` (red body, steel hood and wheel; flame at y 0.05), `prop-matchbox` (kraft box, red label, strikers down the sides, drawer pushed out), `prop-match` (red head; flame at y 0.036), `prop-flask` (flat canvas-covered body, steel neck and cap), `prop-steak` (a thick uneven slab with a rim of fat and marbling, pale: the game tints it raw, cooked or burnt) | 1,628 | blender/hand_props.py |
| `fp-hands.glb` | Your hands in the first-person view, gloved, with jointed fingers: `fp-r-hand` / `fp-l-hand` (the palm, with the ribbed cuff), each finger in three segments `fp-r-index-1/2/3` (and middle, ring, pinky, thumb), each its own part with its origin at its knuckle, bending round its own y (the thumb swings round y and curls round x); `fp-right-sleeve` / `fp-left-sleeve` parented to the palm, pale (tinted to what you're wearing). The game bends the fingers to grip things (src/handRig.js) | 7,456 | blender/fp_hands.py |
| `log-pile.glb` | 4-3-2 stack of 1.2 m logs with two stakes | 1,020 | blender/remake.py |
| `stump.glb` | Tree stump with root flares, ~0.45 m tall | 248 | blender/remake.py |
| `trap.glb` | Spring-pole snare: stake, bent sapling with needle tufts, cord and a wide noose lying open in front (-Y), ~0.7 m across | 278 | blender/remake.py |
| `pine.glb`, `pine-small.glb`, `pine-skinny.glb`, `pine-tall.glb`, `pine-wide.glb` | Spruce | 2,322 / 1,752 / 4,165 / 4,032 / 2,645 | blender/conifers.py |
| `pine-snow.glb`, `pine-small-snow.glb` | Snowy spruce | 2,243 / 1,749 | blender/conifers.py |
| `sapling-pine.glb` | Sapling | 897 | blender/conifers.py |
| `near/pine.glb` … `near/sapling-pine.glb` | The same spruce in needle cards, drawn within 26 m of the player | 2,488–12,120 | blender/conifers.py (DETAIL) |
| `tree-dead.glb` | Bare dead tree | 1,265 | blender/remake.py |
| `rock.glb`, `rock-small.glb`, `rock-flat.glb`, `rock-tall.glb`, `rock-large.glb` | Rocks | 1,280 / 320 / 1,280 / 1,280 / 1,280 | blender/remake.py |
| `grass-fern.glb` | Fern, pale (tinted by the ground; the grass tufts themselves are drawn in code) | 256 | blender/remake.py |
| `berry-bush.glb` | Berry bush, rust berry clusters; origin base centre | 1,298 | blender/remake.py |
| `berry.glb` | Berry pickup (a sprig of 3 berries, stems, 2 leaves) | 1,268 | blender/props_smooth.py |
| `knife.glb` | Stone knife, wood handle, slate blade; origin at the guard (top of the handle wrap), blade along +Z Blender / +Y glTF (like axe), edge toward -Y | 76 | food_props.py |

**Wanted (placeholders in code until these land):**
- `berry-bush.glb` — low bush ~0.9 m, origin base centre; berries as a child node named `berries` (hidden when picked).
- `knife.glb` — landed; origin at the guard, blade +Y, on `hand_R` (code nudges it 1 cm so the fist holds the handle).

Style, palette and poly budgets: `survival/blender/STYLE_GUIDE.md`.
See "Adding models from Blender" in `survival/README.md` for sizes and orientation.

**How these are made:** most come from four scripts (run them in an open Blender, via the Blender MCP or the Text Editor):
- `blender/plane.py` builds the crashed plane and its broken-off wing;
- `blender/props_smooth.py` (with `blender/smoothkit.py`) builds the clods, debris, landing wheel, throwing stone, berries, fallen log, stalagmite and backpack;
- `blender/remake.py` builds rocks, dead wood, the plane's scattered wreckage, the containers, camp props, the shelter, bones, the axe and more from scratch;
- `blender/fine.py` runs `places.py`, `lookout.py` and `props.py` with finer parts (rounder logs, bevelled boards). Run on their own, those make the old low-poly versions;
- `blender/smooth_rigged.py` rounds off the rigged animals (the deer, rabbit and the like) under their rigs;
- `blender/conifers.py` makes the spruce, and with `DETAIL = True` the needle-card versions in `near/` that are drawn near the player.
The grass tufts are cards of fine blades, drawn in code (`src/look.js`).
