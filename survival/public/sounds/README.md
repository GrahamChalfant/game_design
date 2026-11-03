# Sounds

The game makes all of its sounds itself (see `src/sounds.js`), so this folder can stay empty.
To use a recording instead, put a file here named after the sound, as `.mp3`, `.ogg` or
`.wav`. When the game finds one, it plays the recording in place of the made-up sound.

| File name | When it plays | How |
| --- | --- | --- |
| `wind` | Always outdoors; louder up the mountains | Looping |
| `water` | Near a lake or the river | Looping |
| `fire` | Near a burning campfire | Looping |
| `cave` | Down a cave (a low hum) | Looping |
| `sparrow`, `chickadee`, `jay`, `raven`, `grouse` | By day, now and then: a white-throated sparrow, a boreal chickadee, a Canada jay, a common raven, or a ruffed grouse drumming (more often deep in the trees) | Played once each time, from somewhere around you, a little higher or lower (every one-off sound is) |
| `birds` | If there's a recording called this, it's played in place of all five birds above | Played once |
| `owl` | At night, now and then (a great horned or a boreal owl) | Played once |
| `wolf` | At night, now and then, far off | Played once |
| `loon` | A common loon on the lake, mostly at night; more often near the water | Played once |
| `mosquito` | One flying past your ear, by the water and at night, unless it's cold | Played once |
| `deer-snort`, `deer-bleat`, `deer-step`, `deer-run` | A deer nearby: snorting as it spots you and bolts, bleating now and then while it grazes, walking, and galloping off | Played once, from where the deer is |
| `drip` | Down a cave, now and then (with an echo) | Played once |
| `bat` | Down a cave, now and then | Played once |
| `sizzle` | Meat cooking on a fire | Looping |
| `step-grass`, `step-dirt`, `step-gravel`, `step-rock`, `step-snow`, `step-wood`, `step-water` | One footstep on that ground (dirt is also the road; wood is floors, logs and the tower; rock is boulders and caves) | Played once per step |
| `swim` | One swimming stroke | Played once |
| `splash` | Wading into deep water | Played once |
| `land` | Landing from a jump | Played once |
| `boar-charge` | A boar starting to charge | Played once, from where the boar is |
| `hit`, `hurt` | Getting hit (a thud), and the player's grunt | Played once |
| `chop` | The axe biting into a tree | Once per swing |
| `tree-creak`, `tree-fall` | A tree giving way, then crashing down a second later | Played once |
| `bow-draw`, `bow-shoot` | Drawing the bow, and letting go | Played once |
| `arrow-hit`, `arrow-land` | An arrow hitting an animal, or the ground | Played once, from where it lands |
| `stab` | A knife stab | Played once |
| `chew`, `gulp` | Eating, drinking (from the water or a flask) | Over and over while you eat or drink |
| `rummage` | Searching a suitcase, crate or chest | Over and over while you search |
| `bandage` | Winding a bandage | Over and over while you bandage up |
| `pickup` | Picking something up, or finding things in a search | Played once |
| `cloth` | Putting on clothes or the backpack | Played once |
| `fire-light`, `add-wood` | Lighting a campfire, adding a log | Played once |
| `trap-set` | Setting a trap | Played once |

Loops should start and end cleanly, so the join can't be heard. Keep the files short and
small (under about 1 MB each), because they're downloaded when the game starts. Free
recordings are available at freesound.org (check each one's licence) or sonniss.com.

Press N in the game to turn the sound off and on.
