# The fixed map's landmarks (src/landmarks.js places them; see src/layout.js for where):
#   observatory.glb  the observatory near the summit: a round stone tower with a copper dome
#                    ("observatory-roof", which fades from above), a door at the front (+z), and
#                    a paved terrace out in front with an iron railing and a telescope on it;
#   bridge-broken.glb  the old footbridge over the ravine, broken: the two ends still on their
#                    log stringers, the middle gone, planks and a rope hanging into the gap;
#   dock.glb         the lakeshore cabin's dock: a plank deck on posts, from the shore (the
#                    origin, at the deck's top) out 14 m along +z;
#   barn.glb         the farm's barn: red board walls, a gambrel roof ("barn-roof"), the big
#                    doors at the front (+z) standing open, hay inside;
#   stone-hut.glb    the blizzard shelter up the pass: a dry-stone hut with a turf roof
#                    ("stone-hut-roof") and a low door at the front.
# Each is built in game space (y up, +z toward the front) with its origin on the ground (or the
# deck) at its middle. Run in an open Blender (Blender MCP or the Text Editor), or:
# blender -b --python landmarks.py
import math, os, random, runpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, export, shared, tone, blend, PAL = R['Builder'], R['build'], R['export'], R['shared'], R['tone'], R['blend'], R['PAL']
tube, end_grain, rounded_box, bark_colour, g, stone_into = R['tube'], R['end_grain'], R['rounded_box'], R['bark_colour'], R['g'], R['stone_into']

PAL.update(
    plank_grey=0x8a8174, plank_pale=0x9d958a, plank_dark=0x655c52, rope=0xa8946a, rope_dark=0x7e6c4a,
    copper=0x5f8a78, copper_dark=0x4a6e60, copper_old=0x7a6a4a, iron_dark=0x2f2d2b, brass=0x9a7f45,
    barn_red=0x8a3b2c, barn_red_pale=0x9e5644, barn_red_dark=0x6b2e24, trim=0xc9c0ad, roof_grey=0x4e4b47,
    roof_dark=0x3c3a37, hay=0xc9ad62, hay_dark=0xa58a48, turf=0x5a6b3a, turf_dark=0x46552f, mortar=0x8d877b,
    floor=0x6a5440, floor_dark=0x56432f,
)


def weathered(c, n):
    """Grey, weathered planks: streaks along the grain, darker underneath."""
    if n.y < -0.5:
        return blend('plank_dark', 'plank_grey', 0.3, 0.03)
    s = 0.5 + 0.5 * noise.noise(Vector((c.x * 2.1, c.y * 7, c.z * 2.1)))
    return blend('plank_grey', 'plank_pale', s * 0.8 + random.uniform(0, 0.2), 0.03)


def plank():
    """A weathered grey plank's colour (for boxes)."""
    return tone(random.choice(('plank_grey', 'plank_grey', 'plank_pale', 'plank_dark')), 0.05)


def granite():
    return tone(random.choice(('granite', 'granite_warm', 'granite_dark', 'granite', 'lichen_pale')), 0.06)


def stone_ring(b, radius, height, courses, per_course, gap=None, windows=()):
    """A round wall of dressed stone blocks, `courses` high. `gap`: (angle, half-width in
    radians, height) of a doorway left open; `windows`: [(angle, course)] blocks left out."""
    for k in range(courses):
        y0 = k * height / courses
        h = height / courses
        offset = (k % 2) * 0.5
        for i in range(per_course):
            a = math.tau * (i + offset) / per_course
            if gap and abs(math.atan2(math.sin(a - gap[0]), math.cos(a - gap[0]))) < gap[1] and y0 < gap[2]:
                continue
            if any(abs(math.atan2(math.sin(a - wa), math.cos(a - wa))) < 0.12 and k == wk for wa, wk in windows):
                continue
            length = math.tau * radius / per_course - 0.03
            b.box((math.sin(a) * radius, y0 + h / 2, math.cos(a) * radius), (length, h - 0.025, 0.42), granite, turn=a)


# ---------------------------------------------------------------- the observatory
OBS_R = 4.2  # the tower's radius
OBS_WALL = 4.4  # its height
TERRACE = (5.6, 3.9, 10.5)  # half its width, and where it starts and ends (z)


def observatory():
    random.seed(1701)
    b = Builder()
    # A plinth of rough stone round the foot.
    for i in range(30):
        a = math.tau * i / 30
        b.stone((math.sin(a) * (OBS_R + 0.15), 0.15, math.cos(a) * (OBS_R + 0.15)), (0.42, 0.25, 0.3), granite, points=10)
    door = (0.0, 0.2, 2.3)
    windows = [(math.pi * 0.5, 4), (math.pi, 4), (-math.pi * 0.5, 4), (math.pi * 0.75, 2), (-math.pi * 0.75, 2)]
    stone_ring(b, OBS_R, OBS_WALL, 9, 26, gap=door, windows=windows)
    # The door's lintel, and the door itself standing half open.
    b.box((0, 2.42, OBS_R), (1.9, 0.28, 0.5), granite)
    b.box((0.55, 1.15, OBS_R + 0.3), (0.08, 2.25, 1.0), lambda: tone('board_dark', 0.05), turn=1.1)
    # A cornice ring the dome sits on.
    for i in range(32):
        a = math.tau * i / 32
        b.box((math.sin(a) * (OBS_R + 0.08), OBS_WALL + 0.12, math.cos(a) * (OBS_R + 0.08)), (math.tau * (OBS_R + 0.1) / 32, 0.24, 0.62), lambda: tone('granite_dark', 0.04), turn=a)
    # Inside: a plank floor, a long desk under a window, shelves, and the telescope's pier.
    for i in range(10):
        z = -OBS_R + 0.35 + i * (2 * OBS_R - 0.7) / 10
        half = math.sqrt(max(0.1, (OBS_R - 0.15) ** 2 - z * z))
        b.box((0, 0.06, z + 0.37), (2 * half, 0.1, 0.74), lambda: tone(random.choice(('floor', 'floor_dark')), 0.05))
    b.box((0, 1.0, 0), (0.9, 2.0, 0.9), granite)  # the pier
    b.box((0, 2.05, 0), (1.1, 0.12, 1.1), lambda: tone('granite_dark', 0.04))
    # The big telescope on its pier, pointing up at the dome's slit.
    b.pole((0, 2.3, 0.6), (0, 4.6, -1.4), 0.32, lambda: tone('brass', 0.05), n=12, taper=0.8)
    b.pole((0, 2.1, 0), (0, 2.6, 0.2), 0.12, lambda: tone('iron_dark', 0.04), n=8)
    # The terrace: big paving slabs a step up, with an iron railing round its edge.
    half, z0, z1 = TERRACE
    for i in range(int((z1 - z0) / 0.9)):
        for j in range(int(2 * half / 1.1)):
            x = -half + 0.55 + j * 1.1
            z = z0 + 0.45 + i * 0.9
            b.box((x, 0.15, z), (1.06, 0.3, 0.86), lambda: tone(random.choice(('granite', 'granite_warm', 'lichen_pale')), 0.05))
    post = lambda: tone('iron_dark', 0.04)
    for x in (-half, half):
        for z in [z0 + 0.4 + k * 1.6 for k in range(5)] + [z1 - 0.1]:
            b.pole((x, 0.3, z), (x, 1.35, z), 0.035, post, n=6)
        b.pole((x, 1.3, z0 + 0.4), (x, 1.3, z1 - 0.1), 0.03, post, n=6)
        b.pole((x, 0.8, z0 + 0.4), (x, 0.8, z1 - 0.1), 0.02, post, n=6)
    for x in [-half + k * 1.4 for k in range(9)]:
        if x <= half:
            b.pole((x, 0.3, z1 - 0.1), (x, 1.35, z1 - 0.1), 0.035, post, n=6)
    b.pole((-half, 1.3, z1 - 0.1), (half, 1.3, z1 - 0.1), 0.03, post, n=6)
    b.pole((-half, 0.8, z1 - 0.1), (half, 0.8, z1 - 0.1), 0.02, post, n=6)
    # The terrace telescope: a brass spyglass on a tripod, looking north over the lake.
    tz = z1 - 1.6
    for a in (0, math.tau / 3, 2 * math.tau / 3):
        b.pole((math.sin(a) * 0.45, 0.3, tz + math.cos(a) * 0.45), (0, 1.25, tz), 0.025, lambda: tone('board_dark', 0.04), n=5)
    b.pole((0, 1.3, tz - 0.35), (0, 1.48, tz + 0.55), 0.07, lambda: tone('brass', 0.05), n=10, taper=0.7)
    base = build('observatory', b, shared('stone'))

    # The dome: copper panels gone green, in a hemisphere, with the shutter slit open at the front.
    d = Builder()
    rings, segs = 9, 28
    rad = OBS_R + 0.25
    for i in range(rings):
        t0, t1 = (i / rings) * math.pi / 2, ((i + 1) / rings) * math.pi / 2
        for j in range(segs):
            a0, a1 = math.tau * j / segs, math.tau * (j + 1) / segs
            mid = (a0 + a1) / 2
            if abs(math.atan2(math.sin(mid), math.cos(mid))) < 0.2 and i < rings - 1:
                continue  # the slit
            pts = [Vector((math.sin(a) * math.cos(t) * rad, OBS_WALL + 0.24 + math.sin(t) * rad, math.cos(a) * math.cos(t) * rad))
                   for a, t in ((a0, t0), (a1, t0), (a1, t1), (a0, t1))]
            colour = blend('copper', 'copper_dark', 0.5 + 0.5 * noise.noise(Vector((a0 * 1.5, t0 * 3, 4.2))), 0.04)
            if random.random() < 0.06:
                colour = blend('copper_dark', 'copper_old', 0.5, 0.04)
            d.add([g(*p) for p in pts], [(0, 1, 2, 3)], colour)
            inner = [p * 0.985 + Vector((0, (OBS_WALL + 0.24) * 0.015, 0)) for p in pts]
            d.add([g(*p) for p in inner], [(3, 2, 1, 0)], tone('copper_dark', 0.03, 0.6))
    # The slit's frame, and ribs between the panels.
    for side in (-1, 1):
        a = side * 0.2
        prev = None
        for i in range(rings + 1):
            t = (i / rings) * math.pi / 2
            p = (math.sin(a) * math.cos(t) * (rad + 0.04), OBS_WALL + 0.24 + math.sin(t) * (rad + 0.04), math.cos(a) * math.cos(t) * (rad + 0.04))
            if prev:
                d.pole(prev, p, 0.06, lambda: tone('iron_dark', 0.04), n=6)
            prev = p
    roof = build('observatory-roof', d, shared('metal', 0.55))
    return [base, roof]


# ---------------------------------------------------------------- the broken footbridge
def bridge_broken():
    random.seed(1702)
    b = Builder()
    W = 0.8  # half its width
    log = lambda seed: bark_colour(seed, peel=0.4)
    for side in (-1, 1):
        # The two log stringers each end still rests on, and the posts at the rim.
        for x in (-W + 0.15, W - 0.15):
            tube(b, [(Vector((x, -0.25, side * 7.6)), 0.16), (Vector((x, -0.22, side * 4.6)), 0.15)], 7, log(int(x * 10) + side * 3), rough=0.06)
        for x in (-W - 0.05, W + 0.05):
            b.pole((x, -0.6, side * 7.2), (x, 1.15, side * 7.2), 0.09, lambda: tone(random.choice(('bark', 'bark_grey')), 0.05), n=7)
        # The deck planks across them, the last few broken off ragged.
        n = 9
        for k in range(n):
            z = side * (7.5 - k * 0.36)
            ragged = random.uniform(-0.3, 0.3) if k >= n - 2 else 0
            b.box((ragged * 0.3, -0.04, z), (2 * W + 0.1 - abs(ragged), 0.07, 0.32), plank, turn=random.uniform(-0.03, 0.03))
        # Planks hanging down into the gap from the broken end, still nailed at one end.
        for k in range(3):
            x = -0.5 + k * 0.45
            top = side * (4.4 - k * 0.1)
            b.box((x, -0.85 - k * 0.2, top - side * 0.1), (0.3, 1.5 + k * 0.3, 0.06), plank, tilt=side * random.uniform(0.15, 0.4))
        # Hand ropes from the posts, the near span sagging off and dangling into the ravine.
        b.pole((-W - 0.05, 1.05, side * 7.2), (-W - 0.05, 0.9, side * 4.6), 0.025, lambda: tone('rope', 0.04), n=5)
        b.pole((-W - 0.05, 0.9, side * 4.6), (-W + 0.1, -2.6, side * 4.2), 0.02, lambda: tone('rope_dark', 0.04), n=5)
        b.pole((W + 0.05, 1.05, side * 7.2), (W + 0.05, 0.85, side * 4.8), 0.025, lambda: tone('rope', 0.04), n=5)
        b.pole((W + 0.05, 0.85, side * 4.8), (W - 0.2, -1.8, side * 4.5), 0.02, lambda: tone('rope_dark', 0.04), n=5)
        # Stones piled round the posts' feet.
        for k in range(5):
            b.stone((random.uniform(-1.2, 1.2), -0.1, side * random.uniform(7.0, 8.0)), (0.3, 0.2, 0.25), granite, points=9)
    return [build('bridge-broken', b, shared('wood'))]


# ---------------------------------------------------------------- the dock
DOCK_LENGTH = 14


def dock():
    random.seed(1703)
    b = Builder()
    W = 1.1
    for k in range(int(DOCK_LENGTH / 0.32)):
        z = 0.16 + k * 0.32
        if k in (17, 31):  # a couple of planks gone
            continue
        b.box((random.uniform(-0.04, 0.04), -0.04, z), (2 * W + random.uniform(-0.05, 0.12), 0.07, 0.3), plank, turn=random.uniform(-0.02, 0.02))
    for x in (-W + 0.2, W - 0.2):  # the joists
        b.box((x, -0.16, DOCK_LENGTH / 2), (0.14, 0.16, DOCK_LENGTH), lambda: tone('plank_dark', 0.04))
    for z in [0.3 + k * 2.3 for k in range(7)]:  # posts down into the lake bed
        for x in (-W - 0.05, W + 0.05):
            b.pole((x, 0.25 if z > DOCK_LENGTH - 1 else -0.1, z), (x, -3.2, z), 0.1, lambda: tone(random.choice(('bark_grey', 'plank_dark')), 0.05), n=7)
    # A cleat, and a coil of old rope at the end.
    b.box((W - 0.25, 0.05, DOCK_LENGTH - 0.6), (0.1, 0.08, 0.35), lambda: tone('iron_dark', 0.04))
    for k in range(10):
        a0, a1 = math.tau * k / 10, math.tau * (k + 1) / 10
        b.pole((-0.5 + math.cos(a0) * 0.25, 0.04, DOCK_LENGTH - 1.2 + math.sin(a0) * 0.25),
               (-0.5 + math.cos(a1) * 0.25, 0.04, DOCK_LENGTH - 1.2 + math.sin(a1) * 0.25), 0.035, lambda: tone('rope', 0.05), n=5)
    return [build('dock', b, shared('wood'))]


# ---------------------------------------------------------------- the barn
BARN = (5.0, 7.0, 4.2)  # half width, half depth, wall height


def barn():
    random.seed(1704)
    b = Builder()
    W, D, H = BARN
    boards = lambda: tone(random.choice(('barn_red', 'barn_red', 'barn_red_pale', 'barn_red_dark')), 0.05)
    # Board-and-batten walls: vertical boards round all four sides, the front left open for the doors.
    def wall(x0, z0, x1, z1, top_at):
        length = math.hypot(x1 - x0, z1 - z0)
        n = int(length / 0.3)
        turn = math.atan2(x1 - x0, z1 - z0) + math.pi / 2
        for k in range(n):
            t = (k + 0.5) / n
            x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            top = top_at(x, z)
            b.box((x, top / 2, z), (0.29, top, 0.06), boards, turn=turn)
    gable = lambda x, z: H + max(0.0, gambrel(abs(x)) - H - 0.12)
    wall(-W, -D, W, -D, gable)  # the back
    wall(-W, -D, -W, D, lambda x, z: H)
    wall(W, -D, W, D, lambda x, z: H)
    # The front: either side of the doorway, and the gable above it with the hayloft door.
    wall(-W, D, -2.1, D, gable)
    wall(2.1, D, W, D, gable)
    for k in range(14):
        x = -2.1 + (k + 0.5) * 4.2 / 14
        top = gable(x, D)
        b.box((x, (4.1 + top) / 2, D), (0.29, top - 4.1, 0.06), boards)
    b.box((0, 5.6, D + 0.05), (1.4, 1.5, 0.05), lambda: tone('barn_red_dark', 0.04))  # the hayloft door
    # White trim round the doorway and corners.
    for x in (-2.15, 2.15):
        b.box((x, 2.05, D + 0.04), (0.14, 4.1, 0.08), lambda: tone('trim', 0.04))
    b.box((0, 4.1, D + 0.04), (4.4, 0.14, 0.08), lambda: tone('trim', 0.04))
    for x in (-W, W):
        for z in (-D, D):
            b.box((x, H / 2, z), (0.16, H, 0.16), lambda: tone('trim', 0.04))
    # The big doors, swung open against the front wall, with a white X on each.
    for side in (-1, 1):
        x = side * (2.1 + 1.05)
        b.box((x, 2.0, D + 0.18), (2.1, 4.0, 0.08), boards)
        for tilt in (1, -1):
            b.box((x, 2.0, D + 0.24), (0.12, 4.3, 0.04), lambda: tone('trim', 0.04), roll=tilt * 0.48)
    # Inside: a dirt-and-straw floor, a few bales, a loft floor over the back half.
    for k in range(6):
        b.box((random.uniform(-W + 1, W - 1), 0.03, random.uniform(-D + 1, D - 3)), (random.uniform(1, 2), 0.04, random.uniform(1, 2)), lambda: tone(random.choice(('hay', 'hay_dark')), 0.06), turn=random.uniform(0, 3))
    for x, z, y in ((-3.6, -5.6, 0.25), (-3.6, -4.4, 0.25), (-3.6, -5.0, 0.75), (3.7, -5.6, 0.25)):
        rounded_box(b, (x - 0.55, y - 0.25, z - 0.38), (x + 0.55, y + 0.25, z + 0.38), 0.06, lambda c, n: tone(random.choice(('hay', 'hay_dark')), 0.05))
    for k in range(int(2 * W / 0.3)):
        x = -W + 0.15 + k * 0.3
        b.box((x, H - 0.1, -D / 2 - 0.5), (0.29, 0.06, D - 1), lambda: tone('floor_dark', 0.05))
    walls = build('barn', b, shared('wood'))

    # The gambrel roof: steep lower slopes, shallow upper ones, in dark grey shingles.
    r = Builder()
    eave = 0.5
    for z0 in [-D - eave + k * 0.5 for k in range(int((2 * D + 2 * eave) / 0.5))]:
        prev = None
        for x in [-W - eave + k * (2 * W + 2 * eave) / 16 for k in range(17)]:
            y = gambrel(abs(x)) + 0.05
            if prev:
                px, py = prev
                c = tone(random.choice(('roof_grey', 'roof_grey', 'roof_dark')), 0.05)
                pts = [(px, py, z0), (x, y, z0), (x, y, z0 + 0.5), (px, py, z0 + 0.5)]
                r.add([g(*p) for p in pts], [(0, 1, 2, 3) if x > 0 else (3, 2, 1, 0)], c)
                r.add([g(*(p[0], p[1] - 0.04, p[2])) for p in pts], [(3, 2, 1, 0) if x > 0 else (0, 1, 2, 3)], tone('roof_dark', 0.03, 0.7))
            prev = (x, y)
    roof = build('barn-roof', r, shared('metal', 0.8))
    return [walls, roof]


def gambrel(x):
    """The barn roof's height `x` meters out from its ridge (the walls are 5 m out)."""
    W, _, H = BARN
    knee = 3.0  # where the slopes change
    if x <= knee:
        return 8.2 - (8.2 - 6.9) * (x / knee)
    return 6.9 - (6.9 - H) * min(1.0, (x - knee) / (W + 0.5 - knee))


# ---------------------------------------------------------------- the stone hut
HUT = (1.8, 2.1, 2.0)  # half width, half depth, wall height


def stone_hut():
    random.seed(1705)
    b = Builder()
    W, D, H = HUT
    # Dry-stone walls: courses of rough blocks, the door (front, +z) left open.
    for k in range(7):
        y = 0.15 + k * H / 7
        for side_x, side_z, length, along in ((0, -D, 2 * W, 'x'), (-W, 0, 2 * D, 'z'), (W, 0, 2 * D, 'z'), (0, D, 2 * W, 'x')):
            n = int(length / 0.45)
            for i in range(n + 1):
                t = -length / 2 + (i + (k % 2) * 0.5) * length / n
                if abs(t) > length / 2:
                    continue
                x, z = (t, side_z) if along == 'x' else (side_x, t)
                if side_z == D and along == 'x' and abs(x) < 0.55 and y < 1.65:
                    continue  # the doorway
                size = (random.uniform(0.34, 0.48), H / 7 - 0.03, 0.4) if along == 'x' else (0.4, H / 7 - 0.03, random.uniform(0.34, 0.48))
                rounded_box(b, (x - size[0] / 2, y - size[1] / 2 + random.uniform(-0.01, 0.01), z - size[2] / 2), (x + size[0] / 2, y + size[1] / 2, z + size[2] / 2), 0.04,
                            lambda c, n: granite(), segments=1)
    b.box((0, 1.75, D), (1.5, 0.2, 0.5), lambda: tone('granite_dark', 0.04))  # the lintel
    # Inside: a plank bench along the back wall, and a small iron stove.
    b.box((0, 0.42, -D + 0.45), (2 * W - 0.6, 0.08, 0.5), plank)
    for x in (-W + 0.5, W - 0.5):
        b.box((x, 0.2, -D + 0.45), (0.08, 0.4, 0.4), plank)
    b.box((W - 0.55, 0.35, 0.3), (0.5, 0.7, 0.5), lambda: tone('iron_dark', 0.04))
    b.pole((W - 0.55, 0.7, 0.3), (W - 0.55, H + 0.9, 0.3), 0.07, lambda: tone('iron_dark', 0.04), n=8)
    walls = build('stone-hut', b, shared('stone'))
    # A turf roof on a low pitch, heavy and green-brown.
    r = Builder()
    for side in (-1, 1):
        def at(u, v, side=side):
            x = side * (W + 0.35) * u
            return (x, H + 0.85 - 0.75 * u + 0.05 * noise.noise(Vector((u * 4, v * 4, side))), (v - 0.5) * (2 * D + 0.7))
        r.sheet(at, 6, 8, lambda: tone(random.choice(('turf', 'turf', 'turf_dark')), 0.06))
    roof = build('stone-hut-roof', r, shared('plain'))
    return [walls, roof]


export(observatory(), 'observatory.glb')
export(bridge_broken(), 'bridge-broken.glb')
export(dock(), 'dock.glb')
export(barn(), 'barn.glb')
export(stone_hut(), 'stone-hut.glb')
print('@@ landmarks done')
