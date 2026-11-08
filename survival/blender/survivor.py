# Builds the player (player.glb): a survivor with realistic proportions, smooth shaded.
# A sculpted head (eye sockets, brow ridge, cheekbones, a nose, lips, ears, domed eyes under
# their lids) with a full beard, moustache, thick brows and hair, sculpted and combed into
# clumps (crests lit, grooves dark, pointed at the tips), under a ribbed knit beanie; a red
# hooded jacket with a high collar, zip, pockets and cuffs; work trousers; boots; wool gloves.
# Run in an open Blender (Blender MCP or the Text Editor).
#
# It keeps everything the game relies on: the skeleton and its animations (taken from RIG,
# by default the current player.glb), the 'player-pack' backpack mesh, and the bones the game
# hangs things on (hand_R, lowerarm_L...). The body is built round the skeleton's joints and
# weighted to them here (each part only to the bones it should follow, blended at the joints).
# The jacket is modelled in strong red: the game repaints that red as a shirt until you find
# your jacket (outfits.js), so keep it red. Sizes suit the parka's hood and skirt (outfits.js).
import math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Matrix, Vector
from kit import PAL, Builder, g, material

OUT = os.path.join(HERE, '..', 'public', 'models', 'player.glb')
RIG = globals().get('RIG', OUT)
# How far out from the middle the arms' joints are (shoulder, elbow, wrist), so they hang close
# at his sides. The skeleton is moved to match (its arm bones only turn in the animations).
ARM_X = {'upperarm': 0.2, 'lowerarm': 0.212, 'hand': 0.222}
PACK_ON_BACK = (0, 0.84, -0.295)  # (game axes: where backpack.glb hangs on his back)

PAL.update(
    skin=0xc8987a, skin_shade=0xae8066, skin_rose=0xc47a6a, skin_lip=0x8a5a4c, stubble=0x5a4436, brow=0x4a3628, hair=0x4a3628,
    beard=0x4a3426, eye_white=0xbab2a6, iris=0x4e5a48, pupil=0x141210, lash=0x2a1e18, glove=0x3a3632, glove_cuff=0x2e2a28, beanie=0x2e3a52, beanie_band=0x26304a, pompom=0xd8d0c0,
    coat=0xa82a22, coat_dark=0x8a2420, coat_fold=0x96261f, lining=0xc8b07a, zip=0x2a2a2a,
    trousers=0x4a4f44, trousers_dark=0x3a3e36, boot=0x4a3426, boot_dark=0x3a281e, sole=0x1e1a18, lace=0x8a7a5a,
)


# How much finer than the shapes' own outlines it's built: rings have RES times the sides, and
# each span between rings gets RES rows, laid along a smooth curve. Shaded smooth, so it reads
# as soft, rounded forms; the small details (eyes, brows, zip, pockets) stay crisp.
RES = 2


def tone(name, var=0.012, shade=1.0):
    h = PAL[name]
    k = (1 + random.uniform(-var, var)) * shade
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


class Part:
    """Faces for one part of the body, and the bones it may follow."""
    def __init__(self, bones):
        self.bones = bones
        self.faces = []  # ([points], colour); colour None: each corner's from self.corner(point)
        self.corner = None

    def add(self, pts, colour, smooth=True):
        self.faces.append((list(pts), colour, smooth))

    def add_out(self, pts, out, colour, smooth=False):
        """A face, turned to face along `out`."""
        pts = list(pts)
        if (pts[1] - pts[0]).cross(pts[2] - pts[0]).dot(out) < 0:
            pts = pts[::-1]
        self.add(pts, colour, smooth)


def section(centre, w, front, back, sides, z_off=0.0, power=2.2):
    """A ring round `centre` in the x-z plane: `w` half-wide, reaching `front` forward (+z) and
    `back` behind, rounder or squarer by `power`."""
    pts = []
    sides *= RES
    for k in range(sides):
        a = math.tau * k / sides
        s, c = math.sin(a), math.cos(a)
        x = math.copysign(abs(s) ** (2 / power), s) * w
        z = math.copysign(abs(c) ** (2 / power), c) * (front if c > 0 else back)
        pts.append(Vector((centre.x + x, centre.y, centre.z + z + z_off)))
    return pts


def curve(p0, p1, p2, p3, t):
    """Catmull-Rom: a smooth curve through p1 and p2."""
    return 0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)


def loft(part, rings, colour, cap_start=True, cap_end=True, res=None):
    """Skins the rings, RES rows between each pair along a smooth curve; colour(i, k, centre,
    normal) gets the span i of the original rings, so colours keep to the shape's own bands."""
    res = res or RES
    n = len(rings[0])
    rows, span = [], []
    for i in range(len(rings) - 1):
        r0, r1, r2, r3 = rings[max(i - 1, 0)], rings[i], rings[i + 1], rings[min(i + 2, len(rings) - 1)]
        for j in range(res):
            t = j / res
            rows.append([curve(r0[k], r1[k], r2[k], r3[k], t) for k in range(n)])
            span.append(i)
    rows.append(rings[-1])
    middles = [sum(row, Vector()) / n for row in rows]
    for i in range(len(rows) - 1):
        axis = (middles[i] + middles[i + 1]) / 2
        for k in range(n):
            k1 = (k + 1) % n
            quad = [rows[i][k], rows[i][k1], rows[i + 1][k1], rows[i + 1][k]]
            centre = sum(quad, Vector()) / 4
            normal = (quad[1] - quad[0]).cross(quad[3] - quad[0]).normalized()
            if normal.dot(centre - axis) < 0:  # (always facing out from the middle)
                quad, normal = quad[::-1], -normal
            part.add(quad, colour(span[i], k // res, centre, normal))
    for ring, other, cap in ((rings[0], middles[1], cap_start), (rings[-1], middles[-2], cap_end)):
        if not cap:
            continue
        c = sum(ring, Vector()) / n
        out = (c - other).normalized()
        for k in range(n):
            tri = [c, ring[k], ring[(k + 1) % n]]
            if (tri[1] - tri[0]).cross(tri[2] - tri[0]).dot(out) < 0:
                tri = tri[::-1]
            part.add(tri, colour(0 if other is middles[1] else len(rings) - 2, k // res, c, out))


def tube_between(part, a, b, radii, colour, sides=8, depth=1.0, cap_start=True, cap_end=True):
    """A limb from a to b through len(radii) rings, each (w, d) or a single radius."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    v = d.cross(u)
    rings = []
    sides *= RES
    for i, r in enumerate(radii):
        t = i / (len(radii) - 1)
        w, dd = r if isinstance(r, tuple) else (r, r * depth)
        p = a.lerp(b, t)
        rings.append([p + u * math.cos(math.tau * k / sides) * w + v * math.sin(math.tau * k / sides) * dd for k in range(sides)])
    loft(part, rings, colour, cap_start, cap_end)


def box(part, lo, hi, colour):
    lo, hi = Vector(lo), Vector(hi)
    c = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        part.add([c[i] for i in f], colour, smooth=False)


# ---- the body ----
def legs(parts):
    for s, side in ((1, 'L'), (-1, 'R')):
        p = Part(['hips', f'thigh_{side}', f'shin_{side}'])
        x = 0.115 * s
        rings = []
        for y, w, d, dz in ((0.96, 0.095, 0.1, 0.0), (0.82, 0.088, 0.095, 0.0), (0.66, 0.075, 0.08, 0.005), (0.49, 0.062, 0.068, 0.012),
                            (0.36, 0.062, 0.066, -0.005), (0.22, 0.052, 0.055, 0.0), (0.14, 0.05, 0.052, 0.0)):
            rings.append(section(Vector((x, y, dz)), w, d, d, 8))
        loft(p, rings, lambda i, k, c, n: tone('trousers_dark' if i in (2, 3) and n.z > 0.3 else 'trousers', 0.03), cap_start=False)
        # The boot: an ankle collar, then the foot reaching forward to a rounded toe, on a sole.
        boot = []
        for y, w, front, back in ((0.15, 0.056, 0.06, 0.058), (0.08, 0.058, 0.1, 0.07), (0.03, 0.058, 0.17, 0.075), (0.0, 0.056, 0.17, 0.074)):
            boot.append(section(Vector((x, y, 0.02)), w, front, back, 10, power=2.6))
        loft(p, boot, lambda i, k, c, n: tone('sole' if i == 2 else 'boot_dark' if n.z > 0.5 and c.y > 0.05 else 'boot', 0.04))
        box(p, (x - 0.02, 0.085, 0.09), (x + 0.02, 0.1, 0.12), tone('lace'))
        parts.append(p)


def torso(parts):
    p = Part(['hips', 'spine'])
    # The jacket: hips (its hem) up to the shoulders, a little fuller at the chest.
    rings = []
    for y, w, front, back in ((0.84, 0.19, 0.13, 0.12), (0.9, 0.185, 0.125, 0.12), (1.02, 0.176, 0.12, 0.115), (1.16, 0.182, 0.135, 0.12),
                              (1.27, 0.19, 0.13, 0.125), (1.34, 0.186, 0.115, 0.115), (1.39, 0.16, 0.1, 0.105), (1.43, 0.12, 0.085, 0.095)):
        rings.append(section(Vector((0, y, 0)), w, front, back, 14, power=2.6))
    def coat(i, k, c, n):
        if i == 0 and n.y < 0.3:
            return tone('coat_dark', 0.02)  # (the hem)
        if abs(n.x) > 0.8 and 0.95 < c.y < 1.25:
            return tone('coat_fold', 0.02)  # (side seams and folds)
        return tone('coat', 0.025)
    loft(p, rings, coat, cap_start=True, cap_end=False)
    # The high collar, open at the throat, its lining showing.
    collar = [section(Vector((0, y, 0.0)), w, f, b, 14, power=2.2) for y, w, f, b in ((1.39, 0.125, 0.08, 0.09), (1.47, 0.105, 0.075, 0.085), (1.5, 0.11, 0.08, 0.09))]
    loft(p, collar, lambda i, k, c, n: tone('lining' if c.z > 0.05 and i == 1 else 'coat_dark', 0.02), cap_start=False, cap_end=False)
    # The hood, folded down at the back of the neck.
    hood = [section(Vector((0, y, -0.1)), w, 0.05, 0.07, 10) for y, w in ((1.38, 0.13), (1.44, 0.15), (1.5, 0.12))]
    loft(p, hood, lambda i, k, c, n: tone('coat_dark' if n.y < 0 else 'coat', 0.02))
    # The zip, the pockets, and a seam across the shoulders.
    box(p, (-0.006, 0.84, 0.126), (0.006, 1.42, 0.138), tone('zip'))
    for s in (1, -1):
        box(p, (s * 0.06 - 0.055, 0.9, 0.118), (s * 0.06 + 0.055, 1.0, 0.132), tone('coat_dark'))
        box(p, (s * 0.1 - 0.045, 1.17, 0.13), (s * 0.1 + 0.045, 1.24, 0.142), tone('coat_dark'))
    parts.append(p)


def arms(parts):
    for s, side in ((1, 'L'), (-1, 'R')):
        p = Part(['spine', f'upperarm_{side}', f'lowerarm_{side}', f'hand_{side}'])
        shoulder, elbow, wrist = Vector((ARM_X['upperarm'] * s, 1.36, 0)), Vector((ARM_X['lowerarm'] * s, 1.04, -0.01)), Vector((ARM_X['hand'] * s, 0.8, 0.0))
        # (The sleeve starts inside the shoulder and rounds into it, not perched on top.)
        tube_between(p, shoulder + Vector((-0.06 * s, -0.04, 0)), elbow, [(0.045, 0.05), (0.068, 0.066), (0.068, 0.065), (0.063, 0.06), (0.058, 0.056)], lambda i, k, c, n: tone('coat'), sides=9, cap_start=False)
        tube_between(p, elbow + Vector((0, 0.02, 0)), wrist + Vector((0, 0.02, 0)), [(0.06, 0.058), (0.055, 0.052), (0.05, 0.048)], lambda i, k, c, n: tone('coat'), sides=9, cap_start=False)
        tube_between(p, wrist + Vector((0, 0.05, 0)), wrist - Vector((0, 0.01, 0)), [(0.054, 0.052), (0.05, 0.048)], lambda i, k, c, n: tone('coat_dark', 0.02), sides=9)  # cuff
        # The hand, in a wool glove: a palm, the fingers together and curled a little, a thumb.
        h = Part([f'hand_{side}'])
        glove = lambda i, k, c, n: tone('glove', 0.0, 0.9 if n.y < -0.5 else 1.0)
        tube_between(h, wrist + Vector((0, 0.03, 0)), wrist - Vector((0, 0.015, 0)), [(0.05, 0.046), (0.046, 0.042), (0.04, 0.032)], lambda i, k, c, n: tone('glove_cuff', 0.0, 0.92 if k % 2 else 1.0), sides=9)
        tube_between(h, wrist - Vector((0, 0.01, 0)), wrist + Vector((0.005 * s, -0.095, 0.012)), [(0.036, 0.024), (0.044, 0.022), (0.043, 0.02)], glove, sides=8)
        tube_between(h, wrist + Vector((0.005 * s, -0.09, 0.012)), wrist + Vector((0.002 * s, -0.175, 0.03)), [(0.042, 0.019), (0.038, 0.017), (0.032, 0.015), (0.02, 0.011)], glove, sides=8)
        tube_between(h, wrist + Vector((-0.022 * s, -0.035, 0.022)), wrist + Vector((-0.032 * s, -0.105, 0.045)), [0.015, 0.013, 0.011, 0.007], glove, sides=7)
        parts += [p, h]


# The head is a dense surface, sculpted: its outline from PROFILE (rings from the chin up:
# height, half width, front, back, how far the front sits forward), then pushed in and out for
# the eye sockets, brow ridge, cheekbones, mouth and chin (relief). The beard, moustache, brows
# and the hair under the beanie are sculpted over that surface, groomed into clumps.
HEAD_CZ = 0.005
PROFILE = ((1.505, 0.034, 0.055, 0.02, 0.04), (1.54, 0.076, 0.085, 0.06, 0.012), (1.575, 0.088, 0.1, 0.085, 0.0),
           (1.615, 0.095, 0.104, 0.098, 0.0), (1.655, 0.099, 0.1, 0.105, 0.0), (1.695, 0.098, 0.104, 0.106, 0.0),
           (1.735, 0.089, 0.094, 0.1, 0.0), (1.775, 0.076, 0.078, 0.088, 0.0), (1.805, 0.048, 0.05, 0.06, 0.0))
HEAD_POWER = 2.1
HEAD_SCALE = 0.9


def profile_at(y):
    ys = [p[0] for p in PROFILE]
    y = max(ys[0], min(ys[-1], y))
    i = max(0, min(len(ys) - 2, next(j for j in range(len(ys) - 1) if y <= ys[j + 1])))
    t = (y - ys[i]) / (ys[i + 1] - ys[i])
    at = lambda j: PROFILE[max(0, min(len(PROFILE) - 1, j))]
    return [curve(at(i - 1)[k], at(i)[k], at(i + 1)[k], at(i + 2)[k], t) for k in range(1, 5)]


def gauss(dx, dy, sx, sy):
    return math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2))


def relief(x, y, c):
    """How far the face is pushed out (in, if negative) at x, y; c: how much it faces forward."""
    if c < 0.1:
        return 0.0
    d = 0.0
    for s in (1, -1):
        d -= 0.0095 * gauss(x - 0.037 * s, y - 1.667, 0.017, 0.011)  # eye sockets
        d += 0.0055 * gauss(x - 0.034 * s, y - 1.693, 0.026, 0.007)  # brow ridge
        d += 0.006 * gauss(x - 0.062 * s, y - 1.633, 0.02, 0.015)  # cheekbones
        d -= 0.003 * gauss(x - 0.05 * s, y - 1.598, 0.014, 0.018)  # under the cheekbones
    d += 0.005 * gauss(x, y - 1.582, 0.03, 0.013)  # the mouth's curve forward
    d += 0.005 * gauss(x, y - 1.523, 0.022, 0.012)  # chin
    d -= 0.0025 * gauss(x, y - 1.556, 0.02, 0.006)  # the dip under the lower lip
    return d * min(1.0, (c - 0.1) / 0.4)


def head_point(y, a):
    """The head's surface at height y, angle a round it (0: straight ahead, +: toward +x)."""
    w, f, b, off = profile_at(y)
    s, c = math.sin(a), math.cos(a)
    x = math.copysign(abs(s) ** (2 / HEAD_POWER), s) * w
    z = math.copysign(abs(c) ** (2 / HEAD_POWER), c) * (f if c > 0 else b) + off
    r = relief(x, y, c)
    return Vector((x + s * r, y, HEAD_CZ + z + c * r))


def head_normal(y, a):
    p = head_point(y, a)
    du = head_point(y, a + 0.01) - head_point(y, a - 0.01)
    dv = head_point(y + 0.004, a) - head_point(y - 0.004, a)
    n = du.cross(dv).normalized()
    out = p - Vector((0, y, HEAD_CZ))
    return n if n.dot(out) > 0 else -n


def head_angle(x, y):
    """The angle round the head (front half) where the surface is at x, at height y."""
    lo, hi = 0.0, math.copysign(math.pi / 2, x)
    for _ in range(30):
        mid = (lo + hi) / 2
        if abs(head_point(y, mid).x) < abs(x):
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# Where the beard reaches up to, by angle round from the front (A): under the lower lip, up
# the cheeks, the sideburns up to the hair, then the jaw back toward the neck.
BEARD_EDGE = ((0.0, 1.566), (0.3, 1.568), (0.5, 1.598), (1.2, 1.626), (1.32, 1.725), (1.45, 1.735), (1.62, 1.6), (2.05, 1.548))
BEARD_REACH = 2.05
# Where the hair below the beanie comes down to, round the back from the sideburns.
HAIR_EDGE = ((1.3, 1.735), (1.4, 1.705), (1.75, 1.69), (2.05, 1.62), (2.5, 1.585), (math.pi, 1.575))


def edge_at(edge, A):
    A = max(edge[0][0], min(edge[-1][0], A))
    for (a0, y0), (a1, y1) in zip(edge, edge[1:]):
        if A <= a1:
            t = (A - a0) / (a1 - a0)
            t = t * t * (3 - 2 * t)
            return y0 + (y1 - y0) * t
    return edge[-1][1]


def moustache_at(y, A):
    return A < 0.5 and 1.584 < y < 1.607


def beard_at(y, A):
    """Whether the beard grows at height y, angle A (from the front, either side)."""
    return (A <= BEARD_REACH and y < edge_at(BEARD_EDGE, A)) or moustache_at(y, A)


def hair_at(y, A):
    """Whether the hair under the beanie shows at height y, angle A."""
    return A >= 1.3 and y > edge_at(HAIR_EDGE, A)


def blend(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)


def skin_colour(q):
    """The skin's colour at a point on the head, blended smoothly: darker toward the sides and in
    the eye sockets, flushed with cold at the cheeks, nose and ears; stubble under the beard."""
    y = q.y
    A = abs(math.atan2(q.x, q.z - HEAD_CZ))
    front = math.cos(A)
    if y > 1.74:
        return tone('hair', 0.0)
    if abs(q.x) < 0.088 or y < 1.6:  # (not the ears)
        if beard_at(y, A):
            return tone('stubble', 0.0)
        if hair_at(y, A):
            return tone('hair', 0.0)
    c = tone('skin', 0.0)
    c = blend(c, tone('skin_shade', 0.0), 0.3 - front)
    socket = max(gauss(q.x - 0.037 * s, y - 1.667, 0.02, 0.013) for s in (1, -1)) * max(0.0, front)
    c = blend(c, tone('skin_shade', 0.0, 0.92), socket * 0.75)
    flush = max(gauss(q.x - 0.06 * s, y - 1.622, 0.026, 0.022) for s in (1, -1)) * max(0.0, front)
    flush = max(flush, gauss(q.x, y - 1.612, 0.016, 0.014), 0.35 if abs(q.x) > 0.095 else 0.0)  # (and the nose tip, the ears)
    c = blend(c, tone('skin_rose', 0.0), flush)
    return c


def head(parts):
    p = Part(['spine', 'head'])
    # The neck (stubble up its front, under the beard).
    tube_between(p, (0, 1.4, -0.005), (0, 1.53, 0.0), [(0.052, 0.05), (0.05, 0.048)],
                 lambda i, k, c, n: tone('stubble' if c.y > 1.47 and n.z > 0.2 else 'skin_shade', 0.004), sides=8)
    h = Part(['head'])
    ys = [1.505 + (1.805 - 1.505) * i / 33 for i in range(34)]
    sides = 36
    rings = [[head_point(y, math.tau * k / sides) for k in range(sides)] for y in ys]

    h.corner = skin_colour
    loft(h, rings, lambda i, k, c, n: None, res=1)

    # The nose: rings from the bridge down to its tip, its back sunk into the face.
    nose = []
    for y, w, out, back in ((1.688, 0.008, 0.002, 0.012), (1.675, 0.0092, 0.006, 0.014), (1.66, 0.0105, 0.012, 0.016),
                            (1.644, 0.0125, 0.018, 0.018), (1.628, 0.016, 0.023, 0.02), (1.614, 0.018, 0.026, 0.02),
                            (1.603, 0.016, 0.021, 0.02), (1.597, 0.012, 0.014, 0.018)):
        z = head_point(y, 0.0).z
        nose.append(section(Vector((0, y, z)), w, out, back, 8, power=1.9))
    loft(h, nose, lambda i, k, c, n: None)
    for s in (1, -1):  # (the nostrils)
        c = Vector((0.008 * s, 1.5965, head_point(1.597, 0.0).z + 0.009))
        disc = [c + Vector((math.cos(t) * 0.0045, 0, math.sin(t) * 0.003)) for t in (math.tau * j / 6 for j in range(6))]
        h.add_out(disc, Vector((0, -1, 0.2)), tone('skin_lip', 0.0, 0.35))

    # The eyes: almond-shaped, set in their sockets, an iris and pupil, a dark lash line above.
    for s in (1, -1):
        ex, ey = 0.036 * s, 1.668
        fwd = Vector((0.35 * s, 0.0, 1.0))
        def on_face(x, y, lift):
            a = head_angle(x, y)
            return head_point(y, a) + head_normal(y, a) * lift
        # The eyeball: a dome filling the almond-shaped opening (rings in to its middle), the
        # iris and pupil on its curve, clipped to the opening as the lids would.
        W, UP, DOWN = 0.0165, 0.0074, 0.0058
        dome = lambda r: 0.0022 + 0.0028 * (1 - r * r)
        def eye_at(u, v, extra=0.0):
            """u, v: across and up the opening (-1..1 each way)."""
            r = min(1.0, math.hypot(u, v))
            return on_face(ex + u * W, ey + v * (UP if v > 0 else DOWN), dome(r) + extra)
        rings_e = [[eye_at(math.cos(math.tau * j / 16) * r, math.sin(math.tau * j / 16) * r) for j in range(16)] for r in (1.0, 0.7, 0.4)]
        outline = rings_e[0]
        for a_ring, b_ring in zip(rings_e, rings_e[1:]):
            for j in range(16):
                h.add_out([a_ring[j], a_ring[(j + 1) % 16], b_ring[(j + 1) % 16], b_ring[j]], fwd, tone('eye_white', 0.0), smooth=True)
        mid = eye_at(0, 0)
        for j in range(16):
            h.add_out([mid, rings_e[-1][j], rings_e[-1][(j + 1) % 16]], fwd, tone('eye_white', 0.0), smooth=True)
        def disc(radius, extra, n):
            pts = []
            for j in range(n):
                t = math.tau * j / n
                dx, dy = 0.0013 * s + math.cos(t) * radius, -0.0004 + math.sin(t) * radius
                u, v = dx / W, dy / (UP if dy > 0 else DOWN)
                k = math.hypot(u, v)
                if k > 0.93:  # (under the lids)
                    u, v = u * 0.93 / k, v * 0.93 / k
                pts.append(eye_at(u, v, extra))
            return pts
        h.add_out(disc(0.0066, 0.0005, 14), fwd, tone('iris', 0.0))
        h.add_out(disc(0.0027, 0.0008, 10), fwd, tone('pupil', 0.0))
        outline = [eye_at(math.cos(math.tau * j / 12), math.sin(math.tau * j / 12)) for j in range(12)]
        # The upper lid: a lash line along the top of the eye, and the lid fold above it.
        # (The lids' edges lie on the eyeball, a little in from the opening, so they overlap it.)
        lid = lambda j, k: eye_at(math.cos(math.tau * j / 12), math.sin(math.tau * j / 12) * k, 0.0006)
        top = [lid(j, 0.86) for j in range(0, 7)]
        for j in range(6):
            a0, a1 = top[j], top[j + 1]
            up0 = on_face(a0.x, a0.y + 0.0032, 0.0046)
            up1 = on_face(a1.x, a1.y + 0.0032, 0.0046)
            h.add_out([a0, a1, up1, up0], fwd, tone('lash', 0.0))
            fold0 = on_face(a0.x, a0.y + 0.0072, 0.003)
            fold1 = on_face(a1.x, a1.y + 0.0072, 0.003)
            h.add_out([up0, up1, fold1, fold0], fwd, None, smooth=True)
        # The lower lid: a soft ledge under the eye.
        for j in range(6, 12):
            a0, a1 = lid(j, 0.92), lid((j + 1) % 12, 0.92)
            d0 = on_face(a0.x, a0.y - 0.0028, 0.0026)
            d1 = on_face(a1.x, a1.y - 0.0028, 0.0026)
            h.add_out([a0, a1, d1, d0], fwd, None, smooth=True)
        # Ears: a thick shell, standing a little out from the head and leaning back.
        tube_between(h, (0.088 * s, 1.662, -0.012), (0.113 * s, 1.666, -0.024), [(0.026, 0.016), (0.031, 0.02), (0.028, 0.018), (0.016, 0.01)],
                     lambda i, k, c, n: None, sides=8)
    # The lips: a fuller lower lip and a thinner upper one, a dark line where they meet.
    zl = head_point(1.571, 0.0).z
    tube_between(h, (-0.024, 1.571, zl - 0.003), (0.024, 1.571, zl - 0.003), [(0.002, 0.002), (0.0048, 0.0045), (0.0055, 0.005), (0.0048, 0.0045), (0.002, 0.002)],
                 lambda i, k, c, n: tone('skin_lip', 0.0), sides=6)
    zu = head_point(1.583, 0.0).z
    tube_between(h, (-0.025, 1.583, zu - 0.002), (0.025, 1.583, zu - 0.002), [(0.0015, 0.0015), (0.0035, 0.004), (0.004, 0.0045), (0.0035, 0.004), (0.0015, 0.0015)],
                 lambda i, k, c, n: tone('skin_lip', 0.0, 0.92), sides=6)

    # The beanie: a dome over the crown, a folded, ribbed band, and a pompom.
    # (Knitted in ribs: every other column of the rings stands out a little, drawing in toward
    # the crown, where the ribs gather.)
    def ribbed(ring, depth):
        mid = sum(ring, Vector()) / len(ring)
        return [mid + (q - mid) * (1 + depth * (1 if k % 2 else -1)) for k, q in enumerate(ring)]
    knit = lambda shade: lambda i, k, c, n: tone(shade, 0.0, 0.9 + 0.06 * math.sin(k * 1.7) + 0.05 * random.random())
    beanie = [ribbed(section(Vector((0, y, HEAD_CZ)), w, f, b, 22, power=2.3), rib) for y, w, f, b, rib in (
        (1.745, 0.1, 0.104, 0.11, 0.025), (1.785, 0.097, 0.1, 0.107, 0.028), (1.82, 0.085, 0.087, 0.094, 0.03),
        (1.85, 0.062, 0.064, 0.07, 0.03), (1.868, 0.032, 0.033, 0.036, 0.02), (1.874, 0.008, 0.008, 0.009, 0.0))]
    loft(h, beanie, knit('beanie'), cap_start=False)
    band = [ribbed(section(Vector((0, y, HEAD_CZ)), w, f, b, 22, power=2.3), 0.035) for y, w, f, b in ((1.724, 0.104, 0.11, 0.114), (1.75, 0.108, 0.114, 0.118), (1.775, 0.106, 0.112, 0.116))]
    loft(h, band, knit('beanie_band'), cap_start=False, cap_end=False)
    beard(h)
    hair_below_beanie(h)
    brows(h)
    # (Modelled a little large: scaled down about the chin, to about one eighth of his height.)
    pivot = Vector((0, 1.5, 0.0))
    shrink = lambda q: pivot + (q - pivot) * HEAD_SCALE
    for part in (h,):
        part.faces = [([shrink(q) for q in pts], colour, smooth) for pts, colour, smooth in part.faces]
        if part.corner:
            corner = part.corner
            part.corner = lambda q, corner=corner: corner(pivot + (q - pivot) / HEAD_SCALE)
    parts += [p, h]


# ---- hair: sculpted and groomed ----
# The beard, moustache and hair are masses laid over the head, combed into clumps: each a ridge
# running down the strands, lit along its crest and dark in the groove between, the clumps
# wavering a little and ending in points along the bottom edge. The brows are thick strokes.
def groomed(part, size, at, colour, clump=5.0, wave=2.0, tips=0.0):
    """A combed mass over the grid at(u, j) -> (point on the head, its normal, thickness,
    hang): size = (rows, columns); u runs 0 (the bottom edge, where the tips are) to 1 (the
    top, where it thins into the skin); colour(u, ridge) per corner."""
    rows, cols = size
    grid, ridges = [], []
    for i in range(rows + 1):
        u = i / rows
        row, rrow = [], []
        for j in range(cols + 1):
            p, n, t, hang = at(u, j)
            c = (j + wave * math.sin(u * 5.0 + j * 0.37)) / clump
            ridge = 1 - (2 * (c % 1) - 1) ** 2  # (1 along a clump's crest, 0 in the grooves)
            t *= 0.72 + 0.4 * ridge
            hang += tips * ridge ** 3 * max(0.0, 1 - u * 6)  # (the clumps' points)
            row.append(p + n * t + Vector((0, -hang, 0)))
            rrow.append(ridge)
        grid.append(row)
        ridges.append(rrow)
    for i in range(rows):
        for j in range(cols):
            quad = [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]]
            corner = [colour((i + di) / rows, ridges[i + di][j + dj]) for di, dj in ((0, 0), (0, 1), (1, 1), (1, 0))]
            under, _, _, _ = at((i + 0.5) / rows, j + 0.5)
            centre = sum(quad, Vector()) / 4
            if (quad[1] - quad[0]).cross(quad[3] - quad[0]).dot(centre - under) < 0:
                quad, corner = quad[::-1], corner[::-1]
            part.add(quad, corner)
    return grid


def strand_colour(base, light=0.45):
    def colour(u, ridge):
        k = 0.7 + light * ridge + random.uniform(-0.04, 0.04)
        return tone(base, 0.0, k)
    return colour


def beard(h):
    cols, A = 140, BEARD_REACH

    def at(u, j):
        a = -A + 2 * A * j / cols
        y = 1.505 + (edge_at(BEARD_EDGE, abs(a)) - 1.505) * u
        p, n = head_point(y, a), head_normal(y, a)
        fade = (1 - u) ** 0.65 * max(0.0, min(1.0, (A - abs(a)) / 0.35))
        chin = gauss(a, 0, 0.8, 1)
        bulk = 0.011 + 0.017 * chin  # (fullest at the chin)
        return p, n, 0.0015 + bulk * fade, (0.004 + 0.03 * chin) * fade ** 2.2
    grid = groomed(h, (30, cols), at, strand_colour('beard'), clump=5.0, tips=0.01)
    # (Closed underneath, where it ends below the chin.)
    bottom = grid[0]
    c = sum(bottom, Vector()) / len(bottom) + Vector((0, 0.01, 0))
    for j in range(len(bottom) - 1):
        h.add_out([c, bottom[j], bottom[j + 1]], Vector((0, -1, 0.3)), tone('beard', 0.0, 0.6), smooth=True)
    # The moustache: over the upper lip, drooping at the corners into the beard.
    mcols = 40

    def mat(u, j):
        a = -0.5 + j / mcols
        y = 1.584 + 0.023 * u
        p, n = head_point(y, a), head_normal(y, a)
        fade = (1 - u) ** 0.5 * min(1.0, (0.5 - abs(a)) / 0.12 + 0.3)
        return p, n, 0.0015 + 0.009 * fade, 0.008 * (1 - u) ** 2 * (1 + 2.5 * abs(a))
    groomed(h, (10, mcols), mat, strand_colour('beard', 0.5), clump=3.0, wave=0.8, tips=0.004)


def hair_below_beanie(h):
    cols = 90
    lo, hi = 1.3, math.tau - 1.3

    def at(u, j):
        a = lo + (hi - lo) * j / cols
        A = abs(math.atan2(math.sin(a), math.cos(a)))
        bottom = edge_at(HAIR_EDGE, A)
        y = bottom + (1.745 - bottom) * u
        p, n = head_point(y, a), head_normal(y, a)
        side = min(1.0, (A - 1.3) / 0.12 + 0.2)
        return p, n, (0.0015 + 0.009 * u ** 0.6) * side, 0.0
    groomed(h, (16, cols), at, strand_colour('hair', 0.5), clump=4.0, wave=1.5, tips=0.007)


def brows(h):
    """Thick strokes along the brow ridge, full at the inner end and tapering outward."""
    for s in (1, -1):
        path = []
        for j in range(12):
            u = j / 11
            x = s * (0.014 + 0.046 * u)
            y = 1.691 + 0.008 * math.sin(math.pi * (0.2 + 0.8 * u)) - 0.004 * u
            a = head_angle(x, y)
            path.append((head_point(y, a), head_normal(y, a), u))
        rings = []
        for i, (p, n, u) in enumerate(path):
            d = (path[min(i + 1, 11)][0] - path[max(i - 1, 0)][0]).normalized()
            up = n.cross(d).normalized()
            if up.y < 0:
                up = -up
            w = 0.0052 * (1 - 0.75 * u ** 1.5) + 0.0008  # (half its height)
            depth = 0.0028 * (1 - 0.5 * u)
            centre = p + n * (depth * 0.4) + up * (0.0015 * u)
            rings.append([centre + up * math.cos(t) * w + n * math.sin(t) * depth for t in (math.tau * k / 8 for k in range(8))])
        loft(h, rings, lambda i, k, c, n: tone('brow', 0.0, 0.85 + 0.25 * (k in (1, 2))), res=1)


# ---- skinning ----
def joints(arm):
    """Each bone as a segment between its joint and its child's (in the game's axes)."""
    pos = {b.name: (arm.matrix_world @ b.head_local) for b in arm.data.bones}
    game = {n: Vector((v.x, v.z, -v.y)) for n, v in pos.items()}
    ends = {'head': game['head'] + Vector((0, 0.42, 0)), 'hand_L': game['hand_L'] + Vector((0, -0.18, 0)),
            'hand_R': game['hand_R'] + Vector((0, -0.18, 0)), 'shin_L': game['shin_L'] + Vector((0, -0.45, 0)),
            'shin_R': game['shin_R'] + Vector((0, -0.45, 0)), 'hips': game['spine'], 'spine': game['head'],
            'thigh_L': game['shin_L'], 'thigh_R': game['shin_R'], 'upperarm_L': game['lowerarm_L'], 'upperarm_R': game['lowerarm_R'],
            'lowerarm_L': game['hand_L'], 'lowerarm_R': game['hand_R']}
    return {n: (game[n], ends[n]) for n in game}


def distance_to(p, seg):
    a, b = seg
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


def weights(p, bones, segs):
    ds = sorted(((distance_to(p, segs[n]) + 1e-4, n) for n in bones))[:2]
    if len(ds) == 1:
        return [(ds[0][1], 1.0)]
    (d0, n0), (d1, n1) = ds
    w0, w1 = 1 / d0 ** 4, 1 / d1 ** 4
    return [(n0, w0 / (w0 + w1)), (n1, w1 / (w0 + w1))]


def build(arm, parts):
    segs = joints(arm)
    me = bpy.data.meshes.new('player')
    bm = bmesh.new()
    col_layer = bm.loops.layers.float_color.new('Col')
    smooth_layer = bm.faces.layers.int.new('smooth')
    deform = bm.verts.layers.deform.verify()
    groups = {}
    o = bpy.data.objects.new('player', me)
    for part in parts:
        for pts, colour, smooth in part.faces:
            vs = []
            for q in pts:
                v = bm.verts.new(g(*q))
                for name, w in weights(q, part.bones, segs):
                    if name not in groups:
                        groups[name] = o.vertex_groups.new(name=name).index
                    v[deform][groups[name]] = w
                vs.append(v)
            f = bm.faces.new(vs)
            f[smooth_layer] = int(smooth)
            for idx, (loop, q) in enumerate(zip(f.loops, pts)):
                loop[col_layer] = part.corner(q) if colour is None else colour[idx] if isinstance(colour, list) else colour
    # Weld the skins, so they shade smooth across their faces (the colours are per corner,
    # and corners in the same place have the same bone weights).
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    # (The colour layer made in bmesh: make it the one the exporter writes out.)
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    sm = me.attributes['smooth'].data
    for poly in me.polygons:
        poly.use_smooth = bool(sm[poly.index].value)
    me.attributes.remove(me.attributes['smooth'])
    m = bpy.data.materials.get('player') or material('player', 0.9)
    me.materials.append(m)
    return o


# ---- put it together ----
work = bpy.data.collections.new('survivor')
bpy.context.scene.collection.children.link(work)
bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[work.name]
before, actions = set(bpy.data.objects), set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(RIG))
brought = [ob for ob in bpy.data.objects if ob not in before]
arm = next(ob for ob in brought if ob.type == 'ARMATURE')
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for side, s_ in (('L', 1), ('R', -1)):
    for bone, x in ARM_X.items():
        eb = arm.data.edit_bones[f'{bone}_{side}']
        eb.use_connect = False
        dx = s_ * x - eb.head.x
        eb.head.x += dx
        eb.tail.x += dx
bpy.ops.object.mode_set(mode='OBJECT')
for ob in [ob for ob in brought if ob.type == 'MESH' and ob.name.split('.')[0] in ('player', 'player-details', 'player-hair', 'player-pack')]:
    brought.remove(ob)
    bpy.data.objects.remove(ob)
parts = []
legs(parts)
torso(parts)
arms(parts)
head(parts)
body = build(arm, parts)
# The backpack on his back: the same mesh as backpack.glb (the one you pick up), hung on the
# spine (shown once you've found it).
before_pack = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(os.path.join(HERE, '..', 'public', 'models', 'backpack.glb')))
pack = next(ob for ob in bpy.data.objects if ob not in before_pack and ob.type == 'MESH')
for ob in [ob for ob in bpy.data.objects if ob not in before_pack and ob is not pack]:
    bpy.data.objects.remove(ob)
for coll in list(pack.users_collection):
    coll.objects.unlink(pack)
pack.data.transform(pack.matrix_world)
pack.matrix_world = Matrix.Identity(4)
pack.data.transform(Matrix.Translation(g(*PACK_ON_BACK)))
pack.vertex_groups.new(name='spine').add(range(len(pack.data.vertices)), 1.0, 'REPLACE')
pack.name = pack.data.name = 'player-pack'
for ob in (body, pack):
    work.objects.link(ob)
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    brought.append(ob)
# The game finds the parts by name ('player-pack', ...): make sure Blender hasn't numbered them.
for ob in brought:
    base = ob.name.split('.')[0]
    clash = bpy.data.objects.get(base)
    if clash and clash is not ob:
        clash.name = f'{base}-other'
    ob.name = base
    if ob.type == 'MESH':
        ob.data.name = base
bpy.ops.object.select_all(action='DESELECT')
for ob in brought:
    ob.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_apply=True,
                          export_animations=True, export_animation_mode='ACTIONS', export_skins=True)
print(f'@@ player.glb: {len(body.data.polygons)} tris in the body')
for ob in brought:
    bpy.data.objects.remove(ob)
bpy.data.collections.remove(work)
for action in [act for act in bpy.data.actions if act not in actions]:
    bpy.data.actions.remove(action)
print('@@ done')
