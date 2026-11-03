# Generates survival/public/models/shelter.glb. Run: blender -b --python shelter.py
# A-frame hide shelter, 3.2 m wide, 2.3 m tall, 2.8 m deep, base center at origin,
# open front toward Blender -Y (Front view) = +z in three.js.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
random.seed(7)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models', 'shelter.glb')
# Preview renders go to $SHELTER_PREVIEW_DIR, or ./previews next to this script.
PREV = os.environ.get('SHELTER_PREVIEW_DIR', os.path.join(HERE, 'previews'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
HW, H, D = 1.6, 2.3, 2.8
mats = {}
# One vertex-colour material for the whole asset (see STYLE_GUIDE.md); each part is
# painted a flat palette colour into the 'Col' colour attribute.
def mat(name, hexc):
    c = tuple((((hexc >> s) & 255) / 255) ** 2.2 for s in (16, 8, 0))
    return (*c, 1.0)
_shared = []
def shared_mat():
    if _shared: return _shared[0]
    m = bpy.data.materials.new('shelter'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.9
    _shared.append(m); return m
def paint(me, col):
    a = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d in a.data: d.color = col
def obj(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    paint(me, m)
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(shared_mat()); return o
def log(name, a, b, r, m, seg=6):
    a, b = Vector(a), Vector(b); d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r*1.15, radius2=r*0.85, depth=d.length)
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a+b)/2) @ rot, verts=bm.verts)
    return obj(name, bm, m)
def quad(name, pts, m, jitter=0.0):
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in pts]; bm.faces.new(vs)
    return obj(name, bm, m)
wood = mat('wood', 0x6b4a32); wood2 = mat('wood_dark', 0x54392a)
slope = math.atan2(H, HW)
# crossed poles front & back, extending past ridge
for i, y in enumerate((-D/2+0.1, D/2-0.1)):
    for s in (-1, 1):
        a = (s*HW, y, 0); ext = 0.35
        b = (-s*ext*HW/math.hypot(HW,H), y, H + ext*H/math.hypot(HW,H))
        log(f'pole_{i}_{s}', a, b, 0.06, wood if s > 0 else wood2)
log('ridge', (0, -D/2-0.25, H), (0, D/2+0.25, H), 0.065, wood, 8)
# side slope rails along the bottom
for s in (-1, 1): log(f'rail_{s}', (s*(HW-0.05), -D/2, 0.06), (s*(HW-0.05), D/2, 0.06), 0.05, wood2)
# hides: panels per side, subdivided and gently sagging between poles
hides = [0x8a6a4a, 0x9c7a56, 0x7a5c40, 0x94704e]
n = 0
for s in (-1, 1):
    for k in range(2):
        y0, y1 = -D/2 + k*D/2, -D/2 + (k+1)*D/2 + 0.04
        bm = bmesh.new(); NU, NV = 4, 5; grid = []
        for i in range(NU+1):
            row = []
            for j in range(NV+1):
                u, v = i/NU, j/NV
                x = s*HW*(1-u)*0.98; z = H*u*0.98 + 0.02; y = y0 + (y1-y0)*v
                sag = 0.07*math.sin(math.pi*u)*math.sin(math.pi*v)
                x -= s*sag*math.sin(slope); z -= sag*math.cos(slope)
                x += s*0.04 * (1 if 0<i<NU else 0)  # rest on top of poles
                row.append(bm.verts.new((x + random.uniform(-.01,.01), y, z)))
            grid.append(row)
        for i in range(NU):
            for j in range(NV):
                f = [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]]
                bm.faces.new(f if s < 0 else f[::-1])
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.03)
        obj(f'hide_{n}', bm, mat(f'hide_{n}', hides[n])); n += 1
# stitched seam strips
for s in (-1, 1):
    log(f'seam_{s}', (s*HW*0.97, 0, 0.1), (s*0.05, 0, H-0.02), 0.025, mat('stitch', 0xd8c49a), 4)
# back hide (triangle, solid)
bm = bmesh.new()
vs = [bm.verts.new(p) for p in ((-HW, D/2-0.05, 0), (HW, D/2-0.05, 0), (0, D/2-0.05, H))]
bm.faces.new(vs); bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.03)
obj('hide_back', bm, mat('hide_back', 0x7f6044))
# spruce bough bed: a mound of flat low-poly bough tufts
greens = [mat('bough_a', 0x34493f), mat('bough_b', 0x3f5646), mat('bough_c', 0x4a5f4a)]
for i in range(18):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=0.35, radius2=0.12, depth=0.09)
    r = random.uniform(0, math.tau)
    M = (Matrix.Translation((random.uniform(-0.8, 0.8), random.uniform(-0.9, 1.1), 0.06 + random.uniform(0, .06)))
         @ Matrix.Rotation(r, 4, 'Z') @ Matrix.Diagonal((1.6, 0.7, 1, 1)))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    obj(f'bough_{i}', bm, greens[i % 3])
# a few stakes and a small woodpile at the front corner
for i, (x, y) in enumerate(((-HW-0.1, -D/2+0.3), (HW+0.1, -D/2+0.3), (-HW-0.1, D/2-0.3), (HW+0.1, D/2-0.3))):
    log(f'stake_{i}', (x, y, -0.05), (x*1.02, y, 0.35), 0.035, wood2, 5)
for i in range(4):
    z = 0.07 + (0.12 if i == 3 else 0); x = HW + 0.35 + (0.06 if i == 3 else i*0.14 - 0.14)
    log(f'firewood_{i}', (x, -D/2 - 0.1, z), (x+0.03, -D/2 + 0.6, z), 0.065, wood if i % 2 else wood2, 6)
# join into one mesh named shelter
bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active = sc.objects[0]
bpy.ops.object.join(); sh = bpy.context.active_object; sh.name = sh.data.name = 'shelter'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
tris = sum(len(p.vertices) - 2 for p in sh.data.polygons)
print('TRIANGLES', tris, 'DIMS', tuple(round(d, 2) for d in sh.dimensions))
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'shelter.blend'))
# previews (not saved into .blend)
sc.render.engine = 'BLENDER_EEVEE_NEXT' if bpy.app.version < (5, 0, 0) else 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1280, 900
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.66, 0.45, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.data.color = (1, 0.82, 0.6); sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
def shoot(name, loc, target=(0, 0, 1.0)):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(PREV, name); bpy.ops.render.render(write_still=True)
shoot('shelter_three_quarter.png', (-5.5, -6.5, 3.2))
shoot('shelter_side.png', (8.5, 0, 1.3))
bpy.ops.mesh.primitive_plane_add(size=30); g = bpy.context.active_object; paint(g.data, mat('ground', 0x6f7a3c)); g.data.materials.append(shared_mat())
sun.rotation_euler = (math.radians(70), 0, math.radians(-60)); sun.data.color = (1, 0.7, 0.45)
shoot('shelter_in_scene.png', (-3.5, -7.5, 2.0), (0, 0, 0.8))
