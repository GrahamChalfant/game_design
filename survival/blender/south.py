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
                # battens over the joints
                centre, size = place(a, top / 2 - 0.06, (0.06, top + 0.1))
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
    walls['back'].box((1.05, 0.86, -ZW - 0.02), (1.25, 0.08, 0.1), c(trim))
    walls['back'].box((1.05, 1.6, -ZW - 0.02), (1.25, 0.08, 0.1), c(trim))
    walls['right'].box((XW + 0.02, 0.86, -0.05), (0.1, 0.08, 1.25), c(trim))
    walls['right'].box((XW + 0.02, 1.6, -0.05), (0.1, 0.08, 1.25), c(trim))
    # The door, hanging open into the room.
    turn = -1.4
    hinge = Vector((-DOOR, 0, ZW - 0.1))
    for i in range(4):
        off = Matrix.Rotation(turn, 3, 'Y') @ Vector((0.14 + i * 0.27, 0.95, 0))
        walls['front'].box(tuple(hinge + off), (0.26, 1.88, 0.05), c('plank', 0.08), turn=turn)
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
    turn = -1.45
    hinge = Vector((-DOOR, 0, ZW - 0.1))
    for i in range(4):
        off = Matrix.Rotation(turn, 3, 'Y') @ Vector((0.14 + i * 0.27, 0.95, 0))
        walls['front'].box(tuple(hinge + off), (0.26, 1.88, 0.05), c('plank', 0.08), turn=turn)
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
roof.box((2.0, PEAK + 0.3, -1.65), (0.5, 1.2, 0.5), c('stone_dark', 0.06))  # a brick-ish chimney
roof.box((2.0, PEAK + 0.92, -1.65), (0.6, 0.08, 0.6), c('stone', 0.06))
outside = Builder()
# The shed, half fallen: three walls of grey boards, the roof slumped down to the ground on one side.
sx, sz = 6.4, -0.9
for k in range(12):
    z = sz - 1.6 + k * 0.28
    outside.box((sx + 1.4, 1.0, z), (0.05, 2.0, 0.26), c(random.choice(('board_grey', 'board_dark')), 0.07))
for k in range(9):
    x = sx - 1.0 + k * 0.28
    h = 2.0 - k * 0.12
    outside.box((x, h / 2, sz - 1.65), (0.26, h, 0.05), c(random.choice(('board_grey', 'board_dark')), 0.07))
for k in range(9):
    x = sx - 1.0 + k * 0.28
    outside.box((x, 1.1 - k * 0.05, sz + 1.0), (0.26, 0.05, 2.8), c(random.choice(('shingle', 'shingle_dark', 'moss')), 0.06), roll=0.55)
outside.box((sx - 1.3, 0.12, sz + 0.4), (0.5, 0.25, 1.6), c('board_dark'), turn=0.3)  # fallen boards
for i in range(4):
    outside.box((sx - 0.6 + i * 0.2, 0.05, sz + 1.7), (1.6, 0.04, 0.16), c('board_grey'), turn=random.uniform(-0.4, 0.4))
# The well: a ring of stone, a little roof on two posts, the windlass and a bucket.
wx, wz = -5.0, 3.4
for k in range(12):
    a = math.tau * k / 12
    stone_into(outside, (0.22, 0.24, 0.18), 400 + k, at=(wx + math.cos(a) * 0.62, 0.2, wz + math.sin(a) * 0.62), turn=a, mossy=True)
outside.pole((wx, 0.05, wz), (wx, 0.06, wz), 0.5, c('soot'), n=12)  # the dark water down the hole
for s in (-1, 1):
    outside.pole((wx + s * 0.75, 0, wz), (wx + s * 0.75, 1.8, wz), 0.06, c('wood'), n=6)
outside.pole((wx - 0.8, 1.25, wz), (wx + 0.8, 1.25, wz), 0.07, c('wood_dark'), n=8)  # the windlass
for s in (-1, 1):
    outside.box((wx, 1.95, wz + s * 0.32), (1.9, 0.04, 0.75), c('shingle', 0.06), tilt=s * 0.6)
outside.pole((wx + 0.3, 1.2, wz), (wx + 0.3, 0.75, wz), 0.01, c('rope'), n=4)
outside.pole((wx + 0.3, 0.55, wz), (wx + 0.3, 0.78, wz), 0.13, c('iron', 0.05), n=8, taper=1.2)
# A woodpile against the house's side (wood to take is in the game's code) and a fence post or two.
for k in range(3):
    outside.pole((-XW - 0.3 - k * 0.6, 0, ZW + 1.6), (-XW - 0.3 - k * 0.6, 1.0, ZW + 1.6), 0.06, c('driftwood'), n=5)
outside.pole((-XW - 0.3, 0.8, ZW + 1.6), (-XW - 1.6, 0.75, ZW + 1.6), 0.04, c('driftwood'), n=5)
objects = home_walls + [build('homestead-roof', roof, WOOD), build('homestead-outside', outside, WOOD)] + room('homestead')
export(objects, 'cabin-homestead.glb')

# =========================================================================================
# THE HUNTER'S CABIN
random.seed(33)
walls = log_walls('hunter', ('log_dark', 'log', 'log_dark'))
# Antlers over the door, hides stretched on frames on the front wall.
front = walls['front']
front.box((0, 2.12, ZW + 0.12), (0.4, 0.22, 0.06), c('wood'))
for s in (-1, 1):
    base = Vector((s * 0.08, 2.15, ZW + 0.16))
    tip = base + Vector((s * 0.55, 0.45, 0.05))
    front.pole(tuple(base), tuple(tip), 0.035, c('bone', 0.05), n=5, taper=0.4)
    for k in range(3):
        p = base.lerp(tip, 0.35 + k * 0.25)
        front.pole(tuple(p), tuple(p + Vector((s * 0.05, 0.25, 0.02))), 0.025, c('bone', 0.05), n=4, taper=0.3)
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
yy = 0
while yy < 4.2:
    for dx in (-0.25, 0.25):
        for dz in (-0.25, 0.25):
            ruin.box((cx + dx, yy + 0.15, cz + dz), (0.5, 0.3, 0.5), (lambda h=yy: col('soot' if h < 1.0 else random.choice(('stone', 'stone_dark', 'lichen')), 0.07)), turn=random.uniform(-0.1, 0.1))
    yy += 0.3 if yy < 3.0 else 0.32
ruin.box((cx, 0.5, cz + 0.32), (0.6, 0.7, 0.2), c('soot'))
# The rusted stove, tipped over; fireweed coming up through the ash.
ruin.box((1.6, 0.25, -0.9), (0.62, 0.5, 0.5), c('rust_dark', 0.06), turn=0.4, roll=0.5)
for i in range(22):
    x, z = random.uniform(-W - 1, W + 1), random.uniform(-D - 1, D + 1.5)
    h = random.uniform(0.5, 1.1)
    ruin.pole((x, 0, z), (x + random.uniform(-0.05, 0.05), h, z), 0.015, c('moss_dark'), n=4)
    ruin.box((x, h - 0.12, z), (0.08, 0.3, 0.08), c(random.choice(('fireweed', 'fireweed_dark')), 0.08))
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
