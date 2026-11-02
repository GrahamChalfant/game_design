# Backpack (issue #67): ONE mesh used both as the ground pickup (backpack.glb) and as the worn
# pack on the player (object 'player-pack' in player.blend / player.glb).
# Run:  blender -b --python backpack.py                         -> exports public/models/backpack.glb
#       blender-5.2 -b player.blend --python backpack.py -- --player
#                                                           -> swaps player-pack mesh, saves, exports player.glb
# Orientation (Blender, Z up): origin at base centre, upright; straps / back panel toward -Y,
# pocket + flap lip toward +Y. In glTF (Y up) that is straps toward +Z, pocket toward -Z, i.e.
# the same way round as it hangs on the player (player faces +Z in three.js, pack on the back at -Z).
# Palette: canvas greens 0x4f6b45 / 0x3f5737 (match placeholders.backpack + itemIcons), bedroll rust.
import sys
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models')
PAL = dict(canvas=0x4f6b45, canvas_dark=0x3f5737, strap=0x2f3a28, bedroll=0x8a3a2a, wood=0x6b4a32, wood_dark=0x54392a, driftwood=0x7a7067, end_grain=0x9c7a56,
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


def box(b, lo, hi, c):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [Vector((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    b.add(v, [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)], c)
def rrect(z, w, d, ch):  # chamfered rectangle, 8 points
    w, d = w / 2, d / 2
    return [Vector(p) for p in ((w-ch, -d, z), (w, -d+ch, z), (w, d-ch, z), (w-ch, d, z),
                               (-w+ch, d, z), (-w, d-ch, z), (-w, -d+ch, z), (-w+ch, -d, z))]
def cyl(b, x0, x1, y, z, r, n, side, cap):  # along X
    rings = [[Vector((x, y + r*math.cos(math.tau*k/n), z + r*math.sin(math.tau*k/n))) for k in range(n)] for x in (x0, x1)]
    v = rings[0] + rings[1]
    b.add(v, [(j, j+n, (j+1) % n + n, (j+1) % n) for j in range(n)], side)
    if cap: b.add(v, [tuple(range(n)), tuple(range(2*n-1, n-1, -1))], cap)

def make_pack():
    random.seed(67); b = Builder()
    rings = [rrect(0.0, 0.36, 0.20, 0.04), rrect(0.04, 0.40, 0.24, 0.05), rrect(0.40, 0.40, 0.24, 0.05), rrect(0.47, 0.36, 0.21, 0.05)]
    v = [p for r in rings for p in r]; n = 8
    b.add(v, [(i*n + j, i*n + (j+1) % n, (i+1)*n + (j+1) % n, (i+1)*n + j) for i in range(3) for j in range(n)], lambda: col('canvas', 0.06))
    b.add(v, [tuple(range(n))[::-1]], col('canvas_dark'))
    b.add(v, [tuple(range(3*n, 4*n))], col('canvas', 0.04))
    box(b, (-0.2, -0.125, 0.45), (0.2, 0.135, 0.5), lambda: col('canvas_dark', 0.05))      # flap top
    box(b, (-0.2, 0.115, 0.30), (0.2, 0.145, 0.5), lambda: col('canvas_dark', 0.05))       # flap lip
    box(b, (-0.13, 0.12, 0.07), (0.13, 0.18, 0.25), lambda: col('canvas_dark', 0.05))      # pocket
    for x in (-0.1, 0.1):
        box(b, (x-0.018, 0.142, 0.33), (x+0.018, 0.152, 0.37), col('bone'))              # buckles
        box(b, (x-0.028, -0.145, 0.06), (x+0.028, -0.12, 0.47), lambda: col('strap', 0.05))  # shoulder straps
    cyl(b, -0.23, 0.23, 0.0, 0.575, 0.075, 8, lambda: col('bedroll', 0.06), col('canvas_dark'))  # bedroll
    for x in (-0.13, 0.13):
        cyl(b, x-0.015, x+0.015, 0.0, 0.575, 0.081, 8, col('strap'), None)               # bedroll ties
    return b

if '--player' in sys.argv:
    # Swap the worn pack in player.blend for the same mesh, on the spine bone, behind the back.
    pk = bpy.data.objects['player-pack']; mat = pk.data.materials[0]
    b = make_pack(); bm = b.bm; tmp = bpy.data.objects
    me = build('backpack-tmp', b, material('tmp', 0.95)).data
    me.transform(Matrix.Translation((0, 0.35, 0.84)))
    me.materials.clear(); me.materials.append(mat)
    old = pk.data; pk.data = me
    for o in [o for o in bpy.data.objects if o.name.startswith('backpack-tmp')]: bpy.data.objects.remove(o)
    bpy.data.meshes.remove(old); me.name = 'player-pack'
    pk.vertex_groups.clear(); g = pk.vertex_groups.new(name='spine'); g.add(range(len(me.vertices)), 1.0, 'REPLACE')
    print(f'@@ player-pack: {len(me.polygons)} tris')
    bpy.ops.wm.save_mainfile()
    bpy.ops.object.select_all(action='DESELECT')
    for nme in ('player-rig', 'player', 'player-pack'): bpy.data.objects[nme].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects['player-rig']
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, 'player.glb')), export_format='GLB', use_selection=True)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    o = build('backpack', make_pack(), material('backpack', 0.95))
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, 'backpack.glb')), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)
