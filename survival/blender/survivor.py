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
import importlib
import player_anim
importlib.reload(player_anim)

OUT = os.path.join(HERE, '..', 'public', 'models', 'player.glb')
RIG = globals().get('RIG', OUT)
# The jacket's body, from its hem up to the shoulders: (height, half width, front, back).
TORSO = ((0.84, 0.205, 0.135, 0.125), (0.9, 0.195, 0.128, 0.12), (1.02, 0.18, 0.122, 0.115), (1.16, 0.184, 0.135, 0.12),
         (1.27, 0.19, 0.13, 0.125), (1.34, 0.186, 0.115, 0.115), (1.39, 0.16, 0.1, 0.105), (1.43, 0.12, 0.085, 0.095))
TORSO_POWER = 2.6
# The animations hold the right hand turned this far (radians, about x, bending it back: it was
# made to grip the axe), so the right glove is modelled turned the other way, about the wrist,
# to line up with the forearm when it plays (player.js hangs the tools on that turned hand).
RIGHT_HAND_TURN = 2 * math.asin(0.5851)
# How far out from the middle the arms' joints are (shoulder, elbow, wrist), so they hang close
# at his sides. The skeleton is moved to match (its arm bones only turn in the animations).
ARM_X = {'upperarm': 0.2, 'lowerarm': 0.212, 'hand': 0.222}
PACK_ON_BACK = (0, 0.84, -0.295)  # (game axes: where backpack.glb hangs on his back)

PAL.update(
    skin=0xc8987a, skin_shade=0xae8066, skin_rose=0xc47a6a, skin_lip=0x8a5a4c, stubble=0x5a4436, brow=0x4a3628, hair=0x4a3628,
    beard=0x4a3426, eye_white=0xbab2a6, iris=0x4e5a48, pupil=0x141210, lash=0x2a1e18, glove=0x3a3632, glove_cuff=0x2e2a28, beanie=0x2e3a52, beanie_band=0x26304a, pompom=0xd8d0c0,
    coat=0xa82a22, coat_dark=0x8a2420, coat_fold=0x96261f, lining=0xc8b07a, zip=0x2a2a2a,
    shirt=0x4e5e52, shirt_dark=0x3a463c, shirt_line=0xa89a6a, button=0x2a2420,
    trousers=0x4a4f44, trousers_dark=0x3a3e36, trousers_worn=0x5e6254, boot=0x7a5a3c, boot_dark=0x5a4029, boot_worn=0x9a7a58, sole=0x2a2420, lace=0xc8bc9e,
    scarf=0x5a6a52, scarf_dark=0x46543f, scarf_stripe=0xb08a3a,
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
        self.drape = None  # (below height, extra bones, how much they pull): see build
        self.layer = 'body'  # ('body': the player mesh, shirt and all; 'jacket': player-jacket, worn over it)

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
    """Work trousers, worn paler at the knees, bunched over tall leather boots laced up the
    front, on thick soles."""
    for s, side in ((1, 'L'), (-1, 'R')):
        p = Part(['hips', f'thigh_{side}', f'shin_{side}', f'foot_{side}'])
        x = 0.105 * s
        # The leg, a ring every 1.5 cm, creased: bunched in folds above the boot, and behind
        # the knee; a darker seam down the outside.
        table = ((0.96, 0.08, 0.095, 0.0), (0.82, 0.086, 0.094, 0.0), (0.66, 0.075, 0.08, 0.005), (0.49, 0.064, 0.07, 0.012),
                 (0.4, 0.064, 0.068, 0.0), (0.33, 0.068, 0.07, 0.0), (0.3, 0.066, 0.068, 0.0))
        table = tuple(sorted(table))  # (bottom to top, for table_params)
        rings = []
        for i in range(45):
            y = 0.96 - (0.96 - 0.3) * i / 44
            w, d, dz = table_params(table, y)
            ring = section(Vector((x, y, dz)), w, d, d, 12)
            out = []
            for k, q in enumerate(ring):
                r = q - Vector((x, y, dz))
                a_ = math.atan2(r.x * s, r.z)  # (0 at the front, + toward the outside)
                fold = 0.0
                if y < 0.45:  # (bunching above the boot)
                    fold += 0.05 * math.sin(y * 150 + a_ * 2) * (0.45 - y) / 0.15
                if 0.44 < y < 0.58 and math.cos(a_) < -0.2:  # (behind the knee)
                    fold += 0.045 * math.sin(y * 210) * (1 - abs(y - 0.51) / 0.07)
                out.append(Vector((x, y, dz)) + r * (1 + fold))
            rings.append(out)

        def trousers(q):
            r = q - Vector((x, q.y, 0))
            a_ = math.atan2(r.x * s, r.z)
            if q.y < 0.36:
                return tone('trousers_dark', 0.0, 0.95)  # (bunched over the boot)
            c = tone('trousers', 0.0)
            if abs(a_ - math.pi / 2) < 0.08:
                c = blend(c, tone('trousers_dark', 0.0, 0.8), 0.8)  # (the outside seam)
            knee = max(0.0, 1 - abs(q.y - 0.5) / 0.08) * max(0.0, math.cos(a_))
            return blend(c, tone('trousers_worn', 0.0), knee * 0.6)  # (worn at the knee)
        p.corner = trousers
        loft(p, rings, lambda i, k, c, n: None, cap_start=False, res=1)
        # A cargo pocket on the outside of the thigh, its flap and the flap's press stud.
        def thigh_point(y, a_, lift):
            w, d, dz = table_params(table, y)
            return Vector((x + math.sin(a_) * s * w * (1 + lift / w), y, dz + math.cos(a_) * d * (1 + lift / d)))
        for (y0, y1, a0, a1, lift, colour) in ((0.62, 0.75, 0.75, 1.65, 0.006, tone('trousers', 0.0, 0.95)), (0.735, 0.765, 0.72, 1.68, 0.011, tone('trousers_dark', 0.0, 0.95))):
            grid = [[thigh_point(y0 + (y1 - y0) * j / 4, a0 + (a1 - a0) * i / 6, lift) for i in range(7)] for j in range(5)]
            for j in range(4):
                for i in range(6):
                    p.add_out([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], Vector((s, 0, 0)), colour, smooth=True)
            for i in range(6):  # (its lower edge)
                p.add_out([grid[0][i], grid[0][i + 1], thigh_point(y0, a0 + (a1 - a0) * (i + 1) / 6, -0.002), thigh_point(y0, a0 + (a1 - a0) * i / 6, -0.002)], Vector((0, -1, 0)), colour)
        stud = thigh_point(0.745, 1.2, 0.013)
        p.add_out([stud + Vector((0, math.sin(t) * 0.005, math.cos(t) * 0.005)) for t in (math.tau * j / 6 for j in range(6))], Vector((s, 0, 0)), tone('zip', 0.0, 1.4))
        # The boot's shaft, from its padded top down to the ankle, then the foot to a rounded
        # toe on a thick sole.
        boot = []
        for y, w, front, back, dz in ((0.33, 0.06, 0.062, 0.062, 0.0), (0.3, 0.064, 0.066, 0.066, 0.0), (0.2, 0.058, 0.064, 0.062, 0.004), (0.12, 0.056, 0.07, 0.066, 0.008),
                                      (0.075, 0.059, 0.11, 0.072, 0.02), (0.04, 0.061, 0.165, 0.076, 0.02), (0.03, 0.064, 0.172, 0.08, 0.02), (0.0, 0.062, 0.17, 0.078, 0.02)):
            boot.append(section(Vector((x, y, dz)), w, front, back, 12, power=2.5))

        def leather(i, k, c, n):
            if c.y < 0.032:
                return tone('sole', 0.0)
            if i == 0 or (i == 1 and n.y > 0.2):
                return tone('boot_dark', 0.0, 0.9)  # (the padded top)
            worn = max(0.0, n.z) * max(0.0, 1 - c.y / 0.1)  # (scuffed paler at the toe)
            return tone('boot_worn' if worn > 0.5 else 'boot', 0.0)
        loft(p, boot, leather, cap_start=True, cap_end=True)
        # Laces: criss-crossing up the front of the shaft between hooks.
        front_z = lambda y: 0.002 + (0.066 if y > 0.2 else 0.066 + (0.2 - y) / 0.08 * 0.012) + (0.004 if y < 0.2 else 0.0)
        for k in range(6):
            y0 = 0.1 + k * 0.037
            y1 = y0 + 0.037
            for a, b in (((x - 0.02, y0), (x + 0.02, y1)), ((x + 0.02, y0), (x - 0.02, y1))):
                pa = Vector((a[0], a[1], front_z(a[1]) + 0.003))
                pb = Vector((b[0], b[1], front_z(b[1]) + 0.003))
                d = (pb - pa).normalized()
                side_ = Vector((0, 0, 1)).cross(d).normalized() * 0.0028
                p.add_out([pa - side_, pa + side_, pb + side_, pb - side_], Vector((0, 0, 1)), tone('lace', 0.0, 0.95 + 0.05 * k / 6))
            for hx in (x - 0.022, x + 0.022):  # (the hooks)
                c_ = Vector((hx, y0, front_z(y0) + 0.002))
                p.add_out([c_ + Vector((math.cos(t) * 0.004, math.sin(t) * 0.004, 0)) for t in (math.tau * j / 6 for j in range(6))], Vector((0, 0, 1)), tone('zip', 0.0, 1.3))
        parts.append(p)


def scarf(parts):
    """A chunky knitted scarf wound twice round the neck over the collar, one end hanging down
    the chest, a stripe near its end and a short fringe. (It comes with the jacket.)"""
    p = Part(['spine'])
    p.layer = 'jacket'

    def wrap(cy, rx, rz, tube, tilt, lumps):
        rings = []
        for i in range(64):
            a = math.tau * i / 64
            c = Vector((math.sin(a) * rx, cy + tilt * math.cos(a), math.cos(a) * rz - 0.005))
            out = Vector((math.sin(a), 0, math.cos(a)))
            ring = []
            for k in range(14):
                t = math.tau * k / 14
                rib = 1 + 0.07 * math.cos(i * math.pi / 2)  # (knitted rows)
                r = tube * rib * (1 + lumps * math.sin(a * 7 + t * 2) * math.sin(a * 3 + 1.7))
                ring.append(c + (out * math.cos(t) * 1.15 + Vector((0, 1, 0)) * math.sin(t) * 0.85) * r)
            rings.append(ring)
        rings.append(rings[0])
        loft(p, rings, lambda i, k, c, n: tone('scarf', 0.0, 0.84 + 0.16 * (i % 2) + 0.05 * math.sin(i * 0.4)), cap_start=False, cap_end=False, res=1)
    wrap(1.435, 0.095, 0.092, 0.03, -0.012, 0.12)
    wrap(1.475, 0.085, 0.084, 0.027, 0.01, 0.1)
    # The end hanging down the front, off to his left, following the chest.
    rows = []
    ys = [1.45 - 0.37 * i / 24 for i in range(25)]
    for j, y in enumerate(ys):
        t = j / 24
        cx = 0.045 + 0.012 * t
        row = []
        for u in (-1.0, -0.5, 0.0, 0.5, 1.0):
            px = cx + u * 0.055 * (1 - 0.1 * t)
            pz = max(jacket_front(px, y), 0.09) + 0.016 + 0.008 * (1 - u * u)
            if y > 1.38:
                pz = 0.12 + 0.01 * (1 - u * u)  # (over the wraps)
            row.append(Vector((px, y, pz)))
        rows.append(row)
    def knit(i, k, c, n):
        stripe = 1.12 < c.y < 1.15 or 1.17 < c.y < 1.19
        return tone('scarf_stripe' if stripe else 'scarf', 0.0, 0.86 + 0.16 * (i % 2))
    for j in range(len(rows) - 1):
        for k in range(4):
            q = [rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]]
            c = sum(q, Vector()) / 4
            p.add_out(q, Vector((0, 0, 1)), knit(j, k, c, None), smooth=True)
            back = [v - Vector((0, 0, 0.016)) for v in q]
            p.add_out(back[::-1], Vector((0, 0, -1)), tone('scarf_dark', 0.0))
    for k in range(4):  # (its edges)
        pass
    for j in range(len(rows) - 1):
        for k in (0, 4):
            a, b = rows[j][k], rows[j + 1][k]
            p.add_out([a, b, b - Vector((0, 0, 0.016)), a - Vector((0, 0, 0.016))], Vector((1 if k else -1, 0, 0)), tone('scarf_dark', 0.0))
    # The fringe.
    for k in range(9):
        u = -1 + 2 * k / 8
        top = Vector((rows[-1][0].x + (rows[-1][4].x - rows[-1][0].x) * (k / 8), rows[-1][0].y, rows[-1][2].z - 0.006))
        tip = top + Vector((0.002 * u, -0.035 - 0.006 * math.sin(k * 2.3), 0.002))
        side_ = Vector((0.0035, 0, 0))
        p.add_out([top - side_, top + side_, tip + side_ * 0.5, tip - side_ * 0.5], Vector((0, 0, 1)), tone('scarf_dark', 0.0, 1.05))
    parts.append(p)


# The jacket is an insulated, quilted one: its body and sleeves puffed out between stitched
# seams (BAFFLE apart), a smooth yoke over the shoulders, an elastic band at the hem, a storm
# flap over the zip, slash hand-warmer pockets and a zipped chest pocket.
BAFFLE = 0.1  # (meters between the stitched seams)
QUILT = (0.9, 1.3)  # (the quilted part of the body, between the hem band and the yoke)


def puff(y, lo=QUILT[0], hi=QUILT[1], amount=0.035):
    """How much the jacket swells at height y: full in the middle of a baffle, drawn in at its
    stitched seams; 1 outside the quilted part."""
    if not lo <= y <= hi:
        return 1.0
    b = (y - lo) / BAFFLE
    seam = abs(math.cos(math.pi * b)) ** 6  # (1 on a seam)
    edge = min(1.0, (y - lo) / 0.02, (hi - y) / 0.02)
    return 1 + amount * (1 - seam) * edge - amount * 0.3 * seam * edge


def seam_at(y, lo=QUILT[0], hi=QUILT[1]):
    return lo <= y <= hi and abs(math.cos(math.pi * (y - lo) / BAFFLE)) ** 6 > 0.55


SHIRT = ((0.8, 0.19, 0.122, 0.116), (0.9, 0.18, 0.116, 0.11), (1.02, 0.167, 0.112, 0.105), (1.16, 0.171, 0.122, 0.11),
         (1.27, 0.177, 0.118, 0.115), (1.34, 0.17, 0.105, 0.105), (1.39, 0.143, 0.09, 0.095), (1.43, 0.098, 0.075, 0.085))


def plaid_at(across, up):
    """The shirt's check at a point `across` the cloth and `up` it (meters): dark bands
    crossing, a thin pale line between them; softened at the edges (colours are per corner)."""
    w = 0.055
    a, b = (across / w) % 1.0, ((up + 0.013) / w) % 1.0
    soft = lambda t, lo, hi: max(0.0, min(1.0, (t - lo) / 0.06)) * max(0.0, min(1.0, (hi - t) / 0.06))
    dark = soft(a, 0.0, 0.36) + soft(b, 0.0, 0.36)
    col = tone('shirt', 0.0, 1.0 - 0.2 * dark)
    line = max(soft(a, 0.55, 0.64), soft(b, 0.55, 0.64))
    return blend(col, tone('shirt_line', 0.0), line * 0.6)


def plaid(c, n=None):
    """The check on the shirt's body (round it, and up it)."""
    return plaid_at(math.atan2(c.x, c.z) * 0.14, c.y)


def shirt(parts):
    p = Part(['hips', 'spine'])
    p.drape = (0.97, ['thigh_L', 'thigh_R'], 0.55)
    ys = [SHIRT[0][0] + (SHIRT[-1][0] - SHIRT[0][0]) * i / 39 for i in range(40)]
    rings = []
    for y in ys:
        w, front, back = table_params(SHIRT, y)
        rings.append(section(Vector((0, y, 0)), w, front, back, 18, power=TORSO_POWER))
    p.corner = lambda q: tone('shirt_dark', 0.0) if q.y < 0.81 else plaid(q)
    loft(p, rings, lambda i, k, c, n: None, cap_start=True, cap_end=False, res=1)
    # The collar, folded down round the neck.
    collar = [section(Vector((0, y, 0.0)), w, f, b, 14, power=2.2) for y, w, f, b in ((1.42, 0.1, 0.078, 0.088), (1.47, 0.068, 0.064, 0.07), (1.5, 0.066, 0.062, 0.07), (1.465, 0.082, 0.078, 0.084))]
    # (standing higher round the back of the neck, open at the throat)
    collar = [[q + Vector((0, 0.03 * max(0.0, -q.z) / 0.07 * min(i, 2) / 2, 0)) for q in ring] for i, ring in enumerate(collar)]
    loft(p, collar, lambda i, k, c, n: None, cap_start=False, cap_end=False)
    # The placket down the front, and its buttons.
    shirt_front = lambda x, y: front_of(SHIRT, x, y)
    on_surface(p, shirt_front, -0.013, 0.013, 0.83, 1.42, 0.003, tone('shirt', 0.0, 0.9), rows=30, cols=2)
    for y in (0.88, 0.97, 1.06, 1.15, 1.24, 1.33):
        on_surface(p, shirt_front, -0.005, 0.005, y - 0.005, y + 0.005, 0.005, tone('button', 0.0), rows=2, cols=2)
    parts.append(p)


def table_params(table, y):
    ys = [t[0] for t in table]
    y = max(ys[0], min(ys[-1], y))
    i = max(0, min(len(ys) - 2, next(j for j in range(len(ys) - 1) if y <= ys[j + 1])))
    t = (y - ys[i]) / (ys[i + 1] - ys[i])
    at = lambda j: table[max(0, min(len(table) - 1, j))]
    return [curve(at(i - 1)[k], at(i)[k], at(i + 1)[k], at(i + 2)[k], t) for k in (1, 2, 3)]


def front_of(table, x, y):
    w, front, _ = table_params(table, y)
    sx = min(1.0, abs(x) / w) ** (TORSO_POWER / 2)
    return math.sqrt(max(0.0, 1 - sx * sx)) ** (2 / TORSO_POWER) * front


def on_surface(part, front, x0, x1, y0, y1, lift, colour, cols=6, rows=6):
    """A patch over a front (front(x, y) -> how far forward it is), standing `lift` off it."""
    pt = lambda x, y, up: Vector((x, y, front(x, y) + up))
    grid = [[pt(x0 + (x1 - x0) * i / cols, y0 + (y1 - y0) * j / rows, lift) for i in range(cols + 1)] for j in range(rows + 1)]
    fwd = Vector((0, 0, 1))
    for j in range(rows):
        for i in range(cols):
            part.add_out([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], fwd, colour)
    edge = [(i, 0) for i in range(cols + 1)] + [(cols, j) for j in range(1, rows + 1)] + [(i, rows) for i in range(cols - 1, -1, -1)] + [(0, j) for j in range(rows - 1, 0, -1)]
    mid = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    for (i0, j0), (i1, j1) in zip(edge, edge[1:] + edge[:1]):
        a, b = grid[j0][i0], grid[j1][i1]
        a0, b0 = pt(a.x, a.y, -0.003), pt(b.x, b.y, -0.003)
        part.add_out([a, b, b0, a0], Vector((a.x + b.x - 2 * mid.x, a.y + b.y - 2 * mid.y, 0)), colour)


def torso_params(y):
    ys = [t[0] for t in TORSO]
    y = max(ys[0], min(ys[-1], y))
    i = max(0, min(len(ys) - 2, next(j for j in range(len(ys) - 1) if y <= ys[j + 1])))
    t = (y - ys[i]) / (ys[i + 1] - ys[i])
    at = lambda j: TORSO[max(0, min(len(TORSO) - 1, j))]
    return [curve(at(i - 1)[k], at(i)[k], at(i + 1)[k], at(i + 2)[k], t) for k in (1, 2, 3)]


def torso(parts):
    p = Part(['hips', 'spine'])
    p.layer = 'jacket'
    p.drape = (0.97, ['thigh_L', 'thigh_R'], 0.55)  # (below the hips, the jacket half follows the thighs)
    # The body: rings every centimetre, each puffed by its place in the quilting.
    ys = [TORSO[0][0] + (TORSO[-1][0] - TORSO[0][0]) * i / 59 for i in range(60)]
    rings = []
    for y in ys:
        w, front, back = torso_params(y)
        k = puff(y)
        band = 0.97 if y < 0.88 else 1.0  # (the hem band, drawn in a little)
        rings.append(section(Vector((0, y, 0)), w * k * band, front * k * band, back * k * band, 20, power=TORSO_POWER))

    def coat(i, k_, c, n):
        y = c.y
        if y < 0.88:
            return tone('coat_dark', 0.0, 0.95)  # (the hem band)
        if seam_at(y):
            return tone('coat_fold', 0.0, 0.92)  # (the stitched seams)
        if y > QUILT[1] + 0.01:
            return tone('coat', 0.0, 0.97)  # (the yoke)
        return tone('coat', 0.0, 1.0 + 0.04 * (0.5 - abs(math.cos(math.pi * (y - QUILT[0]) / BAFFLE))))
    loft(p, rings, coat, cap_start=True, cap_end=False, res=1)
    # The seam across the top of the yoke, where it meets the quilting.
    # The high collar, zipped up snug round the neck, standing higher at the back.
    collar = [section(Vector((0, y, 0.0)), w, f, b, 14, power=2.2) for y, w, f, b in ((1.38, 0.13, 0.09, 0.1), (1.44, 0.088, 0.072, 0.086), (1.5, 0.077, 0.066, 0.08), (1.54, 0.079, 0.068, 0.082))]
    collar = [[q + Vector((0, 0.035 * max(0.0, -q.z) / 0.08 * (i / 3), 0)) for q in ring] for i, ring in enumerate(collar)]
    loft(p, collar, lambda i, k, c, n: tone('coat_dark' if i >= 2 else 'coat', 0.0), cap_start=False, cap_end=False)
    # The hood, rolled up and stowed at the back of the collar: a soft, low roll.
    hood = [section(Vector((0, y, -0.075)), w, f, b, 12, power=2.0) for y, w, f, b in ((1.385, 0.115, 0.03, 0.05), (1.43, 0.13, 0.035, 0.058), (1.47, 0.12, 0.03, 0.05), (1.495, 0.09, 0.02, 0.032))]
    loft(p, hood, lambda i, k, c, n: tone('coat_fold' if n.y < 0 else 'coat', 0.0), cap_end=True)
    # The storm flap down the front, the zip pull at its top, and its press studs.
    on_jacket(p, -0.016, 0.016, 0.85, 1.41, 0.006, tone('coat', 0.0, 0.93), rows=40, cols=3)
    on_jacket(p, 0.014, 0.017, 0.85, 1.41, 0.0065, tone('coat_fold', 0.0, 0.8), rows=40, cols=1)  # (its stitched edge)
    for y in (0.93, 1.03, 1.13, 1.23, 1.33):
        on_jacket(p, -0.005, 0.005, y - 0.005, y + 0.005, 0.009, tone('zip', 0.0, 1.6), rows=2, cols=2)
    for s in (1, -1):
        # Slash hand-warmer pockets: a slanting welt, darker in its opening; and the chest
        # pocket's zip, slanting the other way.
        slant(p, Vector((s * 0.07, 0.92, 0)), Vector((s * 0.118, 1.025, 0)), 0.007, 0.004, tone('coat_fold', 0.0, 0.7))
        slant(p, Vector((s * 0.035, 1.19, 0)), Vector((s * 0.09, 1.215, 0)), 0.004, 0.004, tone('zip', 0.0, 1.2))
    parts.append(p)


def slant(part, a, b, half_width, lift, colour, steps=10):
    """A narrow strip from a to b (x, y on the jacket's front), lying on its surface."""
    d = (b - a).normalized()
    side = Vector((-d.y, d.x, 0)) * half_width
    pt = lambda q, up: Vector((q.x, q.y, jacket_front(q.x, q.y) + up))
    for i in range(steps):
        q0, q1 = a.lerp(b, i / steps), a.lerp(b, (i + 1) / steps)
        quad = [pt(q0 - side, lift), pt(q1 - side, lift), pt(q1 + side, lift), pt(q0 + side, lift)]
        part.add_out(quad, Vector((0, 0, 1)), colour, smooth=True)
        for e0, e1 in ((q0 - side, q1 - side), (q1 + side, q0 + side)):
            part.add_out([pt(e0, lift), pt(e1, lift), pt(e1, -0.002), pt(e0, -0.002)], Vector((e0.x - a.x, e0.y - a.y, 0)) if False else Vector((0, 0, 1)), colour)


def jacket_front(x, y):
    """How far forward the jacket's front is at x, y (the same shape the loft makes)."""
    w, front, _ = torso_params(y)
    k = puff(y) * (0.97 if y < 0.88 else 1.0)
    w, front = w * k, front * k
    sx = min(1.0, abs(x) / w) ** (TORSO_POWER / 2)
    return math.sqrt(max(0.0, 1 - sx * sx)) ** (2 / TORSO_POWER) * front


def on_jacket(part, x0, x1, y0, y1, lift, colour, cols=6, rows=6):
    """A patch over the jacket's front from x0..x1, y0..y1, standing `lift` off it, with its
    edges down to the cloth."""
    pt = lambda x, y, up: Vector((x, y, jacket_front(x, y) + up))
    grid = [[pt(x0 + (x1 - x0) * i / cols, y0 + (y1 - y0) * j / rows, lift) for i in range(cols + 1)] for j in range(rows + 1)]
    fwd = Vector((0, 0, 1))
    for j in range(rows):
        for i in range(cols):
            part.add_out([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], fwd, colour)
    edge = [(i, 0) for i in range(cols + 1)] + [(cols, j) for j in range(1, rows + 1)] + [(i, rows) for i in range(cols - 1, -1, -1)] + [(0, j) for j in range(rows - 1, 0, -1)]
    mid = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    for (i0, j0), (i1, j1) in zip(edge, edge[1:] + edge[:1]):
        a, b = grid[j0][i0], grid[j1][i1]
        a0, b0 = pt(a.x, a.y, -0.003), pt(b.x, b.y, -0.003)
        out = Vector((a.x + b.x - 2 * mid.x, a.y + b.y - 2 * mid.y, 0))
        part.add_out([a, b, b0, a0], out, colour)


def arms(parts):
    for s, side in ((1, 'L'), (-1, 'R')):
        p = Part(['spine', f'upperarm_{side}', f'lowerarm_{side}', f'hand_{side}'])
        shoulder, elbow, wrist = Vector((ARM_X['upperarm'] * s, 1.36, 0)), Vector((ARM_X['lowerarm'] * s, 1.04, -0.01)), Vector((ARM_X['hand'] * s, 0.8, 0.0))
        # (The sleeve starts inside the shoulder and rounds into it, not perched on top.)
        def sleeve(a, b, base, n):
            # (radii along it, each swelled by the quilting: baffles every BAFFLE along the arm)
            out = []
            for j in range(n + 1):
                t = j / n
                w, d = curve(base[max(0, int(t * (len(base) - 1)) - 1)], base[int(t * (len(base) - 1))], base[min(len(base) - 1, int(t * (len(base) - 1)) + 1)], base[min(len(base) - 1, int(t * (len(base) - 1)) + 2)], t * (len(base) - 1) - int(t * (len(base) - 1))) if False else (None, None)
                f = t * (len(base) - 1)
                i0 = min(len(base) - 2, int(f))
                u = f - i0
                w = base[i0][0] + (base[i0 + 1][0] - base[i0][0]) * u
                d = base[i0][1] + (base[i0 + 1][1] - base[i0][1]) * u
                along = (a - b).length * t
                k = puff(along, 0.03, (a - b).length - 0.03, 0.09)
                out.append((w * k, d * k))
            return out
        quilt = lambda i, k, c, n: tone('coat', 0.0, 1.0)
        p.layer = 'jacket'
        # The shirt's sleeve, under the jacket's: plaid wool, buttoned at the wrist.
        sh = Part(['spine', f'upperarm_{side}', f'lowerarm_{side}', f'hand_{side}'])
        sh.corner = lambda q, s=s: plaid_at(math.atan2(q.z, (q.x - ARM_X['lowerarm'] * s) * s) * 0.05, q.y)
        tube_between(sh, shoulder + Vector((-0.05 * s, -0.035, 0)), elbow, [(0.04, 0.044), (0.05, 0.05), (0.049, 0.048), (0.046, 0.045)], lambda i, k, c, n: None, sides=9, cap_start=False)
        tube_between(sh, elbow + Vector((0, 0.02, 0)), wrist + Vector((0, 0.025, 0)), [(0.046, 0.045), (0.042, 0.041), (0.038, 0.037)], lambda i, k, c, n: None, sides=9, cap_start=False)
        tube_between(sh, wrist + Vector((0, 0.055, 0)), wrist + Vector((0, 0.015, 0)), [(0.041, 0.04), (0.04, 0.039)], lambda i, k, c, n: tone('shirt_dark', 0.0), sides=9)
        parts.append(sh)
        upper_a = shoulder + Vector((-0.06 * s, -0.04, 0))
        tube_between(p, upper_a, elbow, sleeve(upper_a, elbow, [(0.045, 0.05), (0.068, 0.066), (0.068, 0.065), (0.063, 0.06), (0.058, 0.056)], 18), quilt, sides=9, cap_start=False)
        lower_a, lower_b = elbow + Vector((0, 0.02, 0)), wrist + Vector((0, 0.02, 0))
        tube_between(p, lower_a, lower_b, sleeve(lower_a, lower_b, [(0.06, 0.058), (0.055, 0.052), (0.05, 0.048)], 14), quilt, sides=9, cap_start=False)
        # (The jacket's elastic cuff, on the jacket.)
        tube_between(p, wrist + Vector((0, 0.05, 0)), wrist - Vector((0, 0.01, 0)), [(0.054, 0.052), (0.05, 0.048)], lambda i, k, c, n: tone('coat_dark', 0.02), sides=9)  # cuff
        # The hand, in a wool glove: a palm, the fingers together and curled a little, a thumb.
        h = Part([f'hand_{side}'])
        glove = lambda i, k, c, n: tone('glove', 0.0, 0.9 if n.y < -0.5 else 1.0)
        tube_between(h, wrist + Vector((0, 0.03, 0)), wrist - Vector((0, 0.015, 0)), [(0.05, 0.046), (0.046, 0.042), (0.04, 0.032)], lambda i, k, c, n: tone('glove_cuff', 0.0, 0.92 if k % 2 else 1.0), sides=9)
        # (Hanging relaxed: the palm toward the thigh, so the hand is broad seen from the side
        # and narrow from the front; the fingers curl a little in toward the leg, the thumb
        # lies along the front of the hand.)
        tube_between(h, wrist - Vector((0, 0.01, 0)), wrist + Vector((-0.004 * s, -0.095, 0.004)), [(0.025, 0.037), (0.023, 0.045), (0.021, 0.044)], glove, sides=10)
        for z, length in ((0.027, 0.07), (0.009, 0.078), (-0.008, 0.073), (-0.024, 0.06)):
            knuckle = wrist + Vector((-0.004 * s, -0.092, 0.004 + z))
            middle = knuckle + Vector((-0.008 * s, -length * 0.55, -0.002))
            tip = middle + Vector((-0.012 * s, -length * 0.45, -0.008))
            tube_between(h, knuckle, middle, [0.0115, 0.0105], glove, sides=7)
            tube_between(h, middle, tip, [0.0105, 0.0095, 0.0075], glove, sides=7)
        tube_between(h, wrist + Vector((-0.008 * s, -0.03, 0.03)), wrist + Vector((-0.016 * s, -0.095, 0.042)), [0.016, 0.014, 0.012, 0.008], glove, sides=8)
        if side == 'R':
            c, sn = math.cos(-RIGHT_HAND_TURN), math.sin(-RIGHT_HAND_TURN)
            turn = lambda q: wrist + Vector((q.x - wrist.x, (q.y - wrist.y) * c - (q.z - wrist.z) * sn, (q.y - wrist.y) * sn + (q.z - wrist.z) * c))
            h.faces = [([turn(q) for q in pts], colour, smooth) for pts, colour, smooth in h.faces]
        parts += [p, h]


# The head is a dense surface, sculpted: its outline from PROFILE (rings from the chin up:
# height, half width, front, back, how far the front sits forward), then pushed in and out for
# the eye sockets, brow ridge, cheekbones, mouth and chin (relief). The beard, moustache, brows
# and the hair under the beanie are sculpted over that surface, groomed into clumps.
HEAD_CZ = 0.005
PROFILE = ((1.505, 0.032, 0.055, 0.02, 0.04), (1.54, 0.07, 0.085, 0.06, 0.012), (1.575, 0.082, 0.1, 0.085, 0.0),
           (1.615, 0.09, 0.104, 0.098, 0.0), (1.655, 0.096, 0.1, 0.105, 0.0), (1.695, 0.098, 0.104, 0.106, 0.0),
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
    if abs(q.x) > 0.098:  # (the ear: its hollow darker toward the middle, the rim lighter)
        d = math.hypot((q.y - 1.662) / 0.026, (q.z + 0.02) / 0.016)
        c = blend(c, tone('skin_shade', 0.0, 0.7), (1 - d) * 1.4 * min(1.0, (abs(q.x) - 0.098) / 0.01))
    return c


def head(parts):
    p = Part(['spine', 'head'])
    # The neck (stubble up its front, under the beard).
    tube_between(p, (0, 1.4, -0.005), (0, 1.53, 0.0), [(0.062, 0.06), (0.057, 0.056)],
                 lambda i, k, c, n: tone('stubble' if c.y > 1.47 and n.z > 0.2 else 'skin_shade', 0.004), sides=8)
    h = Part(['head'])
    ys = [1.505 + (1.805 - 1.505) * i / 33 for i in range(34)]
    sides = 36
    rings = [[head_point(y, math.tau * k / sides) for k in range(sides)] for y in ys]

    h.corner = skin_colour
    loft(h, rings, lambda i, k, c, n: None, res=1)

    # The nose: rings from the bridge down to its tip, its back sunk into the face.
    nose = []
    for y, w, out, back in ((1.676, 0.0062, -0.003, 0.012), (1.665, 0.0071, 0.003, 0.013), (1.651, 0.0083, 0.009, 0.015),
                            (1.637, 0.0096, 0.0145, 0.016), (1.625, 0.0114, 0.019, 0.017), (1.614, 0.0128, 0.0208, 0.018),
                            (1.606, 0.0125, 0.0185, 0.018), (1.6, 0.0104, 0.0125, 0.016), (1.597, 0.007, 0.005, 0.014)):
        z = head_point(y, 0.0).z
        nose.append(section(Vector((0, y, z)), w, out, back, 10, power=2.2))
    loft(h, nose, lambda i, k, c, n: None, cap_start=False)
    for s in (1, -1):  # (the wings of the nose, either side of the tip)
        wing = Vector((0.0105 * s, 1.604, head_point(1.604, 0.0).z + 0.002))
        rings = [section(wing + Vector((0, dy, 0)), w, f, 0.006, 8, power=2.0) for dy, w, f in ((0.007, 0.0015, 0.0005), (0.003, 0.0048, 0.0042), (-0.002, 0.0048, 0.0042), (-0.005, 0.0015, 0.0005))]
        loft(h, rings, lambda i, k, c, n: None)
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
        W, UP, DOWN = 0.0172, 0.0084, 0.0062
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
        h.add_out(disc(0.0071, 0.0005, 16), fwd, tone('iris', 0.0))
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
        tube_between(h, (0.088 * s, 1.662, -0.012), (0.111 * s, 1.666, -0.024), [(0.026, 0.016), (0.031, 0.02), (0.029, 0.018), (0.02, 0.012)],
                     lambda i, k, c, n: None, sides=10)

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
        (1.745, 0.1, 0.104, 0.11, 0.025), (1.785, 0.098, 0.101, 0.108, 0.028), (1.825, 0.09, 0.092, 0.099, 0.03),
        (1.858, 0.073, 0.075, 0.081, 0.03), (1.88, 0.048, 0.05, 0.054, 0.025), (1.893, 0.02, 0.02, 0.022, 0.01), (1.896, 0.004, 0.004, 0.004, 0.0))]
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
        # (A crescent: its top tucked under the nose, its ends drooping past the corners of
        # the mouth into the beard; fullest in the middle of each side.)
        a = -0.55 + 1.1 * j / mcols
        t = abs(a) / 0.55
        top, bottom = 1.597 - 0.006 * t * t, 1.584 - 0.02 * t ** 1.6
        y = bottom + (top - bottom) * u
        p, n = head_point(y, a), head_normal(y, a)
        fade = (1 - u) ** 0.45 * (1 - t ** 3) * min(1.0, 0.35 + abs(a) * 5)
        return p, n, 0.001 + 0.0068 * fade, 0.0035 * (1 - u) ** 2
    groomed(h, (10, mcols), mat, lambda u, ridge: tone('beard', 0.0, 0.68 + 0.32 * ridge * (0.4 + 0.6 * u) + random.uniform(-0.03, 0.03)), clump=3.0, wave=0.8, tips=0.0025)


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
            'hand_R': game['hand_R'] + Vector((0, -0.18, 0)), 'shin_L': game['foot_L'], 'shin_R': game['foot_R'],
            'foot_L': game['foot_L'] + Vector((0, -0.06, 0.17)), 'foot_R': game['foot_R'] + Vector((0, -0.06, 0.17)), 'hips': game['spine'], 'spine': game['head'],
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


def build(arm, parts, layer='body', name='player'):
    segs = joints(arm)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    col_layer = bm.loops.layers.float_color.new('Col')
    smooth_layer = bm.faces.layers.int.new('smooth')
    deform = bm.verts.layers.deform.verify()
    groups = {}
    o = bpy.data.objects.new(name, me)
    for part in [part for part in parts if part.layer == layer]:
        for pts, colour, smooth in part.faces:
            vs = []
            for q in pts:
                v = bm.verts.new(g(*q))
                bones = part.bones
                if part.drape and q.y < part.drape[0]:
                    bones = bones + part.drape[1]
                ws = weights(q, bones, segs)
                if part.drape and q.y < part.drape[0]:
                    ws = [(n_, w_ * (part.drape[2] if n_ in part.drape[1] else 1.0)) for n_, w_ in ws]
                    total = sum(w_ for _, w_ in ws)
                    ws = [(n_, w_ / total) for n_, w_ in ws]
                for name, w in ws:
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
    # Painted edge light: lighter where the surface turns outward (ridges, seams, the rims of
    # folds), as a painter catches them; the hollows are darkened by bake_shade.
    bm.normal_update()
    for v in bm.verts:
        if not v.link_edges:
            continue
        bend = sum((e.other_vert(v).co - v.co).normalized().dot(v.normal) for e in v.link_edges if (e.other_vert(v).co - v.co).length > 1e-6) / len(v.link_edges)
        light = 1 + 0.32 * max(0.0, min(1.0, -bend * 2.5))
        for loop in v.link_loops:
            c = loop[col_layer]
            loop[col_layer] = (min(1.0, c[0] * light), min(1.0, c[1] * light), min(1.0, c[2] * light), 1.0)
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


def bake_shade(o, reach=0.14, depth=0.8):
    """Darkens the colours where the surface is tucked away (creases, armpits, under the
    collar and the beard, between the baffles, where one layer meets another): ambient
    occlusion baked into the vertex colours, reaching `reach` meters, at most `depth` darker."""
    scene = bpy.context.scene
    engine = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 256
    if not scene.world:
        scene.world = bpy.data.worlds.new('bake')
    scene.world.light_settings.distance = reach
    me = o.data
    col = me.color_attributes.get('Col') or me.color_attributes.active_color or me.color_attributes[0]
    name = col.name
    if col.domain != 'CORNER' or col.data_type != 'FLOAT_COLOR':  # (bake into a copy we can read per corner)
        values = [tuple(v.color) for v in col.data]
        domain = col.domain
        me.color_attributes.remove(col)
        col = me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
        for poly in me.polygons:
            for li in poly.loop_indices:
                col.data[li].color = values[me.loops[li].vertex_index if domain == 'POINT' else li]
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    # (Averaged over each vertex's corners: smooth, not speckled.)
    per_vertex = {}
    for loop, a in zip(me.loops, ao.data):
        per_vertex.setdefault(loop.vertex_index, []).append(a.color[0])
    occlusion = {v: sum(x) / len(x) for v, x in per_vertex.items()}
    for loop, c in zip(me.loops, col.data):
        r, g_, b = c.color[0], c.color[1], c.color[2]
        skin = r > 0.2 and g_ > 0.09 and g_ / max(r, 1e-6) > 0.38 and b / max(r, 1e-6) < 0.75  # (skin: only lightly)
        k = 1 - (depth * 0.3 if skin else depth) * (1 - occlusion[loop.vertex_index])
        c.color = (c.color[0] * k, c.color[1] * k, c.color[2] * k, 1.0)
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes[name]
    me.color_attributes.render_color_index = me.color_attributes.find(name)
    scene.render.engine = engine


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
# The animations, authored fresh (player_anim.py; it adds the foot bones too). Any older copies
# of them in the file go, so only these are exported.
CLIPS = ('idle', 'walk', 'sneak', 'crouch', 'jump', 'chop', 'drink', 'swim', 'die')
player_anim.animate(arm, [act for act in bpy.data.actions if act.name.split('.')[0] in CLIPS])
for ob in [ob for ob in brought if ob.type == 'MESH' and ob.name.split('.')[0] in ('player', 'player-details', 'player-hair', 'player-pack', 'player-jacket')]:
    brought.remove(ob)
    bpy.data.objects.remove(ob)
parts = []
legs(parts)
shirt(parts)
torso(parts)
scarf(parts)
arms(parts)
head(parts)
body = build(arm, parts)
jacket = build(arm, parts, 'jacket', 'player-jacket')
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
for ob in (body, jacket, pack):
    work.objects.link(ob)
    if ob is not pack:
        bake_shade(ob)
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
