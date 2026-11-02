# Models

Put 3D models exported from Blender here as `.glb` files
(File → Export → glTF 2.0, format "glTF Binary").

The game looks for these names and uses them in place of its stand-in shapes.
Triangle counts are for the current exports; sources are in `survival/blender/`.

| File | What it is | Tris | Source |
| --- | --- | --- | --- |
| `player.glb` | Survivor (rigged, animated; `hand_R` bone, `player-pack` mesh = the backpack.glb mesh, skinned to `spine`) | 864 | player.blend |
| `axe.glb` | Hand axe held by the player (material `tool`) | 56 | player.blend |
| `deer.glb` | Deer (rigged) | 536 | animals.blend |
| `rabbit.glb` | Rabbit (rigged) | 272 | animals.blend |
| `suitcase.glb` | Washed-up suitcase with `lid` | 356 | animals.blend |
| `plane.glb` | Crashed plane wreck | 448 | plane.blend |
| `plane-wing.glb` | Detached plane wing | 72 | plane.blend |
| `shelter.glb` | A-frame hide shelter, single vertex-colour material | 1,076 | shelter.py (generates shelter.blend) |
| `bow.glb` | Self bow, 1.40 m, hide grip, string; origin at grip centre, string toward +Y (archer) | 188 | hunting_props.py |
| `arrow.glb` | Arrow, 0.70 m, stone head, 3 vanes; origin at the nock, points -Y | 40 | hunting_props.py |
| `stone.glb` | Fist-sized throwing stone, ~0.095 m; origin at base centre | 28 | hunting_props.py |
| `backpack.glb` | Canvas backpack (greens, rust bedroll), upright, origin base centre; straps toward +Z, pocket toward -Z (glTF). Same mesh as the worn `player-pack` | 204 | backpack.py |
| `campfire.glb` | Ring of 15 nearly-touching stones built from `rock-small`/`rock` (mossy vertex paint), log teepee, embers, crossed-blade flame, ~0.95 m across | 861 | camp_props.py |
| `log-pile.glb` | 4-3-2 stack of 1.2 m logs with two stakes | 204 | camp_props.py |
| `stump.glb` | Tree stump with root flares, ~0.45 m tall | 90 | camp_props.py |
| `trap.glb` | Figure-4 deadfall: propped stone slab, trigger sticks, bait; open side faces -Y | 106 | camp_props.py |
| `pine.glb`, `pine-small.glb`, `pine-skinny.glb`, `pine-tall.glb`, `pine-wide.glb` | Pines | 188–448 | trees.blend |
| `pine-snow.glb`, `pine-small-snow.glb` | Snowy pines | 1,124 / 548 | trees.blend |
| `sapling-pine.glb`, `sapling-broadleaf.glb` | Saplings | 144 / 288 | trees.blend |
| `broadleaf.glb` | Field tree | 614 | trees.blend |
| `tree-dead.glb` | Bare dead tree | 272 | trees.blend |
| `rock.glb`, `rock-small.glb`, `rock-flat.glb`, `rock-tall.glb`, `rock-large.glb` | Rocks | 44–140 | rock.blend |
| `grass-tuft.glb`, `grass-short.glb`, `grass-clump.glb`, `grass-sparse.glb`, `grass-wide.glb`, `grass-wisp.glb`, `grass-tall.glb`, `grass-seed.glb`, `grass-fern.glb` | Grass tufts, painted grey (tinted by the ground) | 9–45 | grass.blend |
| `berry-bush.glb` | Berry bush, rust berry clusters; origin base centre | 258 | food_props.py |
| `berry.glb` | Berry pickup (3 berries + leaf) | 25 | food_props.py |
| `knife.glb` | Stone knife, wood handle, slate blade; origin grip centre, blade along +Z Blender / +Y glTF (like axe), edge toward -Y | 76 | food_props.py |
| `boar.glb` | Boar, static (unrigged), faces -Y, origin at feet | 422 | food_props.py |

**Wanted (placeholders in code until these land):**
- `berry-bush.glb` — low bush ~0.9 m, origin base centre; berries as a child node named `berries` (hidden when picked).
- `knife.glb` — stone knife ~0.3 m, origin at the grip, blade along +Y (attached to `hand_R` like the bow).
- `boar.glb` — boar ~0.8 m at shoulder, facing +Z; optional clips `boar-idle`, `boar-graze`, `boar-walk`, `boar-run` (same naming as deer/rabbit).

Style, palette and poly budgets: `survival/blender/STYLE_GUIDE.md`.
See "Adding models from Blender" in `survival/README.md` for sizes and orientation.
