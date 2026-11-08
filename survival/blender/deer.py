# Builds the deer (deer.glb): a white-tailed buck in its grey-brown winter coat, smooth shaded,
# built round the deer's skeleton (taken from the current deer.glb, with its animations:
# deer-graze, deer-idle, deer-walk, deer-run) and weighted to it, part by part.
#   - a barrel of a body, deep at the chest, the haunches full; a slender neck; a long head with
#     a dark nose, a pale band round the muzzle, white eye rings, big ears;
#   - slim legs with knobby joints, the hind legs bent back at the hock, dark hooves;
#   - the coat darker along the back, white under the belly, at the throat and under the tail;
#   - antlers: a main beam each side sweeping out and forward, with tines.
# Works in Blender's own axes (z up, the deer facing -y), in metres.
# Run in an open Blender (Blender MCP or the Text Editor).
import math, os, random
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models', 'deer.glb')
RIG = globals().get('RIG', OUT)
random.seed(81)


def hexc(h, k=1.0):
    return tuple(min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)) + (1.0,)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)


COAT, COAT_DARK, COAT_LIGHT = hexc(0x7a6452), hexc(0x56443a), hexc(0x8e7a64)
WHITE, CREAM = hexc(0xd8d2c4), hexc(0xb8ab96)
NOSE, HOOF, EYE = hexc(0x1c1816), hexc(0x221c18), hexc(0x0e0c0a)
ANTLER, ANTLER_TIP = hexc(0x8a7458), hexc(0xd2c6ae)
EAR_IN = hexc(0x9a8676)


def fbm(p):
    return noise.noise(p) * 0.6 + noise.noise(p * 2.7) * 0.4


class Part:
    def __init__(self, bones):
        self.bones = bones
        self.faces = []  # (points, colours per corner, smooth)


def skin(part, rings, colour, cap_start=False, cap_end=False, smooth=True):
    """Skins rings (lists of points, the same count) into a smooth surface, facing out from each
    ring's middle; colour(point, outward) per corner."""
    n = len(rings[0])
    mids = [sum(r, Vector()) / n for r in rings]
    for i in range(len(rings) - 1):
        axis = (mids[i] + mids[i + 1]) / 2
        for k in range(n):
            k1 = (k + 1) % n
            quad = [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]]
            c = sum(quad, Vector()) / 4
            if (quad[1] - quad[0]).cross(quad[3] - quad[0]).dot(c - axis) < 0:
                quad = quad[::-1]
            part.faces.append((quad, [colour(q, (q - axis).normalized()) for q in quad], smooth))
    for ring, other, on in ((rings[0], mids[1], cap_start), (rings[-1], mids[-2], cap_end)):
        if not on:
            continue
        c = sum(ring, Vector()) / n
        out = (c - other).normalized()
        for k in range(n):
            tri = [c, ring[k], ring[(k + 1) % n]]
            if (tri[1] - tri[0]).cross(tri[2] - tri[0]).dot(out) < 0:
                tri = tri[::-1]
            part.faces.append((tri, [colour(q, out) for q in tri], smooth))


def curve(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)


def along(path, radii, sides=16, steps=3, up=Vector((0, 0, 1)), squash=None):
    """Rings along a smooth path through `path` points, radius (w, h) at each, `steps` rings per
    span; w across (sideways), h in the plane of `up`."""
    pts, rad = [], []
    for i in range(len(path) - 1):
        p0, p1, p2, p3 = path[max(i - 1, 0)], path[i], path[i + 1], path[min(i + 2, len(path) - 1)]
        for j in range(steps):
            t = j / steps
            pts.append(curve(p0, p1, p2, p3, t))
            a, b = radii[i], radii[i + 1]
            rad.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    pts.append(path[-1])
    rad.append(radii[-1])
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(up).normalized()
        if side.length < 0.5:
            side = Vector((1, 0, 0))
        v = side.cross(d).normalized()
        w, h = rad[i]
        ring = []
        for k in range(sides):
            a = math.tau * k / sides
            c, s = math.cos(a), math.sin(a)
            hh = h * (squash(c, s, i / (len(pts) - 1)) if squash else 1)
            ring.append(p + side * c * w + v * s * hh)
        rings.append(ring)
    return rings


# ---- the coat's colours, by where on the body ----
def coat(q, n):
    """Grey-brown, darker along the back, white under the belly, a little mottled."""
    c = mix(COAT, COAT_LIGHT, 0.5 + fbm(q * 4) * 0.8)
    c = mix(c, COAT_DARK, (n.z - 0.55) * 2.2)  # (the back)
    c = mix(c, WHITE, (-n.z - 0.55) * 3.5)  # (under the belly)
    return c


def build_body(parts):
    # The torso: brisket to rump.
    p = Part(['hips', 'spine'])
    secs = []
    for y, cz, w, h in ((-0.7, 1.02, 0.07, 0.12), (-0.6, 0.97, 0.13, 0.2), (-0.45, 0.95, 0.17, 0.23), (-0.2, 0.93, 0.185, 0.225),
                        (0.08, 0.94, 0.18, 0.21), (0.32, 0.98, 0.17, 0.2), (0.52, 1.0, 0.15, 0.18), (0.66, 0.98, 0.09, 0.12), (0.71, 0.97, 0.03, 0.05)):
        ring = []
        for k in range(28):
            a = math.tau * k / 28
            c, s = math.cos(a), math.sin(a)
            # (A deer's barrel: rounder below, narrowing a little to the spine on top.)
            ww = w * (1 - 0.18 * max(0.0, s))
            ring.append(Vector((math.copysign(abs(c) ** 0.9, c) * ww, y, cz + s * h)))
        secs.append(ring)
    rows = []
    for i in range(len(secs) - 1):
        for j in range(3):
            t = j / 3
            rows.append([curve(secs[max(i - 1, 0)][k], secs[i][k], secs[i + 1][k], secs[min(i + 2, len(secs) - 1)][k], t) for k in range(28)])
    rows.append(secs[-1])

    def torso(q, n):
        c = coat(q, n)
        if q.y > 0.56 and n.z < 0.5:
            c = mix(c, WHITE, (q.y - 0.56) * 8)  # (the white round the tail)
        return c
    skin(p, rows, torso, cap_start=True, cap_end=True)
    parts.append(p)

    # The neck, from inside the shoulders up and forward to the head; the throat patch white.
    nk = Part(['spine', 'neck', 'head'])
    path = [Vector((0, -0.46, 1.0)), Vector((0, -0.62, 1.18)), Vector((0, -0.73, 1.4)), Vector((0, -0.79, 1.56))]
    rings = along(path, [(0.125, 0.19), (0.1, 0.135), (0.08, 0.1), (0.068, 0.08)], sides=20, steps=4, up=Vector((0, -1, 0)))

    def neck(q, n):
        c = coat(q, Vector((n.x, n.y, n.z * 0.5)))
        throat = max(0.0, -n.y - 0.3) * max(0.0, 1 - abs(q.z - 1.42) / 0.06)
        return mix(c, WHITE, throat * 3)
    skin(nk, rings, neck)
    parts.append(nk)


def build_head(parts):
    h = Part(['head'])
    # The skull to the muzzle: rings along the head, sloping down to the nose.
    path = [Vector((0, -0.74, 1.63)), Vector((0, -0.84, 1.62)), Vector((0, -0.97, 1.57)), Vector((0, -1.08, 1.51)), Vector((0, -1.15, 1.47))]
    radii = [(0.06, 0.075), (0.072, 0.085), (0.056, 0.066), (0.04, 0.05), (0.031, 0.036)]
    rings = along(path, radii, sides=20, steps=4, up=Vector((0, 0, 1)),
                  squash=lambda c, s, t: 1 - 0.25 * max(0.0, -s) * t)  # (the jaw narrower underneath)

    def head(q, n):
        c = coat(q, n)
        if q.y < -1.11:
            return NOSE  # (the dark nose)
        if -1.11 <= q.y < -1.04:
            c = mix(c, WHITE, 0.85)  # (the pale band round the muzzle)
        if n.z < -0.5 and q.y < -0.9:
            c = mix(c, WHITE, 0.7)  # (the chin)
        for s in (1, -1):  # (white eye rings)
            d = (q - Vector((s * 0.067, -0.89, 1.628))).length
            c = mix(c, WHITE, (0.03 - d) * 60)
        return c
    skin(h, rings, head, cap_start=True, cap_end=True)
    # Eyes, and ears: big, cupped, inner side pale.
    for s in (1, -1):
        eye = Vector((s * 0.068, -0.89, 1.63))
        skin(h, sphere(eye, 0.016), lambda q, n: EYE, cap_start=True, cap_end=True)
        base = Vector((s * 0.05, -0.79, 1.68))
        tip = base + Vector((s * 0.12, 0.04, 0.1))
        ear_rings = along([base, base.lerp(tip, 0.5), tip], [(0.02, 0.012), (0.045, 0.014), (0.004, 0.004)], sides=10, steps=3,
                          up=Vector((0, 1, 0)), squash=lambda c, s_, t: 0.6 if s_ < 0 else 1.0)
        skin(h, ear_rings, lambda q, n, base=base: EAR_IN if n.y < -0.3 else COAT_DARK, cap_end=True)
    parts.append(h)
    # Antlers: a main beam each side, out, back and up, curving forward, with tines rising off it.
    a = Part(['head'])
    for s in (1, -1):
        root = Vector((s * 0.035, -0.82, 1.68))
        beam = [root, root + Vector((s * 0.12, 0.06, 0.1)), root + Vector((s * 0.22, 0.02, 0.2)), root + Vector((s * 0.24, -0.12, 0.27)), root + Vector((s * 0.18, -0.24, 0.3))]
        def bone_c(q, n, root=root):
            return mix(ANTLER, ANTLER_TIP, ((q - root).length - 0.15) * 3)
        skin(a, along(beam, [(0.02, 0.02), (0.017, 0.017), (0.014, 0.014), (0.011, 0.011), (0.005, 0.005)], sides=8, steps=3), bone_c, cap_end=True)
        for t, length in ((0.3, 0.13), (0.55, 0.16), (0.78, 0.11)):
            i = min(len(beam) - 2, int(t * (len(beam) - 1)))
            f = t * (len(beam) - 1) - i
            base = beam[i].lerp(beam[i + 1], f)
            tip = base + Vector((s * 0.01, -0.02, length))
            skin(a, along([base, base.lerp(tip, 0.5) + Vector((0, -0.015, 0)), tip], [(0.011, 0.011), (0.008, 0.008), (0.003, 0.003)], sides=7, steps=2), bone_c, cap_end=True)
        # (the brow tine, short and forward)
        base = beam[0].lerp(beam[1], 0.4)
        skin(a, along([base, base + Vector((0, -0.05, 0.06))], [(0.009, 0.009), (0.003, 0.003)], sides=7, steps=2), bone_c, cap_end=True)
    parts.append(a)


def sphere(c, r, rows=6, sides=10):
    rings = []
    for i in range(1, rows):
        t = math.pi * i / rows
        rings.append([c + Vector((math.sin(t) * math.cos(math.tau * k / sides) * r, math.sin(t) * math.sin(math.tau * k / sides) * r, math.cos(t) * r)) for k in range(sides)])
    return rings


def leg_colour(s):
    def colour(q, n):
        if q.z < 0.075:
            return HOOF
        low = mix(COAT_LIGHT, CREAM, 0.25 + 0.35 * max(0.0, -n.x * s))
        return mix(coat(q, n), low, (0.62 - q.z) * 4)
    return colour


def build_legs(parts):
    for side, s in (('L', 1), ('R', -1)):
        # Front: from inside the shoulder down past the elbow, the knee (carpus), the cannon
        # bone, the fetlock, to the hoof.
        f = Part(['spine', f'thigh_F{side}', f'shin_F{side}'])
        x = 0.13 * s
        path = [Vector((x, -0.42, 1.02)), Vector((x, -0.45, 0.78)), Vector((x * 1.05, -0.43, 0.62)), Vector((x * 1.05, -0.42, 0.48)),
                Vector((x * 1.05, -0.42, 0.34)), Vector((x * 1.05, -0.42, 0.14)), Vector((x * 1.05, -0.45, 0.07)), Vector((x * 1.05, -0.47, 0.03))]
        radii = [(0.08, 0.12), (0.055, 0.075), (0.036, 0.042), (0.03, 0.034), (0.022, 0.026), (0.021, 0.024), (0.026, 0.028), (0.024, 0.03)]
        rings = along(path, radii, sides=12, steps=3, up=Vector((0, -1, 0)))
        skin(f, rings, leg_colour(s), cap_end=True)
        parts.append(f)
        # Hind: the haunch, the thigh down to the hock (bent back), then the cannon to the hoof.
        b = Part(['hips', f'thigh_B{side}', f'shin_B{side}'])
        x = 0.14 * s
        path = [Vector((x, 0.42, 1.04)), Vector((x, 0.38, 0.8)), Vector((x, 0.48, 0.6)), Vector((x, 0.55, 0.46)),
                Vector((x * 1.02, 0.52, 0.3)), Vector((x * 1.02, 0.49, 0.14)), Vector((x * 1.02, 0.47, 0.07)), Vector((x * 1.02, 0.45, 0.03))]
        radii = [(0.1, 0.17), (0.075, 0.11), (0.045, 0.06), (0.03, 0.04), (0.022, 0.028), (0.021, 0.025), (0.026, 0.028), (0.024, 0.03)]
        rings = along(path, radii, sides=12, steps=3, up=Vector((0, -1, 0)))
        skin(b, rings, leg_colour(s), cap_end=True)
        parts.append(b)
    # The tail: short and flat, brown above, white below.
    t = Part(['hips', 'tail'])
    rings = along([Vector((0, 0.66, 1.1)), Vector((0, 0.71, 1.04)), Vector((0, 0.74, 0.95))], [(0.035, 0.016), (0.04, 0.016), (0.02, 0.01)], sides=10, steps=3, up=Vector((0, 1, 0)))
    skin(t, rings, lambda q, n: COAT_DARK if n.y > 0.3 else WHITE, cap_end=True)
    parts.append(t)


# ---- skinning (as survivor.py) ----
def segments(arm):
    pos = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    ends = {'hips': pos['spine'], 'spine': pos['neck'], 'neck': pos['head'], 'head': pos['head'] + Vector((0, -0.32, -0.1)),
            'tail': pos['tail'] + Vector((0, 0.08, -0.2))}
    for leg in ('FL', 'FR', 'BL', 'BR'):
        ends[f'thigh_{leg}'] = pos[f'shin_{leg}']
        ends[f'shin_{leg}'] = Vector((pos[f'shin_{leg}'].x, pos[f'shin_{leg}'].y, 0.0))
    return {n: (pos[n], ends[n]) for n in pos}


def distance_to(p, seg):
    a, b = seg
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


def weights(p, bones, segs):
    ds = sorted((distance_to(p, segs[n]) + 1e-4, n) for n in bones)[:2]
    if len(ds) == 1:
        return [(ds[0][1], 1.0)]
    (d0, n0), (d1, n1) = ds
    w0, w1 = 1 / d0 ** 4, 1 / d1 ** 4
    return [(n0, w0 / (w0 + w1)), (n1, w1 / (w0 + w1))]


def build(arm, parts):
    segs = segments(arm)
    me = bpy.data.meshes.new('deer')
    o = bpy.data.objects.new('deer', me)
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Col')
    deform = bm.verts.layers.deform.verify()
    groups = {}
    for part in parts:
        for pts, cols, smooth in part.faces:
            vs = []
            for q in pts:
                v = bm.verts.new(q)
                for name, w in weights(q, part.bones, segs):
                    if name not in groups:
                        groups[name] = o.vertex_groups.new(name=name).index
                    v[deform][groups[name]] = w
                vs.append(v)
            f = bm.faces.new(vs)
            f.smooth = smooth
            for loop, c in zip(f.loops, cols):
                loop[col] = c
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    m = bpy.data.materials.get('animal')
    if not m:
        m = bpy.data.materials.new('animal')
        m.use_nodes = True
        nt = m.node_tree
        v = nt.nodes.new('ShaderNodeVertexColor')
        v.layer_name = 'Col'
        nt.links.new(v.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
        nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    me.materials.append(m)
    return o


# ---- put it together ----
work = bpy.data.collections.new('deer-build')
bpy.context.scene.collection.children.link(work)
bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[work.name]
before, actions = set(bpy.data.objects), set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(RIG))
brought = [ob for ob in bpy.data.objects if ob not in before]
arm = next(ob for ob in brought if ob.type == 'ARMATURE')
for ob in [ob for ob in brought if ob.type == 'MESH']:
    brought.remove(ob)
    bpy.data.objects.remove(ob)
parts = []
build_body(parts)
build_head(parts)
build_legs(parts)
body = build(arm, parts)
work.objects.link(body)
body.parent = arm
body.modifiers.new('Armature', 'ARMATURE').object = arm
brought.append(body)
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
print(f'@@ deer.glb: {len(body.data.polygons)} tris')
for ob in brought:
    bpy.data.objects.remove(ob)
bpy.data.collections.remove(work)
for action in [act for act in bpy.data.actions if act not in actions]:
    bpy.data.actions.remove(action)
print('@@ done')
