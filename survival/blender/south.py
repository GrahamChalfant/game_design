# The models for the places south of the mountains (src/layout.js, src/landmarks.js; the
# waterfall has its own script, waterfall.py):
#   cabin-shack.glb      the fisherman's shack at the river mouth: board walls, a rusted tin
#                        roof, an upturned rowboat beside it and a fish-drying rack behind;
#   cabin-homestead.glb  the homestead: a small clapboard farmhouse, a half-fallen shed and a
#                        stone well (CABIN_STYLES.homestead.well);
#   cabin-hunter.glb     the hunter's cabin: dark logs, antlers over the door, hides stretched
#                        on the wall, a smokehouse out back;
#   cabin-burnt.glb      the burnt-out cabin: charred stubs of wall, fallen roof timbers, the
#                        stone chimney still standing;
#   road-bridge.glb      the old timber road bridge over the river (deck along +z);
#   notice-board.glb     the trailhead's notice board;
#   lookout-old.glb      the west lookout: lookout.py's tower, weathered grey with a rusted roof.
# The cabins share the plain cabin's size and room (CABIN in src/poiModels.js: inside ±2.6 ×
# ±2.1, walls 2.2 high, ridge 3.5; the bed, stove and table where the game's obstacles are;
# the cupboard and chest stay in the game's code). What stands round each matches
# CABIN_STYLES in src/landmarks.js. Parts named with "wall" or "roof" fade between the camera
# and the player (src/cutaway.js).
# Everything is authored in the game's axes (x right, y up, z toward the front). Run in an open
# Blender (Blender MCP or the Text Editor), or: blender -b --python south.py
import math, os, random, runpy, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix, noise
from kit import OUT, PAL, Builder, build, col, export, g, material, reset

HERE = os.path.dirname(os.path.abspath(__file__))
reset()
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
stone_into_ground, shared, tone = R['stone_into'], R['shared'], R['tone']


def stone_into(b, size, seed, at=(0, 0, 0), **options):
    """remake.py's stone, but up off the ground too: it shades a stone by its height above y = 0,
    so build it there, then lift it."""
    b.bm.verts.ensure_lookup_table()
    first = len(b.bm.verts)
    stone_into_ground(b, size, seed, at=(at[0], 0, at[2]), **options)
    b.bm.verts.ensure_lookup_table()
    for v in b.bm.verts[first:]:
        v.co.z += at[1]

PAL.update(
    board_grey=0x7c7870, board_pale=0x948e82, board_dark=0x5c5850, teal_paint=0x5d7a78, teal_pale=0x7b9590,
    tin=0x77766f, tin_rust=0x7a4e38, tin_dark=0x5e5650, clap=0xb9b2a0, clap_pale=0xcbc4b0, clap_bare=0x8a7e6c,
    trim_green=0x4d5e48, log_dark=0x4a3426, log=0x5d4430, char=0x2b2622, char_grey=0x45403b, soot=0x1f1c1a,
    fireweed=0xa0587a, fireweed_dark=0x7a4060, hull=0x6a7c84, hull_pale=0x8c9ca0, hull_red=0x8a4a3a, net=0x8a8466,
    gravel=0x8f8a7e, paper=0xc8c0a8, paper_old=0xb0a688, map_green=0x6e7a52, rope=0xa8946a,
)
WOOD = shared('wood', 0.93)
METAL = shared('metal', 0.75)
ROCK = shared('rock', 0.95)

W, D, WALL, DOOR, WALL_H, PEAK, EAVE = 2.6, 2.1, 0.15, 0.55, 2.2, 3.5, 2.05
RUN = D + WALL + 0.55
RISE = PEAK - EAVE
SLOPE = math.atan2(RISE, RUN)
LENGTH = math.hypot(RUN, RISE)
HALF_X = W + WALL + 0.55
XW = W + WALL  # the wall lines
ZW = D + WALL


def c(name, var=0.06):
    return lambda: col(name, var)


def spans(a, b, gaps):
    out, start = [], a
    for g0, g1 in sorted(gaps):
        if g0 > start:
            out.append((start, g0))
        start = max(start, g1)
    if b > start:
        out.append((start, b))
    return out


# ---- a cabin's room: floor, bed, stove, table (where the game's obstacles are) ----
def room(prefix, floor_col='plank', stove=True):
    floor = Builder()
    z = -D - 0.1
    while z < D + 0.1:
        w = random.uniform(0.3, 0.42)
        floor.box((0, -0.05, z + w / 2), (2 * W + 0.25, 0.1, w - 0.015), c(floor_col, 0.1))
        z += w
    for sx in (-1, 1):
        for sz in (-1, 1, 0):
            floor.stone((sx * XW, -0.45, sz * ZW), (0.35, 0.4, 0.35), lambda: col(random.choice(('stone', 'stone_dark', 'lichen')), 0.06))
    floor.box((0, -0.14, ZW + 0.5), (1.5, 0.08, 0.7), c('plank', 0.1))
    floor.box((0, -0.33, ZW + 0.82), (1.5, 0.3, 0.12), c('wood_dark'))
    inside = Builder()
    bx, bz = -1.4, -1.55
    for x in (-0.95, 0.95):
        for z in (-0.36, 0.36):
            inside.box((bx + x, 0.25, bz + z), (0.08, 0.5, 0.08), c('wood_dark'))
    inside.box((bx, 0.42, bz), (2.0, 0.08, 0.8), c('wood'))
    inside.box((bx, 0.52, bz), (1.9, 0.12, 0.72), c('straw', 0.06))
    inside.box((bx + 0.3, 0.6, bz), (1.25, 0.06, 0.76), c(random.choice(('wool', 'canvas', 'tarp')), 0.06))
    if stove:
        sx, sz = 2.0, -1.55
        inside.box((sx, 0.48, sz), (0.62, 0.5, 0.5), c('iron', 0.05))
        inside.box((sx, 0.75, sz), (0.68, 0.05, 0.56), c('iron', 0.08))
        for x in (-0.25, 0.25):
            for z in (-0.18, 0.18):
                inside.box((sx + x, 0.12, sz + z), (0.06, 0.24, 0.06), c('iron'))
        inside.pole((sx, 0.75, sz - 0.1), (sx, PEAK + 0.6, sz - 0.1), 0.08, c('iron', 0.05), n=8)
    tx, tz = 1.3, 0.6
    inside.box((tx, 0.76, tz), (1.15, 0.06, 0.72), c('plank', 0.06))
    for x in (-0.5, 0.5):
        for z in (-0.28, 0.28):
            inside.box((tx + x, 0.37, tz + z), (0.07, 0.74, 0.07), c('wood_dark'))
    inside.box((tx + 0.35, 0.89, tz - 0.12), (0.12, 0.2, 0.12), c('chrome', 0.05))
    inside.box((tx + 0.35, 0.89, tz - 0.12), (0.08, 0.12, 0.13), c('lamp', 0.05))
    inside.box((-0.2, 0.012, 0.15), (1.6, 0.025, 1.0), c('wool', 0.08))
    return [build(f'{prefix}-floor', floor, WOOD), build(f'{prefix}-inside', inside, WOOD)]


# ---- a door and window frames ----
def door(b, hinge, turn, planks=('plank',), dark='wood_dark'):
    """A ledged and braced plank door hung on two strap hinges. `hinge`: the foot of its hinged
    edge, on the outer face of the left jamb; `turn`: how far it's swung about that edge (0:
    shut across the doorway toward +x; less than 0: swung outward). Its boards butt tight, its
    hinged edge is on the jamb, and the straps run from pins on plates screwed to the frame."""
    R = Matrix.Rotation(turn, 3, 'Y')
    at = lambda d, y, t: tuple(Vector(hinge) + R @ Vector((d, y, t)))
    wide, tall, n = 2 * DOOR - 0.03, 1.9, 4
    w = wide / n
    for i in range(n):
        b.box(at(0.012 + w * (i + 0.5), 0.02 + tall / 2, 0), (w - 0.004, tall - random.uniform(0, 0.015), 0.045), c(random.choice(planks), 0.08), turn=turn)
    mid = 0.012 + wide / 2
    for y in (0.3, 1.0, 1.68):  # the ledges across the inside
        b.box(at(mid, y, -0.038), (wide - 0.07, 0.11, 0.034), c(dark, 0.06), turn=turn)
    for y in (0.65, 1.34):  # and the braces between them, rising from the hinge side
        b.box(at(mid, y, -0.036), (0.1, 1.04 if y < 1 else 1.02, 0.03), c(dark, 0.06), turn=turn, roll=-0.93)
    for y in (0.32, 1.66):
        b.box(at(0.2, y, 0.028), (0.42, 0.05, 0.012), c('iron', 0.05), turn=turn)  # the strap
        b.pole(at(-0.004, y - 0.06, 0.03), at(-0.004, y + 0.06, 0.03), 0.02, c('iron', 0.05), n=6)  # its pin
        b.box((hinge[0] - 0.045, y, hinge[2] + 0.004), (0.08, 0.13, 0.012), c('iron', 0.05))  # the plate on the frame
    b.box(at(wide - 0.09, 1.02, 0.05), (0.028, 0.17, 0.03), c('iron', 0.05))  # the handle
    b.box(at(wide - 0.17, 1.02, -0.066), (0.3, 0.05, 0.024), c(dark, 0.06), turn=turn)  # the latch bar inside


def window_frame(b, side, lo, hi, colour, deep=0.1, out=0.02):
    """A frame round a window (`lo` to `hi` along its wall, 0.85 to 1.6 up it): sill, head, jambs,
    and a cross of glazing bars."""
    def bar(along, y, long, tall, thick):
        if side == 'back':
            b.box((along, y, -ZW - out), (long, tall, thick), c(colour, 0.05))
        else:
            b.box((XW + out, y, along), (thick, tall, long), c(colour, 0.05))
    mid, wide = (lo + hi) / 2, hi - lo
    bar(mid, 0.84, wide + 0.22, 0.07, deep + 0.05)  # (the sill stands out a little)
    bar(mid, 1.61, wide + 0.16, 0.08, deep)
    for along in (lo - 0.035, hi + 0.035):
        bar(along, 1.225, 0.08, 0.72, deep)
    bar(mid, 1.225, 0.035, 0.7, 0.04)
    bar(mid, 1.225, wide, 0.035, 0.04)


# ---- board walls (vertical boards or horizontal clapboard), with a door and windows ----
WINDOWS = {'back': [(0.5, 1.6)], 'right': [(-0.6, 0.5)], 'left': [], 'front': []}


def board_walls(prefix, vertical, colours, trim):
    walls = {k: Builder() for k in ('front', 'back', 'left', 'right')}

    def opening(side, along, y):
        if side == 'front' and abs(along) < DOOR and y < 1.95:
            return True
        return any(a < along < b for a, b in WINDOWS[side]) and 0.85 < y < 1.6

    def gable_top(along, side):
        # How high the wall reaches at `along` (the gable ends rise to the ridge).
        if side in ('left', 'right'):
            return WALL_H + (PEAK - WALL_H) * max(0, 1 - abs(along) / (D + WALL + 0.1))
        return WALL_H

    for side, (length_half, place) in {
        'front': (XW, lambda a, y, t: ((a, y, ZW), (t[0], t[1], 0.06))),
        'back': (XW, lambda a, y, t: ((a, y, -ZW), (t[0], t[1], 0.06))),
        'left': (ZW, lambda a, y, t: ((-XW, y, a), (0.06, t[1], t[0]))),
        'right': (ZW, lambda a, y, t: ((XW, y, a), (0.06, t[1], t[0]))),
    }.items():
        b = walls[side]
        if vertical:
            a = -length_half
            while a < length_half - 0.01:
                w = min(random.uniform(0.2, 0.3), length_half - a)
                mid = a + w / 2
                top = gable_top(mid, side)
                # Split round the openings into upright pieces.
                ys = [y / 20 * top for y in range(21)]
                runs, start = [], None
                for y in ys:
                    if not opening(side, mid, y) and start is None:
                        start = y
                    if opening(side, mid, y) and start is not None:
                        runs.append((start, y))
                        start = None
                if start is not None:
                    runs.append((start, top))
                for y0, y1 in runs:
                    if y1 - y0 > 0.05:
                        centre, size = place(mid, (y0 + y1) / 2 - 0.06, (w - 0.02, y1 - y0 + 0.12))
                        b.box(centre, size, c(random.choice(colours), 0.07))
                # battens over the joints (cut round the openings too: none across a doorway)
                top = gable_top(a, side)
                runs, start = [], None
                for y in [k / 20 * top for k in range(21)]:
                    gap = opening(side, a, y) or opening(side, a - 0.04, y) or opening(side, a + 0.04, y)
                    if not gap and start is None:
                        start = y
                    if gap and start is not None:
                        runs.append((start, y))
                        start = None
                if start is not None:
                    runs.append((start, top))
                for y0, y1 in runs:
                    if y1 - y0 < 0.05:
                        continue
                    centre, size = place(a, (y0 + y1) / 2 - 0.05, (0.06, y1 - y0 + 0.1))
                    b.box((centre[0] + (0.03 if side == 'right' else -0.03 if side == 'left' else 0), centre[1], centre[2] + (0.03 if side == 'front' else -0.03 if side == 'back' else 0)), size, c('board_dark', 0.05))
                a += w
        else:
            y = -0.1
            while y < PEAK:
                for a0, a1 in spans(-length_half - 0.05, length_half + 0.05, []):
                    # (Horizontal boards, cut round the openings; up the gables, shorter and shorter.)
                    if side in ('left', 'right'):
                        half = (D + WALL + 0.1) * (1 - max(0, y - WALL_H) / (PEAK - WALL_H)) if y > WALL_H else length_half + 0.05
                        if half < 0.1:
                            continue
                        a0, a1 = -half, half
                    elif y > WALL_H:
                        continue
                    steps = [a0 + (a1 - a0) * k / 24 for k in range(25)]
                    runs, start = [], None
                    for s in steps:
                        if not opening(side, s, y + 0.1) and start is None:
                            start = s
                        if opening(side, s, y + 0.1) and start is not None:
                            runs.append((start, s))
                            start = None
                    if start is not None:
                        runs.append((start, a1))
                    for s0, s1 in runs:
                        if s1 - s0 < 0.05:
                            continue
                        shade = random.choice(colours) if random.random() > 0.12 else 'clap_bare'  # (paint flaked off)
                        centre, size = place((s0 + s1) / 2, y + 0.1, (s1 - s0, 0.2))
                        b.box(centre, size, c(shade, 0.05), tilt=0.12 if side in ('front', 'back') else 0, roll=0.12 if side in ('left', 'right') else 0)
                y += 0.19
        # Corner trim, door and window frames.
    for sx in (-1, 1):
        for sz in (-1, 1):
            walls['front' if sz > 0 else 'back'].box((sx * (XW + 0.02), WALL_H / 2, sz * (ZW + 0.02)), (0.12, WALL_H + 0.1, 0.12), c(trim, 0.05))
    for sx in (-1, 1):
        walls['front'].box((sx * (DOOR + 0.04), 0.97, ZW + 0.02), (0.09, 1.95, 0.1), c(trim, 0.05))
    walls['front'].box((0, 1.98, ZW + 0.02), (DOOR * 2 + 0.2, 0.1, 0.1), c(trim, 0.05))
    window_frame(walls['back'], 'back', 0.5, 1.6, trim)
    window_frame(walls['right'], 'right', -0.6, 0.5, trim)
    # The door, standing open (outward, back against the wall a little).
    door(walls['front'], (-DOOR + 0.005, 0, ZW + 0.095), -1.8)
    return [build(f'{prefix}-wall-{k}', b, WOOD) for k, b in walls.items()]


def log_walls(prefix, log_colours):
    walls = {k: Builder() for k in ('front', 'back', 'left', 'right')}
    over = 0.32

    def log(b, a, z_or_x, y, along):
        r = 0.15 * random.uniform(0.92, 1.06)
        colour = lambda: col(random.choice(log_colours), 0.08)
        if along == 'x':
            b.pole((a[0], y, z_or_x), (a[1], y, z_or_x), r, colour, n=8, cap=c('end_grain', 0.07), wobble=0.06)
        else:
            b.pole((z_or_x, y, a[0]), (z_or_x, y, a[1]), r, colour, n=8, cap=c('end_grain', 0.07), wobble=0.06)
    y = -0.12
    while y < WALL_H:
        for s in spans(-XW - over, XW + over, [(-DOOR, DOOR)] if y < 1.95 else []):
            log(walls['front'], s, ZW, y, 'x')
        for s in spans(-XW - over, XW + over, [(0.5, 1.6)] if 0.85 < y < 1.6 else []):
            log(walls['back'], s, -ZW, y, 'x')
        ys = y + 0.14
        log(walls['left'], (-ZW - over, ZW + over), -XW, ys, 'z')
        for s in spans(-ZW - over, ZW + over, [(-0.6, 0.5)] if 0.85 < ys < 1.6 else []):
            log(walls['right'], s, XW, ys, 'z')
        y += 0.28
    y = WALL_H + 0.14
    while y < PEAK - 0.15:
        half = (D + WALL + 0.1) * (1 - (y - WALL_H) / (PEAK - WALL_H))
        log(walls['left'], (-half, half), -XW, y, 'z')
        log(walls['right'], (-half, half), XW, y, 'z')
        y += 0.28
    for sx in (-1, 1):
        walls['front'].box((sx * (DOOR + 0.04), 0.97, ZW), (0.09, 1.95, 0.32), c('wood_dark', 0.05))
    walls['front'].box((0, 1.98, ZW), (DOOR * 2 + 0.2, 0.1, 0.32), c('wood_dark', 0.05))
    window_frame(walls['back'], 'back', 0.5, 1.6, 'wood_dark', deep=0.34, out=0)
    window_frame(walls['right'], 'right', -0.6, 0.5, 'wood_dark', deep=0.34, out=0)
    door(walls['front'], (-DOOR + 0.005, 0, ZW + 0.185), -1.75, planks=('plank', 'wood'))
    return walls


def shingle_roof(b, colours, mossy=0.15):
    for side in (1, -1):
        rows = 13
        for r in range(rows):
            t = (r + 0.5) / rows
            zc = side * RUN * t
            yc = PEAK - RISE * t + 0.1 + (r % 2) * 0.012
            across = -HALF_X + (0.12 if r % 2 else 0)
            while across < HALF_X - 0.05:
                w = min(random.uniform(0.22, 0.42), HALF_X - across)
                x = across + w / 2
                across += w
                # (Moss in soft patches, more on the shady back slope: not shingle by shingle.)
                patch = noise.noise(Vector((x * 0.7, t * 2.2, side * 3.1 + mossy * 7))) + (0.25 if side < 0 else 0) + random.uniform(-0.12, 0.12)
                shade = 'moss_dark' if patch > 0.75 - mossy else 'moss' if patch > 0.55 - mossy else random.choice(colours)
                b.box((x, yc + random.uniform(0, 0.025), zc), (w - 0.025, 0.045, LENGTH / rows * 1.45), c(shade, 0.05),
                      tilt=side * SLOPE + random.uniform(-0.04, 0.04), turn=random.uniform(-0.03, 0.03))
        for sx in (-1, 1):
            b.box((sx * (HALF_X + 0.01), (PEAK + EAVE) / 2 + 0.05, side * RUN / 2), (0.06, 0.2, LENGTH + 0.05), c('wood_dark'), tilt=side * SLOPE)
    b.box((0, PEAK + 0.16, 0), (2 * (HALF_X + 0.05), 0.1, 0.36), c('wood_dark'))


def tin_roof(b):
    for side in (1, -1):
        x = -HALF_X
        while x < HALF_X - 0.05:
            w = min(0.62, HALF_X - x)
            shade = random.choice(('tin', 'tin', 'tin_dark', 'tin_rust'))
            mid = x + w / 2
            b.box((mid, (PEAK + EAVE) / 2 + 0.08, side * RUN / 2), (w - 0.01, 0.03, LENGTH + 0.1), c(shade, 0.07), tilt=side * SLOPE, turn=random.uniform(-0.01, 0.01))
            for k in (-0.2, 0, 0.2):  # the corrugations' ribs
                b.box((mid + k, (PEAK + EAVE) / 2 + 0.11, side * RUN / 2), (0.04, 0.03, LENGTH + 0.1), c(shade, 0.05), tilt=side * SLOPE)
            x += w - 0.04
    b.box((0, PEAK + 0.13, 0), (2 * (HALF_X + 0.05), 0.08, 0.4), c('tin_rust', 0.05))
    # a few stones holding it down
    for _ in range(5):
        side = random.choice((1, -1))
        t = random.uniform(0.2, 0.8)
        b.stone((random.uniform(-HALF_X + 0.4, HALF_X - 0.4), PEAK - RISE * t + 0.2, side * RUN * t), (0.16, 0.1, 0.14), c('stone', 0.06), points=8)


# =========================================================================================
# THE FISHERMAN'S SHACK
random.seed(31)
shack_walls = board_walls('shack', True, ('board_grey', 'board_pale', 'teal_paint', 'board_grey'), 'board_dark')
roof = Builder()
tin_roof(roof)
roof.pole((2.0, PEAK - 0.4, -1.65), (2.0, PEAK + 0.6, -1.65), 0.08, c('rust', 0.05), n=8)
outside = Builder()
# The rowboat, upturned beside the shack (along z, keel up), resting on two logs.
bx = -4.4
for z in (-0.4, 1.4):
    outside.pole((bx - 0.8, 0.12, z), (bx + 0.8, 0.12, z), 0.12, c('driftwood'), n=6)
for i in range(9):
    t = i / 8
    z = -1.0 + t * 3.6
    half = 0.62 * math.sin(math.pi * (0.12 + 0.8 * t)) ** 0.6
    outside.box((bx, 0.62, z), (2 * half + 0.05, 0.05, 0.42), c('hull', 0.05))
    for s in (-1, 1):
        outside.box((bx + s * (half + 0.02), 0.42, z), (0.05, 0.4, 0.42), c('hull_red' if i % 3 == 0 else 'hull_pale', 0.05), roll=s * 0.35)
outside.box((bx, 0.68, 0.8), (0.08, 0.06, 3.6), c('wood_dark'))  # the keel
outside.pole((bx + 0.9, 0.05, 2.3), (bx + 0.6, 0.06, -0.2), 0.03, c('wood'), n=5)  # an oar in the grass
outside.box((bx + 0.6, 0.05, -0.4), (0.14, 0.03, 0.5), c('wood'), turn=0.1)
# The drying rack behind: two posts and a pole, nets and fish hanging.
for x in (-1.2, 1.2):
    outside.pole((x, 0, -3.6), (x, 1.7, -3.6), 0.06, c('driftwood'), n=6)
outside.pole((-1.35, 1.6, -3.6), (1.35, 1.6, -3.6), 0.045, c('driftwood'), n=6)
outside.box((-0.4, 1.15, -3.6), (1.1, 0.9, 0.02), c('net', 0.08), roll=0.04)
for k in range(5):
    x = 0.35 + k * 0.17
    outside.box((x, 1.38, -3.6), (0.07, 0.36, 0.04), c('bone', 0.08))
for i in range(4):  # floats and a crate on the ground
    outside.pole((2.0 + i * 0.25, 0.1, -2.9), (2.0 + i * 0.25, 0.2, -2.9), 0.1, c('lamp' if i % 2 else 'wool', 0.08), n=6)
objects = shack_walls + [build('shack-roof', roof, METAL), build('shack-outside', outside, WOOD)] + room('shack', stove=False)
export(objects, 'cabin-shack.glb')

# =========================================================================================
# THE HOMESTEAD
random.seed(32)
home_walls = board_walls('homestead', False, ('clap', 'clap', 'clap_pale'), 'trim_green')
roof = Builder()
shingle_roof(roof, ('shingle', 'shingle', 'shingle_dark'), mossy=0.2)
# The chimney: courses of stone up through the roof, a cap stone, a clay pot.
yy = PEAK - 0.6
while yy < PEAK + 0.82:
    for k in range(2):
        along = (yy * 10) % 2 < 1  # (each course laid across the one below)
        off = (-0.125, 0.125)[k]
        roof.box((2.0 + (0 if along else off), yy + 0.09, -1.65 + (off if along else 0)), (0.5 if along else 0.25, 0.175, 0.25 if along else 0.5),
                 c(random.choice(('stone_dark', 'stone_dark', 'stone', 'rust_dark')), 0.07), turn=random.uniform(-0.03, 0.03))
    yy += 0.18
roof.box((2.0, PEAK + 0.9, -1.65), (0.62, 0.07, 0.62), c('stone', 0.06))
roof.pole((2.0, PEAK + 0.93, -1.65), (2.0, PEAK + 1.12, -1.65), 0.11, c('rust', 0.06), n=8, taper=0.85)
outside = Builder()
# The shed (CABIN_STYLES.homestead.outside: you can't walk through it), half fallen. A post-
# and-board lean-to, its back to the house's back: the post at its near left corner has rotted
# through, so that corner of the roof has come down to the ground and the roof's boards fan
# down to it from the wall plates that still stand; the left wall's boards have gone with it.
shed = dict(x0=5.2, x1=7.7, z0=-2.5, z1=0.6)
grey = lambda: col(random.choice(('board_grey', 'board_grey', 'board_dark', 'board_pale')), 0.07)
X0, X1, Z0, Z1 = shed['x0'], shed['x1'], shed['z0'], shed['z1']
# The posts: three standing (the back ones taller: the roof falls to the front), one a stump.
for (x, z, h, lean) in ((X0, Z0, 2.1, 0.0), (X1, Z0, 2.1, 0.0), (X1, Z1, 1.75, 0.03)):
    outside.box((x, h / 2 - 0.1, z), (0.13, h + 0.2, 0.13), c('wood_dark', 0.06), roll=lean)
outside.box((X0, 0.16, Z1), (0.13, 0.5, 0.13), c('wood_dark', 0.06), roll=0.12)  # the rotted stump
outside.box((X0 - 0.5, 0.07, Z1 + 0.35), (0.13, 1.3, 0.13), c('wood_dark', 0.06), roll=1.5, turn=0.5)  # and the rest of it, in the grass
# The plates along the tops of the walls that stand.
outside.box(((X0 + X1) / 2, 2.06, Z0), (X1 - X0 + 0.3, 0.1, 0.12), c('wood_dark', 0.06))
outside.box((X1, 1.89, (Z0 + Z1) / 2), (0.12, 0.1, Z1 - Z0 + 0.3), c('wood_dark', 0.06), tilt=math.atan2(0.35, Z1 - Z0))
# The back wall and the right wall, boarded upright from the ground (a board or two gone).
x = X0 + 0.07
while x < X1 - 0.05:
    w = min(random.uniform(0.2, 0.27), X1 - x)
    if random.random() > 0.1:
        h = 2.0 - random.uniform(0, 0.06)
        outside.box((x + w / 2, h / 2 - 0.04, Z0 - 0.08), (w - 0.012, h + 0.08, 0.035), grey)
    x += w
z = Z0 + 0.07
while z < Z1 - 0.05:
    w = min(random.uniform(0.2, 0.27), Z1 - z)
    if random.random() > 0.12:
        h = 2.0 - 0.35 * (z - Z0) / (Z1 - Z0) - random.uniform(0, 0.05)
        outside.box((X1 + 0.08, h / 2 - 0.04, z + w / 2), (0.035, h + 0.08, w - 0.012), grey)
    z += w
# The left wall: its rail has dropped with the corner, the boards still nailed to it leaning
# out and shorter toward the front, the last of them flat in the grass.
for k in range(8):
    t = k / 7
    z = Z0 + 0.2 + t * (Z1 - Z0 - 0.5)
    h = 1.95 * (1 - t) ** 1.3 + 0.25
    if k < 6:
        outside.box((X0 - 0.07 - 0.25 * t * h / 2, h / 2 * math.cos(0.5 * t) - 0.03, z), (0.035, h, 0.23), grey, roll=0.5 * t)
    else:
        outside.box((X0 - 0.6 - (k - 6) * 0.3, 0.03 + (k - 6) * 0.02, z - 0.3), (0.035, 1.5, 0.23), grey, roll=1.53, turn=0.3 * (k - 6))
# The roof: boards from the back plate down to the front, shingled; each falls further the
# nearer the dropped corner it is, so the whole roof twists down to the ground there.
rafters = []
x = X0 - 0.12
while x < X1 + 0.14:
    w = min(random.uniform(0.24, 0.3), X1 + 0.14 - x)
    t = (x + w / 2 - X0) / (X1 - X0)  # 0 at the fallen side, 1 at the standing one
    back = Vector((x + w / 2, 2.14, Z0 - 0.25))
    front = Vector((x + w / 2, 0.12 + 1.72 * max(0.0, min(1.0, t)) ** 1.6, Z1 + 0.3 + 0.25 * (1 - t)))
    long = (front - back).length
    mid = (back + front) / 2
    # (Each laps the next, so the roof's whole however it's twisted.)
    outside.box(tuple(mid), (w + 0.05, 0.035, long), c(random.choice(('shingle', 'shingle', 'shingle_dark', 'moss_dark')), 0.06), tilt=-math.asin((front.y - back.y) / long), roll=0.06)
    rafters.append((back, front))
    x += w
for back, front in rafters[1::3]:  # the rafters under them
    mid = (back + front) / 2 - Vector((0, 0.06, 0))
    long = (front - back).length
    outside.box(tuple(mid), (0.07, 0.09, long - 0.1), c('wood_dark', 0.06), tilt=-math.asin((front.y - back.y) / long))
# What's left inside, under the end that still stands: a barrel, a stack of split wood, a rake.
outside.pole((7.05, 0, -1.9), (7.05, 0.85, -1.9), 0.3, c('plank', 0.07), n=10, cap=c('wood_dark'))
for y in (0.18, 0.66):
    outside.pole((7.05, y, -1.9), (7.05, y + 0.05, -1.9), 0.31, c('iron', 0.05), n=10)
for i in range(9):
    row, k = divmod(i, 3)
    outside.pole((6.95 + k * 0.22 - row * 0.02, 0.1 + row * 0.2, -1.1), (6.95 + k * 0.22, 0.1 + row * 0.2, -0.45), 0.1, c('wood', 0.08), n=6, cap=c('cut', 0.06))
outside.pole((7.55, 0, -0.2), (7.62, 1.55, -0.6), 0.022, c('driftwood'), n=5)
outside.box((7.55, 0.03, -0.2), (0.36, 0.04, 0.05), c('iron', 0.05), turn=0.3)
# The well (CABIN_STYLES.homestead.well): a round wall of laid stone standing on a ring of flags
# set in the ground, the shaft dark inside it; two posts set in the flags carry the windlass
# and a little shingled roof; the bucket hangs from its rope over the shaft.
wx, wz = -5.0, 3.4
for k in range(10):  # the flags round its foot
    a = math.tau * k / 10 + 0.2
    stone_into(outside, (0.34, 0.07, 0.27), 380 + k, at=(wx + math.cos(a) * 0.95, 0.0, wz + math.sin(a) * 0.95), turn=-a + random.uniform(-0.2, 0.2), mossy=k % 3 == 0, sink=0.1, rough=0.1, cuts=2, subdivisions=2)
for course in range(4):  # the wall: each course's stones over the joints of the one below
    n = 11
    for k in range(n):
        a = math.tau * (k + 0.5 * (course % 2)) / n
        top = course == 3
        stone_into(outside, (0.21, 0.11 if top else 0.14, 0.17), 400 + course * 20 + k, at=(wx + math.cos(a) * 0.6, course * 0.185, wz + math.sin(a) * 0.6),
                   turn=-a + math.pi / 2, mossy=top or course == 0, sink=0.25, rough=0.14, cuts=4, subdivisions=2)
outside.pole((wx, -0.2, wz), (wx, 0.52, wz), 0.5, c('soot', 0.03), n=14, cap=c('soot', 0.03))  # the dark of the shaft
for s in (-1, 1):
    outside.box((wx + s * 0.86, 0.95, wz), (0.12, 2.1, 0.12), c('wood_dark', 0.06))
    outside.box((wx + s * 0.86, 0.3, wz + 0.2), (0.07, 0.75, 0.07), c('wood', 0.06), tilt=-0.5)  # braced at the foot
    outside.box((wx + s * 0.86, 0.3, wz - 0.2), (0.07, 0.75, 0.07), c('wood', 0.06), tilt=0.5)
outside.box((wx, 2.0, wz), (2.0, 0.1, 0.1), c('wood_dark', 0.06))  # the beam the roof sits on
outside.pole((wx - 0.8, 1.3, wz), (wx + 0.8, 1.3, wz), 0.08, c('wood', 0.06), n=8, cap=c('end_grain', 0.06))  # the windlass
outside.pole((wx + 0.8, 1.3, wz), (wx + 1.05, 1.3, wz), 0.02, c('iron', 0.05), n=5)  # and its crank
outside.pole((wx + 1.05, 1.3, wz), (wx + 1.05, 1.06, wz), 0.02, c('iron', 0.05), n=5)
outside.pole((wx + 1.05, 1.06, wz), (wx + 1.22, 1.06, wz), 0.028, c('wood', 0.06), n=6)
for k in range(5):  # the rope wound on it
    outside.pole((wx - 0.18 + k * 0.045, 1.3, wz), (wx - 0.14 + k * 0.045, 1.3, wz), 0.098, c('rope', 0.06), n=8)
outside.pole((wx, 1.22, wz + 0.09), (wx, 0.98, wz + 0.02), 0.012, c('rope', 0.05), n=4)
outside.pole((wx, 0.72, wz), (wx, 0.95, wz), 0.13, c('plank', 0.07), n=9, taper=1.18, cap=c('soot', 0.03))  # the bucket
for y in (0.76, 0.9):
    outside.pole((wx, y, wz), (wx, y + 0.02, wz), 0.14 + (y - 0.72) * 0.1, c('iron', 0.05), n=9)
for s in (-1, 1):
    outside.box((wx, 2.26, wz + s * 0.36), (2.2, 0.04, 0.9), c(random.choice(('shingle', 'shingle_dark')), 0.06), tilt=s * 0.62)
    for e in (-1, 1):  # a rafter at each end
        outside.box((wx + e * 0.9, 2.2, wz + s * 0.34), (0.06, 0.06, 0.8), c('wood_dark', 0.06), tilt=s * 0.62)
outside.box((wx, 2.5, wz), (2.26, 0.06, 0.12), c('wood_dark', 0.06))  # the ridge board
# A woodpile against the house's side (wood to take is in the game's code) and the end of a
# fence: three posts set in the ground, a rail still up, another down at one end.
fz = ZW + 1.6
for k in range(3):
    outside.box((-XW - 0.3 - k * 0.75, 0.45, fz), (0.1, 1.1, 0.1), c('driftwood', 0.06), roll=random.uniform(-0.04, 0.04))
outside.box((-XW - 1.05, 0.78, fz + 0.06), (1.7, 0.09, 0.035), c('driftwood', 0.07))
outside.box((-XW - 0.72, 0.28, fz + 0.06), (0.95, 0.09, 0.035), c('driftwood', 0.07), roll=0.38)
objects = home_walls + [build('homestead-roof', roof, WOOD), build('homestead-outside', outside, WOOD)] + room('homestead')
export(objects, 'cabin-homestead.glb')

# =========================================================================================
# THE HUNTER'S CABIN
random.seed(33)
walls = log_walls('hunter', ('log_dark', 'log', 'log_dark'))
# Antlers over the door, hides stretched on frames on the front wall.
front = walls['front']
# (On a board on the lintel, under the eave: the beams sweep out and forward, clear of the roof.)
front.box((0, 2.0, ZW + 0.19), (0.36, 0.16, 0.05), c('wood'))
for s in (-1, 1):
    base = Vector((s * 0.07, 2.0, ZW + 0.22))
    tip = base + Vector((s * 0.6, 0.0, 0.3))
    front.pole(tuple(base), tuple(tip), 0.032, c('bone', 0.05), n=5, taper=0.4)
    for k in range(3):
        p = base.lerp(tip, 0.3 + k * 0.27)
        front.pole(tuple(p), tuple(p + Vector((s * 0.03, -0.02, 0.17 - k * 0.03))), 0.022, c('bone', 0.05), n=4, taper=0.3)
for x in (-1.75, 1.75):
    front.box((x, 1.2, ZW + 0.2), (1.0, 1.1, 0.03), c('hide_pale' if x > 0 else 'hide', 0.06), roll=0.05 * x)
    for dx in (-0.55, 0.55):
        front.box((x + dx, 1.2, ZW + 0.22), (0.05, 1.3, 0.05), c('wood_dark'))
    for dy in (-0.6, 0.6):
        front.box((x, 1.2 + dy, ZW + 0.22), (1.2, 0.05, 0.05), c('wood_dark'))
roof = Builder()
shingle_roof(roof, ('shingle_dark', 'shingle_dark', 'shingle'), mossy=0.3)
roof.pole((2.1, PEAK - 0.4, -1.65), (2.1, PEAK + 0.7, -1.65), 0.08, c('iron', 0.05), n=8)
outside = Builder()
# The smokehouse out back: a little plank hut with a stovepipe, its door ajar.
hx, hz = -4.9, -1.4
for side, (dx, dz) in enumerate(((0, -0.85), (0, 0.85))):
    for k in range(7):
        outside.box((hx - 0.75 + k * 0.25, 0.9, hz + dz), (0.24, 1.8, 0.05), c(random.choice(('board_dark', 'char_grey', 'board_grey')), 0.07))
for dx in (-0.85, 0.85):
    for k in range(7):
        if dx > 0 and 1 < k < 5:
            continue  # the doorway (facing the cabin)
        outside.box((hx + dx, 0.9, hz - 0.75 + k * 0.25), (0.05, 1.8, 0.24), c(random.choice(('board_dark', 'char_grey')), 0.07))
for s in (-1, 1):
    outside.box((hx, 2.0, hz + s * 0.5), (2.0, 0.05, 1.15), c('shingle_dark', 0.06), tilt=s * 0.45)
outside.pole((hx, 1.8, hz), (hx, 2.7, hz), 0.06, c('iron'), n=6)
outside.box((hx, 2.26, hz), (2.06, 0.06, 0.1), c('wood_dark', 0.06))  # its ridge board
# Its door (toward the cabin), ajar on leather hinges; a sill board under it.
for k in range(3):
    off = Matrix.Rotation(-0.6, 3, 'Y') @ Vector((0, 0, 0.125 + k * 0.25))
    outside.box((hx + 0.88 + off.x, 0.9, hz - 0.37 + off.z), (0.04, 1.74, 0.245), c(random.choice(('board_grey', 'board_dark')), 0.07), turn=-0.6)
for y in (0.4, 1.4):
    off = Matrix.Rotation(-0.6, 3, 'Y') @ Vector((0.03, 0, 0.36))
    outside.box((hx + 0.88 + off.x, y, hz - 0.37 + off.z), (0.03, 0.1, 0.66), c('wood_dark', 0.06), turn=-0.6)
    outside.box((hx + 0.9, y, hz - 0.39), (0.03, 0.12, 0.1), c('hide', 0.06))
outside.box((hx + 0.87, 0.03, hz), (0.12, 0.06, 0.8), c('wood_dark', 0.06))
outside.box((hx, 0.05, hz + 1.2), (0.6, 0.1, 0.8), c('soot', 0.05))  # ash raked out
# A chopping block with an axe-mark, and a pile of rounds.
outside.pole((3.6, 0, 2.6), (3.6, 0.45, 2.6), 0.28, c('wood'), n=8, cap=c('cut'))
for i in range(6):
    outside.pole((3.0 + (i % 3) * 0.32, 0.15 + (i // 3) * 0.28, 3.4), (3.0 + (i % 3) * 0.32, 0.15 + (i // 3) * 0.28, 3.75), 0.15, c('wood', 0.08), n=7, cap=c('cut'))
objects = [build(f'hunter-wall-{k}', b, WOOD) for k, b in walls.items()] + [build('hunter-roof', roof, WOOD), build('hunter-outside', outside, WOOD)] + room('hunter')
export(objects, 'cabin-hunter.glb')

# =========================================================================================
# THE BURNT CABIN (RUIN in src/landmarks.js: the back wall and the left side still stand
# waist-high, the chimney at (1.9, -2.3), a tin box under the floor at (-1.1, -0.6))
random.seed(34)
ruin = Builder()
burnt = lambda: col(random.choice(('char', 'char', 'char_grey', 'soot')), 0.06)
y = -0.1
for row in range(4):
    for x0, x1 in ((-XW - 0.3, XW - 1.4),):
        cut = x1 - random.uniform(0, 1.2) * (row / 3)
        ruin.pole((x0, y, -ZW), (cut, y, -ZW), 0.15, burnt, n=7, wobble=0.12)
    if row < 3:
        ruin.pole((-XW, y + 0.14, -ZW - 0.3), (-XW, y + 0.14, ZW - 1.0 - row * 0.5), 0.15, burnt, n=7, wobble=0.12)
    y += 0.28
for x, z in ((XW, ZW), (-XW, ZW), (XW, -ZW)):  # charred stubs at the other corners
    ruin.pole((x, -0.1, z), (x, random.uniform(0.25, 0.6), z), 0.16, burnt, n=7, wobble=0.15)
# Fallen roof timbers and charred floor, ash.
for i in range(5):
    a = random.uniform(-0.5, 0.5)
    ruin.pole((random.uniform(-2, 0), 0.15, random.uniform(-1.5, 1.5)), (random.uniform(0.5, 2.5), random.uniform(0.1, 0.8), random.uniform(-1.5, 1.5)), 0.12, burnt, n=6, wobble=0.15)
z = -D
while z < D:
    w = random.uniform(0.3, 0.4)
    if random.random() < 0.7:
        x0 = random.uniform(-W, -0.5)
        ruin.box(((x0 + random.uniform(0.5, W)) / 2, 0.0, z + w / 2), (random.uniform(1.5, 4), 0.06, w - 0.03), burnt)
    z += w
ruin.box((0, -0.04, 0), (2 * W, 0.04, 2 * D), c('ash', 0.08))
# The chimney: dry stone, blackened at the hearth.
cx, cz = 1.9, -2.3
# (Laid in courses, each across the joints of the one below; a wide base with the hearth's
# opening in it, a shoulder where the stack narrows, and its top courses broken away.)
yy, course = 0.0, 0
while yy < 4.3:
    half = 0.62 if yy < 1.3 else 0.62 - 0.14 * min(1, (yy - 1.3) / 0.6)  # (narrowing above the hearth)
    shade = lambda h=yy: col('soot' if h < 0.9 + random.uniform(0, 0.5) else random.choice(('stone', 'stone', 'stone_dark', 'lichen')), 0.07)
    along = course % 2 == 0
    for k in range(3 if yy < 1.3 else 2):
        n = 3 if yy < 1.3 else 2
        off = (k - (n - 1) / 2) * (2 * half / n)
        for face in (-1, 1):
            if yy < 0.85 and face > 0 and abs(off) < 0.25 and along:
                continue  # the hearth's opening, toward the room
            where = (off if along else face * half / 2) + half
            if yy > 3.65 + 0.55 * where / (2 * half) + (0.1 if face > 0 else 0):
                continue  # the broken top: stepping down to one side, nothing left hanging
            size = (2 * half / n - 0.015, 0.2, half - 0.01)
            centre = (cx + off, yy + 0.11, cz + face * half / 2)
            if not along:
                size, centre = (size[2], size[1], size[0]), (cx + face * half / 2, yy + 0.11, cz + off)
            ruin.box(centre, size, shade, turn=random.uniform(-0.04, 0.04))
    yy += 0.21
    course += 1
ruin.box((cx, 0.42, cz + 0.2), (0.5, 0.8, 0.5), c('soot', 0.04))  # the black of the hearth
ruin.box((cx, 0.93, cz + 0.64), (1.3, 0.14, 0.2), c('stone_dark', 0.06))  # its lintel stone
for k in range(4):  # stones fallen from the top
    stone_into(ruin, (0.2, 0.12, 0.16), 470 + k, at=(cx - 0.9 - k * 0.35 + random.uniform(-0.1, 0.1), 0.0, cz + 0.9 + random.uniform(-0.4, 0.5)), turn=random.uniform(0, 3), mossy=False, subdivisions=2)
# The rusted stove, tipped over; fireweed coming up through the ash.
ruin.box((1.6, 0.25, -0.9), (0.62, 0.5, 0.5), c('rust_dark', 0.06), turn=0.4, roll=0.5)
for i in range(22):
    x, z = random.uniform(-W - 1, W + 1), random.uniform(-D - 1, D + 1.5)
    h = random.uniform(0.5, 1.1)
    lean = random.uniform(-0.06, 0.06)
    ruin.pole((x, -0.05, z), (x + lean, h, z), 0.014, c('moss_dark'), n=4)
    for k in range(3):  # leaves up the stem
        y = h * (0.25 + 0.17 * k)
        ruin.box((x + lean * y / h, y, z), (0.2 - k * 0.04, 0.012, 0.035), c('moss', 0.08), turn=k * 1.1 + i, roll=0.25)
    # (The flower spike: tapering to its tip, darker buds at the top.)
    ruin.pole((x + lean * 0.7, h * 0.68, z), (x + lean, h + 0.02, z), 0.045, c('fireweed', 0.08), n=5, taper=0.25)
    ruin.pole((x + lean, h, z), (x + lean * 1.1, h + 0.1, z), 0.014, c('fireweed_dark', 0.08), n=4, taper=0.3)
export([build('cabin-burnt-wall', ruin, WOOD)], 'cabin-burnt.glb')

# =========================================================================================
# THE ROAD BRIDGE (ROAD_BRIDGE in src/landmarks.js: the deck ±2.3 wide and ±9 long along z, its
# top at y = 0; the railings at x = ±2.45)
random.seed(35)
bridge = Builder()
HALF, LEN, RAIL = 2.3, 9, 2.45
z = -LEN
while z < LEN:
    w = random.uniform(0.24, 0.32)
    sag = -0.08 * math.cos(math.pi * (z + w / 2) / (2 * LEN)) ** 2  # (sags a little in the middle)
    if random.random() > 0.03:
        bridge.box((random.uniform(-0.05, 0.05), -0.05 + sag, z + w / 2), (2 * HALF + random.uniform(-0.1, 0.2), 0.1, w - 0.03), c(random.choice(('board_grey', 'board_pale', 'board_dark', 'plank')), 0.08), turn=random.uniform(-0.02, 0.02))
    z += w
for x in (-1.7, -0.6, 0.6, 1.7):  # the stringers under the deck
    bridge.pole((x, -0.32, -LEN - 0.4), (x, -0.32, LEN + 0.4), 0.2, c('wood_dark'), n=7, wobble=0.04)
for x in (-0.9, 0.9):  # the wheel planks laid along
    bridge.box((x, 0.02, 0), (0.5, 0.05, 2 * LEN), c('plank', 0.08))
# The cribs at each end and the pier in the middle: log boxes filled with stone.
for zc in (-LEN + 0.6, 0, LEN - 0.6):
    deep = 2.4 if zc == 0 else 1.4
    for k in range(int(deep / 0.3) + 1):
        y = -0.5 - k * 0.3
        if k % 2:
            for s in (-1, 1):
                bridge.pole((-HALF - 0.2, y, zc + s * 0.6), (HALF + 0.2, y, zc + s * 0.6), 0.15, c('wood_dark', 0.08), n=6)
        else:
            for s in (-1, 1):
                bridge.pole((s * (HALF - 0.1), y, zc - 0.8), (s * (HALF - 0.1), y, zc + 0.8), 0.15, c('wood_dark', 0.08), n=6)
    for k in range(5):
        bridge.stone((random.uniform(-HALF, HALF), -0.6 - deep * random.uniform(0.2, 0.9), zc + random.uniform(-0.5, 0.5)), (0.4, 0.3, 0.35), c(random.choice(('stone', 'stone_dark', 'lichen')), 0.06))
# The railings: posts and a top rail, one length of it broken and hanging.
for s in (-1, 1):
    zz = -LEN
    while zz <= LEN + 0.01:
        bridge.box((s * RAIL, 0.5, zz), (0.14, 1.0, 0.14), c('wood', 0.08))
        zz += 2.25
    for k in range(8):
        z0 = -LEN + k * 2.25
        if s > 0 and k == 5:
            bridge.box((s * RAIL + 0.15, 0.55, z0 + 1.1), (0.08, 0.08, 2.25), c('driftwood'), tilt=0.45)
            continue
        bridge.box((s * RAIL, 0.95, z0 + 1.125), (0.1, 0.1, 2.25), c('driftwood', 0.08))
        bridge.box((s * RAIL, 0.5, z0 + 1.125), (0.07, 0.07, 2.25), c('driftwood', 0.08))
export([build('road-bridge', bridge, WOOD)], 'road-bridge.glb')

# =========================================================================================
# THE TRAILHEAD'S NOTICE BOARD (facing +z; posts at x = ±0.9)
random.seed(36)
board = Builder()
for s in (-1, 1):
    board.box((s * 0.9, 1.05, 0), (0.14, 2.3, 0.14), c('wood', 0.06))
board.box((0, 1.45, 0), (1.9, 1.1, 0.06), c('board_dark', 0.05))
board.box((0, 1.45, 0.04), (1.75, 0.95, 0.02), c('board_grey', 0.05))
board.box((-0.35, 1.5, 0.06), (0.8, 0.6, 0.01), c('map_green', 0.05))  # the trail map
board.box((-0.35, 1.5, 0.065), (0.04, 0.5, 0.01), c('wool', 0.05), roll=0.4)  # the trail on it
for x, y in ((0.4, 1.7), (0.55, 1.3), (0.25, 1.15)):
    board.box((x, y, 0.06), (0.28, 0.34, 0.01), c(random.choice(('paper', 'paper_old')), 0.05), roll=random.uniform(-0.15, 0.15))
for s in (-1, 1):
    board.box((0, 2.3, s * 0.25), (2.3, 0.05, 0.6), c('shingle', 0.06), tilt=s * 0.5)
export([build('notice-board', board, WOOD)], 'notice-board.glb')

# =========================================================================================
# THE WEST LOOKOUT: lookout.py's tower, weathered: grey siding, a rusted roof.
source = open(os.path.join(HERE, 'lookout.py'), encoding='utf-8').read()
source = source.replace("siding=0x6f6a58, siding_dark=0x5a5648, trim=0xd8d2c0, roof_metal=0x5a6460, roof_dark=0x46504c",
                        "siding=0x76726a, siding_dark=0x5e5b55, trim=0xa8a296, roof_metal=0x7a4e34, roof_dark=0x5e3c2a")
source = source.replace("timber=0x5e4632, timber_dark=0x46342a", "timber=0x6a6058, timber_dark=0x524a42")
source = source.replace("random.seed(9)", "random.seed(19)")
source = source.replace("export(objects, 'lookout.glb')", "export(objects, 'lookout-old.glb')")
assert "lookout-old.glb" in source and "roof_metal=0x7a4e34" in source
exec(compile(source, os.path.join(HERE, 'lookout.py'), 'exec'), {'__file__': os.path.join(HERE, 'lookout.py'), '__name__': 'lookout_old'})
