# Sounds

The game makes all of its sounds itself (see `src/sounds.js`), so this folder can stay empty.
To use a recording instead, put a file here named after the sound, as `.mp3`, `.ogg` or
`.wav`. When the game finds one, it plays the recording in place of the made-up sound.

| File name | When it plays | How |
| --- | --- | --- |
| `wind` | Always outdoors; louder up the mountains | Looping |
| `crickets` | At night, outdoors | Looping |
| `water` | Near a lake or the river | Looping |
| `fire` | Near a burning campfire | Looping |
| `cave` | Down a cave (a low hum) | Looping |
| `birds` | By day, now and then | Played once each time, a little higher or lower |
| `owl` | At night, now and then | Played once |
| `drip` | Down a cave, now and then (with an echo) | Played once |
| `bat` | Down a cave, now and then | Played once |

Loops should start and end cleanly, so the join can't be heard. Keep the files short and
small (under about 1 MB each), because they're downloaded when the game starts. Free
recordings are available at freesound.org (check each one's licence) or sonniss.com.

Press N in the game to turn the sound off and on.
