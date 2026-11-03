# Generates survival/public/models/boar.glb: a rigged wild boar with boar-idle, boar-walk,
# boar-run and boar-graze clips (the names animals.js looks for).
# Run: blender -b --python boar.py        (previews go to ./previews, or $BOAR_PREVIEW_DIR)
#
# A wild boar seen from the game's top-down camera: a wedge that's broad and high at the
# shoulders (with a dark bristly mane along the spine, which is what reads from above),
# narrower at the hips, a long snout with pale tusks, short legs. About 1.2 m long and
# 0.8 m tall at the shoulder; feet at z = 0, facing Blender -Y (+Z in three.js).
# STYLE_GUIDE.md: one vertex-colour material, palette colours, flat shading. Fixed seed.
import bpy, bmesh, math, os, random
from mathutils import Vector

random.seed(76)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models', 'boar.glb')
PREV = os.environ.get('BOAR_PREVIEW_DIR', os.path.join(HERE, 'previews'))
FPS = 24

# Palette (sRGB hex, see STYLE_GUIDE.md): a dark grey-brown wild boar.
PAL = dict(coat=0x54392A, coat_light=0x6B4F3A, mane=0x2D2824, belly=0x7A5C40,
           snout=0x8A6A5A, nose=0x3A2A24, tusk=0xD8C49A, hoof=0x2D2824, eye=0x1E1A18)


def col(name, var=0.06):
    h = PAL[name]
    k = 1 + random.uniform(-var, var)
    return (*[min(1, (((h >> s) & 255) / 255) * k) ** 2.2 for s in (16, 8, 0)], 1.0)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS

# ---------------- mesh: every part goes into one bmesh, tagged with its bone ----------------
bm = bmesh.new()
colour_layer = bm.faces.layers.int.new('ci')
bone_layer = bm.verts.layers.int.new('bone')
colours, BONES = [], ['spine', 'head', 'leg_FL', 'leg_FR', 'leg_BL', 'leg_BR', 'tail']


def add(verts, faces, colour, bone):
    vs = [bm.verts.new(p) for p in verts]
    for v in vs:
        v[bone_layer] = BONES.index(bone)
    for f in faces:
        face = bm.faces.new([vs[i] for i in f])
        face[colour_layer] = len(colours)
        colours.append(colour() if callable(colour) else colour)


def loft(rings, colour_of, bone, caps=(None, None)):
    """Joins rings of points (each ring the same size) into a tube. colour_of(i, j) colours each quad."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            add(verts, [(a, b, b + n, a + n)], colour_of(i, j), bone)
    if caps[0]:
        add(verts, [tuple(range(n))[::-1]], caps[0], bone)
    if caps[1]:
        add(verts, [tuple(range((len(rings) - 1) * n, len(rings) * n))], caps[1], bone)


def ring(y, zc, rx, rz, n, jitter=0.04):
    return [Vector((rx * math.cos(math.tau * k / n) * random.uniform(1 - jitter, 1 + jitter), y,
                    zc + rz * math.sin(math.tau * k / n) * random.uniform(1 - jitter, 1 + jitter))) for k in range(n)]


def hring(x, y, z, r, n, rot=0.0):
    """A horizontal ring (for parts that run up and down, like legs)."""
    return [Vector((x + r * math.cos(rot + math.tau * k / n), y + r * math.sin(rot + math.tau * k / n), z)) for k in range(n)]


def shade_by_height(n, top='coat', side='coat_light', bottom='belly'):
    """Darker along the spine, lighter belly: a ring's quad j faces up when sin(angle) > 0."""
    def colour(i, j):
        s = math.sin(math.tau * (j + 0.5) / n)
        return lambda: col(top if s > 0.55 else bottom if s < -0.55 else side)
    return colour


# A small solid wedge from 4 points (thin parts like ears and eyes, visible from both sides).
TETRA = [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)]

N = 10
# Torso, rear (+y) to the neck (-y): narrow hips, the body widening and rising into a big
# shoulder hump. (y, centre height, half-width, half-height)
torso = [(0.60, 0.50, 0.06, 0.07), (0.54, 0.50, 0.15, 0.17), (0.40, 0.49, 0.19, 0.21),
         (0.16, 0.50, 0.21, 0.23), (-0.08, 0.53, 0.24, 0.27), (-0.24, 0.55, 0.24, 0.28),
         (-0.34, 0.53, 0.20, 0.24)]
loft([ring(*t, N) for t in torso], shade_by_height(N), 'spine', caps=(lambda: col('coat'), None))

# Head: from the neck down and forward to a flat snout disc.
head = [(-0.30, 0.54, 0.18, 0.22), (-0.42, 0.49, 0.15, 0.18), (-0.54, 0.42, 0.10, 0.12),
        (-0.66, 0.36, 0.065, 0.07), (-0.71, 0.345, 0.06, 0.06)]
loft([ring(*h, N, 0.02) for h in head], shade_by_height(N, top='coat', side='coat_light', bottom='coat_light'),
     'head', caps=(None, lambda: col('snout', 0.03)))
add([Vector((x, -0.716, 0.345 + dz)) for x, dz in ((-0.02, 0), (0.02, 0), (0, 0.025))], [(0, 1, 2)], col('nose'), 'head')

for s in (-1, 1):
    # Tusks: curving up and out from the sides of the snout.
    base, mid, tip = Vector((s * 0.06, -0.62, 0.33)), Vector((s * 0.10, -0.66, 0.38)), Vector((s * 0.115, -0.63, 0.44))
    for a, b, r in ((base, mid, 0.022), (mid, tip, 0.014)):
        d = (b - a).normalized()
        u = d.cross(Vector((0, 0, 1))).normalized()
        v = d.cross(u)
        rings_ = [[a + (u * math.cos(t) + v * math.sin(t)) * r for t in (0, 2.1, 4.2)],
                  [b + (u * math.cos(t) + v * math.sin(t)) * r * 0.5 for t in (0, 2.1, 4.2)]]
        loft(rings_, lambda i, j: lambda: col('tusk', 0.03), 'head', caps=(None, lambda: col('tusk', 0.03)))
    # Ears: upright, slightly back-swept triangles.
    add([Vector((s * 0.08, -0.34, 0.70)), Vector((s * 0.15, -0.30, 0.69)), Vector((s * 0.14, -0.26, 0.84)),
         Vector((s * 0.12, -0.29, 0.71))], TETRA, lambda: col('coat'), 'head')
    # Eyes.
    add([Vector((s * 0.12, -0.47, 0.56)), Vector((s * 0.125, -0.45, 0.555)), Vector((s * 0.118, -0.455, 0.58)),
         Vector((s * 0.105, -0.46, 0.565))], TETRA, col('eye', 0), 'head')

# The bristly mane: a row of dark fins along the spine, tallest over the shoulders. From the
# top-down camera this dark stripe is what makes a boar read as a boar.
# Low, swept-back tufts: a ridge, not spikes.
for y, h in [(0.30, 0.03), (0.18, 0.04), (0.06, 0.05), (-0.06, 0.06), (-0.16, 0.065), (-0.26, 0.06), (-0.36, 0.045)]:
    top = max(zc + rz for yy, zc, rx, rz in torso + head if abs(yy - y) < 0.14)
    add([Vector((-0.06, y - 0.04, top - 0.03)), Vector((0.06, y - 0.04, top - 0.03)),
         Vector((random.uniform(-0.01, 0.01), y + 0.09, top + h)), Vector((0, y + 0.10, top - 0.03))],
        [(0, 1, 2), (1, 3, 2), (3, 0, 2), (0, 3, 1)], lambda: col('mane', 0.08), 'spine')

# Legs: short, thick, tapering to dark hooves. Front legs under the hump, back legs under the hips.
LEGS = {'leg_FL': (-0.12, -0.24), 'leg_FR': (0.12, -0.24), 'leg_BL': (-0.12, 0.34), 'leg_BR': (0.12, 0.34)}
for bone, (x, y) in LEGS.items():
    # Top to bottom, so each ring runs the same way round and the loft faces outwards.
    rings_ = [hring(x, y, z, r, 6) for z, r in ((0.48, 0.09), (0.26, 0.068), (0.09, 0.052))]
    loft(rings_[::-1], lambda i, j: lambda: col('coat'), bone)
    hoof = [hring(x, y, z, r, 6) for z, r in ((0.0, 0.06), (0.09, 0.052))]
    loft(hoof, lambda i, j: lambda: col('hoof', 0.04), bone, caps=(lambda: col('hoof', 0.04), None))

# Tail: a thin, drooping tail with a tuft.
tail = [hring(0, y, z, r, 5) for y, z, r in ((0.69, 0.36, 0.03), (0.66, 0.46, 0.02), (0.6, 0.53, 0.025))]
loft(tail, lambda i, j: lambda: col('mane'), 'tail', caps=(None, lambda: col('mane')))

bmesh.ops.triangulate(bm, faces=bm.faces[:])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
mesh = bpy.data.meshes.new('boar')
bm.to_mesh(mesh)
vertex_bone = [v[bone_layer] for v in bm.verts]
bm.free()

colour_attr = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
ci = mesh.attributes['ci'].data
for poly in mesh.polygons:
    poly.use_smooth = False
    for li in poly.loop_indices:
        colour_attr.data[li].color = colours[ci[poly.index].value]
mesh.attributes.remove(mesh.attributes['ci'])
mesh.attributes.remove(mesh.attributes['bone'])

material = bpy.data.materials.new('animal')
material.use_nodes = True
bsdf = material.node_tree.nodes['Principled BSDF']
vc = material.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
material.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.92
mesh.materials.append(material)

body = bpy.data.objects.new('boar', mesh)
scene.collection.objects.link(body)
print(f'@@ boar: {len(mesh.polygons)} tris, size {tuple(round(d, 3) for d in body.dimensions)}')

# ---------------- rig: one bone per rigid part ----------------
arm_data = bpy.data.armatures.new('boar-rig')
rig = bpy.data.objects.new('boar-rig', arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
edit = arm_data.edit_bones


def bone(name, head_, tail_, parent=None):
    b = edit.new(name)
    b.head, b.tail = Vector(head_), Vector(tail_)
    b.roll = 0
    if parent:
        b.parent = edit[parent]
    return b


bone('spine', (0, 0.42, 0.50), (0, -0.26, 0.55))
bone('head', (0, -0.30, 0.56), (0, -0.66, 0.36), 'spine')
for name, (x, y) in LEGS.items():
    bone(name, (x, y, 0.46), (x, y, 0.02), 'spine')
bone('tail', (0, 0.58, 0.55), (0, 0.68, 0.38), 'spine')
bpy.ops.object.mode_set(mode='OBJECT')

for name in BONES:
    group = body.vertex_groups.new(name=name)
    group.add([i for i, b in enumerate(vertex_bone) if BONES[b] == name], 1.0, 'REPLACE')
body.parent = rig
body.modifiers.new('rig', 'ARMATURE').object = rig

# ---------------- animations ----------------
for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'
rig.animation_data_create()


def clip(name, frames, keys):
    """keys(bone_name, t) -> (rx, ry, rz) in degrees, or None to leave the bone alone;
    'spine' may also return a 4th value: a height offset in metres. t runs 0..1 over the loop."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for f in range(0, frames + 1, 2):
        t = f / frames
        for pb in rig.pose.bones:
            k = keys(pb.name, t)
            if k is None:
                continue
            pb.rotation_euler = [math.radians(a) for a in k[:3]]
            pb.keyframe_insert('rotation_euler', frame=f)
            if len(k) > 3:
                pb.location = (0, k[3], 0)  # along the bone (the spine runs roughly horizontally)
                pb.keyframe_insert('location', frame=f)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    rig.animation_data.action = None
    return action


def wave(t, phase=0.0):
    return math.sin(math.tau * (t + phase))


# Legs swing about their local X: front-left with back-right, then the other pair.
DIAGONAL = {'leg_FL': 0.0, 'leg_BR': 0.0, 'leg_FR': 0.5, 'leg_BL': 0.5}
# Galloping: the front pair together, then the back pair.
GALLOP = {'leg_FL': 0.0, 'leg_FR': 0.08, 'leg_BL': 0.5, 'leg_BR': 0.58}

clip('boar-idle', 48, lambda b, t: {
    'head': (2 * wave(t), 0, 0),
    'tail': (0, 0, 12 * wave(t * 2)),
    'spine': (0.6 * wave(t), 0, 0),
}.get(b, (0, 0, 0)))
clip('boar-walk', 24, lambda b, t: (
    (24 * wave(t, DIAGONAL[b]), 0, 0) if b in DIAGONAL else
    (3 * wave(t * 2), 0, 0) if b == 'head' else
    (0, 0, 10 * wave(t * 2)) if b == 'tail' else
    (0, 0, 0, 0.0)))
clip('boar-run', 12, lambda b, t: (
    (38 * wave(t, GALLOP[b]), 0, 0) if b in GALLOP else
    (5 * wave(t, 0.25), 0, 0) if b == 'head' else
    (25, 0, 0) if b == 'tail' else
    (4 * wave(t, 0.25), 0, 0)))
# Grazing: the head drops to root in the ground, nudging side to side.
clip('boar-graze', 48, lambda b, t: (
    (50 + 5 * wave(t * 2), 0, 6 * wave(t)) if b == 'head' else
    (0, 0, 8 * wave(t * 3)) if b == 'tail' else
    (3, 0, 0) if b == 'spine' else (0, 0, 0)))

# ---------------- export ----------------
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True,
                          export_apply=False, export_animations=True, export_animation_mode='ACTIONS',
                          export_skins=True, export_frame_range=False)
print('@@ exported', os.path.abspath(OUT))

# ---------------- previews: the game's top-down view, and a side view of grazing ----------------
os.makedirs(PREV, exist_ok=True)
world = bpy.data.worlds.new('w')
scene.world = world
world.color = (0.55, 0.6, 0.45)
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 900, 700
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(40), 0, math.radians(30))
scene.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = 50
scene.collection.objects.link(cam)
scene.camera = cam
for label, action, frame, loc, rot in [
    ('top', 'boar-walk', 6, (2.2, 2.0, 2.6), (52, 0, 135)),
    ('side', 'boar-graze', 12, (3.0, -0.2, 0.7), (82, 0, 93)),
    ('front', 'boar-idle', 0, (1.4, -2.6, 1.1), (75, 0, 28)),
]:
    rig.animation_data.action = bpy.data.actions[action]
    scene.frame_set(frame)
    cam.location, cam.rotation_euler = loc, [math.radians(a) for a in rot]
    scene.render.filepath = os.path.join(PREV, f'boar_{label}.png')
    bpy.ops.render.render(write_still=True)
rig.animation_data.action = None
