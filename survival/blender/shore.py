# What lies along the water's edge (placed by src/world.js: see BANKS and SEA_SHORE there):
#   bank-edge-1..2.glb    a torn length of river bank, 3.4 m along x, the water toward +z: an
#                         undercut face of dark earth under an overhanging lip of sod, roots
#                         hanging out of it, stones in its foot, a clod slumped into the water,
#                         grass leaning over. Origin at the waterline, y = 0 the water's surface;
#   bank-stones-1..3.glb  cobbles and small boulders along a waterline (along x, water toward
#                         +z), half in and half out: dark and wet low down;
#   driftwood-1..3.glb    bleached, barkless trunks lying along x, origin on the ground at the
#                         middle: one with its root wad, one with broken branch stubs, one forked;
#   shore-rock-1..3.glb   the sea's rocks: a dome, a long low ledge and a stack, each with
#                         smaller ones round its foot; dark and wet up to the tide line.
# Authored in the game's axes (x right, y up, z toward the front). Run in an open Blender
# (Blender MCP or the Text Editor), or: blender -b --python shore.py
# (It doesn't clear the scene: it removes what it makes once it's exported. Set KEEP before
# running it to look at the models in Blender instead, laid out in a row.)
import math, os, random, runpy, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, noise
from kit import PAL, Builder, build, export, g

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
stone_into_ground, shared, tone, tube, end_grain, blend = R['stone_into'], R['shared'], R['tone'], R['tube'], R['end_grain'], R['blend']
PAL.update(
    soil=0x4d3d2f, soil_dark=0x33291f, soil_pale=0x6b563f, root=0x6a5a48, root_pale=0x8a7860,
    # (the ground's own autumn colours, as they reach the screen: see terrain.js)
    sod_gold=0x8c7444, sod_orange=0x866a40, sod_olive=0x6c6a40, sod_dark=0x4e4830, straw=0x8a7446, straw_pale=0xa08a56,
)
ROCK = shared('rock', 0.95)
WOOD = shared('wood', 0.93)
EARTH = shared('earth', 0.97)
KEEP = globals().get('KEEP')
made = []


def stone_into(b, size, seed, at=(0, 0, 0), **options):
    """remake.py's stone, but at any height: it shades a stone by its height above y = 0, so
    build it there, then move it."""
    b.bm.verts.ensure_lookup_table()
    first = len(b.bm.verts)
    stone_into_ground(b, size, seed, at=(at[0], 0, at[2]), **options)
    b.bm.verts.ensure_lookup_table()
    for v in b.bm.verts[first:]:
        v.co.z += at[1]


def both(b, pts, colour):
    """A face seen from either side."""
    verts = [g(*p) for p in pts]
    order = tuple(range(len(pts)))
    b.add(verts, [order], colour)
    b.add(verts, [order[::-1]], colour)


def finish(objects, fname):
    if KEEP:
        for o in objects:
            o.location.x += len(made) * 7.0
        made.append(fname)
    else:
        export(objects, fname)


# =========================================================================================
# COBBLES ALONG A WATERLINE
def bank_stones(seed, count, length):
    random.seed(seed)
    b = Builder()
    for k in range(count):
        big = random.random() < 0.3
        r = random.uniform(0.3, 0.55) if big else random.uniform(0.12, 0.26)
        x = random.uniform(-length / 2, length / 2)
        z = random.uniform(-0.5, 1.0)  # (from up the bank to out in the water)
        size = (r * random.uniform(0.9, 1.4), r * random.uniform(0.55, 0.9), r * random.uniform(0.8, 1.2))
        # (Lower the further out it lies, so those in the water just break the surface.)
        y = -0.12 - 0.22 * max(0, z) - (0.1 if not big else 0)
        stone_into(b, size, seed * 31 + k, at=(x, y, z), turn=random.uniform(0, 3), mossy=big and z < 0.2,
                   sooty=0.45 if z > 0.1 else 0.0, subdivisions=2 if big else 1, sink=0.08)
    return build(f'bank-stones', b, ROCK)


for i, (count, length) in enumerate(((7, 2.2), (10, 3.0), (5, 1.6)), start=1):
    finish([bank_stones(900 + i, count, length)], f'bank-stones-{i}.glb')


# =========================================================================================
# A TORN LENGTH OF RIVER BANK
def bank_edge(seed):
    random.seed(seed)
    earth, wood, rock = Builder(), Builder(), Builder()
    n = 9
    length = 3.4
    cols = []
    for i in range(n + 1):
        t = i / n
        end = math.sin(math.pi * t) ** 0.6  # 0 at its ends (where it runs back into the bank), 1 between
        x = (t - 0.5) * length
        z = 0.22 * noise.noise(Vector((t * 3.1, seed, 0))) + random.uniform(-0.06, 0.06) - 0.35 * (1 - end)
        height = (0.3 + 0.1 * noise.noise(Vector((t * 2.3, seed, 5)))) * end
        cols.append((x, z, height, end))
    bite = random.randrange(2, n - 2)  # where a piece has fallen out of it
    cols[bite] = (cols[bite][0], cols[bite][1] - 0.22, cols[bite][2] * 0.9, cols[bite][3])
    main = random.choice(('sod_gold', 'sod_gold', 'sod_orange', 'sod_olive'))  # (each length of a piece, not striped)
    sod = lambda: tone(main if random.random() < 0.8 else 'sod_olive', 0.05)
    for (x0, z0, h0, e0), (x1, z1, h1, e1) in zip(cols, cols[1:]):
        # The face of bare earth: cut back under the lip, wet and dark at its foot.
        foot0, foot1 = (x0, -0.4, z0 - 0.02), (x1, -0.4, z1 - 0.02)
        mid0, mid1 = (x0, h0 * 0.45 - 0.05, z0 - 0.14 * e0), (x1, h1 * 0.45 - 0.05, z1 - 0.14 * e1)
        top0, top1 = (x0, h0, z0 - 0.05 * e0), (x1, h1, z1 - 0.05 * e1)
        both(earth, [foot0, foot1, mid1, mid0], tone('soil_dark', 0.06))
        both(earth, [mid0, mid1, top1, top0], tone(random.choice(('soil', 'soil', 'soil_pale')), 0.07))
        # The lip of sod overhanging it, and the turf running back up the bank behind.
        lip0, lip1 = (x0, h0 + 0.02, z0 + 0.16 * e0), (x1, h1 + 0.02, z1 + 0.16 * e1)
        under0, under1 = (x0, h0 - 0.07 * e0, z0 + 0.12 * e0), (x1, h1 - 0.07 * e1, z1 + 0.12 * e1)
        crest0, crest1 = (x0, h0 + 0.06, z0 - 0.1), (x1, h1 + 0.06, z1 - 0.1)
        back0, back1 = (x0, h0 + 0.16 * e0 + 0.02, -0.62), (x1, h1 + 0.16 * e1 + 0.02, -0.62)
        both(earth, [top0, top1, under1, under0], tone('soil_dark', 0.05))
        both(earth, [under0, under1, lip1, lip0], tone('sod_dark', 0.06))
        both(earth, [lip0, lip1, crest1, crest0], sod())
        both(earth, [crest0, crest1, back1, back0], sod())
        # Grass leaning out over the water from the lip.
        for _ in range(random.randrange(2, 6)):
            f = random.random()
            bx, bz, by = x0 + (x1 - x0) * f, z0 + (z1 - z0) * f + random.uniform(-0.45, 0.12), h0 + (h1 - h0) * f + 0.05
            if min(e0, e1) < 0.3:
                continue
            tall = random.uniform(0.16, 0.34)
            lean = random.uniform(0.06, 0.22)
            w = random.uniform(0.02, 0.035)
            turn = random.uniform(-0.5, 0.5)
            tip = (bx + turn * 0.2, by + tall * 0.75, bz + lean)
            both(earth, [(bx - w, by, bz), (bx + w, by, bz - 0.02), tip], tone(random.choice(('straw', 'straw_pale', 'sod_gold')), 0.07))
    # Roots hanging out of the face, down toward the water.
    for _ in range(6):
        i = random.randrange(1, n - 1)
        x, z, h, e = cols[i]
        a = Vector((x + random.uniform(-0.15, 0.15), h * random.uniform(0.35, 0.8), z - 0.08))
        mid = a + Vector((random.uniform(-0.15, 0.15), -0.12, random.uniform(0.18, 0.34)))
        end = mid + Vector((random.uniform(-0.2, 0.2), -random.uniform(0.2, 0.42), random.uniform(0.02, 0.2)))
        r = random.uniform(0.018, 0.035)
        colour = lambda: tone(random.choice(('root', 'root_pale')), 0.06)
        wood.pole(tuple(a), tuple(mid), r, colour, n=4, taper=0.8)
        wood.pole(tuple(mid), tuple(end), r * 0.8, colour, n=4, taper=0.4)
    # Stones in its foot, and a clod of it slumped into the water.
    for k in range(3):
        i = random.randrange(1, n)
        x, z, h, e = cols[i]
        r = random.uniform(0.12, 0.24)
        stone_into(rock, (r * 1.2, r * 0.8, r), seed * 17 + k, at=(x, -0.2, z + random.uniform(0.0, 0.3)), turn=random.uniform(0, 3),
                   mossy=False, sooty=0.5, subdivisions=1, sink=0.06)
    cx, cz = cols[bite][0], cols[bite][1] + 0.55
    earth.stone((cx, -0.12, cz), (0.3, 0.14, 0.22), lambda: tone(random.choice(('soil', 'soil_dark')), 0.06), points=8)
    both(earth, [(cx - 0.26, 0.03, cz - 0.16), (cx + 0.24, 0.05, cz - 0.14), (cx + 0.2, 0.0, cz + 0.18), (cx - 0.22, -0.02, cz + 0.16)], sod())
    return [build('bank-edge-earth', earth, EARTH), build('bank-edge-roots', wood, WOOD), build('bank-edge-stones', rock, ROCK)]


for i in (1, 2):
    finish(bank_edge(920 + i), f'bank-edge-{i}.glb')


# =========================================================================================
# DRIFTWOOD
def drift_colour(seed):
    """Bleached, barkless wood: silver-grey, paler along its top, darker underneath."""
    def colour(t, a, normal):
        q = Vector((t * 5.0, math.cos(a) * 1.3, math.sin(a) * 1.3 + seed))
        shade = 0.5 + 0.5 * noise.noise(q * 1.6)
        if normal.y < -0.35:
            return blend('bark_grey', 'silver', 0.3 + 0.4 * shade)
        return blend('silver', 'silver_pale', min(1, 0.25 + 0.6 * shade + 0.25 * max(0, normal.y)))
    return colour


def limb(b, start, direction, length, r0, seed, sides=5, droop=0.0, jagged=0.2):
    """A branch stub or root from `start`, tapering, snapped off at its end."""
    d = direction.normalized()
    path = []
    for k in range(4):
        t = k / 3
        p = start + d * length * t + Vector((0, -droop * length * t * t, 0)) + Vector((noise.noise(Vector((seed, t * 2, 0))), 0, noise.noise(Vector((seed, t * 2, 7))))) * 0.06 * length
        path.append((p, r0 * (1 - 0.6 * t)))
    rings = tube(b, path, sides, drift_colour(seed), rough=0.1, seed=seed)
    end_grain(b, rings[-1], path[-1][0], d, jagged=jagged * r0 * 3)


def driftwood(seed, length, r0, roots=0, stubs=0, fork=False):
    random.seed(seed)
    b = Builder()
    bend = random.uniform(-0.25, 0.25)
    path = []
    n = 12
    for i in range(n + 1):
        t = i / n
        r = r0 * (1 - 0.55 * t) * (1.25 if i == 0 and roots else 1)
        p = Vector(((t - 0.5) * length, r0 * 0.85 + 0.05 * math.sin(t * 5 + seed), bend * math.sin(math.pi * t) * length * 0.25))
        path.append((p, r))
    rings = tube(b, path, 8, drift_colour(seed), rough=0.12, seed=seed)
    end_grain(b, rings[-1], path[-1][0], Vector((1, 0, 0)), jagged=0.25)
    if roots:
        # The root wad: roots splayed out round its butt, the earth long washed out of them.
        base = path[0][0]
        for k in range(roots):
            a = math.tau * k / roots + random.uniform(-0.3, 0.3)
            d = Vector((-random.uniform(0.25, 0.7), math.sin(a), math.cos(a)))
            limb(b, base + Vector((0.05, 0, 0)), d, random.uniform(0.55, 1.15) * r0 * 4, r0 * random.uniform(0.28, 0.42), seed + k, droop=0.0)
        end_grain(b, rings[0][::-1], base, Vector((-1, 0, 0)), jagged=0.1)
    else:
        end_grain(b, rings[0][::-1], path[0][0], Vector((-1, 0, 0)), jagged=0.3)
    for k in range(stubs):
        t = random.uniform(0.25, 0.9)
        i = int(t * n)
        a = random.uniform(-0.4, math.pi + 0.4)  # (none underneath: it lies on those)
        d = Vector((random.uniform(0.2, 0.7), math.sin(a), math.cos(a)))
        limb(b, path[i][0], d, random.uniform(0.25, 0.95), path[i][1] * random.uniform(0.3, 0.45), seed + 20 + k)
    if fork:
        i = int(n * 0.55)
        limb(b, path[i][0], Vector((0.8, 0.35, 0.6)), length * 0.42, path[i][1] * 0.75, seed + 40, sides=7)
    return build('driftwood', b, WOOD)


finish([driftwood(941, 6.2, 0.26, roots=8, stubs=3)], 'driftwood-1.glb')
finish([driftwood(942, 4.4, 0.19, stubs=7)], 'driftwood-2.glb')
finish([driftwood(943, 5.2, 0.22, stubs=3, fork=True)], 'driftwood-3.glb')


# =========================================================================================
# THE SEA'S ROCKS
def shore_rock(seed, lumps, skirt):
    """`lumps`: (half-extents x, height, z; at x, z; turn) each. `skirt`: how many small ones
    lie round its foot. Dark and wet up from the ground, as the tide leaves it."""
    random.seed(seed)
    b = Builder()
    reach = max(max(s[0], s[2]) + math.hypot(*at) for s, at, _ in lumps)
    for k, (size, at, turn) in enumerate(lumps):
        stone_into(b, size, seed * 13 + k, at=(at[0], 0, at[1]), turn=turn, mossy=False, sooty=min(0.6, 0.55 / size[1]), cuts=7, rough=0.26, sink=0.3)
    for k in range(skirt):
        a = math.tau * k / skirt + random.uniform(-0.4, 0.4)
        r = random.uniform(0.25, 0.5)
        d = reach * random.uniform(0.85, 1.15)
        stone_into(b, (r * 1.2, r * 0.8, r), seed * 13 + 50 + k, at=(math.cos(a) * d, 0, math.sin(a) * d), turn=random.uniform(0, 3),
                   mossy=False, sooty=0.7, subdivisions=2, sink=0.15)
    return build('shore-rock', b, ROCK)


finish([shore_rock(961, [((1.5, 1.5, 1.25), (0, 0), 0.3), ((0.8, 0.8, 0.7), (1.5, 0.5), 1.4)], 4)], 'shore-rock-1.glb')
finish([shore_rock(962, [((2.2, 0.75, 1.1), (0, 0), 0.1), ((1.2, 1.05, 0.9), (-0.8, -0.5), 0.9), ((0.7, 0.5, 0.6), (2.0, 0.6), 2.0)], 3)], 'shore-rock-2.glb')
finish([shore_rock(963, [((1.05, 2.5, 0.95), (0, 0), 0.6), ((0.9, 1.2, 0.8), (0.9, 0.5), 2.2)], 5)], 'shore-rock-3.glb')
