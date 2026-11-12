# Generates bow.glb, arrow.glb and stone.glb in survival/public/models/ (issue #23).
# Run: blender -b --python hunting_props.py
# Follows STYLE_GUIDE.md: one vertex-colour material per model ('Col' attribute),
# palette colours, flat shading, 1 unit = 1 m, front faces Blender -Y.
# Origins: bow = centre of the grip (hand_R attach point), bow stands upright (+Z),
#          string on the archer side (+Y), back of the bow toward the target (-Y).
#          arrow = the nock; the arrow points along -Y, head at y = -0.70.
#          stone = base centre (rests on the ground at z = 0).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
random.seed(23)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
PAL = dict(wood=0x6b4a32, wood_dark=0x54392a, driftwood=0x7a7067, hide=0x8a6a4a,
           hide_dark=0x7a5c40, bone=0xd8c49a, slate_dark=0x3e4a52, slate=0x626260,
           lichen=0x848266, rust=0xa4442f)
def col(name, var=0.0):
    h = PAL[name]; k = 1 + random.uniform(-var, var)
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)
def material(name, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; v = nt.nodes.new('ShaderNodeVertexColor'); v.layer_name = 'Col'
    nt.links.new(v.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = rough
    return m
class Builder:
    """Collects parts in one bmesh; each face stores an index into a flat colour list."""
    def __init__(self, bm=None):
        self.bm = bm or bmesh.new(); self.lay = self.bm.faces.layers.int.new('ci'); self.cols = []
    def paint(self, face, c):
        face[self.lay] = len(self.cols); self.cols.append(c() if callable(c) else c)
    def add(self, verts, faces, c):
        vs = [self.bm.verts.new(p) for p in verts]
        for f in faces: self.paint(self.bm.faces.new([vs[i] for i in f]), c)
    def loft(self, rings, c, cap=True):
        n = len(rings[0]); verts = [p for r in rings for p in r]; faces = []
        for i in range(len(rings) - 1):
            for j in range(n):
                a, b = i*n + j, i*n + (j+1) % n
                faces.append((a, b, b+n, a+n))
        if cap: faces += [tuple(range(n))[::-1], tuple(range((len(rings)-1)*n, len(rings)*n))]
        self.add(verts, faces, c)
def build(name, b, mat):
    bm = b.bm
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    a = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ci = me.attributes['ci'].data
    for p in me.polygons:
        p.use_smooth = False
        for li in p.loop_indices: a.data[li].color = b.cols[ci[p.index].value]
    me.attributes.remove(me.attributes['ci'])
    me.materials.append(mat)
    for e in me.edges: e.use_edge_sharp = True   # flat shading: every edge hard (issue #77)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    print(f'@@ {name}: {len(me.polygons)} tris, size {tuple(round(d, 3) for d in o.dimensions)}')
    return o
def ring(center, u, v, rx, ry, n, rot=0.0):
    return [center + u*(rx*math.cos(rot + math.tau*k/n)) + v*(ry*math.sin(rot + math.tau*k/n)) for k in range(n)]
def export(o, fname):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, fname)), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)

bpy.ops.wm.read_factory_settings(use_empty=True)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ---------------- bow: 1.40 m self bow ----------------
L, SEG, DEPTH = 1.40, 8, 0.10           # half-length, segments per limb, reflex depth
b = Builder(); tips = []
for s in (-1, 1):                       # lower and upper limb, from grip outward
    rings = []
    for i in range(SEG + 1):
        t = i / SEG; z = s * (0.06 + t * (L/2 - 0.06))
        y = DEPTH * (z / (L/2))**2  # braced: tips bend toward the archer (+Y)
        w = 0.0192 * (1 - 0.6*t); d = 0.0156 * (1 - 0.45*t)   # +20% (#77)
        rings.append(ring(Vector((0, y, z)), X, Y, w, d, 4, math.pi/4))
    tips.append(Vector((0, rings[-1][0].y, z)))
    b.loft(rings, lambda: col('wood', 0.06))
# grip: hide wrap, a rounded handle a hand closes round: slim where it's held (about 25 mm wide
# and 31 deep; the first-person view draws it a fifth bigger, and the gloved fingers there are
# fitted round that, src/handRig.js), a little fuller in the palm, flaring out at each end to
# take in the limbs. (Its colours from a generator of its own, so the arrow's stay as they were.)
def handle(center, rx, ry, n=12, power=3.5):
    pts = []
    for k in range(n):
        c, s = math.cos(math.tau * k / n), math.sin(math.tau * k / n)
        pts.append(center + X * (math.copysign(abs(c) ** (2 / power), c) * rx) + Y * (math.copysign(abs(s) ** (2 / power), s) * ry))
    return pts
GRIP = ((0.078, 0.0172, 0.0146), (0.058, 0.0172, 0.0146), (0.042, 0.0136, 0.015), (0.02, 0.0126, 0.0152), (0.0, 0.0125, 0.0155))
hide = random.Random(23)
def hide_col():
    k = 1 + hide.uniform(-0.05, 0.05)
    return (*[min(1, (((PAL['hide'] >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)
b.loft([handle(Vector((0, 0, s * z)), rx, ry) for s, (z, rx, ry) in [(-1, r) for r in GRIP] + [(1, r) for r in GRIP[-2::-1]]], hide_col)
for _ in range(20): random.random()     # (the old six-sided grip's share of the shared generator)
# string: thin 3-sided strand between the nocks (straight, bow braced)
tz = L/2 - 0.02; sy = tips[1].y + 0.004
b.loft([ring(Vector((0, sy, z)), X, Y, 0.0036, 0.0036, 3) for z in (-tz, tz)], col('bone'))
bow = build('bow', b, material('bow', 0.9))

# ---------------- arrow: 0.70 m, origin at the nock, points -Y ----------------
b = Builder(); AL = 0.70
# shaft with a slightly swollen nock end (5-sided)
b.loft([ring(Vector((0, -y, 0)), X, Z, r, r, 5) for y, r in ((0.0, 0.0045), (0.012, 0.0052), (AL - 0.05, 0.004))],
       lambda: col('driftwood', 0.04))
# knapped stone head: flat diamond, 4 faces each side
hy = AL - 0.06
head = [Vector((0, -AL, 0)), Vector((0.012, -hy - 0.012, 0)), Vector((0, -hy - 0.012, 0.0035)),
        Vector((-0.012, -hy - 0.012, 0)), Vector((0, -hy - 0.012, -0.0035)), Vector((0, -hy + 0.01, 0))]
b.add(head, [(0, 2, 1), (0, 3, 2), (0, 4, 3), (0, 1, 4), (5, 1, 2), (5, 2, 3), (5, 3, 4), (5, 4, 1)],
      lambda: col('slate_dark', 0.08))
# fletching: three feather vanes (thin wedges, two-sided)
for k in range(3):
    a = math.tau * k / 3 + math.pi/2; dvec = Vector((math.cos(a), 0, math.sin(a))); tvec = Vector((-math.sin(a), 0, math.cos(a)))*0.0008
    p0, p1, p2 = Vector((0, -0.03, 0)), Vector((0, -0.15, 0)), Vector((0, -0.05, 0)) + dvec*0.016
    pts = [p0 + tvec, p1 + tvec, p2 + tvec, p0 - tvec, p1 - tvec, p2 - tvec]
    c = col('rust', 0.05) if k == 0 else col('bone', 0.05)     # cock feather in rust
    b.add(pts, [(0, 1, 2), (3, 5, 4)], c)
arrow = build('arrow', b, material('arrow', 0.9))

# ---------------- stone: fist-sized throwing stone ----------------
bm = bmesh.new()
for i in range(16):
    v = Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1))).normalized()
    bm.verts.new(Vector((v.x * 0.05, v.y * 0.042, v.z * 0.036)))
bmesh.ops.convex_hull(bm, input=bm.verts[:])
for e in [e for e in bm.edges if not e.link_faces]: bm.edges.remove(e)
bmesh.ops.translate(bm, vec=Vector((0, 0, -min(v.co.z for v in bm.verts))), verts=bm.verts)
b = Builder(bm); bm.normal_update()
for f in bm.faces: b.paint(f, col('lichen', 0.04) if f.normal.z > 0.75 and random.random() < 0.4 else col('slate', 0.07))
stone = build('stone', b, material('stone', 0.95))

for o, f in ((bow, 'bow.glb'), (arrow, 'arrow.glb'), (stone, 'stone.glb')): export(o, f)
