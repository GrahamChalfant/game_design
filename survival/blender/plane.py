# The crashed bush plane (plane.glb) and the wing that broke off it (plane-wing.glb), smooth
# shaded: a high-wing taildragger in yellow with a red cheatline, nose-down where it dug in.
#   - The cabin has real windows: openings in the skin with rubber frames and glass set in
#     them (material 'glass': the game makes it see-through, look.js), the windscreen split by
#     its centre post, cracked on the left and smashed out on the right.
#   - Through them, the cabin: an inner skin, the floor, the instrument panel with its gauges,
#     the control yokes, two front seats and a rear bench.
#   - The engine cowl is crumpled at the nose, a spinner, the propeller bent back where it hit,
#     an exhaust stack; the wing (torn off on the right), its struts (the right one snapped),
#     the tail; one bent landing-gear leg left.
# The paint is one colour with a gentle variation panel by panel; the game adds the grime
# (wreck.js). Nose toward +z, base at the origin.
# Run in an open Blender (Blender MCP or the Text Editor); it doesn't reset the scene.
import math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Vector, noise
from kit import OUT, PAL, export, g, material

PAL.update(
    paint=0xd9a52b, stripe=0xa83a2a, seam=0x8a6a22, frame=0x2a2a2a, glass=0x2e3c46, glass_sky=0x7e92a2,
    glass_cracked=0x8a9aa4, cowl=0x8a8f94, cowl_dark=0x5e6266, torn=0x3a3633, prop=0x2a2826, prop_tip=0xd8b030,
    cabin=0x47433e, cabin_floor=0x2e2c2a, seat=0x5a4434, seat_dark=0x46352a, panel=0x26282a, gauge=0xb8b4a8,
    exhaust=0x4a3a30, strut=0x6e7276,
)
PITCH = math.radians(7)  # nose down


def tone(name, var=0.0, shade=1.0):
    h = PAL[name]
    k = (1 + random.uniform(-var, var)) * shade
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def place(p):
    """Tips the plane nose-down about its middle and sinks it into the ground."""
    y = p.y * math.cos(PITCH) - p.z * math.sin(PITCH)
    z = p.z * math.cos(PITCH) + p.y * math.sin(PITCH)
    return Vector((p.x, y - 0.12, z))


class Mesh:
    """Faces with a colour per corner, smooth or flat, and a material slot each."""
    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.flat = self.bm.faces.layers.int.new('flat')
        self.verts = {}

    def vert(self, key, p):
        """A shared vertex (so smooth faces shade across), made once per key."""
        if key not in self.verts:
            self.verts[key] = self.bm.verts.new(g(*place(p)))
        return self.verts[key]

    def face(self, verts, colour, smooth=True, slot=0):
        verts = [v if isinstance(v, bmesh.types.BMVert) else self.bm.verts.new(g(*place(v))) for v in verts]
        try:
            f = self.bm.faces.new(verts)
        except ValueError:  # (already there)
            return None
        f.material_index = slot
        f[self.flat] = 0 if smooth else 1
        for loop in f.loops:
            loop[self.col] = colour(loop.vert) if callable(colour) else colour
        return f

    def ring_skin(self, rings, colour, slot=0, smooth=True, key=None, close=True):
        """Skins rings (lists of points), sharing their vertices; colour(i, k, centre, normal)."""
        n = len(rings[0])
        vs = [[self.vert((key, i, k), p) if key else self.bm.verts.new(g(*place(p))) for k, p in enumerate(r)] for i, r in enumerate(rings)]
        for i in range(len(rings) - 1):
            for k in range(n if close else n - 1):
                k1 = (k + 1) % n
                quad = [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]]
                centre = sum(quad, Vector()) / 4
                normal = (quad[2] - quad[0]).cross(quad[3] - quad[1]).normalized()
                self.face([vs[i][k], vs[i][k1], vs[i + 1][k1], vs[i + 1][k]], colour(i, k, centre, normal), smooth, slot)
        return vs

    def cap(self, ring, colour, outward, slot=0, smooth=False):
        c = sum(ring, Vector()) / len(ring)
        for k in range(len(ring)):
            tri = [c, ring[k], ring[(k + 1) % len(ring)]]
            if (tri[1] - tri[0]).cross(tri[2] - tri[0]).dot(outward) < 0:
                tri = tri[::-1]
            self.face(tri, colour, smooth, slot)

    def build(self, name, materials):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f[self.flat] == 0 and False])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        flat = me.attributes['flat'].data
        for p in me.polygons:
            p.use_smooth = not flat[p.index].value
        me.attributes.remove(me.attributes['flat'])
        for m in materials:
            me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def shared(name, rough):
    m = bpy.data.materials.get(name)
    if m and m.get('plane'):
        return m
    if m:
        m.name = f'{name}-other'
    m = material(name, rough)
    m['plane'] = True
    return m


def frame(d):
    u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
    return u, d.cross(u).normalized()


def tube(m, a, z, radii, colour, sides=12, flat=1.0, turn=0.0):
    """A smooth tube from a to z through rings of radii (each r or (w, d)); flat squashes it."""
    a, z = Vector(a), Vector(z)
    u, v = frame((z - a).normalized())
    cu, su = math.cos(turn), math.sin(turn)
    u, v = u * cu + v * su, v * cu - u * su
    rings = []
    for i, r in enumerate(radii):
        w, d = r if isinstance(r, tuple) else (r, r * flat)
        p = a.lerp(z, i / (len(radii) - 1))
        rings.append([p + u * math.cos(math.tau * k / sides) * w + v * math.sin(math.tau * k / sides) * d for k in range(sides)])
    m.ring_skin(rings, lambda i, k, c, n: colour(c, n))
    m.cap(rings[0], colour(rings[0][0], a - z), a - z)
    m.cap(rings[-1], colour(rings[-1][0], z - a), z - a)


# ---- the fuselage ----
# Stations along it: (z, centre height, half width, half height, squareness)
STATIONS = [(4.05, 1.0, 0.36, 0.34, 2.0), (3.85, 1.0, 0.5, 0.48, 2.1), (3.4, 1.0, 0.57, 0.55, 2.3), (2.9, 1.01, 0.6, 0.56, 2.5),
            (2.45, 1.04, 0.61, 0.63, 2.8), (1.85, 1.08, 0.62, 0.74, 3.2), (1.2, 1.08, 0.62, 0.74, 3.2), (0.5, 1.08, 0.61, 0.73, 3.1),
            (-0.3, 1.1, 0.55, 0.67, 2.8), (-1.4, 1.18, 0.43, 0.55, 2.5), (-2.6, 1.28, 0.3, 0.41, 2.3), (-3.7, 1.4, 0.17, 0.26, 2.2),
            (-4.4, 1.46, 0.07, 0.13, 2.0)]


def station_at(z):
    zs = [s[0] for s in STATIONS]  # (front to back)
    z = max(zs[-1], min(zs[0], z))
    i = next(j for j in range(len(zs) - 1) if zs[j + 1] <= z)
    t = (zs[i] - z) / (zs[i] - zs[i + 1])
    at = lambda j: STATIONS[max(0, min(len(STATIONS) - 1, j))]
    def cr(k):
        p0, p1, p2, p3 = at(i - 1)[k], at(i)[k], at(i + 1)[k], at(i + 2)[k]
        return 0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)
    return [cr(k) for k in range(1, 5)]


def hull_point(z, a, inset=0.0):
    """The skin at z, angle a round it (0: straight up, +: toward +x), `inset` in from it."""
    cy, hw, hh, pw = station_at(z)
    s, c = math.sin(a), math.cos(a)
    x = math.copysign(abs(s) ** (2 / pw), s) * hw
    y = math.copysign(abs(c) ** (2 / pw), c) * hh
    p = Vector((x, cy + y, z))
    if inset:
        p -= Vector((x / hw, y / hh, 0)).normalized() * inset
    elif z > 2.6:  # (the cowl, crumpled most at the nose, which hit first)
        amount = 0.07 * (z - 2.6) / 1.45
        p += Vector((noise.noise(p * 2.5 + Vector((3, 0, 0))), noise.noise(p * 2.5 + Vector((0, 3, 0))), noise.noise(p * 2.5 + Vector((0, 0, 3))))) * amount
    return p


def angle_for(z, y_target, side, top=True):
    """The angle on `side` (+1/-1) where the skin at z reaches height y_target."""
    lo, hi = (0.0, math.pi / 2) if top else (math.pi / 2, math.pi)
    for _ in range(40):
        mid = (lo + hi) / 2
        y = hull_point(z, mid).y
        if y > y_target:  # (the skin falls the further round from the top)
            lo = mid
        else:
            hi = mid
    return side * (lo + hi) / 2


def angle_for_x(z, x_target, side):
    lo, hi = 0.0, math.pi / 2
    for _ in range(40):
        mid = (lo + hi) / 2
        if abs(hull_point(z, mid).x) < x_target:
            lo = mid
        else:
            hi = mid
    return side * (lo + hi) / 2


# Where the windows are (in the plane's own frame).
SIDE_Y = (1.33, 1.71)
DOOR_Z, REAR_Z = (1.0, 1.72), (0.28, 0.88)
SCREEN_Z, POST_X, SCREEN_X = (1.9, 2.4), 0.03, 0.5
DOOR_SEAMS = (0.93, 0.95, 1.79, 1.81)
STRIPE_Y = (0.95, 1.03)  # (the cheatline: just below the middle, where the sides are flat)
IMPACT = Vector((-0.22, 1.72, 2.2))  # (where something hit the windscreen)
HOLE = Vector((0.36, 1.68, 2.18))  # (and where it broke through)


def window_of(z, a, p):
    """'side', 'screen' or None for the cell whose middle is at z, angle a, point p."""
    side_on = abs(math.sin(a)) > 0.55 and abs(math.cos(a)) < 0.8
    if side_on and SIDE_Y[0] < p.y < SIDE_Y[1] and (DOOR_Z[0] < z < DOOR_Z[1] or REAR_Z[0] < z < REAR_Z[1]):
        return 'side'
    if SCREEN_Z[0] < z < SCREEN_Z[1] and abs(math.cos(a)) > 0.5 and POST_X < abs(p.x) < SCREEN_X:
        return 'screen'
    return None


def fuselage(m, glass):
    random.seed(301)
    # The rows: every 10 cm or so, and exactly on the windows' and door's edges.
    zs = {round(-4.4 + i * 0.1, 3) for i in range(85)} | {4.05}
    zs |= {DOOR_Z[0], DOOR_Z[1], REAR_Z[0], REAR_Z[1], SCREEN_Z[0], SCREEN_Z[1], *DOOR_SEAMS}
    zs = sorted((z for z in zs if -4.4 <= z <= 4.05), reverse=True)
    # The columns: 48 round, and exactly on the windows' edges.
    angles = {math.tau * k / 48 - math.pi for k in range(48)}
    for side in (1, -1):
        angles |= {angle_for(1.3, SIDE_Y[0], side), angle_for(1.3, SIDE_Y[1], side)}
        angles |= {angle_for(1.3, STRIPE_Y[0], side, top=False), angle_for(1.3, STRIPE_Y[1], side, top=False)}
        angles |= {angle_for_x(2.15, POST_X, side), angle_for_x(2.15, SCREEN_X, side)}
    angles = sorted(angles)
    n = len(angles)
    rows = [[hull_point(z, a) for a in angles] for z in zs]
    kind = {}
    for i in range(len(zs) - 1):
        for k in range(n):
            zc, ac = (zs[i] + zs[i + 1]) / 2, (angles[k] + angles[(k + 1) % n] + (math.tau if k == n - 1 else 0)) / 2
            kind[i, k] = window_of(zc, ac, hull_point(zc, ac))

    panel = {}
    def paint(i, k, c, nrm):
        z = zs[i]
        if kind[i, k]:
            return None
        if z > 2.9:
            return tone('cowl', 0.0, 0.92 + 0.08 * noise.noise(c * 3))
        local_y = c.y
        if abs(math.sin(angles[k])) > 0.55 and 0.75 < local_y < 1.75 and any(abs(z - s) < 0.011 for s in DOOR_SEAMS[::3] + DOOR_SEAMS[1:3]) and zs[i] - zs[i + 1] < 0.03:
            return tone('seam')  # (the door's edges)
        if STRIPE_Y[0] < local_y < STRIPE_Y[1] and abs(math.sin(angles[k])) > 0.5:
            return tone('stripe')  # (the cheatline down each side)
        if -1.6 < z < -1.3:
            return tone('stripe')
        key = (int((z + 5) / 0.9), int((angles[k] + 4) / 0.8))
        panel.setdefault(key, random.uniform(0.95, 1.04))
        return tone('paint', 0.0, panel[key])

    vs = [[m.vert(('hull', i, k), p) for k, p in enumerate(r)] for i, r in enumerate(rows)]
    for i in range(len(zs) - 1):
        for k in range(n):
            k1 = (k + 1) % n
            quad = [rows[i][k], rows[i][k1], rows[i + 1][k1], rows[i + 1][k]]
            c = sum(quad, Vector()) / 4
            col = paint(i, k, c, None)
            if col is not None:
                face = [vs[i][k], vs[i][k1], vs[i + 1][k1], vs[i + 1][k]]
                # (Facing out: the rows run nose to tail, the columns round from below on the left.)
                f = m.face(face, col)
                continue
            # A window: glass set in a little, and the frame's sides down to it.
            za, zb, aa, ab = zs[i], zs[i + 1], angles[k], angles[k1] + (math.tau if k1 == 0 else 0)
            inset = 0.03  # (deep enough that the seal round it shows)
            inner = [hull_point(za, aa, inset), hull_point(za, ab, inset), hull_point(zb, ab, inset), hull_point(zb, aa, inset)]
            where = kind[i, k]
            # (Smashed out on the right: one hole with a jagged edge.)
            smashed = where == 'screen' and (c - HOLE).length < 0.3 + 0.08 * noise.noise(c * 9)
            if not smashed:
                sky = max(0.0, min(1.0, (c.y - 1.3) / 0.5))
                shade = tuple(a + (b - a) * sky * 0.6 for a, b in zip(tone('glass'), tone('glass_sky')))
                if where == 'screen':  # (crazed white round where it was hit)
                    crazed = math.exp(-((c - IMPACT).length / 0.16) ** 2)
                    shade = tuple(a + (b - a) * crazed * 0.85 for a, b in zip(shade, tone('glass_cracked')))
                glass.append((inner, shade))
            for (j0, j1), (di, dk) in (((0, 1), (-1, 0)), ((1, 2), (0, 1)), ((2, 3), (1, 0)), ((3, 0), (0, -1))):
                if kind.get((i + di, (k + dk) % n)):
                    continue
                outer = [quad[j0], quad[j1]]
                m.face([outer[0], outer[1], inner[j1], inner[j0]], tone('frame'), smooth=False)
    # The nose: closed behind the spinner.
    m.cap(rows[0], tone('cowl_dark'), Vector((0, 0, 1)))
    m.cap(rows[-1], tone('paint'), Vector((0, 0, -1)))
    return zs, angles


def cabin(m):
    """The inside: an inner skin round the cabin, the floor, the panel, yokes and seats."""
    za, zb = 2.42, 0.1
    zs = [za - (za - zb) * i / 20 for i in range(21)]
    angles = [math.tau * k / 32 for k in range(32)]
    rows = [[hull_point(z, a, 0.035) for a in angles] for z in zs]
    # (Faces turned to face in, toward the cabin.)
    m.ring_skin([r[::-1] for r in rows], lambda i, k, c, n: tone('cabin', 0.0, 0.9 + 0.1 * (c.y - 0.7)), key='cabin')
    for z, out in ((za, Vector((0, 0, -1))), (zb, Vector((0, 0, 1)))):
        m.cap([hull_point(z, a, 0.035) for a in angles], tone('cabin', 0.0, 0.8), out)
    # The floor.
    m.face([Vector((-0.5, 0.78, zb)), Vector((0.5, 0.78, zb)), Vector((0.5, 0.78, za)), Vector((-0.5, 0.78, za))], tone('cabin_floor'), smooth=False)
    # The instrument panel under the windscreen, its glareshield, and gauges.
    box(m, (-0.56, 1.18, 2.28), (0.56, 1.5, 2.38), tone('panel'))
    box(m, (-0.56, 1.5, 2.22), (0.56, 1.54, 2.4), tone('panel', 0.0, 0.8))
    for x, y in ((-0.42, 1.4), (-0.32, 1.4), (-0.22, 1.4), (-0.42, 1.28), (-0.32, 1.28), (-0.22, 1.28), (0.1, 1.36), (0.2, 1.36)):
        disc = [Vector((x + math.cos(t) * 0.035, y + math.sin(t) * 0.035, 2.275)) for t in (math.tau * j / 10 for j in range(10))]
        m.cap(disc, tone('gauge', 0.0, random.uniform(0.85, 1.0)), Vector((0, 0, -1)))
    # The yokes.
    for x in (-0.27, 0.27):
        tube(m, (x, 1.3, 2.28), (x, 1.3, 2.05), [0.015, 0.015], lambda c, n: tone('panel'), sides=8)
        tube(m, (x - 0.1, 1.33, 2.05), (x + 0.1, 1.33, 2.05), [0.016, 0.016], lambda c, n: tone('panel', 0.0, 1.2), sides=8)
    # Two seats in front, a bench behind.
    for x0, x1, z0 in ((-0.48, -0.08, 1.2), (0.08, 0.48, 1.2), (-0.5, 0.5, 0.25)):
        box(m, (x0, 0.82, z0), (x1, 0.95, z0 + 0.48), tone('seat'), bevel=0.03)
        box(m, (x0, 0.92, z0 - 0.06), (x1, 1.5, z0 + 0.04), tone('seat_dark'), bevel=0.03, tilt=-0.18)


def box(m, lo, hi, colour, bevel=0.01, tilt=0.0):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1)
    lo, hi = Vector(lo), Vector(hi)
    size, mid = hi - lo, (hi + lo) / 2
    c, s = math.cos(tilt), math.sin(tilt)
    for v in tmp.verts:
        p = Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z))
        v.co = Vector((p.x, p.y * c - p.z * s, p.z * c + p.y * s)) + mid
    r = min(bevel, min(size) * 0.4)
    bmesh.ops.bevel(tmp, geom=tmp.edges[:] + tmp.verts[:], offset=r, segments=2, profile=0.5, affect='EDGES')
    for f in tmp.faces:
        m.face([v.co.copy() for v in f.verts], colour, smooth=False)
    tmp.free()


# ---- wings, tail ----
AIRFOIL = [(0.0, 0.0), (0.01, 0.35), (0.04, 0.62), (0.1, 0.85), (0.2, 0.98), (0.3, 1.0), (0.45, 0.95), (0.6, 0.8), (0.73, 0.6),
           (0.75, 0.57), (0.77, 0.54), (0.9, 0.3), (1.0, 0.05), (1.0, -0.03), (0.9, -0.12), (0.77, -0.2), (0.75, -0.21), (0.73, -0.22),
           (0.6, -0.3), (0.45, -0.36), (0.3, -0.38), (0.2, -0.36), (0.1, -0.3), (0.04, -0.22), (0.01, -0.12)]


def airfoil(x, lead_z, chord, thick, y, flip=False):
    pts = [Vector((x, y + t * thick * 0.5, lead_z - f * chord)) for f, t in AIRFOIL]
    return pts[::-1] if flip else pts


def wing_colour(tip_x, torn_x=None, hinge=True):
    def colour(i, k, c, n):
        f, _ = AIRFOIL[k]
        if hinge and 0.74 <= f <= 0.76 and AIRFOIL[(k + 1) % len(AIRFOIL)][0] >= 0.74 and AIRFOIL[(k + 1) % len(AIRFOIL)][0] <= 0.76:
            return tone('seam')  # (the gap in front of the flaps and ailerons)
        if (tip_x > 0 and c.x > tip_x) or (tip_x < 0 and c.x < tip_x):
            return tone('stripe')
        return tone('paint', 0.0, 0.97 + 0.04 * noise.noise(c * 1.3))
    return colour


def plane():
    random.seed(301)
    m = Mesh()
    glass = []
    fuselage(m, glass)
    cabin(m)
    # The wing across the top of the cabin, from the red left tip to the torn stub on the right.
    spans = [-5.5, -5.42, -5.2, -4.8, -4.2, -3.5, -2.8, -2.1, -1.4, -0.7, 0.0, 0.7, 1.3, 1.8, 2.3]
    secs = []
    for x in spans:
        sec = airfoil(x, 1.75, 1.55, 0.17, 1.84 + 0.28 + abs(x) * 0.035)
        if x >= 2.3:  # torn end: ragged
            sec = [p + Vector((random.uniform(-0.25, 0.1), random.uniform(-0.03, 0.03), 0)) for p in sec]
        if x <= -5.5:  # the rounded tip
            sec = [Vector((p.x + 0.06, (p.y - (1.84 + 0.28 + 5.5 * 0.035)) * 0.4 + (1.84 + 0.28 + 5.5 * 0.035), p.z)) for p in sec]
        secs.append([p + Vector((0, 0.025 * noise.noise(p * 1.7), 0)) for p in sec])
    m.ring_skin(secs, wing_colour(-5.0), key='wing')
    m.cap(secs[0], tone('stripe'), Vector((-1, 0, 0)), smooth=True)
    m.cap(secs[-1], tone('torn'), Vector((1, 0, 0)))
    # Struts, from low on the fuselage to under the wing: the left whole, the right snapped.
    for x0, x1, frac in ((-0.55, -2.7, 1.0), (0.55, 2.2, 0.45)):
        a, z = Vector((x0, 0.55, 1.0)), Vector((x1, 2.05, 1.0))
        tube(m, a, a.lerp(z, frac), [(0.05, 0.018)] * 2, lambda c, n: tone('strut'), sides=10, turn=0.0)
    # The tail: stabilisers, and the fin with its red top.
    for side in (-1, 1):
        secs = [airfoil(side * x, -3.55 + x * 0.12, 0.85 - x * 0.2, 0.06, 1.45, flip=side < 0) for x in (0.1, 0.5, 1.0, 1.45)]
        m.ring_skin(secs, wing_colour(99, hinge=False))
        m.cap(secs[-1], tone('paint'), Vector((side, 0, 0)), smooth=True)
    fin = []
    for y, lead, chord in ((1.5, -3.3, 1.15), (1.9, -3.55, 0.98), (2.3, -3.8, 0.8), (2.65, -4.0, 0.62), (2.9, -4.12, 0.48)):
        fin.append([Vector((p.y - 1.45, y, p.z)) for p in airfoil(0, lead, chord, 0.08, 1.45)])
    m.ring_skin(fin, lambda i, k, c, n: tone('stripe' if c.y > 2.3 else 'paint'))
    m.cap(fin[-1], tone('stripe'), Vector((0, 1, 0)), smooth=True)
    # The spinner, dented, and the propeller, its blades bent back where they hit.
    hub = Vector((0, 1.0, 4.05))
    spinner = [[hub + Vector((math.cos(t) * r, math.sin(t) * r, dz)) + Vector((0.01 * noise.noise(Vector((t, dz, 1)) * 3), 0, 0)) for t in (math.tau * k / 16 for k in range(16))]
               for r, dz in ((0.15, 0.0), (0.14, 0.08), (0.11, 0.16), (0.06, 0.23), (0.01, 0.27))]
    m.ring_skin(spinner, lambda i, k, c, n: tone('cowl', 0.0, 1.1))
    m.cap(spinner[-1], tone('cowl', 0.0, 1.1), Vector((0, 0, 1)))
    for side in (-1, 1):
        root = hub + Vector((side * 0.1, 0, 0.08))
        mid = hub + Vector((side * 0.55, -0.12 * side, 0.02))
        tip = hub + Vector((side * 0.82, -0.3 * side, -0.38))
        blade = lambda c, n, t=tip: tone('prop_tip' if (c - t).length < 0.12 else 'prop')
        tube(m, root, mid, [(0.07, 0.016), (0.08, 0.015)], blade, sides=8, turn=0.35 * side)
        tube(m, mid, tip, [(0.08, 0.015), (0.06, 0.012)], blade, sides=8, turn=0.35 * side)
    # The exhaust stack under the cowl, and one landing-gear leg, bent.
    tube(m, (0.28, 0.6, 3.1), (0.3, 0.5, 2.85), [0.035, 0.032], lambda c, n: tone('exhaust'), sides=10)
    tube(m, (-0.5, 0.45, 1.9), (-1.0, -0.15, 2.2), [(0.06, 0.02), (0.05, 0.018)], lambda c, n: tone('cowl_dark'), sides=8)
    # The glass, in its own material.
    for quad, shade in glass:
        m.face(quad, shade, smooth=True, slot=1)
    return m.build('plane', [shared('plane', 0.55), shared('glass', 0.1)])


def plane_wing():
    """The wing that broke off, lying on the ground: the torn root at -x, the red tip at +x,
    the top about 0.45 m up (the player can hop onto it)."""
    random.seed(302)
    m = Mesh()
    global place
    keep = place
    place = lambda p: p  # (lying as it is: not tipped like the plane)
    try:
        secs = []
        for x in (-3.0, -2.6, -2.0, -1.3, -0.6, 0.1, 0.8, 1.5, 2.1, 2.5, 2.7, 2.78):
            sec = airfoil(x, 0.78, 1.55, 0.17, 0.3 + x * 0.02)
            if x <= -3.0:
                sec = [p + Vector((random.uniform(-0.1, 0.25), random.uniform(-0.03, 0.03), 0)) for p in sec]
            if x >= 2.78:
                sec = [Vector((p.x - 0.06, (p.y - (0.3 + x * 0.02)) * 0.4 + 0.3 + x * 0.02, p.z)) for p in sec]
            secs.append([p + Vector((0, 0.03 * noise.noise(p * 2.1 + Vector((9, 0, 0))), 0)) for p in sec])
        m.ring_skin(secs, wing_colour(2.35))
        m.cap(secs[0], tone('torn'), Vector((-1, 0, 0)))
        m.cap(secs[-1], tone('stripe'), Vector((1, 0, 0)), smooth=True)
        # The stub of its strut, torn off.
        tube(m, (-1.2, 0.22, 0.0), (-1.7, -0.05, -0.1), [(0.05, 0.018), (0.05, 0.018)], lambda c, n: tone('strut'), sides=10)
        return m.build('plane-wing', [shared('plane', 0.55)])
    finally:
        place = keep


export([plane()], 'plane.glb')
export([plane_wing()], 'plane-wing.glb')
print('@@ plane done')
