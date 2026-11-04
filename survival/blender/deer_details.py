# Adds close-up details to the deer in animals.blend, saves it, and exports deer.glb (with its
# animations) to survival/public/models/. Run: blender -b --python deer_details.py
#
# In the over-the-shoulder and first-person views you see the deer from a few metres away, so
# this gives it antlers (a main beam each side with three tines) and dark eyes, both placed by
# measuring the head. They're
# one extra mesh, 'deer-details', each part fixed to one bone of deer-rig, so the existing
# animations move them. Running it again replaces the old 'deer-details'.
# Coordinates are the deer's own, in metres: -y is in front of it, z up.
import math, os
import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models', 'deer.glb')

ANTLER = (0.34, 0.26, 0.17)
ANTLER_TIP = (0.7, 0.62, 0.48)
DARK = (0.015, 0.012, 0.01)
PALE = (0.62, 0.56, 0.45)
WHITE = (0.8, 0.78, 0.72)
HOOF = (0.03, 0.025, 0.02)

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'animals.blend'))
rig = bpy.data.objects['deer-rig']
body = bpy.data.objects['deer']
old = bpy.data.objects.get('deer-details')
if old:
    bpy.data.meshes.remove(old.data)

bm = bmesh.new()
colour_of, bone_of = [], []


def box(centre, size, colour, bone, rot=None):
    sx, sy, sz = (s / 2 for s in size)
    m = rot or Matrix.Identity(3)
    vs = [bm.verts.new(Vector(centre) + m @ Vector((x, y, z))) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    bone_of.extend([bone] * 8)
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])
        colour_of.append(colour)


def branch(a, b, r0, r1, colour, bone, sides=5):
    """A tapering tine from a to b."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    v = d.cross(u)
    ring = lambda c, r: [bm.verts.new(c + (u * math.cos(math.tau * k / sides) + v * math.sin(math.tau * k / sides)) * r) for k in range(sides)]
    ra, rb = ring(a, r0), ring(b, r1)
    bone_of.extend([bone] * (2 * sides))
    for k in range(sides):
        bm.faces.new([ra[k], ra[(k + 1) % sides], rb[(k + 1) % sides], rb[k]])
        colour_of.append(colour)
    bm.faces.new(list(reversed(ra)))
    bm.faces.new(rb)
    colour_of.extend([colour, ANTLER_TIP])


# Where the head is: its mesh, measured, so the parts sit on it.
head_group = body.vertex_groups['head'].index
on_head = [v.co.copy() for v in body.data.vertices if any(g.group == head_group and g.weight > 0.5 for g in v.groups)]
skull = [p for p in on_head if abs(p.x) < 0.09 and -0.95 < p.y < -0.72]
crown = max(skull, key=lambda p: p.z)  # the top of the head, between the ears
print(f'@@ crown at y {crown.y:.3f}, z {crown.z:.3f}')

# ---- Antlers: from the top of the head, each beam sweeps up, out and back, then curves
# forward, with a brow tine and two more rising off it.
for s in (-1, 1):
    base = Vector((s * 0.055, crown.y + 0.02, crown.z - 0.015))
    points = [base, base + Vector((s * 0.07, 0.05, 0.11)), base + Vector((s * 0.15, 0.06, 0.22)), base + Vector((s * 0.18, 0.0, 0.32)), base + Vector((s * 0.16, -0.09, 0.39))]
    radii = [0.022, 0.018, 0.015, 0.011, 0.006]
    for i in range(len(points) - 1):
        branch(points[i], points[i + 1], radii[i], radii[i + 1], ANTLER, 'head')
    branch(points[0] + Vector((0, 0, 0.02)), points[0] + Vector((s * 0.02, -0.09, 0.08)), 0.013, 0.005, ANTLER, 'head')  # brow tine
    for i, (up, out) in enumerate(((0.12, 0.015), (0.11, -0.01))):
        p = points[i + 2]
        branch(p, p + Vector((s * out, -0.045, up)), 0.011, 0.004, ANTLER, 'head')

# ---- Eyes: on the sides of the head, a little in front of the ears, sitting on its surface.
eye_y, eye_z = crown.y - 0.11, crown.z - 0.1
near_eye = [p for p in on_head if abs(p.y - eye_y) < 0.05 and abs(p.z - eye_z) < 0.05]
half = max(abs(p.x) for p in near_eye) if near_eye else 0.08
for s in (-1, 1):
    box((s * (half - 0.004), eye_y, eye_z), (0.016, 0.045, 0.032), DARK, 'head')

me = bpy.data.meshes.new('deer-details')
bm.to_mesh(me)
bm.free()
col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
for p in me.polygons:
    p.use_smooth = False
    for li in p.loop_indices:
        col.data[li].color = (*colour_of[p.index], 1)
me.materials.append(body.data.materials[0])
details = bpy.data.objects.new('deer-details', me)
bpy.context.scene.collection.objects.link(details)
details.parent = rig
groups = {b.name: details.vertex_groups.new(name=b.name) for b in rig.data.bones}
for i, bone in enumerate(bone_of):
    groups[bone].add([i], 1.0, 'REPLACE')
details.modifiers.new('Armature', 'ARMATURE').object = rig
bpy.ops.wm.save_mainfile()
print(f'@@ deer-details: {len(me.polygons)} faces')

# Export from the origin (the deer stands to one side in animals.blend), with only its own clips.
where = rig.location.copy()
rig.location = (0, 0, 0)
for action in [a for a in bpy.data.actions if not a.name.startswith('deer-')]:
    bpy.data.actions.remove(action)  # (the rabbit's; the file isn't saved after this)
bpy.ops.object.select_all(action='DESELECT')
for o in (rig, body, details):
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_animations=True)
rig.location = where
print('@@ deer.glb')
