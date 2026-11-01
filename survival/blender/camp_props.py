# Generates trap.glb, campfire.glb, log-pile.glb and stump.glb in survival/public/models/ (issue #10).
# Run: blender -b --python camp_props.py
# Follows STYLE_GUIDE.md: one vertex-colour material per model ('Col' attribute), palette
# colours, flat shading, 1 unit = 1 m, front faces Blender -Y. Fixed seeds per model.
# Origins: all four models have their base centre at the origin (sit on the ground, z = 0).
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
PAL = dict(wood=0x6b4a32, wood_dark=0x54392a, driftwood=0x7a7067, end_grain=0x9c7a56,
           hide=0x8a6a4a, bone=0xd8c49a, slate_dark=0x3e4a52, slate=0x626260, lichen=0x848266,
           moss=0x56743f, moss_dark=0x3d5739, ash=0x3a3633, char=0x2d2824, rust=0xa4442f, ochre=0xb88a2e)
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

bpy.ops.wm.read_factory_settings(use_empty=True)
models = []

# ---------------- stump ----------------
random.seed(101); b = Builder(); N = 7
rings = [ring(Vector((0, 0, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), r * random.uniform(0.97, 1.03), r, N, 0.2)
         for z, r in ((0.0, 0.31), (0.12, 0.25), (0.42, 0.23))]
top = rings[-1]; inner = [Vector((p.x*0.82, p.y*0.82, p.z + 0.005)) for p in top]
verts = [p for r in rings for p in r] + inner + [Vector((0.02, -0.01, 0.43))]
side = [(i*N + j, i*N + (j+1) % N, (i+1)*N + (j+1) % N, (i+1)*N + j) for i in range(2) for j in range(N)]
b.add(verts, side, lambda: col('wood_dark', 0.08))
b.add(verts, [(2*N + j, 2*N + (j+1) % N, 3*N + (j+1) % N, 3*N + j) for j in range(N)], lambda: col('wood', 0.05))  # bark rim
b.add(verts, [(3*N + j, 3*N + (j+1) % N, 4*N) for j in range(N)], lambda: col('end_grain', 0.06))         # heartwood
b.add(verts, [tuple(range(N))[::-1]], col('wood_dark'))
for k in range(3):  # root flares
    a = math.tau * k / 3 + 0.4; d = Vector((math.cos(a), math.sin(a), 0))
    log(b, d*0.2 + Vector((0, 0, 0.06)), d*0.48 + Vector((0, 0, 0.0)), 0.06, 4, lambda: col('wood_dark', 0.08), col('wood_dark'), 0.4)
# moss: repaint a patch of adjacent bark, rim and one root flare on the shaded front side
MOSS_A = math.radians(-80)
for f in b.bm.faces:
    c = f.calc_center_median(); ang = math.atan2(c.y, c.x); r = c.xy.length
    da = abs((ang - MOSS_A + math.pi) % math.tau - math.pi)
    upper = c.z > 0.4 and da < math.radians(50)
    flare = c.z < 0.12 and da < math.radians(35)
    if upper or flare:
        b.cols[f[b.lay]] = col('moss_dark' if (c.z < 0.3 or random.random() < 0.35) else 'moss', 0.06)
models.append((ground(build('stump', b, material('stump', 0.95))), 'stump.glb'))

# ---------------- log pile: 4-3-2 stack ----------------
random.seed(202); b = Builder(); R, LEN = 0.09, 1.2
for row, cnt in enumerate((4, 3, 2)):
    for i in range(cnt):
        x = (i - (cnt - 1) / 2) * 2 * R * 1.02; z = R + row * R * 1.75
        off = random.uniform(-0.06, 0.06)
        log(b, (x, -LEN/2 + off, z), (x + random.uniform(-.02, .02), LEN/2 + off, z), R * random.uniform(0.9, 1.08), 6,
            lambda: col(random.choice(('wood', 'wood_dark')), 0.06), lambda: col('end_grain', 0.07))
for s in (-1, 1):  # holding stakes
    log(b, (s*0.43, 0, 0), (s*0.47, 0.02, 0.52), 0.03, 4, lambda: col('driftwood', 0.06), col('wood_dark'))
models.append((ground(build('log-pile', b, material('log-pile', 0.95))), 'log-pile.glb'))

# ---------------- campfire: stone ring, log teepee, embers ----------------
random.seed(303); b = Builder()
for k in range(9):
    a = math.tau * k / 9 + random.uniform(-0.06, 0.06); r = 0.41
    rock(b, (r*math.cos(a), r*math.sin(a), 0.05), (0.078, 0.065, 0.045), 11, lambda: col('slate', 0.1))
b.add([Vector((0, 0, 0.01))] + [Vector((0.34*math.cos(math.tau*k/8), 0.34*math.sin(math.tau*k/8), 0.005)) for k in range(8)],
      [(0, k + 1, (k + 1) % 8 + 1) for k in range(8)], lambda: col('ash', 0.08))
for k in range(5):  # teepee logs leaning to the centre
    a = math.tau * k / 5 + 0.3
    log(b, (0.3*math.cos(a), 0.3*math.sin(a), 0.02), (0.03*math.cos(a), 0.03*math.sin(a), 0.42), 0.035, 5,
        lambda: col(random.choice(('wood_dark', 'char')), 0.05), col('char'), 0.7)
for k in range(7):  # glowing ember chunks
    p = Vector((random.uniform(-0.16, 0.16), random.uniform(-0.16, 0.16), 0.01)); s = random.uniform(0.03, 0.05)
    b.add([p + Vector((-s, -s*0.6, 0)), p + Vector((s, -s*0.4, 0)), p + Vector((0, s, 0)), p + Vector((0, 0, s*0.8))],
          [(0, 1, 3), (1, 2, 3), (2, 0, 3)], lambda: col(random.choice(('rust', 'ochre')), 0.1))
# simple low-poly flame: two crossed, tapered blades
for a in (0.0, math.pi/2):
    u = Vector((math.cos(a), math.sin(a), 0))
    pts = [u*-0.12 + Vector((0, 0, 0.04)), u*0.12 + Vector((0, 0, 0.04)), u*0.06 + Vector((0, 0, 0.3)),
           u*-0.05 + Vector((0, 0, 0.26)), Vector((0.01, 0, 0.5))]
    b.add(pts, [(0, 1, 2), (0, 2, 3), (3, 2, 4)], col('ochre', 0.0))
    b.add(pts, [(0, 2, 1), (0, 3, 2), (3, 4, 2)], col('rust', 0.0))
models.append((ground(build('campfire', b, material('campfire', 0.9))), 'campfire.glb'))

# ---------------- trap: figure-4 deadfall ----------------
random.seed(404); b = Builder()
# heavy slab, propped up at the back, open edge toward the front (-Y)
slab = bmesh.new()
for _ in range(22):
    slab.verts.new(Vector((random.uniform(-0.3, 0.3), random.uniform(-0.25, 0.25), random.uniform(-0.035, 0.035))))
bmesh.ops.convex_hull(slab, input=slab.verts[:])
for e in [e for e in slab.edges if not e.link_faces]: slab.edges.remove(e)
for v in [v for v in slab.verts if not v.link_faces]: slab.verts.remove(v)
M = Matrix.Translation((0, 0.05, 0.14)) @ Matrix.Rotation(math.radians(28), 4, 'X')
vi = {v: i for i, v in enumerate(slab.verts)}
b.add([M @ v.co for v in slab.verts], [tuple(vi[v] for v in f.verts) for f in slab.faces], lambda: col('slate', 0.1)); slab.free()
# figure-4 trigger: upright, diagonal and bait stick
log(b, (0, -0.02, 0), (0, -0.02, 0.24), 0.012, 6, lambda: col('wood', 0.05), col('end_grain'))
log(b, (0.0, 0.16, 0.30), (0.0, -0.12, 0.08), 0.010, 6, lambda: col('driftwood', 0.05), col('end_grain'))
log(b, (-0.2, -0.04, 0.10), (0.12, -0.04, 0.17), 0.009, 6, lambda: col('wood_dark', 0.05), col('end_grain'))
b.add([Vector((-0.2, -0.07, 0.06)), Vector((-0.17, -0.01, 0.08)), Vector((-0.23, -0.02, 0.09)), Vector((-0.2, -0.04, 0.13))],
      [(0, 1, 3), (1, 2, 3), (2, 0, 3), (0, 2, 1)], col('lichen'))   # bait bundle
for p in ((0.28, 0.25, 0.03), (-0.3, 0.22, 0.03)):  # footing stones
    rock(b, p, (0.05, 0.04, 0.025), 7, lambda: col('slate_dark', 0.08))
models.append((ground(build('trap', b, material('trap', 0.95))), 'trap.glb'))

for o, f in models: export(o, f)
