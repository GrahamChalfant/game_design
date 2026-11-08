# Builds the player (player.glb): a survivor with realistic proportions, in faceted low poly.
# A shaped head (jaw, cheekbones, brow, nose, ears, eyes, stubble) under a beanie; a red hooded
# jacket with a high collar, zip, pockets and cuffs; work trousers; leather boots; bare hands.
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
from mathutils import Vector
from kit import PAL, Builder, g, material

OUT = os.path.join(HERE, '..', 'public', 'models', 'player.glb')
RIG = globals().get('RIG', OUT)

PAL.update(
    skin=0xc8987a, skin_shade=0xa87a5e, skin_lip=0x9a6450, stubble=0x6e5444, brow=0x3e2e24, hair=0x4a3628,
    eye_white=0xd8d2c8, iris=0x3a4a52, beanie=0x2e3a52, beanie_band=0x26304a, pompom=0xd8d0c0,
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
        self.faces = []  # ([points], colour)

    def add(self, pts, colour, smooth=True):
        self.faces.append((list(pts), colour, smooth))


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


def loft(part, rings, colour, cap_start=True, cap_end=True):
    """Skins the rings, RES rows between each pair along a smooth curve; colour(i, k, centre,
    normal) gets the span i of the original rings, so colours keep to the shape's own bands."""
    n = len(rings[0])
    rows, span = [], []
    for i in range(len(rings) - 1):
        r0, r1, r2, r3 = rings[max(i - 1, 0)], rings[i], rings[i + 1], rings[min(i + 2, len(rings) - 1)]
        for j in range(RES):
            t = j / RES
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
            part.add(quad, colour(span[i], k // RES, centre, normal))
    for ring, other, cap in ((rings[0], middles[1], cap_start), (rings[-1], middles[-2], cap_end)):
        if not cap:
            continue
        c = sum(ring, Vector()) / n
        out = (c - other).normalized()
        for k in range(n):
            tri = [c, ring[k], ring[(k + 1) % n]]
            if (tri[1] - tri[0]).cross(tri[2] - tri[0]).dot(out) < 0:
                tri = tri[::-1]
            part.add(tri, colour(0 if other is middles[1] else len(rings) - 2, k // RES, c, out))


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
    for y, w, front, back in ((0.84, 0.205, 0.13, 0.12), (0.9, 0.2, 0.125, 0.12), (1.02, 0.19, 0.12, 0.115), (1.16, 0.205, 0.135, 0.12),
                              (1.27, 0.225, 0.13, 0.125), (1.34, 0.235, 0.115, 0.115), (1.39, 0.2, 0.1, 0.105), (1.43, 0.13, 0.085, 0.095)):
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
    box(p, (-0.012, 0.84, 0.12), (0.012, 1.42, 0.14), tone('zip'))
    for s in (1, -1):
        box(p, (s * 0.06 - 0.055, 0.9, 0.118), (s * 0.06 + 0.055, 1.0, 0.132), tone('coat_dark'))
        box(p, (s * 0.1 - 0.045, 1.17, 0.13), (s * 0.1 + 0.045, 1.24, 0.142), tone('coat_dark'))
    parts.append(p)


def arms(parts):
    for s, side in ((1, 'L'), (-1, 'R')):
        p = Part(['spine', f'upperarm_{side}', f'lowerarm_{side}', f'hand_{side}'])
        shoulder, elbow, wrist = Vector((0.27 * s, 1.37, 0)), Vector((0.305 * s, 1.04, -0.01)), Vector((0.315 * s, 0.8, 0.0))
        # (The sleeve starts inside the shoulder and rounds into it, not perched on top.)
        tube_between(p, shoulder + Vector((-0.06 * s, 0.0, 0)), elbow, [(0.06, 0.058), (0.072, 0.068), (0.066, 0.063), (0.058, 0.056)], lambda i, k, c, n: tone('coat'), sides=9, cap_start=False)
        tube_between(p, elbow + Vector((0, 0.02, 0)), wrist + Vector((0, 0.02, 0)), [(0.06, 0.058), (0.055, 0.052), (0.05, 0.048)], lambda i, k, c, n: tone('coat'), sides=9, cap_start=False)
        tube_between(p, wrist + Vector((0, 0.05, 0)), wrist - Vector((0, 0.01, 0)), [(0.054, 0.052), (0.05, 0.048)], lambda i, k, c, n: tone('coat_dark', 0.02), sides=9)  # cuff
        # The hand: a palm narrowing to the fingers, and a thumb, hanging relaxed.
        h = Part([f'hand_{side}'])
        tube_between(h, wrist, wrist + Vector((0.005 * s, -0.09, 0.012)), [(0.032, 0.022), (0.042, 0.02), (0.04, 0.018)], lambda i, k, c, n: tone('skin_shade' if n.y < -0.5 else 'skin', 0.03), sides=7)
        tube_between(h, wrist + Vector((0.005 * s, -0.09, 0.012)), wrist + Vector((0.0, -0.17, 0.025)), [(0.038, 0.016), (0.03, 0.013), (0.018, 0.01)], lambda i, k, c, n: tone('skin', 0.03), sides=7)
        tube_between(h, wrist + Vector((-0.02 * s, -0.04, 0.025)), wrist + Vector((-0.03 * s, -0.1, 0.045)), [0.013, 0.011, 0.008], lambda i, k, c, n: tone('skin', 0.03), sides=6)
        parts += [p, h]


def head(parts):
    p = Part(['spine', 'head'])
    # The neck.
    tube_between(p, (0, 1.4, -0.005), (0, 1.53, 0.0), [(0.052, 0.05), (0.05, 0.048)], lambda i, k, c, n: tone('skin_shade', 0.03), sides=8)
    h = Part(['head'])
    cy, cz = 1.64, 0.005
    # Rings from the chin up: (height, half width, front, back, how far the front sits forward)
    profile = ((1.505, 0.034, 0.055, 0.02, 0.04), (1.54, 0.076, 0.085, 0.06, 0.012), (1.575, 0.088, 0.1, 0.085, 0.0),
               (1.615, 0.095, 0.104, 0.098, 0.0), (1.655, 0.099, 0.1, 0.105, 0.0), (1.695, 0.098, 0.104, 0.106, 0.0),
               (1.735, 0.089, 0.094, 0.1, 0.0), (1.775, 0.076, 0.078, 0.088, 0.0), (1.805, 0.048, 0.05, 0.06, 0.0))
    rings = [section(Vector((0, y, cz)), w, f, b, 12, z_off=off, power=2.1) for y, w, f, b, off in profile]

    def face(i, k, c, n):
        y = c.y
        front = n.z > 0.35
        if y > 1.745:
            return tone('hair', 0.03)
        if y < 1.595 and n.z > 0.15 and not (abs(c.x) < 0.03 and y > 1.565):
            return tone('stubble', 0.04)  # (stubble along the jaw and chin)
        if 1.65 < y < 1.7 and front and abs(c.x) > 0.02:
            return tone('skin_shade', 0.03)  # (the eye sockets, under the brow)
        if abs(n.x) > 0.7:
            return tone('skin_shade', 0.03)
        return tone('skin', 0.03)
    loft(h, rings, face)
    top = Vector((0, 1.82, cz))
    # Nose: a wedge from the brow to its tip, with nostrils.
    bridge, tip, base = Vector((0, 1.7, 0.104)), Vector((0, 1.622, 0.142)), Vector((0, 1.602, 0.114))
    for s in (1, -1):
        wing = Vector((0.024 * s, 1.612, 0.11))
        for tri in ((bridge, tip, wing), (tip, base, wing)):
            tri = tri if s > 0 else (tri[0], tri[2], tri[1])
            h.add(tri, tone('skin', 0.0, 1.03 if tri[0] is bridge else 0.97))
    # Eyes: whites with dark irises, set into the sockets; brows over them.
    for s in (1, -1):
        ex = 0.036 * s
        ex = 0.038 * s
        box(h, (ex - 0.019, 1.662, 0.09), (ex + 0.019, 1.68, 0.097), tone('eye_white'))
        box(h, (ex - 0.008, 1.664, 0.096), (ex + 0.008, 1.679, 0.1), tone('iris'))
        box(h, (ex - 0.023, 1.689, 0.095), (ex + 0.023, 1.701, 0.106), tone('brow'))
        # Ears.
        ear = [Vector((0.094 * s, 1.625, 0.0)), Vector((0.104 * s, 1.645, -0.012)), Vector((0.106 * s, 1.69, -0.02)), Vector((0.096 * s, 1.698, 0.0))]
        h.add(ear if s > 0 else ear[::-1], tone('skin_shade'))
        h.add(ear[::-1] if s > 0 else ear, tone('skin'))
    # The mouth: a dark line with a fuller lower lip.
    box(h, (-0.026, 1.578, 0.099), (0.026, 1.582, 0.104), tone('skin_lip', 0.02, 0.6))  # (the line of the mouth)
    box(h, (-0.02, 1.568, 0.097), (0.02, 1.578, 0.102), tone('skin_lip'))  # (the lower lip)
    # The beanie: a dome over the crown, a folded band, and a pompom.
    # (Sitting up on the head, so the forehead shows under it.)
    beanie = [section(Vector((0, y, cz)), w, f, b, 12, power=2.3) for y, w, f, b in ((1.745, 0.098, 0.102, 0.108), (1.785, 0.094, 0.096, 0.104), (1.82, 0.08, 0.082, 0.09), (1.852, 0.054, 0.056, 0.062), (1.872, 0.018, 0.018, 0.02))]
    loft(h, beanie, lambda i, k, c, n: tone('beanie_band' if i == 0 else 'beanie', 0.03), cap_start=False)
    band = [section(Vector((0, y, cz)), w, f, b, 12, power=2.3) for y, w, f, b in ((1.728, 0.1, 0.106, 0.11), (1.77, 0.102, 0.108, 0.112))]
    loft(h, band, lambda i, k, c, n: tone('beanie_band', 0.03), cap_start=False, cap_end=False)
    pom = Part(['head'])
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=0.032)
    for f in tmp.faces:
        pom.add([Vector((v.co.x, v.co.z + 1.89, v.co.y + cz)) for v in f.verts], tone('pompom', 0.05))
    tmp.free()
    parts += [p, h, pom]


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
    layer = bm.faces.layers.int.new('ci')
    smooth_layer = bm.faces.layers.int.new('smooth')
    cols = []
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
            f[layer] = len(cols)
            f[smooth_layer] = int(smooth)
            cols.append(colour)
    # Weld the skins, so they shade smooth across their faces (the colours are per corner,
    # and corners in the same place have the same bone weights).
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ci = me.attributes['ci'].data
    sm = me.attributes['smooth'].data
    for poly in me.polygons:
        poly.use_smooth = bool(sm[poly.index].value)
        for li in poly.loop_indices:
            a.data[li].color = cols[ci[poly.index].value]
    me.attributes.remove(me.attributes['ci'])
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
for ob in [ob for ob in brought if ob.type == 'MESH' and ob.name.split('.')[0] in ('player', 'player-details')]:
    brought.remove(ob)
    bpy.data.objects.remove(ob)
parts = []
legs(parts)
torso(parts)
arms(parts)
head(parts)
body = build(arm, parts)
work.objects.link(body)
body.parent = arm
mod = body.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
brought.append(body)
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
