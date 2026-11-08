# Runs the older model generators in "fine" mode: their own layouts, unchanged (the cabin's
# walls and roof parts, the lookout's stairs where the game lets you walk, the doors and lids
# where they swing), built from finer parts, into survival/public/models/. (Run on their own,
# places.py, lookout.py and props.py make the old low-poly versions: run them through this.)
#   - poles and logs are rounder, in a few segments with a little wobble, each one tone with a
#     gentle variation face to face (not a checkerboard), and darker end grain;
#   - boxes (planks, boards, posts) have their edges bevelled, so nothing is a hard block.
# Covers places.py (cabin, hunting stand, lean-to, campsite, truck, fences),
# lookout.py and what's left of props.py (cot, fire finder, binoculars, signpost, fire gate,
# crystals, glow fungus). Models remake.py builds from scratch are skipped.
# Run in an open Blender (Blender MCP or the Text Editor); it doesn't reset the scene.
import math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # (before bmesh, which Blender registers along with it)
import bmesh
from mathutils import Matrix, Vector
import kit

LOOK_OUT = os.path.join(HERE, '..', 'public', 'models')
# Made from scratch by remake.py (or conifers.py): left alone here.
SKIP = {
    'fallen-log', 'rock', 'stump', 'logs', 'axe-ground', 'barrel', 'bedroll', 'bones', 'chest', 'clod', 'cupboard',
    'debris', 'fire-ring', 'landing-wheel', 'locker', 'stalagmite', 'supply-crate', 'torch', 'weathered-pack', 'ammo-box',
}


def g(x, y, z):
    return Vector((x, -z, y))


def shade_of(base, k):
    return tuple(min(1.0, x * k) for x in base[:3]) + (1.0,)


def fine_pole(self, a, b, r, c, n=6, taper=1.0, cap=None, wobble=0.0):
    """Builder.pole, finer: more sides, a few segments, one tone per pole, darker ends."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
    v = d.cross(u)
    sides = max(n, 10) if r > 0.04 else max(n, 7) if r > 0.012 else n
    segs = max(1, min(6, int((b - a).length / 0.6)))
    base = c() if callable(c) else c
    rot = random.uniform(0, 1)
    jitter = max(wobble, 0.03)
    rings = []
    for i in range(segs + 1):
        t = i / segs
        rr = r * (1 + (taper - 1) * t)
        p = a.lerp(b, t)
        rings.append([p + (u * math.cos(rot + math.tau * k / sides) + v * math.sin(rot + math.tau * k / sides)) * rr * (1 + random.uniform(-jitter, jitter)) for k in range(sides)])
    for i in range(segs):
        for j in range(sides):
            j1 = (j + 1) % sides
            quad = [rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]]
            self.add([g(*p) for p in quad], [(0, 1, 2, 3)], shade_of(base, random.uniform(0.93, 1.06)))
    end = cap() if callable(cap) else cap
    end = end or shade_of(base, 0.8)
    self.add([g(*p) for p in rings[0][::-1]], [tuple(range(sides))], end)
    self.add([g(*p) for p in rings[-1]], [tuple(range(sides))], end)


def fine_box(self, center, size, c, turn=0.0, tilt=0.0, roll=0.0):
    """Builder.box, finer: the edges bevelled, one tone per box."""
    m = Matrix.Rotation(turn, 3, 'Y') @ Matrix.Rotation(tilt, 3, 'X') @ Matrix.Rotation(roll, 3, 'Z')
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1)
    for vtx in tmp.verts:
        vtx.co = Vector((vtx.co.x * size[0], vtx.co.y * size[1], vtx.co.z * size[2]))
    r = min(0.025, min(size) * 0.18)
    if r > 0.002:
        bmesh.ops.bevel(tmp, geom=tmp.edges[:] + tmp.verts[:], offset=r, segments=1, profile=0.5, affect='EDGES')
    base = c() if callable(c) else c
    for f in tmp.faces:
        pts = [g(*(Vector(center) + m @ vv.co)) for vv in f.verts]
        self.add(pts, [tuple(range(len(pts)))], shade_of(base, random.uniform(0.94, 1.05)))
    tmp.free()


def patch(builder_class):
    saved = (builder_class.pole, builder_class.box)
    builder_class.pole, builder_class.box = fine_pole, fine_box
    return lambda: setattr(builder_class, 'pole', saved[0]) or setattr(builder_class, 'box', saved[1])


def skipping(export):
    def wrapped(objects, fname):
        if fname[:-4] in SKIP:
            for o in objects:
                bpy.data.objects.remove(o)
            return
        export(objects, fname)
    return wrapped


def run_own_builder(script):
    """A generator with its own Builder (places.py): run it with the fine parts,
    without its scene reset."""
    path = os.path.join(HERE, script)
    src = open(path, encoding='utf-8').read()
    head, tail = src.split('bpy.ops.wm.read_factory_settings(use_empty=True)\n', 1)
    ns = {'__name__': '__main__', '__file__': path}
    exec(compile(head, path, 'exec'), ns)
    ns['Builder'].pole, ns['Builder'].box = fine_pole, fine_box
    ns['OUT'] = LOOK_OUT
    ns['export'] = skipping(ns['export'])
    exec(compile(tail, path, 'exec'), ns)


def run_kit_script(script):
    """A generator built on kit.py (lookout.py, props.py): run it with kit's parts made fine,
    without its scene reset; then put kit back as it was."""
    restore = patch(kit.Builder)
    saved = (kit.OUT, kit.reset, kit.export)
    kit.OUT, kit.reset, kit.export = LOOK_OUT, (lambda: None), skipping(kit.export)
    try:
        path = os.path.join(HERE, script)
        exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), {'__name__': '__main__', '__file__': path})
    finally:
        restore()
        kit.OUT, kit.reset, kit.export = saved


os.makedirs(LOOK_OUT, exist_ok=True)
run_own_builder('places.py')
for script in ('lookout.py', 'props.py'):
    run_kit_script(script)
print('@@ fine done')
