# Rebuilds models for the new look (index.html?look=new, see src/look.js) into
# survival/public/models/look/, at the same sizes as the originals (so collisions still fit).
# The game loads these instead of the originals, in the new look only (REMADE in look.js).
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
LOOK = 'look/'
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
        for n, at in planes:
            over = p.dot(n) - at
            if over > 0:
                p -= n * over * 0.9
        p = Vector((p.x * size[0], (p.y * 0.5 + 0.5) * (size[1] + sink) - sink, p.z * size[2]))
        p.y = max(p.y, -sink)
        v.co = p
    tmp.normal_update()
    b = Builder()
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*v.co) for v in tmp.verts]
    for f in tmp.faces:
        c = f.calc_center_median()
        n = f.normal
        up = n.y
        height = (c.y + sink) / (size[1] + sink)
        hollow = noise.noise(c * 2.2 + off)
        if up > 0.62 and noise.noise(c * 1.6 + off * 2) > 0.05:
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
    return build(name, b, shared('rock'))


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


def fallen_log():
    """1 m long along x, 1 m thick, lying on the ground (the game stretches each copy)."""
    random.seed(66)
    b = Builder()
    path = []
    for i in range(11):
        t = i / 10
        x = -0.5 + t
        r = 0.5 * (1.02 - abs(t - 0.5) * 0.1) * random.uniform(0.97, 1.03)
        path.append((Vector((x, 0.5 + math.sin(t * math.pi) * 0.03, math.sin(t * 5) * 0.02)), r))
    rings = tube(b, path, 12, bark_colour(6, peel=0.05, mossy=1.0), rough=0.06, seed=6)
    end_grain(b, rings[0], path[0][0], Vector((-1, 0, 0)), jagged=0.02)
    end_grain(b, rings[-1], path[-1][0], Vector((1, 0, 0)), jagged=0.02)
    for x, a, length in ((-0.18, 0.5, 0.22), (0.24, 2.6, 0.18)):  # branch stubs, short
        base = Vector((x, 0.5 + math.sin(a) * 0.42, math.cos(a) * 0.42))
        tip = Vector((x + 0.04, 0.5 + math.sin(a) * (0.5 + length), math.cos(a) * (0.5 + length)))
        stub = tube(b, [(base, 0.07), (base.lerp(tip, 0.6), 0.055), (tip, 0.04)], 6, bark_colour(9, peel=0.8))
        end_grain(b, stub[-1], tip, (tip - base).normalized(), jagged=0.03)
    for i in range(6):  # moss cushions over the top
        c = (random.uniform(-0.4, 0.4), 0.97, random.uniform(-0.15, 0.15))
        b.stone(c, (0.14, 0.05, 0.12), lambda: tone(random.choice(('moss_log', 'moss_log_dark')), 0.08), points=9)
    return build('fallen-log', b, shared('wood'))


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


def airfoil(x, lead_z, chord, thick, y, droop=0.0):
    """A wing's cross-section at span position x: rounded leading edge at lead_z, thin
    trailing edge, `thick` deep (in the y-z plane)."""
    pts = []
    profile = ((0.0, 0.0), (0.03, 0.55), (0.15, 0.95), (0.4, 1.0), (0.75, 0.6), (1.0, 0.06), (1.0, -0.04), (0.75, -0.3), (0.4, -0.45), (0.15, -0.4), (0.03, -0.3))
    for f, t in profile:
        pts.append(Vector((x, y + t * thick * 0.5 - f * droop, lead_z - f * chord)))
    return pts


def dent(p, amount, seed):
    """Pushes a point in a little by noise: crumpled sheet metal."""
    return p + Vector((noise.noise(p * 2.5 + Vector((seed, 0, 0))), noise.noise(p * 2.5 + Vector((0, seed, 0))), noise.noise(p * 2.5 + Vector((0, 0, seed))))) * amount


def plane():
    """The crashed bush plane: nose toward +z, its cowl dug into the ground, the high wing
    torn off on the right (that piece is plane-wing), base at the origin."""
    random.seed(301)
    b = Builder()
    pitch = math.radians(7)  # nose down

    def place(p):
        # Tip the plane nose-down about its middle, and sink it into the ground.
        y = p.y * math.cos(pitch) - p.z * math.sin(pitch)
        z = p.z * math.cos(pitch) + p.y * math.sin(pitch)
        return Vector((p.x, y - 0.12, z))

    # Fuselage: (z, centre height, half width, half height)
    stations = [(4.05, 1.0, 0.16, 0.16), (3.85, 1.0, 0.5, 0.5), (3.1, 1.02, 0.6, 0.6), (2.35, 1.06, 0.6, 0.66), (1.6, 1.08, 0.62, 0.74),
                (0.6, 1.08, 0.61, 0.74), (-0.3, 1.1, 0.56, 0.68), (-1.4, 1.17, 0.44, 0.55), (-2.6, 1.28, 0.3, 0.4), (-3.7, 1.4, 0.16, 0.24), (-4.4, 1.46, 0.07, 0.12)]
    rings = []
    for z, cy, hw, hh in stations:
        ring = section(Vector((0, cy, z)), hw, hh, 16)
        crumple = 0.07 * max(0, (z - 1.5) / 2.5) + 0.02  # (most at the nose, which hit first)
        rings.append([place(dent(p, crumple, 3)) for p in ring])

    def body_colour(c, n):
        # Work in the plane's own frame (undo the tip) to place windows and trim.
        z = c.z * math.cos(pitch) - (c.y + 0.12) * math.sin(pitch)
        y = (c.y + 0.12) * math.cos(pitch) + c.z * math.sin(pitch)
        if z > 3.0:
            return tone(random.choice(('cowl', 'cowl', 'cowl_dark')), 0.05)
        if 0.3 < z < 2.0 and abs(n.x) > 0.55 and 1.25 < y < 1.72:
            return tone(random.choice(('glass_dark', 'glass_dark', 'glass_sky')), 0.05)
        if 2.0 < z < 2.6 and n.y > 0.25 and y > 1.4:
            return tone('glass_dark', 0.05)
        if -1.6 < z < -1.2:
            return tone('stripe', 0.05)
        return tone(random.choice(('paint', 'paint', 'paint_dull')), 0.04)

    loft(b, rings, body_colour)
    # Wing: one piece across the top of the cabin, from the red left tip to a torn stub on the right.
    wing = []
    for x in (-5.5, -5.1, -4.2, -3.2, -2.2, -1.2, -0.4, 0.4, 1.2, 1.8, 2.3):
        dihedral = abs(x) * 0.035
        sec = airfoil(x, 1.75, 1.55, 0.16, 2.12 + dihedral)  # (overhead: you can walk under it)
        if x >= 2.3:  # torn end: ragged
            sec = [p + Vector((random.uniform(-0.25, 0.1), random.uniform(-0.04, 0.04), 0)) for p in sec]
        wing.append([place(dent(p, 0.025, 5)) for p in sec])

    def wing_colour(c, n):
        x = c.x
        if x < -5.0:
            return tone('stripe', 0.05)
        return tone(random.choice(('paint', 'paint', 'paint_dull')), 0.04)

    loft(b, wing, wing_colour, cap=tone('torn', 0.05))
    # Struts: the left one whole, the right one snapped.
    for x0, x1, frac in ((-0.55, -2.7, 1.0), (0.55, 2.2, 0.45)):
        a = place(Vector((x0, 0.55, 1.0)))
        z = place(Vector((x1, 2.05, 1.0)))
        end = a.lerp(z, frac)
        rings_ = []
        for p in (a, end):
            rings_.append(section(Vector((0, 0, 0)), 0.035, 0.035, 6))
        d = (end - a)
        u, v = frame(d.normalized())
        r0 = [a + u * q.x + v * q.y for q in rings_[0]]
        r1 = [end + u * q.x + v * q.y for q in rings_[1]]
        loft(b, [r0, r1], lambda c, n: tone('cowl_dark', 0.05))
    # Tail: horizontal stabiliser and the fin, with a red rudder top.
    for side in (-1, 1):
        sec = [airfoil(side * x, -3.55, 0.85 - x * 0.18, 0.06, 1.45) for x in (0.12, 0.8, 1.45)]
        loft(b, [[place(p) for p in s] for s in sec], lambda c, n: tone('paint', 0.04))
    fin = []
    for y, lead, chord in ((1.5, -3.3, 1.15), (2.2, -3.75, 0.85), (2.9, -4.1, 0.5)):
        fin.append([place(Vector((p.y - 1.45, y, p.z))) for p in airfoil(0, lead, chord, 0.07, 1.45)])
    loft(b, fin, lambda c, n: tone('stripe' if c.y > 2.2 else 'paint', 0.04))
    # Propeller: two blades bent back where they hit.
    hub = place(Vector((0, 1.0, 4.08)))
    for side in (-1, 1):
        root = hub + Vector((side * 0.08, 0, 0))
        mid = hub + Vector((side * 0.55, -0.15 * side, -0.05))
        tip = hub + Vector((side * 0.85, -0.35 * side, -0.45))
        for a_, z_ in ((root, mid), (mid, tip)):
            u, v = frame((z_ - a_).normalized())
            r0 = [a_ + u * q.x + v * q.y for q in section(Vector(), 0.08, 0.02, 6)]
            r1 = [z_ + u * q.x + v * q.y for q in section(Vector(), 0.07, 0.015, 6)]
            loft(b, [r0, r1], lambda c, n: tone('prop', 0.05))
    # One landing gear leg left, bent, with no wheel (the wheel lies back along the trail).
    a = place(Vector((-0.5, 0.45, 1.9)))
    z = place(Vector((-1.0, -0.15, 2.2)))
    u, v = frame((z - a).normalized())
    loft(b, [[a + u * q.x + v * q.y for q in section(Vector(), 0.05, 0.05, 6)], [z + u * q.x + v * q.y for q in section(Vector(), 0.04, 0.04, 6)]], lambda c, n: tone('cowl_dark', 0.05))
    return build('plane', b, shared('plane', 0.6))


def plane_wing():
    """The wing that broke off, lying on the ground: the torn root at -x, the red tip at +x,
    the top about 0.45 m up (the player can hop onto it)."""
    random.seed(302)
    b = Builder()
    tilt = math.radians(-6)
    secs = []
    for x in (-3.0, -2.4, -1.4, -0.4, 0.6, 1.6, 2.4, 2.75):
        sec = airfoil(x, 0.78, 1.55, 0.16, 0.3 + x * 0.02)
        sec = [Vector((p.x, p.y + (p.z - 0.0) * math.sin(tilt) * 0.3, p.z)) for p in sec]
        if x <= -3.0:
            sec = [p + Vector((random.uniform(-0.1, 0.25), random.uniform(-0.04, 0.04), 0)) for p in sec]
        secs.append([dent(p, 0.03, 9) for p in sec])
    loft(b, secs, lambda c, n: tone('stripe', 0.05) if c.x > 2.35 else tone(random.choice(('paint', 'paint', 'paint_dull')), 0.04), cap=tone('torn', 0.05))
    # The stub of its strut, torn off.
    a = Vector((-1.2, 0.22, 0.0))
    z = Vector((-1.7, -0.05, -0.1))
    u, v = frame((z - a).normalized())
    loft(b, [[a + u * q.x + v * q.y for q in section(Vector(), 0.035, 0.035, 6)], [z + u * q.x + v * q.y for q in section(Vector(), 0.03, 0.03, 6)]], lambda c, n: tone('cowl_dark', 0.05))
    return build('plane-wing', b, shared('plane', 0.6))


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


def debris():
    """Torn sheet metal off the plane: a few bent, ragged panels, about 0.9 x 0.6 m."""
    random.seed(402)
    b = Builder()
    for (x, z, turn, w, d, bend, painted) in ((-0.15, 0.0, 0.3, 0.55, 0.4, 0.12, True), (0.2, 0.08, -0.5, 0.45, 0.3, -0.08, False), (0.05, -0.12, 1.4, 0.35, 0.25, 0.15, True)):
        rings = []
        for i in range(5):
            t = i / 4
            row = []
            for j in range(4):
                s = j / 3
                p = Vector(((t - 0.5) * w, 0.05 + bend * math.sin(t * math.pi) + random.uniform(-0.015, 0.015), (s - 0.5) * d))
                if i in (0, 4) or j in (0, 3):
                    p += Vector((random.uniform(-0.03, 0.03), 0, random.uniform(-0.03, 0.03)))  # (ragged edges)
                c, s_ = math.cos(turn), math.sin(turn)
                row.append(Vector((p.x * c - p.z * s_ + x, p.y, p.x * s_ + p.z * c + z)))
            rings.append(row)
        for i in range(4):
            for j in range(3):
                quad = [rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1]]
                col_ = tone(random.choice(('paint', 'paint_dull')), 0.05) if painted and random.random() < 0.8 else tone(random.choice(('alu', 'alu_dark')), 0.05)
                b.add([g(*p) for p in quad], [(0, 1, 2, 3)], col_)
                b.add([g(*p) for p in quad[::-1]], [(0, 1, 2, 3)], col_)  # (seen from both sides)
    return build('debris', b, shared('metal', 0.6))


def landing_wheel():
    """The wheel off the plane's landing gear, on its side, with its bent leg."""
    random.seed(403)
    b = Builder()
    rings = []
    sides, around = 14, 8
    for i in range(around):
        a = math.tau * i / around
        ring = []
        for k in range(sides):
            t = math.tau * k / sides
            r = 0.26 + 0.08 * math.cos(a)
            ring.append(Vector((math.cos(t) * r, 0.15 + 0.07 * math.sin(a), math.sin(t) * r)))
        rings.append(ring)
    rings.append(rings[0])
    loft(b, rings, lambda c, n: tone('tyre', 0.05), close_start=False, close_end=False)
    hub = [Vector((math.cos(math.tau * k / 10) * 0.17, 0.2, math.sin(math.tau * k / 10) * 0.17)) for k in range(10)]
    loft(b, [hub, [p - Vector((0, 0.1, 0)) for p in hub]], lambda c, n: tone('alu', 0.05))
    rod(b, (0, 0.24, 0), (0.05, 0.36, 0.9), 0.04, 0.035, lambda c, n: tone('cowl_dark', 0.05))
    return build('landing-wheel', b, shared('metal', 0.6))


def clod():
    """A clod of soil thrown out by the plane: lumpy earth with roots and a bit of turf."""
    random.seed(404)
    b = Builder()
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=1)
    for v in tmp.verts:
        d = v.co.normalized()
        r = 1 + 0.3 * noise.noise(d * 2.0 + Vector((4, 4, 4)))
        v.co = Vector((d.x * 0.14 * r, max(-0.02, (d.y * 0.5 + 0.5) * 0.2 * r - 0.03), d.z * 0.13 * r))
    tmp.normal_update()
    index = {v: i for i, v in enumerate(tmp.verts)}
    verts = [g(*v.co) for v in tmp.verts]
    for f in tmp.faces:
        n = f.normal
        c = tone('grass_bit', 0.08) if n.y > 0.7 and random.random() < 0.5 else tone(random.choice(('soil', 'soil', 'soil_dark', 'soil_root')), 0.06)
        b.add(verts, [tuple(index[v] for v in f.verts)], c)
    tmp.free()
    return build('clod', b, shared('clod'))


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


def remake():
    made = []
    for name, (size, seed, cuts, detail) in ROCKS.items():
        made.append((name, [boulder(name, size, seed, cuts, subdivisions=detail)]))
    made += [('fallen-log', [fallen_log()]), ('stump', [stump()]), ('tree-dead', [dead_tree()]), ('logs', [firewood()])]
    made += [('plane', [plane()]), ('plane-wing', [plane_wing()])]
    made += [('suitcase', suitcase()), ('debris', [debris()]), ('landing-wheel', [landing_wheel()]), ('clod', [clod()])]
    made += [('barrel', [barrel()]), ('chest', chest()), ('supply-crate', supply_crate()), ('ammo-box', ammo_box()), ('locker', locker()), ('cupboard', cupboard()), ('weathered-pack', weathered_pack())]
    return made


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
