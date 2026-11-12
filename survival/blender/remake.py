# Builds most of the game's models from scratch, into survival/public/models/, at the sizes
# the game expects (so collisions still fit), with the part names and hinges it looks for.
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python remake.py
#
# The aim is the needle-card spruce's level: natural, irregular shapes with enough faces to
# read as stone or wood up close, coloured the way the real thing weathers, still faceted.
#   rocks: a fine sphere roughened by noise and cut by a few cleavage planes, so it chips like
#          real stone, with a flat sunk base; darker underneath and in its hollows, lichen and
#          moss on top.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Vector, noise
from kit import OUT, PAL, Builder, build, export, g, material, reset

PAL.update(
    granite=0x7e7d76, granite_warm=0x86806f, granite_dark=0x5a5a57, granite_deep=0x45464a,
    lichen_pale=0x93937c, lichen_gold=0x968c66, moss_rock=0x46553a, moss_rock_dark=0x36432d,
)
LOOK = ''  # (the folder under public/models/ they go into)
os.makedirs(os.path.join(OUT, LOOK), exist_ok=True)


def shared(name, rough=0.95):
    """One material per name, made by this script and reused run after run (otherwise an open
    Blender numbers them). One of the same name from elsewhere (say, a model imported into the
    scene) is renamed out of the way: it may not be wired to the vertex colours."""
    m = bpy.data.materials.get(name)
    if m and m.get('remake'):
        return m
    if m:
        m.name = f'{name}-other'
    m = material(name, rough)
    m['remake'] = True
    return m


def tone(name, var=0.06, shade=1.0):
    h = PAL[name]
    k = (1 + random.uniform(-var, var)) * shade
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


# ---- rocks ----
def boulder(name, size, seed, cuts=6, rough=0.22, sink=0.12, subdivisions=3):
    """A boulder `size` (x, y, z half-extents above ground) across, base at the origin."""
    b = Builder()
    stone_into(b, size, seed, cuts, rough, sink, subdivisions)
    return build(name, b, shared('rock'))


def stone_into(b, size, seed, cuts=6, rough=0.22, sink=0.12, subdivisions=3, at=(0, 0, 0), turn=0.0, mossy=True, sooty=0.0):
    """Adds a stone like boulder()'s to `b`, at `at`, turned `turn` about y. (sooty: how far up
    from its base it's blackened by a fire beside it, 0 for none.)"""
    random.seed(seed)
    off = Vector((random.uniform(0, 50), random.uniform(0, 50), random.uniform(0, 50)))
    planes = []
    for _ in range(cuts):
        n = Vector((random.uniform(-1, 1), random.uniform(-0.2, 1), random.uniform(-1, 1))).normalized()
        planes.append((n, random.uniform(0.55, 0.85)))
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdivisions, radius=1)
    for v in tmp.verts:
        d = v.co.normalized()  # (worked in game axes, y up: g() turns them into Blender's)
        r = 1 + rough * noise.noise(d * 1.7 + off) + rough * 0.4 * noise.noise(d * 4.3 + off)
        p = d * r
        # Cleavage: everything past a plane is pushed back onto it, so the rock has a few big
        # flat faces and sharp-ish edges, like split granite.
        for n, offset in planes:
            over = p.dot(n) - offset
            if over > 0:
                p -= n * over * 0.9
        p = Vector((p.x * size[0], (p.y * 0.5 + 0.5) * (size[1] + sink) - sink, p.z * size[2]))
        p.y = max(p.y, -sink)
        c_, s_ = math.cos(turn), math.sin(turn)
        v.co = Vector((p.x * c_ - p.z * s_, p.y, p.x * s_ + p.z * c_)) + Vector(at)
    tmp.normal_update()
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*v.co) for v in tmp.verts]
    for f in tmp.faces:
        c = f.calc_center_median()
        n = f.normal
        up = n.y
        height = (c.y + sink) / (size[1] + sink)
        hollow = noise.noise(c * 2.2 + off)
        if sooty and (c.y - at[1] + sink) / (size[1] + sink) < sooty:
            colour = tone(random.choice(('granite_deep', 'granite_deep', 'granite_dark')), 0.05, 0.6)
        elif mossy and up > 0.62 and noise.noise(c * 1.6 + off * 2) > 0.05:
            colour = tone(random.choice(('moss_rock', 'moss_rock_dark')), 0.08)
        elif up > 0.2 and random.random() < 0.12:
            colour = tone(random.choice(('lichen_pale', 'lichen_gold')), 0.06)
        elif up < -0.3 or height < 0.12:
            colour = tone('granite_deep', 0.05)
        else:
            name_ = 'granite_dark' if hollow < -0.15 else random.choice(('granite', 'granite', 'granite_warm'))
            colour = tone(name_, 0.07, 0.86 + 0.2 * height)
        b.add(verts, [tuple(index[v] for v in f.verts)], colour)
    tmp.free()


# name: (half-extents x, height, z; seed; cuts; detail: 3 is 320 faces, 4 is 1,280)
ROCKS = {
    'rock': ((0.56, 0.77, 0.5), 11, 6, 4),
    'rock-small': ((0.29, 0.3, 0.22), 12, 5, 3),
    'rock-flat': ((0.95, 0.29, 0.65), 13, 5, 4),
    'rock-tall': ((0.4, 1.17, 0.3), 14, 6, 4),
    'rock-large': ((1.03, 1.28, 0.8), 15, 8, 4),
}


# ---- dead wood ----
PAL.update(
    bark=0x4c3b2e, bark_dark=0x3a2d24, bark_grey=0x5d554c, silver=0x8f877b, silver_pale=0xa39b8d,
    heart=0x8a6440, sapwood=0xc4a479, ring_dark=0x7a5636, moss_log=0x4a5a34, moss_log_dark=0x3a482b,
)


def frame(d):
    """Two directions square to `d`, for building a ring round it."""
    u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
    return u, d.cross(u).normalized()


def tube(b, path, sides, colour, rough=0.05, seed=0):
    """A round, slightly lumpy tube through `path` [(centre, radius)], coloured face by face by
    colour(t along it, angle round it, face normal). Returns its rings, for capping."""
    rings = []
    for i, (c, r) in enumerate(path):
        nxt = path[min(i + 1, len(path) - 1)][0]
        prv = path[max(i - 1, 0)][0]
        u, v = frame((nxt - prv).normalized())
        ring = []
        for k in range(sides):
            a = math.tau * k / sides
            bump = 1 + rough * noise.noise(Vector((i * 0.7, k * 0.9, seed)))
            ring.append(c + (u * math.cos(a) + v * math.sin(a)) * r * bump)
        rings.append(ring)
    n = len(rings)
    for i in range(n - 1):
        t = i / max(1, n - 2)
        for k in range(sides):
            k1 = (k + 1) % sides
            quad = [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]]
            normal = (quad[1] - quad[0]).cross(quad[3] - quad[0]).normalized()
            b.add([g(*p) for p in quad], [(0, 1, 2, 3)], colour(t, math.tau * (k + 0.5) / sides, normal))
    return rings


def end_grain(b, ring, centre, outward, jagged=0.0):
    """Caps a cut or broken end: bark rim, pale sapwood, darker heartwood in rings."""
    n = len(ring)
    mid = [centre + (p - centre) * 0.62 for p in ring]
    tip = centre + outward * jagged * 0.5
    for k in range(n):
        k1 = (k + 1) % n
        o0, o1 = ring[k], ring[k1]
        m0, m1 = mid[k] + outward * jagged * random.uniform(0, 1), mid[k1] + outward * jagged * random.uniform(0, 1)
        for pts, c in (([o0, m0, m1, o1], tone('sapwood', 0.06)), ([m0, tip, m1], tone(random.choice(('heart', 'ring_dark')), 0.06))):
            nrm = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            if nrm.dot(outward) < 0:
                pts = pts[::-1]
            b.add([g(*p) for p in pts], [tuple(range(len(pts)))], c)


def blend(a, b, t, var=0.03):
    """A colour part way between two palette colours, a touch varied: smooth, not a checkerboard."""
    ca, cb = tone(a, 0), tone(b, 0)
    k = 1 + random.uniform(-var, var)
    return tuple(min(1, (x + (y - x) * t) * k) for x, y in zip(ca[:3], cb[:3])) + (1.0,)


def bark_colour(seed, peel=0.35, mossy=0.0):
    """Bark in soft patches, with weathered grey wood where it's come away, and moss on top,
    each in coherent patches (by noise over the surface), not face by face."""
    def colour(t, a, normal):
        q = Vector((t * 3.0, math.cos(a) * 1.2, math.sin(a) * 1.2 + seed))
        patch = noise.noise(q)
        shade = 0.5 + 0.5 * noise.noise(q * 2.3 + Vector((5, 5, 5)))
        if mossy and normal.y > 0.5 and noise.noise(q * 1.5 + Vector((9, 0, 0))) > -0.05:
            return blend('moss_log_dark', 'moss_log', shade)
        if patch > 0.35 - peel:
            return blend('silver', 'silver_pale', shade)
        return blend('bark_dark', 'bark_grey' if patch > 0 else 'bark', shade)
    return colour


def stump():
    """A cut stump about 0.45 m tall, base at the origin (scaled to its tree in the game)."""
    random.seed(101)
    b = Builder()
    path = [(Vector((0, -0.1, 0)), 0.36), (Vector((0, 0.08, 0)), 0.3), (Vector((0, 0.3, 0)), 0.27), (Vector((0, 0.44, 0)), 0.26)]
    rings = tube(b, path, 12, bark_colour(3, peel=0.05), rough=0.08, seed=3)
    # The cut: a little slanted, as an axe leaves it.
    top = rings[-1]
    centre = path[-1][0] + Vector((0, 0.01, 0))
    end_grain(b, top, centre, Vector((0, 1, 0)))
    for k in range(5):  # root flares
        a = math.tau * k / 5 + random.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), 0, math.sin(a)))
        tube(b, [(d * 0.18 + Vector((0, 0.14, 0)), 0.13), (d * 0.36 + Vector((0, 0.02, 0)), 0.1), (d * 0.5 + Vector((0, -0.06, 0)), 0.06)], 7, bark_colour(k, peel=0.0), rough=0.1)
    return build('stump', b, shared('stump'))


def dead_tree():
    """A standing dead spruce, about 7.6 m: grey weathered wood with a little bark left low
    down, dead branches (some broken short) with forked twigs, and a snapped-off top."""
    random.seed(77)
    b = Builder()
    path = []
    lean = Vector((random.uniform(-0.25, 0.25), 0, random.uniform(-0.25, 0.25)))
    for i in range(20):
        t = i / 19
        y = -0.3 + t * 7.3
        r = 0.2 * (1 - t) ** 0.8 + 0.035
        path.append((Vector((0, y, 0)) + lean * t * t + Vector((math.sin(t * 9) * 0.03, 0, math.cos(t * 7) * 0.03)), r * (1.25 if i == 0 else 1)))
    def trunk_colour(t, a, normal):
        q = Vector((t * 4.0, math.cos(a), math.sin(a)))
        shade = 0.5 + 0.5 * noise.noise(q * 2.0 + Vector((3, 3, 3)))
        if t < 0.3 and noise.noise(q) > -0.1 + t:
            return blend('bark_dark', 'bark_grey', shade)
        return blend('bark_grey', 'silver_pale', 0.35 + 0.65 * shade)
    rings = tube(b, path, 9, trunk_colour, rough=0.07, seed=7)
    end_grain(b, rings[-1], path[-1][0], Vector((0, 1, 0)), jagged=0.25)  # the snapped top
    for k in range(44):
        f = k / 43
        y = 1.1 + f * 5.7 + random.uniform(-0.1, 0.1)
        t = (y + 0.3) / 7.3
        base = Vector((0, y, 0)) + lean * t * t
        a = k * 2.4 + random.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), random.uniform(-0.45, 0.1), math.sin(a))).normalized()  # (dead spruce branches droop)
        length = (1.25 - f * 0.9) * (0.25 if random.random() < 0.45 else random.uniform(0.7, 1.1))  # (many broken short)
        tip = base + d * length
        branch = tube(b, [(base, 0.035 * (1 - f * 0.5)), (base.lerp(tip, 0.5), 0.022), (tip, 0.009)], 4, lambda t_, a_, n_: blend('bark_grey', 'silver', 0.5, 0.06))
        if length > 0.6:
            for s in range(2):
                side = d.cross(Vector((0, 1, 0))).normalized() * (1 if s else -1)
                start = base.lerp(tip, 0.55 + 0.25 * s)
                twig = start + (d * 0.6 + side * 0.5 + Vector((0, random.uniform(-0.1, 0.25), 0))).normalized() * length * 0.35
                tube(b, [(start, 0.012), (twig, 0.005)], 3, lambda t_, a_, n_: blend('silver', 'silver_pale', 0.5, 0.06))
    return build('tree-dead', b, shared('tree'))


def firewood():
    """The wood you've dropped: a little bundle of split logs, about 0.7 m long along z."""
    random.seed(102)
    b = Builder()
    for (x, y, turn) in ((-0.15, 0.09, 0.05), (0.14, 0.09, -0.08), (0.0, 0.25, 0.12), (0.3, 0.07, 0.4)):
        d = Vector((math.sin(turn), 0, math.cos(turn)))
        c = Vector((x, y, 0))
        a, z = c - d * 0.35, c + d * 0.35
        rings = tube(b, [(a, 0.09), (c, 0.095), (z, 0.09)], 8, bark_colour(x * 10, peel=0.3), rough=0.08, seed=x)
        end_grain(b, rings[0], a, -d)
        end_grain(b, rings[-1], z, d)
    return build('logs', b, shared('wood'))


# ---- the crashed bush plane ----
PAL.update(
    paint=0xd9a52b, paint_dull=0xc0922a, stripe=0xa83a2a, glass_dark=0x26323a, glass_sky=0x56687a,
    cowl=0x7d8288, cowl_dark=0x5e6266, torn=0x3a3633, tyre=0x23211f, prop=0x2e2c2a,
)


def loft(b, rings, colour, close_start=True, close_end=True, cap=None):
    """Joins rings (lists of points, the same count) into a skin; colour(centre, normal) per
    face. Caps the ends (cap colour) if asked."""
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(n):
            k1 = (k + 1) % n
            quad = [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]]
            centre = sum(quad, Vector()) / 4
            normal = (quad[2] - quad[0]).cross(quad[3] - quad[1]).normalized()
            b.add([g(*p) for p in quad], [(0, 1, 2, 3)], colour(centre, normal))
    for ring, flip, close in ((rings[0], True, close_start), (rings[-1], False, close_end)):
        if not close:
            continue
        c = sum(ring, Vector()) / n
        for k in range(n):
            tri = [c, ring[k], ring[(k + 1) % n]]
            if flip:
                tri = tri[::-1]
            b.add([g(*p) for p in tri], [(0, 1, 2)], cap or colour(c, Vector((0, 0, 1))))


def section(centre, half_w, half_h, sides=14, power=2.6):
    """A rounded-rectangle cross-section (a superellipse) round `centre`, in the x-y plane."""
    pts = []
    for k in range(sides):
        a = math.tau * k / sides
        c, s = math.cos(a), math.sin(a)
        x = math.copysign(abs(c) ** (2 / power), c) * half_w
        y = math.copysign(abs(s) ** (2 / power), s) * half_h
        pts.append(centre + Vector((x, y, 0)))
    return pts


# (The plane and its broken-off wing: plane.py.)


# ---- shared builders for made things ----
from kit import build_hinged


def rounded_box(b, lo, hi, radius, colour, segments=2):
    """A box from corner lo to hi (game space) with its edges rounded off (bevelled), coloured
    face by face by colour(centre, normal)."""
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1)
    size = Vector(hi) - Vector(lo)
    mid = (Vector(hi) + Vector(lo)) / 2
    for v in tmp.verts:
        v.co = Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z)) + mid
    r = min(radius, min(size) * 0.45)
    bmesh.ops.bevel(tmp, geom=tmp.edges[:] + tmp.verts[:], offset=r, segments=segments, profile=0.5, affect='EDGES')
    tmp.normal_update()
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*v.co) for v in tmp.verts]
    for f in tmp.faces:
        b.add(verts, [tuple(index[v] for v in f.verts)], colour(f.calc_center_median(), f.normal))
    tmp.free()


def rod(b, a, z, r0, r1, colour, sides=6):
    """A round rod from a to z (game space)."""
    a, z = Vector(a), Vector(z)
    u, v = frame((z - a).normalized())
    loft(b, [[a + u * q.x + v * q.y for q in section(Vector(), r0, r0, sides, 2)], [z + u * q.x + v * q.y for q in section(Vector(), r1, r1, sides, 2)]], colour)


PAL.update(
    case=0xb9b4aa, case_dark=0x8f8a80, case_trim=0x55504a, brass_dull=0x9a8456, soil=0x4a3a2a, soil_dark=0x3a2d22,
    soil_root=0x5e4a34, grass_bit=0x5e6b3c, alu=0x9ea3a6, alu_dark=0x6e7376,
)


def suitcase():
    """A battered leather suitcase lying flat (the game tints it): the base, and its lid
    ('lid', hinged along the back top edge) closed on top."""
    random.seed(401)
    def leather(c, n):
        if abs(c.x) > 0.3 and abs(c.z) > 0.19:
            return tone('case_trim', 0.05)  # (corner caps)
        return tone(random.choice(('case', 'case', 'case_dark')), 0.03)
    base = Builder()
    rounded_box(base, (-0.36, 0.0, -0.25), (0.36, 0.12, 0.25), 0.035, leather)
    rounded_box(base, (-0.365, 0.105, -0.255), (0.365, 0.122, 0.255), 0.006, lambda c, n: tone('case_trim', 0.04))  # the seam
    for x in (-0.2, 0.2):  # latches
        rounded_box(base, (x - 0.03, 0.08, 0.247), (x + 0.03, 0.135, 0.262), 0.006, lambda c, n: tone('brass_dull', 0.05))
    # The handle, on the front.
    rod(base, (-0.1, 0.06, 0.26), (-0.08, 0.06, 0.31), 0.012, 0.012, lambda c, n: tone('case_trim', 0.04))
    rod(base, (0.1, 0.06, 0.26), (0.08, 0.06, 0.31), 0.012, 0.012, lambda c, n: tone('case_trim', 0.04))
    rod(base, (-0.08, 0.06, 0.31), (0.08, 0.06, 0.31), 0.014, 0.014, lambda c, n: tone('case_trim', 0.04))
    lid = Builder()
    rounded_box(lid, (-0.36, 0.12, -0.25), (0.36, 0.235, 0.25), 0.035, leather)
    rounded_box(lid, (-0.05, 0.12, -0.252), (0.05, 0.24, 0.252), 0.008, lambda c, n: tone('case_dark', 0.05))
    return [build('suitcase', base, shared('suitcase', 0.7)), build_hinged('lid', lid, shared('suitcase', 0.7), (0, 0.12, -0.24))]


# ---- containers you search ----
PAL.update(
    board=0x6e533a, board_dark=0x5c4430, board_grey=0x6a6052, iron=0x34312e, iron_rust=0x5a3a28,
    olive=0x4f5b3a, olive_dark=0x3c4630, steel_green=0x5a6a5a, steel_dark=0x444f45, canvas_pack=0x6b6a45, canvas_dark=0x51503a,
    leather=0x5a4130, stencil=0xc9c2a8,
)
boards = lambda: tone(random.choice(('board', 'board', 'board', 'board_dark', 'board_dark', 'board_grey')), 0.05)


def planked(b, lo, hi, axis, count, gap=0.008, radius=0.012, colour=None):
    """A slab made of `count` planks side by side along `axis` (0 x, 1 y, 2 z), a hair apart."""
    lo, hi = Vector(lo), Vector(hi)
    step = (hi[axis] - lo[axis]) / count
    for i in range(count):
        a, z = lo.copy(), hi.copy()
        a[axis] = lo[axis] + i * step + gap / 2
        z[axis] = lo[axis] + (i + 1) * step - gap / 2
        c = colour() if colour else boards()
        rounded_box(b, a, z, radius, lambda c_, n_, c=c: tuple(min(1, x * random.uniform(0.95, 1.05)) for x in c[:3]) + (1.0,))


def barrel():
    """An old wooden barrel: bowed staves and two iron hoops, about 0.85 m tall."""
    random.seed(501)
    b = Builder()
    staves = 16
    rings = []
    for i in range(7):
        t = i / 6
        r = 0.26 + 0.05 * math.sin(t * math.pi)
        rings.append([Vector((math.cos(math.tau * k / staves) * r, t * 0.85, math.sin(math.tau * k / staves) * r)) for k in range(staves)])
    shades = [boards() for _ in range(staves)]
    def stave(c, n):
        k = int((math.atan2(c.z, c.x) % math.tau) / math.tau * staves) % staves
        if abs(c.y - 0.2) < 0.05 or abs(c.y - 0.68) < 0.05:
            return tone('iron', 0.06)
        return shades[k]
    loft(b, rings, stave, cap=tone('board_dark', 0.05))
    return build('barrel', b, shared('wood'))


def chest():
    """A plank chest bound with iron, its lid ('chest-lid') hinged along the back top edge."""
    random.seed(502)
    base, lid = Builder(), Builder()
    planked(base, (-0.44, 0.0, -0.26), (0.44, 0.3, -0.22), 1, 3)
    planked(base, (-0.44, 0.0, 0.22), (0.44, 0.3, 0.26), 1, 3)
    planked(base, (-0.46, 0.0, -0.26), (-0.42, 0.3, 0.26), 1, 3)
    planked(base, (0.42, 0.0, -0.26), (0.46, 0.3, 0.26), 1, 3)
    planked(base, (-0.43, 0.0, -0.23), (0.43, 0.04, 0.23), 0, 4)
    for x in (-0.36, 0.36):  # iron straps
        rounded_box(base, (x - 0.03, -0.005, -0.27), (x + 0.03, 0.31, 0.27), 0.006, lambda c, n: tone(random.choice(('iron', 'iron_rust')), 0.05))
    rounded_box(base, (-0.05, 0.2, 0.26), (0.05, 0.3, 0.28), 0.008, lambda c, n: tone('iron', 0.05))  # the hasp
    planked(lid, (-0.46, 0.3, -0.275), (0.46, 0.45, 0.275), 2, 5)
    for x in (-0.36, 0.36):
        rounded_box(lid, (x - 0.03, 0.29, -0.28), (x + 0.03, 0.455, 0.28), 0.006, lambda c, n: tone(random.choice(('iron', 'iron_rust')), 0.05))
    return [build('chest', base, shared('wood')), build_hinged('chest-lid', lid, shared('wood'), (0, 0.45, -0.275))]


def supply_crate():
    """A slatted wooden supply crate with a stencil, its lid ('supply-crate-lid') hinged at the back."""
    random.seed(503)
    base, lid = Builder(), Builder()
    for z in (-0.3, 0.27):
        planked(base, (-0.49, 0.0, z), (0.49, 0.48, z + 0.03), 1, 4)
    for x in (-0.49, 0.46):
        planked(base, (x, 0.0, -0.3), (x + 0.03, 0.48, 0.3), 1, 4)
    for x in (-0.47, 0.44):  # corner battens
        for z in (-0.32, 0.27):
            rounded_box(base, (x, 0, z), (x + 0.05, 0.48, z + 0.05), 0.008, lambda c, n: tone('board_dark', 0.05))
    rounded_box(base, (-0.2, 0.18, 0.302), (0.2, 0.3, 0.304), 0.002, lambda c, n: tone('stencil', 0.05))  # the stencil
    planked(lid, (-0.5, 0.48, -0.31), (0.5, 0.555, 0.31), 0, 6)
    return [build('supply-crate', base, shared('wood')), build_hinged('supply-crate-lid', lid, shared('wood'), (0, 0.55, -0.3))]


def ammo_box():
    """An olive steel ammo can with a latch and handle, its lid ('ammo-box-lid') hinged at the back."""
    random.seed(504)
    base, lid = Builder(), Builder()
    paint = lambda c, n: tone(random.choice(('olive', 'olive', 'olive_dark')), 0.04)
    rounded_box(base, (-0.25, -0.02, -0.14), (0.25, 0.21, 0.14), 0.02, paint)
    rounded_box(base, (-0.252, 0.12, -0.142), (0.252, 0.135, 0.142), 0.004, lambda c, n: tone('olive_dark', 0.04))  # a rolled rib
    rounded_box(base, (-0.18, 0.06, 0.14), (0.18, 0.1, 0.15), 0.004, lambda c, n: tone('stencil', 0.05))  # stencilled lettering
    rounded_box(lid, (-0.26, 0.205, -0.15), (0.26, 0.28, 0.15), 0.02, paint)
    rod(lid, (-0.1, 0.29, 0.0), (0.1, 0.29, 0.0), 0.012, 0.012, lambda c, n: tone('iron', 0.05))  # handle
    rounded_box(lid, (0.24, 0.17, -0.04), (0.27, 0.27, 0.04), 0.006, lambda c, n: tone('iron', 0.05))  # latch
    return [build('ammo-box', base, shared('metal', 0.6)), build_hinged('ammo-box-lid', lid, shared('metal', 0.6), (0, 0.28, -0.15))]


def locker():
    """A tall green steel locker with vents, its door ('locker-door') hinged on the left front."""
    random.seed(505)
    body, door = Builder(), Builder()
    paint = lambda c, n: tone(random.choice(('steel_green', 'steel_green', 'steel_dark')), 0.04)
    rounded_box(body, (-0.35, 0.0, -0.25), (0.35, 1.8, 0.23), 0.015, paint)
    rounded_box(body, (-0.33, 0.0, -0.23), (0.33, 0.06, 0.24), 0.01, lambda c, n: tone('steel_dark', 0.04))  # plinth
    rounded_box(door, (-0.345, 0.07, 0.235), (0.345, 1.78, 0.26), 0.01, paint)
    for i in range(4):  # vent slots
        y = 1.5 + i * 0.05
        rounded_box(door, (-0.15, y, 0.258), (0.15, y + 0.02, 0.265), 0.004, lambda c, n: tone('iron', 0.05))
    rounded_box(door, (0.26, 0.85, 0.258), (0.3, 1.0, 0.28), 0.008, lambda c, n: tone('iron', 0.05))  # handle
    return [build('locker', body, shared('metal', 0.6)), build_hinged('locker-door', door, shared('metal', 0.6), (-0.35, 0, 0.26))]


def cupboard():
    """A rough plank cupboard, its two doors ('cupboard-door-left'/'-right') hinged at the sides."""
    random.seed(506)
    body, left, right = Builder(), Builder(), Builder()
    planked(body, (-0.44, 0.0, -0.25), (0.44, 1.78, -0.22), 0, 5)
    for x in (-0.44, 0.41):
        planked(body, (x, 0.0, -0.25), (x + 0.03, 1.78, 0.22), 2, 3)
    for y in (0.0, 0.6, 1.2, 1.75):  # shelves and top
        rounded_box(body, (-0.42, y, -0.22), (0.42, y + 0.03, 0.22), 0.006, lambda c, n: tone('board_dark', 0.05))
    for part, (x0, x1), knob in ((left, (-0.4, -0.005), -0.06), (right, (0.005, 0.4), 0.06)):
        planked(part, (x0, 0.04, 0.215), (x1, 1.74, 0.245), 0, 3)
        rounded_box(part, (x0 + 0.02, 1.4, 0.245), (x1 - 0.02, 1.45, 0.255), 0.005, lambda c, n: tone('board_dark', 0.05))  # battens
        rounded_box(part, (x0 + 0.02, 0.35, 0.245), (x1 - 0.02, 0.4, 0.255), 0.005, lambda c, n: tone('board_dark', 0.05))
        rounded_box(part, (knob - 0.015, 0.85, 0.245), (knob + 0.015, 0.92, 0.27), 0.006, lambda c, n: tone('iron', 0.05))
    return [build('cupboard', body, shared('wood')),
            build_hinged('cupboard-door-left', left, shared('wood'), (-0.4, 0, 0.23)),
            build_hinged('cupboard-door-right', right, shared('wood'), (0.4, 0, 0.23))]


def weathered_pack():
    """An old canvas backpack slumped on the ground, its top flap ('weathered-pack-flap') hinged at the back."""
    random.seed(507)
    body, flap = Builder(), Builder()
    canvas = lambda c, n: tone(random.choice(('canvas_pack', 'canvas_pack', 'canvas_dark')), 0.04)
    rounded_box(body, (-0.25, 0.0, -0.16), (0.25, 0.46, 0.16), 0.08, canvas, segments=3)
    rounded_box(body, (-0.18, 0.06, 0.15), (0.18, 0.28, 0.25), 0.05, canvas, segments=2)  # front pocket
    for x in (-0.3, 0.3):  # side pockets
        rounded_box(body, (x - 0.05, 0.05, -0.09), (x + 0.05, 0.25, 0.09), 0.035, canvas)
    for x in (-0.12, 0.12):  # straps
        rounded_box(body, (x - 0.025, 0.1, 0.24), (x + 0.025, 0.44, 0.255), 0.005, lambda c, n: tone('leather', 0.05))
    rounded_box(flap, (-0.24, 0.43, -0.17), (0.24, 0.5, 0.2), 0.03, canvas)
    rounded_box(flap, (-0.24, 0.3, 0.17), (0.24, 0.5, 0.21), 0.02, canvas)
    return [build('weathered-pack', body, shared('cloth')), build_hinged('weathered-pack-flap', flap, shared('cloth'), (0, 0.45, -0.17))]


# ---- camp and nature ----
PAL.update(
    char=0x2a2623, char_light=0x3d3833, ash=0x6b6863, ember=0xa0482a, ember_hot=0xc8682e,
    wool=0x8c3a2a, wool_dark=0x6e2e24, wool_stripe=0xc2b48a, rag=0x8a7a5a, rag_dark=0x5e5240, cord=0x9a8a6a,
    leaf=0x3f5230, leaf_dark=0x2f3f25, leaf_light=0x56693c, berry=0x3c3f6e, berry_dark=0x2a2c50, twig=0x4a3a2c,
    frond=0xd8d8d0, frond_dark=0xb8b8b0,
)


def log_into(b, a, z, r, seed, charred=0.0):
    """A round log from a to z with bark, ringed ends, and (charred) its ends burnt black."""
    a, z = Vector(a), Vector(z)
    path = [(a.lerp(z, t), r * random.uniform(0.95, 1.05)) for t in (0, 0.33, 0.66, 1)]
    colour = bark_colour(seed, peel=0.15)
    def burnt(t, ang, n):
        if charred and (t < charred or t > 1 - charred):
            return tone(random.choice(('char', 'char', 'char_light')), 0.06)
        return colour(t, ang, n)
    rings = tube(b, path, 9, burnt, rough=0.07, seed=seed)
    end_grain(b, rings[0], a, (a - z).normalized())
    end_grain(b, rings[-1], z, (z - a).normalized())


def campfire():
    """A fire ring of stones round a teepee of logs, charred where they burn, on a bed of ash
    and embers (the flames are a separate model)."""
    random.seed(601)
    b = Builder()
    for k in range(13):
        a = math.tau * k / 13 + random.uniform(-0.06, 0.06)
        r = 0.4 + random.uniform(-0.02, 0.03)
        size = (random.uniform(0.09, 0.12), random.uniform(0.08, 0.12), random.uniform(0.07, 0.09))
        stone_into(b, size, 610 + k, cuts=4, sink=0.03, subdivisions=2, at=(math.cos(a) * r, 0, math.sin(a) * r), turn=-a, mossy=False, sooty=0.5)
    # Ash and embers inside the ring.
    bed = [Vector((math.cos(math.tau * k / 14) * 0.33, 0.015, math.sin(math.tau * k / 14) * 0.33)) for k in range(14)]
    centre = Vector((0, 0.04, 0))
    for k in range(14):
        tri = [centre, bed[(k + 1) % 14], bed[k]]
        c = tone(random.choice(('ember', 'ember_hot', 'ash', 'char')), 0.08) if random.random() < 0.5 else tone(random.choice(('ash', 'char', 'char_light')), 0.06)
        b.add([g(*p) for p in tri], [(0, 1, 2)], c)
    # The teepee: logs leaning in, their lower ends burnt.
    for k in range(5):
        a = math.tau * k / 5 + 0.3
        foot = Vector((math.cos(a) * 0.3, 0.03, math.sin(a) * 0.3))
        top = Vector((math.cos(a) * 0.04, 0.5, math.sin(a) * 0.04))
        log_into(b, foot, top, 0.045, 620 + k, charred=0.45)
    return build('campfire', b, shared('campfire'))


def log_pile():
    """Split logs stacked 4-3-2 between two stakes, 1.2 m long along z."""
    random.seed(602)
    b = Builder()
    r = 0.11
    for row, count in enumerate((4, 3, 2)):
        for i in range(count):
            x = (i - (count - 1) / 2) * r * 2.05
            y = r + row * r * 1.75
            log_into(b, (x, y, -0.6), (x + random.uniform(-0.02, 0.02), y, 0.6 + random.uniform(-0.04, 0.04)), r * random.uniform(0.92, 1.05), 630 + row * 4 + i)
    for x in (-0.5, 0.5):  # stakes
        rod(b, (x, -0.1, 0.0), (x * 1.04, 0.5, 0.0), 0.03, 0.022, lambda c, n: tone(random.choice(('bark', 'bark_grey')), 0.06))
    return build('log-pile', b, shared('log-pile'))


def fire_ring():
    """An old fire ring in the cave: blackened stones round cold ash."""
    random.seed(603)
    b = Builder()
    for k in range(11):
        a = math.tau * k / 11 + random.uniform(-0.08, 0.08)
        size = (random.uniform(0.12, 0.16), random.uniform(0.09, 0.14), random.uniform(0.09, 0.12))
        stone_into(b, size, 640 + k, cuts=4, sink=0.03, subdivisions=2, at=(math.cos(a) * 0.47, 0, math.sin(a) * 0.47), turn=-a, mossy=False, sooty=0.6)
    bed = [Vector((math.cos(math.tau * k / 12) * 0.38, 0.01, math.sin(math.tau * k / 12) * 0.38)) for k in range(12)]
    for k in range(12):
        b.add([g(*p) for p in (Vector((0, 0.03, 0)), bed[(k + 1) % 12], bed[k])], [(0, 1, 2)], tone(random.choice(('ash', 'char', 'char_light')), 0.06))
    return build('fire-ring', b, shared('rock'))


def torch():
    """A torch: a stick with a rag bound round its head, charred at the top."""
    random.seed(604)
    b = Builder()
    tube(b, [(Vector((0, -0.15, 0)), 0.018), (Vector((0, 0.2, 0)), 0.021), (Vector((0, 0.4, 0)), 0.024)], 7, bark_colour(4, peel=0.4), rough=0.05)
    for i in range(4):  # the rag, wound in bands
        y0 = 0.33 + i * 0.045
        tube(b, [(Vector((0, y0, 0)), 0.04 + 0.006 * (i % 2)), (Vector((0, y0 + 0.05, 0)), 0.042 - 0.004 * (i % 2))], 8,
             lambda t, a, n, i=i: tone('char' if i == 3 else random.choice(('rag', 'rag_dark')), 0.06))
    return build('torch', b, shared('wood'))


def bedroll():
    """A rolled wool blanket tied with two straps, 1 m long along x."""
    random.seed(605)
    b = Builder()
    def wool(t, a, n):
        if 0.42 < t < 0.48 or 0.55 < t < 0.6:
            return tone('wool_stripe', 0.04)
        return tone(random.choice(('wool', 'wool', 'wool_dark')), 0.04)
    path = [(Vector((x, 0.11, 0)), 0.105 * (1 - 0.06 * abs(x) * 2)) for x in (-0.5, -0.3, -0.1, 0.1, 0.3, 0.5)]
    rings = tube(b, path, 14, wool, rough=0.04)
    for ring, c, out in ((rings[0], path[0][0], Vector((-1, 0, 0))), (rings[-1], path[-1][0], Vector((1, 0, 0)))):
        n = len(ring)
        for k in range(n):  # the end, showing its spiral of layers
            tri = [c, ring[k], ring[(k + 1) % n]]
            if (tri[1] - tri[0]).cross(tri[2] - tri[0]).dot(out) < 0:
                tri = tri[::-1]
            b.add([g(*p) for p in tri], [(0, 1, 2)], tone('wool_dark' if k % 3 else 'wool_stripe', 0.05))
    for x in (-0.3, 0.3):
        tube(b, [(Vector((x - 0.02, 0.11, 0)), 0.112), (Vector((x + 0.02, 0.11, 0)), 0.112)], 14, lambda t, a, n: tone('leather', 0.05))
    return build('bedroll', b, shared('cloth'))


def trap():
    """A spring-pole snare: a stake, a sapling bent over and tied down, the cord, and a noose
    lying open in front (-z), about 0.7 m across."""
    random.seed(606)
    b = Builder()
    rod(b, (0.2, -0.1, 0.35), (0.2, 0.3, 0.35), 0.022, 0.018, lambda c, n: tone(random.choice(('bark', 'bark_grey')), 0.06))
    # The bent sapling: a curve from its root up and over to where it's tied.
    pts = [Vector((-0.4, 0, 0.4)), Vector((-0.35, 0.35, 0.35)), Vector((-0.15, 0.62, 0.28)), Vector((0.08, 0.6, 0.2)), Vector((0.2, 0.45, 0.12))]
    tube(b, [(p, 0.025 - i * 0.004) for i, p in enumerate(pts)], 6, bark_colour(5, peel=0.0), rough=0.04)
    for p in pts[1:4]:  # a few needle tufts still on it
        b.stone((p.x, p.y + 0.02, p.z), (0.06, 0.03, 0.05), lambda: tone(random.choice(('leaf', 'leaf_dark')), 0.06), points=8)
    rod(b, pts[-1], (0.12, 0.08, -0.05), 0.004, 0.004, lambda c, n: tone('cord', 0.05), sides=4)  # the cord down to the noose
    loop = [Vector((0.12 + math.cos(math.tau * k / 10) * 0.12, 0.03, -0.12 + math.sin(math.tau * k / 10) * 0.12)) for k in range(10)]
    for k in range(10):
        rod(b, loop[k], loop[(k + 1) % 10], 0.004, 0.004, lambda c, n: tone('cord', 0.05), sides=4)
    return build('trap', b, shared('trap'))


# (The berry bush is made by berry_bush.py.)


def fern():
    """A fern: arching fronds, each a stem with leaflets getting shorter toward its tip (pale:
    the game tints it with the ground)."""
    random.seed(608)
    b = Builder()
    for k in range(8):
        a = math.tau * k / 8 + random.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((-d.z, 0, d.x))
        length = random.uniform(0.55, 0.75)
        rise = random.uniform(0.35, 0.5)
        spine = []
        for i in range(9):
            t = i / 8
            spine.append(d * length * t + Vector((0, rise * math.sin(t * math.pi * 0.8) * (1 - 0.3 * t), 0)))
        for i in range(8):
            p, q = spine[i], spine[i + 1]
            w = 0.11 * math.sin((i + 0.5) / 8 * math.pi) + 0.02
            for s in (-1, 1):  # a leaflet each side, swept forward
                tip = p.lerp(q, 0.7) + side * s * w + (q - p) * 0.4 - Vector((0, w * 0.25, 0))
                tri = [p, q, tip]
                for t_ in (tri, tri[::-1]):
                    b.add([g(*v) for v in t_], [(0, 1, 2)], tone(random.choice(('frond', 'frond', 'frond_dark')), 0.03))
    return build('grass-fern', b, shared('grass'))


# ---- small things: bones, cave rock, the throwing stone, the axe ----
PAL.update(
    bone=0xd3c4a0, bone_shade=0xb5a682, bone_dark=0x7a6c52, drip=0x8a8276, drip_dark=0x625b52, drip_wet=0x4e4943,
    hickory=0x9a7a52, hickory_dark=0x7a5c3c, steel=0x6c6e70, steel_edge=0xbfc4c8, steel_dark=0x3c3d3e,
)


def bone_into(b, a, z, r, knobs=True):
    """A long bone from a to z, its ends swollen into knuckles."""
    a, z = Vector(a), Vector(z)
    tube(b, [(a, r * 1.3), (a.lerp(z, 0.15), r), (a.lerp(z, 0.85), r * 0.9), (z, r * 1.25)], 6, lambda t, ang, n: tone(random.choice(('bone', 'bone', 'bone_shade')), 0.04), rough=0.06)
    if knobs:
        for p in (a, z):
            b.stone(tuple(p), (r * 1.6, r * 1.4, r * 1.6), lambda: tone('bone_shade', 0.05), points=10)


def bones():
    """Old remains in the cave: a skull with dark sockets, curved ribs, leg bones and a few vertebrae."""
    random.seed(701)
    b = Builder()
    # The skull: a long, rounded box of bone, with dark eye sockets and nose.
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=1)
    for v in tmp.verts:
        d = v.co.normalized()
        stretch = 1.0 + 0.6 * max(0, d.x)  # (the muzzle, toward +x)
        v.co = Vector((d.x * 0.11 * stretch + 0.3, d.y * 0.06 + 0.07, d.z * 0.065 * (1 - 0.35 * max(0, d.x))))
    tmp.normal_update()
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*v.co) for v in tmp.verts]
    for f in tmp.faces:
        c, n = f.calc_center_median(), f.normal
        dark = (abs(n.z) > 0.6 and 0.33 < c.x < 0.37 and c.y > 0.08) or (n.x > 0.8)
        b.add(verts, [tuple(index[v] for v in f.verts)], tone('bone_dark', 0.05) if dark else tone(random.choice(('bone', 'bone_shade')), 0.04))
    tmp.free()
    # Ribs: arcs off a broken spine.
    for k in range(5):
        x = -0.1 + k * 0.06
        pts = [Vector((x, 0.02 + 0.13 * math.sin(t * math.pi * 0.9), -0.02 - 0.18 * t)) for t in (0, 0.33, 0.66, 1)]
        tube(b, [(p, 0.012 * (1 - 0.3 * i / 3)) for i, p in enumerate(pts)], 5, lambda t, a, n: tone(random.choice(('bone', 'bone_shade')), 0.04))
    for k in range(6):  # vertebrae along the spine
        b.stone((-0.16 + k * 0.06, 0.03, 0.0), (0.025, 0.025, 0.03), lambda: tone('bone_shade', 0.05), points=9)
    bone_into(b, (-0.34, 0.025, 0.08), (0.02, 0.025, 0.15), 0.017)
    bone_into(b, (-0.2, 0.02, -0.2), (0.12, 0.03, -0.14), 0.015)
    return build('bones', b, shared('rock'))


def axe_into(b, place):
    """A felling axe: a curved hickory handle along +y (its end at -0.16) and a forged head at
    the top, its blade toward +z. `place` maps the axe's own points to the model's."""
    # The handle: oval in section, with a slight S along its length, swelling to a knob at the
    # end and slimming under the head.
    handle = [  # (y, z offset, half-width, half-depth)
        (-0.16, 0.0, 0.019, 0.026), (-0.13, 0.002, 0.017, 0.024), (-0.06, 0.005, 0.015, 0.021), (0.05, 0.006, 0.0145, 0.02),
        (0.2, 0.003, 0.014, 0.019), (0.35, 0.0, 0.0135, 0.018), (0.48, 0.001, 0.013, 0.0175), (0.56, 0.002, 0.0135, 0.018), (0.645, 0.0, 0.0125, 0.017),
    ]
    rings = []
    for y, dz, hw, hd in handle:
        rings.append([place(Vector((q.x, y, dz + q.y))) for q in section(Vector(), hw, hd, 12, 2.2)])
    grain = lambda c, n: blend('hickory_dark', 'hickory', 0.55 + 0.45 * math.sin(c.y * 40 + c.x * 90), 0.03)
    loft(b, rings, grain)
    # The head: a rounded eye round the handle, the poll behind it, and the cheeks tapering down
    # to a thin, flared bit with a curved edge (the bottom corner, the beard, hanging lower).
    head = [  # (z, half-height, half-thickness, centre's height above/below the eye)
        (-0.068, 0.03, 0.022, 0.0), (-0.055, 0.035, 0.027, 0.0), (-0.03, 0.038, 0.03, 0.0), (0.0, 0.04, 0.03, 0.0),
        (0.03, 0.039, 0.026, -0.002), (0.065, 0.042, 0.018, -0.006), (0.1, 0.05, 0.011, -0.012), (0.135, 0.061, 0.007, -0.017),
        (0.165, 0.071, 0.004, -0.021), (0.185, 0.076, 0.0025, -0.022), (0.196, 0.072, 0.0012, -0.021),
    ]
    rings = []
    for z, h, t, dy in head:
        rings.append([place(Vector((q.x, 0.6 + dy + q.y, z))) for q in section(Vector(), t, h, 12, 3.2)])
    def steel(c, n):
        if place_back(c, n):
            return tone('steel_edge', 0.03)  # (the ground edge, bright)
        return blend('steel_dark', 'steel', 0.6 + 0.4 * max(0.0, n.y), 0.04)
    loft(b, rings, steel)


place_back = lambda c, n: False


def axe():
    """The axe as held (see handView.js): handle along +y, blade toward +z."""
    random.seed(704)
    b = Builder()
    global place_back
    place_back = lambda c, n: c.z > 0.15
    axe_into(b, lambda p: p)
    return build('axe', b, shared('tool', 0.6))


def axe_ground():
    """The axe lying in the grass where it fell: handle angled, blade flat, base at the origin."""
    random.seed(705)
    b = Builder()
    turn = 0.6
    def lay(p):
        # The axe's own y (along the handle) runs along the ground, its x points up.
        d = Vector((math.sin(turn), 0, math.cos(turn)))
        side = Vector((math.cos(turn), 0, -math.sin(turn)))
        return d * (p.y - 0.25) + Vector((0, 0.045 + p.x, 0)) + side * p.z
    global place_back
    place_back = lambda c, n: False
    axe_into(b, lay)
    return build('axe-ground', b, shared('metal', 0.6))


# ---- the hide shelter you build ----
PAL.update(hide=0x8a6a4a, hide_pale=0xa8865e, hide_dark=0x6a4e36, sinew=0x5a4636, bough=0x34493b, bough_dark=0x26362c)


def hide_sheet(b, corners, nu, nv, sag, colour):
    """A hide stretched over a frame: a grid between four corners (game space, in order round
    it), sagging `sag` in the middle between the poles, its lower edge ragged, seen from both
    sides."""
    p00, p10, p11, p01 = (Vector(c) for c in corners)
    grid = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            p = p00.lerp(p10, u).lerp(p01.lerp(p11, u), v)
            p -= Vector((0, sag * math.sin(u * math.pi) * math.sin(v * math.pi), 0))  # (it hangs between the poles)
            if j == 0:
                p += Vector((0, random.uniform(-0.04, 0.06), 0))  # (the ragged bottom)
            row.append(p)
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            c = colour(i, j)
            b.add([g(*p) for p in quad], [(0, 1, 2, 3)], c)
            b.add([g(*p) for p in quad[::-1]], [(0, 1, 2, 3)], tone('hide_dark', 0.05))


def shelter():
    """An A-frame shelter of poles and stitched hides, 3.2 m wide, 2.3 m tall, 2.8 m deep,
    open at the front (+z), a bed of spruce boughs inside; base centre at the origin."""
    random.seed(801)
    b = Builder()
    pole = bark_colour(8, peel=0.3)
    ridge_y, half_w, half_d = 2.3, 1.6, 1.4
    # The frame: an A of two poles at each end, crossing over the ridge pole.
    for z in (-half_d, half_d):
        for s in (-1, 1):
            tube(b, [(Vector((s * half_w, -0.1, z)), 0.06), (Vector((-s * 0.12, ridge_y + 0.25, z)), 0.045)], 8, pole, rough=0.06)
        for k in range(3):  # lashing where they cross
            tube(b, [(Vector((-0.05, ridge_y - 0.05 + k * 0.04, z - 0.07)), 0.07), (Vector((0.05, ridge_y - 0.03 + k * 0.04, z + 0.07)), 0.07)], 6, lambda t, a, n: tone('sinew', 0.05))
    tube(b, [(Vector((0, ridge_y, -half_d - 0.25)), 0.055), (Vector((0, ridge_y + 0.02, 0)), 0.05), (Vector((0, ridge_y, half_d + 0.3)), 0.045)], 8, pole, rough=0.06)
    # Hides over both slopes: a patchwork of skins in slightly different tones, stitched.
    patches = [[random.choice(('hide', 'hide', 'hide_pale', 'hide_dark')) for _ in range(6)] for _ in range(2)]
    for side, s in enumerate((-1, 1)):
        def skin(i, j, side=side):
            if i % 2 == 1 and random.random() < 0.6:
                return tone('sinew', 0.05)  # (a seam)
            return tone(patches[side][min(5, i // 2)], 0.04)
        hide_sheet(b, [(s * (half_w - 0.05), 0.0, -half_d + 0.05), (s * (half_w - 0.05), 0.0, half_d - 0.1), (s * 0.04, ridge_y + 0.04, half_d - 0.1), (s * 0.04, ridge_y + 0.04, -half_d + 0.05)], 10, 6, 0.12, skin)
    # The back, closed with a triangle of hide.
    back = [Vector((-half_w + 0.1, 0, -half_d + 0.02)), Vector((half_w - 0.1, 0, -half_d + 0.02)), Vector((0, ridge_y, -half_d + 0.02))]
    b.add([g(*p) for p in back], [(0, 1, 2)], tone('hide_dark', 0.04))
    b.add([g(*p) for p in back[::-1]], [(0, 1, 2)], tone('hide', 0.04))
    # A bed of spruce boughs on the floor inside.
    for k in range(14):
        c = (random.uniform(-0.9, 0.9), 0.06, random.uniform(-1.1, 0.8))
        b.stone(c, (0.3, 0.06, 0.18), lambda: tone(random.choice(('bough', 'bough', 'bough_dark')), 0.06), points=10)
    # Guy lines and pegs at the front corners.
    for s in (-1, 1):
        peg = Vector((s * (half_w + 0.35), 0.0, half_d + 0.4))
        rod(b, peg - Vector((0, 0.15, 0)), peg + Vector((0, 0.12, 0)), 0.02, 0.015, lambda c, n: tone('bark_grey', 0.05))
        rod(b, peg + Vector((0, 0.08, 0)), Vector((s * 0.9, 1.1, half_d - 0.1)), 0.006, 0.006, lambda c, n: tone('sinew', 0.05), sides=4)
    return build('shelter', b, shared('shelter'))


def remake():
    made = []
    for name, (size, seed, cuts, detail) in ROCKS.items():
        made.append((name, [boulder(name, size, seed, cuts, subdivisions=detail)]))
    made += [('stump', [stump()]), ('tree-dead', [dead_tree()]), ('logs', [firewood()])]
    made += [('suitcase', suitcase()), ]
    made += [('barrel', [barrel()]), ('chest', chest()), ('supply-crate', supply_crate()), ('ammo-box', ammo_box()), ('locker', locker()), ('cupboard', cupboard()), ('weathered-pack', weathered_pack())]
    made += [('campfire', [campfire()]), ('log-pile', [log_pile()]), ('fire-ring', [fire_ring()]), ('torch', [torch()]), ('bedroll', [bedroll()]), ('trap', [trap()]), ('grass-fern', [fern()])]
    made += [('bones', [bones()]), ('axe', [axe()]), ('axe-ground', [axe_ground()])]
    made += [('shelter', [shelter()])]
    return made


# (stand.py runs this file for its shapes alone: DEFS_ONLY.)
if not globals().get('DEFS_ONLY'):
    if bpy.app.background:
        reset()
    shelf = None
    if not bpy.app.background:
        shelf = bpy.data.collections.get('Remade') or bpy.data.collections.new('Remade')
        if shelf.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(shelf)
        for o in list(shelf.objects):
            bpy.data.objects.remove(o)
    for i, (name, parts) in enumerate(remake()):
        if shelf:
            # A copy to look at, in a row clear of the spruce and birch.
            for o in parts:
                copy = o.copy()
                copy.data = o.data.copy()
                shelf.objects.link(copy)
                copy.location = (i * 3, 50, 0)
        export(parts, f'{LOOK}{name}.glb')
    print('@@ done')
