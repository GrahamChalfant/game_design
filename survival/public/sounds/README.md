# Sounds

The game can make all of its sounds itself (see `src/sounds.js`). To use a recording instead,
put a file here named after the sound, as `.mp3`, `.ogg` or `.wav`. When the game finds one,
it plays the recording in place of the made-up sound.

The recordings here now (wind, water, fire, cave, owl, wolf, raven, chop, tree-fall and
the grass, dirt, gravel and snow footsteps) are public-domain (CC0) field recordings from
Freesound, cut and levelled for the game. [CREDITS.md](CREDITS.md) lists where each came from.

| File name | When it plays | How |
| --- | --- | --- |
| `wind` | Always outdoors; louder up the mountains | Looping |
| `water` | Near a lake or the river | Looping |
| `fire` | Near a burning campfire | Looping |
| `cave` | Down a cave (a low hum) | Looping |
| `junco`, `chickadee`, `jay`, `raven` | By day, now and then (rarely: the north is quiet, and quieter still in the cold): a dark-eyed junco's "tsip" calls or trill, a boreal chickadee, a Canada jay, or a common raven | Played once each time, from somewhere around you, a little higher or lower (every one-off sound is) |
| `birds` | If there's a recording called this, it's played in place of all four birds above | Played once |
| `owl` | At night, now and then (a great horned or a boreal owl) | Played once |
| `wolf` | At night, now and then, far off | Played once |
| `lynx` | At night, now and then: a Canada lynx yowling out in the woods | Played once |
| `ice` | Out by a lake: the ice along its edges cracking, pinging, groaning and singing as it cools, more at night | Played once, from somewhere around you |
| `deer-snort`, `deer-bleat`, `deer-step`, `deer-run` | A deer nearby: snorting as it spots you and bolts, bleating now and then while it grazes, walking, and galloping off | Played once, from where the deer is |
| `drip` | Down a cave, now and then (with an echo) | Played once |
| `bat` | Down a cave, now and then | Played once |
| `sizzle` | Meat cooking on a fire | Looping |
| `step-grass`, `step-dirt`, `step-gravel`, `step-rock`, `step-snow`, `step-wood`, `step-water` | One footstep on that ground (dirt is also the road; wood is floors, logs and the tower; rock is boulders and caves) | Played once each time a foot comes down in the walking animation |
| `swim` | One swimming stroke | Played once |
| `splash` | Wading into deep water | Played once |
| `land` | Landing from a jump | Played once |
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
recordings are available at freesound.org (check each one's licence) or sonniss.com; add
each one you use to [CREDITS.md](CREDITS.md).

How loud to make a file: the game turns each sound up or down itself, so match these. Footsteps
play at full volume, so they peak around -14 dB; the chop around -8 dB; the tree falling -3 dB;
animals call from 20–50 m away, so they peak at -1 dB. Loops are levelled to about -20 LUFS
(the cave -22).

Press N in the game to turn the sound off and on.
