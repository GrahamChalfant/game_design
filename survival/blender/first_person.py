# Your own arms in the first-person view (fp-arms.glb; see src/handView.js): each a sleeve
# from the wrist back towards the elbow, with soft folds and a cuff, and a hand in a dark wool
# glove, closed in a fist round a handle (to hold the axe, the knife, the torch, or the bow).
#   fp-right-glove, fp-right-sleeve, fp-left-glove, fp-left-sleeve
# Each is built round its hand's grip: the handle runs up through the fist along +y, the
# knuckles face ahead (-z) and the forearm runs back (+z) towards you. The sleeves are pale:
# the game tints them the colour of what you're wearing (shirt, jacket or parka).
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python first_person.py
import math, os, random, runpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, export, shared, tone, blend, PAL = R['Builder'], R['build'], R['export'], R['shared'], R['tone'], R['blend'], R['PAL']
tube, rounded_box = R['tube'], R['rounded_box']

PAL.update(fp_glove=0x3a3632, fp_glove_dark=0x2a2725, fp_glove_cuff=0x2e2a28, fp_cloth=0xe8e6e2, fp_cloth_fold=0xb4b1ab)
random.seed(91)


def glove(side):
    """The gloved fist. `side` is 1 for the right hand, -1 for the left (mirrored across x)."""
    b = Builder()
    m = lambda x, y, z: (x * side, y, z)
    wool = lambda c, n: tone('fp_glove_dark' if n.y < -0.4 else 'fp_glove', 0.03)
    # The palm and the back of the hand, closed round the grip.
    lo, hi = m(-0.03, -0.048, -0.03), m(0.046, 0.048, 0.05)
    rounded_box(b, tuple(min(a, c) for a, c in zip(lo, hi)), tuple(max(a, c) for a, c in zip(lo, hi)), 0.02, wool)
    # Four fingers curled round the front of the handle, stacked up it, the knuckles standing out.
    for k, y in enumerate((0.034, 0.012, -0.01, -0.031)):
        h = 0.0205 if k < 3 else 0.018
        lo, hi = m(-0.036, y - h / 2, -0.05), m(0.04, y + h / 2, -0.016)
        rounded_box(b, tuple(min(a, c) for a, c in zip(lo, hi)), tuple(max(a, c) for a, c in zip(lo, hi)), 0.009, wool)
        knuckle = Vector(m(0.038, y, -0.03))
        tube(b, [(knuckle + Vector((0, 0, -0.012)), 0.0095), (knuckle + Vector((0, 0, 0.012)), 0.0095)], 6, lambda t, a, n: tone('fp_glove', 0.03), rough=0.02)
    # The thumb, wrapped over the fingers on the inside.
    tube(b, [(Vector(m(-0.034, 0.03, 0.02)), 0.014), (Vector(m(-0.04, 0.036, -0.012)), 0.013), (Vector(m(-0.028, 0.04, -0.034)), 0.011)], 8,
         lambda t, a, n: tone('fp_glove', 0.03), rough=0.03)
    # The wrist, and the glove's ribbed cuff.
    tube(b, [(Vector(m(0.008, 0, 0.045)), 0.04), (Vector(m(0.008, 0, 0.085)), 0.038)], 10, lambda t, a, n: tone('fp_glove', 0.03), rough=0.02)
    rings = tube(b, [(Vector(m(0.008, 0, 0.08)), 0.044), (Vector(m(0.008, 0, 0.12)), 0.045)], 12,
                 lambda t, a, n: tone('fp_glove_cuff', 0.0, 0.9 if int(a * 12 / math.tau) % 2 else 1.0), rough=0.0)
    return build('fp-right-glove' if side > 0 else 'fp-left-glove', b, shared('fp-glove', 0.95))


def sleeve(side):
    """The sleeve, from the wrist back past the edge of the view, with soft folds in the cloth."""
    b = Builder()
    path = []
    for i in range(14):
        t = i / 13
        z = 0.105 + t * 0.5
        fold = 0.004 * math.sin(t * 19 + side) + 0.003 * math.sin(t * 7.3)
        path.append((Vector((side * (0.008 + t * 0.03), -t * 0.02, z)), 0.05 + t * 0.016 + fold))
    def cloth(t, a, n):
        # Creases down the folds (darker), pale on top where the light catches it.
        crease = 0.5 + 0.5 * math.sin(t * 19 + a * 2.0 + side)
        return blend('fp_cloth_fold', 'fp_cloth', 0.55 + 0.45 * crease * (0.6 + 0.4 * max(0.0, n.y)), 0.02)
    tube(b, path, 14, cloth, rough=0.03, seed=7 + side)
    # A turned-back cuff at the wrist.
    tube(b, [(Vector((side * 0.008, 0, 0.1)), 0.057), (Vector((side * 0.008, 0, 0.135)), 0.058)], 14, lambda t, a, n: blend('fp_cloth_fold', 'fp_cloth', 0.7, 0.02), rough=0.01)
    return build('fp-right-sleeve' if side > 0 else 'fp-left-sleeve', b, shared('fp-sleeve', 0.95))


export([glove(1), sleeve(1), glove(-1), sleeve(-1)], 'fp-arms.glb')
print('@@ first person done')
