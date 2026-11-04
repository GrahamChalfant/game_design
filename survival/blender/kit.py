# Shared helpers for the model scripts (places.py, props.py, lookout.py): the palette, a
# builder that collects flat-coloured faces, and export. See STYLE_GUIDE.md.
# Everything is authored in the GAME's axes (x right, y up, z toward the front) and converted
# with g() to Blender's (x, -z, y), so a model's front faces Blender -Y (+z in the game).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
PAL = dict(
    wood=0x6b4a32, wood_dark=0x54392a, driftwood=0x7a7067, cut=0xd9b98a, end_grain=0x9c7a56,
    weathered=0x8a7a68, plank=0x7d6243, chink=0x9c8f78, shingle=0x4a4139, shingle_dark=0x3a332d,
    moss=0x5e7444, moss_dark=0x435440, stone=0x86877f, stone_dark=0x58585a, lichen=0x949266,
    iron=0x2e2c2a, rust=0x8a4a2a, rust_dark=0x6a3a24, paint=0x5a6a4a, paint_pale=0x7a8a68,
    glass=0x2a3a44, chrome=0x9aa0a6, tyre=0x23211f, hide=0x8a6a4a, hide_pale=0xb08a5a,
    bone=0xd8c49a, wool=0x8c3a2a, straw=0xbfae72, canvas=0x6b6a45, tarp=0x3d5a78, camo=0x4d5a3a,
    camo_dark=0x3a4530, needles=0x2f4a40, needles_dark=0x1f3530, ash=0x3a3633, char=0x2d2824,
    ember=0x7a3a20, lamp=0xd9a52b, ochre=0xbfae72,
)


def col(name, var=0.06):
    h = PAL[name]
    k = 1 + random.uniform(-var, var)
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


def g(x, y, z):
    """Game axes (y up, z front) to Blender (z up, -y front)."""
    return Vector((x, -z, y))


def material(name, rough=0.92):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    v = nt.nodes.new('ShaderNodeVertexColor')
    v.layer_name = 'Col'
    nt.links.new(v.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


class Builder:
    """Collects parts in one bmesh; each face remembers its flat colour."""

    def __init__(self):
        self.bm = bmesh.new()
        self.lay = self.bm.faces.layers.int.new('ci')
        self.cols = []

    def add(self, verts, faces, c):
        vs = [self.bm.verts.new(p) for p in verts]
        for f in faces:
            face = self.bm.faces.new([vs[i] for i in f])
            face[self.lay] = len(self.cols)
            self.cols.append(c() if callable(c) else c)

    # A box from game-space centre and size, turned `turn` round y and tilted `tilt` round x
    # (then `roll` round z).
    def box(self, center, size, c, turn=0.0, tilt=0.0, roll=0.0):
        sx, sy, sz = (s / 2 for s in size)
        m = Matrix.Rotation(turn, 3, 'Y') @ Matrix.Rotation(tilt, 3, 'X') @ Matrix.Rotation(roll, 3, 'Z')
        corners = [Vector((x, y, z)) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
        cx, cy, cz = center
        verts = [g(*(Vector((cx, cy, cz)) + m @ p)) for p in corners]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        self.add(verts, faces, c)

    # A round(ish) pole or log from a to b (game space), n sides, radius r (→ r*taper at b).
    def pole(self, a, b, r, c, n=6, taper=1.0, cap=None, wobble=0.0):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        v = d.cross(u)
        rot = random.uniform(0, 1)
        rings = []
        for t, rr in ((0, r), (1, r * taper)):
            p = a.lerp(b, t)
            rings.append([p + (u * math.cos(rot + math.tau * k / n) + v * math.sin(rot + math.tau * k / n)) * rr * (1 + random.uniform(-wobble, wobble)) for k in range(n)])
        verts = [g(*p) for p in rings[0] + rings[1]]
        self.add(verts, [(j, (j + 1) % n, (j + 1) % n + n, j + n) for j in range(n)], c)
        self.add(verts, [tuple(range(n))[::-1], tuple(range(n, 2 * n))], cap or c)

    # A faceted stone (convex hull of random points) at a game-space centre.
    def stone(self, center, size, c, points=9):
        tmp = bmesh.new()
        for _ in range(points):
            tmp.verts.new(Vector(center) + Vector([random.uniform(-1, 1) * s for s in size]))
        bmesh.ops.convex_hull(tmp, input=tmp.verts[:])
        index = {v: i for i, v in enumerate(tmp.verts)}
        verts = [g(*v.co) for v in tmp.verts]
        self.add(verts, [tuple(index[v] for v in f.verts) for f in tmp.faces], c)
        tmp.free()

    # A flat sheet (game space) over a grid of points from `at(u, v)` (u, v in 0..1).
    def sheet(self, at, nu, nv, c):
        verts = [g(*at(i / nu, j / nv)) for j in range(nv + 1) for i in range(nu + 1)]
        faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i) for j in range(nv) for i in range(nu)]
        self.add(verts, faces, c)
        self.add(verts, [f[::-1] for f in faces], c)  # (seen from both sides)


def build(name, b, mat):
    bm = b.bm
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ci = me.attributes['ci'].data
    for p in me.polygons:
        p.use_smooth = False
        for li in p.loop_indices:
            a.data[li].color = b.cols[ci[p.index].value]
    me.attributes.remove(me.attributes['ci'])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def export(objects, fname):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    tris = sum(len(o.data.polygons) for o in objects)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, fname)), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)
    print(f'@@ {fname}: {tris} tris in {len(objects)} parts')
    for o in objects:
        bpy.data.objects.remove(o)




def build_hinged(name, b, mat, pivot):
    """Like build(), but the object's origin is at `pivot` (game space): a part that swings
    open round that point in the game (a lid, a door)."""
    o = build(name, b, mat)
    p = g(*pivot)
    o.data.transform(Matrix.Translation(-p))
    o.location = p
    return o


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
