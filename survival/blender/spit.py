# The cooking spit (spit.glb) that stands over a campfire (src/campfires.js): two forked sticks
# driven in either side of the fire ring (which is 0.4 m across to the stones' middles), a
# peeled green stick across the forks for the skewer, and on it a piece of meat ("spit-meat",
# its origin on the skewer, so the game can turn it and shows it only while there's meat on).
# The meat is pale here: the game tints it raw red, cooked brown or burnt black.
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python spit.py
import math, os, random, runpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, export, shared, tone, blend, PAL = R['Builder'], R['build'], R['export'], R['shared'], R['tone'], R['blend'], R['PAL']
tube, end_grain, bark_colour, g = R['tube'], R['end_grain'], R['bark_colour'], R['g']
build_hinged = R['build_hinged']

PAL.update(green_wood=0xc9b48a, green_wood_dark=0xa8925f, meat_pale=0xeadbd2, meat_fat=0xf6efe6)

SIDE = 0.62  # the forks stand this far either side of the fire's middle
BAR = 0.8  # the skewer's height, resting in the forks (clear of the logs, in the flames' tips)
random.seed(77)


def forked_stick(b, x, seed):
    """A stick driven into the ground at (x, 0), forking near the top to hold the skewer."""
    lean = random.uniform(-0.03, 0.03)
    base = Vector((x, -0.12, 0))
    fork = Vector((x + lean, BAR - 0.05, 0.0))
    path = [(base, 0.026), (base.lerp(fork, 0.5) + Vector((0, 0, random.uniform(-0.01, 0.01))), 0.023), (fork, 0.02)]
    rings = tube(b, path, 7, bark_colour(seed, peel=0.2), rough=0.06, seed=seed)
    # Two prongs, splayed along z so the skewer lies between them.
    for side in (-1, 1):
        tip = fork + Vector((random.uniform(-0.01, 0.01), 0.14, side * 0.055))
        prong = [(fork, 0.017), (fork.lerp(tip, 0.5), 0.014), (tip, 0.011)]
        prong_rings = tube(b, prong, 6, bark_colour(seed + side, peel=0.2), rough=0.05, seed=seed + side)
        end_grain(b, prong_rings[-1], tip, (tip - fork).normalized())
    return rings


b = Builder()
forked_stick(b, -SIDE, 3)
forked_stick(b, SIDE, 9)

# The skewer: a peeled green stick, pale, a bit longer than the gap, its ends cut.
def peeled(t, a, normal):
    return blend('green_wood_dark', 'green_wood', 0.5 + 0.5 * math.sin(t * 9 + a), 0.04)


left, right = Vector((-SIDE - 0.12, BAR, 0)), Vector((SIDE + 0.12, BAR + 0.01, 0))
path = [(left.lerp(right, k / 6) + Vector((0, 0.006 * math.sin(k * 1.7), 0)), 0.014) for k in range(7)]
rings = tube(b, path, 6, peeled, rough=0.04, seed=5)
end_grain(b, rings[0], path[0][0], Vector((-1, 0, 0)))
end_grain(b, rings[-1], path[-1][0], Vector((1, 0, 0)))
frame = build('spit', b, shared('spit-wood'))

# The meat: a lumpy roast threaded on the skewer, pale (the game tints it), streaked with fat.
def flesh(t, a, normal):
    fat = math.sin(t * 11 + math.cos(a) * 2) > 0.75
    return tone('meat_fat' if fat else 'meat_pale', 0.05)


m = Builder()
profile = [0.012, 0.055, 0.075, 0.08, 0.072, 0.078, 0.06, 0.012]
path = [(Vector((-0.15 + 0.3 * k / (len(profile) - 1), BAR + 0.004 * math.sin(k * 2.1), 0)), r) for k, r in enumerate(profile)]
tube(m, path, 10, flesh, rough=0.22, seed=12)
meat = build_hinged('spit-meat', m, shared('spit-meat', 0.8), (0, BAR, 0))

export([frame, meat], 'spit.glb')
print('@@ spit done')
