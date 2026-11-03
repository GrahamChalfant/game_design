# Food-ladder props (issues #74–76): berry-bush.glb, berry.glb, knife.glb in survival/public/models/ (boar.glb: see boar.py).
# Run: blender -b --python food_props.py      (Blender 4.2+)
# STYLE_GUIDE.md: one vertex-colour material per model ('Col'), palette colours, flat shading,
# 1 unit = 1 m, front faces Blender -Y (glTF +Z ... see README for per-model notes). Fixed seeds.
# Origins: berry-bush, berry and boar at base/feet centre (z = 0); knife at grip centre,
# blade pointing up the handle axis (+Z Blender / +Y glTF) like axe.glb, cutting edge toward -Y.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
PAL = dict(berry=0x8b3a3a, boar=0x7a5c40, boar_light=0x8a6a4a, boar_dark=0x54392a, snout=0x6a4636, leaf=0x5f6e4a, wood=0x6b4a32, wood_dark=0x54392a, driftwood=0x7a7067, end_grain=0x9c7a56,
           hide=0x8a6a4a, bone=0xd8c49a, slate_dark=0x3e4a52, slate=0x626260, lichen=0x848266,
           moss=0x5e7444, moss_dark=0x435440, ash=0x3a3633, char=0x2d2824, rust=0xa4442f, ochre=0xb88a2e)
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
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    print(f'@@ {name}: {len(me.polygons)} tris, size {tuple(round(d, 3) for d in o.dimensions)}')
    return o
def ring(center, u, v, rx, ry, n, rot=0.0):
    return [center + u*(rx*math.cos(rot + math.tau*k/n)) + v*(ry*math.sin(rot + math.tau*k/n)) for k in range(n)]
def export(o, fname):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    for c in o.children_recursive: c.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, fname)), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)

def basis(d):
    d = d.normalized(); u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    return u, d.cross(u)
def log(b, a, c, r, n, side, cap, taper=1.0):
    a, c = Vector(a), Vector(c); u, v = basis(c - a); rot = random.uniform(0, 1)
    rings = [ring(a, u, v, r, r, n, rot), ring(c, u, v, r*taper, r*taper, n, rot)]
    verts = rings[0] + rings[1]
    sides = [(j, (j+1) % n, (j+1) % n + n, j + n) for j in range(n)]
    b.add(verts, sides, side)
    b.add(verts, [tuple(range(n))[::-1], tuple(range(n, 2*n))], cap)
def rock(b, center, size, npts, c):
    pts = [Vector(center) + Vector((random.uniform(-1, 1)*size[0], random.uniform(-1, 1)*size[1], random.uniform(-1, 1)*size[2])) for _ in range(npts)]
    tmp = bmesh.new(); [tmp.verts.new(p) for p in pts]
    hull = bmesh.ops.convex_hull(tmp, input=tmp.verts[:])
    faces = [f for f in tmp.faces]; vi = {v: i for i, v in enumerate(tmp.verts)}
    zmin = min(v.co.z for v in tmp.verts)
    verts = [v.co.copy() + Vector((0, 0, max(0, center[2] - zmin) * 0)) for v in tmp.verts]
    b.add(verts, [tuple(vi[v] for v in f.verts) for f in faces], c); tmp.free()
def ground(o):
    zmin = min((o.matrix_world @ v.co).z for v in o.data.vertices)
    o.data.transform(Matrix.Translation((0, 0, -zmin)))
    print(f'@@ {o.name}: grounded, size {tuple(round(d, 3) for d in o.dimensions)}')
    return o


def tip(b, a, c, r, n, side):  # cone from base a to point c
    a, c = Vector(a), Vector(c); u, v = basis(c - a)
    base = ring(a, u, v, r, r, n); verts = base + [c]
    b.add(verts, [(j, (j+1) % n, n) for j in range(n)], side)
    b.add(verts, [tuple(range(n))[::-1]], side)
def blob(b, center, size, n, c):  # rounded leafy clump: hull of jittered points on an ellipsoid
    pts = []
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n; r = math.sqrt(1 - z*z); t = i * 2.39996 + random.uniform(-0.2, 0.2); k = random.uniform(0.85, 1.05)
        pts.append(Vector(center) + Vector((r*math.cos(t)*size[0]*k, r*math.sin(t)*size[1]*k, z*size[2]*k)))
    tmp = bmesh.new(); [tmp.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(tmp, input=tmp.verts[:]); vi = {v: i for i, v in enumerate(tmp.verts)}
    b.add([v.co.copy() for v in tmp.verts], [tuple(vi[v] for v in f.verts) for f in tmp.faces], c); tmp.free()
def bead(b, p, s):  # cheap berry for the bush: triangular bipyramid, 6 tris
    p = Vector(p); a = random.uniform(0, math.tau)
    verts = [p + Vector((s*math.cos(a + math.tau*k/3), s*math.sin(a + math.tau*k/3), 0)) for k in range(3)] + [p + Vector((0, 0, s)), p - Vector((0, 0, s*0.9))]
    b.add(verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3), (1, 0, 4), (2, 1, 4), (0, 2, 4)], lambda: col(random.choice(('berry', 'berry', 'rust')), 0.08))
def berry(b, p, s):  # an octahedron berry
    p = Vector(p); d = [Vector(x)*s for x in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1))]
    verts = [p + x for x in d]
    b.add(verts, [(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)], lambda: col(random.choice(('berry', 'berry', 'rust')), 0.08))

bpy.ops.wm.read_factory_settings(use_empty=True)
models = []

# ---------------- berry bush (#74): leafy mound on a few stems, red berry clusters ----------------
random.seed(74); b = Builder()
for k in range(3):  # stems
    a = math.tau * k / 4 + 0.3
    log(b, (0.03*math.cos(a), 0.03*math.sin(a), 0), (0.2*math.cos(a), 0.2*math.sin(a), 0.32), 0.022, 4,
        lambda: col('wood_dark', 0.06), col('wood_dark'), 0.6)
blobs = [((0, 0, 0.36), (0.3, 0.28, 0.22)), ((0.2, 0.1, 0.28), (0.2, 0.19, 0.17)), ((-0.21, -0.05, 0.28), (0.2, 0.19, 0.17)),
         ((0.04, -0.18, 0.26), (0.2, 0.17, 0.16)), ((-0.05, 0.19, 0.3), (0.19, 0.17, 0.16)), ((0.02, 0.0, 0.54), (0.2, 0.19, 0.15))]
blob_faces = []
for c, sz in blobs:
    before = set(b.bm.faces)
    blob(b, c, sz, 10, lambda: col(random.choice(('moss', 'moss_dark', 'leaf')), 0.07))
    blob_faces.append((Vector(c), [f for f in b.bm.faces if f not in before]))
bb = Builder()  # berries live in their own child mesh 'berries' so the game can hide them when picked
leaf = [f for _, fs in blob_faces for f in fs]; mid = Vector((0, 0, 0.33))
for k in range(7):  # berry clusters on the outermost leaf face in each direction (round the sides and top)
    a = math.tau * k / 7 + random.uniform(-0.2, 0.2); d = Vector((math.cos(a), math.sin(a), random.uniform(0.1, 0.7))).normalized()
    f = max(leaf, key=lambda f: (f.calc_center_median() - mid).dot(d))
    p = f.calc_center_median() + d * 0.015
    for j in range(3):
        bead(bb, p + Vector((random.uniform(-.03, .03), random.uniform(-.03, .03), random.uniform(-.025, .02))), 0.038)
bush_mat = material('berry-bush', 0.9)
bush = build('berry-bush', b, bush_mat); zmin = min(v.co.z for v in bush.data.vertices); ground(bush)
berries = build('berries', bb, bush_mat); berries.data.transform(Matrix.Translation((0, 0, -zmin))); berries.parent = bush
models.append((bush, 'berry-bush.glb'))

# ---------------- berry (pickup): three berries and a leaf, ~0.05 m ----------------
random.seed(741); b = Builder()
for p in ((-0.01, 0, 0.012), (0.012, 0.004, 0.012), (0.0, -0.006, 0.03)):
    berry(b, p, 0.012)
b.add([Vector((0, -0.006, 0.04)), Vector((0.02, 0.012, 0.046)), Vector((0.004, 0.02, 0.044))], [(0, 1, 2)], col('moss'))
models.append((ground(build('berry', b, material('berry', 0.8))), 'berry.glb'))

# ---------------- knife (#75): wood handle, hide wrap, knapped slate blade ----------------
random.seed(75); b = Builder()
log(b, (0, 0, -0.075), (0, 0, 0.055), 0.016, 6, lambda: col('wood', 0.05), col('end_grain'), 0.9)      # handle
log(b, (0, 0, 0.0), (0, 0, 0.05), 0.0195, 6, lambda: col('hide', 0.06), col('hide'))                    # hide wrap
bl = bmesh.new()
for z, w, t in ((0.045, 0.02, 0.009), (0.09, 0.026, 0.008), (0.14, 0.025, 0.007), (0.19, 0.018, 0.005)):
    for y, x in ((-w, 0), (w*0.8, 0), (0, t), (0, -t), (-w*0.5, t*0.7), (-w*0.5, -t*0.7)):
        bl.verts.new(Vector((x + random.uniform(-.001, .001), y + random.uniform(-.002, .002), z + random.uniform(-.003, .003))))
bl.verts.new(Vector((0, -0.006, 0.245)))   # point
bmesh.ops.convex_hull(bl, input=bl.verts[:])
for e in [e for e in bl.edges if not e.link_faces]: bl.edges.remove(e)
for v in [v for v in bl.verts if not v.link_faces]: bl.verts.remove(v)
vi = {v: i for i, v in enumerate(bl.verts)}
b.add([v.co.copy() for v in bl.verts], [tuple(vi[v] for v in f.verts) for f in bl.faces],
      lambda: col(random.choice(('slate_dark', 'slate')), 0.1)); bl.free()
models.append((build('knife', b, material('knife', 0.7)), 'knife.glb'))

# The boar is built (and rigged and animated) by boar.py.

for o, f in models: export(o, f)
