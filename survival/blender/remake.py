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
    """One material per name, reused run after run (otherwise an open Blender numbers them)."""
    return bpy.data.materials.get(name) or material(name, rough)


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


def remake():
    made = []
    for name, (size, seed, cuts, detail) in ROCKS.items():
        made.append((name, [boulder(name, size, seed, cuts, subdivisions=detail)]))
    made += [('fallen-log', [fallen_log()]), ('stump', [stump()]), ('tree-dead', [dead_tree()]), ('logs', [firewood()])]
    made += [('plane', [plane()]), ('plane-wing', [plane_wing()])]
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
