# Models

Put 3D models exported from Blender here as `.glb` files
(File → Export → glTF 2.0, format "glTF Binary").

The game looks for these names and uses them in place of its stand-in shapes.
Triangle counts are for the current exports; sources are in `survival/blender/`.

| File | What it is | Tris | Source |
| --- | --- | --- | --- |
| `player.glb` | Survivor, smooth shaded, baked crease shading: `player` = body in a plaid wool shirt (sculpted face, groomed beard and hair, ribbed beanie, gloves, trousers, laced boots); `player-jacket` = quilted red puffer jacket and knitted scarf, shown once worn (outfits.js); `player-pack` = the backpack.glb mesh on the spine. Rigged with foot bones; animations idle, walk (a jog), sneak, crouch, jump, chop, drink, swim, die (blender/player_anim.py) | ~29,000 + jacket | blender/survivor.py |
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
| `stalagmite.glb` | Cave stalagmite ~1 m, wet limestone with growth rings | 1,596 | blender/props_smooth.py |
| `backpack.glb` | Canvas rucksack, smooth (lid, front and side pockets, webbing, padded shoulder straps, rust bedroll on top), upright, origin base centre; straps toward +Z, pocket toward -Z (glTF). Same mesh as the worn `player-pack` | 2,928 | blender/props_smooth.py |
| `campfire.glb` | Ring of 15 nearly-touching stones built from `rock-small`/`rock` (mossy vertex paint), log teepee, embers, crossed-blade flame, ~0.95 m across | 1,594 | blender/remake.py |
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
