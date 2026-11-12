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
# Everything's shaded smooth (see Skin): round fingers and soft pads rather than facets, since
# the hands are the nearest thing to your eyes.
#
# The right hand, as built: the palm faces left (-x), the back of the hand right (+x), the index
# finger on top (+y), the wrist back toward you (+z). Like a handshake.
# Run in an open Blender (Blender MCP or the Text Editor), or: blender -b --python fp_hands.py
import math, os, runpy
import bpy, bmesh
from mathutils import Matrix, Vector, noise

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


# How round everything is: points round a finger, round the palm, and ribs round the cuff.
ROUND, PALM_ROUND, RIBS = 20, 28, 16


def glove(p, n):
    """The glove's colour at a point: the palm side (local -x) a little paler and worn, the
    underside a little darker; one shading into the other, with the wool's soft unevenness."""
    worn = min(1.0, max(0.0, (-n.x - 0.15) / 0.6))
    under = min(1.0, max(0.0, (-n.y - 0.45) / 0.5)) * (1 - worn)
    base, palm_side, dark = tone('fp_glove', 0), tone('fp_glove_palm', 0), tone('fp_glove_dark', 0)
    k = 1 + 0.035 * noise.noise(p * 90)
    return tuple(min(1.0, (base[i] + (palm_side[i] - base[i]) * worn + (dark[i] - base[i]) * under * 0.7) * k) for i in range(3)) + (1.0,)


def pad(p, n):
    """The pads of the palm: the worn, paler wool all over."""
    k = 1 + 0.035 * noise.noise(p * 90)
    return tuple(min(1.0, c * k) for c in tone('fp_glove_palm', 0)[:3]) + (1.0,)


class Skin:
    """A smooth-shaded mesh of closed, rounded shapes, each lofted through rings of points along z
    (the way the fingers point): the points are shared between faces, so light rolls round a
    finger rather than breaking into facets, and each is coloured by where it is and which way it
    faces, the colours shading into each other."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.shapes = []  # (faces, colour) per shape

    def shape(self, stations, sides=ROUND, power=2.0, colour=glove, swell=None):
        """One closed shape through `stations`: [(z, (x, y), half-width in x, half-height in y)],
        closed to a point at each end (so give the ends small). `power`: 2 for a round
        cross-section, more for a squarer one; `swell(angle)`: scales the radius round it."""
        bm = self.bm
        rings = []
        for z, (cx, cy), rx, ry in stations:
            ring = []
            for k in range(sides):
                a = math.tau * k / sides
                c, s = math.cos(a), math.sin(a)
                f = swell(a) if swell else 1.0
                x = math.copysign(abs(c) ** (2 / power), c) * rx * f
                y = math.copysign(abs(s) ** (2 / power), s) * ry * f
                ring.append(bm.verts.new(g(cx + x, cy + y, z)))
            rings.append(ring)
        faces = []
        for a, b in zip(rings, rings[1:]):
            for k in range(sides):
                k1 = (k + 1) % sides
                faces.append(bm.faces.new((a[k], a[k1], b[k1], b[k])))
        for ring, (z, (cx, cy), rx, ry), out in ((rings[0], stations[0], 1), (rings[-1], stations[-1], -1)):
            # (Closed with a point a little beyond the last ring: a rounded end.)
            tip = bm.verts.new(g(cx, cy, z + out * min(rx, ry) * 0.45))
            for k in range(sides):
                faces.append(bm.faces.new((ring[k], ring[(k + 1) % sides], tip)))
        self.shapes.append((faces, colour))

    def build(self, name, mat):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.normal_update()
        for faces, colour in self.shapes:
            for f in faces:
                for loop in f.loops:
                    p, n = loop.vert.co, loop.vert.normal
                    # (Back from Blender's axes to the game's, as the shapes are thought of.)
                    loop[self.col] = colour(Vector((p.x, p.z, -p.y)), Vector((n.x, n.z, -n.y)))
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(mat)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def segment(length, r, tip=False, root=False):
    """One finger segment: its joint at the origin, pointing ahead (-z). Round over the joint
    behind (a knuckle, so the joint stays covered however far it bends), a little waisted along
    the bone, and rounded off at the front: into the next knuckle, or a fingertip with its soft
    pad (if `tip`). A touch wider across the hinge than from back to palm, as a finger is."""
    s = Skin()
    k = r * (1.08 if root else 1.0)  # (the knuckle)
    r1 = r * 0.9  # (the far end)
    ring = lambda z, rad, x=0.0: (z, (x, 0), rad, rad * 1.05)
    stations = [ring(k * 0.9, k * 0.42), ring(k * 0.68, k * 0.74), ring(k * 0.36, k * 0.94), ring(0, k),
                ring(-length * 0.22, r * 0.97), ring(-length * 0.5, r * 0.93), ring(-length * 0.8, r * 0.925)]
    if tip:
        # (The pad: the fingertip fuller on the palm side, then rounded over to the nail side.)
        stations += [ring(-length, r1 * 0.98, -r1 * 0.03), ring(-length - r1 * 0.35, r1 * 0.9, -r1 * 0.04),
                     ring(-length - r1 * 0.62, r1 * 0.72, -r1 * 0.03), ring(-length - r1 * 0.8, r1 * 0.45)]
    else:
        stations += [ring(-length, r1), ring(-length - r1 * 0.35, r1 * 0.8), ring(-length - r1 * 0.58, r1 * 0.5)]
    s.shape(stations)
    return s


def palm():
    s = Skin()
    # The palm and the back of the hand: a rounded slab, fullest across the knuckles, rounded
    # over at the wrist and between the fingers.
    slab = [(0.071, 0.0085, 0.019), (0.064, 0.0155, 0.031), (0.055, 0.0161, 0.0338), (0.045, 0.0165, 0.036), (0.03, 0.0168, 0.0388),
            (0.015, 0.017, 0.041), (0.0, 0.0166, 0.0424), (-0.012, 0.0155, 0.043), (-0.02, 0.0142, 0.0424), (-0.026, 0.0125, 0.041),
            (-0.0295, 0.0088, 0.0385)]
    s.shape([(z, (0.004, 0), hw, hh) for z, hw, hh in slab], sides=PALM_ROUND, power=2.4)
    # The heel of the thumb: a soft pad on the palm side by the wrist.
    s.shape([(0.056, (-0.0055, 0.015), 0.0062, 0.0075), (0.05, (-0.0062, 0.0165), 0.0108, 0.0122), (0.04, (-0.0078, 0.0195), 0.0135, 0.0146),
             (0.03, (-0.009, 0.022), 0.0145, 0.0152), (0.02, (-0.0082, 0.0232), 0.0132, 0.0138), (0.012, (-0.007, 0.024), 0.0106, 0.011),
             (0.0065, (-0.0062, 0.0242), 0.006, 0.0064)], colour=pad)
    # The heel of the hand, below it: a lower pad on the little finger's side.
    s.shape([(0.058, (-0.006, -0.016), 0.005, 0.008), (0.05, (-0.0068, -0.017), 0.0085, 0.0135), (0.036, (-0.0075, -0.018), 0.0102, 0.0165),
             (0.02, (-0.0072, -0.0185), 0.0096, 0.0165), (0.006, (-0.0064, -0.019), 0.0074, 0.0135), (-0.002, (-0.006, -0.019), 0.0045, 0.008)],
            colour=pad)
    # The ribbed cuff round the wrist: knitted ribs, rounded over at each end (closed at the back,
    # so up close to the eye it's never a hollow tube).
    cuff = tone('fp_glove_cuff', 0)
    def knit(p, n):
        a = math.atan2(p.y + 0.001, p.x - 0.003)
        k = 0.9 + 0.1 * math.cos(a * RIBS)  # (darker down between the ribs)
        return tuple(c * k for c in cuff[:3]) + (1.0,)
    at = (0.003, -0.001)
    s.shape([(0.0555, at, 0.0325, 0.0325), (0.058, at, 0.0352, 0.0352), (0.0615, at, 0.0362, 0.0362), (0.081, at, 0.0376, 0.0376),
             (0.1005, at, 0.0389, 0.0389), (0.104, at, 0.038, 0.038), (0.1062, at, 0.035, 0.035)],
            sides=RIBS * 4, colour=knit, swell=lambda a: 1 + 0.022 * math.cos(a * RIBS))
    return s


def soften(obj):
    """Shades a faceted part smooth (the sleeve, from first_person.py): its points joined up, and
    its colours blended from face to face (they're given face by face)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    col = bm.loops.layers.float_color['Col']
    for v in bm.verts:
        loops = v.link_loops
        mean = [sum(l[col][i] for l in loops) / len(loops) for i in range(4)]
        for l in loops:
            l[col] = mean
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = True
    bm.to_mesh(me)
    bm.free()


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
    root = palm().build('fp-r-hand', mat)
    parts = [root]
    for name, (knuckle, lengths, r) in list(FINGERS.items()) + [('thumb', THUMB)]:
        parent = root
        at = knuckle
        for k, length in enumerate(lengths):
            o = segment(length, r * (0.93 ** k), tip=k == 2, root=k == 0).build(f'fp-r-{name}-{k + 1}', mat)
            place(o, parent, at, turn_to(THUMB_POINTS) if name == 'thumb' and k == 0 else None)
            parts.append(o)
            parent, at = o, (0, 0, -length)
    cloth = sleeve(1)
    cloth.name = 'fp-right-sleeve'
    soften(cloth)
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
