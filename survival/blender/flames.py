# Generates flames.glb (survival/public/models/): the tongues of a fire, for campfires and the
# torch. Run: blender -b --python flames.py
#
# Nine tongues, objects flame-1 … flame-9, each with its origin at its base so the game can
# flicker each one by stretching it up from there (src/campfires.js, src/player.js). Each is a
# tapering, gently twisting tube that curls as it rises, widest a little above the base and
# drawn to a point; its colour runs from a yellow-white core at the bottom through orange to
# deep red at the tip. The game draws them unlit and a little see-through (they glow).
# Sizes match the game's stand-in flames: about 0.6 m tall at most, base at the origin.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector
from kit import export, g, reset

reset()
random.seed(42)
SIDES = 6
STEPS = 9
# [x, z, height, radius, lean, curl, core?]  (game axes: x right, z toward you)
TONGUES = [
    (0.0, 0.0, 0.64, 0.13, 0.0, 0.6, False),
    (0.1, 0.05, 0.48, 0.1, 0.25, -0.9, False),
    (-0.09, 0.07, 0.44, 0.1, -0.3, 0.8, False),
    (0.03, -0.11, 0.4, 0.09, 0.3, -0.7, False),
    (-0.11, -0.06, 0.34, 0.08, -0.35, 1.0, False),
    (0.13, -0.06, 0.3, 0.07, 0.4, -1.1, False),
    (-0.02, 0.12, 0.32, 0.07, -0.2, 0.9, False),
    (0.06, 0.08, 0.26, 0.06, 0.3, -0.8, False),
    (0.01, 0.0, 0.4, 0.065, 0.05, 0.4, True),  # the bright core
]
CORE = (1.0, 0.95, 0.75)
YELLOW = (1.0, 0.78, 0.3)
ORANGE = (1.0, 0.48, 0.14)
RED = (0.85, 0.22, 0.08)


def gradient(t, core):
    stops = [(0, CORE), (0.3, YELLOW), (0.65, ORANGE), (1.0, RED)] if not core else [(0, CORE), (0.6, CORE), (1.0, YELLOW)]
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return [c0[i] + (c1[i] - c0[i]) * k for i in range(3)]
    return list(stops[-1][1])


def tongue(name, x, z, height, radius, lean, curl, core):
    bm = bmesh.new()
    rings = []
    heights = []
    lean_dir = random.uniform(0, math.tau)
    for i in range(STEPS + 1):
        t = i / STEPS
        # Widest a little above the base, then drawn in to a point.
        r = radius * (math.sin(min(1, t / 0.3) * math.pi / 2) * (1 - t) ** 0.8 + (0.35 if i == 0 else 0)) * (0.25 if i == 0 else 1)
        bend = lean * t * t + 0.06 * math.sin(t * math.pi * 1.5 + curl) * t  # leaning and curling as it rises
        centre = Vector((math.cos(lean_dir) * bend * height, t * height, math.sin(lean_dir) * bend * height))
        twist = curl * t * 1.5
        ring = []
        for k in range(SIDES):
            a = math.tau * k / SIDES + twist
            wobble = 1 + 0.18 * math.sin(a * 2 + t * 5)
            ring.append(bm.verts.new(g(*(centre + Vector((math.cos(a) * r * wobble, 0, math.sin(a) * r * wobble))))))
        rings.append(ring)
        heights.append(t)
    tip = bm.verts.new(g(*(Vector((math.cos(lean_dir) * lean * height * 1.1, height * 1.04, math.sin(lean_dir) * lean * height * 1.1)))))
    faces = []
    for i in range(STEPS):
        for k in range(SIDES):
            faces.append((bm.faces.new([rings[i][k], rings[i][(k + 1) % SIDES], rings[i + 1][(k + 1) % SIDES], rings[i + 1][k]]), i))
    for k in range(SIDES):
        faces.append((bm.faces.new([rings[-1][k], rings[-1][(k + 1) % SIDES], tip]), STEPS))
    faces.append((bm.faces.new(list(reversed(rings[0]))), 0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for p in me.polygons:
        p.use_smooth = False
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            t = max(0.0, min(1.0, v.z / height))  # (Blender z is up)
            c = gradient(t, core)
            col.data[li].color = (*[x ** 2.2 for x in c], 1)
    m = bpy.data.materials.get('flame') or bpy.data.materials.new('flame')
    m.use_nodes = True
    nt = m.node_tree
    if not any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = g(x, 0, z)
    return o


export([tongue(f'flame-{i + 1}', *spec) for i, spec in enumerate(TONGUES)], 'flames.glb')
print('@@ done')
