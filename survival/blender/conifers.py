# Generates the spruce in survival/public/models/: pine, pine-tall, pine-small, pine-skinny,
# pine-wide, pine-snow, pine-small-snow and sapling-pine.
# Run: blender -b --python conifers.py
# (or from the Blender MCP / Text Editor in an open Blender: then the trees are also left in a
# "Spruce" collection, in a row, to look at; your scene is otherwise left alone)
#
# Made to be looked at from the ground (the over-the-shoulder and first-person views) as well
# as from above. Each tree is a straight, tapering trunk, bare for the bottom stretch, with
# whorls of separate drooping boughs: each hangs from the trunk, sags, and flicks up a little
# at the tip, and is a long tent shape (a ridge with needles hanging down either side, dark
# underneath), packed closely enough that little sky shows between them. Whorls turn by the
# golden angle, so boughs never line up. A thin leader
# spike tops it off. On the snowy ones the snow is the top of the boughs themselves (the same
# faces, white), so it can never float above the needles.
# Sizes match the old hand-made trees (trees.blend), so the game's collision radii still fit.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from kit import OUT, PAL, Builder, build, export, g, material, reset

# The look being tried at the crash site (index.html?look=new): every bough also gets needle
# fringes, thin cards hanging off its edges and tip that the game paints with a see-through
# needle texture, so the silhouettes are soft and feathery instead of hard facets. Those trees
# go to public/models/look/. Run with LOOK = 'new' set (runpy's init_globals) to make them.
LOOK = globals().get('LOOK', 'old')
FRINGE = 0.55  # how far a fringe hangs, as a share of the bough's width there
CARDS = None  # the current tree's fringe cards, while it's being built (LOOK 'new' only)
fringe_random = random.Random()  # (its own, so adding fringes doesn't change the trees' shapes)

PAL.update(
    bark=0x4a3a2e, bark_dark=0x3a2e26,
    needles=0x2f4a40, needles_mid=0x38544a, needles_light=0x466156, needles_tip=0x55705f,
    needles_under=0x1e2f28, needles_deep=0x1a2a24,
    snow=0xe8eef2, snow_shade=0xc9d3dc,
)

# name: (height, widest radius, tiers, tips per tier, bare trunk fraction, snowy, seed)
TREES = {
    'pine': (9.4, 1.8, 12, 11, 0.13, False, 1),
    'pine-tall': (14.2, 2.3, 16, 12, 0.18, False, 2),
    'pine-small': (3.7, 0.95, 8, 10, 0.1, False, 3),
    'pine-skinny': (10.2, 0.95, 14, 8, 0.12, False, 4),
    'pine-wide': (6.7, 2.35, 10, 12, 0.08, False, 5),
    'pine-snow': (9.4, 1.7, 12, 11, 0.13, True, 6),
    'pine-small-snow': (3.7, 1.0, 8, 10, 0.1, True, 7),
    'sapling-pine': (1.75, 0.48, 5, 8, 0.12, False, 8),
}
SINK = 0.3  # the trunk starts this far below the origin, so it never floats on a slope
TAU = math.tau
BOUGH_WIDTH = 0.34  # meters: the most a bough spreads either side (wider and the low ones look like paddles)
UP = Vector((0, 1, 0))


def colour(name, var=0.06, shade=1.0):
    """Like kit.col, with an extra brightness factor."""
    h = PAL[name]
    k = (1 + random.uniform(-var, var)) * shade
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def needles(t, out, var=0.07):
    """Needle colour: dark deep inside, lighter out at the tips and higher up the tree."""
    names = ('needles_under', 'needles', 'needles_mid', 'needles_light', 'needles_tip')
    i = min(len(names) - 1, max(0, int(out * 4 + random.uniform(-0.6, 0.6))))
    return colour(names[i], var, 0.9 + 0.16 * t)


def snow():
    return colour(random.choice(('snow', 'snow', 'snow', 'snow_shade')), 0.03)


def face(b, points, c, out):
    """A triangle or quad (game space), wound so it faces `out`."""
    n = (points[1] - points[0]).cross(points[2] - points[0])
    if n.dot(out) < 0:
        points = points[::-1]
    b.add([g(*p) for p in points], [tuple(range(len(points)))], c)


def shared(name):
    """One material per name, reused run after run (a new one each time, an open Blender
    numbers them: needles.001, needles.002...)."""
    return bpy.data.materials.get(name) or material(name, 0.95)


def fringe_colour(t, out):
    names = ('needles', 'needles_mid', 'needles_light', 'needles_tip')
    i = min(len(names) - 1, max(0, int(out * 3 + fringe_random.uniform(-0.7, 0.7))))
    h = PAL[names[i]]
    k = (1 + fringe_random.uniform(-0.08, 0.08)) * (0.9 + 0.16 * t)
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def card(points, uvs, c, out):
    """A needle card (game space quad) with texture coordinates, facing `out`."""
    n = (points[1] - points[0]).cross(points[2] - points[0])
    if n.dot(out) < 0:
        points, uvs = points[::-1], uvs[::-1]
    f = CARDS.bm.faces.new([CARDS.bm.verts.new(g(*p)) for p in points])
    f[CARDS.lay] = len(CARDS.cols)
    CARDS.cols.append(c)
    for loop, uv in zip(f.loops, uvs):
        loop[CARDS.uv].uv = uv


def fringes(sections, out, side, t):
    """Needles hanging off both edges of a bough. u runs along
    the bough (one texture repeat per 0.45 m), v from where they grow (0) to their tips (1)."""
    for edge, sgn in ((1, 1), (2, -1)):
        u = fringe_random.uniform(0, 1)
        for s in range(len(sections) - 1):
            e0, e1 = sections[s][edge], sections[s + 1][edge]
            w0, w1 = (sections[s][0] - e0).length, (sections[s + 1][0] - e1).length
            hang0 = side * sgn * w0 * 0.5 - UP * max(0.1, w0 * FRINGE)
            hang1 = side * sgn * w1 * 0.5 - UP * max(0.1, w1 * FRINGE)
            u1 = u + (e1 - e0).length / 0.45
            card([e0, e1, e1 + hang1, e0 + hang0], [(u, 0), (u1, 0), (u1, 1), (u, 1)], fringe_colour(t, 0.4 + 0.2 * s), side * sgn)
            u = u1


def ring_point(angle, r, y):
    return Vector((math.cos(angle) * r, y, math.sin(angle) * r))


def envelope(t, radius):
    """The crown's radius at t (0 at its foot, 1 at the top): a narrow, slightly full spire."""
    # The lowest whorls are a little shorter than the ones just above, so the crown tucks in at
    # its foot instead of splaying out in a skirt.
    foot = 0.8 + 0.2 * min(1, t / 0.15)
    return (radius * (1 - t) ** 0.75 + radius * 0.1 + 0.1 * t) * foot  # (never down to a bare spike)


def bough(b, y, a, reach, t, snowy, droop=None):
    out = Vector((math.cos(a), 0, math.sin(a)))
    side = Vector((-math.sin(a), 0, math.cos(a)))
    if droop is None:
        # Low boughs hang the most; up near the top the young shoots reach up instead.
        droop = reach * (random.uniform(0.38, 0.52) + 0.05 * (1 - t)) * (1 - 1.15 * max(0, t - 0.8) / 0.2)
    wide = min(max(reach * 0.26, 0.13), BOUGH_WIDTH)  # (short boughs stay full, so a slim tree isn't see-through)
    # (along, drop, half-width): hangs from the trunk, sags, then the tip flicks up a little.
    profile = ((0.0, 0.0, 0.05 + wide * 0.2), (0.4, 0.3, wide), (0.75, 0.72, wide * 0.88), (1.0, 0.78, wide * 0.2))
    shade = random.uniform(0.9, 1.08)
    sections = []
    for f, drop, w in profile:
        p = out * (0.04 + reach * f) + Vector((0, y - droop * drop, 0))
        ridge = p + Vector((0, w * 0.25 + (0.03 if snowy else 0), 0))
        sections.append((ridge, p + side * w - Vector((0, w * 0.6, 0)), p - side * w - Vector((0, w * 0.6, 0))))
    for s in range(len(sections) - 1):
        (r0, l0, q0), (r1, l1, q1) = sections[s], sections[s + 1]
        f = s / (len(sections) - 1)
        for e0, e1, sgn in ((l0, l1, 1), (q0, q1, -1)):
            top = snow() if snowy and random.random() < 0.85 - f * 0.25 else needles(t, 0.4 + f * 0.6)
            if CARDS:
                # The top as a needle card, reaching a little past the edge, so its outline is
                # ragged needles instead of a hard line (the solid underside still closes it).
                o0, o1 = e0 + (e0 - r0) * 0.45, e1 + (e1 - r1) * 0.45
                u0, u1 = s * 0.8, (s + 1) * 0.8
                # Folded along its middle, the crease raised, so the bough arches over its sides
                # instead of lying flat...
                lift0, lift1 = UP * (r0 - e0).length * 0.22, UP * (r1 - e1).length * 0.22
                c0, c1 = r0.lerp(o0, 0.45) + lift0, r1.lerp(o1, 0.45) + lift1
                card([r0, c0, c1, r1], [(u0, 0), (u0, 0.45), (u1, 0.45), (u1, 0)], top, side * sgn + Vector((0, 0.7, 0)))
                card([c0, o0, o1, c1], [(u0, 0.45), (u0, 1), (u1, 1), (u1, 0.45)], top, side * sgn + Vector((0, 0.7, 0)))
                # ...and a second, smaller layer of sprays over its outer half, raised and turned a
                # little, so up close you see layers of needles, not one sheet.
                if s > 0:
                    turn = fringe_random.uniform(-0.12, 0.12)
                    a0, a1 = c0 + lift0 * 0.6, c1 + lift1 * 0.6
                    b0 = o0 + (o0 - c0) * 0.15 + UP * turn
                    b1 = o1 + (o1 - c1) * 0.15 - UP * turn
                    card([a0, b0, b1, a1], [(u0 + 0.37, 0.05), (u0 + 0.37, 1), (u1 + 0.37, 1), (u1 + 0.37, 0.05)], fringe_colour(t, 0.6 + 0.2 * s), side * sgn + Vector((0, 0.9, 0)))
            else:
                face(b, [r0, e0, e1, r1], top, side * sgn + Vector((0, 0.7, 0)))
        under = colour('needles_under', 0.07, shade)
        if CARDS:
            # The underside as needle cards too: from the bough's middle out past each edge,
            # ragged, a shade darker than the top (no flat faces to see from below).
            m0, m1 = (l0 + q0) / 2 - UP * 0.04, (l1 + q1) / 2 - UP * 0.04
            low = tuple(min(1, c * 1.9) for c in under[:3]) + (1.0,)
            for e0, e1 in ((l0, l1), (q0, q1)):
                o0, o1 = e0 + (e0 - m0) * 0.35, e1 + (e1 - m1) * 0.35
                u0, u1 = s * 0.8, (s + 1) * 0.8
                card([m0, o0, o1, m1], [(u0, 0), (u0, 1), (u1, 1), (u1, 0)], low, Vector((0, -1, 0)))
        else:
            face(b, [l0, q0, q1, l1], under, Vector((0, -1, 0)))
    r, l, q = sections[-1]
    tip_colour = needles(t, 1.0)
    if CARDS:
        fringes(sections, out, side, t)  # (no tip face: seen edge-on, it pokes out as a stick)
    else:
        face(b, [r, l, q], tip_colour, out)


def conifer(name, height, radius, tiers, tips, bare, snowy, seed):
    """Returns the tree's objects: the tree, and (LOOK 'new') its needle cards."""
    global CARDS
    random.seed(seed)
    fringe_random.seed(seed * 7919)
    if LOOK == 'new':
        CARDS = Builder()
        CARDS.uv = CARDS.bm.loops.layers.uv.new('UVMap')
    b = Builder()
    # The trunk: slim for the crown's width (a skinny spruce has a slim trunk), with a little
    # flare at the foot, tapering steadily up inside the crown. It stops well short of the top,
    # where the crown is too thin to hide it: a green stem and the leader carry on from there.
    trunk_r = max(0.04, radius * 0.065)
    lo, hi = height * bare + radius * 0.35, height * 0.95
    b.pole((0, -SINK, 0), (0, height * 0.12, 0), trunk_r * 1.2, lambda: colour(random.choice(('bark', 'bark_dark')), 0.06), n=7, taper=0.82, wobble=0.06)
    b.pole((0, height * 0.12, 0), (0, height * 0.72, 0), trunk_r * 0.97, lambda: colour('bark', 0.06), n=6, taper=0.55)
    # Up in the thin top the stem is this year's growth: green, not bark, so no brown stick shows.
    b.pole((0, height * 0.72, 0), (0, hi, 0), trunk_r * 0.97 * 0.55, lambda: colour(random.choice(('needles_under', 'needles')), 0.06), n=6, taper=0.45)
    # Whorls from just above the bare stretch to near the top, closer together higher up (and
    # on slim trees, whose short boughs would otherwise leave gaps between them).
    spacing = min(0.55, max(0.24, (hi - lo) / (tiers * 1.2))) * min(1, max(0.7, radius / 1.6))
    whorls = max(4, int((hi - lo) / spacing) + 1)
    for w in range(whorls):
        t = w / (whorls - 1)
        y = lo + (hi - lo) * t ** 0.9
        reach = envelope(t, radius)
        # More boughs on the long low whorls, so they stay narrow and still close up.
        count = max(6, round((tips * 0.75 * (1 - t) + 4.5 * t) * max(1, reach / 1.1)))
        for j in range(count):
            if t < 0.3 and random.random() < 0.12:
                continue  # (a missing branch, low down)
            a = w * 2.4 + TAU * j / count + random.uniform(-0.3, 0.3)
            bough(b, y + random.uniform(-0.06, 0.06), a, reach * random.uniform(0.82, 1.1), t, snowy)
        # Between the whorls, a few short side shoots (spruce grow these), so a slim crown reads
        # as one bushy column, not plates on a stick.
        if height > radius * 7 and w + 1 < whorls:  # (slim trees only: the rest are full enough)
            gap_y = lo + (hi - lo) * ((w + 0.5) / (whorls - 1)) ** 0.9
            for j in range(3):
                a = w * 2.4 + 1.2 + TAU * j / 3 + random.uniform(-0.4, 0.4)
                bough(b, gap_y, a, reach * random.uniform(0.55, 0.75), t, snowy)
    # The leader: this year's shoot, short and needled, blunt rather than a spike (the top
    # whorls' shoots reach up round its foot).
    b.pole((0, hi - 0.25, 0), (0, height, 0), radius * 0.05 + 0.05, lambda: colour(random.choice(('needles_light', 'needles_mid', 'needles_tip')), 0.05), n=5, taper=0.3)
    if snowy:
        b.pole((0, height - 0.12, 0), (0, height + 0.02, 0), (radius * 0.05 + 0.05) * 0.45, lambda: colour('snow', 0.02), n=5, taper=0.5)
    parts = [build(name, b, shared('tree'))]
    if CARDS:
        parts.append(build(f'{name}-needles', CARDS, shared('needles')))
        CARDS = None
    return parts


FOLDER = 'look/' if LOOK == 'new' else ''
os.makedirs(os.path.join(OUT, FOLDER), exist_ok=True)
if bpy.app.background:
    reset()
    for name, spec in TREES.items():
        export(conifer(name, *spec), f'{FOLDER}{name}.glb')
else:
    # In an open Blender: export each, then keep a copy in the "Spruce" collection to look at.
    shelf = bpy.data.collections.get('Spruce') or bpy.data.collections.new('Spruce')
    if shelf.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(shelf)
    for o in list(shelf.objects):
        bpy.data.objects.remove(o)
    for i, (name, spec) in enumerate(TREES.items()):
        export(conifer(name, *spec), f'{FOLDER}{name}.glb')
        for o in conifer(name, *spec):
            bpy.context.scene.collection.objects.unlink(o)
            shelf.objects.link(o)
            o.location = (i * 5.5, 20, 0)  # (clear of anything at the origin)
print('@@ done')
