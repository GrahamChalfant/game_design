# Adds the close-up details to the survivor in player.blend, saves it, and exports player.glb
# (with its animations) to survival/public/models/. Run: blender -b --python player_details.py
#
# The survivor was modelled to be seen from above; in the over-the-shoulder and first-person
# views you see them up close, so this adds a face (eyes, brows, nose, ears), a knit toque,
# the coat's collar, pockets, cuffs, hem band and back seam, thumbs, and boot soles and cuffs.
# They're one extra mesh, 'player-details', each part fixed to one bone of player-rig, so
# the existing animations move them. Run it again after changing the parts: it replaces the
# old 'player-details'.
#
# The coat's parts are painted the coat's red (strong red, very little green), so the game's
# outfits repaint them along with the rest of the coat (see isCoat in src/outfits.js).
# Coordinates are Blender's, in metres: x to the survivor's left, -y in front of them, z up.
import os
import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'models', 'player.glb')

# Linear colours (as stored in the vertex colours).
SKIN = (0.62, 0.38, 0.25)
SKIN_SHADE = (0.5, 0.29, 0.18)
EYE = (0.02, 0.02, 0.025)
BROW = (0.06, 0.035, 0.02)
TOQUE = (0.05, 0.065, 0.085)
TOQUE_STRIPE = (0.42, 0.3, 0.1)
COAT = (0.36, 0.05, 0.025)  # (like the coat)
COAT_DARK = (0.22, 0.032, 0.018)
BUTTON = (0.03, 0.025, 0.02)
GLOVE = (0.06, 0.045, 0.03)
SOLE = (0.035, 0.03, 0.027)  # near black: paler, lit from above, the soles read as a grey plate under the feet
BOOT = (0.07, 0.045, 0.028)

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'player.blend'))
rig = bpy.data.objects['player-rig']
body = bpy.data.objects['player']
old = bpy.data.objects.get('player-details')
if old:
    bpy.data.meshes.remove(old.data)

bm = bmesh.new()
colour_of = []  # per face
bone_of = []  # per vertex
BONES = [b.name for b in rig.data.bones]


def box(centre, size, colour, bone, rot=None):
    sx, sy, sz = (s / 2 for s in size)
    m = rot or Matrix.Identity(3)
    corners = [Vector(centre) + m @ Vector((x, y, z)) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    vs = [bm.verts.new(c) for c in corners]
    bone_of.extend([bone] * 8)
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])
        colour_of.append(colour)


def ball(centre, radius, colour, bone, squash=(1, 1, 1)):
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=radius)
    index = {}
    for v in tmp.verts:
        index[v] = bm.verts.new(Vector(centre) + Vector((v.co.x * squash[0], v.co.y * squash[1], v.co.z * squash[2])))
        bone_of.append(bone)
    for f in tmp.faces:
        bm.faces.new([index[v] for v in f.verts])
        colour_of.append(colour)
    tmp.free()


def ring(centre, half, height, thick, colour, bone):
    """A band round a part: four boxes, `half` = (half width in x, half depth in y)."""
    cx, cy, cz = centre
    hx, hy = half
    box((cx, cy - hy, cz), (2 * hx + thick, thick, height), colour, bone)
    box((cx, cy + hy, cz), (2 * hx + thick, thick, height), colour, bone)
    box((cx - hx, cy, cz), (thick, 2 * hy, height), colour, bone)
    box((cx + hx, cy, cz), (thick, 2 * hy, height), colour, bone)


# ---- The face (the head's front is at y = -0.19; the beard covers the jaw).
for s in (-1, 1):
    box((s * 0.068, -0.193, 1.655), (0.04, 0.012, 0.03), EYE, 'head')
    box((s * 0.07, -0.192, 1.69), (0.07, 0.014, 0.018), BROW, 'head', Matrix.Rotation(s * -0.12, 3, 'Y'))
    box((s * 0.197, -0.01, 1.61), (0.025, 0.06, 0.08), SKIN_SHADE, 'head')  # ears
box((0, -0.205, 1.618), (0.045, 0.035, 0.06), SKIN_SHADE, 'head', Matrix.Rotation(0.25, 3, 'X'))  # nose
# ---- A knit toque. The top of the head (the hair above the brows) is repainted as the
# toque's crown, so it follows the head exactly; then a turned-up cuff with a stripe goes round
# the brow, sized to the head there, and a bobble on top. (Repainting only touches hair-brown
# faces, so running this again changes nothing.)
BROW_LINE = 1.668
head = body.vertex_groups['head'].index
weighted = lambda v: any(g.group == head and g.weight > 0.5 for g in v.groups)
hair_col = body.data.color_attributes['Col']
for poly in body.data.polygons:
    vs = [body.data.vertices[i] for i in poly.vertices]
    if not all(weighted(v) for v in vs) or sum(v.co.z for v in vs) / len(vs) < BROW_LINE:
        continue
    r, g, b_, a = hair_col.data[poly.loop_indices[0]].color
    if r < 0.2 and r > g:  # hair brown
        shade = 0.85 + 0.3 * ((poly.index * 7919) % 13) / 13
        for li in poly.loop_indices:
            hair_col.data[li].color = (TOQUE[0] * shade, TOQUE[1] * shade, TOQUE[2] * shade, 1)
on_head = [v.co.copy() for v in body.data.vertices if weighted(v)]


def section(z):
    """The head's half width, and its front and back, at height z (between its rings)."""
    rings = {}
    for p in on_head:
        rings.setdefault(round(p.z, 2), []).append(p)
    heights = sorted(h for h in rings if len(rings[h]) >= 6)
    lo = max(h for h in heights if h <= z)
    hi = min(h for h in heights if h >= z)
    t = 0 if hi == lo else (z - lo) / (hi - lo)
    pick = lambda h: (max(abs(p.x) for p in rings[h]), min(p.y for p in rings[h]), max(p.y for p in rings[h]))
    a, b = pick(lo), pick(hi)
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


hx, front, back = section(BROW_LINE + 0.03)
cy, hy = (front + back) / 2, (back - front) / 2
ring((0, cy, BROW_LINE + 0.03), (hx + 0.012, hy + 0.012), 0.06, 0.026, TOQUE, 'head')
ring((0, cy, BROW_LINE + 0.034), (hx + 0.015, hy + 0.015), 0.013, 0.026, TOQUE_STRIPE, 'head')
top = max(p.z for p in on_head)
ball((0, sum(p.y for p in on_head if p.z > top - 0.01) / max(1, len([p for p in on_head if p.z > top - 0.01])), top + 0.03), 0.045, TOQUE_STRIPE, 'head')

# ---- The coat: a stand-up collar, pocket flaps, a hem band, cuffs and a seam across the back.
ring((0, 0.0, 1.43), (0.15, 0.135), 0.08, 0.035, COAT, 'spine')
for s in (-1, 1):
    box((s * 0.13, -0.224, 1.25), (0.12, 0.014, 0.05), COAT_DARK, 'spine')  # chest pockets
    box((s * 0.13, -0.232, 1.25), (0.02, 0.006, 0.02), BUTTON, 'spine')
    box((s * 0.155, -0.21, 0.92), (0.15, 0.014, 0.045), COAT_DARK, 'hips')  # hip pockets
    box((s * 0.155, -0.207, 0.865), (0.15, 0.008, 0.075), COAT, 'hips')
ring((0, 0.0, 0.765), (0.262, 0.195), 0.04, 0.016, COAT_DARK, 'hips')
box((0, 0.208, 1.3), (0.5, 0.012, 0.018), COAT_DARK, 'spine')  # the yoke seam on the back
box((0, -0.226, 1.395), (0.03, 0.012, 0.04), BUTTON, 'spine')  # the zip pull
for side, x in (('L', 0.305), ('R', -0.305)):
    ring((x, 0.0, 0.83), (0.07, 0.078), 0.045, 0.016, COAT_DARK, f'lowerarm_{side}')
    # Thumbs on the gloves (on the inside of each hand, towards the front).
    box((x * 0.93, -0.055, 0.745), (0.04, 0.04, 0.07), GLOVE, f'hand_{side}', Matrix.Rotation(0.3 if side == 'L' else -0.3, 3, 'Y'))

# ---- Boots: a thick sole, just proud of the boot, and a padded cuff at the top.
for side, x in (('L', 0.12), ('R', -0.12)):
    box((x, -0.05, 0.018), (0.18, 0.31, 0.036), SOLE, f'shin_{side}')
    ring((x, -0.01, 0.2), (0.09, 0.1), 0.05, 0.025, BOOT, f'shin_{side}')

me = bpy.data.meshes.new('player-details')
bm.to_mesh(me)
bm.free()
col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
for p in me.polygons:
    p.use_smooth = False
    for li in p.loop_indices:
        col.data[li].color = (*colour_of[p.index], 1)
me.materials.append(body.data.materials[0])  # (the survivor's own material)
details = bpy.data.objects.new('player-details', me)
bpy.context.scene.collection.objects.link(details)
details.parent = rig
groups = {name: details.vertex_groups.new(name=name) for name in BONES}
for i, bone in enumerate(bone_of):
    groups[bone].add([i], 1.0, 'REPLACE')
details.modifiers.new('Armature', 'ARMATURE').object = rig
bpy.ops.wm.save_mainfile()
print(f'@@ player-details: {len(me.polygons)} faces')

bpy.ops.object.select_all(action='DESELECT')
for o in (rig, body, bpy.data.objects['player-pack'], details):
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_animations=True)
print('@@ player.glb')
