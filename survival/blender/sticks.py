# A few fallen sticks lying together (sticks.glb): what a pile of sticks looks like on the ground
# (src/pickups.js), and the Sticks item's icon (icons.py). Each is a crooked, barked spruce branch
# about 0.6–0.8 m long and two or three centimeters thick, with a twig or two and broken ends,
# lying in the litter at the origin.
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python sticks.py
import math, os, random, runpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, export, shared = R['Builder'], R['build'], R['export'], R['shared']
tube, end_grain, bark_colour = R['tube'], R['end_grain'], R['bark_colour']

random.seed(41)


def branch(b, start, heading, length, radius, seed, twigs=2):
    """A crooked branch from `start` along `heading` (radians, on the ground), with twigs."""
    d = Vector((math.cos(heading), 0, math.sin(heading)))
    side = Vector((-d.z, 0, d.x))
    steps = 5
    path = []
    for k in range(steps + 1):
        t = k / steps
        bend = side * (0.04 * math.sin(t * math.pi * 1.3 + seed))
        p = start + d * (length * t) + bend + Vector((0, radius + 0.004 * math.sin(k * 2.3), 0))
        path.append((p, radius * (1 - 0.35 * t)))
    rings = tube(b, path, 6, bark_colour(seed, peel=0.3), rough=0.08, seed=seed)
    end_grain(b, rings[0], path[0][0], -d, jagged=0.02)
    end_grain(b, rings[-1], path[-1][0], d, jagged=0.03)
    for k in range(twigs):
        t = random.uniform(0.3, 0.8)
        base = path[int(t * steps)][0]
        a = heading + random.choice((-1, 1)) * random.uniform(0.5, 0.9)
        tip = base + Vector((math.cos(a), 0, math.sin(a))) * random.uniform(0.1, 0.18) + Vector((0, 0.01, 0))
        twig = [(base, radius * 0.45), (base.lerp(tip, 0.5), radius * 0.35), (tip, radius * 0.22)]
        tube(b, twig, 4, bark_colour(seed + k + 7, peel=0.2), rough=0.05, seed=seed + k)


b = Builder()
branch(b, Vector((-0.34, 0, -0.08)), 0.12, 0.72, 0.016, 1)
branch(b, Vector((-0.28, 0, 0.12)), -0.22, 0.62, 0.013, 4)
branch(b, Vector((-0.1, 0.03, -0.24)), 0.95, 0.5, 0.012, 9, twigs=1)
export([build('sticks', b, shared('sticks-wood'))], 'sticks.glb')
print('@@ sticks done')
