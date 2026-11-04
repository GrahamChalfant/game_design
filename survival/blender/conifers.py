# Generates the spruce and pines in survival/public/models/: pine, pine-tall, pine-small,
# pine-skinny, pine-wide, pine-snow, pine-small-snow and sapling-pine.
# Run: blender -b --python conifers.py
#
# Made to be looked at from the ground (the over-the-shoulder and first-person views) as well
# as from above. Each tree is a straight, tapering trunk, bare for the bottom stretch, with
# tiers of drooping branches: each tier is a ragged star of branch tips hanging down from the
# trunk, with notches between the tips, a lighter top and a dark underside, every tier turned
# and jittered so no two trees look alike. A thin leader spike tops it off. The snowy ones
# have snow lying on the upper side of each tier.
# Sizes match the old hand-made trees (trees.blend), so the game's collision radii still fit.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from kit import PAL, Builder, build, col, export, g, material, reset

PAL.update(
    bark=0x4a3a2e, bark_dark=0x3a2e26,
    needles=0x2f4a40, needles_mid=0x38544a, needles_light=0x466156, needles_tip=0x55705f, needles_under=0x1e2f28,
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


def tier(b, y, radius, droop, tips, turn, snowy):
    """One tier of branches: a ragged, drooping star round the trunk at height y."""
    top = Vector((0, y + droop * 0.35, 0))  # where the branches leave the trunk
    ring = []
    for k in range(tips * 2):
        a = turn + math.tau * k / (tips * 2) + random.uniform(-0.08, 0.08)
        if k % 2 == 0:  # a branch tip, hanging down
            r = radius * random.uniform(0.82, 1.08)
            h = y - droop * random.uniform(0.8, 1.15)
        else:  # the notch between two tips
            r = radius * random.uniform(0.5, 0.66)
            h = y - droop * random.uniform(0.25, 0.45)
        ring.append(Vector((math.cos(a) * r, h, math.sin(a) * r)))
    under = Vector((0, y - droop * 0.55, 0))  # the underside meets the trunk here
    n = len(ring)
    shades = ('needles', 'needles_mid', 'needles_light', 'needles_mid')
    for k in range(n):
        a, c = ring[k], ring[(k + 1) % n]
        # The upper side, split at a midpoint so the branch tips look like they bend down.
        mid = (top + a) * 0.5 + Vector((0, droop * 0.12, 0))
        shade = 'needles_tip' if k % 2 == 0 and random.random() < 0.5 else random.choice(shades)
        b.add([g(*p) for p in (top, mid, a, c)], [(0, 1, 3), (1, 2, 3)], lambda s=shade: col(s, 0.06))
        b.add([g(*p) for p in (under, c, a)], [(0, 1, 2)], lambda: col('needles_under', 0.05))
    if snowy:
        # Snow lying on the upper side: a smaller, flatter copy just above it, white on top.
        lift = Vector((0, 0.05 + droop * 0.06, 0))
        snow_ring = [Vector((p.x * 0.88, p.y * 0.8 + top.y * 0.2 + droop * 0.1, p.z * 0.88)) + lift for p in ring]
        for k in range(n):
            if random.random() < 0.1:
                continue  # (bare patches)
            b.add([g(*p) for p in (top + lift, snow_ring[k], snow_ring[(k + 1) % n])], [(0, 1, 2)], lambda: col(random.choice(('snow', 'snow', 'snow_shade')), 0.03))


def conifer(name, height, radius, tiers, tips, bare, snowy, seed):
    random.seed(seed)
    b = Builder()
    trunk_top = height * 0.9
    trunk_r = max(0.05, radius * 0.11)
    # The trunk, with a little flare at the foot.
    b.pole((0, -SINK, 0), (0, height * 0.12, 0), trunk_r * 1.35, lambda: col(random.choice(('bark', 'bark_dark')), 0.06), n=7, taper=0.72, wobble=0.08)
    b.pole((0, height * 0.12, 0), (0, trunk_top, 0), trunk_r, lambda: col('bark', 0.06), n=6, taper=0.25)
    # Tiers from just above the bare stretch to near the top, widest at the bottom, the
    # gaps between them shrinking towards the top.
    lowest = height * bare + radius * 0.35
    highest = height * 0.92
    for i in range(tiers):
        t = i / (tiers - 1)
        y = lowest + (highest - lowest) * (t ** 0.85)
        spread = radius * (1 - t) ** 0.9 * random.uniform(0.92, 1.05) + radius * 0.08
        droop = max(0.14, spread * random.uniform(0.55, 0.72))
        tier(b, y, spread, droop, max(6, round(tips * (1 - t * 0.35))), random.uniform(0, math.tau), snowy)
    # The leader: a thin spike at the very top.
    b.pole((0, highest, 0), (0, height, 0), radius * 0.06 + 0.02, lambda: col('needles_light', 0.05), n=5, taper=0.05)
    if snowy:
        b.pole((0, height * 0.97, 0), (0, height * 1.0, 0), radius * 0.05 + 0.02, lambda: col('snow', 0.02), n=5, taper=0.2)
    return build(name, b, material('tree', 0.95))


reset()
for name, spec in TREES.items():
    export([conifer(name, *spec)], f'{name}.glb')
print('@@ done')
