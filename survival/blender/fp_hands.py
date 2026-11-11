# Your hands in the first-person view (fp-hands.glb; see src/handRig.js and src/handView.js):
# gloved hands with jointed fingers, so they can close round what they hold (a handle, a match, a
# box, the bow string) rather than a fist with things stuck through it.
#
# Each hand is a little tree of rigid parts, each its own object with its origin at its joint:
#   fp-r-hand            the palm and the back of the hand, with the glove's ribbed cuff
#     fp-r-index-1/2/3   each finger in three segments, knuckle to tip (index, middle, ring, pinky)
#     fp-r-thumb-1/2/3   the thumb: from its root at the heel of the hand, out to its tip
#     fp-right-sleeve    the coat sleeve, back from the wrist (pale: the game tints it)
#   (and fp-l-... for the left hand, a mirror image)
# The game bends a finger by turning each segment round its own y axis (the knuckle's hinge):
# straight, they point ahead (-z in game space); curling turns them toward the palm. The thumb's
# root is turned so it lies out from the heel of the hand toward the fingers: it swings round its
# own y, toward them, and curls down across them round its own x. Segments overlap at the joints,
# with a round knuckle in each, so a bent joint shows no gap.
#
# The right hand, as built: the palm faces left (-x), the back of the hand right (+x), the index
# finger on top (+y), the wrist back toward you (+z). Like a handshake.
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python fp_hands.py
import math, os, runpy
import bpy, bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
R = runpy.run_path(os.path.join(HERE, 'remake.py'), init_globals={'DEFS_ONLY': True})
Builder, build, shared, tone, blend, PAL, g = R['Builder'], R['build'], R['shared'], R['tone'], R['blend'], R['PAL'], R['g']
tube, loft, section = R['tube'], R['loft'], R['section']
OUT = R['OUT']
F = runpy.run_path(os.path.join(HERE, 'first_person.py'), init_globals={'DEFS_ONLY': True})
sleeve = F['sleeve']

PAL.update(fp_glove=0x3a3632, fp_glove_dark=0x2a2725, fp_glove_palm=0x4a443e, fp_glove_cuff=0x2e2a28)

# Where each finger's knuckle is (x, y, z), its three segments' lengths, and its thickness.
FINGERS = {
    'index': ((0.003, 0.03, -0.027), (0.041, 0.025, 0.02), 0.0099),
    'middle': ((0.003, 0.0095, -0.03), (0.045, 0.028, 0.021), 0.0103),
    'ring': ((0.002, -0.0105, -0.028), (0.042, 0.026, 0.02), 0.0097),
    'pinky': ((0.0, -0.029, -0.022), (0.033, 0.021, 0.018), 0.0087),
}
THUMB = ((-0.006, 0.026, 0.036), (0.04, 0.03, 0.026), 0.0118)
THUMB_POINTS = Vector((-0.5, 0.3, -0.81)).normalized()  # (straight out from the heel of the hand, toward the index finger)
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # game axes to Blender's (as g())


def wool(dark_side=None):
    """The glove's colour, face by face; the palm side (local -x) a little paler and worn."""
    def colour(t, a, n):
        return tone('fp_glove_palm' if n.x < -0.55 else 'fp_glove', 0.03)
    return colour


def segment(length, r, tip=False, root=False):
    """One finger segment: its joint at the origin, pointing ahead (-z); a rounded bulge over the
    joint behind (so the joint stays covered when it bends), and a rounded end at the front (a
    fingertip, if `tip`)."""
    b = Builder()
    r1 = r * 0.9
    path = [
        (Vector((0, 0, r * 0.62)), r * 0.35),
        (Vector((0, 0, r * 0.4)), r * 0.8),
        (Vector((0, 0, 0)), r * (1.08 if root else 1.0)),
        (Vector((0, 0, -length * 0.5)), r * 0.95),
        (Vector((0, 0, -length)), r1),
    ]
    if tip:
        path += [(Vector((0, 0, -length - r1 * 0.45)), r1 * 0.78), (Vector((0, 0, -length - r1 * 0.78)), r1 * 0.32)]
    else:
        path += [(Vector((0, 0, -length - r1 * 0.3)), r1 * 0.7)]
    # (A little flattened, like a finger: wider across the hinge than from back to palm.)
    path = [(Vector((p.x, p.y, p.z)), rad) for p, rad in path]
    tube(b, path, 10, wool(), rough=0.025, seed=int(length * 1000))
    # A round knuckle at the joint, so however far it bends there's no gap on the outside.
    k = r * (1.06 if root else 0.99)
    tube(b, [(Vector((0, 0, k * f)), k * w) for f, w in ((0.98, 0.18), (0.72, 0.7), (0.3, 0.96), (-0.3, 0.96), (-0.72, 0.7), (-0.98, 0.18))], 10,
         wool(), rough=0.0)
    return b


def palm():
    b = Builder()
    rings = []
    for z, hw, hh in ((0.064, 0.0155, 0.031), (0.045, 0.0165, 0.036), (0.015, 0.017, 0.041), (-0.012, 0.0155, 0.043), (-0.026, 0.0125, 0.041)):
        rings.append([Vector((p.x + 0.004, p.y, z)) for p in section(Vector((0, 0, 0)), hw, hh, sides=14, power=2.4)])
    loft(b, rings, lambda c, n: tone('fp_glove_palm' if n.x < -0.6 else ('fp_glove_dark' if n.y < -0.7 else 'fp_glove'), 0.03),
         close_start=True, close_end=True)
    # The heel of the thumb: a pad on the palm side by the wrist.
    tube(b, [(Vector((-0.006, 0.016, 0.052)), 0.012), (Vector((-0.009, 0.022, 0.03)), 0.0145), (Vector((-0.007, 0.024, 0.012)), 0.011)], 10,
         lambda t, a, n: tone('fp_glove_palm', 0.03), rough=0.02)
    # The ribbed cuff round the wrist.
    rings = tube(b, [(Vector((0.003, -0.001, 0.058)), 0.036), (Vector((0.003, -0.001, 0.104)), 0.039)], 14,
                 lambda t, a, n: tone('fp_glove_cuff', 0.0, 0.88 if int(a * 14 / math.tau) % 2 else 1.0), rough=0.0)
    # (Closed at the back, so up close to the eye it's never a hollow tube.)
    end = rings[-1]
    centre = sum(end, Vector()) / len(end)
    for k in range(len(end)):
        tri = [g(*p) for p in (centre, end[(k + 1) % len(end)], end[k])]
        b.add(tri, [(0, 1, 2)], tone('fp_glove_dark', 0.0))
        b.add(tri[::-1], [(0, 1, 2)], tone('fp_glove_dark', 0.0))  # (seen from either side)
    return b


def place(obj, parent, at, turn=None):
    """Parents `obj` and sets its place (game space, in the parent's frame) and turn (a game-space
    rotation matrix)."""
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    rot = (C @ (turn or Matrix.Identity(3)) @ C.inverted()).to_4x4()
    obj.matrix_basis = Matrix.Translation(g(*at)) @ rot


def turn_to(direction):
    """A game-space rotation taking -z to `direction`, keeping its y as near up as it can."""
    d = direction.normalized()
    z = -d
    up = Vector((0, 1, 0))
    x = up.cross(z).normalized()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed()


def hand():
    mat = shared('fp-glove', 0.95)
    root = build('fp-r-hand', palm(), mat)
    parts = [root]
    for name, (knuckle, lengths, r) in list(FINGERS.items()) + [('thumb', THUMB)]:
        parent = root
        at = knuckle
        for k, length in enumerate(lengths):
            o = build(f'fp-r-{name}-{k + 1}', segment(length, r * (0.93 ** k), tip=k == 2, root=k == 0), mat)
            place(o, parent, at, turn_to(THUMB_POINTS) if name == 'thumb' and k == 0 else None)
            parts.append(o)
            parent, at = o, (0, 0, -length)
    cloth = sleeve(1)
    cloth.name = 'fp-right-sleeve'
    place(cloth, root, (0, 0, -0.005))
    parts.append(cloth)
    return parts


def mirror(parts):
    """A left hand from the right: every part mirrored across x, its faces turned the right way out."""
    S = Matrix.Scale(-1, 4, Vector((1, 0, 0)))
    copies = {}
    for o in parts:
        me = o.data.copy()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.transform(bm, matrix=S, verts=bm.verts)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        name = o.name.replace('fp-r-', 'fp-l-').replace('fp-right-', 'fp-left-')
        c = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(c)
        copies[o] = c
    for o, c in copies.items():
        c.parent = copies.get(o.parent)
        c.matrix_parent_inverse = Matrix.Identity(4)
        c.matrix_basis = S @ o.matrix_basis @ S
    return list(copies.values())


def export_tree(parts, fname):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    tris = sum(len(o.data.polygons) for o in parts)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.path.join(OUT, fname)), export_format='GLB',
                              use_selection=True, export_apply=True, export_animations=False)
    print(f'@@ {fname}: {tris} tris in {len(parts)} parts')


right = hand()
left = mirror(right)
export_tree(right + left, 'fp-hands.glb')
if not globals().get('KEEP'):
    for o in right + left:
        bpy.data.objects.remove(o)
print('@@ hands done')
