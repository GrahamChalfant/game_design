# Generates clouds.glb (survival/public/models/): six low-poly cumulus clouds, objects
# cloud-1 … cloud-6, for the sky in the third- and first-person views (src/sky.js).
# Run: blender -b --python sky.py
#
# Each cloud is a cluster of flattened, faceted puffs: a broad, flat-bottomed base with
# rounder heaps on top. Vertex colours go from bright white on top to a cool grey-blue
# underneath (the game's light does the rest). Authored about 40 m across; the game scales
# them up. Origin at the middle of the cloud's base.
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector
from kit import export, reset

reset()
TOP = (0.96, 0.95, 0.93)
UNDER = (0.70, 0.75, 0.82)
SPECS = [  # (seed, length, width, heaps)
    (1, 44, 20, 7), (2, 34, 18, 6), (3, 56, 24, 9), (4, 26, 14, 4), (5, 40, 26, 8), (6, 62, 18, 8),
]


def srgb_to_linear(c):
    return tuple(x ** 2.2 for x in c)


def cloud(name, seed, length, width, heaps):
    random.seed(seed)
    bm = bmesh.new()
    puffs = []
    # The base: a row of broad, flat puffs along the cloud's length.
    n = max(3, heaps // 2 + 1)
    for i in range(n):
        t = (i / (n - 1) - 0.5) if n > 1 else 0
        r = width * random.uniform(0.38, 0.52)
        puffs.append((Vector((t * length * 0.8, random.uniform(-0.15, 0.15) * width, r * 0.35)), Vector((r * 1.3, r, r * 0.55))))
    # Heaps on top, biggest near the middle.
    for i in range(heaps):
        t = random.uniform(-0.38, 0.38)
        r = width * random.uniform(0.3, 0.5) * (1.15 - abs(t))
        puffs.append((Vector((t * length, random.uniform(-0.2, 0.2) * width, r * 0.55 + random.uniform(0.0, 0.25) * width)), Vector((r, r * 0.9, r * 0.85))))
    for centre, size in puffs:
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=1)
        for v in tmp.verts:
            jitter = 1 + random.uniform(-0.12, 0.12)
            v.co = Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z)) * jitter + centre
            v.co.z = max(v.co.z, 0.0)  # a flat underside, like real cumulus
        index = {v: bm.verts.new(v.co) for v in tmp.verts}
        for f in tmp.faces:
            bm.faces.new([index[v] for v in f.verts])
        tmp.free()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    top = max(v.co.z for v in me.vertices) or 1
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for p in me.polygons:
        p.use_smooth = False
        h = sum(me.vertices[i].co.z for i in p.vertices) / len(p.vertices) / top
        facing_down = p.normal.z < -0.5
        k = 0.0 if facing_down else min(1, 0.25 + h * 1.1)
        c = [UNDER[j] + (TOP[j] - UNDER[j]) * k for j in range(3)]
        c = srgb_to_linear([min(1, x * random.uniform(0.97, 1.02)) for x in c])
        for li in p.loop_indices:
            col.data[li].color = (*c, 1)
    m = bpy.data.materials.get('cloud') or bpy.data.materials.new('cloud')
    m.use_nodes = True
    nt = m.node_tree
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = (0, 0, 0)
    return o


objects = [cloud(f'cloud-{i + 1}', *spec) for i, spec in enumerate(SPECS)]
export(objects, 'clouds.glb')
print('@@ done')
