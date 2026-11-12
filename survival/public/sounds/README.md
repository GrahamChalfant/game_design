# Sounds

Every sound in the game is a recording here, named after the sound (`.mp3`, `.ogg` or `.wav`);
the game makes no sounds of its own, so a sound with no recording isn't heard. A one-off sound
can have several takes (`raven.mp3`, `raven-2.mp3`, `raven-3.mp3`, and so on, up to 8): each
time it plays, one is picked at random.

They're recordings from Freesound, public domain (CC0) or free to use with credit (CC BY), cut
and levelled for the game. [CREDITS.md](CREDITS.md) lists each one: where it came from, who
recorded it, its licence and the stretch used.

To listen to every sound on its own, run the game's server (`python3 serve.py`) and open
http://localhost:8000/listen.html: a button per sound, and one per take.

| File name | When it plays | How |
| --- | --- | --- |
| `wind` | A breeze in the trees, always outdoors; louder up the mountains and on a windy day | Looping |
| `gale` | Out in a blizzard (it drowns the breeze) | Looping |
| `gale-indoors` | A blizzard heard from indoors: in a shelter, cabin or tower, or (quieter) down a cave | Looping |
| `river` | Near the river (and, quieter, a creek), and the waterfall (from up to 80 m away). A lake is still: no sound of its own | Looping |
| `sea` | The sea's roar, from up to 250 m inland: louder and clearer the nearer the shore, only its low rumble from further off | Looping |
| `sea-wind` | The wind off the open sea, down on the shore (less in the trees) | Looping |
| `wave`, `wave-2` … `wave-4` | A wave breaking on the shingle and dragging back over the stones, every 5–10 s while you can hear the sea, from the shore near you (heard five times as far as most sounds) | Played once |
| `roof-rattle` | In a shelter on a windy day, and hard in a blizzard: the wind shaking the roof | Looping |
| `creak`, `branch-fall` | In the woods in a strong wind: trunks creaking round you, and now and then a branch cracking and coming down | Played once, from somewhere around you |
| `shiver` | Freezing: your teeth chattering, or a "brr", every few seconds | Played once |
| `brush`, `twig` | Pushing through the boughs of a tree or a bush: a rustle every step or so, and now and then a twig snapping | Played once each time |
| `fire` | Near a burning campfire | Looping |
| `junco`, `chickadee`, `raven` | By day, now and then (rarely: the north is quiet, and quieter still in the cold): a dark-eyed junco's "tsip" calls or trill, a chickadee (black-capped: they winter in the southern Yukon too), or a common raven's croak | Played once each time, from somewhere around you, a little higher or lower (every one-off sound is) |
| `owl` | At night, now and then (a great horned or a boreal owl) | Played once |
| `wolf` | At night, now and then, far off | Played once |
| `deer-snort`, `deer-bleat`, `deer-step`, `deer-run` | A deer nearby: snorting as it spots you and bolts (a horse's snort: it's the same sharp blow), bleating now and then while it grazes, walking on the leaves, and running off | Played once, from where the deer is |
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
| `swing` | The axe swung through the air (missing) | Played once |
| `chew`, `gulp` | Eating, drinking (from the water or a flask) | Over and over while you eat or drink |
| `rummage` | Searching a suitcase, crate or chest | Over and over while you search |
| `bandage` | Winding a bandage | Over and over while you bandage up |
| `pickup` | Picking something up, or finding things in a search | Played once |
| `cloth` | Putting on clothes or the backpack | Played once |
| `fire-light`, `add-wood` | Lighting a campfire, adding a log | Played once |
| `trap-set` | Setting a trap | Played once |

Loops should start and end cleanly, so the join can't be heard. Keep the files short and
small (under about 1 MB each), because they're downloaded when the game starts. Free
recordings are at freesound.org: use only CC0 or CC BY ones (not NonCommercial), and add each
one you use to [CREDITS.md](CREDITS.md).

How loud to make a file: level each take by how loud it sounds, not by its peak: about -20 LUFS
(EBU R128) for one-off sounds, -26 for footsteps, its peaks under -1.5 dB. The game sets them
against each other (LEVEL in `src/sounds.js`) and makes far-off ones quieter.

Press N in the game to turn the sound off and on.
